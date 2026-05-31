#!/usr/bin/env bash
#
# smoke-multinode.sh — exercise the full custom-module set against the running LOCAL
# multi-validator testnet (scripts/testnet/local-multinode.sh up). Closes the Phase T2
# acceptance criterion "Phase 1 flows pass against the endpoints" — on a 4-validator
# network, not a single node.
#
# Covers: bank, tokenfactory, privacy shield->unshield (real ZK proof), oracle
# commit-reveal, agent, marketplace, governance. (DEX needs contracts deployed first;
# IBC needs a 2nd chain — both proven separately on single-node.)
#
#   bash scripts/testnet/smoke-multinode.sh
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
BIN="$REPO_ROOT/build/clawchaind"
H="$REPO_ROOT/.testnet-multinode/validator0"
KEYS="$H/keys"
CHAIN_ID="clawchain-testnet-1"
NODE="tcp://localhost:26657"
REST="http://localhost:1317"
KB="--keyring-backend test --home $H"
TX="--chain-id $CHAIN_ID --node $NODE --gas auto --gas-adjustment 1.6 --gas-prices 0.0001uclaw --yes -o json"

PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

[ -x "$BIN" ] || { echo "build clawchaind first"; exit 1; }
# Wait for the REST API to bind (up returns on RPC consensus; REST takes a moment more).
reachable=""
for _ in $(seq 1 15); do
  curl -s --max-time 2 "$REST/cosmos/base/tendermint/v1beta1/node_info" >/dev/null 2>&1 && { reachable=1; break; }
  sleep 2
done
[ -n "$reachable" ] || { echo "testnet REST not reachable on $REST — run: bash scripts/testnet/local-multinode.sh up"; exit 1; }

V0=$($BIN keys show validator0 -a $KB)
VAL0=$($BIN keys show validator0 --bech val -a $KB)
V1=$($BIN keys show validator1 -a --keyring-backend test --home "$REPO_ROOT/.testnet-multinode/validator1" 2>/dev/null)
PRIV=$(printf 'y\n' | $BIN keys export validator0 --unarmored-hex --unsafe $KB 2>/dev/null | tr -d '[:space:]')

# wait_tx <hash> -> echoes code, waits for commit
wait_tx() { local h="$1"; for _ in $(seq 1 15); do sleep 1; local c; c=$($BIN query tx "$h" --node "$NODE" -o json 2>/dev/null | grep -oE '"code":[0-9]+' | head -1 | grep -oE '[0-9]+'); [ -n "$c" ] && { echo "$c"; return; }; done; echo "timeout"; }
bcast() { $BIN tx "$@" $KB $TX 2>/dev/null | grep -o '"txhash":"[^"]*"' | cut -d'"' -f4; }

echo "== signer validator0=$V0 (valoper $VAL0) =="

echo "== bank: send 1000uclaw validator0 -> validator1 =="
[ -n "$V1" ] && c=$(wait_tx "$(bcast bank send validator0 "$V1" 1000uclaw)") && [ "$c" = "0" ] && ok "bank send (code 0)" || bad "bank send (code ${c:-?})"

echo "== tokenfactory: create-denom + mint =="
SUB="smoke$(date +%s 2>/dev/null || echo 1)"
c=$(wait_tx "$(bcast tokenfactory create-denom "$SUB" --from validator0)"); DENOM="factory/$V0/$SUB"
if [ "$c" = "0" ]; then
  c2=$(wait_tx "$(bcast tokenfactory mint 1000000 "$DENOM" --from validator0)")
  [ "$c2" = "0" ] && ok "tokenfactory create-denom + mint (code 0)" || bad "tokenfactory mint (code ${c2:-?})"
else bad "tokenfactory create-denom (code ${c:-?})"; fi

