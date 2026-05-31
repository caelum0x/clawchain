#!/usr/bin/env bash
#
# rehearse-gov-upgrade.sh - exercise a real governance-scheduled x/upgrade plan
# on the local multi-validator testnet.
#
# Prerequisite:
#   CLAWCHAIN_BIN=/path/to/pre-upgrade/clawchaind bash scripts/testnet/local-multinode.sh up
#   PRE_UPGRADE_BIN=/path/to/pre-upgrade/clawchaind POST_UPGRADE_BIN=./build/clawchaind \
#     bash scripts/testnet/rehearse-gov-upgrade.sh
#
# The script submits a MsgSoftwareUpgrade proposal for the no-op
# `testnet-v1-rehearsal` handler, votes all local validators yes, waits for the
# proposal to pass, waits for the pre-upgrade binary to halt at the upgrade
# height, restarts all validators with POST_UPGRADE_BIN, then verifies the
# upgrade module recorded the applied plan and post-upgrade blocks are produced.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

BIN="${PRE_UPGRADE_BIN:-${CLAWCHAIN_BIN:-$REPO_ROOT/build/clawchaind}}"
POST_BIN="${POST_UPGRADE_BIN:-$REPO_ROOT/build/clawchaind}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/.testnet-multinode}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
UPGRADE_NAME="${UPGRADE_NAME:-testnet-v1-rehearsal}"
NODE="${NODE:-tcp://localhost:26657}"
REST="${REST:-http://localhost:1317}"
VALIDATORS="${VALIDATORS:-4}"
HEIGHT_DELTA="${HEIGHT_DELTA:-180}"
DEPOSIT="${DEPOSIT:-10000000uclaw}"
GAS_PRICES="${GAS_PRICES:-0.0001uclaw}"

TX_BASE=(--chain-id "$CHAIN_ID" --node "$NODE" --gas auto --gas-adjustment 1.6 --gas-prices "$GAS_PRICES" --yes -o json)

PASS=0
FAIL=0
ok() { echo "  OK  $1"; PASS=$((PASS + 1)); }
bad() { echo "  BAD $1"; FAIL=$((FAIL + 1)); }

rpc_port() { echo $((26657 - $1 * 3)); }
home_for() { echo "$OUT_DIR/validator$1"; }

height() {
  curl -s --max-time 3 "http://localhost:$(rpc_port 0)/status" 2>/dev/null \
    | grep -o '"latest_block_height":"[0-9]*"' | grep -oE '[0-9]+' | head -1
}

wait_tx() {
  local h="$1"
  [ -n "$h" ] || { echo "missing-hash"; return; }
  for _ in $(seq 1 20); do
    sleep 1
    local c
    c=$("$BIN" query tx "$h" --node "$NODE" -o json 2>/dev/null \
      | grep -oE '"code":[0-9]+' | head -1 | grep -oE '[0-9]+')
    [ -n "$c" ] && { echo "$c"; return; }
  done
  echo "timeout"
}

bcast() {
  local idx="$1"
  shift
  "$BIN" tx "$@" --keyring-backend test --home "$(home_for "$idx")" "${TX_BASE[@]}" 2>/tmp/rehearse-gov-upgrade.err \
    | grep -o '"txhash":"[^"]*"' | cut -d'"' -f4
}

proposal_status() {
  local id="$1"
  "$BIN" query gov proposal "$id" --node "$NODE" -o json 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("proposal",{}).get("status",""))' 2>/dev/null
}

all_heights_after() {
  local min_height="$1"
  for i in $(seq 0 $((VALIDATORS - 1))); do
    local h
    h=$(curl -s --max-time 3 "http://localhost:$(rpc_port "$i")/status" 2>/dev/null \
      | grep -o '"latest_block_height":"[0-9]*"' | grep -oE '[0-9]+' | head -1)
    [ -n "$h" ] && [ "$h" -gt "$min_height" ] || return 1
  done
}

logs_have() {
  local pattern="$1"
  rg -q "$pattern" "$OUT_DIR"/validator*.log 2>/dev/null
}

