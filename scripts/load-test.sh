#!/usr/bin/env bash
# =============================================================================
# ClawChain Load Test Script
# =============================================================================
# Stress-tests a locally running ClawChain node by:
#   1. Creating and funding test agent accounts
#   2. Registering each as an on-chain agent
#   3. Running concurrent heartbeat burst tests
#   4. Running agent-action throughput tests
#   5. Running intent submission tests
#   6. Running full task delegation lifecycle tests
#   7. Reporting a summary of throughput, success rates, and chain health
#
# Environment variables (all optional, with sane defaults):
#   AGENT_COUNT           Number of test agents (default: 10)
#   CHAIN_BINARY          Path to clawchaind binary (default: ~/go/bin/clawchaind)
#   CHAIN_ID              Chain ID (default: clawchain-local-1)
#   KEYRING_BACKEND       Keyring backend (default: test)
#   VALIDATOR_KEY         Validator key name (default: validator)
#   RPC                   RPC endpoint (default: http://localhost:26657)
#   FEES                  Tx fee flag (default: --fees 500uclaw)
#   FUND_AMOUNT           Amount to fund each test account (default: 100000000uclaw)
#   TX_WAIT_SECONDS       Seconds to wait for txs to land in a block (default: 7)
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
AGENT_COUNT="${AGENT_COUNT:-10}"
CHAIN_BINARY="${CHAIN_BINARY:-$HOME/go/bin/clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-local-1}"
KEYRING_BACKEND="${KEYRING_BACKEND:-test}"
VALIDATOR_KEY="${VALIDATOR_KEY:-validator}"
RPC="${RPC:-http://localhost:26657}"
FEES="${FEES:---fees 500uclaw}"
FUND_AMOUNT="${FUND_AMOUNT:-100000000uclaw}"
TX_WAIT_SECONDS="${TX_WAIT_SECONDS:-7}"

