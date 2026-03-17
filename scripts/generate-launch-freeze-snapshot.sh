#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DECISION_TIMESTAMP_UTC="${DECISION_TIMESTAMP_UTC:-}"
DECISION_OUTCOME="${DECISION_OUTCOME:-launch}"
OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
RELEASE_EVIDENCE="${RELEASE_EVIDENCE:-artifacts/release-evidence.json}"
LAUNCH_EXECUTION_PACK="${LAUNCH_EXECUTION_PACK:-artifacts/launch-control/launch-execution-pack-latest.json}"
LIFECYCLE_SNAPSHOT="${LIFECYCLE_SNAPSHOT:-artifacts/launch-control/lifecycle-revision-snapshot.json}"

if [[ -z "$DECISION_TIMESTAMP_UTC" ]]; then
  echo "ERROR: DECISION_TIMESTAMP_UTC is required (example: 2026-02-27T10:30:00Z)." >&2
  exit 1
fi

if [[ ! "$DECISION_TIMESTAMP_UTC" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
  echo "ERROR: DECISION_TIMESTAMP_UTC must be RFC3339 UTC (YYYY-MM-DDTHH:MM:SSZ)." >&2
  exit 1
fi

case "$DECISION_OUTCOME" in
  launch|no-launch) ;;
  *)
    echo "ERROR: DECISION_OUTCOME must be 'launch' or 'no-launch'." >&2
    exit 1
    ;;
esac

for file in "$RELEASE_EVIDENCE" "$LAUNCH_EXECUTION_PACK" "$LIFECYCLE_SNAPSHOT"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing required freeze input '$file'." >&2
    exit 1
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$OUT_DIR/launch-freeze-snapshot-$ts.json"
latest_file="$OUT_DIR/launch-freeze-snapshot-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg decisionTimestampUtc "$DECISION_TIMESTAMP_UTC" \
  --arg decisionOutcome "$DECISION_OUTCOME" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg releaseEvidencePath "$RELEASE_EVIDENCE" \
  --arg launchExecutionPackPath "$LAUNCH_EXECUTION_PACK" \
  --arg lifecycleSnapshotPath "$LIFECYCLE_SNAPSHOT" \
  --argjson releaseEvidence "$(cat "$RELEASE_EVIDENCE")" \
  --argjson launchExecutionPack "$(cat "$LAUNCH_EXECUTION_PACK")" \
  --argjson lifecycleSnapshot "$(cat "$LIFECYCLE_SNAPSHOT")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    decisionTimestampUtc: $decisionTimestampUtc,
    decisionOutcome: $decisionOutcome,
    gitCommit: $gitCommit,
    inputs: {
      releaseEvidencePath: $releaseEvidencePath,
      launchExecutionPackPath: $launchExecutionPackPath,
      lifecycleSnapshotPath: $lifecycleSnapshotPath
    },
    artifacts: {
      releaseEvidence: $releaseEvidence,
      launchExecutionPack: $launchExecutionPack,
      lifecycleSnapshot: $lifecycleSnapshot
    }
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"
echo "launch freeze snapshot written."
echo "  snapshot: $out_file"
echo "  latest:   $latest_file"
