#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
WINDOW_WEEKS="${WINDOW_WEEKS:-4}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
summary_week="$(jq -r '.weekId // ""' artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)"
if [[ -z "$summary_week" ]]; then
  echo "ERROR: missing latest weekly summary weekId." >&2
  exit 1
fi

rollup_file="${OUT_DIR}/weekly-history-rollup-${summary_week}.json"
latest_file="${OUT_DIR}/weekly-history-rollup-latest.json"

tmp_entries="$(mktemp)"
trap 'rm -f "$tmp_entries"' EXIT

while IFS= read -r packet; do
  [[ -f "$packet" ]] || continue
  week_id="$(jq -r '.weekId // ""' "$packet")"
  [[ -n "$week_id" ]] || continue
  status_file="artifacts/launch-control/operator-status-snapshot-${week_id}.json"
  status_present=false
  if [[ -f "$status_file" ]]; then
    status_present=true
  fi
  jq -n \
    --arg weekId "$week_id" \
    --arg publicationPacket "$packet" \
    --arg statusSnapshot "$status_file" \
    --argjson publicationPacketJson "$(cat "$packet")" \
    --argjson statusPresent "$status_present" \
    --argjson statusSnapshotJson "$(
      if [[ -f "$status_file" ]]; then cat "$status_file"; else echo '{}'; fi
    )" \
    '
    {
      weekId: $weekId,
      publicationPacket: $publicationPacket,
      statusSnapshot: $statusSnapshot,
      statusPresent: $statusPresent,
      publicationPacketJson: $publicationPacketJson,
      statusSnapshotJson: $statusSnapshotJson
    }
    ' >>"$tmp_entries"
done < <(ls -1 artifacts/launch-control/weekly-publication-packet-*.json 2>/dev/null | sort | tail -n "$WINDOW_WEEKS")

entry_count="$(jq -s 'length' "$tmp_entries")"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$summary_week" \
  --argjson windowWeeks "$WINDOW_WEEKS" \
  --argjson entryCount "$entry_count" \
  --argjson entries "$(jq -s '.' "$tmp_entries")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    windowWeeks: $windowWeeks,
    entryCount: $entryCount,
    entries: $entries
  }
  ' >"$rollup_file"

cp "$rollup_file" "$latest_file"

echo "weekly history rollup written."
echo "  rollup: $rollup_file"
echo "  latest: $latest_file"
