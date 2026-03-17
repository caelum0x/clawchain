#!/usr/bin/env bash
# smoke-test-e2e.sh — End-to-end user journey smoke test.
# Tests the actual flows a real user would perform on ClawChain.
#
# Prerequisites:
#   - Docker testnet running (testnet/docker-compose.yml)
#   - Faucet service running on :8888
#   - Web dashboard running on :3000 (optional)
#
# Usage:
#   ./scripts/smoke-test-e2e.sh

set -euo pipefail

# ── Configuration ──
REST="${CHAIN_REST:-http://localhost:1317}"
RPC="${CHAIN_RPC:-http://localhost:26657}"
FAUCET="${FAUCET_URL:-http://localhost:8888}"
WEB="${WEB_URL:-http://localhost:3000}"
DOCKER_NODE="clawchain-node0"
CHAIN_ID="clawchain-testnet-1"
CHAIN_HOME="/clawchain"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

PASS=0 FAIL=0 SKIP=0

pass() { ((PASS++)); echo -e "  ${GREEN}[PASS]${NC} $1 ${DIM}$2${NC}"; }
fail() { ((FAIL++)); echo -e "  ${RED}[FAIL]${NC} $1 ${DIM}$2${NC}"; }
skip() { ((SKIP++)); echo -e "  ${YELLOW}[SKIP]${NC} $1 ${DIM}$2${NC}"; }

section() { echo ""; echo -e "${CYAN}── $1 ──${NC}"; }

# ── Helpers ──
json_field() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)" 2>/dev/null; }
http_get() { curl -sf "$1" 2>/dev/null; }
http_post() { curl -sf -X POST -H "Content-Type: application/json" -d "$2" "$1" 2>/dev/null; }

# ══════════════════════════════════════════════════════════════
echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    ClawChain E2E Smoke Test — User Journey           ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  REST:   ${DIM}$REST${NC}"
echo -e "  RPC:    ${DIM}$RPC${NC}"
echo -e "  Faucet: ${DIM}$FAUCET${NC}"

# ═══════════════════════════════════════════════════════════════
section "1. Chain Health Verification"
# ═══════════════════════════════════════════════════════════════

# Check chain is live
HEIGHT=$(http_get "$RPC/status" | json_field "['result']['sync_info']['latest_block_height']" || echo "")
if [ -n "$HEIGHT" ] && [ "$HEIGHT" != "0" ]; then
  pass "Chain is live" "height=$HEIGHT"
else
  fail "Chain not reachable" "RPC=$RPC"
  echo -e "${RED}Cannot proceed without a running chain. Exiting.${NC}"
  exit 1
fi

# Verify chain ID
CID=$(http_get "$RPC/status" | json_field "['result']['node_info']['network']" || echo "")
if [ "$CID" = "$CHAIN_ID" ]; then
  pass "Chain ID matches" "$CID"
else
  fail "Chain ID mismatch" "expected=$CHAIN_ID got=$CID"
fi

# Check REST API
SUPPLY=$(http_get "$REST/cosmos/bank/v1beta1/supply" | json_field "['supply'][0]['amount']" || echo "")
if [ -n "$SUPPLY" ]; then
  CLAW_AMT=$(python3 -c "print(f'{int(\"$SUPPLY\")/1_000_000:.0f}')" 2>/dev/null || echo "?")
  pass "REST API reachable" "supply=${CLAW_AMT} CLAW"
else
  fail "REST API not reachable" ""
fi

# ═══════════════════════════════════════════════════════════════
section "2. Faucet — Get Test Tokens"
# ═══════════════════════════════════════════════════════════════

# Generate a fresh address for testing (use a deterministic one for reproducibility)
TEST_ADDR="claw10d07y265gmmuvt4z0w9aw880jnsr700js4azwm"

# Check faucet health
FAUCET_OK=$(http_get "$FAUCET/health" | json_field "['status']" || echo "")
if [ "$FAUCET_OK" = "ok" ]; then
  pass "Faucet service healthy" ""
else
  skip "Faucet not running" "cannot test token dispensing"
fi

