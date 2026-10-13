"""AMY console back-end for the chart of accounts, VAT types and the VAT return.

Everything runs as the signed-in user, so ERPNext permissions apply to every
read and write; nothing here uses ignore_permissions.
"""
import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

CLASSES = ("standard", "zero", "export", "exempt", "import", "out")
TEMPLATE = {"sales": "Sales Taxes and Charges Template", "purchase": "Purchase Taxes and Charges Template"}
SIDE_SALES = ("standard", "zero", "export", "exempt", "out")
SIDE_PURCHASE = ("standard", "zero", "import", "exempt", "out")
MAX_DOCS = 300  # invoices listed per box for drill-down


def _company():
    return frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")


def _data(v):
    if isinstance(v, str):
        v = json.loads(v or "{}")
    if not isinstance(v, (dict, list)):
        frappe.throw(_("Invalid data"))
    return v


def ensure_custom_fields():
    """Adds the 'VAT class' field to both tax templates (idempotent, runs after migrate)."""
    from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

    f = [{
        "fieldname": "amy_vat_class", "label": "VAT class", "fieldtype": "Select", "insert_after": "tax_category",
        "options": "\n" + "\n".join(CLASSES),
        "description": "standard, zero (0%), export, exempt, import (reverse charge), out of scope",
    }]
    co = [
        {"fieldname": "amy_activity", "label": "Activity", "fieldtype": "Data", "insert_after": "website"},
        {"fieldname": "amy_address", "label": "Address", "fieldtype": "Small Text", "insert_after": "amy_activity"},
    ]
    create_custom_fields({TEMPLATE["sales"]: f, TEMPLATE["purchase"]: f, "Company": co,
                          "User": [{"fieldname": "amy_account", "label": "AMY console account", "fieldtype": "Check", "insert_after": "enabled", "read_only": 1, "default": "0"}]},
                         ignore_validate=True)


# ================================================================ chart of accounts
@frappe.whitelist()
def coa_tree():
    frappe.has_permission("Account", "read", throw=True)
    company = _company()
    accs = frappe.get_list(
        "Account", filters={"company": company},
        fields=["name", "account_name", "account_number", "parent_account", "is_group", "root_type", "account_type", "disabled", "tax_rate", "lft"],
        order_by="lft asc", limit_page_length=0,
    )
    own = {}
    has_gl = False
    try:
        if frappe.has_permission("GL Entry", "read"):
            rows = frappe.get_list(
                "GL Entry", filters={"company": company, "is_cancelled": 0},
                fields=["account", "sum(debit) as d", "sum(credit) as c"], group_by="account", limit_page_length=0,
            )
            has_gl = True
            for r in rows:
                own[r.account] = flt(r.d) - flt(r.c)
    except Exception:
        has_gl = False
    by = {a.name: a for a in accs}
    total = dict(own)
    for name, v in own.items():
        p = by.get(name)
        seen = 0
        while p and p.parent_account and seen < 30:
            total[p.parent_account] = total.get(p.parent_account, 0) + v
            p = by.get(p.parent_account)
            seen += 1
    out = []
    for a in accs:
        sign = 1 if a.root_type in ("Asset", "Expense") else -1
        a["balance"] = round(total.get(a.name, 0) * sign, 2) if has_gl else None
        a["used"] = bool(own.get(a.name)) or a.name in own
        out.append(a)
    cc = frappe.get_cached_value("Company", company, "default_currency")
    return {"company": company, "currency": cc, "rows": out, "balances": has_gl}


def _acc_fields(d):
    keep = {}
    for k in ("account_type", "tax_rate", "is_group", "disabled", "parent_account", "account_currency"):
        if k in d:
            keep[k] = d[k]
    return keep


