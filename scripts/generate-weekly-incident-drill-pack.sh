#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEEK_ID="${WEEK_ID:-$(date -u +%G-W%V)}"
OUT_DIR="${OUT_DIR:-artifacts/operations}"
FAIL_ON_DRILL_ERROR="${FAIL_ON_DRILL_ERROR:-0}"

mkdir -p "$OUT_DIR"

log_artifact="${OUT_DIR}/weekly-incident-drill-${WEEK_ID}.log"
summary_artifact="${OUT_DIR}/weekly-incident-drill-pack-${WEEK_ID}.json"
latest_artifact="${OUT_DIR}/weekly-incident-drill-pack-latest.json"

drill_status="passed"
if ! bash ./scripts/incident-drill.sh all >"$log_artifact" 2>&1; then
  drill_status="failed"
fi

passed_count="$(rg -o 'Passed:\s*[0-9]+' "$log_artifact" | tail -n1 | rg -o '[0-9]+' || echo "0")"
failed_count="$(rg -o 'Failed:\s*[0-9]+' "$log_artifact" | tail -n1 | rg -o '[0-9]+' || echo "0")"

closure_status="closed"
if [[ "$drill_status" != "passed" ]]; then
  closure_status="attention_required"
fi

cat >"$summary_artifact" <<JSON
{
  "generatedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "weekId": "$WEEK_ID",
  "drill": {
    "status": "$drill_status",
    "passedCount": $passed_count,
    "failedCount": $failed_count,
    "logArtifact": "$log_artifact"
  },
  "closureStatus": "$closure_status"
}
JSON

cp "$summary_artifact" "$latest_artifact"

echo "weekly incident drill pack written."
echo "  summary: $summary_artifact"
echo "  latest:  $latest_artifact"

if [[ "$FAIL_ON_DRILL_ERROR" == "1" && "$drill_status" != "passed" ]]; then
  exit 1
fi
