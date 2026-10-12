#!/usr/bin/env bash
# Install AMY POS (+ ZATCA) on one existing ERPNext site.
#   ./scripts/install-site.sh <site>
set -euo pipefail
SITE="${1:?site name, e.g. demo.amytech.net}"
BENCH_DIR="${BENCH_DIR:-$HOME/frappe-bench}"
cd "$BENCH_DIR"
installed="$(bench --site "$SITE" list-apps)"
echo "$installed" | grep -q '^ksa_compliance' || bench --site "$SITE" install-app ksa_compliance
echo "$installed" | grep -q '^amy_pos'        || bench --site "$SITE" install-app amy_pos
bench --site "$SITE" execute amy_pos.setup.install.setup_company_defaults
[ "${AMY_CONSOLE:-1}" = "1" ] && bench --site "$SITE" set-config amy_console 1
bench --site "$SITE" clear-cache
echo "AMY POS is ready on $SITE"
