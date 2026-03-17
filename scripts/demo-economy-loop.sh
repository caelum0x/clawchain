#!/usr/bin/env bash
# =============================================================================
# demo-economy-loop.sh — 16-step ClawChain Economy Loop Demo (clawchaind)
# =============================================================================
#
# Demonstrates the full ClawChain economy loop end-to-end using clawchaind
# (the raw Cosmos SDK binary). Each step prints a clear description, executes
# the command, shows the result, and pauses briefly for readability.
#
# Actors:
#   Alice — task creator / skill buyer / escrow funder / voter
#   Bob   — agent operator / skill provider / escrow seller
#
# Prerequisites:
#   - Running local chain or testnet
#   - clawchaind binary on PATH or in project root
#   - jq installed
#   - openssl installed (for privacy blinding factor)
#
# Usage:
#   ./scripts/demo-economy-loop.sh                    # run all 16 steps
#   ./scripts/demo-economy-loop.sh --dry-run          # show commands only
#   ./scripts/demo-economy-loop.sh --skip-to 8        # resume from step 8
#   ./scripts/demo-economy-loop.sh --skip-to 12       # resume from step 12
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BINARY="${BINARY:-clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
RPC="${RPC:-http://localhost:26657}"
REST="${REST:-http://localhost:1317}"
DENOM="${DENOM:-uclaw}"
KEYRING_BACKEND="${KEYRING_BACKEND:-test}"
NODE0_HOME="${NODE0_HOME:-}"
TX_WAIT="${TX_WAIT:-6}"

DRY_RUN=false
SKIP_TO=0

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-to) SKIP_TO="${2:-1}"; shift 2 ;;
    --skip-to=*) SKIP_TO="${1#*=}"; shift ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--skip-to <step>]"
      echo ""
      echo "Flags:"
      echo "  --dry-run         Show commands without executing"
      echo "  --skip-to <step>  Resume from a specific step (1-16)"
      echo ""
      echo "Environment variables:"
      echo "  BINARY            Path to clawchaind (default: clawchaind)"
      echo "  CHAIN_ID          Chain ID (default: clawchain-testnet-1)"
      echo "  RPC               RPC endpoint (default: http://localhost:26657)"
      echo "  REST              REST endpoint (default: http://localhost:1317)"
      echo "  NODE0_HOME        Node home directory for keyring"
      exit 0
      ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Colors & formatting
# ---------------------------------------------------------------------------
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
DIM='\033[2m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Counters & state
# ---------------------------------------------------------------------------
PASS_N=0
FAIL_N=0
SKIP_N=0
declare -a RESULTS=()
CURRENT_STEP=0
ALICE_ADDR=""
BOB_ADDR=""
ALICE_KEY="alice-demo"
BOB_KEY="bob-demo"
SKILL_ID=""
TASK_ID=""
ESCROW_ID=""
PROPOSAL_ID=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
banner() {
  echo ""
  echo -e "${BOLD}${CYAN}============================================================================${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}============================================================================${NC}"
}

step_header() {
  local num="$1"
  local title="$2"
  CURRENT_STEP=$num
  echo ""
  echo -e "${BOLD}${MAGENTA}--- Step ${num}/16: ${title} ---${NC}"
}

info() {
  echo -e "  ${CYAN}[info]${NC} $1"
}

run_cmd() {
  echo -e "  ${DIM}\$ $*${NC}"
  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[dry-run] skipped${NC}"
    return 0
  fi
  eval "$@"
}

pass() {
  echo -e "  ${GREEN}[PASS]${NC} $1"
  PASS_N=$((PASS_N + 1))
  RESULTS+=("${GREEN}PASS${NC} Step ${CURRENT_STEP}: $1")
}

fail() {
  echo -e "  ${RED}[FAIL]${NC} $1"
  [ -n "${2:-}" ] && echo -e "         ${RED}reason: $2${NC}"
  FAIL_N=$((FAIL_N + 1))
  RESULTS+=("${RED}FAIL${NC} Step ${CURRENT_STEP}: $1")
}

skip_step() {
  echo -e "  ${YELLOW}[SKIP]${NC} $1"
  [ -n "${2:-}" ] && echo -e "         ${YELLOW}reason: $2${NC}"
  SKIP_N=$((SKIP_N + 1))
  RESULTS+=("${YELLOW}SKIP${NC} Step ${CURRENT_STEP}: $1")
}

pause() {
  if [ "$DRY_RUN" = false ]; then
    sleep "${1:-1.5}"
  fi
}

