#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Slice D goal: marketplace + escrow + reputation are fully operatorized.

if ! rg -n 'name:\s*"clawchain_list_skill"|name:\s*"clawchain_purchase_skill"|name:\s*"clawchain_create_escrow"|name:\s*"clawchain_query_escrow"|name:\s*"clawchain_agent_reputation"|name:\s*"clawchain_top_agents"' openclaw/extensions/clawchain/src/marketplace-tools.ts openclaw/extensions/clawchain/src/escrow-tools.ts openclaw/extensions/clawchain/src/reputation-tools.ts >/dev/null; then
  echo "ERROR: OpenClaw marketplace/escrow/reputation tool coverage is incomplete." >&2
  exit 1
fi

if ! rg -n 'listSkill\(|purchaseSkill\(|createEscrow\(|completeEscrow\(|disputeEscrow\(|rateAgent\(|endorseAgent\(|getReputation\(|getTopAgents\(' sdk/src/agent.ts sdk/src/client.ts >/dev/null; then
  echo "ERROR: SDK marketplace/escrow/reputation lifecycle methods are incomplete." >&2
  exit 1
fi

if ! rg -n 'Marketplace Module|Escrow|Reputation|purchase-skill|create-escrow|reputation' demo/demo.sh testnet/test-scenarios.sh >/dev/null; then
  echo "ERROR: demo/testnet marketplace/escrow/reputation scenario coverage is incomplete." >&2
  exit 1
fi

if ! rg -n 'Marketplace/Escrow/Reputation Flow|tx marketplace list-skill|tx marketplace create-escrow|query reputation top_agents' docs/operator-quickstart.md >/dev/null; then
  echo "ERROR: operator docs marketplace/escrow/reputation flow is missing." >&2
  exit 1
fi

echo "slice-d marketplace/escrow/reputation operatorization gate passed."
