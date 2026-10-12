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
    "Sales Invoice Additional Fields", "Quotation", "Sales Order", "Purchase Order",
    "Batch", "Product Bundle", "Payment Terms Template", "Item Tax Template",
}

INVOICES = ("Sales Invoice", "Purchase Invoice")
ORDERS = ("Quotation", "Sales Order", "Purchase Order")
TXN = INVOICES + ORDERS
SALES_DOCS = ("Sales Invoice", "Sales Order", "Quotation")
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


STD_FIELDS = {"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "lft", "rgt"}
# Never accepted from the browser: they belong to the framework.
PROTECTED = {"owner", "creation", "modified", "modified_by", "parent", "parenttype", "parentfield",
             "_user_tags", "_comments", "_assign", "_liked_by", "__islocal", "__unsaved", "__run_link_triggers"}


def _field_ok(meta, f, levels):
    """A plain column the caller may read (exists, and its permission level is open to the user)."""
    if f in STD_FIELDS:
        return True
    df = meta.get_field(f)
    return bool(df) and df.fieldtype not in frappe.model.table_fields and cint(df.permlevel) in levels


def _read_levels(meta):
    try:
        return set(meta.get_permlevel_access("read")) or {0}
    except Exception:
        return {0}


def _clean(d):
    """Drop framework-owned keys from a document dict, rows included."""
    if isinstance(d, dict):
        return {k: _clean(v) for k, v in d.items() if k not in PROTECTED}
    if isinstance(d, list):
        return [_clean(x) for x in d]
    return d


def _need(doctype, ptype="create"):
    if not frappe.has_permission(doctype, ptype):
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
        "industry": frappe.db.get_default("amy_industry") or "retail",
    }


# ---------------------------------------------------------------- list / get
@frappe.whitelist()
def list_docs(doctype, fields=None, filters=None, search=None, search_fields=None,
              order_by="modified desc", start=0, limit=20):
    _check(doctype)
    meta = frappe.get_meta(doctype)
    levels = _read_levels(meta)
    fields = _json(fields, ["name"])
    for f in fields:
        if not SAFE_FIELD.match(f) or not _field_ok(meta, f, levels):
            frappe.throw(_("Invalid field"))
    order_by = order_by or "modified desc"
    if not SAFE_ORDER.match(order_by) or not _field_ok(meta, order_by.split(" ")[0], levels):
        frappe.throw(_("Invalid order"))
    filters = _json(filters, {}) or {}
    if not isinstance(filters, dict):
        frappe.throw(_("Invalid filters"))
    for f in filters:
        if not SAFE_FIELD.match(f) or not _field_ok(meta, f, levels):
            frappe.throw(_("Invalid filters"))
    or_filters = None
    sf = _json(search_fields, [])
    if search and sf:
        for f in sf:
            if not SAFE_FIELD.match(f) or not _field_ok(meta, f, levels):
                frappe.throw(_("Invalid field"))
        or_filters = [[f, "like", "%" + search.strip()[:100] + "%"] for f in sf]
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
    doc.apply_fieldlevel_read_permissions()
    d = doc.as_dict()
    if doctype in PARTY:
        _party_extras(doc, d)
    return {"doc": d, "can": _flags(doc)}


