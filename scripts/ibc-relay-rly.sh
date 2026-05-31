#!/usr/bin/env bash
#
# Drive a REAL end-to-end IBC ICS-20 transfer between two already-running local
# chains using the Go relayer (rly). This is the working procedure; the rly path
# embedded in ibc-two-chain-test.sh is incomplete (wrong chain-config format, no
# key funding, missing --node), so this standalone driver supersedes it.
#
# Prereq:
#   - Two chains running (e.g. `bash scripts/ibc-two-chain-test.sh --keep-running`):
#       chain A: chain-id clawchain-ibc-a, RPC 26657, home artifacts/ibc-test/chain-a
#       chain B: chain-id clawchain-ibc-b, RPC 26667, home artifacts/ibc-test/chain-b
#     each with a funded `validator` key and a `user` key (test keyring).
#   - rly installed: `go install github.com/cosmos/relayer/v2@latest`
#     (the binary is named `relayer`; symlink it to `rly`).
#
#   bash scripts/ibc-relay-rly.sh
set -u

BIN=${BIN:-./build/clawchaind}
RLY=${RLY:-$HOME/go/bin/rly}
RH=${RH:-/tmp/rly-home}
A_ID=clawchain-ibc-a; B_ID=clawchain-ibc-b
NA=tcp://localhost:26657; NB=tcp://localhost:26667
A_HOME=artifacts/ibc-test/chain-a; B_HOME=artifacts/ibc-test/chain-b
AMOUNT=${AMOUNT:-5000}

USER_A=$($BIN keys show user -a --keyring-backend test --home "$A_HOME")
USER_B=$($BIN keys show user -a --keyring-backend test --home "$B_HOME")

echo "== configure rly =="
rm -rf "$RH"; mkdir -p "$RH"
cfg() { printf '{"type":"cosmos","value":{"key":"rkey","chain-id":"%s","rpc-addr":"http://localhost:%s","account-prefix":"claw","keyring-backend":"test","gas-adjustment":1.6,"gas-prices":"0.025uclaw","coin-type":118,"timeout":"20s","output-format":"json","sign-mode":"direct"}}' "$1" "$2"; }
cfg "$A_ID" 26657 > /tmp/rly-a.json
cfg "$B_ID" 26667 > /tmp/rly-b.json
"$RLY" config init --home "$RH"
"$RLY" chains add --file /tmp/rly-a.json "$A_ID" --home "$RH"
"$RLY" chains add --file /tmp/rly-b.json "$B_ID" --home "$RH"

echo "== create + fund relayer keys (from each chain's validator) =="
ADDR_A=$("$RLY" keys add "$A_ID" rkey --home "$RH" | python3 -c "import json,sys;print(json.load(sys.stdin)['address'])")
ADDR_B=$("$RLY" keys add "$B_ID" rkey --home "$RH" | python3 -c "import json,sys;print(json.load(sys.stdin)['address'])")
$BIN tx bank send validator "$ADDR_A" 100000000uclaw --from validator --keyring-backend test --home "$A_HOME" --chain-id "$A_ID" --node "$NA" --gas auto --gas-adjustment 1.5 --gas-prices 0.025uclaw --yes --output json >/dev/null
$BIN tx bank send validator "$ADDR_B" 100000000uclaw --from validator --keyring-backend test --home "$B_HOME" --chain-id "$B_ID" --node "$NB" --gas auto --gas-adjustment 1.5 --gas-prices 0.025uclaw --yes --output json >/dev/null
sleep 5

echo "== link: client + connection + channel (transfer/ics20-1) =="
"$RLY" paths new "$A_ID" "$B_ID" ibc-test --home "$RH"
"$RLY" tx link ibc-test --src-port transfer --dst-port transfer --version ics20-1 --home "$RH" 2>&1 | grep -iE "created new channel" || { echo "link failed"; exit 1; }

echo "== start relayer (background) =="
nohup "$RLY" start ibc-test --home "$RH" > /tmp/rly-start.log 2>&1 &
RLY_PID=$!; sleep 4

echo "== ICS-20 transfer $AMOUNT uclaw: $A_ID -> $B_ID (channel-0) =="
$BIN tx ibc-transfer transfer transfer channel-0 "$USER_B" "${AMOUNT}uclaw" --from user --keyring-backend test --home "$A_HOME" --chain-id "$A_ID" --node "$NA" --gas auto --gas-adjustment 1.5 --gas-prices 0.025uclaw --yes --output json | grep -o '"txhash":"[^"]*"'

echo "== wait for voucher on chain B =="
for i in $(seq 1 20); do
  sleep 2
  OUT=$($BIN query bank balances "$USER_B" --node "$NB" --output json 2>/dev/null)
  if echo "$OUT" | grep -q "ibc/"; then
    echo "$OUT" | python3 -c "import json,sys;[print('  RECEIVED',b['denom'],b['amount']) for b in json.load(sys.stdin)['balances'] if b['denom'].startswith('ibc/')]"
    kill "$RLY_PID" 2>/dev/null
    echo "IBC ICS-20 round-trip proven end-to-end."
    exit 0
  fi
done
kill "$RLY_PID" 2>/dev/null
echo "voucher not observed within timeout"; exit 1
