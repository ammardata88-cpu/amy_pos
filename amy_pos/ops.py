"""AMY console back-end for expenses, ZATCA onboarding and printing.

Everything runs as the signed-in user: Frappe's own permission checks apply to
every read and write, and the ZATCA steps are limited to System Manager (the
same rule ksa_compliance uses itself).
"""
import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

TAG = "[AMY-EXP]"
PRINTABLE = ("Sales Invoice", "Purchase Invoice", "Quotation", "Sales Order", "Purchase Order", "Payment Entry")


def asset_version():
    """Changes whenever a console asset changes, so browsers never use stale code."""
    import os

    base, m = frappe.get_app_path("amy_pos", "public"), 0
    for sub in ("css", "js"):
        d = os.path.join(base, sub)
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.startswith("amy"):
                    m = max(m, int(os.path.getmtime(os.path.join(d, f))))
    return m


def _company():
    return frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")


def _data(v):
    if isinstance(v, str):
        v = json.loads(v or "{}")
    if not isinstance(v, dict):
        frappe.throw(_("Invalid data"))
    return v


# ================================================================ expenses
def _purchase_vat(company):
    """(account, rate) of the company's default purchase VAT, or (None, 15)."""
    rows = frappe.get_list(
        "Purchase Taxes and Charges Template", filters={"company": company, "disabled": 0},
        fields=["name"], order_by="is_default desc, creation asc", limit_page_length=1,
    )
    if not rows:
        return None, 15.0
    t = frappe.get_doc("Purchase Taxes and Charges Template", rows[0].name)
    for r in t.taxes:
        if r.account_head and r.charge_type in ("On Net Total", "On Previous Row Total", "On Previous Row Amount"):
            return r.account_head, flt(r.rate) or 15.0
    return None, 15.0


@frappe.whitelist()
def expense_options():
    """Accounts and defaults for the new-expense form."""
    frappe.has_permission("Journal Entry", "create", throw=True)
    company = _company()
    base = {"company": company, "is_group": 0, "disabled": 0}
    spend = frappe.get_list(
        "Account", filters=dict(base, root_type="Expense"),
        fields=["name", "account_name", "account_number", "account_type"],
        order_by="account_number, account_name", limit_page_length=500,
    )
    pay = frappe.get_list(
        "Account", filters=dict(base, account_type=["in", ["Cash", "Bank"]]),
        fields=["name", "account_name", "account_type"], order_by="account_type, account_name", limit_page_length=100,
    )
    centers = frappe.get_list(
        "Cost Center", filters={"company": company, "is_group": 0}, fields=["name"], limit_page_length=100
    ) if frappe.has_permission("Cost Center", "read") else []
    vat_account, rate = _purchase_vat(company)
    return {
        "company": company, "expense_accounts": spend, "pay_accounts": pay,
        "cost_centers": [c.name for c in centers], "vat_rate": rate, "vat_ready": bool(vat_account),
        "default_cost_center": frappe.get_cached_value("Company", company, "cost_center"),
    }


@frappe.whitelist()
def expense_save(data):
    d = _data(data)
    frappe.has_permission("Journal Entry", "create", throw=True)
    company = _company()
    amount = flt(d.get("amount"))
    if amount <= 0:
        frappe.throw(_("Amount must be greater than zero"))
    posting = getdate(d.get("date") or nowdate())
    exp, pay = d.get("expense_account"), d.get("pay_account")
    ea = frappe.db.get_value("Account", exp, ["company", "root_type", "is_group"], as_dict=True) if exp else None
    pa = frappe.db.get_value("Account", pay, ["company", "account_type", "is_group"], as_dict=True) if pay else None
    if not ea or ea.company != company or ea.root_type != "Expense" or ea.is_group:
        frappe.throw(_("Choose a valid expense account"))
    if not pa or pa.company != company or pa.account_type not in ("Cash", "Bank") or pa.is_group:
        frappe.throw(_("Choose the cash or bank account that paid"))

    mode = d.get("vat") or "none"  # none | excl | incl
    net, vat, vat_account = amount, 0.0, None
    if mode in ("excl", "incl"):
        vat_account, rate = _purchase_vat(company)
        if not vat_account:
            frappe.throw(_("No purchase VAT account is set up. Run Quick setup first."))
        if mode == "incl":
            net = round(amount / (1 + rate / 100.0), 2)
            vat = round(amount - net, 2)
        else:
            vat = round(amount * rate / 100.0, 2)
    total = round(net + vat, 2)

    cc = d.get("cost_center") or frappe.get_cached_value("Company", company, "cost_center")
    note = (d.get("notes") or "").strip()[:300]
    ref = (d.get("reference") or "").strip()[:140]
    je = frappe.new_doc("Journal Entry")
    je.update({
        "voucher_type": "Journal Entry", "company": company, "posting_date": posting,
        "user_remark": (TAG + " " + note).strip(), "bill_no": ref, "bill_date": posting if ref else None,
    })
    je.append("accounts", {"account": exp, "debit_in_account_currency": net, "cost_center": cc})
    if vat:
        je.append("accounts", {"account": vat_account, "debit_in_account_currency": vat})
    je.append("accounts", {"account": pay, "credit_in_account_currency": total})
    je.insert()
    je.submit()
    return {"name": je.name, "total": total, "vat": vat}


