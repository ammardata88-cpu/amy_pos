"""AMY POS installer.

Runs after `bench --site <site> install-app amy_pos` and after every migrate.
Everything here is idempotent: running it twice changes nothing.
Company dependent parts (walk-in customer, POS Profile) run only when a
Company already exists; call `setup_company_defaults` again after the setup
wizard has created the company:

    bench --site <site> execute amy_pos.setup.install.setup_company_defaults
"""

import frappe

APP_NAME = "AMY POS"
LOGO = "/assets/amy_pos/images/amy-logo.png"
WALKIN = "Walk-in Customer"

# Modules a customer keeps. Everything else is hidden by the SaaS provisioner
# (industry "pos" in industries.json).
ALLOWED_MODULES = ["Accounts", "Selling", "Buying", "Stock"]


def after_install():
    apply_branding()
    try:
        from amy_pos import books
        books.ensure_custom_fields()
    except Exception:
        frappe.log_error(title="AMY POS: VAT class field")
    try:
        from amy_pos.setup import defaults
        defaults.apply()
    except Exception:
        frappe.log_error(title="AMY POS: default setup")
    frappe.db.commit()


def after_migrate():
    apply_branding()
    try:
        from amy_pos import books
        books.ensure_custom_fields()
    except Exception:
        frappe.log_error(title="AMY POS: VAT class field")
    try:
        from amy_pos.setup import defaults
        defaults.ensure_pos()
    except Exception:
        frappe.log_error(title="AMY POS: ensure POS")
    frappe.db.commit()


def _set(doc, **values):
    """Set only the fields that exist on this doctype version."""
    for key, value in values.items():
        if doc.meta.has_field(key):
            doc.set(key, value)


def apply_branding():
    try:
        ws = frappe.get_single("Website Settings")
        _set(ws, app_name=APP_NAME, app_logo=LOGO, favicon=LOGO, splash_image=LOGO)
        ws.save(ignore_permissions=True)
    except Exception:
        frappe.log_error(title="AMY POS: website branding")

    try:
        nb = frappe.get_single("Navbar Settings")
        _set(nb, app_logo=LOGO)
        if nb.meta.has_field("help_dropdown"):
            nb.set("help_dropdown", [])
        nb.save(ignore_permissions=True)
    except Exception:
        frappe.log_error(title="AMY POS: navbar branding")

    try:
        ss = frappe.get_single("System Settings")
        _set(ss, enable_onboarding=0)
        ss.save(ignore_permissions=True)
    except Exception:
        frappe.log_error(title="AMY POS: system settings")


def _default_company():
    return frappe.db.get_single_value("Global Defaults", "default_company") or frappe.db.get_value(
        "Company", {}, "name", order_by="creation asc"
    )


def setup_company_defaults(company=None):
    """Create a walk-in customer and a ready-to-use POS Profile."""
    company = company or _default_company()
    if not company:
        return "no company yet"
    out = []
    try:
        out.append(_walkin_customer())
        out.append(_pos_profile(company))
    except Exception:
        frappe.log_error(title="AMY POS: company defaults")
        out.append("error, see Error Log")
    frappe.db.commit()
    print(" | ".join(str(x) for x in out))
    return out


def _walkin_customer():
    if frappe.db.exists("Customer", WALKIN):
        return "customer exists"
    frappe.get_doc(
        {
            "doctype": "Customer",
            "customer_name": WALKIN,
            "customer_type": "Individual",
            "customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name") or "Individual",
            "territory": frappe.db.get_value("Territory", {"is_group": 0}, "name") or "All Territories",
        }
    ).insert(ignore_permissions=True)
    return "customer created"


def _pos_profile(company):
    if frappe.db.exists("POS Profile", {"company": company}):
        return "pos profile exists"

    c = frappe.get_cached_doc("Company", company)
    warehouse = frappe.db.get_value(
        "Warehouse", {"company": company, "is_group": 0, "disabled": 0}, "name", order_by="creation asc"
    )
    price_list = frappe.db.get_value("Price List", {"selling": 1, "enabled": 1}, "name")
    if not (warehouse and c.default_currency and price_list):
        return "pos profile skipped (warehouse/price list missing)"

    doc = frappe.get_doc(
        {
            "doctype": "POS Profile",
            "name": APP_NAME,
            "company": company,
            "customer": WALKIN,
            "warehouse": warehouse,
            "currency": c.default_currency,
            "selling_price_list": price_list,
            "write_off_account": c.write_off_account,
            "write_off_cost_center": c.cost_center,
            "payments": [{"mode_of_payment": "Cash", "default": 1}],
            "applicable_for_users": [{"user": "Administrator", "default": 1}],
        }
    )
    doc.insert(ignore_permissions=True)
    return "pos profile created"
