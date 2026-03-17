#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

JSON_FILE="${1:-artifacts/launch-control/weekly-signoff-manifest-latest.json}"
MD_FILE="${2:-artifacts/launch-control/weekly-signoff-manifest-latest.md}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$JSON_FILE" ]]; then
  echo "ERROR: missing signoff manifest JSON '$JSON_FILE'." >&2
  exit 1
fi
if [[ ! -f "$MD_FILE" ]]; then
  echo "ERROR: missing signoff manifest markdown '$MD_FILE'." >&2
  exit 1
fi

for key in '.generatedAtUtc' '.weekId' '.references.auditLogFile' '.references.attestationFile' '.signoff.releaseOwner' '.signoff.runtimeOwner' '.signoff.chainOwner'; do
  value="$(jq -r "$key // \"\"" "$JSON_FILE")"
  if [[ -z "$value" ]]; then
    echo "ERROR: signoff JSON missing key $key." >&2
    exit 1
  fi
done

required_sections=(
  '^# Weekly Signoff Manifest'
  '^## References'
  '^## Signoff'
)
for pattern in "${required_sections[@]}"; do
  if ! rg -n "$pattern" "$MD_FILE" >/dev/null; then
    echo "ERROR: signoff markdown missing section '$pattern'." >&2
    exit 1
  fi
done

required_refs=(
  'artifacts/launch-control/weekly-audit-log-latest.json'
  'artifacts/launch-control/weekly-closeout-attestation-latest.json'
  'artifacts/launch-control/weekly-history-rollup-latest.json'
  'artifacts/launch-control/operator-status-snapshot-latest.json'
)
for ref in "${required_refs[@]}"; do
  if ! rg -n "$ref" "$MD_FILE" >/dev/null; then
    echo "ERROR: signoff markdown missing reference '$ref'." >&2
    exit 1
  fi
done

echo "phase24 signoff manifest gate passed."
