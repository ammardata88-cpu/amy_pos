"""The 'AMY Shift' DocType (a cashier's work session at the till). Created from code, idempotent."""
import frappe

NAME = "AMY Shift"


def ensure():
    if frappe.db.exists("DocType", NAME):
        return
    cur = "Currency"
    f = [
        ("user", "Link", "User", 1), ("pos_profile", "Link", "POS Profile", 0), ("company", "Link", "Company", 0),
        ("status", "Select", "Open\nClosed", 0), ("opened_at", "Datetime", None, 0), ("opening_cash", cur, None, 0),
        ("closed_at", "Datetime", None, 0), ("invoice_count", "Int", None, 0), ("cash_sales", cur, None, 0),
        ("other_sales", cur, None, 0), ("expected_cash", cur, None, 0), ("counted_cash", cur, None, 0),
        ("difference", cur, None, 0), ("cash_left", cur, None, 0), ("cash_to_deposit", cur, None, 0), ("note", "Small Text", None, 0),
    ]
    frappe.get_doc({
        "doctype": "DocType", "name": NAME, "module": "AMY POS", "custom": 1, "autoname": "format:SHIFT-{YYYY}-{#####}",
        "title_field": "user", "sort_field": "modified", "sort_order": "DESC", "track_changes": 0,
        "fields": [{"fieldname": n, "label": n.replace("_", " ").title(), "fieldtype": t, "options": o, "in_list_view": 1 if n in ("user", "status", "opened_at") else 0,
                    "read_only": 1, "search_index": 1 if n in ("user", "status") else 0} for n, t, o, _x in f],
        "permissions": [{"role": r, "read": 1, "report": 1, "export": 1} for r in ("System Manager", "Accounts Manager", "Sales Manager")],
    }).insert(ignore_permissions=True)
