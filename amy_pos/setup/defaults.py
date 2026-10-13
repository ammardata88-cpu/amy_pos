"""Ready-to-trade defaults for a company.

`status()` reports what is missing, `apply()` creates only what is missing.
Nothing existing is changed or overwritten, so it is safe to run again.

From the console: Settings > Quick setup.  From a shell:

    bench --site <site> execute amy_pos.setup.defaults.apply
"""

import frappe
from frappe.utils import add_days, getdate, nowdate

VAT_RATE = 15  # Saudi VAT, %
WALKIN = "Walk-in Customer"


def _company(company=None):
    return company or frappe.db.get_single_value("Global Defaults", "default_company") or \
        frappe.db.get_value("Company", {}, "name", order_by="creation asc")


def _first(doctype, filters, order="creation asc"):
    return frappe.db.get_value(doctype, filters, "name", order_by=order)


# ---------------------------------------------------------------- accounts
def _account(company, **filters):
    f = {"company": company, "is_group": 0}
    f.update(filters)
    return _first("Account", f)


def _make_account(company, name, parent, root_type, account_type=None):
    acc = frappe.get_doc({
        "doctype": "Account", "account_name": name, "company": company, "parent_account": parent,
        "root_type": root_type, "account_type": account_type or "", "is_group": 0,
    })
    acc.insert(ignore_permissions=True)
    return acc.name


def _tax_account(company):
    acc = _account(company, account_type="Tax", account_name=["like", "%VAT%"]) or \
        _account(company, account_type="Tax", account_name=["like", "%القيمة المضافة%"]) or \
        _account(company, account_type="Tax")
    if acc:
        return acc
    parent = _first("Account", {"company": company, "account_type": "Tax", "is_group": 1}) or \
        _first("Account", {"company": company, "root_type": "Liability", "is_group": 1, "parent_account": ["is", "set"]})
    return _make_account(company, "VAT", parent, "Liability", "Tax") if parent else None


def _bank_account(company, c):
    return c.default_bank_account or _account(company, account_type="Bank")


def _cash_account(company, c):
    return c.default_cash_account or _account(company, account_type="Cash")


# ---------------------------------------------------------------- checks
def _checks(company):
    c = frappe.get_cached_doc("Company", company)
    out = []

    def add(key, ar, en, ok, detail=""):
        out.append({"key": key, "ar": ar, "en": en, "ok": bool(ok), "detail": detail})

    add("fiscal", "السنة المالية الحالية", "Current fiscal year",
        frappe.db.exists("Fiscal Year", {"year_start_date": ["<=", nowdate()], "year_end_date": [">=", nowdate()]}))
    add("accounts", "حسابات الصندوق والبنك وفروق التقريب", "Cash, bank and round-off accounts",
        _cash_account(company, c) and _bank_account(company, c) and c.write_off_account and c.cost_center)
    add("tax_sales", "ضريبة القيمة المضافة 15% للمبيعات", "15% VAT on sales",
        frappe.db.exists("Sales Taxes and Charges Template", {"company": company}))
    add("tax_buy", "ضريبة القيمة المضافة 15% للمشتريات", "15% VAT on purchases",
        frappe.db.exists("Purchase Taxes and Charges Template", {"company": company}))
    bad = _modes_missing_account(company, c)
    add("modes", "طرق الدفع (نقدي وشبكة وتحويل) مربوطة بحسابات", "Payment methods linked to accounts",
        not bad and frappe.db.exists("Mode of Payment", {"enabled": 1, "type": "Cash"}) and
        frappe.db.exists("Mode of Payment", {"enabled": 1, "type": "Bank"}))
    add("warehouse", "مستودع رئيسي", "A main warehouse",
        frappe.db.exists("Warehouse", {"company": company, "is_group": 0, "disabled": 0}))
    add("lists", "قوائم الأسعار والعميل النقدي", "Price lists and walk-in customer",
        frappe.db.exists("Price List", {"selling": 1, "enabled": 1}) and
        frappe.db.exists("Price List", {"buying": 1, "enabled": 1}) and frappe.db.exists("Customer", WALKIN))
    add("pos", "ملف نقطة بيع جاهز", "A ready POS profile",
        frappe.db.exists("POS Profile", {"company": company, "disabled": 0}))
    add("defaults", "الإعدادات الافتراضية للمبيعات والمخزون", "Selling and stock defaults",
        frappe.db.get_single_value("Selling Settings", "customer_group") and
        frappe.db.get_single_value("Selling Settings", "territory") and
        frappe.db.get_single_value("Selling Settings", "selling_price_list") and
        frappe.db.get_single_value("Stock Settings", "default_warehouse"))
    return out