# ---------------------------------------------------------------- defaults
@frappe.whitelist()
def new_defaults(doctype):
    """Starting values for a blank document."""
    _check(doctype)
    _need(doctype, "create")
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
    if meta.has_field("transaction_date"):
        d["transaction_date"] = nowdate()
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
    if doctype in ("Sales Order", "Quotation", "Purchase Order"):
        sales = doctype in SALES_DOCS
        d["selling_price_list" if sales else "buying_price_list"] = \
            gs("Selling Settings" if sales else "Buying Settings", "selling_price_list" if sales else "buying_price_list") or \
            frappe.db.get_value("Price List", {"selling" if sales else "buying": 1, "enabled": 1}, "name")
        d["taxes_and_charges"] = frappe.db.get_value(
            "Sales Taxes and Charges Template" if sales else "Purchase Taxes and Charges Template",
            {"is_default": 1, "company": company}, "name")
        if doctype == "Quotation":
            d["quotation_to"] = "Customer"
            d["valid_till"] = frappe.utils.add_days(nowdate(), 15)
        elif sales:
            d["delivery_date"] = frappe.utils.add_days(nowdate(), 7)
        else:
            d["schedule_date"] = frappe.utils.add_days(nowdate(), 7)
    if doctype == "POS Profile":
        c = frappe.get_cached_doc("Company", company) if company else None
        if c:
            d["write_off_account"] = c.get("write_off_account")
            d["write_off_cost_center"] = c.get("cost_center")
            d["cost_center"] = c.get("cost_center")
            d["income_account"] = c.get("default_income_account")
            d["expense_account"] = c.get("default_expense_account")
        d["selling_price_list"] = frappe.db.get_single_value("Selling Settings", "selling_price_list")
        d["write_off_limit"] = 1
        d["payments"] = [{"mode_of_payment": m, "default": 1 if i == 0 else 0}
                         for i, m in enumerate(frappe.get_all("Mode of Payment", filters={"enabled": 1},
                                                              pluck="name", limit=1))]
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
def item_details(item_code, doctype, party=None, qty=1, warehouse=None, price_list=None, currency=None, uom=None):
    if doctype not in TXN:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    _need("Item", "read")
    frappe.get_doc("Item", item_code).check_permission("read")
    """Price, UOM, accounts and stock for one item row."""
    return _item_details(item_code, doctype, party, qty, warehouse, price_list, currency, uom)


def _item_details(item_code, doctype, party=None, qty=1, warehouse=None, price_list=None, currency=None, uom=None):
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
    if uom:
        args["uom"] = uom
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
        out.update(_batch_hint(item_code, sales, out.get("warehouse") or warehouse, flt(qty) or 1))
        return out
    except Exception:
        frappe.clear_last_message()
        item = frappe.get_cached_doc("Item", item_code)
        return {"item_name": item.item_name, "uom": item.stock_uom, "stock_uom": item.stock_uom,
                "conversion_factor": 1, "rate": flt(item.standard_rate), "qty": flt(qty) or 1}


def _batch_hint(item_code, sales, warehouse, qty):
    """For batch items: the batch to sell first (earliest expiry), or just the flag when buying."""
    try:
        item = frappe.get_cached_doc("Item", item_code)
        if not cint(item.has_batch_no):
            return {}
        out = {"has_batch_no": 1, "has_expiry_date": cint(item.has_expiry_date)}
        if sales and warehouse:
            from erpnext.stock.doctype.batch.batch import get_batch_no

            b = get_batch_no(item_code, warehouse, qty)
            if b:
                out["batch_no"] = b
                out["batch_expiry"] = str(frappe.db.get_value("Batch", b, "expiry_date") or "")
        return out
    except Exception:
        frappe.clear_last_message()
        return {}


@frappe.whitelist()
def tax_rows(doctype, template):
    """Tax rows of a tax template, ready to drop into an invoice."""
    if doctype not in TXN:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    master = "Sales Taxes and Charges Template" if doctype in SALES_DOCS \
        else "Purchase Taxes and Charges Template"
    if template:
        frappe.get_doc(master, template).check_permission("read")
    return _tax_rows(doctype, template)


