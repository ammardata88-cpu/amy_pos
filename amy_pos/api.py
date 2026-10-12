"""AMY console data. One call returns everything the dashboard needs.

Every block is optional: if the user lacks permission, or an app (ZATCA,
POS Next) is not installed, the block comes back as null and the UI hides it.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_first_day, getdate, nowdate


def _company():
    return frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
        "Global Defaults", "default_company"
    )


def _safe(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except frappe.PermissionError:
        return None
    except Exception:
        frappe.log_error(title="AMY console: " + getattr(fn, "__name__", "block"))
        return None


def _sum(doctype, field, filters):
    if not frappe.has_permission(doctype, "read"):
        raise frappe.PermissionError
    rows = frappe.get_list(doctype, filters=filters, fields=[f"sum({field}) as v", "count(name) as n"])
    return {"value": flt(rows[0].v) if rows else 0, "count": cint(rows[0].n) if rows else 0}


def _sales_totals(company, today, month_start):
    base = {"docstatus": 1, "company": company}
    return {
        "today": _sum("Sales Invoice", "base_grand_total", {**base, "posting_date": today}),
        "month": _sum("Sales Invoice", "base_grand_total", {**base, "posting_date": [">=", month_start]}),
        "receivable": _sum(
            "Sales Invoice", "outstanding_amount", {**base, "outstanding_amount": [">", 0]}
        ),
    }


def _purchase_totals(company, month_start):
    base = {"docstatus": 1, "company": company}
    return {
        "month": _sum("Purchase Invoice", "base_grand_total", {**base, "posting_date": [">=", month_start]}),
        "payable": _sum(
            "Purchase Invoice", "outstanding_amount", {**base, "outstanding_amount": [">", 0]}
        ),
    }


def _stock_value():
    if not frappe.has_permission("Bin", "read"):
        raise frappe.PermissionError
    rows = frappe.get_list("Bin", fields=["sum(stock_value) as v"])
    return flt(rows[0].v) if rows else 0


def _series(company, today, days=14):
    if not frappe.has_permission("Sales Invoice", "read"):
        raise frappe.PermissionError
    start = add_days(today, -(days - 1))
    rows = frappe.get_list(
        "Sales Invoice",
        filters={"docstatus": 1, "company": company, "posting_date": ["between", [start, today]]},
        fields=["posting_date", "sum(base_grand_total) as total"],
        group_by="posting_date",
        order_by="posting_date asc",
        limit_page_length=days + 5,
    )
    by_day = {str(r.posting_date): flt(r.total) for r in rows}
    out = []
    for i in range(days):
        d = str(add_days(start, i))
        out.append({"date": d, "total": by_day.get(d, 0)})
    return out


def _top_items(company, month_start):
    if not frappe.has_permission("Sales Invoice", "read"):
        raise frappe.PermissionError
    return frappe.db.sql(
        """
        select sii.item_code, max(sii.item_name) as item_name,
               sum(sii.qty) as qty, sum(sii.base_net_amount) as amount
        from `tabSales Invoice Item` sii
        join `tabSales Invoice` si on si.name = sii.parent
        where si.docstatus = 1 and si.company = %s and si.posting_date >= %s
        group by sii.item_code
        order by amount desc
        limit 5
        """,
        (company, month_start),
        as_dict=True,
    )


def _low_stock():
    if not frappe.has_permission("Bin", "read"):
        raise frappe.PermissionError
    rows = frappe.db.sql(
        """
        select b.item_code, i.item_name, b.warehouse, b.actual_qty, ir.warehouse_reorder_level as level
        from `tabBin` b
        join `tabItem` i on i.name = b.item_code and i.disabled = 0 and i.is_stock_item = 1
        left join `tabItem Reorder` ir on ir.parent = b.item_code and ir.warehouse = b.warehouse
        where b.actual_qty <= coalesce(ir.warehouse_reorder_level, 0)
        order by b.actual_qty asc
        limit 6
        """,
        as_dict=True,
    )
    return rows


def _recent_invoices(company):
    if not frappe.has_permission("Sales Invoice", "read"):
        raise frappe.PermissionError
    rows = frappe.get_list(
        "Sales Invoice",
        filters={"docstatus": ["<", 2], "company": company},
        fields=["name", "customer_name", "posting_date", "base_grand_total", "status", "is_pos"],
        order_by="creation desc",
        limit_page_length=8,
    )
    zatca = _zatca_status([r.name for r in rows])
    for r in rows:
        r["zatca"] = (zatca or {}).get(r.name)
    return rows


def _zatca_status(names):
    """Integration status per invoice from ksa_compliance, if installed."""
    if "ksa_compliance" not in frappe.get_installed_apps() or not names:
        return None
    dt = "Sales Invoice Additional Fields"
    if not frappe.db.exists("DocType", dt):
        return None
    meta = frappe.get_meta(dt)
    if not (meta.has_field("sales_invoice") and meta.has_field("integration_status")):
        return None
    rows = frappe.get_all(
        dt,
        filters={"sales_invoice": ["in", names], "invoice_doctype": "Sales Invoice", "is_latest": 1},
        fields=["sales_invoice", "integration_status"],
    )
    return {r.sales_invoice: r.integration_status for r in rows}


def _zatca_summary(company, month_start):
    if "ksa_compliance" not in frappe.get_installed_apps():
        return None
    dt = "Sales Invoice Additional Fields"
    if not frappe.db.exists("DocType", dt):
        return None
    meta = frappe.get_meta(dt)
    if not meta.has_field("integration_status"):
        return None
    rows = frappe.get_all(
        dt,
        filters={"creation": [">=", month_start], "is_latest": 1},
        fields=["integration_status as status", "count(name) as n"],
        group_by="integration_status",
    )
    return {(r.status or "Pending"): cint(r.n) for r in rows}


@frappe.whitelist()
def dashboard():
    if frappe.session.user == "Guest":
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    company = _company()
    today = nowdate()
    month_start = str(get_first_day(getdate(today)))
    currency = frappe.get_cached_value("Company", company, "default_currency") if company else None
    apps = set(frappe.get_installed_apps())

    return {
        "company": company,
        "currency": currency,
        "user": frappe.get_cached_value("User", frappe.session.user, "first_name") or frappe.session.user,
        "today": today,
        "sales": _safe(_sales_totals, company, today, month_start),
        "purchases": _safe(_purchase_totals, company, month_start),
        "stock_value": _safe(_stock_value),
        "series": _safe(_series, company, today),
        "top_items": _safe(_top_items, company, month_start),
        "low_stock": _safe(_low_stock),
        "recent": _safe(_recent_invoices, company),
        "zatca": _safe(_zatca_summary, company, month_start),
        "apps": {"pos_next": "pos_next" in apps, "zatca": "ksa_compliance" in apps},
    }
