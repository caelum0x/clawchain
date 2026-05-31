#!/usr/bin/env bash
#
# Deploy the prebuilt DEX contracts and create the initial CLAW/ATOM pool on a
# running local devnet.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHAIN_ID="${CHAIN_ID:-clawchain-devnet}"
NODE_URL="${NODE_URL:-http://localhost:26657}"
KEY_NAME="${KEY_NAME:-dev-account}"
GAS_PRICES="${GAS_PRICES:-0.025uclaw}"
GAS="${GAS:-5000000}"
GAS_ADJUSTMENT="${GAS_ADJUSTMENT:-1.5}"
BINARY="${BINARY:-$ROOT_DIR/build/clawchaind}"
HOME_DIR="${HOME_DIR:-$ROOT_DIR/.devnet-node}"

[[ -x "$BINARY" ]] || { echo "missing $BINARY; run scripts/local-dev.sh --devnet"; exit 1; }
curl -s --max-time 2 "$NODE_URL/status" >/dev/null 2>&1 || { echo "devnet RPC not reachable at $NODE_URL"; exit 1; }

CHAIN_ID="$CHAIN_ID" \
NODE_URL="$NODE_URL" \
KEY_NAME="$KEY_NAME" \
GAS_PRICES="$GAS_PRICES" \
GAS="$GAS" \
GAS_ADJUSTMENT="$GAS_ADJUSTMENT" \
BINARY="$BINARY" \
HOME_DIR="$HOME_DIR" \
bash scripts/deploy-dex.sh --skip-build --force
