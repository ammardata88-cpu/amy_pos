import frappe


def on_session_creation(login_manager=None):
    """Send customers to the AMY console right after login (opt-in per site)."""
    if not frappe.conf.get("amy_console"):
        return
    if frappe.session.user in ("Administrator", "Guest"):
        return
    frappe.local.response["home_page"] = "/amy"
