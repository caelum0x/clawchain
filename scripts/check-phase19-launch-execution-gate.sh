#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

artifact="${1:-artifacts/launch-control/launch-execution-pack-latest.json}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"

if [[ ! -f "$artifact" ]]; then
  echo "ERROR: missing launch execution pack '$artifact'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for key in '.inputs.goLivePacket' '.inputs.supportSnapshot' '.inputs.deployProof' '.inputs.nightlyOps' '.inputs.weeklyDrill' '.inputs.monthlyGovernance'; do
  value="$(jq -r "$key // \"\"" "$artifact")"
  if [[ -z "$value" ]]; then
    echo "ERROR: launch execution pack missing key $key." >&2
    exit 1
  fi
done

epoch_from_iso() {
  local iso="$1"
  local epoch=""
  epoch="$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" "+%s" 2>/dev/null || true)"
  if [[ -z "$epoch" ]]; then
    epoch="$(date -u -d "$iso" "+%s" 2>/dev/null || true)"
  fi
  echo "$epoch"
}

generated_at="$(jq -r '.generatedAtUtc // ""' "$artifact")"
if [[ -z "$generated_at" ]]; then
  echo "ERROR: launch execution pack missing generatedAtUtc." >&2
  exit 1
fi

generated_epoch="$(epoch_from_iso "$generated_at")"
if [[ -z "$generated_epoch" ]]; then
  echo "ERROR: invalid generatedAtUtc in launch execution pack: $generated_at" >&2
  exit 1
fi

now_epoch="$(date -u +%s)"
max_age_seconds=$((MAX_AGE_HOURS * 3600))
age_seconds=$((now_epoch - generated_epoch))
if [[ "$age_seconds" -lt 0 || "$age_seconds" -gt "$max_age_seconds" ]]; then
  echo "ERROR: launch execution pack is stale (age=${age_seconds}s, max=${max_age_seconds}s)." >&2
  exit 1
fi

go_live_packet="$(jq -r '.inputs.goLivePacket' "$artifact")"
support_snapshot="$(jq -r '.inputs.supportSnapshot' "$artifact")"
deploy_proof="$(jq -r '.inputs.deployProof' "$artifact")"
nightly_ops="$(jq -r '.inputs.nightlyOps' "$artifact")"
weekly_drill="$(jq -r '.inputs.weeklyDrill' "$artifact")"
monthly_gov="$(jq -r '.inputs.monthlyGovernance' "$artifact")"

for file in "$go_live_packet" "$support_snapshot" "$deploy_proof" "$nightly_ops" "$weekly_drill" "$monthly_gov"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: launch execution input artifact missing on disk: $file" >&2
    exit 1
  fi
done

bash ./scripts/check-nightly-ops-pack.sh "$nightly_ops" >/dev/null
bash ./scripts/check-weekly-incident-drill-pack.sh "$weekly_drill" >/dev/null
bash ./scripts/check-monthly-governance-pack-gate.sh "$monthly_gov" >/dev/null
bash ./scripts/check-phase18-real-endpoint-cutover-gate.sh >/dev/null

echo "phase19 launch execution gate passed."