def _modes_missing_account(company, c):
    missing = []
    for m in frappe.get_all("Mode of Payment", filters={"enabled": 1, "type": ["in", ["Cash", "Bank"]]}, fields=["name"]):
        if not frappe.db.exists("Mode of Payment Account", {"parent": m.name, "company": company}):
            missing.append(m.name)
    return missing


def status(company=None):
    company = _company(company)
    if not company:
        return {"company": None, "checks": [], "ready": False}
    checks = _checks(company)
    ready = all(x["ok"] for x in checks)
    zatca = "ksa_compliance" in frappe.get_installed_apps()
    return {"company": company, "checks": checks, "ready": ready, "zatca": zatca}


# ---------------------------------------------------------------- fixes
def _fix_fiscal(company, c):
    if frappe.db.exists("Fiscal Year", {"year_start_date": ["<=", nowdate()], "year_end_date": [">=", nowdate()]}):
        return
    y = getdate(nowdate()).year
    fy = frappe.get_doc({"doctype": "Fiscal Year", "year": str(y), "year_start_date": f"{y}-01-01",
                         "year_end_date": f"{y}-12-31", "companies": [{"company": company}]})
    fy.insert(ignore_permissions=True)


def _fix_accounts(company, c):
    changed = {}
    if not c.default_bank_account:
        acc = _account(company, account_type="Bank")
        if not acc:
            parent = _first("Account", {"company": company, "account_type": "Bank", "is_group": 1})
            acc = _make_account(company, "Bank", parent, "Asset", "Bank") if parent else None
        if acc:
            changed["default_bank_account"] = acc
    if not c.default_cash_account:
        acc = _account(company, account_type="Cash")
        if acc:
            changed["default_cash_account"] = acc
    if not c.write_off_account:
        acc = _account(company, account_type="Round Off") or _account(company, account_name=["like", "%Write Off%"]) or \
            _account(company, root_type="Expense", account_name=["like", "%فروق%"])
        if not acc:
            parent = _first("Account", {"company": company, "root_type": "Expense", "is_group": 1, "parent_account": ["is", "set"]})
            acc = _make_account(company, "Write Off", parent, "Expense", "Round Off") if parent else None
        if acc:
            changed["write_off_account"] = acc
    if not c.cost_center:
        cc = _first("Cost Center", {"company": company, "is_group": 0})
        if cc:
            changed["cost_center"] = cc
    for k, v in changed.items():
        frappe.db.set_value("Company", company, k, v)
    frappe.clear_document_cache("Company", company)


def _fix_tax(company, c, sales):
    dt = "Sales Taxes and Charges Template" if sales else "Purchase Taxes and Charges Template"
    if frappe.db.exists(dt, {"company": company}):
        return
    acc = _tax_account(company)
    if not acc:
        return
    row = {"charge_type": "On Net Total", "account_head": acc, "description": f"VAT {VAT_RATE}%", "rate": VAT_RATE}
    if not sales:
        row.update({"category": "Total", "add_deduct_tax": "Add"})
    frappe.get_doc({"doctype": dt, "title": f"VAT {VAT_RATE}%", "company": company, "is_default": 1,
                    "taxes": [row]}).insert(ignore_permissions=True)


def _ensure_mode(name, typ, ar_label=None):
    if frappe.db.exists("Mode of Payment", {"enabled": 1, "type": typ}):
        return
    if frappe.db.exists("Mode of Payment", name):
        return
    frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": name, "type": typ, "enabled": 1}).insert(ignore_permissions=True)


def _fix_modes(company, c):
    _ensure_mode("Cash", "Cash")
    _ensure_mode("Card", "Bank")
    # a transfer method too, if the site has only one bank-type method
    if frappe.db.count("Mode of Payment", {"enabled": 1, "type": "Bank"}) < 2:
        if not frappe.db.exists("Mode of Payment", "Bank Transfer"):
            frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": "Bank Transfer", "type": "Bank", "enabled": 1}).insert(ignore_permissions=True)
    cash, bank = _cash_account(company, c), _bank_account(company, c)
    for m in frappe.get_all("Mode of Payment", filters={"enabled": 1, "type": ["in", ["Cash", "Bank"]]}, fields=["name", "type"]):
        if frappe.db.exists("Mode of Payment Account", {"parent": m.name, "company": company}):
            continue
        acc = cash if m.type == "Cash" else bank
        if acc:
            doc = frappe.get_doc("Mode of Payment", m.name)
            doc.append("accounts", {"company": company, "default_account": acc})
            doc.save(ignore_permissions=True)


