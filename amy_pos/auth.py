"""AMY sign-in helpers: password reset that never shows ERPNext screens.

Sessions still use Frappe's engine underneath (so permissions, audit and
lockout keep working), but every page and e-mail the customer sees is AMY's.
"""
import re

import frappe
from frappe import _
from frappe.utils import get_url

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


@frappe.whitelist(allow_guest=True, methods=["POST"])
def request_reset(user, lang="ar"):
    """Send an AMY-styled reset link. The reply is always the same, so it cannot
    be used to find out which e-mails have accounts."""
    user = (user or "").strip()[:140]
    lang = "en" if lang == "en" else "ar"
    if not user or user in ("Administrator", "Guest"):
        return {"ok": 1}
    name = frappe.db.get_value("User", {"name": user}) or frappe.db.get_value("User", {"email": user})
    if not name:
        return {"ok": 1}
    doc = frappe.get_doc("User", name)
    if not doc.enabled or doc.user_type != "System User" or name in ("Administrator", "Guest"):
        return {"ok": 1}
    try:
        link = doc._reset_password(send_email=False)
        key = re.search(r"key=([^&\s]+)", link or "")
        if not key:
            return {"ok": 1}
        url = get_url("/amy-reset?key=" + key.group(1))
        frappe.sendmail(recipients=[doc.email], subject=MAIL[lang][0],
                        message=_mail_html(lang, doc.first_name or doc.full_name or name, url), now=True)
    except Exception:
        frappe.log_error(title="AMY reset mail")
    return {"ok": 1}
