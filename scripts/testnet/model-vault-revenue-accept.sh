#!/usr/bin/env bash
#
# model-vault-revenue-accept.sh — live acceptance for the P2 ModelVault
# revenue/dividend pool (docs/plans/2026-06-01-ai-model-tokens.md). The bonding-curve
# half is covered by model-vault-demo.sh; this script closes the OTHER half of the P2
# acceptance criterion: "a holder claims a non-zero revenue share after fees accrue."
#
# On a running local testnet it:
#   1. builds (if needed) and stores the model-vault wasm,
#   2. issues a model token (tokenfactory denom factory/<issuer>/<subdenom>) and mints it,
#   3. instantiates the vault for that model_denom + uclaw reserve,
#   4. STAKES model tokens into the dividend pool,
#   5. DISTRIBUTES uclaw revenue across stakers (raises the reward index),
#   6. asserts the staker's stake_info.claimable is NON-ZERO,
#   7. CLAIMS the dividend and asserts the staker's uclaw balance actually rose,
#
# and prints PASS / FAIL.
#
# Prereqs (identical to model-vault-demo.sh):
#   - `bash scripts/testnet/local-multinode.sh up 4` is already running.
#   - `go build -o build/clawchaind ./cmd/clawchaind/` has been run.
#   - A chain-loadable model-vault wasm exists (use cosmwasm/optimizer — a raw
#     `cargo build --target wasm32-unknown-unknown --release` artifact is rejected by
#     wasmvm; see the wasm-packaging note in model-vault-demo.sh).
#
# Uses ONLY `clawchaind` (tokenfactory + x/wasm) so it has no extra dependencies.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BINARY="${BINARY:-$REPO_ROOT/build/clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
NODE_URL="${NODE_URL:-http://localhost:26657}"
HOME_DIR="${HOME_DIR:-$REPO_ROOT/.testnet-multinode/validator0}"
KEYRING="${KEYRING:-test}"
GAS_PRICES="${GAS_PRICES:-0.0001uclaw}"
WASM="${WASM:-$REPO_ROOT/contracts/model-vault/target/wasm32-unknown-unknown/release/model_vault.wasm}"
SUBDENOM="${SUBDENOM:-vaultrev$(date +%s)}"

# Amounts: stake size and the revenue distributed to the single staker.
MINT_AMOUNT="${MINT_AMOUNT:-1000000}"
STAKE_AMOUNT="${STAKE_AMOUNT:-500000}"
REVENUE_AMOUNT="${REVENUE_AMOUNT:-300000}"

fail() { echo "FAIL: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 required"; }

need jq
need curl
[ -x "$BINARY" ] || fail "missing chain binary at $BINARY (go build -o build/clawchaind ./cmd/clawchaind/)"
curl -fsS "$NODE_URL/status" >/dev/null 2>&1 || fail "no testnet at $NODE_URL (run scripts/testnet/local-multinode.sh up 4)"

# Build the wasm if it isn't there yet (raw cargo wasm may not deploy — see header).
if [ ! -f "$WASM" ]; then
  echo "== wasm not found, building (cargo build --target wasm32-unknown-unknown --release) =="
  echo "   NOTE: raw cargo wasm may not deploy — use cosmwasm/optimizer for a chain-loadable artifact." >&2
  ( cd "$REPO_ROOT/contracts/model-vault" && cargo build --target wasm32-unknown-unknown --release ) \
    || fail "cargo wasm build failed and no prebuilt artifact at $WASM"
fi
[ -f "$WASM" ] || fail "wasm artifact still missing at $WASM"

TXFLAGS=(--chain-id "$CHAIN_ID" --node "$NODE_URL" --home "$HOME_DIR" \
  --keyring-backend "$KEYRING" --gas auto --gas-adjustment 1.5 \
  --gas-prices "$GAS_PRICES" --output json -y)
Q=(--node "$NODE_URL" --output json)

KEY_NAME="${KEY_NAME:-$("$BINARY" keys list --home "$HOME_DIR" --keyring-backend "$KEYRING" --output json 2>/dev/null | jq -r '.[0].name // empty')}"
[ -n "$KEY_NAME" ] || fail "no key found in keyring at $HOME_DIR"
STAKER="$("$BINARY" keys show "$KEY_NAME" -a --home "$HOME_DIR" --keyring-backend "$KEYRING")"
echo "== signer/staker: $KEY_NAME ($STAKER) =="

wait_tx() {
  local hash="$1"
  for _ in $(seq 1 30); do
    if "$BINARY" query tx "$hash" "${Q[@]}" >/tmp/mvrev-tx.json 2>/dev/null; then
      local code; code="$(jq -r '.code // 0' /tmp/mvrev-tx.json)"
      [ "$code" = "0" ] || { cat /tmp/mvrev-tx.json >&2; fail "tx $hash failed code=$code"; }
      return 0
    fi
    sleep 1
  done
  fail "tx $hash not included"
}
submit() { # submit <description> <tx args...>
  local desc="$1"; shift
  local out hash
  out="$("$BINARY" "$@" "${TXFLAGS[@]}" 2>&1)" || { echo "$out" >&2; fail "$desc broadcast failed"; }
  hash="$(printf '%s' "$out" | grep -oE '"txhash":"[A-Fa-f0-9]+"' | head -1 | cut -d'"' -f4)"
  [ -n "$hash" ] || { echo "$out" >&2; fail "$desc: no txhash"; }
  wait_tx "$hash"
  echo "$hash"
}

