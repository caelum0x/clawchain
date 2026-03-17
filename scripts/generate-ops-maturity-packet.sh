#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
SUMMARY_FILE="${SUMMARY_FILE:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"
TREND_FILE="${TREND_FILE:-artifacts/launch-control/executive-trend-7d-latest.json}"
CHECKLIST_FILE="${CHECKLIST_FILE:-artifacts/launch-control/ops-remediation-checklist-latest.json}"
BUNDLE_FILE="${BUNDLE_FILE:-artifacts/launch-control/ops-remediation-bundle-latest.json}"
RELEASE_EVIDENCE_FILE="${RELEASE_EVIDENCE_FILE:-artifacts/release-evidence.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$SUMMARY_FILE" "$TREND_FILE" "$CHECKLIST_FILE" "$BUNDLE_FILE" "$RELEASE_EVIDENCE_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing ops maturity input '$file'." >&2
    exit 1
  fi
done

mkdir -p "$OUT_DIR"

week_id="$(jq -r '.weekId // ""' "$SUMMARY_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: weekly summary missing weekId." >&2
  exit 1
fi

ops_signal_status="failed"
if bash ./scripts/check-phase20-ops-signal-gate.sh >/dev/null; then
  ops_signal_status="passed"
fi

recovery_loop_status="failed"
if bash ./scripts/check-phase20-recovery-loop-gate.sh >/dev/null; then
  recovery_loop_status="passed"
fi

product_complete_status="failed"
if bash ./scripts/check-release-evidence-drift.sh "$RELEASE_EVIDENCE_FILE" >/dev/null \
  && jq -e '
    .overall_status == "passed"
    and (.gates.protocol_sanity == "passed")
    and (.gates.mainnet_readiness == "passed")
    and (.gates.phase17_public_testnet_stability == "passed")
    and (.gates.public_testnet_reproducibility == "passed")
    and ((.gates.one_command_agent == "passed") or (.gates.one_command_agent == "not_recorded"))
  ' "$RELEASE_EVIDENCE_FILE" >/dev/null; then
  product_complete_status="passed"
fi

overall_status="passed"
if [[ "$ops_signal_status" != "passed" || "$recovery_loop_status" != "passed" || "$product_complete_status" != "passed" ]]; then
  overall_status="failed"
fi

out_file="${OUT_DIR}/ops-maturity-packet-${week_id}.json"
latest_file="${OUT_DIR}/ops-maturity-packet-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg summaryFile "$SUMMARY_FILE" \
  --arg trendFile "$TREND_FILE" \
  --arg checklistFile "$CHECKLIST_FILE" \
  --arg bundleFile "$BUNDLE_FILE" \
  --arg releaseEvidenceFile "$RELEASE_EVIDENCE_FILE" \
  --arg opsSignalStatus "$ops_signal_status" \
  --arg recoveryLoopStatus "$recovery_loop_status" \
  --arg productCompleteStatus "$product_complete_status" \
  --arg overallStatus "$overall_status" \
  --argjson summary "$(cat "$SUMMARY_FILE")" \
  --argjson trend "$(cat "$TREND_FILE")" \
  --argjson checklist "$(cat "$CHECKLIST_FILE")" \
  --argjson bundle "$(cat "$BUNDLE_FILE")" \
  --argjson releaseEvidence "$(cat "$RELEASE_EVIDENCE_FILE")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    inputs: {
      summaryFile: $summaryFile,
      trendFile: $trendFile,
      checklistFile: $checklistFile,
      bundleFile: $bundleFile,
      releaseEvidenceFile: $releaseEvidenceFile
    },
    gateStatus: {
      phase20OpsSignal: $opsSignalStatus,
      phase20RecoveryLoop: $recoveryLoopStatus,
      productComplete: $productCompleteStatus
    },
    overallStatus: $overallStatus,
    artifacts: {
      summary: $summary,
      trend: $trend,
      checklist: $checklist,
      bundle: $bundle,
      releaseEvidence: $releaseEvidence
    }
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"

echo "ops maturity packet written."
echo "  packet: $out_file"
echo "  latest: $latest_file"