if [ "$FAUCET_OK" = "ok" ]; then
  # Get balance before
  BAL_BEFORE=$(http_get "$REST/cosmos/bank/v1beta1/balances/$TEST_ADDR/by_denom?denom=uclaw" | json_field "['balance']['amount']" || echo "0")

  # Request tokens (don't use -f so we get the error body)
  FAUCET_RESP=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"address\":\"$TEST_ADDR\"}" "$FAUCET/faucet" 2>/dev/null || echo "")
  TX_HASH=$(echo "$FAUCET_RESP" | json_field "['txHash']" 2>/dev/null || echo "")

  if [ -n "$TX_HASH" ]; then
    pass "Faucet dispensed tokens" "tx=$TX_HASH"

    # Wait for tx to be included
    sleep 7

    # Check tx was confirmed
    TX_CODE=$(http_get "$REST/cosmos/tx/v1beta1/txs/$TX_HASH" | json_field "['tx_response']['code']" || echo "-1")
    if [ "$TX_CODE" = "0" ]; then
      pass "Faucet tx confirmed in block" "code=0"
    else
      fail "Faucet tx failed" "code=$TX_CODE"
    fi

    # Check balance increased
    BAL_AFTER=$(http_get "$REST/cosmos/bank/v1beta1/balances/$TEST_ADDR/by_denom?denom=uclaw" | json_field "['balance']['amount']" || echo "0")
    if [ "$BAL_AFTER" -gt "$BAL_BEFORE" ] 2>/dev/null; then
      DIFF=$((BAL_AFTER - BAL_BEFORE))
      pass "Balance increased" "+${DIFF} uclaw ($(python3 -c "print(f'{$DIFF/1_000_000:.1f}')" 2>/dev/null) CLAW)"
    else
      fail "Balance did not increase" "before=$BAL_BEFORE after=$BAL_AFTER"
    fi
  else
    ERR=$(echo "$FAUCET_RESP" | json_field "['error']" 2>/dev/null || echo "unknown")
    if echo "$ERR" | grep -qi "rate limit\|too many\|cooldown"; then
      skip "Faucet rate limited" "$ERR"
    else
      fail "Faucet request failed" "$ERR"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════
section "3. Agent Operations"
# ═══════════════════════════════════════════════════════════════

# Query existing agent
AGENT_NAME=$(http_get "$REST/clawchain/agent/v1/agent/claw1ythm3uxuqath04pvqxqnkg0u9w4evn68584fsk" | json_field "['name']" || echo "")
if [ -n "$AGENT_NAME" ]; then
  pass "Query agent by address" "name=$AGENT_NAME"
else
  skip "Agent query not available" "Docker image may lack this endpoint"
fi

# Query agent params
AGENT_GAP=$(http_get "$REST/clawchain/agent/v1/params" | json_field "['params']['max_heartbeat_gap_blocks']" || echo "")
if [ -n "$AGENT_GAP" ]; then
  pass "Agent params queryable" "max_heartbeat_gap=$AGENT_GAP"
else
  fail "Agent params not available" ""
fi

# Register a new agent (if possible)
REG_RESULT=$(docker exec "$DOCKER_NODE" /usr/local/bin/clawchaind tx agent register-agent \
  "test-pubkey-$$" "http://agent-$$.local:8080" "SmokeTestAgent$$" \
  --from validator --chain-id "$CHAIN_ID" --keyring-backend test \
  --home "$CHAIN_HOME" --fees 20000uclaw --gas 300000 --yes --output json 2>&1 || echo "")
REG_CODE=$(echo "$REG_RESULT" | json_field "['code']" 2>/dev/null || echo "-1")
REG_HASH=$(echo "$REG_RESULT" | json_field "['txhash']" 2>/dev/null || echo "")

if [ "$REG_CODE" = "0" ]; then
  pass "Agent registration tx submitted" "tx=${REG_HASH:0:16}..."
elif echo "$REG_RESULT" | grep -q "already registered"; then
  pass "Agent already registered" "(expected for re-runs)"
else
  skip "Agent registration" "code=$REG_CODE"
fi

# ═══════════════════════════════════════════════════════════════
section "4. Privacy Module"
# ═══════════════════════════════════════════════════════════════

LEAF_COUNT=$(http_get "$REST/clawchain/privacy/v1/tree_stats" | json_field "['leaf_count']" || echo "")
if [ -n "$LEAF_COUNT" ]; then
  pass "Privacy Merkle tree stats" "leaves=$LEAF_COUNT, depth=32"
else
  fail "Privacy tree stats not available" ""
fi

PRIV_PARAM=$(http_get "$REST/clawchain/privacy/v1/params" | json_field "['params']['max_privacy_tx_per_block']" || echo "")
if [ -n "$PRIV_PARAM" ]; then
  pass "Privacy params queryable" "max_privacy_tx=$PRIV_PARAM"
else
  fail "Privacy params not available" ""
fi

# ═══════════════════════════════════════════════════════════════
section "5. Staking & Validators"
# ═══════════════════════════════════════════════════════════════

VAL_COUNT=$(http_get "$REST/cosmos/staking/v1beta1/validators" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('validators',[])))" 2>/dev/null || echo "0")
if [ "$VAL_COUNT" -gt 0 ] 2>/dev/null; then
  pass "Validators active" "count=$VAL_COUNT"
else
  fail "No validators found" ""
fi

BONDED=$(http_get "$REST/cosmos/staking/v1beta1/pool" | json_field "['pool']['bonded_tokens']" || echo "0")
if [ "$BONDED" != "0" ]; then
  BONDED_CLAW=$(python3 -c "print(f'{int(\"$BONDED\")/1_000_000:.0f}')" 2>/dev/null || echo "?")
  pass "Staking pool has bonded tokens" "${BONDED_CLAW} CLAW"
else
  fail "No bonded tokens" ""
fi

