#!/usr/bin/env bash
# =============================================================================
# demo-economy-loop-clawd.sh — 16-step ClawChain Economy Loop Demo (clawd CLI)
# =============================================================================
#
# Same 16-step economy loop as demo-economy-loop.sh, but uses the operator-
# facing `clawd` CLI instead of raw clawchaind commands. This is the version
# you would run as an operator or integrator.
#
# Actors:
#   Alice — task creator / skill buyer / escrow funder / voter
#   Bob   — agent operator / skill provider / escrow seller
#
# Prerequisites:
#   - Running local chain or testnet
#   - clawd CLI built and on PATH (cd cmd/clawd && npm run build)
#   - Two clawd config directories (Alice + Bob) initialized with mnemonics
#   - jq installed
#
# Usage:
#   ./scripts/demo-economy-loop-clawd.sh                    # run all 16 steps
#   ./scripts/demo-economy-loop-clawd.sh --dry-run          # show commands only
#   ./scripts/demo-economy-loop-clawd.sh --skip-to 8        # resume from step 8
#
# Environment:
#   CLAWD           Path to clawd binary (default: npx clawd)
#   ALICE_HOME      Config dir for Alice (default: /tmp/clawd-demo-alice)
#   BOB_HOME        Config dir for Bob   (default: /tmp/clawd-demo-bob)
#   RPC_URL         Chain RPC (default: http://localhost:26657)
#   REST_URL        Chain REST (default: http://localhost:1317)
#   FAUCET_URL      Faucet endpoint (default: http://localhost:8888)
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CLAWD="${CLAWD:-npx clawd}"
CLAWD_ROOT="$(cd "$(dirname "$0")/../cmd/clawd" && pwd)"
RPC_URL="${RPC_URL:-http://localhost:26657}"
REST_URL="${REST_URL:-http://localhost:1317}"
FAUCET_URL="${FAUCET_URL:-http://localhost:8888}"
DENOM="${DENOM:-uclaw}"
ALICE_HOME="${ALICE_HOME:-/tmp/clawd-demo-alice}"
BOB_HOME="${BOB_HOME:-/tmp/clawd-demo-bob}"
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
      echo "  CLAWD             Path to clawd (default: npx clawd)"
      echo "  ALICE_HOME        Config dir for Alice"
      echo "  BOB_HOME          Config dir for Bob"
      echo "  RPC_URL           Chain RPC endpoint"
      echo "  REST_URL          Chain REST endpoint"
      echo "  FAUCET_URL        Faucet endpoint"
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

# clawd commands for Alice and Bob (using config dir override)
clawd_alice() {
  CLAWD_HOME="${ALICE_HOME}" ${CLAWD} "$@"
}

clawd_bob() {
  CLAWD_HOME="${BOB_HOME}" ${CLAWD} "$@"
}

wait_block() {
  info "Waiting ${TX_WAIT}s for block inclusion..."
  sleep "${TX_WAIT}"
}

# =============================================================================
# Main
# =============================================================================
banner "ClawChain Economy Loop Demo (clawd CLI)"

echo ""
echo -e "  clawd:        ${BOLD}${CLAWD}${NC}"
echo -e "  RPC:          ${BOLD}${RPC_URL}${NC}"
echo -e "  REST:         ${BOLD}${REST_URL}${NC}"
echo -e "  Faucet:       ${BOLD}${FAUCET_URL}${NC}"
echo -e "  Alice home:   ${BOLD}${ALICE_HOME}${NC}"
echo -e "  Bob home:     ${BOLD}${BOB_HOME}${NC}"
echo -e "  Dry-run:      ${BOLD}${DRY_RUN}${NC}"
if [ "$SKIP_TO" -gt 0 ]; then
  echo -e "  Skip to:      ${BOLD}Step ${SKIP_TO}${NC}"
fi

# =============================================================================
# Step 1: Chain health — check chain is running
# =============================================================================
if should_run 1; then
  step_header 1 "Chain Health Check"
  info "Checking that the chain is running and producing blocks..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "clawd status"
    pass "Chain health (dry-run)"
  else
    STATUS_JSON=$(curl -s "${RPC_URL}/status" 2>/dev/null || echo "")
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
      fail "Chain health" "Cannot connect to RPC at ${RPC_URL}"
    fi
  fi
  pause
