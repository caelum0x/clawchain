#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

JSON_FILE="${1:-artifacts/launch-control/operator-status-snapshot-latest.json}"
MD_FILE="${2:-artifacts/launch-control/operator-status-snapshot-latest.md}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$JSON_FILE" ]]; then
  echo "ERROR: missing operator status JSON '$JSON_FILE'." >&2
  exit 1
fi
if [[ ! -f "$MD_FILE" ]]; then
  echo "ERROR: missing operator status markdown '$MD_FILE'." >&2
  exit 1
fi

for key in '.generatedAtUtc' '.weekId' '.overallStatus' '.gateStatus.phase20ProductComplete' '.gateStatus.phase21ProgramClosure' '.gateStatus.phase22ClosureDigest'; do
  value="$(jq -r "$key // \"\"" "$JSON_FILE")"
  if [[ -z "$value" ]]; then
    echo "ERROR: operator status JSON missing key $key." >&2
    exit 1
  fi
done

overall_status="$(jq -r '.overallStatus // "unknown"' "$JSON_FILE")"
if [[ "$overall_status" != "passed" ]]; then
  echo "ERROR: operator status overallStatus is '$overall_status' (expected 'passed')." >&2
  exit 1
fi

required_sections=(
  '^# Operator Status Snapshot'
  '^## Overall Status'
  '^## Gate Status'
  '^## Artifact References'
)
for pattern in "${required_sections[@]}"; do
  if ! rg -n "$pattern" "$MD_FILE" >/dev/null; then
    echo "ERROR: operator status markdown missing section '$pattern'." >&2
    exit 1
  fi
done

required_refs=(
  'artifacts/launch-control/post-launch-weekly-executive-summary-latest.json'
  'artifacts/launch-control/weekly-publication-packet-latest.json'
  'artifacts/launch-control/weekly-closure-digest-pack-latest.json'
  'artifacts/launch-control/weekly-closure-bundle-latest.json'
)
for ref in "${required_refs[@]}"; do
  if ! rg -n "$ref" "$MD_FILE" >/dev/null; then
    echo "ERROR: operator status markdown missing reference '$ref'." >&2
    exit 1
  fi
done

echo "phase22 operator status gate passed."
