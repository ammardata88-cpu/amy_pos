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
    """The customer's own admin (their subscription e-mail). Safe to run twice."""
    from amy_pos import rest

    conf = frappe.conf.get("amy_subscription") or {}
    email = (email or (conf.get("admin_email") if isinstance(conf, dict) else "") or "").strip().lower()
    if not email:
        frappe.throw("email is required (or set admin_email in amy_subscription)")
    doc = frappe.get_doc("User", email) if frappe.db.exists("User", email) else frappe.new_doc("User")
    if doc.is_new():
        doc.email = email
        doc.first_name = name or email.split("@")[0]
        doc.send_welcome_email = 0
        doc.user_type = "System User"
    doc.enabled = 1
    have = {r.role for r in doc.get("roles")}
    for r in rest._role_set("admin"):
        if r not in have:
            doc.append("roles", {"role": r})
    if password:
        doc.new_password = password
    doc.flags.ignore_permissions = True
    doc.save()
    frappe.db.commit()
    return email
