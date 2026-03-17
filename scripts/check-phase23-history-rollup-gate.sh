#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ROLLUP_FILE="${1:-artifacts/launch-control/weekly-history-rollup-latest.json}"
MIN_ENTRIES="${MIN_ENTRIES:-1}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$ROLLUP_FILE" ]]; then
  echo "ERROR: missing history rollup '$ROLLUP_FILE'." >&2
  exit 1
fi

for key in '.generatedAtUtc' '.weekId' '.windowWeeks' '.entryCount'; do
  value="$(jq -r "$key // \"\"" "$ROLLUP_FILE")"
  if [[ -z "$value" ]]; then
    echo "ERROR: rollup missing key $key." >&2
    exit 1
  fi
done

entry_count="$(jq -r '.entryCount // 0' "$ROLLUP_FILE")"
if [[ "$entry_count" -lt "$MIN_ENTRIES" ]]; then
  echo "ERROR: rollup entryCount '$entry_count' below minimum '$MIN_ENTRIES'." >&2
  exit 1
fi

prev_week=""
while IFS= read -r week; do
  [[ -n "$week" ]] || continue
  if [[ -n "$prev_week" && "$week" < "$prev_week" ]]; then
    echo "ERROR: rollup chronology is not sorted ascending by weekId." >&2
    exit 1
  fi
  prev_week="$week"
done < <(jq -r '.entries[].weekId // ""' "$ROLLUP_FILE")

echo "phase23 history rollup gate passed."