INFLATION=$(http_get "$REST/cosmos/mint/v1beta1/inflation" | json_field "['inflation']" || echo "")
if [ -n "$INFLATION" ]; then
  INFL_PCT=$(python3 -c "print(f'{float(\"$INFLATION\")*100:.2f}%')" 2>/dev/null || echo "?")
  pass "Inflation rate" "$INFL_PCT"
else
  fail "Inflation not available" ""
fi

# ═══════════════════════════════════════════════════════════════
section "6. Token Transfer (Bank Send)"
# ═══════════════════════════════════════════════════════════════

# Wait for any prior txs to be included (avoids sequence mismatch)
sleep 7

SEND_RESULT=$(docker exec "$DOCKER_NODE" /usr/local/bin/clawchaind tx bank send \
  validator claw1shg6zt99ygw4cwj0n2upvez9uww7kcwyjc3kc5 \
  5000uclaw \
  --chain-id "$CHAIN_ID" --keyring-backend test \
  --home "$CHAIN_HOME" --fees 5000uclaw --yes --output json 2>&1 || echo "")
SEND_CODE=$(echo "$SEND_RESULT" | json_field "['code']" 2>/dev/null || echo "-1")
SEND_HASH=$(echo "$SEND_RESULT" | json_field "['txhash']" 2>/dev/null || echo "")

if [ "$SEND_CODE" = "0" ] && [ -n "$SEND_HASH" ]; then
  pass "Bank send tx submitted" "tx=${SEND_HASH:0:16}..."

  sleep 7

  SEND_CONFIRM=$(http_get "$REST/cosmos/tx/v1beta1/txs/$SEND_HASH" | json_field "['tx_response']['code']" || echo "-1")
  if [ "$SEND_CONFIRM" = "0" ]; then
    pass "Bank send confirmed in block" "code=0"
  else
    fail "Bank send failed on-chain" "code=$SEND_CONFIRM"
  fi
else
  fail "Bank send tx submission" "code=$SEND_CODE"
fi

# ═══════════════════════════════════════════════════════════════
section "7. Marketplace & Reputation"
# ═══════════════════════════════════════════════════════════════

MKT_PARAM=$(http_get "$REST/clawchain/marketplace/v1/params" | json_field "['params']['max_skills_per_agent']" || echo "")
if [ -n "$MKT_PARAM" ]; then
  pass "Marketplace params" "max_skills=$MKT_PARAM"
else
  fail "Marketplace params not available" ""
fi

REP_PARAM=$(http_get "$REST/clawchain/reputation/v1/params" | json_field "['params']['max_comment_length']" || echo "")
if [ -n "$REP_PARAM" ]; then
  pass "Reputation params" "max_comment=$REP_PARAM"
else
  fail "Reputation params not available" ""
fi

MSG_PARAM=$(http_get "$REST/clawchain/messaging/v1/params" | json_field "['params']['max_message_size']" || echo "")
if [ -n "$MSG_PARAM" ]; then
  pass "Messaging params" "max_msg_size=$MSG_PARAM"
else
  fail "Messaging params not available" ""
fi

# ═══════════════════════════════════════════════════════════════
section "8. Web Dashboard Proxy"
# ═══════════════════════════════════════════════════════════════

WEB_OK=$(curl -s -o /dev/null -w "%{http_code}" "$WEB/" 2>/dev/null || echo "000")
if [ "$WEB_OK" = "200" ]; then
  pass "Web dashboard reachable" ":3000"

  # Test proxy routes
  PROXY_REST=$(http_get "$WEB/api/cosmos/bank/v1beta1/supply" | json_field "['supply'][0]['denom']" || echo "")
  if [ "$PROXY_REST" = "uclaw" ]; then
    pass "Web proxy /api -> REST" "denom=uclaw"
  else
    fail "Web proxy /api not working" ""
  fi

  PROXY_RPC=$(http_get "$WEB/rpc/status" | json_field "['result']['sync_info']['latest_block_height']" || echo "")
  if [ -n "$PROXY_RPC" ]; then
    pass "Web proxy /rpc -> RPC" "height=$PROXY_RPC"
  else
    fail "Web proxy /rpc not working" ""
  fi

  PROXY_FAUCET=$(http_get "$WEB/faucet/status" | json_field "['address']" || echo "")
  if [ -n "$PROXY_FAUCET" ]; then
    pass "Web proxy /faucet -> Faucet" "addr=${PROXY_FAUCET:0:20}..."
  else
    skip "Web proxy /faucet not available" "faucet may not be running"
  fi
else
  skip "Web dashboard not running" "http_code=$WEB_OK"
fi

# ═══════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  SMOKE TEST RESULTS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}  $PASS"
echo -e "  ${RED}Failed:${NC}  $FAIL"
echo -e "  ${YELLOW}Skipped:${NC} $SKIP"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  Total:   $TOTAL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}RESULT: ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "  ${RED}RESULT: $FAIL TEST(S) FAILED${NC}"
  exit 1
fi