@frappe.whitelist()
def expense_list(search=None, start=0, limit=20, status=None):
    frappe.has_permission("Journal Entry", "read", throw=True)
    company = _company()
    filters = {"company": company, "user_remark": ["like", TAG + "%"]}
    if status in ("0", "1", "2", 0, 1, 2):
        filters["docstatus"] = cint(status)
    else:
        filters["docstatus"] = ["<", 2]
    or_filters = None
    if search:
        s = "%" + str(search).strip()[:100] + "%"
        or_filters = [["name", "like", s], ["user_remark", "like", s], ["bill_no", "like", s]]
    kw = dict(filters=filters, or_filters=or_filters)
    rows = frappe.get_list(
        "Journal Entry", fields=["name", "posting_date", "total_debit", "user_remark", "bill_no", "docstatus"],
        order_by="posting_date desc, creation desc", limit_start=cint(start),
        limit_page_length=min(cint(limit) or 20, 100), **kw,
    )
    total = frappe.get_list("Journal Entry", fields=["count(name) as c"], **kw)
    month = str(getdate(nowdate()).replace(day=1))
    s = frappe.get_list(
        "Journal Entry", fields=["sum(total_debit) as s"],
        filters={"company": company, "user_remark": ["like", TAG + "%"], "docstatus": 1, "posting_date": [">=", month]},
    )
    names = [r.name for r in rows]
    lines = frappe.get_list(
        "Journal Entry Account", parent_doctype="Journal Entry", filters={"parent": ["in", names]} if names else {"name": ""},
        fields=["parent", "account", "debit", "credit"], order_by="parent, idx", limit_page_length=0,
    ) if names else []
    first = {}
    for ln in lines:
        if flt(ln.debit) and ln.parent not in first:
            first[ln.parent] = ln.account
    paid = {}
    for ln in lines:
        if flt(ln.credit):
            paid[ln.parent] = ln.account
    for r in rows:
        r["note"] = (r.user_remark or "")[len(TAG):].strip()
        r["account"] = first.get(r.name)
        r["paid_from"] = paid.get(r.name)
    return {
        "rows": rows, "total": cint(total[0].c) if total else 0,
        "month_total": flt(s[0].s) if s and s[0].s else 0,
    }


# ================================================================ ZATCA
SETTINGS = "ZATCA Business Settings"
EDITABLE = (
    "seller_name", "vat_registration_number", "company_unit", "company_unit_serial", "company_category",
    "company_address", "fatoora_server", "sync_with_zatca", "type_of_business_transactions",
    "enable_zatca_integration",
)
READ = EDITABLE + ("status", "zatca_cli_path", "currency", "country")


def _admin():
    frappe.only_for("System Manager")
    if "ksa_compliance" not in frappe.get_installed_apps():
        frappe.throw(_("E-invoicing app is not installed on this site"))


def _settings_name(company):
    return frappe.db.get_value(SETTINGS, {"company": company, "status": ["!=", "Revoked"]}, "name")


@frappe.whitelist()
def zatca_status():
    if "ksa_compliance" not in frappe.get_installed_apps():
        return {"installed": False}
    frappe.only_for("System Manager")
    company = _company()
    cdoc = frappe.get_cached_doc("Company", company)
    addrs = [
        r.parent for r in frappe.get_all(
            "Dynamic Link", filters={"link_doctype": "Company", "link_name": company, "parenttype": "Address"},
            fields=["parent"],
        )
    ]
    out = {
        "installed": True, "company": company, "addresses": addrs,
        "suggest": {
            "seller_name": cdoc.company_name, "vat_registration_number": cdoc.tax_id or "",
            "company_unit": cdoc.company_name, "company_unit_serial": "1-AMY|2-15|3-1",
            "company_category": "Retail", "company_address": addrs[0] if addrs else "",
        },
        "settings": None, "steps": [], "counts": {},
    }
    name = _settings_name(company)
    if name:
        doc = frappe.get_doc(SETTINGS, name)
        out["settings"] = dict({k: doc.get(k) for k in READ}, name=doc.name)
        out["steps"] = [
            {"key": "settings", "ok": True},
            {"key": "cli", "ok": bool(doc.zatca_cli_path)},
            {"key": "onboard", "ok": bool(doc.compliance_request_id)},
            {"key": "production", "ok": bool(doc.has_production_csid)},
            {"key": "enabled", "ok": bool(cint(doc.enable_zatca_integration))},
        ]
    else:
        out["steps"] = [{"key": k, "ok": False} for k in ("settings", "cli", "onboard", "production", "enabled")]
    if frappe.db.exists("DocType", "Sales Invoice Additional Fields"):
        rows = frappe.get_all(
            "Sales Invoice Additional Fields", filters={"is_latest": 1, "creation": [">=", frappe.utils.add_days(nowdate(), -30)]},
            fields=["integration_status as s", "count(name) as c"], group_by="integration_status",
        )
        out["counts"] = {(r.s or "Pending"): r.c for r in rows}
    return out


