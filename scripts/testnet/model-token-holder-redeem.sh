#!/usr/bin/env bash
#
# model-token-holder-redeem.sh — live holder redemption workflow for a running
# local testnet. Proves a non-admin holder can receive a model token, self-burn
# it, submit an on-chain inference job, and have the provider complete the job.
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
HOLDER_MNEMONIC="${HOLDER_MNEMONIC:-abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$REPO_ROOT/.tmp/model-token-holder-redeem}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 required"; exit 1; }; }
wait_tx() {
  local hash="$1"
  for _ in $(seq 1 20); do
    if "$BINARY" query tx "$hash" --node "$NODE_URL" --output json >/tmp/claw-tx.json 2>/dev/null; then
      local code
      code="$(jq -r '.code // 0' /tmp/claw-tx.json)"
      [ "$code" = "0" ] || { cat /tmp/claw-tx.json; return 1; }
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

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/owner" "$ARTIFACT_DIR/holder"

addresses="$(
  OWNER_MNEMONIC="$OWNER_MNEMONIC" HOLDER_MNEMONIC="$HOLDER_MNEMONIC" node --input-type=module <<'NODE'
import { DirectSecp256k1HdWallet } from "./cmd/clawd/node_modules/@cosmjs/proto-signing/build/directsecp256k1hdwallet.js";
const ownerWallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.OWNER_MNEMONIC, { prefix: "claw" });
const holderWallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.HOLDER_MNEMONIC, { prefix: "claw" });
const [owner] = await ownerWallet.getAccounts();
const [holder] = await holderWallet.getAccounts();
console.log(JSON.stringify({ owner: owner.address, holder: holder.address }));
NODE
)"
OWNER_ADDR="$(jq -r '.owner' <<<"$addresses")"
HOLDER_ADDR="$(jq -r '.holder' <<<"$addresses")"

OWNER_HOME="$ARTIFACT_DIR/owner"
HOLDER_HOME="$ARTIFACT_DIR/holder"
OWNER_HOME="$OWNER_HOME" HOLDER_HOME="$HOLDER_HOME" OWNER_ADDR="$OWNER_ADDR" HOLDER_ADDR="$HOLDER_ADDR" node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const cfg = (address) => ({
  chainId: process.env.CHAIN_ID ?? "clawchain-testnet-1",
  rpcUrl: process.env.NODE_URL ?? "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: false,
  nodeHome: ".testnet-multinode/validator0",
  agentAddress: address,
  denom: "uclaw",
  prefix: "claw",
  gasPrice: process.env.GAS_PRICES ?? "0.0001uclaw",
});
writeFileSync(join(process.env.OWNER_HOME, "clawd.json"), JSON.stringify(cfg(process.env.OWNER_ADDR), null, 2));
writeFileSync(join(process.env.HOLDER_HOME, "clawd.json"), JSON.stringify(cfg(process.env.HOLDER_ADDR), null, 2));
NODE
CLAWD_HOME="$OWNER_HOME" OWNER_MNEMONIC="$OWNER_MNEMONIC" node --input-type=module -e \
  'const { saveMnemonic } = await import("./cmd/clawd/dist/lib/mnemonic.js"); saveMnemonic(process.env.OWNER_MNEMONIC);'
CLAWD_HOME="$HOLDER_HOME" HOLDER_MNEMONIC="$HOLDER_MNEMONIC" node --input-type=module -e \
  'const { saveMnemonic } = await import("./cmd/clawd/dist/lib/mnemonic.js"); saveMnemonic(process.env.HOLDER_MNEMONIC);'

echo "== fund owner and holder =="
owner_fund="$("$BINARY" tx bank send "$KEY_NAME" "$OWNER_ADDR" 50000000uclaw \
  --home "$HOME_DIR" --keyring-backend test --chain-id "$CHAIN_ID" --node "$NODE_URL" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" --broadcast-mode sync --output json -y | jq -r '.txhash')"
wait_tx "$owner_fund"
holder_fund="$("$BINARY" tx bank send "$KEY_NAME" "$HOLDER_ADDR" 50000000uclaw \
  --home "$HOME_DIR" --keyring-backend test --chain-id "$CHAIN_ID" --node "$NODE_URL" \
  --gas auto --gas-adjustment 1.4 --gas-prices "$GAS_PRICES" --broadcast-mode sync --output json -y | jq -r '.txhash')"
wait_tx "$holder_fund"

MODEL="holder-redeem-$(date +%s)"
echo "== issue model token: $MODEL =="
CLAWD_HOME="$OWNER_HOME" node "$CLAWD" model-token issue --model "$MODEL" --supply 1000000 --json \
  | tee "$ARTIFACT_DIR/issue.json"