# Derived
TX_FLAGS="--chain-id $CHAIN_ID --keyring-backend $KEYRING_BACKEND --node $RPC $FEES --gas auto --gas-adjustment 1.5 -y --output json"
TMPDIR_LOAD="$(mktemp -d)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { printf "\033[1;34m[LOAD-TEST]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[OK]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[WARN]\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31m[FAIL]\033[0m %s\n" "$*"; }

# Cross-platform nanosecond timestamp (macOS lacks %N in date)
now_ns() {
  if command -v gdate >/dev/null 2>&1; then
    gdate +%s%N
  elif date +%s%N 2>/dev/null | grep -qv N; then
    date +%s%N
  else
    # Fallback: seconds * 1e9 (millisecond precision lost, but functional)
    python3 -c "import time; print(int(time.time() * 1e9))" 2>/dev/null || echo "$(date +%s)000000000"
  fi
}

elapsed_ms() {
  local start="$1" end="$2"
  echo $(( (end - start) / 1000000 ))
}

get_block_height() {
  local height
  height=$($CHAIN_BINARY status --node "$RPC" 2>&1 | jq -r '.sync_info.latest_block_height // .SyncInfo.latest_block_height // empty' 2>/dev/null || true)
  if [ -z "$height" ]; then
    # Fallback: query via RPC directly
    height=$(curl -s "$RPC/status" 2>/dev/null | jq -r '.result.sync_info.latest_block_height // empty' 2>/dev/null || echo "0")
  fi
  echo "${height:-0}"
}

get_block_time() {
  local btime
  btime=$($CHAIN_BINARY status --node "$RPC" 2>&1 | jq -r '.sync_info.latest_block_time // .SyncInfo.latest_block_time // empty' 2>/dev/null || true)
  if [ -z "$btime" ]; then
    btime=$(curl -s "$RPC/status" 2>/dev/null | jq -r '.result.sync_info.latest_block_time // empty' 2>/dev/null || echo "unknown")
  fi
  echo "${btime:-unknown}"
}

tx_hash_from_output() {
  echo "$1" | jq -r '.txhash // empty' 2>/dev/null || true
}

tx_code_from_output() {
  echo "$1" | jq -r '.code // 0' 2>/dev/null || echo "0"
}

wait_for_tx() {
  local txhash="$1"
  local timeout="${2:-$TX_WAIT_SECONDS}"
  if [ -z "$txhash" ]; then return 1; fi
  local deadline=$((SECONDS + timeout))
  while [ "$SECONDS" -lt "$deadline" ]; do
    local result
    result=$($CHAIN_BINARY query tx "$txhash" --node "$RPC" --output json 2>/dev/null || true)
    if [ -n "$result" ]; then
      local code
      code=$(echo "$result" | jq -r '.code // 0' 2>/dev/null || echo "0")
      echo "$code"
      return 0
    fi
    sleep 1
  done
  echo "timeout"
  return 1
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  log "Cleaning up temp dir: $TMPDIR_LOAD"
  rm -rf "$TMPDIR_LOAD"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
TOTAL_TX_SUBMITTED=0
TOTAL_TX_CONFIRMED=0
TOTAL_TX_FAILED=0

# Arrays to hold per-agent data
declare -a AGENT_KEYS=()
declare -a AGENT_ADDRS=()

# ============================================================================
# PHASE 1: SETUP -- Create and fund test accounts, register agents
# ============================================================================
log "============================================================"
log "PHASE 1: SETUP ($AGENT_COUNT agents)"
log "============================================================"

log "Verifying chain is reachable..."
START_HEIGHT=$(get_block_height)
if [ "$START_HEIGHT" = "0" ]; then
  fail "Cannot reach chain at $RPC. Is clawchaind running?"
  exit 1
fi
ok "Chain reachable at height $START_HEIGHT"

# 1a. Create accounts
log "Creating $AGENT_COUNT test accounts..."
for i in $(seq 1 "$AGENT_COUNT"); do
  KEY_NAME="loadtest-agent-${i}"
  # Delete if exists (idempotent)
  $CHAIN_BINARY keys delete "$KEY_NAME" --keyring-backend "$KEYRING_BACKEND" -y 2>/dev/null || true
  # Create new key
  $CHAIN_BINARY keys add "$KEY_NAME" --keyring-backend "$KEYRING_BACKEND" --output json 2>/dev/null > "$TMPDIR_LOAD/key-${i}.json"
  ADDR=$($CHAIN_BINARY keys show "$KEY_NAME" --keyring-backend "$KEYRING_BACKEND" -a 2>/dev/null)
  AGENT_KEYS+=("$KEY_NAME")
  AGENT_ADDRS+=("$ADDR")
done
ok "Created ${#AGENT_KEYS[@]} test accounts"

# 1b. Fund each account from the validator
log "Funding accounts from validator ($FUND_AMOUNT each)..."
for i in $(seq 0 $((AGENT_COUNT - 1))); do
  ADDR="${AGENT_ADDRS[$i]}"
  OUTPUT=$($CHAIN_BINARY tx bank send "$VALIDATOR_KEY" "$ADDR" "$FUND_AMOUNT" $TX_FLAGS 2>&1 || true)
  TXHASH=$(tx_hash_from_output "$OUTPUT")
  if [ -n "$TXHASH" ]; then
    TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))
  fi
  # Small stagger to avoid sequence mismatches
  sleep 0.3
done
log "Waiting for funding txs to confirm..."
sleep "$TX_WAIT_SECONDS"

# Verify at least the first account has funds
BALANCE=$($CHAIN_BINARY query bank balances "${AGENT_ADDRS[0]}" --node "$RPC" --output json 2>/dev/null | jq -r '.balances[]? | select(.denom=="uclaw") | .amount' 2>/dev/null || echo "0")
if [ "$BALANCE" = "0" ] || [ -z "$BALANCE" ]; then
  warn "First agent account has zero balance; funding may have failed."
else
  ok "Accounts funded (first account balance: ${BALANCE}uclaw)"
  TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + AGENT_COUNT))
fi

# 1c. Register each account as an agent
log "Registering $AGENT_COUNT agents on-chain..."
REGISTER_SUCCESS=0
REGISTER_FAIL=0
for i in $(seq 0 $((AGENT_COUNT - 1))); do
  KEY="${AGENT_KEYS[$i]}"
  AGENT_NAME="load-agent-$((i + 1))"
  PUBKEY="loadtest-pubkey-$((i + 1))"
  ENDPOINT="http://localhost:808$((i % 10))"
  OUTPUT=$($CHAIN_BINARY tx agent register-agent "$PUBKEY" "$ENDPOINT" "$AGENT_NAME" \
    --from "$KEY" $TX_FLAGS 2>&1 || true)
  TXHASH=$(tx_hash_from_output "$OUTPUT")
  CODE=$(tx_code_from_output "$OUTPUT")
  TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))
  if [ -n "$TXHASH" ] && [ "$CODE" = "0" ]; then
    REGISTER_SUCCESS=$((REGISTER_SUCCESS + 1))
  else
    REGISTER_FAIL=$((REGISTER_FAIL + 1))
  fi
  sleep 0.3
