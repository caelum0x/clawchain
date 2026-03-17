#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
mkdir -p "$OUT_DIR"

latest_file() {
  local pattern="$1"
  ls -1t $pattern 2>/dev/null | head -n1 || true
}

go_live_packet="${GO_LIVE_PACKET:-$(latest_file 'artifacts/go-live/go-live-packet-*.json')}"
support_snapshot="${SUPPORT_SNAPSHOT:-$(latest_file 'artifacts/support/support-handoff-snapshot-*.json')}"
deploy_proof="${DEPLOY_PROOF:-artifacts/testnet/public-deploy-proof-latest.json}"
nightly_ops="${NIGHTLY_OPS_PACK:-artifacts/operations/nightly-ops-pack-latest.json}"
weekly_drill="${WEEKLY_DRILL_PACK:-artifacts/operations/weekly-incident-drill-pack-latest.json}"
monthly_gov="${MONTHLY_GOV_PACK:-artifacts/governance/monthly-governance-pack-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for path in "$go_live_packet" "$support_snapshot" "$deploy_proof" "$nightly_ops" "$weekly_drill" "$monthly_gov"; do
  if [[ ! -f "$path" ]]; then
    echo "ERROR: required launch execution input missing: $path" >&2
    exit 1
  fi
done

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$OUT_DIR/launch-execution-pack-$ts.json"
latest="$OUT_DIR/launch-execution-pack-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg gitBranch "$(git rev-parse --abbrev-ref HEAD)" \
  --arg goLivePacket "$go_live_packet" \
  --arg supportSnapshot "$support_snapshot" \
  --arg deployProof "$deploy_proof" \
  --arg nightlyOps "$nightly_ops" \
  --arg weeklyDrill "$weekly_drill" \
  --arg monthlyGovernance "$monthly_gov" \
  --argjson goLivePacketJson "$(cat "$go_live_packet")" \
  --argjson supportSnapshotJson "$(cat "$support_snapshot")" \
  --argjson deployProofJson "$(cat "$deploy_proof")" \
  --argjson nightlyOpsJson "$(cat "$nightly_ops")" \
  --argjson weeklyDrillJson "$(cat "$weekly_drill")" \
  --argjson monthlyGovernanceJson "$(cat "$monthly_gov")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    git: {
      branch: $gitBranch,
      commit: $gitCommit
    },
    inputs: {
      goLivePacket: $goLivePacket,
      supportSnapshot: $supportSnapshot,
      deployProof: $deployProof,
      nightlyOps: $nightlyOps,
      weeklyDrill: $weeklyDrill,
      monthlyGovernance: $monthlyGovernance
    },
    bundle: {
      goLivePacket: $goLivePacketJson,
      supportSnapshot: $supportSnapshotJson,
      deployProof: $deployProofJson,
      nightlyOps: $nightlyOpsJson,
      weeklyDrill: $weeklyDrillJson,
      monthlyGovernance: $monthlyGovernanceJson
    }
  }
  ' >"$out_file"

cp "$out_file" "$latest"
echo "launch execution pack written."
echo "  pack:   $out_file"
echo "  latest: $latest"
