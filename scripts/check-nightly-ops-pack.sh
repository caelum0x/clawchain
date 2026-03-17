#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

artifact="${1:-artifacts/operations/nightly-ops-pack-latest.json}"

if [[ ! -f "$artifact" ]]; then
  echo "ERROR: missing nightly ops artifact '$artifact'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

today="$(date -u +%Y%m%d)"
yesterday="$(date -u -v-1d +%Y%m%d 2>/dev/null || date -u -d '1 day ago' +%Y%m%d 2>/dev/null || echo "")"
day_utc="$(jq -r '.dayUtc // ""' "$artifact")"
if [[ "$day_utc" != "$today" && "$day_utc" != "$yesterday" ]]; then
  echo "ERROR: nightly ops artifact dayUtc '$day_utc' is stale (expected $today or $yesterday)." >&2
  exit 1
fi

for key in '.checks.gateSummary.status' '.checks.releaseEvidenceRefresh.status' '.overallStatus'; do
  value="$(jq -r "$key // \"\"" "$artifact")"
  if [[ -z "$value" ]]; then
    echo "ERROR: nightly ops artifact missing key $key." >&2
    exit 1
  fi
done

echo "nightly ops pack closure check passed."