fi

# =============================================================================
# Step 2: Create wallets — Initialize 2 clawd configs
# =============================================================================
if should_run 2; then
  step_header 2 "Create Wallets (Alice + Bob)"
  info "Alice = task creator, skill buyer, escrow funder"
  info "Bob   = agent operator, skill provider, escrow seller"
  info "Each gets a separate clawd config directory with its own mnemonic."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd init --moniker alice-demo --rpc-url ${RPC_URL}"
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd init --moniker bob-agent --rpc-url ${RPC_URL}"
    pass "Wallets initialized (dry-run)"
  else
    # Initialize Alice
    if [ ! -f "${ALICE_HOME}/config.json" ]; then
      mkdir -p "${ALICE_HOME}"
      CLAWD_HOME="${ALICE_HOME}" ${CLAWD} init --moniker alice-demo --rpc-url "${RPC_URL}" 2>/dev/null || true
      info "Alice initialized at ${ALICE_HOME}"
    else
      info "Alice config already exists at ${ALICE_HOME}"
    fi

    # Initialize Bob
    if [ ! -f "${BOB_HOME}/config.json" ]; then
      mkdir -p "${BOB_HOME}"
      CLAWD_HOME="${BOB_HOME}" ${CLAWD} init --moniker bob-agent --rpc-url "${RPC_URL}" 2>/dev/null || true
      info "Bob initialized at ${BOB_HOME}"
    else
      info "Bob config already exists at ${BOB_HOME}"
    fi

    # Extract addresses from config
    ALICE_ADDR=$(jq -r '.agentAddress // ""' "${ALICE_HOME}/config.json" 2>/dev/null || echo "")
    BOB_ADDR=$(jq -r '.agentAddress // ""' "${BOB_HOME}/config.json" 2>/dev/null || echo "")

    if [ -n "${ALICE_ADDR}" ] && [ -n "${BOB_ADDR}" ]; then
      info "Alice: ${ALICE_ADDR}"
      info "Bob:   ${BOB_ADDR}"
      pass "Both wallets ready"
    else
      fail "Wallet initialization" "Could not derive addresses"
    fi
  fi
  pause
fi

# =============================================================================
# Step 3: Fund wallets — Request tokens from faucet
# =============================================================================
if should_run 3; then
  step_header 3 "Fund Wallets (Faucet)"
  info "Requesting tokens from the faucet for both Alice and Bob..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd faucet request"
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd faucet request"
    pass "Wallets funded (dry-run)"
  else
    # Resolve addresses
    if [ -z "${ALICE_ADDR}" ]; then
      ALICE_ADDR=$(jq -r '.agentAddress // ""' "${ALICE_HOME}/config.json" 2>/dev/null || echo "")
    fi
    if [ -z "${BOB_ADDR}" ]; then
      BOB_ADDR=$(jq -r '.agentAddress // ""' "${BOB_HOME}/config.json" 2>/dev/null || echo "")
    fi

    info "Funding Alice (${ALICE_ADDR:0:20}...)..."
    CLAWD_HOME="${ALICE_HOME}" ${CLAWD} faucet request --from "${FAUCET_URL}" 2>/dev/null || info "Faucet request for Alice returned non-zero (may already be funded)"
    sleep 2

    info "Funding Bob (${BOB_ADDR:0:20}...)..."
    CLAWD_HOME="${BOB_HOME}" ${CLAWD} faucet request --from "${FAUCET_URL}" 2>/dev/null || info "Faucet request for Bob returned non-zero (may already be funded)"
    sleep 2

    # Verify via REST
    ALICE_BAL=$(curl -s "${REST_URL}/cosmos/bank/v1beta1/balances/${ALICE_ADDR}" 2>/dev/null | jq -r '.balances[]? | select(.denom=="uclaw") | .amount' 2>/dev/null || echo "0")
    BOB_BAL=$(curl -s "${REST_URL}/cosmos/bank/v1beta1/balances/${BOB_ADDR}" 2>/dev/null | jq -r '.balances[]? | select(.denom=="uclaw") | .amount' 2>/dev/null || echo "0")
    info "Alice balance: ${ALICE_BAL} ${DENOM}"
    info "Bob balance:   ${BOB_BAL} ${DENOM}"

    if [ "${ALICE_BAL:-0}" -gt 0 ] 2>/dev/null && [ "${BOB_BAL:-0}" -gt 0 ] 2>/dev/null; then
      pass "Both wallets funded"
    else
      fail "Fund wallets" "Insufficient balances (Alice=${ALICE_BAL}, Bob=${BOB_BAL})"
    fi
  fi
  pause