should_run() {
  local step_num="$1"
  [ "$step_num" -ge "$SKIP_TO" ]
}

resolve_binary() {
  local root
  root="$(cd "$(dirname "$0")/.." && pwd)"
  if [ -x "${root}/bin/clawchaind" ]; then
    BINARY="${root}/bin/clawchaind"
  elif [ -x "${root}/clawchaind" ]; then
    BINARY="${root}/clawchaind"
  elif command -v "${BINARY}" &>/dev/null; then
    BINARY="$(command -v "${BINARY}")"
  else
    echo -e "${RED}ERROR: clawchaind binary not found. Run 'make install' first.${NC}"
    exit 1
  fi
}

resolve_home() {
  if [ -z "$NODE0_HOME" ]; then
    local root
    root="$(cd "$(dirname "$0")/.." && pwd)"
    if [ -d "${root}/testnet/data/node0" ]; then
      NODE0_HOME="${root}/testnet/data/node0"
    else
      NODE0_HOME="${HOME}/.clawchaind"
    fi
  fi
}

KEYRING=""
TX_COMMON=""
TX_SHIELD_COMMON=""

setup_tx_flags() {
  KEYRING="--keyring-backend ${KEYRING_BACKEND} --home ${NODE0_HOME}"
  TX_COMMON="--node ${RPC} --chain-id ${CHAIN_ID} --fees 500${DENOM} --gas 200000 --broadcast-mode sync -y --output json"
  TX_SHIELD_COMMON="--node ${RPC} --chain-id ${CHAIN_ID} --fees 500${DENOM} --gas 500000 --broadcast-mode sync -y --output json"
}

tx_code() {
  echo "$1" | jq -r 'if has("code") then (.code|tostring) elif ((.txhash // "")|length) > 0 then "0" else "1" end' 2>/dev/null || echo "1"
}

tx_hash() {
  echo "$1" | jq -r '.txhash // empty' 2>/dev/null || echo ""
}

wait_tx() {
  local hash="$1"
  local tries="${2:-25}"
  if [ -z "${hash}" ] || [ "${hash}" = "null" ]; then
    sleep 2
    return 0
  fi
  echo -e "  ${DIM}Waiting for tx ${hash:0:16}...${NC}"
  for _ in $(seq 1 "${tries}"); do
    if ${BINARY} query tx "${hash}" --node "${RPC}" --output json >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  sleep 2
}

tx_deliver_code() {
  local hash="$1"
  if [ -z "${hash}" ] || [ "${hash}" = "null" ]; then
    echo "1"
    return 0
  fi
  ${BINARY} query tx "${hash}" --node "${RPC}" --output json 2>/dev/null | jq -r '.code // 1' 2>/dev/null || echo "1"
}

send_and_verify() {
  local label="$1"
  shift
  local result
  result=$("$@" 2>&1 || echo '{}')
  local code hash
  code=$(tx_code "${result}")
  hash=$(tx_hash "${result}")

  if [ "${code}" = "0" ] && [ -n "${hash}" ]; then
    wait_tx "${hash}"
    local deliver_code
    deliver_code=$(tx_deliver_code "${hash}")
    if [ "${deliver_code}" = "0" ]; then
      info "TxHash: ${hash}"
      pass "${label}"
      echo "${hash}"
      return 0
    else
      local raw_log
      raw_log=$(${BINARY} query tx "${hash}" --node "${RPC}" --output json 2>/dev/null | jq -r '.raw_log // ""' 2>/dev/null || echo "")
      fail "${label}" "tx error: ${raw_log}"
      return 1
    fi
  else
    local errmsg
    errmsg=$(echo "${result}" | head -3 | tr '\n' ' ')
    fail "${label}" "${errmsg}"
    return 1
  fi
}

# =============================================================================
# Main
# =============================================================================
banner "ClawChain Economy Loop Demo (clawchaind)"

resolve_binary
resolve_home
setup_tx_flags

echo ""
echo -e "  Binary:       ${BOLD}${BINARY}${NC}"
echo -e "  Chain ID:     ${BOLD}${CHAIN_ID}${NC}"
echo -e "  RPC:          ${BOLD}${RPC}${NC}"
echo -e "  REST:         ${BOLD}${REST}${NC}"
echo -e "  Node home:    ${BOLD}${NODE0_HOME}${NC}"
echo -e "  Dry-run:      ${BOLD}${DRY_RUN}${NC}"
if [ "$SKIP_TO" -gt 0 ]; then
  echo -e "  Skip to:      ${BOLD}Step ${SKIP_TO}${NC}"
