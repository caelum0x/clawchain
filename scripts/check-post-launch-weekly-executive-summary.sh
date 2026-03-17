#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

artifact="${1:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"
MAX_AGE_DAYS="${MAX_AGE_DAYS:-10}"

if [[ ! -f "$artifact" ]]; then
  echo "ERROR: missing weekly executive summary artifact '$artifact'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

epoch_from_iso() {
  local iso="$1"
  local epoch=""
  epoch="$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" "+%s" 2>/dev/null || true)"
  if [[ -z "$epoch" ]]; then
    epoch="$(date -u -d "$iso" "+%s" 2>/dev/null || true)"
  fi
  echo "$epoch"
}

for key in \
  '.generatedAtUtc' \
  '.weekId' \
  '.overallStatus' \
  '.recommendation' \
  '.status.nightlyOps' \
  '.status.weeklyDrillClosure' \
  '.status.weeklyDrill' \
  '.status.monthlyGovernanceClosure' \
  '.status.releaseEvidence' \
  '.status.phase19EvidenceDriftControls'; do
  value="$(jq -r "$key // \"\"" "$artifact")"
  if [[ -z "$value" ]]; then
    echo "ERROR: weekly executive summary missing key $key." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId' "$artifact")"
if [[ ! "$week_id" =~ ^[0-9]{4}-W[0-9]{2}$ ]]; then
  echo "ERROR: invalid weekId '$week_id' (expected YYYY-Www)." >&2
  exit 1
fi

current_week="$(date -u +%G-W%V)"
prev_week="$(date -u -v-7d +%G-W%V 2>/dev/null || date -u -d '7 days ago' +%G-W%V)"
if [[ "$week_id" != "$current_week" && "$week_id" != "$prev_week" ]]; then
  echo "ERROR: weekId '$week_id' is stale (expected $current_week or $prev_week)." >&2
  exit 1
fi

generated_at="$(jq -r '.generatedAtUtc' "$artifact")"
generated_epoch="$(epoch_from_iso "$generated_at")"
if [[ -z "$generated_epoch" ]]; then
  echo "ERROR: invalid generatedAtUtc '$generated_at'." >&2
  exit 1
fi

now_epoch="$(date -u +%s)"
max_age_seconds=$((MAX_AGE_DAYS * 86400))
age_seconds=$((now_epoch - generated_epoch))
if [[ "$age_seconds" -lt 0 || "$age_seconds" -gt "$max_age_seconds" ]]; then
  echo "ERROR: weekly executive summary is stale (age=${age_seconds}s, max=${max_age_seconds}s)." >&2
  exit 1
fi

overall_status="$(jq -r '.overallStatus' "$artifact")"
recommendation="$(jq -r '.recommendation' "$artifact")"
case "$overall_status" in
  passed)
    if [[ "$recommendation" != "launch_stable_continue_weekly_ops" ]]; then
      echo "ERROR: recommendation/status mismatch for passed summary." >&2
      exit 1
    fi
    ;;
  attention_required)
    if [[ "$recommendation" != "hold_stabilized_label_and_remediate_open_signals" ]]; then
      echo "ERROR: recommendation/status mismatch for attention_required summary." >&2
      exit 1
    fi
    ;;
  *)
    echo "ERROR: unsupported overallStatus '$overall_status'." >&2
    exit 1
    ;;
esac

echo "post-launch weekly executive summary gate passed."