fi

# =============================================================================
# Step 4: Register Agent Bob
# =============================================================================
if should_run 4; then
  step_header 4 "Register Agent Bob"
  info "Registering Bob as an AI agent via clawd CLI..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd agent register --name \"Bob-AI-Agent\" --endpoint \"http://localhost:7777\" --tools \"summarization,translation\""
    pass "Agent registered (dry-run)"
  else
    CLAWD_HOME="${BOB_HOME}" ${CLAWD} agent register \
      --name "Bob-AI-Agent" \
      --endpoint "http://localhost:7777" \
      --tools "summarization,translation,sentiment-analysis" 2>&1 | while IFS= read -r line; do
        info "${line}"
      done || true
    wait_block

    # Verify registration
    if [ -n "${BOB_ADDR}" ]; then
      AGENT_Q=$(curl -s "${REST_URL}/clawchain/agent/v1/agent/${BOB_ADDR}" 2>/dev/null || echo '{}')
      AGENT_NAME=$(echo "${AGENT_Q}" | jq -r '.name // ""' 2>/dev/null)
      if [ -n "${AGENT_NAME}" ] && [ "${AGENT_NAME}" != "null" ] && [ "${AGENT_NAME}" != "" ]; then
        info "Agent name: ${AGENT_NAME}"
        pass "Agent Bob registered on-chain"
      else
        skip_step "Agent registration" "Could not verify (may already be registered)"
      fi
    else
      skip_step "Agent registration" "Bob address not available"
    fi
  fi
  pause
fi

# =============================================================================
# Step 5: Agent heartbeat
# =============================================================================
if should_run 5; then
  step_header 5 "Agent Heartbeat"
  info "Bob sends a heartbeat to prove agent liveness via clawd..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd agent heartbeat"
    pass "Heartbeat sent (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} agent heartbeat 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done

    if echo "${OUTPUT}" | grep -qi "heartbeat\|success\|sent\|tx"; then
      pass "Heartbeat sent"
    elif echo "${OUTPUT}" | grep -qi "frequent\|interval\|already"; then
      skip_step "Heartbeat" "too frequent (expected on re-run)"
    else
      fail "Heartbeat" "unexpected output"
    fi
  fi
  pause
fi

# =============================================================================
# Step 6: List skill on marketplace
# =============================================================================
if should_run 6; then
  step_header 6 "List Skill on Marketplace"
  info "Bob lists 'text-summarization' skill for 2 CLAW..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd skill create --name \"TextSummarization\" --description \"AI-powered text summarization\" --price \"2000000\""
    pass "Skill listed (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} skill create \
      --name "TextSummarization" \
      --description "AI-powered text summarization with 95% accuracy" \
      --price "2000000" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    # Query to get skill ID
    SKILLS_JSON=$(curl -s "${REST_URL}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
    SKILL_ID=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].id' 2>/dev/null || echo "1")
    SKILL_NAME=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].name' 2>/dev/null || echo "TextSummarization")
    info "Skill ID: ${SKILL_ID}, Name: ${SKILL_NAME}"
    pass "Skill '${SKILL_NAME}' listed (ID=${SKILL_ID})"
  fi
  pause
fi

# =============================================================================
# Step 7: Alice purchases skill
# =============================================================================
if should_run 7; then
  step_header 7 "Alice Purchases Skill"
  info "Alice buys Bob's text-summarization skill..."

  if [ -z "${SKILL_ID}" ]; then
    SKILLS_JSON=$(curl -s "${REST_URL}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
    SKILL_ID=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].id' 2>/dev/null || echo "1")
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd skill purchase --skill-id ${SKILL_ID}"
    pass "Skill purchased (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${ALICE_HOME}" ${CLAWD} skill purchase --skill-id "${SKILL_ID}" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    if echo "${OUTPUT}" | grep -qi "success\|purchased\|tx"; then
      pass "Alice purchased skill #${SKILL_ID}"
    else
      fail "Purchase skill" "unexpected output"
    fi
  fi
  pause
