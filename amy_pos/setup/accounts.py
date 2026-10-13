"""Who is who on a customer's site.

- Provider owner (hidden): one account named in site config `amy_owner` (an e-mail). It holds every role,
  never shows in the customer's user list, never counts toward the plan's user limit, and cannot be edited
  by the customer. It is also the only account (besides Administrator) allowed into the ERPNext desk.
- Customer admin: the e-mail the customer subscribed with. Created by `create_admin`; it counts toward the limit.
- Team: created by the customer admin from the console (regular users and cashiers).

    bench --site SITE set-config amy_owner owner@yourcompany.com
    bench --site SITE execute amy_pos.setup.accounts.ensure_owner          (also runs on every migrate)
    bench --site SITE set-password owner@yourcompany.com 'a-long-password'
    bench --site SITE execute amy_pos.setup.accounts.create_admin --kwargs '{"email":"customer@x.com","name":"Customer","password":"..."}'
"""
import frappe

NOT_ROLES = {"Administrator", "Guest", "All"}


def owner_email():
    v = frappe.conf.get("amy_owner")
    return (v or "").strip().lower() if isinstance(v, str) else ""


def is_owner(user=None):
    user = (user or frappe.session.user or "")
    return user == "Administrator" or (bool(owner_email()) and user.lower() == owner_email())


def hidden_users():
    return ["Administrator", "Guest"] + ([owner_email()] if owner_email() else [])


def ensure_owner():
    email = owner_email()
    if not email:
        return None
    if frappe.db.exists("User", email):
        doc = frappe.get_doc("User", email)
    else:
        doc = frappe.new_doc("User")
        doc.email = email
        doc.first_name = "AMY"
        doc.send_welcome_email = 0
        doc.user_type = "System User"
    doc.enabled = 1
    have = {r.role for r in doc.get("roles")}
    for r in frappe.get_all("Role", filters={"disabled": 0}, pluck="name"):
        if r not in NOT_ROLES and r not in have:
            doc.append("roles", {"role": r})
    doc.flags.ignore_permissions = True
    doc.flags.ignore_mandatory = True
    doc.save()
    frappe.db.commit()
    return email


def create_admin(email=None, name=None, password=None):
    """The customer's own admin: a console account (not an ERPNext user) with the e-mail they subscribed with."""
    from amy_pos.setup import account_doctype

    conf = frappe.conf.get("amy_subscription") or {}
    email = (email or (conf.get("admin_email") if isinstance(conf, dict) else "") or "").strip().lower()
    if not email:
        frappe.throw("email is required (or set admin_email in amy_subscription)")
    account_doctype.ensure()
    exists = frappe.db.exists("AMY Account", email)
    d = {"email": email, "first_name": name or email.split("@")[0], "amy_role": "admin", "enabled": 1, "password": password or ""}
    if exists and not password:
        d["password"] = ""
    if not exists and not password:
        d["password"] = frappe.generate_hash(length=16)  # they set their own through 'forgot password'
    save_account(d, actor="")
    frappe.db.commit()
    return email


# ------------------------------------------------------------------ console accounts (separate from ERPNext users)
import re

from frappe import _
from frappe.utils import cint, now_datetime

AC = "AMY Account"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _acc_pwd(acc, pwd):
    from frappe.utils.password import update_password

    update_password(acc, pwd, doctype=AC, fieldname="password")


def _shadow(acc, adopt=False, keep_roles=False):
    """The machine-managed ERPNext user behind an account. Created once, never given a usable ERPNext password."""
    from amy_pos import rest

    email = acc.name
    if frappe.db.exists("User", email):
        u = frappe.get_doc("User", email)
        if not cint(u.get("amy_account")) and not adopt:
            frappe.throw(_("This e-mail belongs to an ERPNext account. Use another e-mail for the console."))
        fresh = not cint(u.get("amy_account"))
    else:
        u = frappe.new_doc("User")
        u.email = email
        u.send_welcome_email = 0
        u.user_type = "System User"
        fresh = True
    u.first_name = acc.first_name or acc.full_name or email.split("@")[0]
    u.last_name = acc.last_name or None
    u.mobile_no = acc.mobile_no or None
    u.language = acc.language or "ar"
    u.enabled = cint(acc.enabled)
    u.amy_account = 1
    if not keep_roles:
        u.set("roles", [{"role": r} for r in rest._role_set(acc.role_key or "sales")])
    if fresh:
        u.new_password = frappe.generate_hash(length=48)
        u.flags.ignore_password_policy = True
    u.flags.ignore_permissions = True
    u.save()
    if not u.enabled:
        try:
            frappe.sessions.clear_sessions(email, force=True)
        except Exception:
            pass
    if acc.role_key == "cashier":
        rest._assign_profile(email, acc.pos_profile)
    return u