def _tax_rows(doctype, template):
    master = "Sales Taxes and Charges Template" if doctype in SALES_DOCS \
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

    if dt in TXN:
        sales = dt in SALES_DOCS
        party_f = "party_name" if dt == "Quotation" else ("customer" if sales else "supplier")
        if dt == "Quotation":
            doc.quotation_to = "Customer"
        if not doc.get(party_f):
            frappe.throw(_("Customer is required") if sales else _("Supplier is required"))
        date_f = "posting_date" if dt in INVOICES else "transaction_date"
        if not doc.get(date_f):
            doc.set(date_f, nowdate())
        if not doc.get("currency"):
            doc.currency = frappe.get_cached_value("Company", company, "default_currency")
        if dt in INVOICES:
            acc_f = "debit_to" if sales else "credit_to"
            if not doc.get(acc_f):
                from erpnext.accounts.party import get_party_account
                doc.set(acc_f, get_party_account("Customer" if sales else "Supplier", doc.get(party_f), company))
        if dt == "Sales Order" and not doc.get("delivery_date"):
            doc.delivery_date = frappe.utils.add_days(doc.transaction_date, 7)
        if dt == "Purchase Order" and not doc.get("schedule_date"):
            doc.schedule_date = frappe.utils.add_days(doc.transaction_date, 7)
        plist = doc.get("selling_price_list" if sales else "buying_price_list")
        rows = [r for r in doc.get("items") if r.get("item_code")]
        if not rows:
            frappe.throw(_("Add at least one item"))
        doc.set("items", rows)
        for row in doc.get("items"):
            det = _item_details(row.item_code, dt, doc.get(party_f), row.get("qty") or 1,
                                row.get("warehouse") or doc.get("set_warehouse"), plist, doc.currency, row.get("uom"))
            for k, v in det.items():
                if not row.meta.has_field(k):
                    continue
                if k in ("qty", "conversion_factor"):
                    if not flt(row.get(k)):
                        row.set(k, v)
                elif row.get(k) in (None, ""):
                    row.set(k, v)
            if row.get("batch_no") and row.meta.has_field("use_serial_batch_fields"):
                row.use_serial_batch_fields = 1
            if dt == "Sales Order" and not row.get("delivery_date"):
                row.delivery_date = doc.delivery_date
            if dt == "Purchase Order" and not row.get("schedule_date"):
                row.schedule_date = doc.schedule_date
        tmpl = doc.get("taxes_and_charges")
        if tmpl and not doc.get("taxes"):
            for r in _tax_rows(dt, tmpl):
                doc.append("taxes", r)

    elif dt == "POS Profile":
        c = frappe.get_cached_doc("Company", company)
        if not doc.get("currency"):
            doc.currency = c.default_currency
        if not doc.get("write_off_account"):
            doc.write_off_account = c.write_off_account
        if not doc.get("write_off_cost_center"):
            doc.write_off_cost_center = c.cost_center
        if not doc.get("payments"):
            frappe.throw(_("Add at least one payment method"))
        if not any(cint(r.get("default")) for r in doc.get("payments")):
            doc.payments[0].default = 1

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
    if doctype not in TXN:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    _need(doctype, "create")
    d = _clean(_json(data, {}))
    d["doctype"] = doctype
    d["items"] = [r for r in d.get("items", []) if r.get("item_code")][:300]
    d["docstatus"] = 0
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
        for r in _tax_rows(doctype, tmpl):
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
    if not isinstance(d, dict):
        frappe.throw(_("Invalid data"))
    extras = {k: d.pop(k) for k in list(d) if k.startswith("_") and k not in PROTECTED}
    d = _clean(d)
    d["doctype"] = doctype
    name = d.get("name")
    if name and frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        if doc.docstatus != 0:
            frappe.throw(_("Submitted documents cannot be edited. Cancel it first."))
        d.pop("docstatus", None)
        d.pop("doctype", None)
        doc.update(d)
    else:
        newname = d.pop("name", None)
        d["docstatus"] = 0
        doc = frappe.get_doc(d)
        if newname and frappe.get_meta(doctype).autoname in ("Prompt", "prompt"):
            setattr(doc, "__newname", newname)
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
    if not pl or rate is None or not frappe.has_permission("Item Price", "write"):
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
    _need(doctype, "create")
    return make_return_doc(doctype, name).as_dict()


@frappe.whitelist()
def make_payment(doctype, name):
    """Payment against an invoice, as an unsaved draft."""
    if doctype not in INVOICES:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
    src = frappe.get_doc(doctype, name)
    src.check_permission("read")
    _need("Payment Entry", "create")
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
    if email not in ("administrator",) and not frappe.utils.validate_email_address(email):
        frappe.throw(_("Enter a valid email address"))
    key = d.get("amy_role") or "sales"
    if key not in ROLE_SETS:
        frappe.throw(_("Invalid role"))
    if email == frappe.session.user and key != "admin":
        frappe.throw(_("You cannot remove your own admin access"))
    roles = _role_set(key) if key in ROLE_SETS else None
    managed = {r for k in ROLE_SETS for r in _role_set(k)}

    if frappe.db.exists("User", email):
        doc = frappe.get_doc("User", email)
        if email in ("Administrator", "Guest") or doc.user_type != "System User":
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


CONVERT = {
    ("Quotation", "Sales Order"): "erpnext.selling.doctype.quotation.quotation.make_sales_order",
    ("Quotation", "Sales Invoice"): "erpnext.selling.doctype.quotation.quotation.make_sales_invoice",
    ("Sales Order", "Sales Invoice"): "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
    ("Purchase Order", "Purchase Invoice"): "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice",
}


