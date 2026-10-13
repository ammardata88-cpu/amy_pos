"""AMY till: a one-screen point of sale on top of Sales Invoice (is_pos), no POS Next needed.

Every call runs as the signed-in user, so ERPNext roles, user permissions, stock rules and
ZATCA hooks all apply exactly as they do for an invoice made in the console.
"""
import json

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime, nowdate

from amy_pos import rest
from amy_pos.setup import defaults


def _need():
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    if not frappe.has_permission("Sales Invoice", "create"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)


def _profile(name=None):
    user = frappe.session.user
    rows = frappe.get_all("POS Profile User", filters={"user": user, "parenttype": "POS Profile"},
                          fields=["parent", "default"], order_by="`default` desc, idx asc")
    names = [r.parent for r in rows if not frappe.db.get_value("POS Profile", r.parent, "disabled")]
    if name and name in names:
        return frappe.get_doc("POS Profile", name)
    return frappe.get_doc("POS Profile", names[0]) if names else None


def _ready():
    """Nothing to set up by hand: create the profile and list this user if needed."""
    user = frappe.session.user
    try:
        if not _profile():
            if "System Manager" in frappe.get_roles(user):
                defaults.ensure_pos()
            else:
                defaults.sync_pos_users(only=[user])
            frappe.db.commit()
    except Exception:
        frappe.db.rollback()
        frappe.log_error(title="AMY till: ready")


def _modes(p):
    rows = []
    for r in p.get("payments"):
        if frappe.db.exists("Mode of Payment Account", {"parent": r.mode_of_payment, "company": p.company}):
            rows.append({"mode": r.mode_of_payment, "type": frappe.db.get_value("Mode of Payment", r.mode_of_payment, "type"),
                         "default": cint(r.default)})
    if not rows:
        rows = [{"mode": m.name, "type": m.type, "default": 1 if i == 0 else 0} for i, m in enumerate(defaults._company_modes(p.company))]
    return rows


@frappe.whitelist()
def boot(profile=None):
    _need()
    p = _profile(profile)
    if not p:
        _ready()
        p = _profile(profile)
    if not p:
        return {"ready": False}
    rate = 0
    if p.taxes_and_charges:
        rate = sum(flt(t.rate) for t in frappe.get_all("Sales Taxes and Charges", filters={"parent": p.taxes_and_charges},
                                                         fields=["rate"]))
    logo = frappe.db.get_value("Company", p.company, "company_logo")
    return {
        "ready": True, "profile": p.name, "company": p.company, "currency": p.currency, "warehouse": p.warehouse,
        "customer": p.customer, "customer_name": frappe.db.get_value("Customer", p.customer, "customer_name") or p.customer,
        "vat_rate": rate, "payments": _modes(p), "logo": logo,
        "profiles": [x for x in frappe.get_all("POS Profile User", filters={"user": frappe.session.user, "parenttype": "POS Profile"}, pluck="parent")],
        "groups": frappe.get_list("Item Group", filters={"is_group": 0}, pluck="name", order_by="name asc", limit_page_length=40),
        "user": {"name": frappe.session.user, "full_name": frappe.db.get_value("User", frappe.session.user, "full_name")},
        "can_discount": 1,
        "cashier": rest._is_cashier(frappe.get_roles()),
        "shift": _shift_info(_open_shift()),
    }


def _shape(rows, p):
    codes = [r.name for r in rows]
    price, stock = {}, {}
    if codes:
        for ip in frappe.get_all("Item Price", filters={"item_code": ["in", codes], "price_list": p.selling_price_list, "selling": 1},
                                 fields=["item_code", "price_list_rate", "uom"], order_by="creation asc"):
            price[ip.item_code] = flt(ip.price_list_rate)
        for b in frappe.get_all("Bin", filters={"item_code": ["in", codes], "warehouse": p.warehouse}, fields=["item_code", "actual_qty"]):
            stock[b.item_code] = flt(b.actual_qty)
    return [{"code": r.name, "name": r.item_name, "price": price.get(r.name, flt(r.standard_rate)), "stock": stock.get(r.name, 0) if r.is_stock_item else None,
             "image": r.image, "uom": r.stock_uom, "group": r.item_group} for r in rows]