@frappe.whitelist()
def coa_save(data):
    d = _data(data)
    company = _company()
    name = d.get("name")
    if name:
        doc = frappe.get_doc("Account", name)
        if doc.company != company:
            frappe.throw(_("Not permitted"), frappe.PermissionError)
        doc.check_permission("write")
        keep = _acc_fields(d)
        if "is_group" in keep:
            keep["is_group"] = cint(keep["is_group"])
        if "disabled" in keep:
            keep["disabled"] = cint(keep["disabled"])
        doc.update(keep)
        doc.save()
        new_name = doc.name
        nm, no = (d.get("account_name") or "").strip(), (d.get("account_number") or "").strip()
        if (nm and nm != doc.account_name) or (no != (doc.account_number or "")):
            from erpnext.accounts.doctype.account.account import update_account_number

            new_name = update_account_number(doc.name, nm or doc.account_name, no) or doc.name
        return {"name": new_name}
    if not (d.get("account_name") or "").strip():
        frappe.throw(_("Account name is required"))
    if not d.get("parent_account"):
        frappe.throw(_("Choose the parent account"))
    doc = frappe.new_doc("Account")
    doc.update(dict(_acc_fields(d), account_name=d["account_name"].strip(), account_number=(d.get("account_number") or "").strip(), company=company))
    doc.is_group = cint(d.get("is_group"))
    doc.insert()
    return {"name": doc.name}


@frappe.whitelist()
def coa_delete(name):
    doc = frappe.get_doc("Account", name)
    if doc.company != _company():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if doc.parent_account is None:
        frappe.throw(_("Root accounts cannot be deleted"))
    frappe.delete_doc("Account", name)
    return {"ok": 1}


COLS = ["account_number", "account_name", "parent_account", "root_type", "account_type", "is_group", "tax_rate", "disabled"]


@frappe.whitelist()
def coa_export():
    """Every account of the company as plain rows, for a backup file."""
    frappe.has_permission("Account", "read", throw=True)
    rows = frappe.get_list(
        "Account", filters={"company": _company()}, fields=COLS, order_by="lft asc", limit_page_length=0
    )
    return {"columns": COLS, "rows": [[r.get(c) for c in COLS] for r in rows]}


@frappe.whitelist()
def coa_import(rows, dry=0):
    """Restore accounts from an exported file. Existing accounts are left alone."""
    frappe.has_permission("Account", "create", throw=True)
    rows = _data(rows)
    if not isinstance(rows, list) or len(rows) > 3000:
        frappe.throw(_("Too many rows"))
    company = _company()
    abbr = frappe.get_cached_value("Company", company, "abbr")
    todo = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        nm = str(r.get("account_name") or "").strip()
        if nm:
            todo.append({
                "account_name": nm, "account_number": str(r.get("account_number") or "").strip(),
                "parent": str(r.get("parent_account") or "").strip(), "is_group": cint(r.get("is_group")),
                "account_type": str(r.get("account_type") or "").strip(), "tax_rate": flt(r.get("tax_rate")),
                "disabled": cint(r.get("disabled")),
            })

    def resolve(p):
        if not p:
            return None
        for cand in (p, "%s - %s" % (p, abbr)):
            if frappe.db.exists("Account", {"name": cand, "company": company}):
                return cand
        return None

    def full(a):
        n = "%s - %s" % ((a["account_number"] + " - " if a["account_number"] else "") + a["account_name"], abbr)
        return n

    created, skipped, errors = [], [], []
    pending = list(todo)
    for _pass in range(12):
        left = []
        for a in pending:
            exists = frappe.db.exists("Account", {"account_name": a["account_name"], "company": company})
            if exists:
                skipped.append(a["account_name"])
                continue
            parent = resolve(a["parent"])
            if not parent:
                left.append(a)
                continue
            if cint(dry):
                created.append(a["account_name"])
                continue
            try:
                doc = frappe.new_doc("Account")
                doc.update({
                    "account_name": a["account_name"], "account_number": a["account_number"], "company": company,
                    "parent_account": parent, "is_group": a["is_group"], "account_type": a["account_type"] or None,
                    "disabled": a["disabled"],
                })
                if a["tax_rate"]:
                    doc.tax_rate = a["tax_rate"]
                doc.insert()
                created.append(doc.name)
            except Exception as e:
                errors.append("%s: %s" % (a["account_name"], str(e)[:140]))
        if not left or len(left) == len(pending):
            pending = left
            break
        pending = left
    for a in pending:
        errors.append("%s: %s" % (a["account_name"], _("parent not found")))
    if not cint(dry):
        frappe.db.commit()
    return {"created": created, "skipped": len(skipped), "errors": errors, "dry": cint(dry)}