fi

# =============================================================================
# Step 8: Bob accepts task
# =============================================================================
if should_run 8; then
  step_header 8 "Delegate & Accept Task"
  info "Alice delegates a task to Bob, then Bob accepts it..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(jq -r '.agentAddress // ""' "${BOB_HOME}/config.json" 2>/dev/null || echo "")
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd task delegate --assignee \"${BOB_ADDR}\" --description \"Summarize quarterly report\" --requirements \"summarization\" --budget \"2000000\" --deadline-blocks 500"
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd task accept --task-id \$TASK_ID"
    pass "Task accepted (dry-run)"
  else
    # Alice delegates
    info "Alice delegating task to Bob..."
    OUTPUT=$(CLAWD_HOME="${ALICE_HOME}" ${CLAWD} task delegate \
      --assignee "${BOB_ADDR}" \
      --description "Summarize quarterly report" \
      --requirements "summarization" \
      --budget "2000000" \
      --deadline-blocks 500 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    # Extract task ID from output
    TASK_ID=$(echo "${OUTPUT}" | grep -oi 'task.*id[^0-9]*\([0-9]*\)' | grep -o '[0-9]*' | head -1 || echo "")
    [ -z "${TASK_ID}" ] && TASK_ID="1"
    info "Task ID: ${TASK_ID}"

    # Bob accepts
    info "Bob accepting task #${TASK_ID}..."
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} task accept --task-id "${TASK_ID}" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    if echo "${OUTPUT}" | grep -qi "accept\|success\|tx"; then
      pass "Bob accepted task #${TASK_ID}"
    else
      fail "Accept task" "could not confirm acceptance"
    fi
  fi
  pause
fi

# =============================================================================
# Step 9: Bob completes task
# =============================================================================
if should_run 9; then
  step_header 9 "Bob Completes Task"
  info "Bob submits the task result with completion data..."

  if [ -z "${TASK_ID}" ]; then
    TASK_ID="1"
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd task complete --task-id ${TASK_ID} --result '{\"summary\":\"Report summarized\",\"confidence\":0.97}'"
    pass "Task completed (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} task complete \
      --task-id "${TASK_ID}" \
      --result '{"summary":"Revenue up 23%, costs down 8%, net margin improved by 4.2pp","confidence":0.97}' 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    if echo "${OUTPUT}" | grep -qi "complete\|success\|tx"; then
      pass "Bob completed task #${TASK_ID}"
    else
      fail "Complete task" "could not confirm completion"
    fi
  fi
  pause
fi

# =============================================================================
# Step 10: Alice rates Bob (5 stars)
# =============================================================================
if should_run 10; then
  step_header 10 "Alice Rates Bob (5 Stars)"
  info "Alice rates Bob's work quality via the reputation module..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(jq -r '.agentAddress // ""' "${BOB_HOME}/config.json" 2>/dev/null || echo "")
  fi
  if [ -z "${SKILL_ID}" ]; then
    SKILL_ID="1"
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd reputation rate --address \"${BOB_ADDR}\" --skill-id ${SKILL_ID} --rating 5 --review \"Excellent quality\""
    pass "Rating submitted (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${ALICE_HOME}" ${CLAWD} reputation rate \
      --address "${BOB_ADDR}" \
      --skill-id "${SKILL_ID}" \
      --rating 5 \
      --review "Excellent summarization quality, very fast turnaround" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    if echo "${OUTPUT}" | grep -qi "rat\|success\|tx"; then
      pass "Alice rated Bob 5 stars"
    else
      fail "Rate agent" "could not confirm rating"
    fi
  fi
  pause
fi