done
log "Waiting for registration txs to confirm..."
sleep "$TX_WAIT_SECONDS"
TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + REGISTER_SUCCESS))
TOTAL_TX_FAILED=$((TOTAL_TX_FAILED + REGISTER_FAIL))
ok "Registered $REGISTER_SUCCESS agents ($REGISTER_FAIL failed)"

# ============================================================================
# PHASE 2: HEARTBEAT BURST TEST
# ============================================================================
log "============================================================"
log "PHASE 2: HEARTBEAT BURST TEST"
log "============================================================"

CURRENT_HEIGHT=$(get_block_height)
HB_SUCCESS=0
HB_FAIL=0
HB_RESULTS="$TMPDIR_LOAD/hb_results"
mkdir -p "$HB_RESULTS"

HB_START=$(now_ns)

# Launch heartbeats concurrently
for i in $(seq 0 $((AGENT_COUNT - 1))); do
  (
    KEY="${AGENT_KEYS[$i]}"
    ENDPOINT="http://localhost:808$((i % 10))"
    METADATA='{"test":"heartbeat-burst","agent":'$((i + 1))'}'
    OUTPUT=$($CHAIN_BINARY tx agent agent-heartbeat "$CURRENT_HEIGHT" "$ENDPOINT" "$METADATA" \
      --from "$KEY" $TX_FLAGS 2>&1 || true)
    CODE=$(tx_code_from_output "$OUTPUT")
    echo "$CODE" > "$HB_RESULTS/hb-$i.code"
  ) &
done
# Wait for all background heartbeat jobs
wait

HB_END=$(now_ns)
HB_ELAPSED_MS=$(elapsed_ms "$HB_START" "$HB_END")

# Tally results
for i in $(seq 0 $((AGENT_COUNT - 1))); do
  CODE=$(cat "$HB_RESULTS/hb-$i.code" 2>/dev/null || echo "999")
  TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))
  if [ "$CODE" = "0" ]; then
    HB_SUCCESS=$((HB_SUCCESS + 1))
    TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + 1))
  else
    HB_FAIL=$((HB_FAIL + 1))
    TOTAL_TX_FAILED=$((TOTAL_TX_FAILED + 1))
  fi
done

HB_RATE="0"
if [ "$HB_ELAPSED_MS" -gt 0 ]; then
  HB_RATE=$(echo "scale=2; $HB_SUCCESS * 1000 / $HB_ELAPSED_MS" | bc 2>/dev/null || echo "N/A")
fi
HB_SUCCESS_RATE="0"
if [ "$AGENT_COUNT" -gt 0 ]; then
  HB_SUCCESS_RATE=$(echo "scale=1; $HB_SUCCESS * 100 / $AGENT_COUNT" | bc 2>/dev/null || echo "N/A")
fi

ok "Heartbeat burst: ${HB_SUCCESS}/${AGENT_COUNT} succeeded in ${HB_ELAPSED_MS}ms"
ok "  Heartbeats/sec: $HB_RATE  |  Success rate: ${HB_SUCCESS_RATE}%"

# Wait for heartbeat txs to land before next phase (respects min heartbeat interval)
sleep "$TX_WAIT_SECONDS"

# ============================================================================
# PHASE 3: ACTION THROUGHPUT TEST
# ============================================================================
log "============================================================"
log "PHASE 3: ACTION THROUGHPUT TEST (query actions)"
log "============================================================"

ACTION_SUCCESS=0
ACTION_FAIL=0
ACTION_RESULTS="$TMPDIR_LOAD/action_results"
mkdir -p "$ACTION_RESULTS"

ACTION_START=$(now_ns)

