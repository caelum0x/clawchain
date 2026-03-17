#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PACKET_FILE="${1:-artifacts/launch-control/weekly-publication-packet-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$PACKET_FILE" ]]; then
  echo "ERROR: missing publication packet '$PACKET_FILE'." >&2
  exit 1
fi

for key in '.generatedAtUtc' '.weekId' '.overallStatus' '.gateStatus.phase21ArtifactIndex' '.gateStatus.phase20OpsSignal' '.gateStatus.phase20RecoveryLoop'; do
  value="$(jq -r "$key // \"\"" "$PACKET_FILE")"
  if [[ -z "$value" ]]; then
    echo "ERROR: publication packet missing key $key." >&2
    exit 1
  fi
done

summary_week="$(jq -r '.weekId // ""' artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)"
packet_week="$(jq -r '.weekId // ""' "$PACKET_FILE")"
if [[ -z "$summary_week" || "$packet_week" != "$summary_week" ]]; then
  echo "ERROR: publication packet weekId does not match latest summary weekId." >&2
  exit 1
fi

overall_status="$(jq -r '.overallStatus // "unknown"' "$PACKET_FILE")"
if [[ "$overall_status" != "passed" ]]; then
  echo "ERROR: publication packet overallStatus is '$overall_status' (expected 'passed')." >&2
  exit 1
fi

echo "phase21 publication packet gate passed."
