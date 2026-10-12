#!/usr/bin/env bash
# Run ONCE on the server (as the frappe user) to fetch the apps into the bench.
#   BENCH_DIR=~/frappe-bench ./scripts/install-bench.sh
set -euo pipefail
BENCH_DIR="${BENCH_DIR:-$HOME/frappe-bench}"
AMY_POS_REPO="${AMY_POS_REPO:-https://github.com/ammardata88-cpu/amy_pos.git}"
cd "$BENCH_DIR"
[ -d apps/ksa_compliance ] || bench get-app --branch master https://github.com/lavaloon-eg/ksa_compliance.git
[ -d apps/amy_pos ]        || bench get-app "$AMY_POS_REPO"
bench build --app amy_pos
echo "apps ready: $(ls apps | tr '\n' ' ')"
