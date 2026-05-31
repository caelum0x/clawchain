#!/usr/bin/env bash
#
# Drive a full Astroport DEX flow on the local single node using the LOCALLY-BUILT
# contracts (contracts/dex/target/.../release/*.wasm) — NOT the prebuilt
# artifacts/*.wasm, which require the Neutron capability the chain doesn't enable.
#
# Flow: instantiate coin-registry -> register native denoms -> instantiate factory
# -> create_pair (uclaw / factory-denom XYK) -> provide liquidity -> swap.
#
# Assumes the four contracts are already stored with these code ids (see
# `clawchaind query wasm list-code`): factory=4, pair=5, cw20_base(LP)=3,
# coin_registry=7. Override via env if different.
#
#   bash scripts/dex-local-swap.sh
set -u  # NOT -e/pipefail: the tx() helper polls and must tolerate empty grep results

HOME_DIR=.local-node
CHAIN=clawchain-local
BIN=./build/clawchaind
DEV=claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h
TF_DENOM="factory/claw1r5v5srda7xfth3hn2s26txvrcrntldju3ufu0h/tf23270"
FACTORY_CODE=${FACTORY_CODE:-4}
PAIR_CODE=${PAIR_CODE:-5}
TOKEN_CODE=${TOKEN_CODE:-3}
REGISTRY_CODE=${REGISTRY_CODE:-7}

COMMON="--from dev-account --keyring-backend test --home $HOME_DIR --chain-id $CHAIN --gas auto --gas-adjustment 1.6 --gas-prices 0.025uclaw --yes --output json"

# Broadcast a tx (args after the function name) and wait for it to commit; echo result code.
tx() {
  local hash
  hash=$($BIN tx "$@" $COMMON 2>/dev/null | grep -o '"txhash":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$hash" ]; then echo "BROADCAST_FAILED"; $BIN tx "$@" $COMMON 2>&1 | tail -2 >&2; return 1; fi
  # poll until indexed
  for _ in $(seq 1 15); do
    sleep 1
    local code
    code=$($BIN query tx "$hash" --home "$HOME_DIR" --output json 2>/dev/null | grep -oE '"code":[0-9]+' | head -1 | grep -oE '[0-9]+')
    if [ -n "$code" ]; then echo "$hash code=$code"; return 0; fi
  done
  echo "$hash TIMEOUT"; return 1
}

echo "== 1) instantiate coin registry (code $REGISTRY_CODE) =="
tx wasm instantiate "$REGISTRY_CODE" "{\"owner\":\"$DEV\"}" --label clawchain-dex-registry --admin "$DEV"
REGISTRY=$($BIN query wasm list-contract-by-code "$REGISTRY_CODE" --home "$HOME_DIR" --output json 2>/dev/null | grep -o 'claw1[a-z0-9]*' | tail -1)
echo "registry=$REGISTRY"

echo "== 2) register native denoms (uclaw, tf denom) =="
tx wasm execute "$REGISTRY" "{\"add\":{\"native_coins\":[[\"uclaw\",6],[\"$TF_DENOM\",6]]}}"

echo "== 3) instantiate factory (code $FACTORY_CODE) =="
FAC_INIT=$(cat <<JSON
{"pair_configs":[{"code_id":$PAIR_CODE,"pair_type":{"xyk":{}},"total_fee_bps":30,"maker_fee_bps":0}],"token_code_id":$TOKEN_CODE,"owner":"$DEV","whitelist_code_id":$TOKEN_CODE,"coin_registry_address":"$REGISTRY"}
JSON
)
tx wasm instantiate "$FACTORY_CODE" "$FAC_INIT" --label clawchain-dex-factory --admin "$DEV"
FACTORY=$($BIN query wasm list-contract-by-code "$FACTORY_CODE" --home "$HOME_DIR" --output json 2>/dev/null | grep -o 'claw1[a-z0-9]*' | tail -1)
echo "factory=$FACTORY"

echo "== 4) create_pair uclaw/$TF_DENOM (xyk) =="
CP="{\"create_pair\":{\"pair_type\":{\"xyk\":{}},\"asset_infos\":[{\"native_token\":{\"denom\":\"uclaw\"}},{\"native_token\":{\"denom\":\"$TF_DENOM\"}}]}}"
tx wasm execute "$FACTORY" "$CP"
PAIR=$($BIN query wasm list-contract-by-code "$PAIR_CODE" --home "$HOME_DIR" --output json 2>/dev/null | grep -o 'claw1[a-z0-9]*' | tail -1)
echo "pair=$PAIR"

echo "== 5) provide liquidity (100000 uclaw + 100000 $TF_DENOM) =="
PL="{\"provide_liquidity\":{\"assets\":[{\"info\":{\"native_token\":{\"denom\":\"uclaw\"}},\"amount\":\"100000\"},{\"info\":{\"native_token\":{\"denom\":\"$TF_DENOM\"}},\"amount\":\"100000\"}]}}"
tx wasm execute "$PAIR" "$PL" --amount "100000uclaw,100000$TF_DENOM"

echo "== 6) swap 5000 uclaw -> $TF_DENOM =="
BEFORE=$($BIN query bank balances "$DEV" --home "$HOME_DIR" --output json 2>/dev/null | python3 -c "import json,sys;b=json.load(sys.stdin)['balances'];print(next((x['amount'] for x in b if x['denom']=='$TF_DENOM'),'0'))")
# max_spread 0.5 tolerates the price impact of a 5000-into-100k swap (XYK slippage +
# 0.3% fee); without it the pair correctly rejects with "exceeds max spread limit".
SW="{\"swap\":{\"offer_asset\":{\"info\":{\"native_token\":{\"denom\":\"uclaw\"}},\"amount\":\"5000\"},\"max_spread\":\"0.5\"}}"
tx wasm execute "$PAIR" "$SW" --amount "5000uclaw"
AFTER=$($BIN query bank balances "$DEV" --home "$HOME_DIR" --output json 2>/dev/null | python3 -c "import json,sys;b=json.load(sys.stdin)['balances'];print(next((x['amount'] for x in b if x['denom']=='$TF_DENOM'),'0'))")
echo "swap delta ($TF_DENOM): $BEFORE -> $AFTER"
echo "DEX flow complete."
