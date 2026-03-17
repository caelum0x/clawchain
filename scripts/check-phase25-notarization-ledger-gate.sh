#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LEDGER_FILE="${1:-artifacts/launch-control/weekly-notarization-ledger-latest.json}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$LEDGER_FILE" ]]; then
  echo "ERROR: missing notarization ledger '$LEDGER_FILE'." >&2
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

sha256_of() {
  local file="$1"
  local hash=""
  hash="$(shasum -a 256 "$file" 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "$hash" ]]; then
    hash="$(sha256sum "$file" 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo "$hash"
}

generated_at="$(jq -r '.generatedAtUtc // ""' "$LEDGER_FILE")"
if [[ -z "$generated_at" ]]; then
  echo "ERROR: ledger missing generatedAtUtc." >&2
  exit 1
fi
generated_epoch="$(epoch_from_iso "$generated_at")"
if [[ -z "$generated_epoch" ]]; then
  echo "ERROR: invalid generatedAtUtc '$generated_at'." >&2
  exit 1
fi
now_epoch="$(date -u +%s)"
age_seconds=$((now_epoch - generated_epoch))
max_age_seconds=$((MAX_AGE_HOURS * 3600))
if [[ "$age_seconds" -lt 0 || "$age_seconds" -gt "$max_age_seconds" ]]; then
  echo "ERROR: ledger stale (age=${age_seconds}s, max=${max_age_seconds}s)." >&2
  exit 1
fi

entry_count="$(jq -r '.entries | length' "$LEDGER_FILE")"
if [[ "$entry_count" -lt 3 ]]; then
  echo "ERROR: ledger entries incomplete." >&2
  exit 1
fi

while IFS= read -r row; do
  path="$(jq -r '.path' <<<"$row")"
  expected="$(jq -r '.sha256' <<<"$row")"
  if [[ ! -f "$path" ]]; then
    echo "ERROR: missing ledger entry file '$path'." >&2
    exit 1
  fi
  actual="$(sha256_of "$path")"
  if [[ -z "$actual" || "$actual" != "$expected" ]]; then
    echo "ERROR: hash mismatch for '$path'." >&2
    exit 1
  fi
done < <(jq -c '.entries[]' "$LEDGER_FILE")

echo "phase25 notarization ledger gate passed."
