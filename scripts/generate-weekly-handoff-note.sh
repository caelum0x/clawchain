#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
SUMMARY_FILE="${SUMMARY_FILE:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"
PUBLICATION_PACKET="${PUBLICATION_PACKET:-artifacts/launch-control/weekly-publication-packet-latest.json}"
CHECKLIST_FILE="${CHECKLIST_FILE:-artifacts/launch-control/ops-remediation-checklist-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$SUMMARY_FILE" "$PUBLICATION_PACKET" "$CHECKLIST_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing handoff note input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$SUMMARY_FILE")"
overall_status="$(jq -r '.overallStatus // "unknown"' "$SUMMARY_FILE")"
recommendation="$(jq -r '.recommendation // "unknown"' "$SUMMARY_FILE")"
open_issues_count="$(jq -r '.openIssuesCount // 0' "$CHECKLIST_FILE")"

mkdir -p "$OUT_DIR"
note_file="${OUT_DIR}/weekly-handoff-note-${week_id}.md"
latest_file="${OUT_DIR}/weekly-handoff-note-latest.md"

cat >"$note_file" <<MD
# Weekly Handoff Note (${week_id})

## Executive Status

- Overall status: ${overall_status}
- Recommendation: ${recommendation}
- Open issues count: ${open_issues_count}

## Required Actions

$(jq -r '.issues[]? | "- [" + (if .actual == .expected then "x" else " " end) + "] " + .signal + " (actual: " + .actual + ", expected: " + .expected + ")"' "$CHECKLIST_FILE")

## Artifact References

- Summary: ${SUMMARY_FILE}
- Publication packet: ${PUBLICATION_PACKET}
- Remediation checklist: ${CHECKLIST_FILE}
- Ops maturity packet: artifacts/launch-control/ops-maturity-packet-latest.json
- Release evidence: artifacts/release-evidence.json

## Operator Sign-off

- Release owner: ____________________
- Runtime owner: ____________________
- Chain owner: ______________________
MD

cp "$note_file" "$latest_file"

echo "weekly handoff note written."
echo "  note:   $note_file"
echo "  latest: $latest_file"
