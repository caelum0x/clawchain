#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

artifact="${1:-artifacts/governance/monthly-governance-pack-latest.json}"

if [[ ! -f "$artifact" ]]; then
  echo "ERROR: missing monthly governance pack '$artifact'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

current_month="$(date -u +%Y-%m)"
prev_month="$(date -u -v-1m +%Y-%m 2>/dev/null || date -u -d "$(date -u +%Y-%m-01) -1 month" +%Y-%m 2>/dev/null || echo "")"
month_id="$(jq -r '.monthId // ""' "$artifact")"
if [[ "$month_id" != "$current_month" && "$month_id" != "$prev_month" ]]; then
  echo "ERROR: monthly governance pack monthId '$month_id' is stale (expected $current_month or $prev_month)." >&2
  exit 1
fi

for key in '.monthlyReportGateStatus' '.closureStatus' '.governanceReportPath' '.governanceDecisionLogPath'; do
  value="$(jq -r "$key // \"\"" "$artifact")"
  if [[ -z "$value" ]]; then
    echo "ERROR: monthly governance pack missing key $key." >&2
    exit 1
  fi
done

echo "monthly governance pack closure gate passed."