@frappe.whitelist()
def make_from(doctype, name, target):
    """Turn a quotation / order into the next document, as an unsaved draft."""
    path = CONVERT.get((doctype, target))
    if not path:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    frappe.get_doc(doctype, name).check_permission("read")
    _need(target, "create")
    d = frappe.get_attr(path)(name)
    if target in INVOICES:
        d.update_stock = 1
    return d.as_dict()


# ---------------------------------------------------------------- quick setup
@frappe.whitelist()
def setup_status():
    """What is ready and what is missing for the company to trade."""
    if "System Manager" not in frappe.get_roles():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    from amy_pos.setup import defaults
    return defaults.status()


@frappe.whitelist()
def quick_setup():
    """Create the missing defaults (VAT, payment methods, warehouse, POS profile...)."""
    if "System Manager" not in frappe.get_roles():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    from amy_pos.setup import defaults
    return defaults.apply()


# ---------------------------------------------------------------- how documents connect
def _brief(dt, names, date_f, amount_f, title_f=None, limit=8):
    """Short rows for other documents, filtered by what the user may read."""
    if not names or not frappe.has_permission(dt, "read"):
        return []
    fields = ["name", date_f, amount_f, "docstatus"]
    if title_f:
        fields.append(title_f)
    meta = frappe.get_meta(dt)
    if meta.has_field("status"):
        fields.append("status")
    rows = frappe.get_list(dt, filters={"name": ["in", list(names)], "docstatus": ["<", 2]}, fields=fields,
                           order_by="creation desc", limit_page_length=limit)
    return [{"name": r.name, "date": r.get(date_f), "amount": flt(r.get(amount_f)), "docstatus": r.docstatus,
             "status": r.get("status"), "title": r.get(title_f) if title_f else None} for r in rows]


def _parents(child_dt, parent_dt, field, value):
    return list({r.parent for r in frappe.get_all(child_dt, filters={field: value, "parenttype": parent_dt},
                                                  fields=["parent"], limit_page_length=200)})


