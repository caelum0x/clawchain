#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUDIT_LOG_FILE="${1:-artifacts/launch-control/weekly-audit-log-latest.json}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$AUDIT_LOG_FILE" ]]; then
  echo "ERROR: missing weekly audit log '$AUDIT_LOG_FILE'." >&2
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

for key in '.generatedAtUtc' '.weekId' '.references.attestationFile' '.references.historyRollupFile' '.references.statusSnapshotFile'; do
  value="$(jq -r "$key // \"\"" "$AUDIT_LOG_FILE")"
  if [[ -z "$value" ]]; then
    echo "ERROR: audit log missing key $key." >&2
    exit 1
  fi
done

generated_at="$(jq -r '.generatedAtUtc // ""' "$AUDIT_LOG_FILE")"
generated_epoch="$(epoch_from_iso "$generated_at")"
if [[ -z "$generated_epoch" ]]; then
  echo "ERROR: invalid generatedAtUtc '$generated_at'." >&2
  exit 1
fi

now_epoch="$(date -u +%s)"
age_seconds=$((now_epoch - generated_epoch))
max_age_seconds=$((MAX_AGE_HOURS * 3600))
if [[ "$age_seconds" -lt 0 || "$age_seconds" -gt "$max_age_seconds" ]]; then
  echo "ERROR: audit log is stale (age=${age_seconds}s, max=${max_age_seconds}s)." >&2
  exit 1
fi

echo "phase24 audit log gate passed."
