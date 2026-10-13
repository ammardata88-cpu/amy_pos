"""The 'AMY Account' DocType: a person who signs in to the AMY console.

Console accounts are completely separate from ERPNext users: their own list, their own sign-in page and their own
password (stored by Frappe's hardened password store under this doctype, never on the User). Behind each account sits
one machine-managed ERPNext user that only carries roles for permission checks and the 'who sold it' trail; its
ERPNext password is random and unknown, so it can never sign in to ERPNext.
"""
import frappe

NAME = "AMY Account"
ROLES = "admin\nmanager\nsales\ncashier\npurchasing\nwarehouse\naccountant"


def ensure():
    if frappe.db.exists("DocType", NAME):
        return
    f = [
        ("email", "Data", "Email", 1), ("full_name", "Data", None, 0), ("first_name", "Data", None, 0), ("last_name", "Data", None, 0),
        ("mobile_no", "Data", None, 0), ("language", "Data", None, 0), ("role_key", "Select", ROLES, 0), ("pos_profile", "Link", "POS Profile", 0),
        ("enabled", "Check", None, 0), ("last_login", "Datetime", None, 0),
    ]
    frappe.get_doc({
        "doctype": "DocType", "name": NAME, "module": "AMY POS", "custom": 1, "autoname": "field:email", "title_field": "full_name",
        "sort_field": "modified", "sort_order": "DESC",
        "fields": [{"fieldname": n, "label": n.replace("_", " ").title(), "fieldtype": t, "options": o, "reqd": r, "unique": 1 if n == "email" else 0,
                    "default": "1" if n == "enabled" else None, "in_list_view": 1 if n in ("full_name", "role_key", "enabled") else 0}
                   for n, t, o, r in f],
        "permissions": [{"role": "System Manager", "read": 1, "report": 1}],
    }).insert(ignore_permissions=True)
