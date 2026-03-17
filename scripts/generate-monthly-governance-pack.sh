#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MONTH_ID="${MONTH_ID:-$(date -u +%Y-%m)}"
OUT_DIR="${OUT_DIR:-artifacts/governance}"

mkdir -p "$OUT_DIR"

report_path="artifacts/monthly-reports/${MONTH_ID}.md"
decision_log_path="docs/governance-decision-log.md"
gate_status="passed"
gate_output=""
if ! gate_output="$(bash ./scripts/check-monthly-report-gate.sh "$MONTH_ID" 2>&1)"; then
  gate_status="failed"
fi

closure_status="closed"
if [[ "$gate_status" != "passed" ]]; then
  closure_status="attention_required"
fi

summary_artifact="${OUT_DIR}/monthly-governance-pack-${MONTH_ID}.json"
latest_artifact="${OUT_DIR}/monthly-governance-pack-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg monthId "$MONTH_ID" \
  --arg reportPath "$report_path" \
  --arg decisionLogPath "$decision_log_path" \
  --arg gateStatus "$gate_status" \
  --arg gateOutput "$gate_output" \
  --arg closureStatus "$closure_status" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    monthId: $monthId,
    governanceReportPath: $reportPath,
    governanceDecisionLogPath: $decisionLogPath,
    monthlyReportGateStatus: $gateStatus,
    monthlyReportGateOutput: $gateOutput,
    closureStatus: $closureStatus
  }
  ' >"$summary_artifact"

cp "$summary_artifact" "$latest_artifact"

echo "monthly governance pack written."
echo "  summary: $summary_artifact"
echo "  latest:  $latest_artifact"
