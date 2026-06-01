#!/usr/bin/env bash
#
# model-vault-demo.sh — best-effort live demo of the P2 ModelVault bonding-curve
# contract (docs/plans/2026-06-01-ai-model-tokens.md). On a running local testnet it:
#
#   1. builds (if needed) and stores the model-vault wasm,
#   2. issues a model token (tokenfactory denom factory/<issuer>/<subdenom>),
#   3. instantiates the vault for that model_denom + uclaw reserve,
#   4. Funds the vault with reserve (uclaw) + inventory (model token),
#   5. Buys model tokens with CLAW and asserts price rose,
#   6. Sells model tokens back for CLAW and asserts price fell,
#
# and prints PASS / FAIL.
#
# Prereqs:
#   - `bash scripts/testnet/local-multinode.sh up 4` is already running.
#   - `go build -o build/clawchaind ./cmd/clawchaind/` has been run.
#   - The model-vault wasm exists, or a wasm toolchain is available to build it:
#       cd contracts/model-vault && cargo build --target wasm32-unknown-unknown --release
#
# This uses ONLY `clawchaind` (tokenfactory + x/wasm) so it has no extra dependencies.
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
SUBDENOM="${SUBDENOM:-vaultdemo$(date +%s)}"

# Curve seed + trade sizes.
SEED_RESERVE="${SEED_RESERVE:-1000000}"
SEED_INVENTORY="${SEED_INVENTORY:-1000000}"
BUY_RESERVE="${BUY_RESERVE:-200000}"

fail() { echo "FAIL: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 required"; }

need jq
need curl
[ -x "$BINARY" ] || fail "missing chain binary at $BINARY (go build -o build/clawchaind ./cmd/clawchaind/)"
curl -fsS "$NODE_URL/status" >/dev/null 2>&1 || fail "no testnet at $NODE_URL (run scripts/testnet/local-multinode.sh up 4)"

# Build the wasm if it isn't there yet.
#
# IMPORTANT (wasm packaging): a raw `cargo build --target wasm32-unknown-unknown
# --release` artifact is NOT chain-loadable here — modern rustc emits post-MVP wasm
# (bulk-memory/sign-ext) that the chain's wasmvm rejects ("bulk memory support is not
# enabled" / deserialization error). Produce a chain-loadable, MVP-compatible artifact
# with the CosmWasm optimizer, then point WASM at it:
#   docker run --rm -v "$PWD":/code -w /code/contracts/model-vault \
#     cosmwasm/optimizer:0.16.0
#   WASM=contracts/model-vault/artifacts/model_vault.wasm bash scripts/testnet/model-vault-demo.sh
# The contract logic itself is fully verified offline via cw-multi-test (cargo test).
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

# Discover a funded signing key from the validator0 keyring.
KEY_NAME="${KEY_NAME:-$("$BINARY" keys list --home "$HOME_DIR" --keyring-backend "$KEYRING" --output json 2>/dev/null | jq -r '.[0].name // empty')}"
[ -n "$KEY_NAME" ] || fail "no key found in keyring at $HOME_DIR"
ISSUER="$("$BINARY" keys show "$KEY_NAME" -a --home "$HOME_DIR" --keyring-backend "$KEYRING")"
echo "== signer: $KEY_NAME ($ISSUER) =="

wait_tx() {
  local hash="$1"
  for _ in $(seq 1 30); do
    if "$BINARY" query tx "$hash" "${Q[@]}" >/tmp/mv-tx.json 2>/dev/null; then
      local code; code="$(jq -r '.code // 0' /tmp/mv-tx.json)"
      [ "$code" = "0" ] || { cat /tmp/mv-tx.json >&2; fail "tx $hash failed code=$code"; }
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
  # `--gas auto` prints "gas estimate: N" to stderr, so $out is not pure JSON; pull the
  # txhash out directly rather than feeding the whole blob to jq.
  hash="$(printf '%s' "$out" | grep -oE '"txhash":"[A-Fa-f0-9]+"' | head -1 | cut -d'"' -f4)"
  [ -n "$hash" ] || { echo "$out" >&2; fail "$desc: no txhash"; }
  wait_tx "$hash"
  echo "$hash"
}