# Fire agent-action txs concurrently
for i in $(seq 0 $((AGENT_COUNT - 1))); do
  (
    KEY="${AGENT_KEYS[$i]}"
    PAYLOAD='{"query":"load-test-query","index":'$((i + 1))'}'
    PROOF="loadtest-proof-$((i + 1))"
    OUTPUT=$($CHAIN_BINARY tx agent agent-action query "$PAYLOAD" "$PROOF" \
      --from "$KEY" $TX_FLAGS 2>&1 || true)
    CODE=$(tx_code_from_output "$OUTPUT")
    echo "$CODE" > "$ACTION_RESULTS/action-$i.code"
  ) &
done
wait

ACTION_END=$(now_ns)
ACTION_ELAPSED_MS=$(elapsed_ms "$ACTION_START" "$ACTION_END")

for i in $(seq 0 $((AGENT_COUNT - 1))); do
  CODE=$(cat "$ACTION_RESULTS/action-$i.code" 2>/dev/null || echo "999")
  TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))
  if [ "$CODE" = "0" ]; then
    ACTION_SUCCESS=$((ACTION_SUCCESS + 1))
    TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + 1))
  else
    ACTION_FAIL=$((ACTION_FAIL + 1))
    TOTAL_TX_FAILED=$((TOTAL_TX_FAILED + 1))
  fi
done

ACTION_RATE="0"
if [ "$ACTION_ELAPSED_MS" -gt 0 ]; then
  ACTION_RATE=$(echo "scale=2; $ACTION_SUCCESS * 1000 / $ACTION_ELAPSED_MS" | bc 2>/dev/null || echo "N/A")
fi
ACTION_SUCCESS_RATE="0"
if [ "$AGENT_COUNT" -gt 0 ]; then
  ACTION_SUCCESS_RATE=$(echo "scale=1; $ACTION_SUCCESS * 100 / $AGENT_COUNT" | bc 2>/dev/null || echo "N/A")
fi

ok "Action throughput: ${ACTION_SUCCESS}/${AGENT_COUNT} succeeded in ${ACTION_ELAPSED_MS}ms"
ok "  Actions/sec: $ACTION_RATE  |  Success rate: ${ACTION_SUCCESS_RATE}%"

sleep "$TX_WAIT_SECONDS"

# ============================================================================
# PHASE 4: INTENT SUBMISSION TEST
# ============================================================================
log "============================================================"
log "PHASE 4: INTENT SUBMISSION TEST"
log "============================================================"

INTENT_SUCCESS=0
INTENT_FAIL=0
INTENT_RESULTS="$TMPDIR_LOAD/intent_results"
mkdir -p "$INTENT_RESULTS"

INTENT_START=$(now_ns)

# Submit intents concurrently from all agents
for i in $(seq 0 $((AGENT_COUNT - 1))); do
  (
    KEY="${AGENT_KEYS[$i]}"
    INTENT_TYPE="coordination"
    DESCRIPTION="Load test intent from agent $((i + 1))"
    PAYLOAD='{"task":"load-test","agent":'$((i + 1))'}'
    MIN_RESPONSES="1"
    OUTPUT=$($CHAIN_BINARY tx agent submit-intent "$INTENT_TYPE" "$DESCRIPTION" "$PAYLOAD" "$MIN_RESPONSES" \
      --from "$KEY" $TX_FLAGS 2>&1 || true)
    CODE=$(tx_code_from_output "$OUTPUT")
    echo "$CODE" > "$INTENT_RESULTS/intent-$i.code"
  ) &
done
wait

INTENT_END=$(now_ns)
INTENT_ELAPSED_MS=$(elapsed_ms "$INTENT_START" "$INTENT_END")

for i in $(seq 0 $((AGENT_COUNT - 1))); do
  CODE=$(cat "$INTENT_RESULTS/intent-$i.code" 2>/dev/null || echo "999")
  TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))
  if [ "$CODE" = "0" ]; then
    INTENT_SUCCESS=$((INTENT_SUCCESS + 1))
    TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + 1))
  else
    INTENT_FAIL=$((INTENT_FAIL + 1))
    TOTAL_TX_FAILED=$((TOTAL_TX_FAILED + 1))
  fi
done

