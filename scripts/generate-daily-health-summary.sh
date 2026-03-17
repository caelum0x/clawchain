#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DAY_UTC="${1:-$(date -u +%Y%m%d)}"
OUT_DIR="artifacts/stabilization"
HEALTH_OUT="${OUT_DIR}/health-check-${DAY_UTC}.json"
SMOKE_OUT="${OUT_DIR}/endpoint-smoke-${DAY_UTC}.json"
SUMMARY_OUT="${OUT_DIR}/daily-health-summary-${DAY_UTC}.json"

mkdir -p "$OUT_DIR"

health_status="passed"
smoke_status="passed"

if ! QUIET=1 bash ./scripts/health-check.sh >"$HEALTH_OUT"; then
  health_status="failed"
fi

if ! bash ./scripts/endpoint-smoke.sh >"$SMOKE_OUT"; then
  smoke_status="failed"
fi

overall_status="passed"
if [[ "$health_status" != "passed" || "$smoke_status" != "passed" ]]; then
  overall_status="failed"
fi

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat >"$SUMMARY_OUT" <<JSON
{
  "day_utc": "$DAY_UTC",
  "generated_at_utc": "$generated_at",
  "checks": {
    "health_check": {
      "status": "$health_status",
      "artifact": "$HEALTH_OUT"
    },
    "endpoint_smoke": {
      "status": "$smoke_status",
      "artifact": "$SMOKE_OUT"
    }
  },
  "overall_status": "$overall_status"
}
JSON

echo "daily health summary written to $SUMMARY_OUT"
if [[ "$overall_status" != "passed" ]]; then
  exit 1
fi