ITEM_FIELDS = ["name", "item_name", "image", "stock_uom", "item_group", "is_stock_item", "standard_rate"]


@frappe.whitelist()
def items(profile=None, search=None, group=None, start=0):
    _need()
    p = _profile(profile)
    if not p:
        return []
    filters = {"disabled": 0, "is_sales_item": 1, "has_variants": 0}
    if group:
        filters["item_group"] = group
    or_filters = None
    s = (search or "").strip()[:80]
    if s:
        codes = frappe.get_all("Item Barcode", filters={"barcode": ["like", "%" + s + "%"]}, pluck="parent", limit_page_length=20)
        or_filters = [["name", "like", "%" + s + "%"], ["item_name", "like", "%" + s + "%"]]
        if codes:
            or_filters.append(["name", "in", codes])
    rows = frappe.get_list("Item", filters=filters, or_filters=or_filters, fields=ITEM_FIELDS,
                           order_by="item_name asc", start=cint(start), page_length=60)
    return _shape(rows, p)


@frappe.whitelist()
def scan(code, profile=None):
    """Exact barcode or item code, for scanners."""
    _need()
    p = _profile(profile)
    code = (code or "").strip()[:140]
    if not p or not code:
        return None
    name = frappe.db.get_value("Item Barcode", {"barcode": code}, "parent") or (code if frappe.db.exists("Item", code) else None)
    if not name:
        return None
    rows = frappe.get_list("Item", filters={"name": name, "disabled": 0, "is_sales_item": 1}, fields=ITEM_FIELDS, page_length=1)
    out = _shape(rows, p)
    return out[0] if out else None


@frappe.whitelist()
def customers(q=None):
    _need()
    q = (q or "").strip()[:80]
    of = [["name", "like", "%" + q + "%"], ["customer_name", "like", "%" + q + "%"], ["mobile_no", "like", "%" + q + "%"]] if q else None
    return frappe.get_list("Customer", filters={"disabled": 0}, or_filters=of, fields=["name", "customer_name", "mobile_no"],
                           order_by="modified desc", page_length=12)


@frappe.whitelist()
def quick_customer(name, mobile=None):
    """Add a customer right from the till."""
    _need()
    if not frappe.has_permission("Customer", "create"):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    name = (name or "").strip()[:140]
    if not name:
        frappe.throw(_("Customer is required"))
    c = frappe.get_doc({"doctype": "Customer", "customer_name": name, "customer_type": "Individual",
                        "customer_group": frappe.db.get_single_value("Selling Settings", "customer_group") or "Individual",
                        "territory": frappe.db.get_single_value("Selling Settings", "territory") or "All Territories",
                        "mobile_no": (mobile or "")[:30]})
    c.insert()
    return {"name": c.name, "customer_name": c.customer_name, "mobile_no": c.mobile_no}


# ---------------------------------------------------------------- invoice
def _build(d, p):
    d = rest._json(d, {}) if isinstance(d, str) else (d or {})
    rows = [r for r in (d.get("items") or []) if r.get("item_code") and flt(r.get("qty")) > 0]
    if not rows:
        frappe.throw(_("Add at least one item"))
    doc = frappe.new_doc("Sales Invoice")
    doc.update({
        "company": p.company, "customer": d.get("customer") or p.customer, "is_pos": 1, "pos_profile": p.name, "update_stock": 1,
        "set_warehouse": p.warehouse, "selling_price_list": p.selling_price_list, "currency": p.currency,
        "taxes_and_charges": p.taxes_and_charges, "posting_date": nowdate(), "cost_center": p.cost_center,
        "write_off_account": p.write_off_account, "write_off_cost_center": p.write_off_cost_center,
        "remarks": (d.get("note") or "")[:140],
    })
    for r in rows:
        plr, disc = flt(r.get("price")), min(max(flt(r.get("discount")), 0), 100)
        doc.append("items", {"item_code": r["item_code"], "qty": flt(r["qty"]), "price_list_rate": plr,
                             "discount_percentage": disc, "rate": flt(plr * (1 - disc / 100.0), 4), "warehouse": p.warehouse})
    if flt(d.get("discount_percent")) > 0:
        doc.apply_discount_on = "Net Total"
        doc.additional_discount_percentage = min(flt(d["discount_percent"]), 100)
    elif flt(d.get("discount_amount")) > 0:
        doc.apply_discount_on = "Net Total"
        doc.discount_amount = flt(d["discount_amount"])
    rest._prepare(doc, {})
    return doc