fi

# =============================================================================
# Step 1: Start chain — check chain is running, show block height
# =============================================================================
if should_run 1; then
  step_header 1 "Chain Health Check"
  info "Checking that the chain is running and producing blocks..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "curl -s ${RPC}/status | jq .result.sync_info"
    pass "Chain health (dry-run)"
  else
    STATUS_JSON=$(curl -s "${RPC}/status" 2>/dev/null || echo "")
    if [ -n "$STATUS_JSON" ]; then
      HEIGHT=$(echo "${STATUS_JSON}" | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo "0")
      CATCHING_UP=$(echo "${STATUS_JSON}" | jq -r '.result.sync_info.catching_up' 2>/dev/null || echo "unknown")
      info "Block height: ${HEIGHT}"
      info "Catching up:  ${CATCHING_UP}"
      if [ "${CATCHING_UP}" = "false" ] && [ "${HEIGHT}" != "0" ]; then
        pass "Chain is running at block ${HEIGHT}"
      else
        fail "Chain health" "height=${HEIGHT}, catching_up=${CATCHING_UP}"
      fi
    else
      fail "Chain health" "Cannot connect to RPC at ${RPC}"
    fi
  fi
  pause
fi

# =============================================================================
# Step 2: Create wallets — Create 2 test wallets
# =============================================================================
if should_run 2; then
  step_header 2 "Create Wallets (Alice + Bob)"
  info "Alice = task creator, skill buyer, escrow funder"
  info "Bob   = agent operator, skill provider, escrow seller"

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} keys add ${ALICE_KEY} ${KEYRING} 2>/dev/null || true"
    run_cmd "${BINARY} keys add ${BOB_KEY} ${KEYRING} 2>/dev/null || true"
    pass "Wallets created (dry-run)"
  else
    # Create Alice
    ALICE_ADDR=$(${BINARY} keys show "${ALICE_KEY}" -a ${KEYRING} 2>/dev/null || true)
    if [ -z "${ALICE_ADDR}" ]; then
      ${BINARY} keys add "${ALICE_KEY}" ${KEYRING} > /dev/null 2>&1
      ALICE_ADDR=$(${BINARY} keys show "${ALICE_KEY}" -a ${KEYRING} 2>/dev/null)
      info "Alice created: ${ALICE_ADDR}"
    else
      info "Alice exists:  ${ALICE_ADDR}"
    fi

    # Create Bob
    BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null || true)
    if [ -z "${BOB_ADDR}" ]; then
      ${BINARY} keys add "${BOB_KEY}" ${KEYRING} > /dev/null 2>&1
      BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null)
      info "Bob created:   ${BOB_ADDR}"
    else
      info "Bob exists:    ${BOB_ADDR}"
    fi

    if [ -n "${ALICE_ADDR}" ] && [ -n "${BOB_ADDR}" ]; then
      pass "Both wallets ready"
    else
      fail "Wallet creation" "Could not create keys"
    fi
  fi
  pause
fi

