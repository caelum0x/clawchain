#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
ATTESTATION_FILE="${ATTESTATION_FILE:-artifacts/launch-control/weekly-closeout-attestation-latest.json}"
HISTORY_ROLLUP_FILE="${HISTORY_ROLLUP_FILE:-artifacts/launch-control/weekly-history-rollup-latest.json}"
STATUS_SNAPSHOT_FILE="${STATUS_SNAPSHOT_FILE:-artifacts/launch-control/operator-status-snapshot-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$ATTESTATION_FILE" "$HISTORY_ROLLUP_FILE" "$STATUS_SNAPSHOT_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing audit-log input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$ATTESTATION_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: attestation missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
json_file="${OUT_DIR}/weekly-audit-log-${week_id}.json"
latest_file="${OUT_DIR}/weekly-audit-log-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg attestationFile "$ATTESTATION_FILE" \
  --arg historyRollupFile "$HISTORY_ROLLUP_FILE" \
  --arg statusSnapshotFile "$STATUS_SNAPSHOT_FILE" \
  --argjson attestation "$(cat "$ATTESTATION_FILE")" \
  --argjson historyRollup "$(cat "$HISTORY_ROLLUP_FILE")" \
  --argjson statusSnapshot "$(cat "$STATUS_SNAPSHOT_FILE")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    references: {
      attestationFile: $attestationFile,
      historyRollupFile: $historyRollupFile,
      statusSnapshotFile: $statusSnapshotFile
    },
    artifacts: {
      attestation: $attestation,
      historyRollup: $historyRollup,
      statusSnapshot: $statusSnapshot
    }
  }
  ' >"$json_file"

cp "$json_file" "$latest_file"

echo "weekly audit log written."
echo "  audit:  $json_file"
echo "  latest: $latest_file"
