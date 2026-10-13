"""AMY sign-in helpers: password reset that never shows ERPNext screens.

Sessions still use Frappe's engine underneath (so permissions, audit and
lockout keep working), but every page and e-mail the customer sees is AMY's.
"""
import hashlib

import frappe
from frappe import _
from frappe.utils import cint, get_url, now_datetime

from amy_pos.setup import accounts

MAIL = {
    "ar": ("استعادة كلمة المرور - AMY", "أهلاً {name}،", "وصلنا طلب لتغيير كلمة المرور. اضغط الزر لاختيار كلمة جديدة. الرابط صالح لفترة محدودة.", "تغيير كلمة المرور",
           "لو لم تطلب هذا، تجاهل الرسالة وكلمة مرورك كما هي."),
    "en": ("Reset your AMY password", "Hello {name},", "We got a request to change your password. Use the button below to choose a new one. The link expires soon.", "Change password",
           "If you did not ask for this, ignore this message. Your password stays the same."),
}


def _mail_html(lang, name, link):
    t = MAIL[lang]
    d = "rtl" if lang == "ar" else "ltr"
    return (
        '<div dir="%s" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:auto;color:#111C26;line-height:1.7">'
        '<div style="font-weight:700;letter-spacing:.16em;font-size:17px;margin-bottom:18px">AMY</div>'
        '<p>%s</p><p>%s</p>'
        '<p style="margin:24px 0"><a href="%s" style="background:#0B7CA4;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">%s</a></p>'
        '<p style="color:#69757F;font-size:13px">%s</p></div>'
    ) % (d, frappe.utils.escape_html(t[1].format(name=name)), t[2], link, t[3], t[4])


def _cache():
    c = frappe.cache
    return c() if callable(c) else c


def _start_session(email):
    """Sign the browser in as the account's machine user (same as an OAuth sign-in does)."""
    lm = frappe.local.login_manager
    lm.user = email
    lm.post_login()
    frappe.db.set_value("AMY Account", email, "last_login", now_datetime(), update_modified=False)


def _bad():
    frappe.throw(_("Incorrect email or password"), frappe.AuthenticationError)


@frappe.whitelist(allow_guest=True, methods=["POST"])
def login(usr, pwd):
    """AMY console sign-in. Checks AMY Accounts only: ERPNext users cannot sign in here and console accounts cannot sign in to ERPNext."""
    from frappe.utils.password import check_password

    email = (usr or "").strip().lower()[:140]
    if not email or not pwd:
        _bad()
    cache, key = _cache(), "amy_fail:" + hashlib.sha1(email.encode()).hexdigest()
    if cint(cache.get_value(key) or 0) >= 8:
        frappe.throw(_("Too many attempts. Try again in a few minutes."), frappe.AuthenticationError)
    acc = frappe.db.get_value("AMY Account", email, ["name", "enabled"], as_dict=True)
    try:
        if not acc or not cint(acc.enabled):
            _bad()
        check_password(acc.name, pwd, doctype="AMY Account", fieldname="password")
    except frappe.AuthenticationError:
        cache.set_value(key, cint(cache.get_value(key) or 0) + 1, expires_in_sec=600)
        _bad()
    cache.delete_value(key)
    _start_session(acc.name)
    return {"ok": 1}


@frappe.whitelist(methods=["POST"])
def change_password(old_password, new_password):
    from frappe.utils.password import check_password

    email = frappe.session.user
    if not frappe.db.exists("AMY Account", email):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    try:
        check_password(email, old_password, doctype="AMY Account", fieldname="password")
    except frappe.AuthenticationError:
        frappe.throw(_("Your current password is not correct"))
    if len(new_password or "") < 8:
        frappe.throw(_("Password must be at least 8 characters"))
    accounts._acc_pwd(email, new_password)
    return {"ok": 1}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_reset(user, lang="ar"):
    """E-mail a reset link to a console account. The reply is always the same, so it cannot be used to find out who has an account."""
    email = (user or "").strip().lower()[:140]
    lang = "en" if lang == "en" else "ar"
    acc = frappe.db.get_value("AMY Account", email, ["name", "enabled", "first_name", "full_name"], as_dict=True) if email else None
    if not acc or not cint(acc.enabled):
        return {"ok": 1}
    try:
        token = frappe.generate_hash(length=40)
        _cache().set_value("amy_reset:" + token, acc.name, expires_in_sec=7200)
        url = get_url("/amy-reset?key=" + token)
        frappe.sendmail(recipients=[acc.name], subject=MAIL[lang][0],
                        message=_mail_html(lang, acc.first_name or acc.full_name or acc.name, url), now=True)
    except Exception:
        frappe.log_error(title="AMY reset mail")
    return {"ok": 1}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def reset_password(key, new_password):
    cache = _cache()
    email = cache.get_value("amy_reset:" + (key or ""))
    if not email or not frappe.db.exists("AMY Account", email):
        frappe.throw(_("This link has expired. Ask for a new one."))
    if len(new_password or "") < 8:
        frappe.throw(_("Password must be at least 8 characters"))
    accounts._acc_pwd(email, new_password)
    cache.delete_value("amy_reset:" + key)
    _start_session(email)
    return {"ok": 1}