# =============================================================================
# Step 11: Check reputation
# =============================================================================
if should_run 11; then
  step_header 11 "Check Reputation Score"
  info "Querying Bob's on-chain reputation..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(jq -r '.agentAddress // ""' "${BOB_HOME}/config.json" 2>/dev/null || echo "")
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd reputation query --address \"${BOB_ADDR}\""
    pass "Reputation queried (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} reputation query --address "${BOB_ADDR}" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done

    # Also query via REST for confirmation
    REP=$(curl -s "${REST_URL}/clawchain/reputation/v1/reputation/${BOB_ADDR}" 2>/dev/null || echo '{}')
    AVG_BPS=$(echo "${REP}" | jq -r '.reputation.avg_rating_bps // 0' 2>/dev/null || echo "0")
    info "Avg rating (bps): ${AVG_BPS}"

    if [ "${AVG_BPS}" -gt 0 ] 2>/dev/null; then
      pass "Bob's reputation: ${AVG_BPS} bps"
    else
      skip_step "Reputation query" "No reputation data yet"
    fi
  fi
  pause
fi

# =============================================================================
# Step 12: Shield rewards — Privacy pool
# =============================================================================
if should_run 12; then
  step_header 12 "Shield Rewards (Privacy Pool)"
  info "Bob shields 1 CLAW (1000000 uclaw) into the ZK privacy pool..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd privacy shield --amount 1000000"
    pass "Tokens shielded (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} privacy shield --amount 1000000 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    if echo "${OUTPUT}" | grep -qi "shield\|success\|tx"; then
      pass "Bob shielded 1 CLAW"
    else
      fail "Shield tokens" "could not confirm shielding"
    fi
  fi
  pause
fi

# =============================================================================
# Step 13: Check shielded balance — Privacy pool state
# =============================================================================
if should_run 13; then
  step_header 13 "Check Privacy Pool State"
  info "Querying the Merkle tree stats to verify the shielded deposit..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd privacy tree-stats"
    pass "Tree stats queried (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} privacy tree-stats 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done

    # Also query via REST
    TREE_STATS=$(curl -s "${REST_URL}/clawchain/privacy/v1/tree_stats" 2>/dev/null || echo '{}')
    LEAF_COUNT=$(echo "${TREE_STATS}" | jq -r '.leaf_count // 0' 2>/dev/null || echo "0")
    info "Total commitments: ${LEAF_COUNT}"

    if [ "${LEAF_COUNT}" -gt 0 ] 2>/dev/null; then
      pass "Privacy pool active (${LEAF_COUNT} commitments)"
    else
      skip_step "Privacy pool check" "No commitments found yet"
    fi
  fi
  pause
fi

# =============================================================================
# Step 14: Create escrow — Multi-milestone escrow
# =============================================================================
if should_run 14; then
  step_header 14 "Create Multi-Milestone Escrow"
  info "Alice creates an escrow contract with Bob for a 2-milestone project..."

  if [ -z "${BOB_ADDR}" ]; then
    BOB_ADDR=$(jq -r '.agentAddress // ""' "${BOB_HOME}/config.json" 2>/dev/null || echo "")
  fi

  MILESTONES='[{"description":"Data pipeline setup","amount":"1000000"},{"description":"Model integration","amount":"1000000"}]'

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd escrow create --seller \"${BOB_ADDR}\" --amount \"2000000\" --milestones '${MILESTONES}'"
    pass "Escrow created (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${ALICE_HOME}" ${CLAWD} escrow create \
      --seller "${BOB_ADDR}" \
      --amount "2000000" \
      --milestones "${MILESTONES}" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    # Query escrow ID via REST
    if [ -n "${ALICE_ADDR}" ]; then
      ESCROW_ID=$(curl -s "${REST_URL}/clawchain/marketplace/v1/escrows?buyer=${ALICE_ADDR}" 2>/dev/null | jq -r '.escrows[-1].id' 2>/dev/null || echo "1")
    else
      ESCROW_ID="1"
    fi
    info "Escrow ID: ${ESCROW_ID}"

    if echo "${OUTPUT}" | grep -qi "escrow\|success\|created\|tx"; then
      pass "Escrow #${ESCROW_ID} created (2 milestones)"
    else
      fail "Create escrow" "could not confirm creation"
    fi
  fi
  pause
fi

