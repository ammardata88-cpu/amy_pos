# AMY POS

A focused ERPNext (Frappe v15) product by [AMY Tech](https://amytech.net):

- **Point of Sale** (cashier screen, walk-in customer, ready POS Profile)
- **Purchasing** module
- **Warehouses / Stock** module
- **Accounting** (kept, because e-invoicing is built on it)
- **Saudi ZATCA e-invoicing** through [`lavaloon-eg/ksa_compliance`](https://github.com/lavaloon-eg/ksa_compliance)
- AMY POS branding (name, logo, colours) instead of ERPNext

All other ERPNext modules are hidden per customer by the SaaS provisioner (industry `pos`).

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
