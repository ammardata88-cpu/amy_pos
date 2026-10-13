import os

import frappe

no_cache = 1


def _version():
    """Changes whenever a console file changes, so browsers never use stale code."""
    base = frappe.get_app_path("amy_pos", "public")
    m = 0
    for sub in ("css", "js"):
        d = os.path.join(base, sub)
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.startswith("amy"):
                    m = max(m, int(os.path.getmtime(os.path.join(d, f))))
    return m


def get_context(context):
    if frappe.session.user == "Guest":
        frappe.local.flags.redirect_location = "/amy-login"
        raise frappe.Redirect
    from amy_pos import rest

    if rest._is_cashier(frappe.get_roles()):
        frappe.local.flags.redirect_location = "/amy-pos"
        raise frappe.Redirect
    context.no_cache = 1
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.v = _version()
    context.title = "AMY"