@frappe.whitelist()
def zatca_save(data):
    _admin()
    d = _data(data)
    company = _company()
    clean = {k: d.get(k) for k in EDITABLE if k in d}
    if clean.get("fatoora_server") and clean["fatoora_server"] not in ("Sandbox", "Simulation", "Production"):
        frappe.throw(_("Invalid server"))
    name = _settings_name(company)
    if name:
        doc = frappe.get_doc(SETTINGS, name)
        if cint(clean.get("enable_zatca_integration")) and not doc.compliance_request_id:
            frappe.throw(_("Finish onboarding before enabling e-invoicing"))
        doc.update(clean)
        doc.save()
    else:
        addr = clean.get("company_address")
        doc = frappe.new_doc(SETTINGS)
        doc.update(clean)
        doc.company = company
        doc.currency = frappe.get_cached_value("Company", company, "default_currency")
        doc.country = (frappe.db.get_value("Address", addr, "country") if addr else None) or "Saudi Arabia"
        doc.cli_setup = "Automatic"
        doc.sync_with_zatca = clean.get("sync_with_zatca") or "Live"
        doc.fatoora_server = clean.get("fatoora_server") or "Sandbox"
        doc.insert()
    return zatca_status()


@frappe.whitelist()
def zatca_step(step, otp=None, simplified_customer=None, standard_customer=None, item=None, tax_category=None):
    """Run one onboarding step. The result is the refreshed status."""
    _admin()
    name = _settings_name(_company())
    if not name:
        frappe.throw(_("Save the business details first"))
    doc = frappe.get_doc(SETTINGS, name)
    if step == "cli_setup":
        from ksa_compliance.zatca_cli import setup

        res = setup(doc.override_cli_download_url or "", doc.override_jre_download_url or "")
        if res:
            doc.zatca_cli_path = res.get("cli_path")
            doc.java_home = res.get("jre_path")
            doc.save()
    elif step == "cli_check":
        from ksa_compliance.zatca_cli import check_setup

        check_setup(doc.zatca_cli_path or "", doc.java_home or "")
    elif step == "onboard":
        if not otp or not str(otp).strip().isdigit():
            frappe.throw(_("Enter the one-time code (OTP) from the Fatoora portal"))
        doc.onboard(str(otp).strip())
    elif step == "compliance":
        if not item or not tax_category or not (simplified_customer or standard_customer):
            frappe.throw(_("Choose an item, a tax category and at least one customer"))
        from ksa_compliance.compliance_checks import perform_compliance_checks

        perform_compliance_checks(
            business_settings_id=doc.name, simplified_customer_id=simplified_customer or "",
            standard_customer_id=standard_customer or "", item_id=item, tax_category_id=tax_category,
        )
    elif step == "production":
        if not otp or not str(otp).strip().isdigit():
            frappe.throw(_("Enter the one-time code (OTP) from the Fatoora portal"))
        doc.get_production_csid(str(otp).strip())
    else:
        frappe.throw(_("Unknown step"))
    frappe.db.commit()
    return zatca_status()


# ================================================================ printing
def _qr_png(text):
    if not text:
        return None
    try:
        import pyqrcode

        return "data:image/png;base64," + pyqrcode.create(text, error="M").png_as_base64_str(scale=4, quiet_zone=1)
    except Exception:
        pass
    try:
        import base64
        import io

        import qrcode

        buf = io.BytesIO()
        qrcode.make(text).save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def _company_card(company):
    c = frappe.get_cached_doc("Company", company)
    addr = None
    link = frappe.db.get_value(
        "Dynamic Link", {"link_doctype": "Company", "link_name": company, "parenttype": "Address"}, "parent"
    )
    if link:
        a = frappe.db.get_value(
            "Address", link, ["address_line1", "address_line2", "city", "pincode", "country"], as_dict=True
        )
        if a:
            addr = ", ".join(x for x in (a.address_line1, a.address_line2, a.city, a.pincode, a.country) if x)
    return {
        "name": c.company_name, "tax_id": c.tax_id, "phone": c.phone_no, "email": c.email,
        "logo": c.company_logo, "address": addr, "currency": c.default_currency,
    }


