import frappe

from amy_pos.ops import asset_version

no_cache = 1


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/amy-login"
        raise frappe.Redirect
    context.no_cache = 1
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.v = asset_version()
    context.title = "AMY"
