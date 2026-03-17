#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
NIGHTLY_DIR="${NIGHTLY_DIR:-artifacts/operations}"
SUMMARY_FILE="${SUMMARY_FILE:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$SUMMARY_FILE" ]]; then
  echo "ERROR: missing summary file '$SUMMARY_FILE'." >&2
  exit 1
fi

day_minus() {
  local offset="$1"
  date -u -v-"$offset"d +%Y%m%d 2>/dev/null || date -u -d "$offset days ago" +%Y%m%d
}

mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$OUT_DIR/executive-trend-7d-$ts.json"
latest_file="$OUT_DIR/executive-trend-7d-latest.json"

tmp_daily="$(mktemp)"
trap 'rm -f "$tmp_daily"' EXIT

for i in 6 5 4 3 2 1 0; do
  day_utc="$(day_minus "$i")"
  artifact="${NIGHTLY_DIR}/nightly-ops-pack-${day_utc}.json"
  if [[ -f "$artifact" ]]; then
    status="$(jq -r '.overallStatus // "unknown"' "$artifact")"
    printf '{"dayUtc":"%s","artifact":"%s","status":"%s","present":true}\n' "$day_utc" "$artifact" "$status" >>"$tmp_daily"
  else
    printf '{"dayUtc":"%s","artifact":"%s","status":"missing","present":false}\n' "$day_utc" "$artifact" >>"$tmp_daily"
  fi
done

status_changes="$(jq -s '
  map(select(.present == true) | .status) as $s
  | reduce range(1; ($s|length)) as $i (0; . + (if $s[$i] != $s[$i-1] then 1 else 0 end))
' "$tmp_daily")"
missing_days="$(jq -s '[ .[] | select(.present == false) ] | length' "$tmp_daily")"
failed_days="$(jq -s '[ .[] | select(.present == true and .status != "passed") ] | length' "$tmp_daily")"

open_issues_count="$(jq -r '
  [
    (if .status.nightlyOps == "passed" then empty else "nightlyOps" end),
    (if .status.weeklyDrillClosure == "closed" then empty else "weeklyDrillClosure" end),
    (if .status.weeklyDrill == "passed" then empty else "weeklyDrill" end),
    (if .status.monthlyGovernanceClosure == "closed" then empty else "monthlyGovernanceClosure" end),
    (if .status.releaseEvidence == "passed" then empty else "releaseEvidence" end),
    (if .status.phase19EvidenceDriftControls == "passed" then empty else "phase19EvidenceDriftControls" end)
  ] | length
' "$SUMMARY_FILE")"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg sourceSummary "$SUMMARY_FILE" \
  --argjson weeklySummary "$(cat "$SUMMARY_FILE")" \
  --argjson dailyNightly "$(jq -s '.' "$tmp_daily")" \
  --argjson statusChanges "$status_changes" \
  --argjson missingDays "$missing_days" \
  --argjson failedDays "$failed_days" \
  --argjson openIssuesCount "$open_issues_count" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    sourceSummary: $sourceSummary,
    weeklySummary: {
      weekId: ($weeklySummary.weekId // ""),
      overallStatus: ($weeklySummary.overallStatus // "unknown"),
      recommendation: ($weeklySummary.recommendation // "unknown")
    },
    nightly7d: $dailyNightly,
    metrics: {
      statusTransitions: $statusChanges,
      missingNightlyArtifacts: $missingDays,
      nonPassedNightlyDays: $failedDays,
      openIssuesCount: $openIssuesCount
    }
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"

echo "executive 7-day trend written."
echo "  trend:  $out_file"
echo "  latest: $latest_file"
