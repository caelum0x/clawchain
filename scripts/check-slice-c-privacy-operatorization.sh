#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Slice C goal: privacy transfer lifecycle is fully operatorized.

if ! rg -n 'name:\s*"clawchain_shield"|name:\s*"clawchain_private_transfer"|name:\s*"clawchain_unshield"|name:\s*"clawchain_tree_stats"|name:\s*"clawchain_root_history"' openclaw/extensions/clawchain/src/tools.ts >/dev/null; then
  echo "ERROR: OpenClaw privacy lifecycle tool coverage is incomplete." >&2
  exit 1
fi

if ! rg -n 'shieldTokens\(|privateTransfer\(|unshieldTokens\(|getMerkleRoot\(|getTreeStats\(|getRootHistory\(' sdk/src/agent.ts sdk/src/client.ts >/dev/null; then
  echo "ERROR: SDK privacy lifecycle methods are incomplete." >&2
  exit 1
fi

if ! rg -n 'Privacy Module \(Shield\)|tx privacy shield|root_history' demo/demo.sh testnet/test-scenarios.sh >/dev/null; then
  echo "ERROR: demo/testnet privacy lifecycle scenario coverage is incomplete." >&2
  exit 1
fi

if ! rg -n 'Privacy Lifecycle Flow|tx privacy shield|query privacy root_history|tx privacy unshield' docs/operator-quickstart.md >/dev/null; then
  echo "ERROR: operator docs privacy lifecycle flow is missing." >&2
  exit 1
fi

echo "slice-c privacy operatorization gate passed."
