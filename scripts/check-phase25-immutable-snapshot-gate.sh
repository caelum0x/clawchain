#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

JSON_FILE="${1:-artifacts/launch-control/weekly-immutable-snapshot-latest.json}"
MD_FILE="${2:-artifacts/launch-control/weekly-notarization-receipt-latest.md}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$JSON_FILE" ]]; then
  echo "ERROR: missing immutable snapshot '$JSON_FILE'." >&2
  exit 1
fi
if [[ ! -f "$MD_FILE" ]]; then
  echo "ERROR: missing notarization receipt '$MD_FILE'." >&2
  exit 1
fi

for key in '.generatedAtUtc' '.weekId' '.references.ledgerFile' '.references.auditLogFile' '.references.signoffJson'; do
  value="$(jq -r "$key // \"\"" "$JSON_FILE")"
  if [[ -z "$value" ]]; then
    echo "ERROR: immutable snapshot missing key $key." >&2
    exit 1
  fi
done

required_sections=(
  '^# Weekly Notarization Receipt'
  '^## Immutable References'
)
for pattern in "${required_sections[@]}"; do
  if ! rg -n "$pattern" "$MD_FILE" >/dev/null; then
    echo "ERROR: notarization receipt missing section '$pattern'." >&2
    exit 1
  fi
done

required_refs=(
  'artifacts/launch-control/weekly-notarization-ledger-latest.json'
  'artifacts/launch-control/weekly-audit-log-latest.json'
  'artifacts/launch-control/weekly-signoff-manifest-latest.json'
)
for ref in "${required_refs[@]}"; do
  if ! rg -n "$ref" "$MD_FILE" >/dev/null; then
    echo "ERROR: notarization receipt missing reference '$ref'." >&2
    exit 1
  fi
done

echo "phase25 immutable snapshot gate passed."
