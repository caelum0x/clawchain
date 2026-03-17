#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DIGEST_PACK="${1:-artifacts/launch-control/weekly-closure-digest-pack-latest.json}"
STATUS_JSON="${2:-artifacts/launch-control/operator-status-snapshot-latest.json}"
STATUS_MD="${3:-artifacts/launch-control/operator-status-snapshot-latest.md}"

bash ./scripts/check-phase21-program-closure-gate.sh >/dev/null
bash ./scripts/check-phase22-closure-digest-gate.sh "$DIGEST_PACK" >/dev/null
bash ./scripts/check-phase22-operator-status-gate.sh "$STATUS_JSON" "$STATUS_MD" >/dev/null

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

digest_week="$(jq -r '.weekId // ""' "$DIGEST_PACK")"
status_week="$(jq -r '.weekId // ""' "$STATUS_JSON")"
summary_week="$(jq -r '.weekId // ""' artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)"
if [[ -z "$digest_week" || -z "$status_week" || -z "$summary_week" ]]; then
  echo "ERROR: missing weekId in closeout artifacts." >&2
  exit 1
fi
if [[ "$digest_week" != "$summary_week" || "$status_week" != "$summary_week" ]]; then
  echo "ERROR: Phase 22 closeout weekId mismatch across artifacts." >&2
  exit 1
fi

echo "phase22 program closeout gate passed."