INTENT_RATE="0"
if [ "$INTENT_ELAPSED_MS" -gt 0 ]; then
  INTENT_RATE=$(echo "scale=2; $INTENT_SUCCESS * 1000 / $INTENT_ELAPSED_MS" | bc 2>/dev/null || echo "N/A")
fi
INTENT_SUCCESS_RATE="0"
if [ "$AGENT_COUNT" -gt 0 ]; then
  INTENT_SUCCESS_RATE=$(echo "scale=1; $INTENT_SUCCESS * 100 / $AGENT_COUNT" | bc 2>/dev/null || echo "N/A")
fi

ok "Intent submission: ${INTENT_SUCCESS}/${AGENT_COUNT} succeeded in ${INTENT_ELAPSED_MS}ms"
ok "  Intents/sec: $INTENT_RATE  |  Success rate: ${INTENT_SUCCESS_RATE}%"

sleep "$TX_WAIT_SECONDS"

# ============================================================================
# PHASE 5: TASK DELEGATION LIFECYCLE TEST
# ============================================================================
log "============================================================"
log "PHASE 5: TASK DELEGATION LIFECYCLE TEST"
log "============================================================"

# Pair agents: agent[i] delegates to agent[i+1] (wraps around)
TASK_PAIRS=$((AGENT_COUNT / 2))
if [ "$TASK_PAIRS" -lt 1 ]; then TASK_PAIRS=1; fi

TASK_DELEGATE_SUCCESS=0
TASK_ACCEPT_SUCCESS=0
TASK_COMPLETE_SUCCESS=0
TASK_FAIL=0
TASK_RESULTS="$TMPDIR_LOAD/task_results"
mkdir -p "$TASK_RESULTS"

TASK_START=$(now_ns)

# Step 5a: Delegate tasks (serial to capture task IDs reliably)
log "  Delegating $TASK_PAIRS tasks..."
declare -a TASK_IDS=()
for i in $(seq 0 $((TASK_PAIRS - 1))); do
  DELEGATOR_KEY="${AGENT_KEYS[$((i * 2))]}"
  ASSIGNEE_ADDR="${AGENT_ADDRS[$((i * 2 + 1))]}"
  DESCRIPTION="Load test task $((i + 1))"
  REQUIREMENTS='{"type":"load-test"}'
  SKILL_ID="0"
  BUDGET="100"
  DEADLINE="500"

  OUTPUT=$($CHAIN_BINARY tx agent delegate-task "$ASSIGNEE_ADDR" "$DESCRIPTION" "$REQUIREMENTS" "$SKILL_ID" "$BUDGET" "$DEADLINE" \
    --from "$DELEGATOR_KEY" $TX_FLAGS 2>&1 || true)
  CODE=$(tx_code_from_output "$OUTPUT")
  TXHASH=$(tx_hash_from_output "$OUTPUT")
  TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))

  if [ "$CODE" = "0" ] && [ -n "$TXHASH" ]; then
    TASK_DELEGATE_SUCCESS=$((TASK_DELEGATE_SUCCESS + 1))
    TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + 1))
    # Store txhash to extract task_id later
    echo "$TXHASH" > "$TASK_RESULTS/delegate-$i.txhash"
  else
    TASK_FAIL=$((TASK_FAIL + 1))
    TOTAL_TX_FAILED=$((TOTAL_TX_FAILED + 1))
    echo "" > "$TASK_RESULTS/delegate-$i.txhash"
  fi
  sleep 0.5
done

log "  Waiting for delegation txs to confirm..."
sleep "$TX_WAIT_SECONDS"

