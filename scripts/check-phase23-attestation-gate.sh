#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ATTESTATION_FILE="${1:-artifacts/launch-control/weekly-closeout-attestation-latest.json}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$ATTESTATION_FILE" ]]; then
  echo "ERROR: missing attestation '$ATTESTATION_FILE'." >&2
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

for key in '.generatedAtUtc' '.weekId' '.references.digestPack' '.references.statusSnapshot' '.references.closureBundle'; do
  value="$(jq -r "$key // \"\"" "$ATTESTATION_FILE")"
  if [[ -z "$value" ]]; then
    echo "ERROR: attestation missing key $key." >&2
    exit 1
  fi
done

generated_at="$(jq -r '.generatedAtUtc' "$ATTESTATION_FILE")"
generated_epoch="$(epoch_from_iso "$generated_at")"
if [[ -z "$generated_epoch" ]]; then
  echo "ERROR: invalid attestation generatedAtUtc '$generated_at'." >&2
  exit 1
fi

now_epoch="$(date -u +%s)"
age_seconds=$((now_epoch - generated_epoch))
max_age_seconds=$((MAX_AGE_HOURS * 3600))
if [[ "$age_seconds" -lt 0 || "$age_seconds" -gt "$max_age_seconds" ]]; then
  echo "ERROR: attestation is stale (age=${age_seconds}s, max=${max_age_seconds}s)." >&2
  exit 1
fi

week_id="$(jq -r '.weekId // ""' "$ATTESTATION_FILE")"
status_week="$(jq -r '.weekId // ""' artifacts/launch-control/operator-status-snapshot-latest.json)"
if [[ -z "$week_id" || "$week_id" != "$status_week" ]]; then
  echo "ERROR: attestation weekId mismatch with latest operator status snapshot." >&2
  exit 1
fi

echo "phase23 attestation gate passed."
