import frappe


def on_session_creation(login_manager=None):
    """Send customers to the AMY console right after login (opt-in per site)."""
    if not frappe.conf.get("amy_console"):
        return
    from amy_pos.setup import accounts

    if frappe.session.user in ("Administrator", "Guest") or accounts.is_owner():
        return
    frappe.local.response["home_page"] = "/amy"


def boot_session(bootinfo):
    """Tell the desk whether this site runs the AMY console (used by amy-desk-guard.js)."""
    from amy_pos.setup import accounts

    # Only the provider (Administrator / amy_owner) may stay in the ERPNext desk.
    bootinfo.amy_console = 1 if frappe.conf.get("amy_console") and not accounts.is_owner() else 0
