#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EVIDENCE_FILE="${1:-artifacts/release-evidence.json}"

if [[ ! -f "$EVIDENCE_FILE" ]]; then
  echo "ERROR: missing release evidence '$EVIDENCE_FILE'." >&2
  echo "Run: make release-ready-gate MANIFEST=<manifest> HOST=<host>" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

required_paths=(
  cmd/clawchaind
  cmd/clawd
  openclaw
  x/agent
  x/privacy
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "ERROR: missing required product path '$path'." >&2
    exit 1
  fi
done

overall_status="$(jq -r '.overall_status' "$EVIDENCE_FILE")"
if [[ "$overall_status" != "passed" ]]; then
  echo "ERROR: release evidence overall_status is '$overall_status' (expected 'passed')." >&2
  exit 1
fi

required_gates=(
  protocol_sanity
  mainnet_readiness
  one_command_agent
  phase17_public_testnet_stability
  public_testnet_reproducibility
)

for gate in "${required_gates[@]}"; do
  status="$(jq -r ".gates.${gate} // \"missing\"" "$EVIDENCE_FILE")"
  if [[ "$status" != "passed" ]]; then
    echo "ERROR: gate '${gate}' status is '${status}' (expected 'passed')." >&2
    exit 1
  fi
done

echo "product complete gate passed."
echo "  evidence: $EVIDENCE_FILE"
echo "  overall:  $overall_status"