# ================================================================ VAT types
def _tpl_rows(kind):
    dt = TEMPLATE[kind]
    meta = frappe.get_meta(dt)
    fields = ["name", "title", "is_default", "disabled"] + (["amy_vat_class"] if meta.has_field("amy_vat_class") else [])
    tpls = frappe.get_list(dt, filters={"company": _company()}, fields=fields, order_by="creation asc", limit_page_length=200)
    out = []
    for t in tpls:
        doc = frappe.get_doc(dt, t.name)
        rows = [{"account": r.account_head, "rate": flt(r.rate), "charge_type": r.charge_type, "description": r.description} for r in doc.taxes]
        out.append({
            "kind": kind, "name": t.name, "title": t.title, "default": cint(t.is_default), "disabled": cint(t.disabled),
            "vat_class": t.get("amy_vat_class") or _infer_class(sum(r["rate"] for r in rows)), "classified": bool(t.get("amy_vat_class")),
            "rate": sum(r["rate"] for r in rows), "rows": rows,
        })
    return out


def _infer_class(rate):
    return "standard" if flt(rate) > 0 else "zero"


@frappe.whitelist()
def tax_types():
    frappe.has_permission(TEMPLATE["sales"], "read", throw=True)
    company = _company()
    accounts = frappe.get_list(
        "Account", filters={"company": company, "is_group": 0, "disabled": 0, "account_type": ["in", ["Tax", "Chargeable"]]},
        fields=["name", "account_name", "account_type"], limit_page_length=200,
    )
    can = {k: bool(frappe.has_permission(TEMPLATE[k], "create")) for k in TEMPLATE}
    return {"sales": _tpl_rows("sales"), "purchase": _tpl_rows("purchase"), "accounts": accounts, "can": can, "classes": list(CLASSES)}


@frappe.whitelist()
def tax_type_save(data):
    d = _data(data)
    kind = d.get("kind")
    if kind not in TEMPLATE:
        frappe.throw(_("Invalid tax type"))
    dt = TEMPLATE[kind]
    vc = d.get("vat_class") or "standard"
    if vc not in CLASSES:
        frappe.throw(_("Invalid VAT class"))
    rate = flt(d.get("rate"))
    if rate < 0 or rate > 100:
        frappe.throw(_("Rate must be between 0 and 100"))
    account = d.get("account")
    company = _company()
    if not account or frappe.db.get_value("Account", account, "company") != company:
        frappe.throw(_("Choose the account that receives this tax"))
    desc = d.get("description") or ("VAT %s%%" % (int(rate) if rate == int(rate) else rate))
    row = {"charge_type": "On Net Total", "account_head": account, "description": desc, "rate": rate}
    if kind == "purchase":
        row.update({"category": "Total", "add_deduct_tax": "Add"})
    if d.get("name"):
        doc = frappe.get_doc(dt, d["name"])
        if doc.company != company:
            frappe.throw(_("Not permitted"), frappe.PermissionError)
        doc.check_permission("write")
        if (d.get("title") or "").strip():
            doc.title = d["title"].strip()
        doc.set("taxes", [])
        doc.append("taxes", row)
        doc.disabled = cint(d.get("disabled"))
    else:
        title = (d.get("title") or "").strip()
        if not title:
            frappe.throw(_("Name is required"))
        doc = frappe.new_doc(dt)
        doc.update({"title": title, "company": company})
        doc.append("taxes", row)
    if doc.meta.has_field("amy_vat_class"):
        doc.amy_vat_class = vc
    if cint(d.get("default")):
        doc.is_default = 1
    if doc.is_new():
        doc.insert()
    else:
        doc.save()
    return tax_types()


@frappe.whitelist()
def tax_type_delete(kind, name):
    if kind not in TEMPLATE:
        frappe.throw(_("Invalid tax type"))
    doc = frappe.get_doc(TEMPLATE[kind], name)
    if doc.company != _company():
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    frappe.delete_doc(TEMPLATE[kind], name)
    return tax_types()