def _fix_warehouse(company, c):
    if frappe.db.exists("Warehouse", {"company": company, "is_group": 0, "disabled": 0}):
        return
    frappe.get_doc({"doctype": "Warehouse", "warehouse_name": "Stores", "company": company}).insert(ignore_permissions=True)


def _fix_lists(company, c):
    cur = c.default_currency
    for sell, name in ((1, "Standard Selling"), (0, "Standard Buying")):
        if not frappe.db.exists("Price List", {"selling" if sell else "buying": 1, "enabled": 1}):
            frappe.get_doc({"doctype": "Price List", "price_list_name": name, "currency": cur, "enabled": 1,
                            "selling": sell, "buying": 0 if sell else 1}).insert(ignore_permissions=True)
    if not frappe.db.exists("Customer", WALKIN):
        frappe.get_doc({
            "doctype": "Customer", "customer_name": WALKIN, "customer_type": "Individual",
            "customer_group": _first("Customer Group", {"is_group": 0}) or "Individual",
            "territory": _first("Territory", {"is_group": 0}) or "All Territories",
        }).insert(ignore_permissions=True)


def _fix_pos(company, c):
    if frappe.db.exists("POS Profile", {"company": company, "disabled": 0}):
        return
    warehouse = _first("Warehouse", {"company": company, "is_group": 0, "disabled": 0})
    price_list = _first("Price List", {"selling": 1, "enabled": 1})
    if not (warehouse and price_list and c.write_off_account and c.cost_center):
        return
    payments = []
    for m in frappe.get_all("Mode of Payment", filters={"enabled": 1, "type": ["in", ["Cash", "Bank"]]}, fields=["name", "type"], order_by="type asc, creation asc"):
        if frappe.db.exists("Mode of Payment Account", {"parent": m.name, "company": company}):
            payments.append({"mode_of_payment": m.name, "default": 0 if payments else 1})
    if not payments:
        return
    users = _pos_users()
    abbr = frappe.db.get_value("Company", company, "abbr") or company
    pname = "AMY POS" if not frappe.db.exists("POS Profile", "AMY POS") else f"AMY POS - {abbr}"
    frappe.get_doc({
        "doctype": "POS Profile", "name": pname, "company": company, "customer": WALKIN, "warehouse": warehouse,
        "currency": c.default_currency, "selling_price_list": price_list, "write_off_account": c.write_off_account,
        "write_off_cost_center": c.cost_center, "cost_center": c.cost_center,
        "taxes_and_charges": _first("Sales Taxes and Charges Template", {"company": company, "is_default": 1}) or
        _first("Sales Taxes and Charges Template", {"company": company}),
        "payments": payments, "applicable_for_users": [{"user": u, "default": 1 if u == "Administrator" else 0} for u in users],
    }).insert(ignore_permissions=True)


def _fix_defaults(company, c):
    ss = frappe.get_single("Selling Settings")
    ss.customer_group = ss.customer_group or _first("Customer Group", {"is_group": 0}) or "Individual"
    ss.territory = ss.territory or _first("Territory", {"is_group": 0}) or "All Territories"
    ss.selling_price_list = ss.selling_price_list or _first("Price List", {"selling": 1, "enabled": 1})
    ss.save(ignore_permissions=True)
    bs = frappe.get_single("Buying Settings")
    bs.supplier_group = bs.supplier_group or _first("Supplier Group", {"is_group": 0})
    bs.buying_price_list = bs.buying_price_list or _first("Price List", {"buying": 1, "enabled": 1})
    bs.save(ignore_permissions=True)
    st = frappe.get_single("Stock Settings")
    st.default_warehouse = st.default_warehouse or _first("Warehouse", {"company": company, "is_group": 0, "disabled": 0})
    st.save(ignore_permissions=True)
    if not frappe.db.get_single_value("Global Defaults", "default_company"):
        frappe.db.set_single_value("Global Defaults", "default_company", company)


FIXES = [("fiscal", _fix_fiscal), ("accounts", _fix_accounts), ("tax_sales", lambda co, c: _fix_tax(co, c, True)),
         ("tax_buy", lambda co, c: _fix_tax(co, c, False)), ("modes", _fix_modes), ("warehouse", _fix_warehouse),
         ("lists", _fix_lists), ("defaults", _fix_defaults), ("pos", _fix_pos)]


