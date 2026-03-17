#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash ./scripts/check-nightly-ops-pack.sh >/dev/null
bash ./scripts/check-weekly-incident-drill-pack.sh >/dev/null
bash ./scripts/check-monthly-governance-pack-gate.sh >/dev/null

echo "phase18 continuous operations gate passed."
