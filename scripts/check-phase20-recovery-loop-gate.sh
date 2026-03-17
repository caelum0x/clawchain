#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SUMMARY_FILE="${1:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"
CHECKLIST_FILE="${2:-artifacts/launch-control/ops-remediation-checklist-latest.json}"
BUNDLE_FILE="${3:-artifacts/launch-control/ops-remediation-bundle-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

bash ./scripts/check-phase20-ops-signal-gate.sh >/dev/null

if [[ ! -f "$SUMMARY_FILE" ]]; then
  echo "ERROR: missing summary file '$SUMMARY_FILE'." >&2
  exit 1
fi

overall_status="$(jq -r '.overallStatus // "unknown"' "$SUMMARY_FILE")"
current_week="$(jq -r '.weekId // ""' "$SUMMARY_FILE")"
if [[ -z "$current_week" ]]; then
  echo "ERROR: weekly executive summary missing weekId." >&2
  exit 1
fi

tmp_summaries="$(mktemp)"
trap 'rm -f "$tmp_summaries"' EXIT

for summary in artifacts/launch-control/post-launch-weekly-executive-summary-*.json; do
  [[ -f "$summary" ]] || continue
  week="$(jq -r '.weekId // ""' "$summary")"
  status="$(jq -r '.overallStatus // "unknown"' "$summary")"
  if [[ "$week" =~ ^[0-9]{4}-W[0-9]{2}$ ]]; then
    printf '%s|%s\n' "$week" "$status" >>"$tmp_summaries"
  fi
done

persisted=false
if [[ -s "$tmp_summaries" ]]; then
  last_two="$(sort -t'|' -k1,1 "$tmp_summaries" | tail -n 2)"
  count="$(printf '%s\n' "$last_two" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "$count" -eq 2 ]]; then
    first_status="$(printf '%s\n' "$last_two" | head -n1 | cut -d'|' -f2)"
    second_week="$(printf '%s\n' "$last_two" | tail -n1 | cut -d'|' -f1)"
    second_status="$(printf '%s\n' "$last_two" | tail -n1 | cut -d'|' -f2)"
    if [[ "$second_week" == "$current_week" && "$first_status" == "attention_required" && "$second_status" == "attention_required" ]]; then
      persisted=true
    fi
  fi
fi

if [[ "$overall_status" != "attention_required" ]]; then
  echo "phase20 recovery loop gate passed (no active attention-required summary)."
  exit 0
fi

if [[ "$persisted" != "true" ]]; then
  echo "phase20 recovery loop gate passed (attention-required not persisted across >1 cycle)."
  exit 0
fi

for file in "$CHECKLIST_FILE" "$BUNDLE_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: persisted attention-required state requires remediation artifact '$file'." >&2
    exit 1
  fi
done

checklist_week="$(jq -r '.weekId // ""' "$CHECKLIST_FILE")"
bundle_week="$(jq -r '.weekId // ""' "$BUNDLE_FILE")"
checklist_required="$(jq -r '.required // false' "$CHECKLIST_FILE")"
bundle_required="$(jq -r '.required // false' "$BUNDLE_FILE")"

if [[ "$checklist_week" != "$current_week" || "$bundle_week" != "$current_week" ]]; then
  echo "ERROR: remediation artifacts must match current week '$current_week'." >&2
  exit 1
fi

if [[ "$checklist_required" != "true" || "$bundle_required" != "true" ]]; then
  echo "ERROR: remediation artifacts must be marked required=true for persisted attention-required state." >&2
  exit 1
fi

echo "phase20 recovery loop gate passed."
