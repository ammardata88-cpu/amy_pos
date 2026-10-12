app_name = "amy_pos"
app_title = "AMY POS"
app_publisher = "AMY Tech"
app_description = "Point of Sale, Purchasing and Warehouses with Saudi ZATCA e-invoicing, by AMY Tech"
app_email = "info@amytech.net"
app_license = "mit"

# ERPNext is the engine. ksa_compliance (ZATCA) is installed next to it by
# scripts/install-site.sh so that its own setup wizard stays untouched.
required_apps = ["erpnext"]

app_logo_url = "/assets/amy_pos/images/logo.svg"

add_to_apps_screen = [
    {
        "name": "amy_pos",
        "logo": "/assets/amy_pos/images/logo.svg",
        "title": "AMY POS",
        "route": "/app",
    }
]

app_include_css = ["/assets/amy_pos/css/amy_pos.css"]

website_context = {
    "favicon": "/assets/amy_pos/images/logo.svg",
    "splash_image": "/assets/amy_pos/images/logo.svg",
}

after_install = "amy_pos.setup.install.after_install"
after_migrate = "amy_pos.setup.install.after_migrate"

# Customers land on the AMY console after login when the site has `amy_console: 1`
# in site_config.json (set by scripts/install-site.sh). Administrator keeps /app.
on_session_creation = "amy_pos.setup.login.on_session_creation"

# Throttle sign-in, password reset and the AMY API (see guard.py).
before_request = ["amy_pos.guard.before_request"]