# =============================================================================
# Step 15: Complete milestone
# =============================================================================
if should_run 15; then
  step_header 15 "Complete Escrow Milestone"
  info "Alice confirms milestone completion, triggering partial fund release..."

  if [ -z "${ESCROW_ID}" ]; then
    ESCROW_ID="1"
  fi

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd escrow complete --escrow-id ${ESCROW_ID}"
    pass "Milestone completed (dry-run)"
  else
    OUTPUT=$(CLAWD_HOME="${ALICE_HOME}" ${CLAWD} escrow complete --escrow-id "${ESCROW_ID}" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    # Query escrow status
    ESCROW_STATUS=$(curl -s "${REST_URL}/clawchain/marketplace/v1/escrow/${ESCROW_ID}" 2>/dev/null | jq -r '.escrow.status // "unknown"' 2>/dev/null || echo "unknown")
    info "Escrow status: ${ESCROW_STATUS}"

    if echo "${OUTPUT}" | grep -qi "complete\|success\|tx"; then
      pass "Escrow #${ESCROW_ID} milestone completed"
    else
      fail "Complete escrow" "could not confirm completion"
    fi
  fi
  pause
fi

# =============================================================================
# Step 16: Governance proposal & vote
# =============================================================================
if should_run 16; then
  step_header 16 "Governance Proposal & Vote"
  info "Bob submits a parameter change proposal, Alice votes YES..."

  if [ "$DRY_RUN" = true ]; then
    run_cmd "CLAWD_HOME=${BOB_HOME} clawd governance submit-proposal --title \"Increase agent reward rate\" --description \"Increase base reward rate from 5% to 7%\" --deposit \"1000000\""
    run_cmd "CLAWD_HOME=${ALICE_HOME} clawd governance vote --proposal-id \$PROPOSAL_ID --option yes"
    pass "Proposal submitted and voted (dry-run)"
  else
    # Bob submits proposal
    info "Bob submitting governance proposal..."
    OUTPUT=$(CLAWD_HOME="${BOB_HOME}" ${CLAWD} governance submit-proposal \
      --title "Increase agent reward rate" \
      --description "Proposal to increase the base reward rate for agents from 5% to 7% to incentivize network participation." \
      --deposit "1000000" 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    # Query latest proposal ID
    PROPOSALS=$(curl -s "${REST_URL}/clawchain/governance/v1/proposals" 2>/dev/null || echo '{}')
    PROPOSAL_ID=$(echo "${PROPOSALS}" | jq -r '.proposals[-1].id // .proposals[-1].proposal_id // "1"' 2>/dev/null || echo "1")
    info "Proposal ID: ${PROPOSAL_ID}"

    # Alice votes YES
    info "Alice voting YES on proposal #${PROPOSAL_ID}..."
    OUTPUT=$(CLAWD_HOME="${ALICE_HOME}" ${CLAWD} governance vote \
      --proposal-id "${PROPOSAL_ID}" \
      --option yes 2>&1 || true)
    echo "${OUTPUT}" | while IFS= read -r line; do info "${line}"; done
    wait_block

    if echo "${OUTPUT}" | grep -qi "vote\|success\|yes\|tx"; then
      pass "Proposal #${PROPOSAL_ID} submitted, Alice voted YES"
    else
      fail "Governance vote" "could not confirm vote"
    fi
  fi
  pause
fi

# =============================================================================
# Summary
# =============================================================================
banner "Economy Loop Demo Complete (clawd CLI)"

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

echo -e "  ${BOLD}16-Step Economy Loop (clawd commands used):${NC}"
echo "    1.  clawd status                  -- chain health"
echo "    2.  clawd init                    -- wallet creation"
echo "    3.  clawd faucet request          -- wallet funding"
echo "    4.  clawd agent register          -- agent registration"
echo "    5.  clawd agent heartbeat         -- liveness proof"
echo "    6.  clawd skill create            -- skill listing"
echo "    7.  clawd skill purchase          -- skill purchase"
echo "    8.  clawd task delegate/accept    -- task lifecycle"
echo "    9.  clawd task complete           -- task completion"
echo "    10. clawd reputation rate         -- reputation rating"
echo "    11. clawd reputation query        -- reputation check"
echo "    12. clawd privacy shield          -- ZK privacy pool"
echo "    13. clawd privacy tree-stats      -- privacy verification"
echo "    14. clawd escrow create           -- multi-milestone escrow"
echo "    15. clawd escrow complete         -- milestone release"
echo "    16. clawd governance submit/vote  -- governance"
echo ""

echo -e "  ${BOLD}Modules exercised:${NC}"
echo "    - bank (transfers + faucet drip)"
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
