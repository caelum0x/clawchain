#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RELEASE_EVIDENCE_FILE="${1:-artifacts/release-evidence.json}"
OPS_MATURITY_PACKET="${2:-artifacts/launch-control/ops-maturity-packet-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$RELEASE_EVIDENCE_FILE" ]]; then
  echo "ERROR: missing release evidence '$RELEASE_EVIDENCE_FILE'." >&2
  exit 1
fi

bash ./scripts/check-phase20-ops-signal-gate.sh >/dev/null
bash ./scripts/check-phase20-recovery-loop-gate.sh >/dev/null
bash ./scripts/check-release-evidence-drift.sh "$RELEASE_EVIDENCE_FILE" >/dev/null

if ! jq -e '
  .overall_status == "passed"
  and (.gates.protocol_sanity == "passed")
  and (.gates.mainnet_readiness == "passed")
  and (.gates.phase17_public_testnet_stability == "passed")
  and (.gates.public_testnet_reproducibility == "passed")
  and ((.gates.one_command_agent == "passed") or (.gates.one_command_agent == "not_recorded"))
' "$RELEASE_EVIDENCE_FILE" >/dev/null; then
  echo "ERROR: release evidence is not aligned with required prior gates." >&2
  exit 1
fi

if [[ ! -f "$OPS_MATURITY_PACKET" ]]; then
  echo "ERROR: missing ops maturity packet '$OPS_MATURITY_PACKET'." >&2
  exit 1
fi

packet_overall="$(jq -r '.overallStatus // "unknown"' "$OPS_MATURITY_PACKET")"
if [[ "$packet_overall" != "passed" ]]; then
  echo "ERROR: ops maturity packet overallStatus is '$packet_overall' (expected 'passed')." >&2
  exit 1
fi

packet_week="$(jq -r '.weekId // ""' "$OPS_MATURITY_PACKET")"
summary_week="$(jq -r '.weekId // ""' artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)"
if [[ -z "$packet_week" || -z "$summary_week" || "$packet_week" != "$summary_week" ]]; then
  echo "ERROR: ops maturity packet weekId must match latest weekly summary weekId." >&2
  exit 1
fi

echo "phase20 product complete gate passed."