# ================================================================ VAT return
def _class_map(kind):
    dt = TEMPLATE[kind]
    meta = frappe.get_meta(dt)
    m = {}
    try:
        fields = ["name"] + (["amy_vat_class"] if meta.has_field("amy_vat_class") else [])
        for t in frappe.get_list(dt, filters={"company": _company()}, fields=fields, limit_page_length=0):
            doc = frappe.get_doc(dt, t.name)
            rate = sum(flt(r.rate) for r in doc.taxes)
            m[t.name] = t.get("amy_vat_class") or _infer_class(rate)
    except Exception:
        pass
    return m


def _boxes(kind, doctype, d_from, d_to, company):
    side = SIDE_SALES if kind == "sales" else SIDE_PURCHASE
    cmap = _class_map(kind)
    rows = frappe.get_list(
        doctype, filters={"company": company, "docstatus": 1, "posting_date": ["between", [d_from, d_to]]},
        fields=["name", "posting_date", "base_net_total", "base_total_taxes_and_charges", "is_return", "taxes_and_charges"]
        + (["customer_name as party"] if kind == "sales" else ["supplier_name as party"]),
        order_by="posting_date asc, name asc", limit_page_length=20000,
    )
    boxes = {c: {"amount": 0.0, "adjust": 0.0, "vat": 0.0, "count": 0, "docs": []} for c in side}
    for r in rows:
        net, vat = flt(r.base_net_total), flt(r.base_total_taxes_and_charges)
        cls = cmap.get(r.taxes_and_charges) if r.taxes_and_charges else None
        if not cls:
            cls = _infer_class(1 if vat else 0)
        if cls not in boxes:
            cls = "out"
        b = boxes[cls]
        if cint(r.is_return):
            b["adjust"] += net
        else:
            b["amount"] += net
        b["vat"] += vat
        b["count"] += 1
        if len(b["docs"]) < MAX_DOCS:
            b["docs"].append({"name": r.name, "date": str(r.posting_date), "party": r.party, "net": net, "vat": vat, "ret": cint(r.is_return)})
    for b in boxes.values():
        b["amount"], b["adjust"], b["vat"] = round(b["amount"], 2), round(b["adjust"], 2), round(b["vat"], 2)
    return boxes


@frappe.whitelist()
def vat_return(from_date=None, to_date=None):
    for dt in ("Sales Invoice", "Purchase Invoice"):
        frappe.has_permission(dt, "read", throw=True)
    company = _company()
    today = getdate(nowdate())
    d_from = getdate(from_date) if from_date else today.replace(day=1)
    d_to = getdate(to_date) if to_date else today
    if d_from > d_to:
        frappe.throw(_("The start date is after the end date"))
    if (d_to - d_from).days > 400:
        frappe.throw(_("Choose a period of at most one year"))
    sales = _boxes("sales", "Sales Invoice", d_from, d_to, company)
    purchase = _boxes("purchase", "Purchase Invoice", d_from, d_to, company)
    out_vat = round(sum(b["vat"] for b in sales.values()), 2)
    in_vat = round(sum(b["vat"] for b in purchase.values()), 2)
    drafts = frappe.get_list(
        "Sales Invoice", filters={"company": company, "docstatus": 0, "posting_date": ["between", [d_from, d_to]]},
        fields=["count(name) as c"],
    )
    ledger = None
    try:
        if frappe.has_permission("GL Entry", "read"):
            tax_accs = [a.name for a in frappe.get_list("Account", filters={"company": company, "account_type": "Tax", "is_group": 0}, fields=["name"], limit_page_length=0)]
            if tax_accs:
                g = frappe.get_list(
                    "GL Entry", filters={"company": company, "is_cancelled": 0, "account": ["in", tax_accs], "posting_date": ["between", [d_from, d_to]]},
                    fields=["sum(credit) as c", "sum(debit) as d"],
                )
                ledger = round(flt(g[0].c) - flt(g[0].d), 2) if g else 0
    except Exception:
        ledger = None
    return {
        "company": company, "currency": frappe.get_cached_value("Company", company, "default_currency"),
        "tax_id": frappe.get_cached_value("Company", company, "tax_id"),
        "from": str(d_from), "to": str(d_to), "sales": sales, "purchase": purchase,
        "output_vat": out_vat, "input_vat": in_vat, "net_vat": round(out_vat - in_vat, 2),
        "drafts": cint(drafts[0].c) if drafts else 0, "ledger_net": ledger,
    }