# Extract task IDs from tx results
for i in $(seq 0 $((TASK_PAIRS - 1))); do
  TXHASH=$(cat "$TASK_RESULTS/delegate-$i.txhash" 2>/dev/null || true)
  TASK_ID=""
  if [ -n "$TXHASH" ]; then
    TX_RESULT=$($CHAIN_BINARY query tx "$TXHASH" --node "$RPC" --output json 2>/dev/null || true)
    if [ -n "$TX_RESULT" ]; then
      # Try to extract task_id from events
      TASK_ID=$(echo "$TX_RESULT" | jq -r '
        [.events[]? | select(.type=="delegate_task") | .attributes[]? | select(.key=="task_id") | .value] | first // empty
      ' 2>/dev/null || true)
      # Fallback: try logs
      if [ -z "$TASK_ID" ]; then
        TASK_ID=$(echo "$TX_RESULT" | jq -r '
          [.logs[]?.events[]? | select(.type=="delegate_task") | .attributes[]? | select(.key=="task_id") | .value] | first // empty
        ' 2>/dev/null || true)
      fi
    fi
  fi
  TASK_IDS+=("${TASK_ID:-}")
done

# Step 5b: Accept tasks
log "  Accepting tasks..."
for i in $(seq 0 $((TASK_PAIRS - 1))); do
  TASK_ID="${TASK_IDS[$i]:-}"
  if [ -z "$TASK_ID" ]; then
    warn "  Skipping accept for pair $i (no task_id)"
    continue
  fi
  ASSIGNEE_KEY="${AGENT_KEYS[$((i * 2 + 1))]}"
  OUTPUT=$($CHAIN_BINARY tx agent accept-task "$TASK_ID" \
    --from "$ASSIGNEE_KEY" $TX_FLAGS 2>&1 || true)
  CODE=$(tx_code_from_output "$OUTPUT")
  TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))
  if [ "$CODE" = "0" ]; then
    TASK_ACCEPT_SUCCESS=$((TASK_ACCEPT_SUCCESS + 1))
    TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + 1))
  else
    TASK_FAIL=$((TASK_FAIL + 1))
    TOTAL_TX_FAILED=$((TOTAL_TX_FAILED + 1))
  fi
  sleep 0.3
done

log "  Waiting for accept txs to confirm..."
sleep "$TX_WAIT_SECONDS"

# Step 5c: Complete tasks
log "  Completing tasks..."
for i in $(seq 0 $((TASK_PAIRS - 1))); do
  TASK_ID="${TASK_IDS[$i]:-}"
  if [ -z "$TASK_ID" ]; then
    warn "  Skipping complete for pair $i (no task_id)"
    continue
  fi
  ASSIGNEE_KEY="${AGENT_KEYS[$((i * 2 + 1))]}"
  RESULT='{"status":"done","load_test":true}'
  OUTPUT=$($CHAIN_BINARY tx agent complete-task "$TASK_ID" "$RESULT" \
    --from "$ASSIGNEE_KEY" $TX_FLAGS 2>&1 || true)
  CODE=$(tx_code_from_output "$OUTPUT")
  TOTAL_TX_SUBMITTED=$((TOTAL_TX_SUBMITTED + 1))
  if [ "$CODE" = "0" ]; then
    TASK_COMPLETE_SUCCESS=$((TASK_COMPLETE_SUCCESS + 1))
    TOTAL_TX_CONFIRMED=$((TOTAL_TX_CONFIRMED + 1))
  else
    TASK_FAIL=$((TASK_FAIL + 1))
    TOTAL_TX_FAILED=$((TOTAL_TX_FAILED + 1))
  fi
  sleep 0.3
done

TASK_END=$(now_ns)
TASK_ELAPSED_MS=$(elapsed_ms "$TASK_START" "$TASK_END")

TASK_TOTAL=$((TASK_DELEGATE_SUCCESS + TASK_ACCEPT_SUCCESS + TASK_COMPLETE_SUCCESS))
TASK_LIFECYCLE_RATE="0"
if [ "$TASK_ELAPSED_MS" -gt 0 ]; then
  TASK_LIFECYCLE_RATE=$(echo "scale=2; $TASK_TOTAL * 1000 / $TASK_ELAPSED_MS" | bc 2>/dev/null || echo "N/A")
fi
AVG_LIFECYCLE_MS="N/A"
if [ "$TASK_DELEGATE_SUCCESS" -gt 0 ]; then
  AVG_LIFECYCLE_MS=$(echo "scale=0; $TASK_ELAPSED_MS / $TASK_DELEGATE_SUCCESS" | bc 2>/dev/null || echo "N/A")
fi

ok "Task delegation lifecycle ($TASK_PAIRS pairs):"
ok "  Delegated: $TASK_DELEGATE_SUCCESS  |  Accepted: $TASK_ACCEPT_SUCCESS  |  Completed: $TASK_COMPLETE_SUCCESS"
ok "  Total task txs/sec: $TASK_LIFECYCLE_RATE  |  Avg lifecycle: ${AVG_LIFECYCLE_MS}ms"
ok "  Failures: $TASK_FAIL"