def _totals(doc):
    doc.calculate_taxes_and_totals()
    total = doc.rounded_total or doc.grand_total
    return {"net": flt(doc.net_total), "vat": flt(doc.total_taxes_and_charges), "grand": flt(doc.grand_total),
            "total": flt(total), "discount": flt(doc.discount_amount), "items": [{"rate": flt(i.rate), "amount": flt(i.amount)} for i in doc.items]}


@frappe.whitelist()
def totals(data, profile=None):
    """Exact totals (same engine as the saved invoice) so the screen and the receipt always agree."""
    _need()
    p = _profile(profile)
    if not p:
        frappe.throw(_("No POS Profile"))
    return _totals(_build(data, p))


@frappe.whitelist()
def checkout(data, payments, profile=None):
    _need()
    if not _open_shift():
        frappe.throw(_("Open your shift first"))
    p = _profile(profile)
    if not p:
        frappe.throw(_("No POS Profile"))
    pays = rest._json(payments, []) if isinstance(payments, str) else (payments or [])
    doc = _build(data, p)
    allowed = {m["mode"]: m["type"] for m in _modes(p)}
    cash_acc = None
    for r in pays:
        mode, amt = r.get("mode"), flt(r.get("amount"))
        if amt <= 0:
            continue
        if mode not in allowed:
            frappe.throw(_("Invalid payment method"))
        acc = frappe.db.get_value("Mode of Payment Account", {"parent": mode, "company": p.company}, "default_account")
        doc.append("payments", {"mode_of_payment": mode, "amount": amt, "type": allowed[mode], "account": acc})
        if allowed[mode] == "Cash" and not cash_acc:
            cash_acc = acc
    if not doc.get("payments"):
        frappe.throw(_("Enter the payment amount"))
    doc.account_for_change_amount = cash_acc or frappe.db.get_value("Company", p.company, "default_cash_account")
    doc.save()
    doc.submit()
    return {"name": doc.name, "total": flt(doc.rounded_total or doc.grand_total), "paid": flt(doc.paid_amount), "change": flt(doc.change_amount)}


@frappe.whitelist()
def recent():
    _need()
    return frappe.get_list("Sales Invoice", filters={"is_pos": 1, "docstatus": 1, "owner": frappe.session.user, "posting_date": nowdate()},
                           fields=["name", "customer_name", "grand_total", "rounded_total", "posting_time", "is_return"],
                           order_by="creation desc", page_length=25)


@frappe.whitelist()
def today():
    """Counts and totals for today's till sales of the signed-in user, by payment method."""
    _need()
    names = frappe.get_list("Sales Invoice", filters={"is_pos": 1, "docstatus": 1, "owner": frappe.session.user, "posting_date": nowdate()},
                            pluck="name", limit_page_length=2000)
    out = {"count": len(names), "total": 0, "methods": []}
    if not names:
        return out
    inv = frappe.get_all("Sales Invoice", filters={"name": ["in", names]}, fields=["rounded_total", "grand_total", "change_amount"])
    out["total"] = sum(flt(i.rounded_total or i.grand_total) for i in inv)
    for r in frappe.db.sql("""select mode_of_payment, sum(amount) as amount from `tabSales Invoice Payment`
                              where parent in %(n)s group by mode_of_payment""", {"n": tuple(names)}, as_dict=True):
        out["methods"].append({"mode": r.mode_of_payment, "amount": flt(r.amount)})
    chg = sum(flt(i.change_amount) for i in inv)
    if chg:
        for m in out["methods"]:
            if frappe.db.get_value("Mode of Payment", m["mode"], "type") == "Cash":
                m["amount"] -= chg
                break
    return out


# ------------------------------------------------------------------ shifts
def _open_shift():
    from amy_pos.setup import shift_doctype

    shift_doctype.ensure()
    name = frappe.db.get_value("AMY Shift", {"user": frappe.session.user, "status": "Open"}, "name", order_by="creation desc")
    return frappe.get_doc("AMY Shift", name) if name else None


