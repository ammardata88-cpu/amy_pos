"""Generic, permission-checked data API behind the AMY console.

The console never talks to ERPNext screens. It reads and writes documents
through these endpoints, so the ERPNext engine (accounting, stock, taxes)
stays in the back and AMY owns the whole interface.

Every call runs as the logged in user, so ERPNext roles and permissions
still decide what each person can see and do.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

# Only these doctypes can be reached through the generic endpoints.
ALLOWED = {
    "Sales Invoice", "Purchase Invoice", "Payment Entry", "Journal Entry",
    "Customer", "Supplier", "Item", "Item Group", "Brand", "UOM", "Price List",
    "Warehouse", "Stock Entry", "Stock Reconciliation", "Bin",
    "Customer Group", "Supplier Group", "Territory",
    "Company", "Mode of Payment", "Account", "Cost Center", "Currency",
    "Sales Taxes and Charges Template", "Purchase Taxes and Charges Template",
    "Pricing Rule", "POS Profile", "POS Opening Shift", "POS Closing Shift",
    "Sales Invoice Additional Fields",
}

INVOICES = ("Sales Invoice", "Purchase Invoice")
PARTY = {
    "Customer": ("customer_name", "customer_primary_contact", "customer_primary_address"),
    "Supplier": ("supplier_name", "supplier_primary_contact", "supplier_primary_address"),
}
SAFE_FIELD = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SAFE_ORDER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*( (asc|desc))?$")

# AMY role -> ERPNext roles. Roles that do not exist on the site are skipped.
ROLE_SETS = {
    "admin": ["System Manager", "Accounts Manager", "Sales Manager", "Purchase Manager",
              "Stock Manager", "Item Manager", "Sales Master Manager", "Purchase Master Manager"],
    "manager": ["Accounts User", "Sales Manager", "Purchase Manager", "Stock Manager", "Item Manager"],
    "cashier": ["Sales User", "POS User", "POSNext Cashier", "Stock User"],
    "sales": ["Sales User", "Sales Manager", "Stock User"],
    "purchasing": ["Purchase User", "Purchase Manager", "Stock User"],
    "warehouse": ["Stock User", "Stock Manager", "Item Manager"],
    "accountant": ["Accounts User", "Accounts Manager"],
}
ITEM_KEYS = (
    "item_name", "description", "uom", "stock_uom", "conversion_factor", "price_list_rate",
    "rate", "discount_percentage", "warehouse", "income_account", "expense_account",
    "cost_center", "item_tax_template", "actual_qty",
)


# ---------------------------------------------------------------- helpers
def _json(v, default=None):
    if v is None or v == "":
        return default
    if isinstance(v, str):
        return json.loads(v)
    return v


def _check(doctype):
    if doctype not in ALLOWED:
        frappe.throw(_("Not permitted"), frappe.PermissionError)


def _company(doc=None):
    c = doc and doc.get("company")
    return c or frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
        "Global Defaults", "default_company"
    )


def _flags(doc):
    perms = {}
    for p in ("read", "write", "create", "submit", "cancel", "delete"):
        try:
            perms[p] = bool(frappe.has_permission(doc.doctype, p, doc=doc))
        except Exception:
            perms[p] = False
    return perms


# ---------------------------------------------------------------- bootstrap
@frappe.whitelist()
def bootstrap():
    """Everything the console needs once, at start-up."""
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    user = frappe.get_cached_doc("User", frappe.session.user)
    roles = set(frappe.get_roles())
    company = _company()
    perms = {}
    for dt in ALLOWED:
        if not frappe.db.exists("DocType", dt):
            continue
        perms[dt] = {
            "read": bool(frappe.has_permission(dt, "read")),
            "create": bool(frappe.has_permission(dt, "create")),
        }
    apps = set(frappe.get_installed_apps())
    return {
        "user": {
            "name": user.name, "full_name": user.full_name, "image": user.user_image,
            "language": user.language,
        },
        "is_admin": "System Manager" in roles,
        "company": company,
        "currency": frappe.get_cached_value("Company", company, "default_currency") if company else None,
        "logo": frappe.get_cached_value("Company", company, "company_logo") if company else None,
        "perms": perms,
        "apps": {"pos_next": "pos_next" in apps, "zatca": "ksa_compliance" in apps},
    }


# ---------------------------------------------------------------- list / get
@frappe.whitelist()
def list_docs(doctype, fields=None, filters=None, search=None, search_fields=None,
              order_by="modified desc", start=0, limit=20):
    _check(doctype)
    fields = _json(fields, ["name"])
    for f in fields:
        if not SAFE_FIELD.match(f):
            frappe.throw(_("Invalid field"))
    if not SAFE_ORDER.match(order_by or "modified desc"):
        frappe.throw(_("Invalid order"))
    filters = _json(filters, {}) or {}
    or_filters = None
    sf = _json(search_fields, [])
    if search and sf:
        for f in sf:
            if not SAFE_FIELD.match(f):
                frappe.throw(_("Invalid field"))
        or_filters = [[f, "like", "%" + search.strip() + "%"] for f in sf]
    kw = dict(filters=filters, or_filters=or_filters)
    rows = frappe.get_list(
        doctype, fields=fields, order_by=order_by,
        limit_start=cint(start), limit_page_length=min(cint(limit) or 20, 500), **kw,
    )
    total = frappe.get_list(doctype, fields=["count(name) as c"], **kw)
    return {"rows": rows, "total": cint(total[0].c) if total else 0}


@frappe.whitelist()
def get_doc(doctype, name):
    _check(doctype)
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    d = doc.as_dict()
    if doctype in PARTY:
        _party_extras(doc, d)
    return {"doc": d, "can": _flags(doc)}


# ---------------------------------------------------------------- defaults
@frappe.whitelist()
def new_defaults(doctype):
    """Starting values for a blank document."""
    _check(doctype)
    meta = frappe.get_meta(doctype)
    company = _company()
    d = {"doctype": doctype}
    if meta.has_field("company"):
        d["company"] = company
    cur = frappe.get_cached_value("Company", company, "default_currency") if company else None
    if meta.has_field("currency") and cur:
        d["currency"] = cur
    if meta.has_field("posting_date"):
        d["posting_date"] = nowdate()
    if meta.has_field("naming_series"):
        f = meta.get_field("naming_series")
        opts = [o for o in (f.options or "").split("\n") if o]
        d["naming_series"] = f.default or (opts[0] if opts else None)
    gs = frappe.db.get_single_value
    if doctype == "Customer":
        d["customer_type"] = "Company"
        d["customer_group"] = gs("Selling Settings", "customer_group")
        d["territory"] = gs("Selling Settings", "territory")
    if doctype == "Supplier":
        d["supplier_type"] = "Company"
        d["supplier_group"] = gs("Buying Settings", "supplier_group")
    if doctype == "Item":
        d["is_stock_item"] = 1
        d["stock_uom"] = gs("Stock Settings", "stock_uom") or "Nos"
        d["item_group"] = gs("Stock Settings", "item_group")
    if doctype == "Item Group":
        d["parent_item_group"] = "All Item Groups"
    if doctype in ("Customer Group", "Supplier Group", "Territory"):
        d["parent_" + frappe.scrub(doctype)] = "All " + doctype + "s"
    if doctype == "Payment Entry":
        d["payment_type"] = "Receive"
        d["party_type"] = "Customer"
    if doctype == "Stock Entry":
        d["stock_entry_type"] = "Material Receipt"
    if doctype == "Stock Reconciliation":
        d["purpose"] = "Stock Reconciliation"
    if doctype == "Journal Entry":
        d["voucher_type"] = "Journal Entry"
    if doctype == "Sales Invoice":
        d["selling_price_list"] = frappe.db.get_single_value("Selling Settings", "selling_price_list") or \
            frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}, "name")
        d["update_stock"] = 1
        d["taxes_and_charges"] = frappe.db.get_value(
            "Sales Taxes and Charges Template", {"is_default": 1, "company": company}, "name")
    if doctype == "Purchase Invoice":
        d["buying_price_list"] = frappe.db.get_single_value("Buying Settings", "buying_price_list") or \
            frappe.db.get_value("Price List", {"buying": 1, "enabled": 1}, "name")
        d["update_stock"] = 1
        d["taxes_and_charges"] = frappe.db.get_value(
            "Purchase Taxes and Charges Template", {"is_default": 1, "company": company}, "name")
    return d


@frappe.whitelist()
def item_details(item_code, doctype, party=None, qty=1, warehouse=None, price_list=None, currency=None):
    """Price, UOM, accounts and stock for one item row."""
    return _item_details(item_code, doctype, party, qty, warehouse, price_list, currency)


def _item_details(item_code, doctype, party=None, qty=1, warehouse=None, price_list=None, currency=None):
    company = _company()
    sales = doctype in ("Sales Invoice", "Sales Order", "Quotation", "Delivery Note")
    currency = currency or frappe.get_cached_value("Company", company, "default_currency")
    args = {
        "item_code": item_code, "company": company, "doctype": doctype, "currency": currency,
        "price_list": price_list, "price_list_currency": currency, "plc_conversion_rate": 1,
        "conversion_rate": 1, "qty": flt(qty) or 1, "transaction_date": nowdate(),
        "warehouse": warehouse, "set_warehouse": warehouse, "ignore_pricing_rule": 0,
        "customer" if sales else "supplier": party,
        "selling_price_list" if sales else "buying_price_list": price_list,
        "update_stock": 1,
    }
    try:
        from erpnext.stock.get_item_details import get_item_details
        det = get_item_details(args)
        out = {k: det.get(k) for k in ITEM_KEYS if det.get(k) not in (None, "")}
        out["qty"] = flt(qty) or 1
        # ERPNext's browser form turns the list price into the rate; do it here.
        rate = flt(det.get("rate"))
        if not rate:
            rate = flt(det.get("price_list_rate")) * (1 - flt(det.get("discount_percentage")) / 100)
        if not rate:
            item = frappe.get_cached_doc("Item", item_code)
            rate = flt(item.standard_rate) if sales else flt(item.last_purchase_rate or item.valuation_rate)
        out["rate"] = rate
        return out
    except Exception:
        frappe.clear_last_message()
        item = frappe.get_cached_doc("Item", item_code)
        return {"item_name": item.item_name, "uom": item.stock_uom, "stock_uom": item.stock_uom,
                "conversion_factor": 1, "rate": flt(item.standard_rate), "qty": flt(qty) or 1}


@frappe.whitelist()
def tax_rows(doctype, template):
    """Tax rows of a tax template, ready to drop into an invoice."""
    master = "Sales Taxes and Charges Template" if doctype == "Sales Invoice" \
        else "Purchase Taxes and Charges Template"
    if not template:
        return []
    from erpnext.controllers.accounts_controller import get_taxes_and_charges
    return get_taxes_and_charges(master, template)


# ---------------------------------------------------------------- save / actions
def _prepare(doc, extras=None):
    """Fill what ERPNext forms normally fill in the browser."""
    extras = extras or {}
    dt = doc.doctype
    company = _company(doc)
    if doc.meta.has_field("company"):
        doc.company = company

    if dt in INVOICES:
        sales = dt == "Sales Invoice"
        party_f = "customer" if sales else "supplier"
        if not doc.get(party_f):
            frappe.throw(_("Customer is required") if sales else _("Supplier is required"))
        if not doc.get("posting_date"):
            doc.posting_date = nowdate()
        if not doc.get("currency"):
            doc.currency = frappe.get_cached_value("Company", company, "default_currency")
        acc_f = "debit_to" if sales else "credit_to"
        if not doc.get(acc_f):
            from erpnext.accounts.party import get_party_account
            doc.set(acc_f, get_party_account("Customer" if sales else "Supplier", doc.get(party_f), company))
        plist = doc.get("selling_price_list" if sales else "buying_price_list")
        rows = [r for r in doc.get("items") if r.get("item_code")]
        if not rows:
            frappe.throw(_("Add at least one item"))
        doc.set("items", rows)
        for row in doc.get("items"):
            det = _item_details(row.item_code, dt, doc.get(party_f), row.get("qty") or 1,
                                row.get("warehouse") or doc.get("set_warehouse"), plist, doc.currency)
            for k, v in det.items():
                if not row.meta.has_field(k):
                    continue
                if k in ("qty", "conversion_factor"):
                    if not flt(row.get(k)):
                        row.set(k, v)
                elif row.get(k) in (None, ""):
                    row.set(k, v)
        tmpl = doc.get("taxes_and_charges")
        if tmpl and not doc.get("taxes"):
            for r in tax_rows(dt, tmpl):
                doc.append("taxes", r)

    elif dt == "Payment Entry":
        from erpnext.accounts.party import get_party_account
        pt, party = doc.get("party_type"), doc.get("party")
        if pt and party:
            acc = get_party_account(pt, party, company)
            if doc.payment_type == "Receive" and not doc.get("paid_from"):
                doc.paid_from = acc
            if doc.payment_type == "Pay" and not doc.get("paid_to"):
                doc.paid_to = acc
        if flt(doc.get("paid_amount")) and not flt(doc.get("received_amount")):
            doc.received_amount = doc.paid_amount
        mop = doc.get("mode_of_payment")
        if mop:
            from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account
            acc = (get_bank_cash_account(mop, company) or {}).get("account")
            if acc:
                doc.set("paid_to" if doc.payment_type == "Receive" else "paid_from", acc)

    elif dt == "Stock Entry":
        typ = doc.get("stock_entry_type")
        for r in doc.get("items"):
            if typ == "Material Receipt":
                r.s_warehouse = None
            if typ == "Material Issue":
                r.t_warehouse = None
            if typ in ("Material Issue", "Material Transfer") and not r.get("s_warehouse"):
                r.s_warehouse = doc.get("from_warehouse")
            if typ in ("Material Receipt", "Material Transfer") and not r.get("t_warehouse"):
                r.t_warehouse = doc.get("to_warehouse")

    elif dt == "Item" and extras.get("_warehouse") and not doc.get("item_defaults"):
        doc.append("item_defaults", {"company": company, "default_warehouse": extras["_warehouse"]})

    elif dt == "Stock Reconciliation":
        if doc.meta.has_field("expense_account") and not doc.get("expense_account"):
            doc.expense_account = frappe.get_cached_value("Company", company, "stock_adjustment_account")
        if doc.meta.has_field("cost_center") and not doc.get("cost_center"):
            doc.cost_center = frappe.get_cached_value("Company", company, "cost_center")


@frappe.whitelist()
def preview(doctype, data):
    """Totals and taxes of an unsaved invoice, calculated by ERPNext."""
    if doctype not in INVOICES:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    d = _json(data, {})
    d["doctype"] = doctype
    d["items"] = [r for r in d.get("items", []) if r.get("item_code")]
    doc = frappe.get_doc(d)
    doc.company = _company(doc)
    doc.currency = doc.get("currency") or frappe.get_cached_value("Company", doc.company, "default_currency")
    for f in ("conversion_rate", "plc_conversion_rate"):
        if doc.meta.has_field(f) and not flt(doc.get(f)):
            doc.set(f, 1)
    for r in doc.get("items"):
        if not flt(r.get("conversion_factor")):
            r.conversion_factor = 1
    tmpl = doc.get("taxes_and_charges")
    if tmpl and not doc.get("taxes"):
        for r in tax_rows(doctype, tmpl):
            doc.append("taxes", r)
    try:
        doc.calculate_taxes_and_totals()
    except Exception:
        frappe.clear_last_message()
        return None
    return {
        "total": flt(doc.get("total")), "net_total": flt(doc.get("net_total")),
        "discount": flt(doc.get("discount_amount")),
        "taxes_total": flt(doc.get("total_taxes_and_charges")),
        "grand_total": flt(doc.get("grand_total")),
        "rounded_total": flt(doc.get("rounded_total")),
        "taxes": [{"description": t.get("description"), "rate": flt(t.get("rate")),
                   "amount": flt(t.get("tax_amount"))} for t in doc.get("taxes") or []],
        "rows": [flt(r.get("amount")) for r in doc.get("items")],
    }


@frappe.whitelist()
def save_doc(doctype, data, submit=0):
    _check(doctype)
    d = _json(data, {})
    d["doctype"] = doctype
    extras = {k: d.pop(k) for k in list(d) if k.startswith("_")}
    name = d.get("name")
    if name and frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        if doc.docstatus != 0:
            frappe.throw(_("Submitted documents cannot be edited. Cancel it first."))
        d.pop("docstatus", None)
        doc.update(d)
    else:
        d.pop("name", None)
        d["docstatus"] = 0
        doc = frappe.get_doc(d)
    _prepare(doc, extras)
    doc.save()
    _save_extras(doc, extras)
    if cint(submit) and doc.meta.is_submittable and doc.docstatus == 0:
        doc.submit()
    return get_doc(doctype, doc.name)


def _party_extras(doc, d):
    _, _, addr_f = PARTY[doc.doctype]
    d["_mobile"], d["_email"] = d.get("mobile_no"), d.get("email_id")
    addr = doc.get(addr_f)
    if addr and frappe.db.exists("Address", addr):
        a = frappe.db.get_value("Address", addr, ["address_line1", "city", "country"], as_dict=True)
        d["_address_line1"], d["_city"], d["_country"] = a.address_line1, a.city, a.country


def _save_extras(doc, x):
    if doc.doctype in PARTY:
        _save_party_extras(doc, x)
    elif doc.doctype == "Item":
        _upsert_item_price(doc.name, doc.get("standard_rate"))


def _save_party_extras(doc, x):
    name_f, contact_f, addr_f = PARTY[doc.doctype]
    updates = {}
    mobile, email = (x.get("_mobile") or "").strip(), (x.get("_email") or "").strip()
    if "_mobile" in x or "_email" in x:
        cname = doc.get(contact_f)
        if cname and frappe.db.exists("Contact", cname):
            c = frappe.get_doc("Contact", cname)
        elif mobile or email:
            c = frappe.new_doc("Contact")
            c.first_name = doc.get(name_f)
            c.append("links", {"link_doctype": doc.doctype, "link_name": doc.name})
        else:
            c = None
        if c:
            c.set("phone_nos", [{"phone": mobile, "is_primary_mobile_no": 1}] if mobile else [])
            c.set("email_ids", [{"email_id": email, "is_primary": 1}] if email else [])
            c.save()
            updates.update({contact_f: c.name, "mobile_no": mobile, "email_id": email})
    line1 = (x.get("_address_line1") or "").strip()
    if line1:
        aname = doc.get(addr_f)
        if aname and frappe.db.exists("Address", aname):
            a = frappe.get_doc("Address", aname)
        else:
            a = frappe.new_doc("Address")
            a.address_title = doc.get(name_f)
            a.address_type = "Billing"
            a.append("links", {"link_doctype": doc.doctype, "link_name": doc.name})
        a.address_line1 = line1
        a.city = (x.get("_city") or "").strip() or a.city or "-"
        a.country = x.get("_country") or a.country
        a.save()
        updates[addr_f] = a.name
    if updates:
        frappe.db.set_value(doc.doctype, doc.name, updates)


def _selling_list():
    return frappe.db.get_single_value("Selling Settings", "selling_price_list") or \
        frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}, "name")


def _upsert_item_price(item, rate):
    pl = _selling_list()
    if not pl or rate is None:
        return
    ip = frappe.db.get_value("Item Price", {"item_code": item, "price_list": pl, "selling": 1}, "name")
    if ip:
        frappe.db.set_value("Item Price", ip, "price_list_rate", flt(rate))
    elif flt(rate):
        frappe.get_doc({"doctype": "Item Price", "item_code": item, "price_list": pl,
                        "price_list_rate": flt(rate), "selling": 1}).insert(ignore_permissions=True)


@frappe.whitelist()
def submit_doc(doctype, name):
    _check(doctype)
    doc = frappe.get_doc(doctype, name)
    doc.submit()
    return get_doc(doctype, name)


@frappe.whitelist()
def cancel_doc(doctype, name):
    _check(doctype)
    doc = frappe.get_doc(doctype, name)
    doc.cancel()
    return get_doc(doctype, name)


@frappe.whitelist()
def delete_doc(doctype, name):
    _check(doctype)
    frappe.delete_doc(doctype, name)
    return {"ok": 1}


@frappe.whitelist()
def make_return(doctype, name):
    """Credit note / return, as an unsaved draft."""
    if doctype not in INVOICES:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    from erpnext.controllers.sales_and_purchase_return import make_return_doc
    src = frappe.get_doc(doctype, name)
    src.check_permission("read")
    return make_return_doc(doctype, name).as_dict()


@frappe.whitelist()
def make_payment(doctype, name):
    """Payment against an invoice, as an unsaved draft."""
    if doctype not in INVOICES:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
    src = frappe.get_doc(doctype, name)
    src.check_permission("read")
    return get_payment_entry(doctype, name).as_dict()


# ---------------------------------------------------------------- users
def _role_set(key):
    return [r for r in ROLE_SETS.get(key, []) if frappe.db.exists("Role", r)]


def _infer_role(roles):
    roles = set(roles)
    if "System Manager" in roles:
        return "admin"
    best, score = "custom", 0
    for key in ("manager", "accountant", "warehouse", "purchasing", "sales", "cashier"):
        need = set(_role_set(key))
        if need and need <= roles and len(need) > score:
            best, score = key, len(need)
    return best


@frappe.whitelist()
def list_users():
    frappe.only_for("System Manager")
    users = frappe.get_all(
        "User",
        filters={"user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]},
        fields=["name", "full_name", "first_name", "last_name", "enabled", "mobile_no", "language",
                "last_login", "creation"],
        order_by="creation asc", limit_page_length=500,
    )
    for u in users:
        roles = [r.role for r in frappe.get_all("Has Role", filters={"parent": u.name, "parenttype": "User"},
                                                   fields=["role"])]
        u["amy_role"] = _infer_role(roles)
    return users


@frappe.whitelist()
def save_user(data):
    frappe.only_for("System Manager")
    d = _json(data, {})
    email = (d.get("email") or "").strip().lower()
    if not email:
        frappe.throw(_("Email is required"))
    key = d.get("amy_role") or "sales"
    roles = _role_set(key) if key in ROLE_SETS else None
    managed = {r for k in ROLE_SETS for r in _role_set(k)}

    if frappe.db.exists("User", email):
        doc = frappe.get_doc("User", email)
        if email in ("Administrator", "Guest"):
            frappe.throw(_("Not permitted"), frappe.PermissionError)
        if email == frappe.session.user and not cint(d.get("enabled", 1)):
            frappe.throw(_("You cannot disable your own account"))
    else:
        doc = frappe.new_doc("User")
        doc.email = email
        doc.send_welcome_email = 0
        doc.user_type = "System User"
        if not d.get("password"):
            frappe.throw(_("Password is required"))
    for f in ("first_name", "last_name", "mobile_no", "language"):
        if f in d:
            doc.set(f, d.get(f) or None)
    if not doc.first_name:
        doc.first_name = email.split("@")[0]
    doc.enabled = cint(d.get("enabled", 1))
    if d.get("password"):
        doc.new_password = d["password"]
    if roles is not None:
        keep = [r for r in doc.get("roles") if r.role not in managed]
        doc.set("roles", keep)
        have = {r.role for r in keep}
        for r in roles:
            if r not in have:
                doc.append("roles", {"role": r})
    doc.save()
    return {"name": doc.name}
