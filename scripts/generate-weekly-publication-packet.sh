#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
SUMMARY_FILE="${SUMMARY_FILE:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"
INDEX_FILE="${INDEX_FILE:-artifacts/launch-control/ops-artifact-index-latest.json}"
OPS_MATURITY_PACKET="${OPS_MATURITY_PACKET:-artifacts/launch-control/ops-maturity-packet-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$SUMMARY_FILE" "$INDEX_FILE" "$OPS_MATURITY_PACKET"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing publication packet input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$SUMMARY_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: summary missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
packet_file="${OUT_DIR}/weekly-publication-packet-${week_id}.json"
latest_file="${OUT_DIR}/weekly-publication-packet-latest.json"

index_status="failed"
if bash ./scripts/check-phase21-artifact-index-gate.sh "$INDEX_FILE" >/dev/null; then
  index_status="passed"
fi

ops_signal_status="failed"
if bash ./scripts/check-phase20-ops-signal-gate.sh >/dev/null; then
  ops_signal_status="passed"
fi

recovery_status="failed"
if bash ./scripts/check-phase20-recovery-loop-gate.sh >/dev/null; then
  recovery_status="passed"
fi

overall_status="passed"
if [[ "$index_status" != "passed" || "$ops_signal_status" != "passed" || "$recovery_status" != "passed" ]]; then
  overall_status="failed"
fi

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg summaryFile "$SUMMARY_FILE" \
  --arg indexFile "$INDEX_FILE" \
  --arg opsMaturityPacket "$OPS_MATURITY_PACKET" \
  --arg indexStatus "$index_status" \
  --arg opsSignalStatus "$ops_signal_status" \
  --arg recoveryStatus "$recovery_status" \
  --arg overallStatus "$overall_status" \
  --argjson summary "$(cat "$SUMMARY_FILE")" \
  --argjson index "$(cat "$INDEX_FILE")" \
  --argjson opsMaturity "$(cat "$OPS_MATURITY_PACKET")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    inputs: {
      summaryFile: $summaryFile,
      indexFile: $indexFile,
      opsMaturityPacket: $opsMaturityPacket
    },
    gateStatus: {
      phase21ArtifactIndex: $indexStatus,
      phase20OpsSignal: $opsSignalStatus,
      phase20RecoveryLoop: $recoveryStatus
    },
    overallStatus: $overallStatus,
    artifacts: {
      summary: $summary,
      index: $index,
      opsMaturity: $opsMaturity
    }
  }
  ' >"$packet_file"

cp "$packet_file" "$latest_file"

echo "weekly publication packet written."
echo "  packet: $packet_file"
echo "  latest: $latest_file"
