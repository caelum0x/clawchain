#!/usr/bin/env bash
#
# model-token-real-models.sh — register real OpenRouter-backed model-token
# presets on a running local testnet.
#
# Prereqs:
#   - `bash scripts/testnet/local-multinode.sh up 4` is already running.
#   - `go build -o build/clawchaind ./cmd/clawchaind/` has been run.
#   - `cd cmd/clawd && npm run build` has been run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BINARY="${BINARY:-$REPO_ROOT/build/clawchaind}"
CLAWD="${CLAWD:-$REPO_ROOT/cmd/clawd/dist/main.js}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
NODE_URL="${NODE_URL:-http://localhost:26657}"
HOME_DIR="${HOME_DIR:-$REPO_ROOT/.testnet-multinode/validator0}"
KEY_NAME="${KEY_NAME:-validator0}"
GAS_PRICES="${GAS_PRICES:-0.0001uclaw}"
OWNER_MNEMONIC="${OWNER_MNEMONIC:-test test test test test test test test test test test junk}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$REPO_ROOT/.tmp/model-token-real-models}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 required"; exit 1; }; }
wait_tx() {
  local hash="$1"
  for _ in $(seq 1 20); do
    if "$BINARY" query tx "$hash" --node "$NODE_URL" --output json >/tmp/claw-real-model-tx.json 2>/dev/null; then
      local code
      code="$(jq -r '.code // 0' /tmp/claw-real-model-tx.json)"
      [ "$code" = "0" ] || { cat /tmp/claw-real-model-tx.json; return 1; }
      return 0
    fi
    sleep 1
  done
  echo "ERROR: tx $hash was not included"
  return 1
}

need jq
need node
[ -x "$BINARY" ] || { echo "ERROR: missing chain binary at $BINARY"; exit 1; }
[ -f "$CLAWD" ] || { echo "ERROR: missing built clawd at $CLAWD"; exit 1; }

curl -fsS "$NODE_URL/status" >/dev/null

echo "== verify OpenRouter public model list =="
node --input-type=module <<'NODE'
const required = ["anthropic/claude-opus-4.8", "qwen/qwen3.7-max"];
const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10000) });
if (!res.ok) throw new Error(`OpenRouter models HTTP ${res.status}`);
const data = await res.json();
const ids = new Set((data.data ?? []).map((model) => model.id));
const missing = required.filter((id) => !ids.has(id));
if (missing.length > 0) throw new Error(`Missing OpenRouter models: ${missing.join(", ")}`);
console.log(JSON.stringify({ verified: required }));
NODE

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/owner"

OWNER_ADDR="$(
  OWNER_MNEMONIC="$OWNER_MNEMONIC" node --input-type=module <<'NODE'
import { DirectSecp256k1HdWallet } from "./cmd/clawd/node_modules/@cosmjs/proto-signing/build/directsecp256k1hdwallet.js";
const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.OWNER_MNEMONIC, { prefix: "claw" });
const [owner] = await wallet.getAccounts();
console.log(owner.address);
NODE
)"

OWNER_HOME="$ARTIFACT_DIR/owner"
OWNER_HOME="$OWNER_HOME" OWNER_ADDR="$OWNER_ADDR" node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(join(process.env.OWNER_HOME, "clawd.json"), JSON.stringify({
  chainId: process.env.CHAIN_ID ?? "clawchain-testnet-1",
  rpcUrl: process.env.NODE_URL ?? "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: false,
  nodeHome: ".testnet-multinode/validator0",
  agentAddress: process.env.OWNER_ADDR,
  denom: "uclaw",
  prefix: "claw",
  gasPrice: process.env.GAS_PRICES ?? "0.0001uclaw",
}, null, 2));
NODE
CLAWD_HOME="$OWNER_HOME" OWNER_MNEMONIC="$OWNER_MNEMONIC" node --input-type=module -e \
  'const { saveMnemonic } = await import("./cmd/clawd/dist/lib/mnemonic.js"); saveMnemonic(process.env.OWNER_MNEMONIC);'

echo "== fund owner =="
fund_tx="$("$BINARY" tx bank send "$KEY_NAME" "$OWNER_ADDR" 50000000uclaw \
  --home "$HOME_DIR" --keyring-backend test --chain-id "$CHAIN_ID" --node "$NODE_URL" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" --broadcast-mode sync --output json -y | jq -r '.txhash')"
wait_tx "$fund_tx"

issue_preset() {
  local preset="$1"
  local artifact="$2"
  echo "== issue real model preset: $preset =="
  CLAWD_HOME="$OWNER_HOME" node "$CLAWD" model-token issue --preset "$preset" --supply 1000000 --json \
    | tee "$ARTIFACT_DIR/$artifact.json"
  wait_tx "$(jq -r '.issue_tx_hash' "$ARTIFACT_DIR/$artifact.json")"
}

issue_preset "claude-opus-4.8" "claude-opus-4-8"
issue_preset "qwen3.7-max" "qwen3-7-max"

"$BINARY" query modelregistry models --node "$NODE_URL" --output json \
  | tee "$ARTIFACT_DIR/models.json" >/dev/null

for uri in "openrouter:anthropic/claude-opus-4.8" "openrouter:qwen/qwen3.7-max"; do
  count="$(jq -r --arg uri "$uri" '[.models[]? | select(.storage_uri == $uri or .storageUri == $uri)] | length' "$ARTIFACT_DIR/models.json")"
  [ "$count" -ge 1 ] || { echo "ERROR: missing registered model storage URI $uri"; exit 1; }
done

jq -n \
  --arg owner "$OWNER_ADDR" \
  --arg fund_tx "$fund_tx" \
  --arg claude_tx "$(jq -r '.issue_tx_hash' "$ARTIFACT_DIR/claude-opus-4-8.json")" \
  --arg qwen_tx "$(jq -r '.issue_tx_hash' "$ARTIFACT_DIR/qwen3-7-max.json")" \
  --arg claude_denom "$(jq -r '.denom' "$ARTIFACT_DIR/claude-opus-4-8.json")" \
  --arg qwen_denom "$(jq -r '.denom' "$ARTIFACT_DIR/qwen3-7-max.json")" \
  '{owner:$owner, fund_tx:$fund_tx, claude:{openrouter_model:"anthropic/claude-opus-4.8", issue_tx:$claude_tx, denom:$claude_denom}, qwen:{openrouter_model:"qwen/qwen3.7-max", issue_tx:$qwen_tx, denom:$qwen_denom}}' \
  | tee "$ARTIFACT_DIR/summary.json"

echo "real OpenRouter model-token workflow passed; artifacts: $ARTIFACT_DIR"
