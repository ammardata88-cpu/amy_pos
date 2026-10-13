"""Request throttling for the AMY console.

Hooked in as ``before_request``. It is a small fixed-window counter kept in
Redis, so it works across all gunicorn workers and costs one INCR per request.

  * sign-in and password reset: strict, per client IP (stops password guessing
    and reset-mail flooding)
  * AMY API: generous per user (stops runaway scripts or a stuck browser tab),
    stricter for writes
"""
import time

import frappe
from frappe import _

# bucket -> (max requests, window seconds)
LIMITS = {
    "login": (12, 300),
    "reset": (5, 900),
    "read": (600, 60),
    "write": (120, 60),
    "heavy": (30, 60),
}
LOGIN_PATHS = {"/api/method/login", "/login"}
RESET_PATHS = {"/api/method/frappe.core.doctype.user.user.reset_password", "/api/method/amy_pos.auth.request_reset",
               "/api/method/frappe.core.doctype.user.user.update_password"}
WRITES = {
    "save_doc", "submit_doc", "cancel_doc", "delete_doc", "make_return", "make_payment",
    "make_from", "save_user", "quick_setup", "expense_save", "zatca_save", "zatca_step",
    "pos_ready", "quick_customer", "checkout", "coa_save", "coa_delete", "coa_import", "tax_type_save", "tax_type_delete", "industry_set",
}
HEAVY = {"today", "dashboard", "run_report", "zatca_step", "quick_setup", "vat_return", "coa_tree", "coa_import"}


def _redis():
    c = frappe.cache
    return c() if callable(c) else c


def _hit(bucket, ident):
    limit, window = LIMITS[bucket]
    r = _redis()
    key = r.make_key("amyrl:%s:%s:%d" % (bucket, ident, int(time.time() // window)))
    try:
        n = r.incr(key)
        if n == 1:
            r.expire(key, window + 5)
    except Exception:
        return  # never block users because Redis hiccuped
    if n > limit:
        frappe.local.response["http_status_code"] = 429
        frappe.throw(_("Too many requests. Please wait a moment and try again."), frappe.TooManyRequestsError)


def _ip():
    return getattr(frappe.local, "request_ip", None) or "0"


def before_request():
    req = getattr(frappe.local, "request", None)
    if not req or req.method not in ("POST", "GET"):
        return
    path = req.path or ""
    if req.method == "POST" and path in LOGIN_PATHS:
        return _hit("login", _ip())
    if req.method == "POST" and path in RESET_PATHS:
        return _hit("reset", _ip())
    if path.startswith("/api/method/amy_pos.") and path not in RESET_PATHS:
        fn = path.rsplit(".", 1)[-1]
        who = frappe.session.user if frappe.session.user != "Guest" else _ip()
        if fn in HEAVY:
            _hit("heavy", who)
        _hit("write" if fn in WRITES else "read", who)
