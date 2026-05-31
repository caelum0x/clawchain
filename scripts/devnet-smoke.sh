#!/usr/bin/env bash
#
# Smoke the isolated local devnet started by:
#   bash scripts/local-dev.sh --devnet
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BIN="${CLAWCHAIN_BIN:-$ROOT_DIR/build/clawchaind}"
HOME_DIR="${DEVNET_HOME:-$ROOT_DIR/.devnet-node}"
CHAIN_ID="${CHAIN_ID:-clawchain-devnet}"
NODE="${NODE:-tcp://localhost:26657}"
RPC_URL="${RPC_URL:-http://localhost:26657}"
REST_URL="${REST_URL:-http://localhost:1317}"
KEY="dev-account"
RECIPIENT_KEY="dev-recipient"
KB=(--keyring-backend test --home "$HOME_DIR")
TX=(--chain-id "$CHAIN_ID" --node "$NODE" --gas auto --gas-adjustment 1.6 --gas-prices 0.025uclaw --yes -o json)

PASS=0
FAIL=0
ok() { echo "  OK   $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL + 1)); }

wait_tx() {
  local hash="$1"
  [[ -n "$hash" ]] || { echo "missing-hash"; return; }
  for _ in $(seq 1 20); do
    sleep 1
    code=$("$BIN" query tx "$hash" --node "$NODE" -o json 2>/dev/null | grep -oE '"code":[0-9]+' | head -1 | grep -oE '[0-9]+')
    [[ -n "$code" ]] && { echo "$code"; return; }
  done
  echo "timeout"
}

bcast() {
  "$BIN" tx "$@" "${KB[@]}" "${TX[@]}" 2>/tmp/devnet-smoke.err | grep -o '"txhash":"[^"]*"' | cut -d'"' -f4
}

[[ -x "$BIN" ]] || { echo "missing $BIN; run make build or scripts/local-dev.sh --devnet"; exit 1; }
[[ -d "$HOME_DIR/config" ]] || { echo "missing devnet home $HOME_DIR; run scripts/local-dev.sh --devnet"; exit 1; }

for _ in $(seq 1 20); do
  curl -s --max-time 2 "$RPC_URL/status" >/dev/null 2>&1 && break
  sleep 1
done
HEIGHT=$(curl -s --max-time 2 "$RPC_URL/status" 2>/dev/null | grep -o '"latest_block_height":"[0-9]*"' | grep -oE '[0-9]+' | head -1)
[[ -n "$HEIGHT" && "$HEIGHT" != "0" ]] || { echo "devnet RPC is not producing blocks at $RPC_URL"; exit 1; }
ok "devnet producing blocks (height $HEIGHT)"

DEV_ADDR=$("$BIN" keys show "$KEY" -a "${KB[@]}")
VALOPER=$("$BIN" keys show "$KEY" --bech val -a "${KB[@]}")
if ! "$BIN" keys show "$RECIPIENT_KEY" "${KB[@]}" >/dev/null 2>&1; then
  "$BIN" keys add "$RECIPIENT_KEY" "${KB[@]}" >/dev/null 2>&1
fi
RECIPIENT=$("$BIN" keys show "$RECIPIENT_KEY" -a "${KB[@]}")
PRIV=$(printf 'y\n' | "$BIN" keys export "$KEY" --unarmored-hex --unsafe "${KB[@]}" 2>/dev/null | tr -d '[:space:]')

echo "== bank =="
c=$(wait_tx "$(bcast bank send "$KEY" "$RECIPIENT" 1000uclaw)")
[[ "$c" = "0" ]] && ok "bank send" || bad "bank send (code ${c:-?})"

echo "== tokenfactory =="
SUB="dev$(date +%s)"
c=$(wait_tx "$(bcast tokenfactory create-denom "$SUB" --from "$KEY")")
DENOM="factory/$DEV_ADDR/$SUB"
if [[ "$c" = "0" ]]; then
  c2=$(wait_tx "$(bcast tokenfactory mint 1000000 "$DENOM" --from "$KEY")")
  [[ "$c2" = "0" ]] && ok "tokenfactory create + mint" || bad "tokenfactory mint (code ${c2:-?})"
else
  bad "tokenfactory create-denom (code ${c:-?})"
fi

echo "== privacy shield =="
shield_count=$(PRIV_HEX="$PRIV" RPC_URL="$RPC_URL" npx --prefix cmd/clawd tsx cmd/clawd/scripts/live-shield-check.ts 2>/tmp/devnet-shield.err | grep -c "SUCCESS")
[[ "$shield_count" = "1" ]] && ok "privacy shield" || bad "privacy shield"

echo "== oracle =="
oracle_count=$(PRIV_HEX="$PRIV" RPC_URL="$RPC_URL" VALOPER="$VALOPER" SALT=dev1 npx --prefix cmd/clawd tsx cmd/clawd/scripts/live-oracle-check.ts 2>/tmp/devnet-oracle.err | grep -c "SUCCESS")
[[ "$oracle_count" = "1" ]] && ok "oracle commit-reveal" || bad "oracle commit-reveal"

echo "== agent + marketplace =="
modules_count=$(PRIV_HEX="$PRIV" RPC_URL="$RPC_URL" npx --prefix cmd/clawd tsx cmd/clawd/scripts/live-modules-check.ts 2>/tmp/devnet-modules.err | grep -c "ALL 2 module txs accepted")
[[ "$modules_count" = "1" ]] && ok "agent + marketplace" || bad "agent + marketplace"

echo "== governance =="
cat > /tmp/devnet-prop.json <<EOF
{"messages":[],"metadata":"ipfs://devnet-smoke","deposit":"10000000uclaw","title":"devnet smoke","summary":"devnet smoke proposal"}
EOF
ph=$(bcast gov submit-proposal /tmp/devnet-prop.json --from "$KEY")
pc=$(wait_tx "$ph")
if [[ "$pc" = "0" ]]; then
  pid=$("$BIN" query gov proposals --node "$NODE" -o json 2>/dev/null | python3 -c "import json,sys; ps=json.load(sys.stdin).get('proposals', []); print(ps[-1]['id'] if ps else '')" 2>/dev/null)
  vc=$(wait_tx "$(bcast gov vote "$pid" yes --from "$KEY")")
  [[ "$vc" = "0" ]] && ok "governance submit + vote" || bad "governance vote (code ${vc:-?})"
else
  bad "governance submit-proposal (code ${pc:-?})"
fi

echo ""
echo "=================================================="
echo "  Devnet smoke: $PASS passed, $FAIL failed"
echo "=================================================="
[[ "$FAIL" -eq 0 ]] && echo "OK: devnet live flows passed" || echo "FAIL: see failures above"
exit "$FAIL"