DENOM="$(jq -r '.denom' "$ARTIFACT_DIR/issue.json")"
issue_tx="$(jq -r '.issue_tx_hash' "$ARTIFACT_DIR/issue.json")"
wait_tx "$issue_tx"

MODEL_ID="$("$BINARY" query modelregistry models --node "$NODE_URL" --output json \
  | jq -r --arg name "$MODEL" '.models[]? | select(.name == $name) | .id' | tail -n 1)"
[ -n "$MODEL_ID" ] && [ "$MODEL_ID" != "null" ] || { echo "ERROR: could not resolve model id for $MODEL"; exit 1; }

echo "== configure inference for model $MODEL_ID =="
CLAWD_HOME="$OWNER_HOME" node "$CLAWD" model-token inference-setup \
  --model-id "$MODEL_ID" --min-payment-uclaw 0 --max-tokens 512 \
  --register-provider --endpoint clawchain://owner-provider --json \
  | tee "$ARTIFACT_DIR/inference-setup.json"
wait_tx "$(jq -r '.setup_tx_hash' "$ARTIFACT_DIR/inference-setup.json")"

echo "== transfer model tokens to holder =="
CLAWD_HOME="$OWNER_HOME" node "$CLAWD" wallet send "$HOLDER_ADDR" 0.0001 --denom "$DENOM" \
  | tee "$ARTIFACT_DIR/transfer.txt"
transfer_tx="$(awk '/TxHash:/ {print $2}' "$ARTIFACT_DIR/transfer.txt")"
wait_tx "$transfer_tx"

echo "== holder redeem =="
CLAWD_HOME="$HOLDER_HOME" node "$CLAWD" model-token redeem \
  --model-id "$MODEL_ID" --denom "$DENOM" --amount 100 \
  --input "live holder self-burn redemption acceptance" --max-tokens 64 --payment-uclaw 0 --json \
  | tee "$ARTIFACT_DIR/redeem.json"
redeem_tx="$(jq -r '.redeem_tx_hash' "$ARTIFACT_DIR/redeem.json")"
wait_tx "$redeem_tx"
job_id="$(jq -r '.job_id' "$ARTIFACT_DIR/redeem.json")"

echo "== provider serve loop =="
CLAWD_HOME="$OWNER_HOME" node "$CLAWD" model-token serve-loop \
  --model-id "$MODEL_ID" --max-jobs 1 --max-cycles 1 --interval-ms 0 \
  --output '{"response":"served job {job_id} for {requester}: {input}"}' --json \
  | tee "$ARTIFACT_DIR/serve-loop.json"
served_job_id="$(jq -r '.jobs[0].job_id' "$ARTIFACT_DIR/serve-loop.json")"
[ "$served_job_id" = "$job_id" ] || { echo "ERROR: provider served job $served_job_id, expected $job_id"; exit 1; }
start_tx="$(jq -r '.jobs[0].start_tx_hash' "$ARTIFACT_DIR/serve-loop.json")"
complete_tx="$(jq -r '.jobs[0].complete_tx_hash' "$ARTIFACT_DIR/serve-loop.json")"
wait_tx "$start_tx"
wait_tx "$complete_tx"

"$BINARY" query modelregistry inference-job "$job_id" --node "$NODE_URL" --output json \
  | tee "$ARTIFACT_DIR/job.json" >/dev/null
job_status="$(jq -r '.job.status' "$ARTIFACT_DIR/job.json")"
[ "$job_status" = "completed" ] || {
  echo "ERROR: expected completed job status, got $job_status"
  cat "$ARTIFACT_DIR/job.json"
  exit 1
}

jq -n \
  --arg owner "$OWNER_ADDR" \
  --arg holder "$HOLDER_ADDR" \
  --arg model "$MODEL" \
  --arg model_id "$MODEL_ID" \
  --arg denom "$DENOM" \
  --arg issue_tx "$issue_tx" \
  --arg setup_tx "$(jq -r '.setup_tx_hash' "$ARTIFACT_DIR/inference-setup.json")" \
  --arg transfer_tx "$transfer_tx" \
  --arg redeem_tx "$redeem_tx" \
  --arg start_tx "$start_tx" \
  --arg complete_tx "$complete_tx" \
  --arg job_id "$job_id" \
  --arg job_status "$job_status" \
  '{owner:$owner, holder:$holder, model:$model, model_id:$model_id, denom:$denom, issue_tx:$issue_tx, setup_tx:$setup_tx, transfer_tx:$transfer_tx, redeem_tx:$redeem_tx, start_tx:$start_tx, complete_tx:$complete_tx, job_id:$job_id, job_status:$job_status}' \
  | tee "$ARTIFACT_DIR/summary.json"

echo "holder redemption completion workflow passed; artifacts: $ARTIFACT_DIR"