# ============================================================================
# PHASE 6: RESULTS SUMMARY
# ============================================================================
log "============================================================"
log "PHASE 6: RESULTS SUMMARY"
log "============================================================"

END_HEIGHT=$(get_block_height)
END_BLOCK_TIME=$(get_block_time)
BLOCKS_ELAPSED=$((END_HEIGHT - START_HEIGHT))

# Compute average block time (rough approximation)
AVG_BLOCK_TIME_MS="N/A"
TOTAL_TEST_ELAPSED_NS=$(($(now_ns) - HB_START))
TOTAL_TEST_ELAPSED_MS=$((TOTAL_TEST_ELAPSED_NS / 1000000))
if [ "$BLOCKS_ELAPSED" -gt 0 ]; then
  AVG_BLOCK_TIME_MS=$(echo "scale=0; $TOTAL_TEST_ELAPSED_MS / $BLOCKS_ELAPSED" | bc 2>/dev/null || echo "N/A")
fi

# Estimate peak txs per block (rough: total confirmed / blocks elapsed)
PEAK_TXS_PER_BLOCK="N/A"
if [ "$BLOCKS_ELAPSED" -gt 0 ]; then
  PEAK_TXS_PER_BLOCK=$(echo "scale=1; $TOTAL_TX_CONFIRMED / $BLOCKS_ELAPSED" | bc 2>/dev/null || echo "N/A")
fi

OVERALL_TPS="0"
if [ "$TOTAL_TEST_ELAPSED_MS" -gt 0 ]; then
  OVERALL_TPS=$(echo "scale=2; $TOTAL_TX_CONFIRMED * 1000 / $TOTAL_TEST_ELAPSED_MS" | bc 2>/dev/null || echo "N/A")
fi

# Check consensus health
CONSENSUS_OK="true"
CATCHING_UP=$($CHAIN_BINARY status --node "$RPC" 2>&1 | jq -r '.sync_info.catching_up // .SyncInfo.catching_up // "unknown"' 2>/dev/null || echo "unknown")
if [ "$CATCHING_UP" = "true" ]; then
  CONSENSUS_OK="false (node catching up)"
fi

printf "\n"
printf "\033[1;36m╔══════════════════════════════════════════════════════════════╗\033[0m\n"
printf "\033[1;36m║             ClawChain Load Test Results                      ║\033[0m\n"
printf "\033[1;36m╠══════════════════════════════════════════════════════════════╣\033[0m\n"
printf "\033[1;36m║\033[0m  Agents tested:           %-35s\033[1;36m║\033[0m\n" "$AGENT_COUNT"
printf "\033[1;36m║\033[0m  Test duration:           %-35s\033[1;36m║\033[0m\n" "${TOTAL_TEST_ELAPSED_MS}ms"
printf "\033[1;36m╠══════════════════════════════════════════════════════════════╣\033[0m\n"
printf "\033[1;36m║\033[0m  \033[1mTransaction Summary\033[0m                                        \033[1;36m║\033[0m\n"
printf "\033[1;36m║\033[0m    Submitted:             %-35s\033[1;36m║\033[0m\n" "$TOTAL_TX_SUBMITTED"
printf "\033[1;36m║\033[0m    Confirmed:             %-35s\033[1;36m║\033[0m\n" "$TOTAL_TX_CONFIRMED"
printf "\033[1;36m║\033[0m    Failed:                %-35s\033[1;36m║\033[0m\n" "$TOTAL_TX_FAILED"
printf "\033[1;36m╠══════════════════════════════════════════════════════════════╣\033[0m\n"
printf "\033[1;36m║\033[0m  \033[1mThroughput\033[0m                                                 \033[1;36m║\033[0m\n"
printf "\033[1;36m║\033[0m    Heartbeats/sec:        %-35s\033[1;36m║\033[0m\n" "$HB_RATE"
printf "\033[1;36m║\033[0m    Actions/sec:           %-35s\033[1;36m║\033[0m\n" "$ACTION_RATE"
printf "\033[1;36m║\033[0m    Intents/sec:           %-35s\033[1;36m║\033[0m\n" "$INTENT_RATE"
printf "\033[1;36m║\033[0m    Task lifecycle/sec:    %-35s\033[1;36m║\033[0m\n" "$TASK_LIFECYCLE_RATE"
printf "\033[1;36m║\033[0m    Overall txs/sec:       %-35s\033[1;36m║\033[0m\n" "$OVERALL_TPS"
printf "\033[1;36m╠══════════════════════════════════════════════════════════════╣\033[0m\n"
printf "\033[1;36m║\033[0m  \033[1mChain Health\033[0m                                               \033[1;36m║\033[0m\n"
printf "\033[1;36m║\033[0m    Start height:          %-35s\033[1;36m║\033[0m\n" "$START_HEIGHT"
printf "\033[1;36m║\033[0m    End height:            %-35s\033[1;36m║\033[0m\n" "$END_HEIGHT"
printf "\033[1;36m║\033[0m    Blocks during test:    %-35s\033[1;36m║\033[0m\n" "$BLOCKS_ELAPSED"
printf "\033[1;36m║\033[0m    Avg block time:        %-35s\033[1;36m║\033[0m\n" "${AVG_BLOCK_TIME_MS}ms"
printf "\033[1;36m║\033[0m    Avg txs/block:         %-35s\033[1;36m║\033[0m\n" "$PEAK_TXS_PER_BLOCK"
printf "\033[1;36m║\033[0m    Consensus healthy:     %-35s\033[1;36m║\033[0m\n" "$CONSENSUS_OK"
printf "\033[1;36m║\033[0m    Latest block time:     %-35s\033[1;36m║\033[0m\n" "$END_BLOCK_TIME"
printf "\033[1;36m╚══════════════════════════════════════════════════════════════╝\033[0m\n"
printf "\n"

