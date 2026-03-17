#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

artifact="${1:-artifacts/operations/weekly-incident-drill-pack-latest.json}"

if [[ ! -f "$artifact" ]]; then
  echo "ERROR: missing weekly incident drill pack '$artifact'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

current_week="$(date -u +%G-W%V)"
prev_week="$(date -u -v-7d +%G-W%V 2>/dev/null || date -u -d '7 days ago' +%G-W%V 2>/dev/null || echo "")"
week_id="$(jq -r '.weekId // ""' "$artifact")"
if [[ "$week_id" != "$current_week" && "$week_id" != "$prev_week" ]]; then
  echo "ERROR: weekly incident drill pack weekId '$week_id' is stale (expected $current_week or $prev_week)." >&2
  exit 1
fi

for key in '.drill.status' '.drill.passedCount' '.drill.failedCount' '.closureStatus'; do
  value="$(jq -r "$key // \"\"" "$artifact")"
  if [[ -z "$value" ]]; then
    echo "ERROR: weekly incident drill pack missing key $key." >&2
    exit 1
  fi
done

echo "weekly incident drill pack closure check passed."