stop_validators() {
  if [ -f "$OUT_DIR/.pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$OUT_DIR/.pids"
  fi
  pkill -f "clawchaind start --home $OUT_DIR" 2>/dev/null || true
  sleep 2
}

start_post_upgrade_validators() {
  : > "$OUT_DIR/.pids"
  for i in $(seq 0 $((VALIDATORS - 1))); do
    nohup "$POST_BIN" start --home "$OUT_DIR/validator$i" --minimum-gas-prices "$GAS_PRICES" \
      >> "$OUT_DIR/validator$i.log" 2>&1 &
    echo $! >> "$OUT_DIR/.pids"
  done
}

[ -x "$BIN" ] || { echo "pre-upgrade clawchaind not executable: $BIN"; exit 1; }
[ -x "$POST_BIN" ] || { echo "post-upgrade clawchaind not executable: $POST_BIN"; exit 1; }

reachable=""
for _ in $(seq 1 15); do
  curl -s --max-time 2 "$REST/cosmos/base/tendermint/v1beta1/node_info" >/dev/null 2>&1 && { reachable=1; break; }
  sleep 2
done
[ -n "$reachable" ] || { echo "testnet REST not reachable on $REST; run: bash scripts/testnet/local-multinode.sh up"; exit 1; }

CURRENT_HEIGHT=$(height)
[ -n "$CURRENT_HEIGHT" ] || { echo "validator0 RPC not reachable on $NODE"; exit 1; }
UPGRADE_HEIGHT=$((CURRENT_HEIGHT + HEIGHT_DELTA))
AUTHORITY=$("$BIN" query upgrade authority --node "$NODE" -o json 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("address",""))' 2>/dev/null)
[ -n "$AUTHORITY" ] || { echo "could not query upgrade authority"; exit 1; }

echo "== gov upgrade rehearsal =="
echo "  name:          $UPGRADE_NAME"
echo "  current:       $CURRENT_HEIGHT"
echo "  target height: $UPGRADE_HEIGHT"
echo "  authority:     $AUTHORITY"
echo "  pre binary:    $BIN"
echo "  post binary:   $POST_BIN"

PROP="/tmp/rehearse-gov-upgrade-proposal.json"
cat > "$PROP" <<EOF
{
  "messages": [
    {
      "@type": "/cosmos.upgrade.v1beta1.MsgSoftwareUpgrade",
      "authority": "$AUTHORITY",
      "plan": {
        "name": "$UPGRADE_NAME",
        "height": "$UPGRADE_HEIGHT",
        "info": "{\"binaries\":{}}"
      }
    }
  ],
  "metadata": "ipfs://testnet-v1-rehearsal",
  "deposit": "$DEPOSIT",
  "title": "Local testnet upgrade rehearsal",
  "summary": "Rehearse the governance-driven x/upgrade path with the no-op testnet handler.",
  "expedited": false
}
EOF

echo "== submit upgrade proposal =="
ph=$(bcast 0 gov submit-proposal "$PROP" --from validator0)
pc=$(wait_tx "$ph")
if [ "$pc" = "0" ]; then
  ok "proposal submitted (tx $ph)"
else
  bad "proposal submit failed (code ${pc:-?}); $(cat /tmp/rehearse-gov-upgrade.err 2>/dev/null)"
  exit 1
fi

PID=$("$BIN" query gov proposals --node "$NODE" -o json 2>/dev/null \
  | python3 -c 'import json,sys; ps=json.load(sys.stdin).get("proposals", []); print(ps[-1]["id"] if ps else "")' 2>/dev/null)
[ -n "$PID" ] || { echo "could not determine proposal id"; exit 1; }
echo "  proposal id: $PID"

echo "== vote yes with all local validators =="
for i in $(seq 0 $((VALIDATORS - 1))); do
  vh=$(bcast "$i" gov vote "$PID" yes --from "validator$i")
  vc=$(wait_tx "$vh")
  if [ "$vc" = "0" ]; then
    ok "validator$i voted yes"
  else
    bad "validator$i vote failed (code ${vc:-?})"
  fi
done

echo "== wait for proposal to pass =="
passed=""
for _ in $(seq 1 90); do
  status=$(proposal_status "$PID")
  echo "  status: ${status:-unknown}"
  [ "$status" = "PROPOSAL_STATUS_PASSED" ] && { passed=1; break; }
  [ "$status" = "PROPOSAL_STATUS_REJECTED" ] && break
  [ "$status" = "PROPOSAL_STATUS_FAILED" ] && break
  sleep 2
done
[ -n "$passed" ] && ok "proposal passed" || { bad "proposal did not pass"; exit 1; }

echo "== wait for pre-upgrade binary halt at upgrade height =="
halted=""
for _ in $(seq 1 180); do
  h=$(height)
  echo "  height: ${h:-unknown}"
  if logs_have "BINARY UPDATED BEFORE TRIGGER.*$UPGRADE_NAME"; then
    bad "post-upgrade binary is running before the trigger height; restart the testnet with PRE_UPGRADE_BIN"
    exit 1
  fi
  if logs_have "UPGRADE \"$UPGRADE_NAME\" NEEDED|UPGRADE NEEDED.*$UPGRADE_NAME"; then
    halted=1
    break
  fi
  sleep 2
done
[ -n "$halted" ] && ok "pre-upgrade binary halted for $UPGRADE_NAME" || { bad "upgrade halt was not observed"; exit 1; }

echo "== restart validators with post-upgrade binary =="
stop_validators
start_post_upgrade_validators

post_started=""
for _ in $(seq 1 90); do
  h=$(height)
  echo "  post height: ${h:-unknown}"
  [ -n "$h" ] && [ "$h" -gt "$UPGRADE_HEIGHT" ] && all_heights_after "$UPGRADE_HEIGHT" && { post_started=1; break; }
  sleep 2
done
[ -n "$post_started" ] && ok "post-upgrade blocks produced" || bad "post-upgrade blocks were not produced"

APPLIED=$("$POST_BIN" query upgrade applied "$UPGRADE_NAME" --node "$NODE" -o json 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("height",""))' 2>/dev/null)
if [ "$APPLIED" = "$UPGRADE_HEIGHT" ]; then
  ok "upgrade applied at height $APPLIED"
else
  bad "upgrade applied height mismatch (got ${APPLIED:-none}, expected $UPGRADE_HEIGHT)"
fi

if all_heights_after "$UPGRADE_HEIGHT"; then
  ok "all $VALIDATORS validators produced post-upgrade blocks"
else
  bad "not all validators produced post-upgrade blocks"
fi

echo ""
echo "=================================================="
echo "  Gov upgrade rehearsal: $PASS passed, $FAIL failed"
echo "=================================================="
[ "$FAIL" -eq 0 ] && echo "OK: governance-driven upgrade path works on the local multinode testnet" || echo "FAIL: see failures above"
exit "$FAIL"
