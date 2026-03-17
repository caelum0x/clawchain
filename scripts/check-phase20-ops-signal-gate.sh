#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

trend_artifact="${1:-artifacts/launch-control/executive-trend-7d-latest.json}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-48}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

bash ./scripts/check-post-launch-weekly-executive-summary.sh >/dev/null

if [[ ! -f "$trend_artifact" ]]; then
  echo "ERROR: missing trend artifact '$trend_artifact'." >&2
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

for key in '.generatedAtUtc' '.weeklySummary.weekId' '.weeklySummary.overallStatus' '.metrics.statusTransitions' '.metrics.missingNightlyArtifacts' '.metrics.nonPassedNightlyDays' '.metrics.openIssuesCount'; do
  value="$(jq -r "$key // \"\"" "$trend_artifact")"
  if [[ -z "$value" ]]; then
    echo "ERROR: trend artifact missing key $key." >&2
    exit 1
  fi
done

generated_at="$(jq -r '.generatedAtUtc' "$trend_artifact")"
generated_epoch="$(epoch_from_iso "$generated_at")"
if [[ -z "$generated_epoch" ]]; then
  echo "ERROR: invalid trend generatedAtUtc '$generated_at'." >&2
  exit 1
fi

now_epoch="$(date -u +%s)"
max_age_seconds=$((MAX_AGE_HOURS * 3600))
age_seconds=$((now_epoch - generated_epoch))
if [[ "$age_seconds" -lt 0 || "$age_seconds" -gt "$max_age_seconds" ]]; then
  echo "ERROR: trend artifact is stale (age=${age_seconds}s, max=${max_age_seconds}s)." >&2
  exit 1
fi

echo "phase20 ops signal gate passed."