# ---------------------------------------------------------------------------
# Optional: Write machine-readable JSON report
# ---------------------------------------------------------------------------
REPORT_FILE="$TMPDIR_LOAD/load-test-report.json"
cat > "$REPORT_FILE" <<JSONEOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "agent_count": $AGENT_COUNT,
  "test_duration_ms": $TOTAL_TEST_ELAPSED_MS,
  "transactions": {
    "submitted": $TOTAL_TX_SUBMITTED,
    "confirmed": $TOTAL_TX_CONFIRMED,
    "failed": $TOTAL_TX_FAILED
  },
  "throughput": {
    "heartbeats_per_sec": "$HB_RATE",
    "actions_per_sec": "$ACTION_RATE",
    "intents_per_sec": "$INTENT_RATE",
    "task_lifecycle_per_sec": "$TASK_LIFECYCLE_RATE",
    "overall_tps": "$OVERALL_TPS"
  },
  "success_rates": {
    "heartbeat_pct": "$HB_SUCCESS_RATE",
    "action_pct": "$ACTION_SUCCESS_RATE",
    "intent_pct": "$INTENT_SUCCESS_RATE"
  },
  "chain_health": {
    "start_height": $START_HEIGHT,
    "end_height": $END_HEIGHT,
    "blocks_during_test": $BLOCKS_ELAPSED,
    "avg_block_time_ms": "$AVG_BLOCK_TIME_MS",
    "avg_txs_per_block": "$PEAK_TXS_PER_BLOCK",
    "consensus_healthy": "$CONSENSUS_OK"
  }
}
JSONEOF

# Copy report to working directory if possible
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_DEST="$SCRIPT_DIR/../load-test-report.json"
cp "$REPORT_FILE" "$REPORT_DEST" 2>/dev/null && log "Report written to $REPORT_DEST" || true

# ---------------------------------------------------------------------------
# Cleanup test keys (optional, comment out to keep them for inspection)
# ---------------------------------------------------------------------------
log "Cleaning up test keys..."
for KEY in "${AGENT_KEYS[@]}"; do
  $CHAIN_BINARY keys delete "$KEY" --keyring-backend "$KEYRING_BACKEND" -y 2>/dev/null || true
done

# Final status
if [ "$TOTAL_TX_FAILED" -gt $((TOTAL_TX_SUBMITTED / 3)) ]; then
  fail "High failure rate: $TOTAL_TX_FAILED / $TOTAL_TX_SUBMITTED txs failed"
  exit 1
else
  ok "Load test complete. $TOTAL_TX_CONFIRMED/$TOTAL_TX_SUBMITTED txs confirmed."
fi
