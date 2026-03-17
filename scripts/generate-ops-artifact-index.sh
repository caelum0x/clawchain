#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
SUMMARY_FILE="${SUMMARY_FILE:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$SUMMARY_FILE" ]]; then
  echo "ERROR: missing summary file '$SUMMARY_FILE'." >&2
  exit 1
fi

sha256_of() {
  local file="$1"
  local hash=""
  hash="$(shasum -a 256 "$file" 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "$hash" ]]; then
    hash="$(sha256sum "$file" 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo "$hash"
}

week_id="$(jq -r '.weekId // ""' "$SUMMARY_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: summary file missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
index_file="${OUT_DIR}/ops-artifact-index-${week_id}.json"
latest_file="${OUT_DIR}/ops-artifact-index-latest.json"

tmp_entries="$(mktemp)"
trap 'rm -f "$tmp_entries"' EXIT

files=(
  artifacts/launch-control/post-launch-weekly-executive-summary-latest.json
  artifacts/launch-control/executive-trend-7d-latest.json
  artifacts/launch-control/ops-remediation-checklist-latest.json
  artifacts/launch-control/ops-remediation-bundle-latest.json
  artifacts/launch-control/ops-maturity-packet-latest.json
  artifacts/release-evidence.json
)

for path in "${files[@]}"; do
  if [[ ! -f "$path" ]]; then
    echo "ERROR: missing required artifact '$path'." >&2
    exit 1
  fi
  hash="$(sha256_of "$path")"
  if [[ -z "$hash" ]]; then
    echo "ERROR: failed to compute hash for '$path'." >&2
    exit 1
  fi
  size_bytes="$(wc -c <"$path" | tr -d ' ')"
  jq -n \
    --arg path "$path" \
    --arg sha256 "$hash" \
    --argjson sizeBytes "${size_bytes:-0}" \
    '
    {
      path: $path,
      sha256: $sha256,
      sizeBytes: $sizeBytes
    }
    ' >>"$tmp_entries"
done

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg summaryFile "$SUMMARY_FILE" \
  --argjson entries "$(jq -s '.' "$tmp_entries")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    summaryFile: $summaryFile,
    entries: $entries
  }
  ' >"$index_file"

cp "$index_file" "$latest_file"

echo "ops artifact index written."
echo "  index:  $index_file"
echo "  latest: $latest_file"
