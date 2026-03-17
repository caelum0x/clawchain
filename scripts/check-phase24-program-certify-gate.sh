#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUDIT_LOG_FILE="${1:-artifacts/launch-control/weekly-audit-log-latest.json}"
SIGNOFF_JSON="${2:-artifacts/launch-control/weekly-signoff-manifest-latest.json}"
SIGNOFF_MD="${3:-artifacts/launch-control/weekly-signoff-manifest-latest.md}"

bash ./scripts/check-phase23-program-finalize-gate.sh >/dev/null
bash ./scripts/check-phase24-audit-log-gate.sh "$AUDIT_LOG_FILE" >/dev/null
bash ./scripts/check-phase24-signoff-manifest-gate.sh "$SIGNOFF_JSON" "$SIGNOFF_MD" >/dev/null

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

audit_week="$(jq -r '.weekId // ""' "$AUDIT_LOG_FILE")"
signoff_week="$(jq -r '.weekId // ""' "$SIGNOFF_JSON")"
att_week="$(jq -r '.weekId // ""' artifacts/launch-control/weekly-closeout-attestation-latest.json)"
if [[ -z "$audit_week" || -z "$signoff_week" || -z "$att_week" ]]; then
  echo "ERROR: missing weekId in phase24 certification artifacts." >&2
  exit 1
fi
if [[ "$audit_week" != "$att_week" || "$signoff_week" != "$att_week" ]]; then
  echo "ERROR: phase24 certification weekId mismatch across artifacts." >&2
  exit 1
fi

echo "phase24 program certify gate passed."
