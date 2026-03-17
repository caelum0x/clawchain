#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CHAIN_REGISTRY_DIR="$ROOT/vendor/keplr-chain-registry"
KEPLR_WALLET_DIR="$ROOT/vendor/keplr-wallet"

required_files=(
  "$CHAIN_REGISTRY_DIR/cosmos/clawchain.json"
  "$CHAIN_REGISTRY_DIR/cosmos/clawchain-testnet.json"
  "$CHAIN_REGISTRY_DIR/images/clawchain/chain.png"
  "$CHAIN_REGISTRY_DIR/images/clawchain/uclaw.png"
  "$CHAIN_REGISTRY_DIR/images/clawchain-testnet/chain.png"
  "$CHAIN_REGISTRY_DIR/images/clawchain-testnet/uclaw.png"
  "$KEPLR_WALLET_DIR/apps/extension/src/config.ts"
)

for f in "${required_files[@]}"; do
  [[ -f "$f" ]] || { echo "missing required file: $f" >&2; exit 1; }
done

jq -e . "$CHAIN_REGISTRY_DIR/cosmos/clawchain.json" >/dev/null
jq -e . "$CHAIN_REGISTRY_DIR/cosmos/clawchain-testnet.json" >/dev/null

grep -q 'chainId: "clawchain-1"' "$KEPLR_WALLET_DIR/apps/extension/src/config.ts"
grep -q 'chainId: "clawchain-testnet-1"' "$KEPLR_WALLET_DIR/apps/extension/src/config.ts"

echo "ok: clawchain keplr fork wiring files are present"