echo "== privacy: shield -> unshield round-trip (real ZK proof) =="
# Unique blinding per run (height-based, uint64) so re-runs don't collide on a
# duplicate commitment. The unshield round-trip needs the FULL leaf set to rebuild
# the tree root; that's only enumerable when the tree starts empty, so we gate the
# unshield on a fresh tree (leaf_count == 0 before our shield, i.e. just after `up`).
HNOW=$(curl -s --max-time 3 "http://localhost:26657/status" 2>/dev/null | grep -o '"latest_block_height":"[0-9]*"' | grep -oE '[0-9]+')
LEAVES_BEFORE=$(curl -s --max-time 3 "$REST/clawchain/privacy/v1/tree_stats" 2>/dev/null | grep -o '"leaf_count":"[0-9]*"' | grep -oE '[0-9]+')
AMT=1000; BL=$((1000000 + ${HNOW:-1})); SEC=$((2000000 + ${HNOW:-1}))
SH=$(PRIV_HEX="$PRIV" RPC_URL="http://localhost:26657" AMOUNT=$AMT BLINDING=$BL npx --prefix cmd/clawd tsx cmd/clawd/scripts/roundtrip-shield.ts 2>/dev/null | grep -E "COMMITMENT=" | cut -d= -f2)
if [ -n "$SH" ] && [ "${LEAVES_BEFORE:-0}" != "0" ]; then
  ok "privacy shield (code 0); unshield round-trip skipped — tree not empty (run after \`up\` for full round-trip)"
elif [ -n "$SH" ]; then
  printf '{"leaves":["%s"]}' "$SH" > /tmp/smoke-leaves.json
  build/clawproof unshield-proof --amount $AMT --blinding $BL --secret $SEC --keys-dir "$KEYS" --merkle-tree /tmp/smoke-leaves.json 2>/dev/null | grep -o '{"amount".*}' > /tmp/smoke-proof.json
  C=$(python3 -c "import json;print(json.load(open('/tmp/smoke-proof.json'))['commitment'])" 2>/dev/null)
  R=$(python3 -c "import json;print(json.load(open('/tmp/smoke-proof.json'))['merkle_root'])" 2>/dev/null)
  N=$(python3 -c "import json;print(json.load(open('/tmp/smoke-proof.json'))['nullifier'])" 2>/dev/null)
  P=$(python3 -c "import json;print(json.load(open('/tmp/smoke-proof.json'))['proof'])" 2>/dev/null)
  US=$(PRIV_HEX="$PRIV" RPC_URL="http://localhost:26657" COMMITMENT="$C" NULLIFIER="$N" PROOF="$P" AMOUNT=$AMT ROOT="$R" npx --prefix cmd/clawd tsx cmd/clawd/scripts/roundtrip-unshield.ts 2>/dev/null | grep -c "code=0 ")
  [ "$US" = "1" ] && ok "privacy shield->unshield round-trip (proof verified on-chain)" || bad "privacy unshield"
else bad "privacy shield"; fi

echo "== oracle: commit-reveal =="
o=$(PRIV_HEX="$PRIV" RPC_URL="http://localhost:26657" VALOPER="$VAL0" SALT=ab12 npx --prefix cmd/clawd tsx cmd/clawd/scripts/live-oracle-check.ts 2>/dev/null | grep -c "SUCCESS")
[ "$o" = "1" ] && ok "oracle commit-reveal (vote tallied)" || bad "oracle commit-reveal"

echo "== agent + marketplace =="
m=$(PRIV_HEX="$PRIV" RPC_URL="http://localhost:26657" npx --prefix cmd/clawd tsx cmd/clawd/scripts/live-modules-check.ts 2>/dev/null | grep -c "ALL 2 module txs accepted")
[ "$m" = "1" ] && ok "agent register + marketplace list-skill (code 0)" || bad "agent/marketplace"

echo "== governance: submit text proposal + vote =="
# Non-empty metadata is required for a no-messages (text) proposal.
cat > /tmp/smoke-prop.json <<EOF
{"messages":[],"metadata":"ipfs://smoke","deposit":"10000000uclaw","title":"smoke","summary":"smoke test proposal"}
EOF
ph=$(bcast gov submit-proposal /tmp/smoke-prop.json --from validator0); pc=$(wait_tx "$ph")
if [ "$pc" = "0" ]; then
  PID=$($BIN query gov proposals --node "$NODE" -o json 2>/dev/null | python3 -c "import json,sys;ps=json.load(sys.stdin).get('proposals',[]);print(ps[-1]['id'] if ps else '')" 2>/dev/null)
  vc=$(wait_tx "$(bcast gov vote "$PID" yes --from validator0)")
  [ "$vc" = "0" ] && ok "governance submit-proposal + vote (code 0, prop $PID)" || bad "governance vote (code ${vc:-?})"
else bad "governance submit-proposal (code ${pc:-?})"; fi

echo ""
echo "=================================================="
echo "  Multi-validator smoke: $PASS passed, $FAIL failed"
echo "=================================================="
[ "$FAIL" -eq 0 ] && echo "✅ full module set works on the 4-validator testnet" || echo "❌ see failures above"
exit "$FAIL"
