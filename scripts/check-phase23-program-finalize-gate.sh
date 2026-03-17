#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ATTESTATION_FILE="${1:-artifacts/launch-control/weekly-closeout-attestation-latest.json}"
ROLLUP_FILE="${2:-artifacts/launch-control/weekly-history-rollup-latest.json}"

bash ./scripts/check-phase22-program-closeout-gate.sh >/dev/null
bash ./scripts/check-phase23-attestation-gate.sh "$ATTESTATION_FILE" >/dev/null
bash ./scripts/check-phase23-history-rollup-gate.sh "$ROLLUP_FILE" >/dev/null

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

att_week="$(jq -r '.weekId // ""' "$ATTESTATION_FILE")"
rollup_week="$(jq -r '.weekId // ""' "$ROLLUP_FILE")"
status_week="$(jq -r '.weekId // ""' artifacts/launch-control/operator-status-snapshot-latest.json)"
if [[ -z "$att_week" || -z "$rollup_week" || -z "$status_week" ]]; then
  echo "ERROR: missing weekId in phase23 finalize artifacts." >&2
  exit 1
fi
if [[ "$att_week" != "$status_week" || "$rollup_week" != "$status_week" ]]; then
  echo "ERROR: phase23 finalize weekId mismatch across artifacts." >&2
  exit 1
fi

echo "phase23 program finalize gate passed."
