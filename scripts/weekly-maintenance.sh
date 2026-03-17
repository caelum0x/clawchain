#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST="${MANIFEST:-}"
WEEK_ID="${WEEK_ID:-$(date -u +%Y%m%d)}"
DAY_UTC="${DAY_UTC:-$(date -u +%Y%m%d)}"
OUT_DIR="artifacts/stabilization"

mkdir -p "$OUT_DIR"

readiness_artifact="${OUT_DIR}/weekly-maintenance-readiness-${WEEK_ID}.json"
doctor_artifact="${OUT_DIR}/weekly-maintenance-doctor-${WEEK_ID}.json"
peers_artifact="${OUT_DIR}/weekly-maintenance-peers-${WEEK_ID}.json"
summary_artifact="${OUT_DIR}/weekly-maintenance-summary-${WEEK_ID}.json"

echo "--> Weekly maintenance: readiness"
set +e
(cd cmd/clawd && node ./dist/main.js readiness --json > "../../${readiness_artifact}")
readiness_status=$?
set -e

echo "--> Weekly maintenance: peer auto-maintenance"
set +e
if [[ -n "$MANIFEST" ]]; then
  (cd cmd/clawd && node ./dist/main.js peers auto-maintain --from-manifest "$MANIFEST" > "../../${peers_artifact}" 2>&1)
else
  (cd cmd/clawd && node ./dist/main.js peers auto-maintain > "../../${peers_artifact}" 2>&1)
fi
peers_status=$?
set -e

echo "--> Weekly maintenance: doctor diagnostics"
set +e
(cd cmd/clawd && node ./dist/main.js doctor --json > "../../${doctor_artifact}")
doctor_status=$?
set -e

echo "--> Weekly maintenance: evidence exports"
daily_status="passed"
weekly_status="passed"
if ! bash ./scripts/generate-daily-health-summary.sh "$DAY_UTC" >/dev/null; then
  daily_status="failed"
fi
if ! bash ./scripts/generate-weekly-readiness-cadence-report.sh "$WEEK_ID" >/dev/null; then
  weekly_status="failed"
fi

overall_status="passed"
if [[ "$readiness_status" -ne 0 || "$peers_status" -ne 0 || "$doctor_status" -ne 0 || "$daily_status" != "passed" || "$weekly_status" != "passed" ]]; then
  overall_status="failed"
fi

generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "$summary_artifact" <<JSON
{
  "week_id": "$WEEK_ID",
  "generated_at_utc": "$generated_at",
  "checks": {
    "readiness": {
      "status": $([[ "$readiness_status" -eq 0 ]] && echo "\"passed\"" || echo "\"failed\""),
      "artifact": "$readiness_artifact"
    },
    "peers_auto_maintain": {
      "status": $([[ "$peers_status" -eq 0 ]] && echo "\"passed\"" || echo "\"failed\""),
      "artifact": "$peers_artifact"
    },
    "doctor": {
      "status": $([[ "$doctor_status" -eq 0 ]] && echo "\"passed\"" || echo "\"failed\""),
      "artifact": "$doctor_artifact"
    },
    "daily_health_summary": {
      "status": "$daily_status",
      "artifact": "artifacts/stabilization/daily-health-summary-$DAY_UTC.json"
    },
    "weekly_readiness_cadence": {
      "status": "$weekly_status",
      "artifact": "artifacts/stabilization/weekly-readiness-cadence-$WEEK_ID.json"
    }
  },
  "overall_status": "$overall_status"
}
JSON

echo "weekly maintenance summary written to $summary_artifact"
if [[ "$overall_status" != "passed" ]]; then
  exit 1
fi