@frappe.whitelist()
def print_data(doctype, name):
    if doctype not in PRINTABLE:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    doc.apply_fieldlevel_read_permissions()
    d = doc.as_dict()
    keep = (
        "name", "doctype", "posting_date", "transaction_date", "due_date", "delivery_date", "schedule_date", "valid_till",
        "posting_time", "company", "currency", "customer", "customer_name", "supplier", "supplier_name", "party",
        "party_name", "party_type", "tax_id", "is_return", "return_against", "docstatus", "status", "remarks",
        "total", "net_total", "grand_total", "rounded_total", "total_taxes_and_charges", "discount_amount", "paid_amount",
        "outstanding_amount", "in_words", "mode_of_payment", "reference_no", "reference_date", "payment_type",
        "base_grand_total", "is_pos", "update_stock", "po_no", "contact_mobile", "total_qty", "change_amount",
    )
    out = {k: d.get(k) for k in keep if d.get(k) not in (None, "")}
    out["items"] = [
        {k: i.get(k) for k in ("idx", "item_code", "item_name", "description", "qty", "uom", "rate", "amount", "discount_percentage", "net_amount")}
        for i in d.get("items", [])
    ]
    out["taxes"] = [
        {k: t.get(k) for k in ("description", "rate", "tax_amount", "account_head")} for t in d.get("taxes", [])
    ]
    out["payments"] = [
        {k: p.get(k) for k in ("mode_of_payment", "amount")} for p in d.get("payments", []) if flt(p.get("amount"))
    ]
    out["references"] = [
        {k: r.get(k) for k in ("reference_doctype", "reference_name", "allocated_amount")} for r in d.get("references", [])
    ]
    out["can_print"] = True
    z = None
    if doctype == "Sales Invoice" and doc.docstatus == 1 and "ksa_compliance" in frappe.get_installed_apps() \
            and frappe.db.exists("DocType", "Sales Invoice Additional Fields"):
        row = frappe.db.get_value(
            "Sales Invoice Additional Fields", {"sales_invoice": name, "is_latest": 1},
            ["qr_code", "uuid", "invoice_type_transaction", "integration_status", "invoice_counter"], as_dict=True,
        )
        if row:
            z = {
                "qr": _qr_png(row.qr_code), "uuid": row.uuid, "status": row.integration_status,
                "simplified": str(row.invoice_type_transaction or "").startswith("02"),
                "counter": row.invoice_counter,
            }
    out["zatca"] = z
    return {"doc": out, "company": _company_card(doc.company), "buyer_vat": d.get("tax_id")}


# ================================================================ business type
INDUSTRIES = ("retail", "restaurant", "pharmacy", "wholesale")


@frappe.whitelist()
def industry_set(industry):
    """Remember the business type and apply the few server-side switches it needs."""
    frappe.only_for("System Manager")
    if industry not in INDUSTRIES:
        frappe.throw(_("Unknown business type"))
    frappe.db.set_default("amy_industry", industry)
    changed = []
    ss = frappe.get_doc("Stock Settings")
    if industry == "restaurant" and ss.meta.has_field("allow_negative_stock") and not cint(ss.allow_negative_stock):
        ss.allow_negative_stock = 1  # dishes are sold before ingredients are counted
        changed.append("allow_negative_stock")
    if industry == "pharmacy" and ss.meta.has_field("use_serial_batch_fields") and not cint(ss.use_serial_batch_fields):
        ss.use_serial_batch_fields = 1  # lets invoice rows carry the batch number directly
        changed.append("use_serial_batch_fields")
    if industry == "pharmacy" and ss.meta.has_field("auto_create_serial_and_batch_bundle_for_outward") \
            and not cint(ss.auto_create_serial_and_batch_bundle_for_outward):
        ss.auto_create_serial_and_batch_bundle_for_outward = 1
        changed.append("auto_create_serial_and_batch_bundle_for_outward")
    if changed:
        ss.save()
    frappe.db.commit()
    return {"industry": industry, "changed": changed}


@frappe.whitelist()
def pos_ready():
    """Called before the till opens: make sure a POS Profile exists and lists this user."""
    from amy_pos.setup import defaults
    user = frappe.session.user
    try:
        if "System Manager" in frappe.get_roles(user):
            defaults.ensure_pos()
        else:
            defaults.sync_pos_users(only=[user])
    except Exception:
        frappe.db.rollback()
        frappe.log_error(title="AMY POS: pos_ready")
    listed = frappe.db.exists("POS Profile User", {"user": user, "parenttype": "POS Profile"})
    return {"ok": bool(listed)}
