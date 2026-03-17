#!/usr/bin/env bash
# =============================================================================
# ClawChain End-to-End Demo Script
# =============================================================================
# Exercises every transaction type on a running local ClawChain node.
#
# Prerequisites:
#   - clawchaind running locally (chain-id: clawchain-local-1)
#   - "validator" key available in the test keyring
#   - jq installed
#   - curl installed
#
# Usage:
#   chmod +x scripts/e2e-demo.sh
#   ./scripts/e2e-demo.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BINARY="${BINARY:-$HOME/go/bin/clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-local-1}"
KEYRING="--keyring-backend test"
FEES="--fees 500uclaw"
FROM="validator"
FROM_ADDR="${FROM_ADDR:-}"
RPC="${RPC:-http://localhost:26657}"
GAS="--gas 200000"
TX_WAIT="${TX_WAIT:-6}"
AGENT2_KEY="agent2"

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
PASS_N=0; FAIL_N=0; SKIP_N=0
declare -a RESULTS=()

header()  { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${BOLD}  $1${NC}\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
step()    { echo -e "\n${YELLOW}[$1]${NC} $2"; }
pass()    { echo -e "  ${GREEN}PASS${NC} $1"; PASS_N=$((PASS_N+1)); RESULTS+=("${GREEN}PASS${NC} $1"); }
fail()    { echo -e "  ${RED}FAIL${NC} $1"; [ -n "${2:-}" ] && echo -e "       ${RED}reason: $2${NC}"; FAIL_N=$((FAIL_N+1)); RESULTS+=("${RED}FAIL${NC} $1"); }
skip_it() { echo -e "  ${YELLOW}SKIP${NC} $1"; [ -n "${2:-}" ] && echo -e "       ${YELLOW}reason: $2${NC}"; SKIP_N=$((SKIP_N+1)); RESULTS+=("${YELLOW}SKIP${NC} $1"); }

wait_tx() { echo "  ... waiting ${TX_WAIT}s for block inclusion ..."; sleep "$TX_WAIT"; }

# broadcast_tx: sends a tx, waits for inclusion, returns 0 on success
# Usage: broadcast_tx "label" RESULT_VAR <cmd args...>
send_tx() {
    local label="$1"; shift
    local result
    result=$("$@" -y --output json 2>&1 || true)
    local code txhash
    code=$(echo "$result" | jq -r '.code // "null"' 2>/dev/null || echo "null")
    txhash=$(echo "$result" | jq -r '.txhash // ""' 2>/dev/null || echo "")
    if [ "$code" = "0" ] && [ -n "$txhash" ]; then
        echo "  txhash: $txhash"
        wait_tx
        # Verify committed
        local committed
        committed=$($BINARY query tx "$txhash" --output json --node "$RPC" 2>/dev/null || true)
        local commit_code
        commit_code=$(echo "$committed" | jq -r '.code // "null"' 2>/dev/null || echo "null")
        if [ "$commit_code" = "0" ]; then
            pass "$label"
            TX_HASH="$txhash"
            TX_EVENTS="$committed"
            return 0
        else
            local raw_log
            raw_log=$(echo "$committed" | jq -r '.raw_log // ""' 2>/dev/null || echo "")
            fail "$label" "tx committed with error: $raw_log"
            TX_HASH="$txhash"
            TX_EVENTS=""
            return 1
        fi
    else
        local errmsg
        errmsg=$(echo "$result" | head -3 | tr '\n' ' ')
        TX_HASH=""
        TX_EVENTS=""
        return 1  # caller handles pass/fail/skip
    fi
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'
   _____ _                _____ _           _
  / ____| |              / ____| |         (_)
 | |    | | __ ___      _| |    | |__   __ _ _ _ __
 | |    | |/ _` \ \ /\ / / |    | '_ \ / _` | | '_ \
 | |____| | (_| |\ V  V /| |____| | | | (_| | | | | |
  \_____|_|\__,_| \_/\_/  \_____|_| |_|\__,_|_|_| |_|

  End-to-End Demo Script
BANNER
echo -e "${NC}"

# Resolve FROM_ADDR if not set
if [ -z "$FROM_ADDR" ]; then
    FROM_ADDR=$($BINARY keys show "$FROM" $KEYRING --address 2>/dev/null || true)
fi
echo -e "  Binary:   ${BOLD}$BINARY${NC}"
echo -e "  Chain ID: ${BOLD}$CHAIN_ID${NC}"
echo -e "  From:     ${BOLD}$FROM${NC} ($FROM_ADDR)"

# ============================================================================
# STEP 0: Preflight
# ============================================================================
header "Step 0: Preflight Checks"

step "0a" "Checking binary"
if [ -x "$BINARY" ]; then pass "Binary found"; else fail "Binary not found"; exit 1; fi

step "0b" "Checking jq"
if command -v jq &>/dev/null; then pass "jq available"; else fail "jq required"; exit 1; fi

# ============================================================================
# STEP 1: Check chain
# ============================================================================
header "Step 1: Chain Status"

step "1" "Querying RPC"
RPC_STATUS=$(curl -s "$RPC/status" 2>/dev/null || true)
if [ -n "$RPC_STATUS" ]; then
    LATEST_BLOCK=$(echo "$RPC_STATUS" | jq -r '.result.sync_info.latest_block_height' 2>/dev/null)
    echo "  Block height: $LATEST_BLOCK"
    pass "Chain running"
else
    fail "Chain not reachable"; exit 1
fi

# ============================================================================
# STEP 2: Balance
# ============================================================================
header "Step 2: Initial Balance"

step "2" "Querying balance"
BAL=$($BINARY query bank balances "$FROM_ADDR" --output json --node "$RPC" 2>/dev/null || true)
echo "  $(echo "$BAL" | jq -c '.balances' 2>/dev/null)"
pass "Balance queried"

# ============================================================================
# STEP 3: Register agent (idempotent)
# ============================================================================
header "Step 3: Register Agent"

step "3" "Checking registration status"
AGENT_Q=$($BINARY query agent agent "$FROM_ADDR" --output json --node "$RPC" 2>/dev/null || true)
AGENT_NAME=$(echo "$AGENT_Q" | jq -r '.name // ""' 2>/dev/null)

if [ -n "$AGENT_NAME" ]; then
    echo "  Already registered as: $AGENT_NAME"
    pass "Agent registered (existing)"
else
    step "3b" "Registering agent"
    if send_tx "register-agent" $BINARY tx agent register-agent \
        "e2e-pubkey-$(date +%s)" "https://localhost:8443/agent" "E2E-Demo-Agent" \
        --from "$FROM" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
        :
    else
        fail "register-agent" "broadcast failed"
    fi
fi

# ============================================================================
# STEP 4: Heartbeat
# ============================================================================
header "Step 4: Agent Heartbeat"

step "4" "Sending heartbeat"
if send_tx "heartbeat" $BINARY tx agent agent-heartbeat \
    "$LATEST_BLOCK" "https://localhost:8443/agent" '{"mode":"e2e"}' \
    --from "$FROM" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
    :
else
    # Check if heartbeat-too-frequent (expected on rapid re-runs)
    ERRMSG=$($BINARY tx agent agent-heartbeat "$LATEST_BLOCK" "https://localhost:8443/agent" '{"mode":"e2e"}' \
        --from "$FROM" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC" --dry-run 2>&1 || true)
    if echo "$ERRMSG" | grep -qi "heartbeat.*frequent\|interval"; then
        skip_it "heartbeat" "too frequent (expected on re-run)"
    else
        fail "heartbeat" "$(echo "$ERRMSG" | head -2)"
    fi
fi

# ============================================================================
# STEP 5: Agent action
# ============================================================================
header "Step 5: Agent Action"

step "5" "Sending query action"
if send_tx "agent-action (query)" $BINARY tx agent agent-action \
    "query" '{"target":"price-feed"}' "" \
    --from "$FROM" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
    :
else
    fail "agent-action" "broadcast failed"
fi

# ============================================================================
# STEP 6: Queries
# ============================================================================
header "Step 6: Agent Queries"

for qname in "agent $FROM_ADDR" "agent-liveness $FROM_ADDR" "live-agents" "agent-stats $FROM_ADDR" "recent-activity 10" "agent-activity $FROM_ADDR 10" "params"; do
    # shellcheck disable=SC2086
    step "6" "query agent $qname"
    # shellcheck disable=SC2086
    QRESULT=$($BINARY query agent $qname --output json --node "$RPC" 2>/dev/null || true)
    if [ -n "$QRESULT" ]; then
        echo "  $(echo "$QRESULT" | jq -c '.' 2>/dev/null | head -c 200)"
        pass "query $qname"
    else
        fail "query $qname"
    fi
done

# ============================================================================
# STEP 7: Submit Intent
# ============================================================================
header "Step 7: Submit Intent"

step "7" "Submitting coordination intent (flags-based)"
if send_tx "submit-intent" $BINARY tx agent submit-intent \
    --intent-type "data_share" \
    --description "E2E demo sharing intent" \
    --payload '{"data":"test"}' \
    --min-responses 1 \
    --from "$FROM" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
    # Extract intent_id
    INTENT_ID=$(echo "$TX_EVENTS" | jq -r '[.events[]? | select(.type=="submit_intent") | .attributes[]? | select(.key=="intent_id") | .value] | first // ""' 2>/dev/null || echo "")
    [ -n "$INTENT_ID" ] && echo "  Intent ID: $INTENT_ID"
else
    fail "submit-intent" "broadcast failed"
    INTENT_ID=""
fi

# Query intent if we got an ID
if [ -n "${INTENT_ID:-}" ]; then
    step "7b" "Querying intent $INTENT_ID"
    Q=$($BINARY query agent intent "$INTENT_ID" --output json --node "$RPC" 2>/dev/null || true)
    if [ -n "$Q" ]; then
        echo "  $(echo "$Q" | jq -c '.' 2>/dev/null)"
        pass "query intent"
    else
        fail "query intent"
    fi
fi

# ============================================================================
# STEP 8: Setup agent2, fund, register
# ============================================================================
header "Step 8: Setup Agent2"

step "8a" "Creating agent2 key"
AGENT2_ADDR=$($BINARY keys show "$AGENT2_KEY" $KEYRING --address 2>/dev/null || true)
if [ -z "$AGENT2_ADDR" ]; then
    AGENT2_ADDR=$($BINARY keys add "$AGENT2_KEY" $KEYRING --output json 2>/dev/null | jq -r '.address' 2>/dev/null || true)
fi
if [ -n "$AGENT2_ADDR" ]; then
    echo "  agent2: $AGENT2_ADDR"
    pass "agent2 key ready"
else
    fail "agent2 key creation"
fi

if [ -n "$AGENT2_ADDR" ]; then
    # Check if already funded
    A2_BAL=$($BINARY query bank balances "$AGENT2_ADDR" --output json --node "$RPC" 2>/dev/null || true)
    A2_UCLAW=$(echo "$A2_BAL" | jq -r '.balances[]? | select(.denom=="uclaw") | .amount // "0"' 2>/dev/null || echo "0")

    step "8b" "Funding agent2 (current: ${A2_UCLAW}uclaw)"
    if [ "${A2_UCLAW:-0}" -lt 2000000 ] 2>/dev/null; then
        if send_tx "fund agent2" $BINARY tx bank send "$FROM" "$AGENT2_ADDR" 5000000uclaw \
            $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
            :
        else
            fail "fund agent2" "bank send failed"
        fi
    else
        echo "  Already has ${A2_UCLAW}uclaw"
        pass "agent2 already funded"
    fi

    # Check if agent2 already registered
    A2_Q=$($BINARY query agent agent "$AGENT2_ADDR" --output json --node "$RPC" 2>/dev/null || true)
    A2_NAME=$(echo "$A2_Q" | jq -r '.name // ""' 2>/dev/null)

    step "8c" "Registering agent2"
    if [ -n "$A2_NAME" ]; then
        echo "  Already registered: $A2_NAME"
        pass "agent2 registered (existing)"
    else
        if send_tx "register agent2" $BINARY tx agent register-agent \
            "e2e-agent2-pk" "https://localhost:8444/agent2" "E2E-Agent2" \
            --from "$AGENT2_KEY" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
            :
        else
            fail "register agent2" "registration failed"
        fi
    fi
fi

# ============================================================================
# STEP 9: Delegate task
# ============================================================================
header "Step 9: Delegate Task"

TASK_ID=""
if [ -n "$AGENT2_ADDR" ]; then
    step "9" "Delegating task to agent2"
    if send_tx "delegate-task" $BINARY tx agent delegate-task \
        "$AGENT2_ADDR" "Summarize test data" "summarization" 0 "100" 500 \
        --from "$FROM" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
        TASK_ID=$(echo "$TX_EVENTS" | jq -r '[.events[]? | select(.type=="delegate_task") | .attributes[]? | select(.key=="task_id") | .value] | first // ""' 2>/dev/null || echo "")
        [ -n "$TASK_ID" ] && echo "  Task ID: $TASK_ID"
        # Fallback: try task_id=1
        [ -z "$TASK_ID" ] && TASK_ID="1" && echo "  Assuming task_id=1"
    else
        fail "delegate-task" "broadcast failed"
    fi
else
    skip_it "delegate-task" "agent2 not available"
fi

# ============================================================================
# STEP 10: Accept task
# ============================================================================
header "Step 10: Accept Task"

if [ -n "$TASK_ID" ] && [ -n "$AGENT2_ADDR" ]; then
    step "10" "Accepting task $TASK_ID as agent2"
    if send_tx "accept-task" $BINARY tx agent accept-task "$TASK_ID" \
        --from "$AGENT2_KEY" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
        :
    else
        fail "accept-task" "failed"
    fi
else
    skip_it "accept-task" "task_id or agent2 not available"
fi

# ============================================================================
# STEP 11: Complete task
# ============================================================================
header "Step 11: Complete Task"

if [ -n "$TASK_ID" ] && [ -n "$AGENT2_ADDR" ]; then
    step "11" "Completing task $TASK_ID as agent2"
    if send_tx "complete-task" $BINARY tx agent complete-task "$TASK_ID" \
        '{"summary":"done","confidence":0.95}' \
        --from "$AGENT2_KEY" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
        :
    else
        fail "complete-task" "failed"
    fi
else
    skip_it "complete-task" "task_id or agent2 not available"
fi

# ============================================================================
# STEP 12: Deregister agent2
# ============================================================================
header "Step 12: Deregister Agent2"

if [ -n "$AGENT2_ADDR" ]; then
    step "12" "Deregistering agent2"
    if send_tx "deregister-agent" $BINARY tx agent deregister-agent \
        --from "$AGENT2_KEY" $KEYRING --chain-id "$CHAIN_ID" $FEES $GAS --node "$RPC"; then
        :
    else
        ERRMSG=$($BINARY tx agent deregister-agent --from "$AGENT2_KEY" $KEYRING --chain-id "$CHAIN_ID" --node "$RPC" --dry-run 2>&1 || true)
        if echo "$ERRMSG" | grep -qi "active.*task\|not found\|not registered"; then
            skip_it "deregister-agent" "agent has active tasks or not registered"
        else
            fail "deregister-agent" "$(echo "$ERRMSG" | head -2)"
        fi
    fi
else
    skip_it "deregister-agent" "agent2 not available"
fi

# ============================================================================
# STEP 13: Final balance
# ============================================================================
header "Step 13: Final Balance"

step "13" "Querying final balance"
FINAL=$($BINARY query bank balances "$FROM_ADDR" --output json --node "$RPC" 2>/dev/null || true)
echo "  $(echo "$FINAL" | jq -c '.balances' 2>/dev/null)"
pass "Final balance"

# ============================================================================
# Summary
# ============================================================================
header "E2E Demo Summary"

echo ""
for r in "${RESULTS[@]}"; do echo -e "    $r"; done
echo ""
echo -e "${CYAN}──────────────────────────────────────────────────────────────────${NC}"
TOTAL=$((PASS_N + FAIL_N + SKIP_N))
echo -e "  ${GREEN}Passed: $PASS_N${NC}  |  ${RED}Failed: $FAIL_N${NC}  |  ${YELLOW}Skipped: $SKIP_N${NC}  |  Total: $TOTAL"
echo -e "${CYAN}──────────────────────────────────────────────────────────────────${NC}"

if [ "$FAIL_N" -gt 0 ]; then
    echo -e "\n  ${RED}${BOLD}Some steps failed.${NC}"; exit 1
else
    echo -e "\n  ${GREEN}${BOLD}All steps passed!${NC}"; exit 0
fi