def list_accounts():
    from amy_pos import rest

    rows = frappe.get_all(AC, fields=["name", "full_name", "first_name", "last_name", "enabled", "mobile_no", "language", "last_login", "creation", "role_key", "pos_profile"],
                          order_by="creation asc", limit_page_length=500)
    for r in rows:
        r["amy_role"] = r.pop("role_key") or "sales"
    return rows


def save_account(d, actor):
    from amy_pos import plan, rest

    email = (d.get("email") or "").strip().lower()
    if not email or not EMAIL_RE.match(email):
        frappe.throw(_("Enter a valid email address"))
    if email in [x.lower() for x in hidden_users()]:
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    key = d.get("amy_role") or "sales"
    if key not in rest.ROLE_SETS:
        frappe.throw(_("Invalid role"))
    me = email == (actor or "").lower()
    if me and key != "admin":
        frappe.throw(_("You cannot remove your own admin access"))
    if me and not cint(d.get("enabled", 1)):
        frappe.throw(_("You cannot disable your own account"))
    pw = d.get("password") or ""
    if frappe.db.exists(AC, email):
        acc = frappe.get_doc(AC, email)
    else:
        if not pw:
            frappe.throw(_("Password is required"))
        plan.check_user_limit()
        acc = frappe.new_doc(AC)
        acc.email = email
    if pw and len(pw) < 8:
        frappe.throw(_("Password must be at least 8 characters"))
    first, last = (d.get("first_name") or "").strip(), (d.get("last_name") or "").strip()
    acc.first_name, acc.last_name = first or email.split("@")[0], last
    acc.full_name = (acc.first_name + " " + last).strip()
    acc.mobile_no = d.get("mobile_no") or None
    acc.language = d.get("language") or "ar"
    acc.role_key = key
    acc.pos_profile = d.get("pos_profile") or None
    acc.enabled = cint(d.get("enabled", 1))
    acc.flags.ignore_permissions = True
    acc.save()
    _shadow(acc)
    if pw:
        _acc_pwd(acc.name, pw)
    return {"name": acc.name}


def migrate_users(password=None):
    """One-time: turn the site's existing ERPNext 'console' users into console accounts (their user records are kept, so
    invoices keep their owner). Their ERPNext password is replaced by a random one; the console password is `password`
    (default: they must use 'forgot password')."""
    from amy_pos import rest
    from amy_pos.setup import account_doctype

    account_doctype.ensure()
    done = []
    for name in frappe.get_all("User", filters={"user_type": "System User", "name": ["not in", hidden_users()]}, pluck="name"):
        if frappe.db.exists(AC, name.lower()):
            continue
        u = frappe.get_doc("User", name)
        roles = [r.role for r in u.get("roles")]
        key = rest._infer_role(roles)
        acc = frappe.new_doc(AC)
        acc.email = name.lower()
        acc.first_name, acc.last_name, acc.full_name = u.first_name or name.split("@")[0], u.last_name or "", u.full_name or name
        acc.mobile_no, acc.language, acc.enabled = u.mobile_no, u.language or "ar", cint(u.enabled)
        acc.role_key = key if key != "custom" else "sales"
        acc.flags.ignore_permissions = True
        acc.insert()
        _shadow(acc, adopt=True, keep_roles=key == "custom")
        if password:
            _acc_pwd(acc.name, password)
        done.append(name)
    frappe.db.commit()
    return done