@frappe.whitelist()
def related(doctype, name):
    """What a document is tied to: payments, returns, source and follow-up documents, party totals."""
    _check(doctype)
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    groups, summary = [], []

    def add(key, dt, rows):
        if rows:
            groups.append({"key": key, "dt": dt, "rows": rows})

    if doctype in INVOICES:
        sales = doctype == "Sales Invoice"
        refs = frappe.get_all("Payment Entry Reference", filters={"reference_doctype": doctype, "reference_name": name},
                              fields=["parent"], limit_page_length=100)
        add("payments", "Payment Entry", _brief("Payment Entry", {r.parent for r in refs}, "posting_date", "paid_amount"))
        ret = frappe.get_all(doctype, filters={"return_against": name, "docstatus": ["<", 2]}, pluck="name", limit_page_length=50)
        add("returns", doctype, _brief(doctype, ret, "posting_date", "grand_total"))
        if doc.get("return_against"):
            add("original", doctype, _brief(doctype, [doc.return_against], "posting_date", "grand_total"))
        f = "sales_order" if sales else "purchase_order"
        srcs = {r.get(f) for r in doc.get("items") if r.get(f)}
        add("source", "Sales Order" if sales else "Purchase Order",
            _brief("Sales Order" if sales else "Purchase Order", srcs, "transaction_date", "grand_total"))
        if sales and "ksa_compliance" in frappe.get_installed_apps() and frappe.db.exists("DocType", "Sales Invoice Additional Fields") \
                and frappe.has_permission("Sales Invoice Additional Fields", "read"):
            z = frappe.get_list("Sales Invoice Additional Fields", filters={"sales_invoice": name, "is_latest": 1},
                                fields=["name", "integration_status", "creation"], limit_page_length=1)
            if z:
                add("zatca", "Sales Invoice Additional Fields",
                    [{"name": z[0].name, "date": z[0].creation, "amount": None, "status": z[0].integration_status}])

    elif doctype in ("Sales Order", "Purchase Order", "Quotation"):
        if doctype == "Quotation":
            orders = _parents("Sales Order Item", "Sales Order", "prevdoc_docname", name)
            add("orders", "Sales Order", _brief("Sales Order", orders, "transaction_date", "grand_total"))
        else:
            sales = doctype == "Sales Order"
            invs = _parents(("Sales Invoice Item" if sales else "Purchase Invoice Item"),
                            ("Sales Invoice" if sales else "Purchase Invoice"),
                            ("sales_order" if sales else "purchase_order"), name)
            add("invoices", "Sales Invoice" if sales else "Purchase Invoice",
                _brief("Sales Invoice" if sales else "Purchase Invoice", invs, "posting_date", "grand_total"))
        if doctype == "Sales Order":
            qts = {r.prevdoc_docname for r in doc.get("items") if r.get("prevdoc_docname")}
            add("source", "Quotation", _brief("Quotation", qts, "transaction_date", "grand_total"))

    elif doctype in PARTY:
        sales = doctype == "Customer"
        inv_dt, pf = ("Sales Invoice", "customer") if sales else ("Purchase Invoice", "supplier")
        if frappe.has_permission(inv_dt, "read"):
            base = {pf: name, "docstatus": 1}
            tot = frappe.get_list(inv_dt, filters=base, fields=["sum(base_grand_total) as total", "count(name) as n"])
            due = frappe.get_list(inv_dt, filters={**base, "outstanding_amount": [">", 0]},
                                  fields=["sum(outstanding_amount) as due", "count(name) as n"])
            summary = [{"k": "billed", "v": flt(tot[0].total) if tot else 0, "n": cint(tot[0].n) if tot else 0},
                       {"k": "due", "v": flt(due[0].due) if due else 0, "n": cint(due[0].n) if due else 0}]
            if sales:
                lim = frappe.db.get_value("Customer Credit Limit", {"parent": name, "company": _company()}, "credit_limit")
                if flt(lim):
                    summary.append({"k": "limit", "v": flt(lim), "n": 0})
        pays = frappe.get_all("Payment Entry", filters={"party_type": doctype, "party": name, "docstatus": 1},
                              pluck="name", order_by="creation desc", limit_page_length=8)
        add("payments", "Payment Entry", _brief("Payment Entry", pays, "posting_date", "paid_amount"))
        if sales:
            qts = frappe.get_all("Quotation", filters={"party_name": name, "quotation_to": "Customer", "docstatus": ["<", 2]},
                                 pluck="name", order_by="creation desc", limit_page_length=5) if frappe.has_permission("Quotation", "read") else []
            add("quotes", "Quotation", _brief("Quotation", qts, "transaction_date", "grand_total"))
            so = frappe.get_all("Sales Order", filters={"customer": name, "docstatus": ["<", 2]}, pluck="name",
                                order_by="creation desc", limit_page_length=5) if frappe.has_permission("Sales Order", "read") else []
            add("orders", "Sales Order", _brief("Sales Order", so, "transaction_date", "grand_total"))
        else:
            po = frappe.get_all("Purchase Order", filters={"supplier": name, "docstatus": ["<", 2]}, pluck="name",
                                order_by="creation desc", limit_page_length=5) if frappe.has_permission("Purchase Order", "read") else []
            add("orders", "Purchase Order", _brief("Purchase Order", po, "transaction_date", "grand_total"))

    elif doctype == "Item":
        for key, inv, child, pf in (("sold", "Sales Invoice", "Sales Invoice Item", "customer_name"),
                                    ("bought", "Purchase Invoice", "Purchase Invoice Item", "supplier_name")):
            if not frappe.has_permission(inv, "read"):
                continue
            ps = [r.parent for r in frappe.get_all(child, filters={"item_code": name, "parenttype": inv}, fields=["parent"],
                                                   order_by="creation desc", limit_page_length=30)]
            add(key, inv, _brief(inv, ps, "posting_date", "grand_total", pf))

    elif doctype == "Payment Entry":
        pass

    elif doctype == "POS Profile":
        if frappe.has_permission("POS Opening Shift", "read"):
            sh = frappe.get_all("POS Opening Shift", filters={"pos_profile": name}, pluck="name", order_by="creation desc", limit_page_length=8)
            add("shifts", "POS Opening Shift", _brief("POS Opening Shift", sh, "period_start_date", "docstatus"))

    return {"summary": summary, "groups": groups}
