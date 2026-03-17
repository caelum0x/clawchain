#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LEDGER_FILE="${1:-artifacts/launch-control/weekly-notarization-ledger-latest.json}"
SNAPSHOT_JSON="${2:-artifacts/launch-control/weekly-immutable-snapshot-latest.json}"
SNAPSHOT_MD="${3:-artifacts/launch-control/weekly-notarization-receipt-latest.md}"

bash ./scripts/check-phase24-program-certify-gate.sh >/dev/null
bash ./scripts/check-phase25-notarization-ledger-gate.sh "$LEDGER_FILE" >/dev/null
bash ./scripts/check-phase25-immutable-snapshot-gate.sh "$SNAPSHOT_JSON" "$SNAPSHOT_MD" >/dev/null

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

ledger_week="$(jq -r '.weekId // ""' "$LEDGER_FILE")"
snapshot_week="$(jq -r '.weekId // ""' "$SNAPSHOT_JSON")"
signoff_week="$(jq -r '.weekId // ""' artifacts/launch-control/weekly-signoff-manifest-latest.json)"
if [[ -z "$ledger_week" || -z "$snapshot_week" || -z "$signoff_week" ]]; then
  echo "ERROR: missing weekId in phase25 artifacts." >&2
  exit 1
fi
if [[ "$ledger_week" != "$signoff_week" || "$snapshot_week" != "$signoff_week" ]]; then
  echo "ERROR: phase25 artifact weekId mismatch." >&2
  exit 1
fi

echo "phase25 program notarize gate passed."