def apply(company=None):
    """Create whatever is missing. Each step is independent: one failing does not stop the rest."""
    company = _company(company)
    if not company:
        return {"company": None, "checks": [], "ready": False, "errors": ["no company yet"]}
    errors = []
    todo = {x["key"] for x in _checks(company) if not x["ok"]}
    for key, fn in FIXES:
        if key not in todo and key != "pos":
            continue
        try:
            fn(company, frappe.get_cached_doc("Company", company))
            frappe.db.commit()
        except Exception:
            frappe.db.rollback()
            frappe.log_error(title=f"AMY POS quick setup: {key}")
            errors.append(key)
    out = status(company)
    out["errors"] = errors
    return out


# ---------------------------------------------------------------- cashier ready
# A user can open the till only if some POS Profile lists them. These helpers make
# that automatic so nobody has to touch POS Profile settings to start selling.
POS_ROLES = ("POSNext Cashier", "POS User", "Sales User", "Sales Manager", "Sales Master Manager",
             "Accounts Manager", "System Manager")


def _is_pos_user(user):
    if not user or user in ("Guest",):
        return False
    if user == "Administrator":
        return True
    if not frappe.db.get_value("User", user, ["enabled"]):
        return False
    if frappe.db.get_value("User", user, "user_type") != "System User":
        return False
    return bool(set(frappe.get_roles(user)) & set(POS_ROLES))


def _pos_users():
    users = {"Administrator"}
    users.update(frappe.get_all("User", filters={"enabled": 1, "user_type": "System User"}, pluck="name"))
    return [u for u in users if _is_pos_user(u)]


def sync_pos_users(company=None, only=None):
    """Add cashier-capable users to a POS Profile when no profile lists them yet."""
    company = _company(company)
    if not company:
        return 0
    profile = frappe.db.get_value("POS Profile", {"company": company, "disabled": 0}, "name", order_by="creation asc")
    if not profile:
        return 0
    listed = set(frappe.get_all("POS Profile User", filters={"parenttype": "POS Profile"}, pluck="user"))
    todo = [u for u in (only or _pos_users()) if u not in listed and _is_pos_user(u)]
    if not todo:
        return 0
    doc = frappe.get_doc("POS Profile", profile)
    have_default = any(r.default for r in doc.get("applicable_for_users"))
    for u in todo:
        doc.append("applicable_for_users", {"user": u, "default": 0 if have_default else 1})
        have_default = True
    doc.save(ignore_permissions=True)
    return len(todo)


def _company_modes(company):
    """Cash/bank payment methods that already have an account for this company, cash first."""
    out = []
    for m in frappe.get_all("Mode of Payment", filters={"enabled": 1, "type": ["in", ["Cash", "Bank"]]},
                            fields=["name", "type"], order_by="type asc, creation asc"):
        if frappe.db.exists("Mode of Payment Account", {"parent": m.name, "company": company}):
            out.append(m)
    return out


def repair_profiles(company):
    """A profile with no usable payment methods is what makes the till say 'No payment methods'."""
    c = frappe.get_cached_doc("Company", company)
    for pname in frappe.get_all("POS Profile", filters={"company": company, "disabled": 0}, pluck="name"):
        doc = frappe.get_doc("POS Profile", pname)
        good = [r for r in doc.get("payments") if frappe.db.exists("Mode of Payment Account", {"parent": r.mode_of_payment, "company": company})]
        if good:
            continue
        _fix_accounts(company, c)
        _fix_modes(company, frappe.get_cached_doc("Company", company))
        modes = _company_modes(company)
        if not modes:
            continue
        doc.set("payments", [{"mode_of_payment": m.name, "default": 1 if i == 0 else 0} for i, m in enumerate(modes)])
        for f, v in (("write_off_account", c.write_off_account), ("write_off_cost_center", c.cost_center), ("cost_center", c.cost_center)):
            if doc.meta.has_field(f) and not doc.get(f) and v:
                doc.set(f, v)
        doc.save(ignore_permissions=True)


def ensure_pos(company=None):
    """Every company gets a ready POS Profile and every cashier-capable user is listed on one."""
    companies = [company] if company else frappe.get_all("Company", pluck="name", order_by="creation asc")
    made = 0
    for co in companies:
        try:
            if not frappe.db.exists("POS Profile", {"company": co, "disabled": 0}):
                apply(co)
                made += 1 if frappe.db.exists("POS Profile", {"company": co, "disabled": 0}) else 0
            repair_profiles(co)
            sync_pos_users(co)
            frappe.db.commit()
        except Exception:
            frappe.db.rollback()
            frappe.log_error(title=f"AMY POS: ensure_pos {co}")
    return made


def on_user_update(doc, method=None):
    """Hook: a new or edited user who can sell is listed on a POS Profile right away."""
    try:
        if _is_pos_user(doc.name):
            sync_pos_users(only=[doc.name])
    except Exception:
        frappe.log_error(title="AMY POS: user sync")
