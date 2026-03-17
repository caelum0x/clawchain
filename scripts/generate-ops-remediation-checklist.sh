#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SUMMARY_FILE="${SUMMARY_FILE:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"
OUT_DIR="${OUT_DIR:-artifacts/launch-control}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$SUMMARY_FILE" ]]; then
  echo "ERROR: missing summary file '$SUMMARY_FILE'." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

week_id="$(jq -r '.weekId // ""' "$SUMMARY_FILE")"
overall_status="$(jq -r '.overallStatus // "unknown"' "$SUMMARY_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: summary file missing weekId." >&2
  exit 1
fi

tmp_issues="$(mktemp)"
trap 'rm -f "$tmp_issues"' EXIT

append_issue() {
  local signal="$1"
  local actual="$2"
  local expected="$3"
  local artifact_path="$4"
  local action="$5"
  jq -n \
    --arg signal "$signal" \
    --arg actual "$actual" \
    --arg expected "$expected" \
    --arg artifactPath "$artifact_path" \
    --arg action "$action" \
    '
    {
      signal: $signal,
      actual: $actual,
      expected: $expected,
      artifactPath: $artifactPath,
      action: $action
    }
    ' >>"$tmp_issues"
}

if [[ "$overall_status" == "attention_required" ]]; then
  nightly_status="$(jq -r '.status.nightlyOps // "unknown"' "$SUMMARY_FILE")"
  weekly_closure_status="$(jq -r '.status.weeklyDrillClosure // "unknown"' "$SUMMARY_FILE")"
  weekly_drill_status="$(jq -r '.status.weeklyDrill // "unknown"' "$SUMMARY_FILE")"
  monthly_status="$(jq -r '.status.monthlyGovernanceClosure // "unknown"' "$SUMMARY_FILE")"
  release_status="$(jq -r '.status.releaseEvidence // "unknown"' "$SUMMARY_FILE")"
  drift_status="$(jq -r '.status.phase19EvidenceDriftControls // "unknown"' "$SUMMARY_FILE")"

  if [[ "$nightly_status" != "passed" ]]; then
    append_issue "nightlyOps" "$nightly_status" "passed" "artifacts/operations/nightly-ops-pack-latest.json" "Regenerate nightly ops pack and resolve failing checks before next executive review."
  fi
  if [[ "$weekly_closure_status" != "closed" ]]; then
    append_issue "weeklyDrillClosure" "$weekly_closure_status" "closed" "artifacts/operations/weekly-incident-drill-pack-latest.json" "Close weekly incident drill actions and publish updated closure artifact."
  fi
  if [[ "$weekly_drill_status" != "passed" ]]; then
    append_issue "weeklyDrill" "$weekly_drill_status" "passed" "artifacts/operations/weekly-incident-drill-pack-latest.json" "Re-run incident drill until all scenarios pass and archive results."
  fi
  if [[ "$monthly_status" != "closed" ]]; then
    append_issue "monthlyGovernanceClosure" "$monthly_status" "closed" "artifacts/governance/monthly-governance-pack-latest.json" "Close governance action items and regenerate monthly governance pack."
  fi
  if [[ "$release_status" != "passed" ]]; then
    append_issue "releaseEvidence" "$release_status" "passed" "artifacts/release-evidence.json" "Regenerate release evidence after all prerequisite gates pass."
  fi
  if [[ "$drift_status" != "passed" ]]; then
    append_issue "phase19EvidenceDriftControls" "$drift_status" "passed" "artifacts/launch-control/executive-trend-7d-latest.json" "Re-run drift controls and refresh launch-control evidence artifacts."
  fi
fi

open_issues_count="$(jq -s 'length' "$tmp_issues")"
required=false
if [[ "$overall_status" == "attention_required" ]]; then
  required=true
fi

out_file="${OUT_DIR}/ops-remediation-checklist-${week_id}.json"
latest_file="${OUT_DIR}/ops-remediation-checklist-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg summaryFile "$SUMMARY_FILE" \
  --arg overallStatus "$overall_status" \
  --argjson required "$required" \
  --argjson openIssuesCount "$open_issues_count" \
  --argjson issues "$(jq -s '.' "$tmp_issues")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    summaryFile: $summaryFile,
    overallStatus: $overallStatus,
    required: $required,
    openIssuesCount: $openIssuesCount,
    issues: $issues
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"

echo "ops remediation checklist written."
echo "  checklist: $out_file"
echo "  latest:    $latest_file"
