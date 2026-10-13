# AMY POS

A focused ERPNext (Frappe v15) product by [AMY Tech](https://amytech.net):

- **Point of Sale** (cashier screen, walk-in customer, ready POS Profile)
- **Purchasing** module
- **Warehouses / Stock** module
- **Accounting** (kept, because e-invoicing is built on it)
- **Saudi ZATCA e-invoicing** through [`lavaloon-eg/ksa_compliance`](https://github.com/lavaloon-eg/ksa_compliance)
- AMY POS branding (name, logo, colours) instead of ERPNext

All other ERPNext modules are hidden per customer by the SaaS provisioner (industry `pos`).

## AMY console (`/amy`)

A new, simple home screen for small and medium businesses, served by the app itself:
today's and month's sales, purchases, receivables/payables, stock value, 14-day sales chart,
top sellers, low stock, ZATCA status, recent invoices and one-tap actions (POS Next, invoices, stock, reports).
Arabic and English, mobile friendly. Data comes from `amy_pos.api.dashboard` (permission aware,
every block hides itself if the user lacks access or an app is missing).

Customers land on it after login when the site has `"amy_console": 1` in `site_config.json`
(`scripts/install-site.sh` sets it; use `AMY_CONSOLE=0` to skip). Administrator keeps `/app`.

## Sign-in (separate from ERPNext)

AMY has its own pages: `/amy-login` and `/amy-reset` (password reset by an AMY-styled e-mail).
ERPNext's `/login` and `/update-password` redirect there. Sessions, roles and permissions still run on
Frappe underneath. On sites with `amy_console: 1`, users without System Manager are sent from `/app` to `/amy`.
Sign-in and reset are rate limited per IP (`amy_pos/guard.py`).

## AMY till

`/amy-pos` is a one-screen point of sale (items, cart, customer, discount, split payment, hold, receipt, today's totals). It creates normal Sales Invoices (`is_pos`), so stock, accounts and ZATCA behave as in the console. It prepares its own POS Profile and lists the user automatically; POS Next is no longer needed.

## Install on a bench (once)

```bash
cd ~/frappe-bench
bench get-app --branch master https://github.com/lavaloon-eg/ksa_compliance.git
bench get-app https://github.com/ammardata88-cpu/amy_pos.git
bench build --app amy_pos
```

or simply: `./scripts/install-bench.sh`

## Install on a site

```bash
./scripts/install-site.sh <site>
```

This installs `ksa_compliance` and `amy_pos`, creates the *Walk-in Customer*
and the *AMY POS* POS Profile (when the company already exists) and clears the cache.

## ZATCA

Each company completes the ZATCA onboarding once from inside the system
(`ZATCA Business Settings` wizard) using the OTP from the Fatoora portal. This step cannot be automated.

## Layout

```
amy_pos/hooks.py            app metadata, branding assets, install hooks
amy_pos/setup/install.py    branding + company defaults (idempotent)
amy_pos/public/             logo and CSS
scripts/                    bench and site installers
```

License: MIT