def _sums(sh):
    """Sales since the shift opened, split into cash (net of change given) and everything else."""
    cond = "si.is_pos=1 and si.docstatus=1 and si.owner=%(u)s and si.creation>=%(a)s"
    vals = {"u": sh.user, "a": sh.opened_at}
    if sh.status == "Closed" and sh.closed_at:
        cond += " and si.creation<=%(b)s"
        vals["b"] = sh.closed_at
    inv = frappe.db.sql(f"select count(*) c, coalesce(sum(change_amount),0) ch from `tabSales Invoice` si where {cond}", vals, as_dict=True)[0]
    cash = other = 0.0
    by = {}
    for r in frappe.db.sql(f"""select p.mode_of_payment m, sum(p.amount) a from `tabSales Invoice Payment` p
                              join `tabSales Invoice` si on si.name=p.parent where {cond} group by p.mode_of_payment""", vals, as_dict=True):
        by[r.m] = flt(r.a)
        if frappe.db.get_value("Mode of Payment", r.m, "type") == "Cash":
            cash += flt(r.a)
        else:
            other += flt(r.a)
    cash -= flt(inv.ch)
    methods = [{"mode": m, "amount": a} for m, a in by.items()]
    for m in methods:
        if frappe.db.get_value("Mode of Payment", m["mode"], "type") == "Cash":
            m["amount"] -= flt(inv.ch)
    return {"count": cint(inv.c), "cash_sales": cash, "other_sales": other, "methods": methods,
            "expected_cash": flt(sh.opening_cash) + cash}


def _shift_info(sh):
    if not sh:
        return None
    return {"name": sh.name, "opened_at": str(sh.opened_at), "opening_cash": flt(sh.opening_cash), "pos_profile": sh.pos_profile,
            "status": sh.status, **_sums(sh)}


@frappe.whitelist()
def open_shift(opening_cash=0, profile=None):
    _need()
    if _open_shift():
        frappe.throw(_("You already have an open shift"))
    p = _profile(profile)
    if not p:
        frappe.throw(_("No POS Profile"))
    amt = flt(opening_cash)
    if amt < 0:
        frappe.throw(_("Enter a valid amount"))
    sh = frappe.get_doc({"doctype": "AMY Shift", "user": frappe.session.user, "pos_profile": p.name, "company": p.company,
                         "status": "Open", "opened_at": now_datetime(), "opening_cash": amt})
    sh.insert(ignore_permissions=True)
    return _shift_info(sh)


@frappe.whitelist()
def shift_summary():
    _need()
    return _shift_info(_open_shift())


@frappe.whitelist()
def close_shift(counted_cash, cash_left=0, note=None):
    """counted_cash = cash physically in the drawer now; cash_left = what stays in the drawer for the next shift."""
    _need()
    sh = _open_shift()
    if not sh:
        frappe.throw(_("No open shift"))
    counted, left = flt(counted_cash), flt(cash_left)
    if counted < 0 or left < 0:
        frappe.throw(_("Enter a valid amount"))
    if left > counted:
        frappe.throw(_("The cash left in the drawer cannot be more than the cash counted"))
    s = _sums(sh)
    sh.update({"status": "Closed", "closed_at": now_datetime(), "invoice_count": s["count"], "cash_sales": s["cash_sales"],
               "other_sales": s["other_sales"], "expected_cash": s["expected_cash"], "counted_cash": counted,
               "difference": counted - s["expected_cash"], "cash_left": left, "cash_to_deposit": counted - left, "note": note})
    sh.save(ignore_permissions=True)
    out = _shift_info(sh)
    out.update({"counted_cash": counted, "difference": sh.difference, "cash_left": left, "cash_to_deposit": sh.cash_to_deposit, "closed_at": str(sh.closed_at)})
    return out


@frappe.whitelist()
def last_cash_left():
    """Suggest the next opening amount: what the previous shift left in the drawer."""
    _need()
    v = frappe.db.get_value("AMY Shift", {"status": "Closed", "pos_profile": (_profile() or frappe._dict()).get("name")}, "cash_left", order_by="closed_at desc")
    return flt(v)
