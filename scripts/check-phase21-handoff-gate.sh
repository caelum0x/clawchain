#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NOTE_FILE="${1:-artifacts/launch-control/weekly-handoff-note-latest.md}"

if [[ ! -f "$NOTE_FILE" ]]; then
  echo "ERROR: missing handoff note '$NOTE_FILE'." >&2
  exit 1
fi

required_headers=(
  '^# Weekly Handoff Note'
  '^## Executive Status'
  '^## Required Actions'
  '^## Artifact References'
  '^## Operator Sign-off'
)

for pattern in "${required_headers[@]}"; do
  if ! rg -n "$pattern" "$NOTE_FILE" >/dev/null; then
    echo "ERROR: handoff note missing required section pattern '$pattern'." >&2
    exit 1
  fi
done

required_paths=(
  'artifacts/launch-control/post-launch-weekly-executive-summary-latest.json'
  'artifacts/launch-control/weekly-publication-packet-latest.json'
  'artifacts/launch-control/ops-remediation-checklist-latest.json'
  'artifacts/launch-control/ops-maturity-packet-latest.json'
  'artifacts/release-evidence.json'
)

for path in "${required_paths[@]}"; do
  if ! rg -n "$path" "$NOTE_FILE" >/dev/null; then
    echo "ERROR: handoff note missing artifact reference '$path'." >&2
    exit 1
  fi
done

echo "phase21 handoff gate passed."
