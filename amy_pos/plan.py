"""Subscription info for the AMY console.

The provider (you) sets the customer's plan per site with
  bench --site SITE set-config amy_subscription '{"plan":"pro","plan_name":["الاحترافية","Professional"],
      "start":"2026-10-13","end":"2027-10-12","users":10,"price":199,"currency":"SAR","period":"month"}' --parse
Optional: amy_support = {"whatsapp": "9665...", "email": "support@amytech.net"}.
With no config the site shows an open plan with no expiry (nothing is ever locked).
"""
import frappe

from amy_pos.setup import accounts
from frappe.utils import cint, date_diff, flt, getdate, nowdate

FEATURES = [
    ["مبيعات ومشتريات ومخزون", "Sales, purchasing and inventory"],
    ["كاشير سريع بشاشة واحدة", "One-screen point of sale"],
    ["محاسبة وتقارير وإقرار الضريبة", "Accounting, reports and VAT return"],
    ["فوترة إلكترونية (اختيارية)", "E-invoicing (optional)"],
    ["نسخ احتياطي ودعم فني", "Backups and support"],
]


def _d(v):
    try:
        return getdate(v) if v else None
    except Exception:
        return None


def summary():
    """Small dict used by bootstrap (banner) and by the full page."""
    conf = frappe.conf.get("amy_subscription") or {}
    if not isinstance(conf, dict):
        conf = {}
    end, start = _d(conf.get("end")), _d(conf.get("start"))
    left = date_diff(end, nowdate()) if end else None
    if conf.get("suspended"):
        status = "suspended"
    elif left is None:
        status = "active"
    elif left < 0:
        status = "expired"
    elif left <= 14:
        status = "expiring"
    else:
        status = "active"
    return {"status": status, "days_left": left, "end": str(end) if end else None, "start": str(start) if start else None,
            "configured": bool(conf)}


def users_used():
    """Enabled console accounts (ERPNext users and the provider's hidden owner never count)."""
    return frappe.db.count("AMY Account", {"enabled": 1}) if frappe.db.exists("DocType", "AMY Account") else 0


def users_limit():
    conf = frappe.conf.get("amy_subscription") or {}
    return cint(conf.get("users")) if isinstance(conf, dict) else 0


@frappe.whitelist()
def subscription():
    frappe.only_for("System Manager")
    conf = frappe.conf.get("amy_subscription") or {}
    if not isinstance(conf, dict):
        conf = {}
    s = summary()
    start, end = _d(conf.get("start")), _d(conf.get("end"))
    total = date_diff(end, start) if (start and end) else None
    sup = frappe.conf.get("amy_support") or {}
    if not isinstance(sup, dict):
        sup = {}
    name = conf.get("plan_name")
    if not (isinstance(name, (list, tuple)) and len(name) == 2):
        name = ["الباقة الأساسية", "Standard plan"] if not name else [str(name), str(name)]
    feats = conf.get("features")
    if not (isinstance(feats, list) and feats):
        feats = FEATURES
    s.update({
        "plan": conf.get("plan") or "standard", "plan_name": list(name), "total_days": total,
        "users_used": users_used(), "users_limit": cint(conf.get("users")),
        "price": flt(conf.get("price")) if conf.get("price") is not None else None,
        "currency": conf.get("currency") or "SAR", "period": conf.get("period") or "month",
        "features": feats,
        "support": {"whatsapp": sup.get("whatsapp") or "", "email": sup.get("email") or "info@amytech.net"},
    })
    return s


def check_user_limit():
    """Called before a NEW user is created. A limit of 0/unset means unlimited."""
    lim = users_limit()
    if lim and users_used() >= lim:
        frappe.throw(frappe._("Your plan allows {0} users. Contact us to upgrade.").format(lim))