# =============================================================================
# Step 3: Fund wallets — Fund both via the validator (faucet)
# =============================================================================
if should_run 3; then
  step_header 3 "Fund Wallets"
  info "Sending 10 CLAW (10000000 uclaw) to each wallet from the validator..."

  # Resolve Alice/Bob addresses if skipping earlier steps
  if [ -z "${ALICE_ADDR}" ]; then
    ALICE_ADDR=$(${BINARY} keys show "${ALICE_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi
  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx bank send validator ${ALICE_ADDR:-\$ALICE_ADDR} 10000000${DENOM} ${KEYRING} ${TX_COMMON}"
    run_cmd "${BINARY} tx bank send validator ${BOB_ADDR:-\$BOB_ADDR} 10000000${DENOM} ${KEYRING} ${TX_COMMON}"
    pass "Wallets funded (dry-run)"
  else
    if [ -z "${ALICE_ADDR}" ] || [ -z "${BOB_ADDR}" ]; then
      fail "Fund wallets" "Alice or Bob address not available"
    else
      # Fund Alice
      info "Funding Alice (${ALICE_ADDR:0:20}...)..."
      TX=$(${BINARY} tx bank send validator "${ALICE_ADDR}" "10000000${DENOM}" \
        ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
      HASH=$(tx_hash "${TX}")
      wait_tx "${HASH}"

      # Fund Bob
      info "Funding Bob (${BOB_ADDR:0:20}...)..."
      TX=$(${BINARY} tx bank send validator "${BOB_ADDR}" "10000000${DENOM}" \
        ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
      HASH=$(tx_hash "${TX}")
      wait_tx "${HASH}"

      # Verify balances
      ALICE_BAL=$(${BINARY} query bank balances "${ALICE_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[] | select(.denom=="uclaw") | .amount' 2>/dev/null || echo "0")
      BOB_BAL=$(${BINARY} query bank balances "${BOB_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[] | select(.denom=="uclaw") | .amount' 2>/dev/null || echo "0")
      info "Alice balance: ${ALICE_BAL} ${DENOM}"
      info "Bob balance:   ${BOB_BAL} ${DENOM}"

      if [ "${ALICE_BAL:-0}" -gt 0 ] 2>/dev/null && [ "${BOB_BAL:-0}" -gt 0 ] 2>/dev/null; then
        pass "Both wallets funded"
      else
        fail "Fund wallets" "Insufficient balances (Alice=${ALICE_BAL}, Bob=${BOB_BAL})"
      fi
    fi
  fi
  pause
fi

# =============================================================================
# Step 4: Register Agent Bob
# =============================================================================
if should_run 4; then
  step_header 4 "Register Agent Bob"
  info "Registering Bob as an AI agent with name, endpoint, and capabilities..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx agent register-agent \"bob-pubkey-demo\" \"http://localhost:7777\" \"Bob-AI-Agent\" --from ${BOB_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Agent registered (dry-run)"
  else
    # Check if already registered
    AGENT_Q=$(curl -s "${REST}/clawchain/agent/v1/agent/${BOB_ADDR}" 2>/dev/null || echo '{}')
    AGENT_NAME=$(echo "${AGENT_Q}" | jq -r '.name // ""' 2>/dev/null)

    if [ -n "${AGENT_NAME}" ] && [ "${AGENT_NAME}" != "null" ] && [ "${AGENT_NAME}" != "" ]; then
      info "Bob already registered as '${AGENT_NAME}'"
      pass "Agent Bob registered (existing)"
    else
      TX=$(${BINARY} tx agent register-agent \
        "bob-pubkey-demo-$(date +%s)" "http://localhost:7777" "Bob-AI-Agent" \
        --from "${BOB_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
      HASH=$(tx_hash "${TX}")
      CODE=$(tx_code "${TX}")
      if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
        wait_tx "${HASH}"
        if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
          info "TxHash: ${HASH}"
          pass "Agent Bob registered on-chain"
        else
          fail "Register agent Bob" "tx delivery failed"
        fi
      else
        fail "Register agent Bob" "broadcast error"
      fi
    fi
  fi
  pause
fi

# =============================================================================
# Step 5: Agent heartbeat — Bob sends heartbeat to prove liveness
# =============================================================================
if should_run 5; then
  step_header 5 "Agent Heartbeat"
  info "Bob sends a heartbeat to prove agent liveness..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx agent agent-heartbeat \"\$BLOCK_HEIGHT\" \"http://localhost:7777\" '{\"mode\":\"demo\"}' --from ${BOB_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Heartbeat sent (dry-run)"
  else
    # Get current block height for heartbeat
    BLOCK_HEIGHT=$(curl -s "${RPC}/status" 2>/dev/null | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo "1")

    TX=$(${BINARY} tx agent agent-heartbeat \
      "${BLOCK_HEIGHT}" "http://localhost:7777" '{"mode":"demo","gpu":"A100"}' \
      --from "${BOB_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        pass "Heartbeat accepted at block ${BLOCK_HEIGHT}"
      else
        # Heartbeat-too-frequent is OK on re-runs
        RAW_LOG=$(${BINARY} query tx "${HASH}" --node "${RPC}" --output json 2>/dev/null | jq -r '.raw_log // ""' 2>/dev/null || echo "")
        if echo "${RAW_LOG}" | grep -qi "heartbeat\|interval\|frequent"; then
          skip_step "Heartbeat" "too frequent (expected on re-run)"
        else
          fail "Heartbeat" "${RAW_LOG}"
        fi
      fi
    else
      ERRMSG=$(echo "${TX}" | head -2 | tr '\n' ' ')
      if echo "${ERRMSG}" | grep -qi "heartbeat\|interval\|frequent"; then
        skip_step "Heartbeat" "too frequent (expected on re-run)"
      else
        fail "Heartbeat" "${ERRMSG}"
      fi
    fi
  fi
  pause
fi

# =============================================================================
# Step 6: List skill — Bob lists an AI skill on the marketplace
# =============================================================================
if should_run 6; then
  step_header 6 "List Skill on Marketplace"
  info "Bob lists 'text-summarization' skill for 2 CLAW on the marketplace..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx marketplace list-skill \"TextSummarization\" \"AI-powered text summarization with 95% accuracy\" \"2000000\" \"${DENOM}\" --from ${BOB_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Skill listed (dry-run)"
  else
    TX=$(${BINARY} tx marketplace list-skill \
      "TextSummarization" "AI-powered text summarization with 95% accuracy" "2000000" "${DENOM}" \
      --from "${BOB_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        # Query to get the skill ID
        SKILLS_JSON=$(curl -s "${REST}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
        SKILL_ID=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].id' 2>/dev/null || echo "1")
        SKILL_NAME=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].name' 2>/dev/null || echo "TextSummarization")
        info "Skill ID: ${SKILL_ID}, Name: ${SKILL_NAME}"
        pass "Skill '${SKILL_NAME}' listed (ID=${SKILL_ID})"
      else
        fail "List skill" "tx delivery failed"
      fi
    else
      fail "List skill" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 7: Alice purchases skill — auto-creates a task for Bob
# =============================================================================
if should_run 7; then
  step_header 7 "Alice Purchases Skill"
  info "Alice buys Bob's text-summarization skill, which delegates a task to Bob..."

  if [ -z "${SKILL_ID}" ]; then
    # Try to find the latest skill
    SKILLS_JSON=$(curl -s "${REST}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
    SKILL_ID=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].id' 2>/dev/null || echo "1")
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx marketplace purchase-skill \"${SKILL_ID}\" --from ${ALICE_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Skill purchased (dry-run)"
  else
    TX=$(${BINARY} tx marketplace purchase-skill "${SKILL_ID}" \
      --from "${ALICE_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        info "Payment of 2 CLAW transferred to Bob"
        pass "Alice purchased skill #${SKILL_ID}"
      else
        fail "Purchase skill" "tx delivery failed"
      fi
    else
      fail "Purchase skill" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 8: Bob accepts task — Bob accepts the delegated task
# =============================================================================
if should_run 8; then
  step_header 8 "Bob Accepts Task"
  info "Alice delegates a task to Bob, then Bob accepts it..."

  if [ -z "${ALICE_ADDR}" ]; then
    ALICE_ADDR=$(${BINARY} keys show "${ALICE_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi
  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx agent delegate-task \"\$BOB_ADDR\" \"Summarize quarterly report\" \"summarization\" 0 \"2000000\" 500 --from ${ALICE_KEY} ${KEYRING} ${TX_COMMON}"
    run_cmd "${BINARY} tx agent accept-task \"\$TASK_ID\" --from ${BOB_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Task accepted (dry-run)"
  else
    # Delegate task from Alice to Bob
    info "Delegating task from Alice to Bob..."
    TX=$(${BINARY} tx agent delegate-task \
      "${BOB_ADDR}" "Summarize quarterly report" "summarization" 0 "2000000" 500 \
      --from "${ALICE_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      # Extract task ID from events
      TX_EVENTS=$(${BINARY} query tx "${HASH}" --node "${RPC}" --output json 2>/dev/null || echo '{}')
      TASK_ID=$(echo "${TX_EVENTS}" | jq -r '[.events[]? | select(.type=="delegate_task") | .attributes[]? | select(.key=="task_id") | .value] | first // ""' 2>/dev/null || echo "")
      [ -z "${TASK_ID}" ] && TASK_ID="1"
      info "Task delegated: ID=${TASK_ID}"

      # Bob accepts
      info "Bob accepting task #${TASK_ID}..."
      TX=$(${BINARY} tx agent accept-task "${TASK_ID}" \
        --from "${BOB_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
      HASH=$(tx_hash "${TX}")
      if [ "$(tx_code "${TX}")" = "0" ] && [ -n "${HASH}" ]; then
        wait_tx "${HASH}"
        if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
          info "TxHash: ${HASH}"
          pass "Bob accepted task #${TASK_ID}"
        else
          fail "Accept task" "tx delivery failed"
        fi
      else
        fail "Accept task" "broadcast error"
      fi
    else
      fail "Delegate task" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 9: Bob completes task — Bob submits task result
# =============================================================================
if should_run 9; then
  step_header 9 "Bob Completes Task"
  info "Bob submits the task result with completion data..."

  if [ -z "${TASK_ID}" ]; then
    TASK_ID="1"
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx agent complete-task \"${TASK_ID}\" '{\"summary\":\"Report summarized\",\"confidence\":0.97}' --from ${BOB_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Task completed (dry-run)"
  else
    TX=$(${BINARY} tx agent complete-task "${TASK_ID}" \
      '{"summary":"Quarterly report summarized: Revenue up 23%, costs down 8%, net margin improved by 4.2pp","confidence":0.97}' \
      --from "${BOB_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        pass "Bob completed task #${TASK_ID}"
      else
        fail "Complete task" "tx delivery failed"
      fi
    else
      fail "Complete task" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 10: Alice rates Bob — Alice rates Bob's work (5 stars)
# =============================================================================
if should_run 10; then
  step_header 10 "Alice Rates Bob (5 Stars)"
  info "Alice rates Bob's work quality for the completed task..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi
  if [ -z "${SKILL_ID}" ]; then
    SKILL_ID="1"
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx reputation rate-agent \"${BOB_ADDR}\" \"${SKILL_ID}\" 5 \"Excellent summarization quality\" --from ${ALICE_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Rating submitted (dry-run)"
  else
    TX=$(${BINARY} tx reputation rate-agent "${BOB_ADDR}" "${SKILL_ID}" 5 "Excellent summarization quality, very fast turnaround" \
      --from "${ALICE_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        pass "Alice rated Bob 5 stars"
      else
        fail "Rate agent" "tx delivery failed"
      fi
    else
      fail "Rate agent" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 11: Check reputation — Query Bob's updated reputation score
# =============================================================================
if should_run 11; then
  step_header 11 "Check Reputation Score"
  info "Querying Bob's on-chain reputation after receiving a 5-star rating..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "curl -s ${REST}/clawchain/reputation/v1/reputation/${BOB_ADDR} | jq"
    pass "Reputation queried (dry-run)"
  else
    REP=$(curl -s "${REST}/clawchain/reputation/v1/reputation/${BOB_ADDR}" 2>/dev/null || echo '{}')
    FOUND=$(echo "${REP}" | jq -r '.found // false' 2>/dev/null || echo "false")
    AVG_BPS=$(echo "${REP}" | jq -r '.reputation.avg_rating_bps // 0' 2>/dev/null || echo "0")
    TOTAL_RATINGS=$(echo "${REP}" | jq -r '.reputation.total_ratings // .reputation.rating_count // 0' 2>/dev/null || echo "0")

    if [ "${FOUND}" = "true" ]; then
      # Convert basis points to stars (10000 bps = 5 stars)
      if [ "${AVG_BPS}" -gt 0 ] 2>/dev/null; then
        STARS=$(echo "scale=1; ${AVG_BPS} / 2000" | bc 2>/dev/null || echo "${AVG_BPS} bps")
      else
        STARS="N/A"
      fi
      info "Reputation found: true"
      info "Average rating:   ${AVG_BPS} bps (~${STARS} stars)"
      info "Total ratings:    ${TOTAL_RATINGS}"
      pass "Bob's reputation: ${AVG_BPS} bps (${TOTAL_RATINGS} ratings)"
    else
      info "No reputation record yet (may need block finalization)"
      skip_step "Reputation query" "No reputation record found yet"
    fi
  fi
  pause
fi

# =============================================================================
# Step 12: Shield rewards — Bob shields some CLAW into the privacy pool
# =============================================================================
if should_run 12; then
  step_header 12 "Shield Rewards (Privacy Pool)"
  info "Bob shields 1 CLAW (1000000 uclaw) into the ZK privacy pool..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx privacy shield 1000000 \"${DENOM}\" --blinding \"\$(openssl rand -base64 32)\" --from ${BOB_KEY} ${KEYRING} ${TX_SHIELD_COMMON}"
    pass "Tokens shielded (dry-run)"
  else
    BLINDING_B64="$(openssl rand -base64 32 | tr -d '\n')"
    TX=$(${BINARY} tx privacy shield 1000000 "${DENOM}" \
      --blinding "${BLINDING_B64}" \
      --from "${BOB_KEY}" ${KEYRING} ${TX_SHIELD_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        info "1 CLAW shielded into the privacy pool"
        pass "Bob shielded 1 CLAW"
      else
        fail "Shield tokens" "tx delivery failed"
      fi
    else
      fail "Shield tokens" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 13: Check shielded balance — Verify privacy pool state
# =============================================================================
if should_run 13; then
  step_header 13 "Check Privacy Pool State"
  info "Querying the Merkle tree stats to verify the shielded deposit..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "curl -s ${REST}/clawchain/privacy/v1/tree_stats | jq"
    pass "Tree stats queried (dry-run)"
  else
    TREE_STATS=$(curl -s "${REST}/clawchain/privacy/v1/tree_stats" 2>/dev/null || echo '{}')
    LEAF_COUNT=$(echo "${TREE_STATS}" | jq -r '.leaf_count // 0' 2>/dev/null || echo "0")
    MERKLE_ROOT=$(echo "${TREE_STATS}" | jq -r '.current_root // "none"' 2>/dev/null || echo "none")
    TREE_DEPTH=$(echo "${TREE_STATS}" | jq -r '.depth // "unknown"' 2>/dev/null || echo "unknown")

    info "Merkle tree leaves: ${LEAF_COUNT}"
    info "Current root:       ${MERKLE_ROOT:0:32}..."
    info "Tree depth:         ${TREE_DEPTH}"

    if [ "${LEAF_COUNT}" -gt 0 ] 2>/dev/null; then
      pass "Privacy pool active (${LEAF_COUNT} commitments)"
    else
      info "Tree may be empty if shield TX is still pending"
      skip_step "Privacy pool check" "No commitments found yet"
    fi
  fi
  pause
fi

# =============================================================================
# Step 14: Create escrow — Alice creates a multi-milestone escrow with Bob
# =============================================================================
if should_run 14; then
  step_header 14 "Create Multi-Milestone Escrow"
  info "Alice creates an escrow contract with Bob for a 2-milestone project..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(${BINARY} keys show "${BOB_KEY}" -a ${KEYRING} 2>/dev/null || true)
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx marketplace create-escrow --skill-id \"${SKILL_ID:-1}\" --milestones 2 --description \"Build AI integration pipeline\" --deadline-blocks 1000 --from ${ALICE_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Escrow created (dry-run)"
  else
    TX=$(${BINARY} tx marketplace create-escrow \
      --skill-id "${SKILL_ID:-1}" \
      --milestones 2 \
      --description "Build AI integration pipeline" \
      --deadline-blocks 1000 \
      --from "${ALICE_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        # Query escrow ID
        if [ -n "${ALICE_ADDR}" ]; then
          ESCROW_ID=$(curl -s "${REST}/clawchain/marketplace/v1/escrows/${ALICE_ADDR}" 2>/dev/null | jq -r '.escrows[-1].id' 2>/dev/null || echo "1")
        else
          ESCROW_ID="1"
        fi
        info "Escrow ID: ${ESCROW_ID}"
        pass "Escrow #${ESCROW_ID} created (2 milestones)"
      else
        fail "Create escrow" "tx delivery failed"
      fi
    else
      fail "Create escrow" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 15: Complete milestone — Bob completes first milestone, funds released
# =============================================================================
if should_run 15; then
  step_header 15 "Complete Escrow Milestone"
  info "Bob completes the first milestone, triggering partial fund release..."

  if [ -z "${ESCROW_ID}" ]; then
    ESCROW_ID="1"
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx marketplace complete-escrow --escrow-id \"${ESCROW_ID}\" --from ${ALICE_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Milestone completed (dry-run)"
  else
    TX=$(${BINARY} tx marketplace complete-escrow \
      --escrow-id "${ESCROW_ID}" \
      --from "${ALICE_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "TxHash: ${HASH}"
        # Query escrow status
        ESCROW_STATUS=$(curl -s "${REST}/clawchain/marketplace/v1/escrow/${ESCROW_ID}" 2>/dev/null | jq -r '.escrow.status // "unknown"' 2>/dev/null || echo "unknown")
        info "Escrow status: ${ESCROW_STATUS}"
        pass "Escrow #${ESCROW_ID} milestone completed"
      else
        fail "Complete escrow" "tx delivery failed"
      fi
    else
      fail "Complete escrow" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Step 16: Governance proposal — Bob submits proposal, Alice votes
# =============================================================================
if should_run 16; then
  step_header 16 "Governance Proposal & Vote"
  info "Bob submits a parameter change proposal, Alice votes YES..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "${BINARY} tx governance submit-proposal \"Increase agent reward rate\" \"Proposal to increase the base reward rate for agents from 5% to 7% to incentivize participation\" \"agent\" \"base_reward_rate\" \"0.07\" \"1000000\" --from ${BOB_KEY} ${KEYRING} ${TX_COMMON}"
    run_cmd "${BINARY} tx governance vote \"\$PROPOSAL_ID\" 1 --from ${ALICE_KEY} ${KEYRING} ${TX_COMMON}"
    pass "Proposal submitted and voted (dry-run)"
  else
    # Submit proposal
    info "Bob submitting governance proposal..."
    TX=$(${BINARY} tx governance submit-proposal \
      "Increase agent reward rate" \
      "Proposal to increase the base reward rate for agents from 5% to 7% to incentivize network participation and improve agent retention." \
      "agent" "base_reward_rate" "0.07" "1000000" \
      --from "${BOB_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
    HASH=$(tx_hash "${TX}")
    CODE=$(tx_code "${TX}")
    if [ "${CODE}" = "0" ] && [ -n "${HASH}" ]; then
      wait_tx "${HASH}"
      if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
        info "Proposal TxHash: ${HASH}"

        # Query latest proposal ID
        PROPOSALS=$(curl -s "${REST}/clawchain/governance/v1/proposals" 2>/dev/null || echo '{}')
        PROPOSAL_ID=$(echo "${PROPOSALS}" | jq -r '.proposals[-1].id // .proposals[-1].proposal_id // "1"' 2>/dev/null || echo "1")
        PROPOSAL_TITLE=$(echo "${PROPOSALS}" | jq -r '.proposals[-1].title // "unknown"' 2>/dev/null || echo "unknown")
        info "Proposal ID: ${PROPOSAL_ID}, Title: ${PROPOSAL_TITLE}"

        # Alice votes YES
        info "Alice voting YES on proposal #${PROPOSAL_ID}..."
        TX=$(${BINARY} tx governance vote "${PROPOSAL_ID}" 1 \
          --from "${ALICE_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
        HASH=$(tx_hash "${TX}")
        if [ "$(tx_code "${TX}")" = "0" ] && [ -n "${HASH}" ]; then
          wait_tx "${HASH}"
          if [ "$(tx_deliver_code "${HASH}")" = "0" ]; then
            info "Vote TxHash: ${HASH}"
            pass "Proposal #${PROPOSAL_ID} submitted, Alice voted YES"
          else
            fail "Vote on proposal" "tx delivery failed"
          fi
        else
          fail "Vote on proposal" "broadcast error"
        fi
      else
        fail "Submit proposal" "tx delivery failed"
      fi
    else
      fail "Submit proposal" "broadcast error"
    fi
  fi
  pause
fi

# =============================================================================
# Summary
# =============================================================================
banner "Economy Loop Demo Complete"

echo ""
echo -e "  ${BOLD}Results:${NC}"
echo -e "  ${CYAN}--------------------------------------------------${NC}"
for r in "${RESULTS[@]}"; do
  echo -e "    ${r}"
done
echo -e "  ${CYAN}--------------------------------------------------${NC}"

TOTAL=$((PASS_N + FAIL_N + SKIP_N))
echo ""
echo -e "  ${GREEN}Passed: ${PASS_N}${NC}  |  ${RED}Failed: ${FAIL_N}${NC}  |  ${YELLOW}Skipped: ${SKIP_N}${NC}  |  Total: ${TOTAL}/16"
echo ""

echo -e "  ${BOLD}16-Step Economy Loop:${NC}"
echo "    1.  Chain health check"
echo "    2.  Wallet creation (Alice + Bob)"
echo "    3.  Wallet funding (10 CLAW each)"
echo "    4.  Agent registration (Bob)"
echo "    5.  Agent heartbeat (liveness proof)"
echo "    6.  Skill listing (marketplace)"
echo "    7.  Skill purchase (Alice -> Bob)"
echo "    8.  Task delegation + acceptance"
echo "    9.  Task completion"
echo "    10. Reputation rating (5 stars)"
echo "    11. Reputation query"
echo "    12. Privacy shield (ZK pool)"
echo "    13. Privacy pool verification"
echo "    14. Escrow creation (multi-milestone)"
echo "    15. Escrow milestone completion"
echo "    16. Governance proposal + vote"
echo ""

echo -e "  ${BOLD}Modules exercised:${NC}"
echo "    - bank (transfers + funding)"
echo "    - agent (register, heartbeat, task lifecycle)"
echo "    - marketplace (skill list, purchase, escrow)"
echo "    - reputation (rate, query)"
echo "    - privacy (shield, tree stats)"
echo "    - governance (submit proposal, vote)"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "  ${YELLOW}This was a dry run. No transactions were executed.${NC}"
  echo -e "  ${YELLOW}Re-run without --dry-run to execute against a live chain.${NC}"
fi

if [ "${FAIL_N}" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}Some steps failed. Check output above for details.${NC}"
  exit 1
else
  echo -e "  ${GREEN}${BOLD}Economy loop completed successfully!${NC}"
  exit 0
fi