# Spot price as a rational reserve/inventory; print reserve*1e9/inventory for comparison.
pool_price_x() { # args: reserve inventory
  echo $(( $1 * 1000000000 / $2 ))
}
query_pool() { # echoes "reserve inventory"
  "$BINARY" query wasm contract-state smart "$VAULT" '{"pool":{}}' "${Q[@]}" \
    | jq -r '.data | "\(.reserve) \(.inventory)"'
}

echo "== 1. create model-token denom factory/$ISSUER/$SUBDENOM =="
submit "create-denom" tx tokenfactory create-denom "$SUBDENOM" --from "$KEY_NAME" >/dev/null
MODEL_DENOM="factory/$ISSUER/$SUBDENOM"
echo "   model_denom=$MODEL_DENOM"

echo "== 2. mint model tokens to issuer =="
# tokenfactory mint takes [amount] [denom] as TWO positional args (not combined).
submit "mint" tx tokenfactory mint "$((SEED_INVENTORY * 2))" "$MODEL_DENOM" --from "$KEY_NAME" >/dev/null

echo "== 3. store model-vault wasm =="
STORE_HASH="$(submit "store" tx wasm store "$WASM" --from "$KEY_NAME")"
CODE_ID="$("$BINARY" query tx "$STORE_HASH" "${Q[@]}" | jq -r '
  [.events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value] | last')"
[ -n "$CODE_ID" ] && [ "$CODE_ID" != "null" ] || fail "could not parse code_id"
echo "   code_id=$CODE_ID"

echo "== 4. instantiate vault =="
INIT_MSG="$(jq -nc --arg md "$MODEL_DENOM" --arg owner "$ISSUER" \
  '{model_denom:$md, reserve_denom:"uclaw", owner:$owner}')"
INST_HASH="$(submit "instantiate" tx wasm instantiate "$CODE_ID" "$INIT_MSG" \
  --label "model-vault-demo" --admin "$ISSUER" --from "$KEY_NAME")"
VAULT="$("$BINARY" query tx "$INST_HASH" "${Q[@]}" | jq -r '
  [.events[] | select(.type=="instantiate") | .attributes[] | select(.key=="_contract_address") | .value] | last')"
[ -n "$VAULT" ] && [ "$VAULT" != "null" ] || fail "could not parse contract address"
echo "   vault=$VAULT"

echo "== 5. fund vault: ${SEED_RESERVE}uclaw + ${SEED_INVENTORY}${MODEL_DENOM} =="
submit "fund" tx wasm execute "$VAULT" '{"fund":{}}' \
  --amount "${SEED_RESERVE}uclaw,${SEED_INVENTORY}${MODEL_DENOM}" --from "$KEY_NAME" >/dev/null
read -r R0 I0 <<<"$(query_pool)"
P0="$(pool_price_x "$R0" "$I0")"
echo "   pool reserve=$R0 inventory=$I0 price_x1e9=$P0"

echo "== 6. BUY with ${BUY_RESERVE}uclaw =="
submit "buy" tx wasm execute "$VAULT" '{"buy":{}}' \
  --amount "${BUY_RESERVE}uclaw" --from "$KEY_NAME" >/dev/null
read -r R1 I1 <<<"$(query_pool)"
P1="$(pool_price_x "$R1" "$I1")"
echo "   pool reserve=$R1 inventory=$I1 price_x1e9=$P1"
[ "$P1" -gt "$P0" ] || fail "price did not rise after Buy ($P0 -> $P1)"

# Sell back roughly what we just bought (inventory delta).
SELL_AMT="$(( I0 - I1 ))"
[ "$SELL_AMT" -gt 0 ] || fail "buy produced no inventory delta to sell"
echo "== 7. SELL ${SELL_AMT}${MODEL_DENOM} =="
submit "sell" tx wasm execute "$VAULT" '{"sell":{}}' \
  --amount "${SELL_AMT}${MODEL_DENOM}" --from "$KEY_NAME" >/dev/null
read -r R2 I2 <<<"$(query_pool)"
P2="$(pool_price_x "$R2" "$I2")"
echo "   pool reserve=$R2 inventory=$I2 price_x1e9=$P2"
[ "$P2" -lt "$P1" ] || fail "price did not fall after Sell ($P1 -> $P2)"

echo
echo "PASS: vault $VAULT — Buy raised price ($P0 -> $P1), Sell lowered it ($P1 -> $P2)"