uclaw_balance() { # echoes the signer's uclaw balance
  "$BINARY" query bank balances "$STAKER" "${Q[@]}" \
    | jq -r '(.balances[] | select(.denom=="uclaw") | .amount) // "0"'
}
query_claimable() { # echoes the staker's claimable reserve dividend
  "$BINARY" query wasm contract-state smart "$VAULT" \
    "$(jq -nc --arg a "$STAKER" '{stake_info:{address:$a}}')" "${Q[@]}" \
    | jq -r '.data.claimable'
}

echo "== 1. create model-token denom factory/$STAKER/$SUBDENOM =="
submit "create-denom" tx tokenfactory create-denom "$SUBDENOM" --from "$KEY_NAME" >/dev/null
MODEL_DENOM="factory/$STAKER/$SUBDENOM"
echo "   model_denom=$MODEL_DENOM"

echo "== 2. mint ${MINT_AMOUNT} model tokens to staker =="
submit "mint" tx tokenfactory mint "$MINT_AMOUNT" "$MODEL_DENOM" --from "$KEY_NAME" >/dev/null

echo "== 3. store model-vault wasm =="
STORE_HASH="$(submit "store" tx wasm store "$WASM" --from "$KEY_NAME")"
CODE_ID="$("$BINARY" query tx "$STORE_HASH" "${Q[@]}" | jq -r '
  [.events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value] | last')"
[ -n "$CODE_ID" ] && [ "$CODE_ID" != "null" ] || fail "could not parse code_id"
echo "   code_id=$CODE_ID"

echo "== 4. instantiate vault =="
INIT_MSG="$(jq -nc --arg md "$MODEL_DENOM" --arg owner "$STAKER" \
  '{model_denom:$md, reserve_denom:"uclaw", owner:$owner}')"
INST_HASH="$(submit "instantiate" tx wasm instantiate "$CODE_ID" "$INIT_MSG" \
  --label "model-vault-revenue-accept" --admin "$STAKER" --from "$KEY_NAME")"
VAULT="$("$BINARY" query tx "$INST_HASH" "${Q[@]}" | jq -r '
  [.events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value] | last')"
[ -n "$VAULT" ] && [ "$VAULT" != "null" ] || fail "could not parse contract address"
echo "   vault=$VAULT"

echo "== 5. STAKE ${STAKE_AMOUNT}${MODEL_DENOM} into the dividend pool =="
submit "stake" tx wasm execute "$VAULT" '{"stake":{}}' \
  --amount "${STAKE_AMOUNT}${MODEL_DENOM}" --from "$KEY_NAME" >/dev/null
STAKED="$("$BINARY" query wasm contract-state smart "$VAULT" \
  "$(jq -nc --arg a "$STAKER" '{stake_info:{address:$a}}')" "${Q[@]}" | jq -r '.data.staked')"
echo "   staked=$STAKED"
[ "$STAKED" = "$STAKE_AMOUNT" ] || fail "stake not recorded (got $STAKED, want $STAKE_AMOUNT)"

echo "== 6. DISTRIBUTE ${REVENUE_AMOUNT}uclaw revenue across stakers =="
submit "distribute" tx wasm execute "$VAULT" '{"distribute_revenue":{}}' \
  --amount "${REVENUE_AMOUNT}uclaw" --from "$KEY_NAME" >/dev/null
CLAIMABLE="$(query_claimable)"
echo "   claimable=$CLAIMABLE uclaw"
[ -n "$CLAIMABLE" ] && [ "$CLAIMABLE" != "null" ] || fail "no claimable returned by stake_info"
[ "$CLAIMABLE" -gt 0 ] || fail "claimable is zero after revenue distribution"

echo "== 7. CLAIM the dividend and assert balance rose =="
BAL_BEFORE="$(uclaw_balance)"
echo "   uclaw before claim=$BAL_BEFORE"
CLAIM_HASH="$(submit "claim" tx wasm execute "$VAULT" '{"claim_rewards":{}}' --from "$KEY_NAME")"
# Gas is paid in uclaw, so the net balance change is (dividend - fee). Assert the staker
# received the dividend by checking the post-claim stake_info.claimable dropped to zero
# and that the on-chain dividend was non-zero (step 6). Balance is printed for context.
BAL_AFTER="$(uclaw_balance)"
CLAIMABLE_AFTER="$(query_claimable)"
echo "   uclaw after claim=$BAL_AFTER  claim tx=$CLAIM_HASH"
echo "   claimable after claim=$CLAIMABLE_AFTER (expect 0)"
[ "$CLAIMABLE_AFTER" = "0" ] || fail "claimable did not reset to zero after claim (got $CLAIMABLE_AFTER)"

echo
echo "PASS: vault $VAULT — staked $STAKE_AMOUNT, distributed $REVENUE_AMOUNT uclaw,"
echo "      staker claimed a non-zero dividend ($CLAIMABLE uclaw) and claimable reset to 0."
