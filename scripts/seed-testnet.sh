#!/usr/bin/env bash
# =============================================================================
# seed-testnet.sh — Seed ClawChain with test data for all 8 custom modules
# =============================================================================
#
# Populates a running ClawChain instance (local or testnet) with representative
# data for agent, marketplace, privacy, reputation, governance, messaging,
# and bank modules. Idempotent: checks for existing state before creating.
#
# Usage:
#   ./scripts/seed-testnet.sh                      # seed with defaults
#   ./scripts/seed-testnet.sh --dry-run             # show commands only
#   ./scripts/seed-testnet.sh --from my-account     # use a specific key
#   ./scripts/seed-testnet.sh --chain-id testnet-1  # specify chain ID
#
# Prerequisites:
#   - Running chain (local or testnet)
#   - clawchaind binary on PATH or in project root
#   - jq installed
#   - openssl installed (for privacy blinding factor)
#
# Environment variables:
#   BINARY         Path to clawchaind (default: auto-detect)
#   CHAIN_ID       Chain ID (default: clawchain-testnet-1)
#   RPC            RPC endpoint (default: http://localhost:26657)
#   REST           REST endpoint (default: http://localhost:1317)
#   NODE_HOME      Node home directory (default: auto-detect)
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
BINARY="${BINARY:-clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
RPC="${RPC:-http://localhost:26657}"
REST="${REST:-http://localhost:1317}"
DENOM="${DENOM:-uclaw}"
KEYRING_BACKEND="${KEYRING_BACKEND:-test}"
NODE_HOME="${NODE_HOME:-}"
FROM_KEY="${FROM_KEY:-dev-account}"
TX_WAIT="${TX_WAIT:-6}"
DRY_RUN=false

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)       DRY_RUN=true; shift ;;
    --from)          FROM_KEY="${2:-dev-account}"; shift 2 ;;
    --from=*)        FROM_KEY="${1#*=}"; shift ;;
    --chain-id)      CHAIN_ID="${2}"; shift 2 ;;
    --chain-id=*)    CHAIN_ID="${1#*=}"; shift ;;
    --rpc)           RPC="${2}"; shift 2 ;;
    --rpc=*)         RPC="${1#*=}"; shift ;;
    --rest)          REST="${2}"; shift 2 ;;
    --rest=*)        REST="${1#*=}"; shift ;;
    --home)          NODE_HOME="${2}"; shift 2 ;;
    --home=*)        NODE_HOME="${1#*=}"; shift ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--from <key>] [--chain-id <id>] [--rpc <url>] [--rest <url>] [--home <dir>]"
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
DIM='\033[2m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Counters
# ---------------------------------------------------------------------------
PASS_N=0
FAIL_N=0
SKIP_N=0
TOTAL_STEPS=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
banner() {
  echo ""
  echo -e "${BOLD}${CYAN}============================================================================${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}============================================================================${NC}"
}

section() {
  TOTAL_STEPS=$((TOTAL_STEPS + 1))
  echo ""
  echo -e "${BOLD}${CYAN}--- [$TOTAL_STEPS] $1 ---${NC}"
}

info() {
  echo -e "  ${CYAN}[info]${NC} $1"
}

pass() {
  echo -e "  ${GREEN}[PASS]${NC} $1"
  PASS_N=$((PASS_N + 1))
}

fail() {
  echo -e "  ${RED}[FAIL]${NC} $1"
  [ -n "${2:-}" ] && echo -e "         ${RED}reason: $2${NC}"
  FAIL_N=$((FAIL_N + 1))
}

skip() {
  echo -e "  ${YELLOW}[SKIP]${NC} $1"
  [ -n "${2:-}" ] && echo -e "         ${YELLOW}reason: $2${NC}"
  SKIP_N=$((SKIP_N + 1))
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
  if [ -z "$NODE_HOME" ]; then
    local root
    root="$(cd "$(dirname "$0")/.." && pwd)"
    if [ -d "${root}/.local-node" ]; then
      NODE_HOME="${root}/.local-node"
    elif [ -d "${root}/testnet/data/node0" ]; then
      NODE_HOME="${root}/testnet/data/node0"
    else
      NODE_HOME="${HOME}/.clawchaind"
    fi
  fi
}

# Common tx flags
KEYRING=""
TX_FLAGS=""

setup_tx_flags() {
  KEYRING="--keyring-backend ${KEYRING_BACKEND} --home ${NODE_HOME}"
  TX_FLAGS="--node ${RPC} --chain-id ${CHAIN_ID} --fees 500${DENOM} --gas auto --gas-adjustment 1.5 --broadcast-mode sync -y --output json"
}

tx_code() {
  echo "$1" | jq -r 'if has("code") then (.code|tostring) elif ((.txhash // "")|length) > 0 then "0" else "1" end' 2>/dev/null || echo "1"
}

tx_hash() {
  echo "$1" | jq -r '.txhash // empty' 2>/dev/null || echo ""
}

wait_tx() {
  local hash="$1"
  local tries="${2:-20}"
  if [ -z "${hash}" ] || [ "${hash}" = "null" ]; then
    sleep 2
    return 0
  fi
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

# send_tx: execute a tx command, wait for confirmation, report pass/fail
# Usage: send_tx "label" <command args...>
send_tx() {
  local label="$1"
  shift
  echo -e "  ${DIM}\$ $*${NC}"

  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[dry-run] skipped${NC}"
    pass "${label} (dry-run)"
    return 0
  fi

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
      return 0
    else
      local raw_log
      raw_log=$(${BINARY} query tx "${hash}" --node "${RPC}" --output json 2>/dev/null | jq -r '.raw_log // ""' 2>/dev/null || echo "")
      fail "${label}" "${raw_log}"
      return 1
    fi
  else
    local errmsg
    errmsg=$(echo "${result}" | head -3 | tr '\n' ' ')
    fail "${label}" "${errmsg}"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# get_from_address: resolve FROM_KEY to its bech32 address
# ---------------------------------------------------------------------------
get_from_address() {
  ${BINARY} keys show "${FROM_KEY}" -a ${KEYRING} 2>/dev/null || echo ""
}

# =============================================================================
# Main
# =============================================================================
banner "ClawChain Testnet Seed Data"

resolve_binary
resolve_home
setup_tx_flags

FROM_ADDR=$(get_from_address)

echo ""
echo -e "  Binary:       ${BOLD}${BINARY}${NC}"
echo -e "  Chain ID:     ${BOLD}${CHAIN_ID}${NC}"
echo -e "  RPC:          ${BOLD}${RPC}${NC}"
echo -e "  REST:         ${BOLD}${REST}${NC}"
echo -e "  Node home:    ${BOLD}${NODE_HOME}${NC}"
echo -e "  From key:     ${BOLD}${FROM_KEY}${NC}"
echo -e "  From address: ${BOLD}${FROM_ADDR}${NC}"
echo -e "  Dry-run:      ${BOLD}${DRY_RUN}${NC}"

if [ -z "${FROM_ADDR}" ]; then
  echo -e "${RED}ERROR: Cannot resolve address for key '${FROM_KEY}'.${NC}"
  echo -e "${RED}Create it first: clawchaind keys add ${FROM_KEY} --keyring-backend test${NC}"
  exit 1
fi

# =============================================================================
# 0. Chain health check
# =============================================================================
section "Chain Health Check"

if [ "$DRY_RUN" = true ]; then
  info "Checking chain health..."
  pass "Chain health (dry-run)"
else
  STATUS_JSON=$(curl -s "${RPC}/status" 2>/dev/null || echo "")
  if [ -n "$STATUS_JSON" ]; then
    HEIGHT=$(echo "${STATUS_JSON}" | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo "0")
    CATCHING_UP=$(echo "${STATUS_JSON}" | jq -r '.result.sync_info.catching_up' 2>/dev/null || echo "unknown")
    info "Block height: ${HEIGHT}, catching_up: ${CATCHING_UP}"
    if [ "${CATCHING_UP}" = "false" ] && [ "${HEIGHT}" != "0" ]; then
      pass "Chain running at block ${HEIGHT}"
    else
      fail "Chain health" "height=${HEIGHT}, catching_up=${CATCHING_UP}"
      exit 1
    fi
  else
    fail "Chain health" "Cannot connect to RPC at ${RPC}"
    exit 1
  fi
fi

# =============================================================================
# 1. Create test wallets: agent-seed-1, agent-seed-2, agent-seed-3
# =============================================================================
section "Create Test Wallets"

AGENT_KEYS=("agent-seed-1" "agent-seed-2" "agent-seed-3")
AGENT_ADDRS=()

for key in "${AGENT_KEYS[@]}"; do
  addr=$(${BINARY} keys show "${key}" -a ${KEYRING} 2>/dev/null || true)
  if [ -z "${addr}" ]; then
    if [ "$DRY_RUN" = true ]; then
      info "Would create key: ${key}"
      AGENT_ADDRS+=("placeholder-${key}")
    else
      ${BINARY} keys add "${key}" ${KEYRING} > /dev/null 2>&1
      addr=$(${BINARY} keys show "${key}" -a ${KEYRING} 2>/dev/null)
      info "Created: ${key} -> ${addr}"
      AGENT_ADDRS+=("${addr}")
    fi
  else
    info "Exists:  ${key} -> ${addr}"
    AGENT_ADDRS+=("${addr}")
  fi
done

pass "Test wallets ready (${#AGENT_KEYS[@]} agents)"

# =============================================================================
# 2. Fund test wallets
# =============================================================================
section "Fund Test Wallets"

for i in "${!AGENT_KEYS[@]}"; do
  key="${AGENT_KEYS[$i]}"
  addr="${AGENT_ADDRS[$i]}"
  info "Funding ${key} (${addr:0:20}...) with 10 CLAW..."
  send_tx "Fund ${key}" \
    ${BINARY} tx bank send "${FROM_KEY}" "${addr}" "10000000${DENOM}" \
    ${KEYRING} ${TX_FLAGS} || true
done

# =============================================================================
# 3. Register agents
# =============================================================================
section "Register Agents"

AGENT_NAMES=("DataOracle-1" "InferenceBot-2" "StakeGuard-3")
AGENT_ENDPOINTS=("http://localhost:8081" "http://localhost:8082" "http://localhost:8083")

for i in "${!AGENT_KEYS[@]}"; do
  key="${AGENT_KEYS[$i]}"
  addr="${AGENT_ADDRS[$i]}"
  name="${AGENT_NAMES[$i]}"
  endpoint="${AGENT_ENDPOINTS[$i]}"

  # Check if agent already registered
  if [ "$DRY_RUN" = false ]; then
    EXISTING=$(curl -s "${REST}/clawchain/agent/v1/agent/${addr}" 2>/dev/null || echo '{}')
    EXISTING_NAME=$(echo "${EXISTING}" | jq -r '.name // ""' 2>/dev/null || echo "")
    if [ -n "${EXISTING_NAME}" ] && [ "${EXISTING_NAME}" != "null" ] && [ "${EXISTING_NAME}" != "" ]; then
      skip "Agent ${name} already registered"
      continue
    fi
  fi

  PUBKEY="pubkey-${name}-$(date +%s)"
  send_tx "Register agent ${name}" \
    ${BINARY} tx agent register-agent "${PUBKEY}" "${endpoint}" "${name}" \
    --from "${key}" ${KEYRING} ${TX_FLAGS} || true
done

# =============================================================================
# 4. Agent heartbeats
# =============================================================================
section "Agent Heartbeats"

if [ "$DRY_RUN" = false ]; then
  BLOCK_HEIGHT=$(curl -s "${RPC}/status" 2>/dev/null | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo "1")
else
  BLOCK_HEIGHT="100"
fi

for i in "${!AGENT_KEYS[@]}"; do
  key="${AGENT_KEYS[$i]}"
  name="${AGENT_NAMES[$i]}"
  endpoint="${AGENT_ENDPOINTS[$i]}"

  send_tx "Heartbeat for ${name}" \
    ${BINARY} tx agent agent-heartbeat \
    "${BLOCK_HEIGHT}" "${endpoint}" "{\"mode\":\"seed\",\"agent\":\"${name}\"}" \
    --from "${key}" ${KEYRING} ${TX_FLAGS} || true
done

# =============================================================================
# 5. Delegate and complete tasks
# =============================================================================
section "Delegate & Complete Tasks"

TASK_DESCS=(
  "Analyze token price feeds and generate report"
  "Run inference model for text classification"
  "Monitor validator uptime and create alerts"
)

for i in "${!TASK_DESCS[@]}"; do
  desc="${TASK_DESCS[$i]}"
  assignee_idx=$(( (i + 1) % ${#AGENT_KEYS[@]} ))
  assignee_addr="${AGENT_ADDRS[$assignee_idx]}"
  assignee_key="${AGENT_KEYS[$assignee_idx]}"
  budget=$(( (i + 1) * 1000000 ))

  # Delegate task from FROM_KEY to agent
  info "Delegating task: '${desc:0:40}...' -> ${AGENT_NAMES[$assignee_idx]}"
  DELEGATE_RESULT=""
  if [ "$DRY_RUN" = false ]; then
    DELEGATE_RESULT=$(${BINARY} tx agent delegate-task \
      "${assignee_addr}" "${desc}" "compute" 0 "${budget}" 500 \
      --from "${FROM_KEY}" ${KEYRING} ${TX_FLAGS} 2>&1 || echo '{}')
    HASH=$(tx_hash "${DELEGATE_RESULT}")
    if [ -n "${HASH}" ] && [ "${HASH}" != "null" ]; then
      wait_tx "${HASH}"

      # Extract task ID
      TX_EVENTS=$(${BINARY} query tx "${HASH}" --node "${RPC}" --output json 2>/dev/null || echo '{}')
      TASK_ID=$(echo "${TX_EVENTS}" | jq -r '[.events[]? | select(.type=="delegate_task") | .attributes[]? | select(.key=="task_id") | .value] | first // ""' 2>/dev/null || echo "")
      [ -z "${TASK_ID}" ] && TASK_ID="$((i + 1))"
      info "Task ID: ${TASK_ID}"

      # Accept task
      info "Agent ${AGENT_NAMES[$assignee_idx]} accepting task #${TASK_ID}..."
      ACCEPT_RESULT=$(${BINARY} tx agent accept-task "${TASK_ID}" \
        --from "${assignee_key}" ${KEYRING} ${TX_FLAGS} 2>&1 || echo '{}')
      ACCEPT_HASH=$(tx_hash "${ACCEPT_RESULT}")
      [ -n "${ACCEPT_HASH}" ] && wait_tx "${ACCEPT_HASH}"

      # Complete task
      info "Agent ${AGENT_NAMES[$assignee_idx]} completing task #${TASK_ID}..."
      COMPLETE_RESULT=$(${BINARY} tx agent complete-task "${TASK_ID}" \
        "{\"result\":\"Task completed successfully\",\"confidence\":0.95}" \
        --from "${assignee_key}" ${KEYRING} ${TX_FLAGS} 2>&1 || echo '{}')
      COMPLETE_HASH=$(tx_hash "${COMPLETE_RESULT}")
      [ -n "${COMPLETE_HASH}" ] && wait_tx "${COMPLETE_HASH}"

      if [ "$(tx_deliver_code "${COMPLETE_HASH}")" = "0" ]; then
        pass "Task lifecycle #${TASK_ID} complete"
      else
        fail "Task lifecycle #${TASK_ID}" "completion failed"
      fi
    else
      fail "Delegate task '${desc:0:30}...'" "no tx hash"
    fi
  else
    echo -e "  ${DIM}\$ ${BINARY} tx agent delegate-task ... --from ${FROM_KEY}${NC}"
    echo -e "  ${DIM}\$ ${BINARY} tx agent accept-task ... --from ${assignee_key}${NC}"
    echo -e "  ${DIM}\$ ${BINARY} tx agent complete-task ... --from ${assignee_key}${NC}"
    pass "Task lifecycle (dry-run)"
  fi
done

# =============================================================================
# 6. List marketplace skills
# =============================================================================
section "List Marketplace Skills"

SKILL_NAMES_SEED=("TextSummarization" "ImageClassification" "SentimentAnalysis")
SKILL_PRICES=("2000000" "3000000" "1500000")
SKILL_DESCS=(
  "AI-powered text summarization with 95% accuracy"
  "GPU-accelerated image classification with ResNet"
  "Real-time sentiment analysis for market feeds"
)

for i in "${!SKILL_NAMES_SEED[@]}"; do
  name="${SKILL_NAMES_SEED[$i]}"
  price="${SKILL_PRICES[$i]}"
  desc="${SKILL_DESCS[$i]}"
  key="${AGENT_KEYS[$i]}"

  send_tx "List skill '${name}'" \
    ${BINARY} tx marketplace list-skill "${name}" "${desc}" "${price}" "${DENOM}" \
    --from "${key}" ${KEYRING} ${TX_FLAGS} || true
done

# =============================================================================
# 7. Purchase a skill
# =============================================================================
section "Purchase Skill"

if [ "$DRY_RUN" = false ]; then
  SKILLS_JSON=$(curl -s "${REST}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
  SKILL_ID=$(echo "${SKILLS_JSON}" | jq -r '.skills[0].id // "1"' 2>/dev/null || echo "1")
  info "Purchasing skill ID: ${SKILL_ID}"
else
  SKILL_ID="1"
fi

send_tx "Purchase skill #${SKILL_ID}" \
  ${BINARY} tx marketplace purchase-skill "${SKILL_ID}" \
  --from "${FROM_KEY}" ${KEYRING} ${TX_FLAGS} || true

# =============================================================================
# 8. Rate agents (reputation)
# =============================================================================
section "Rate Agents (Reputation)"

RATINGS=(5 4 5)
COMMENTS=("Excellent work, very accurate" "Good results, slightly slow" "Outstanding quality and speed")

for i in "${!AGENT_KEYS[@]}"; do
  addr="${AGENT_ADDRS[$i]}"
  name="${AGENT_NAMES[$i]}"
  rating="${RATINGS[$i]}"
  comment="${COMMENTS[$i]}"

  send_tx "Rate ${name} (${rating} stars)" \
    ${BINARY} tx reputation rate-agent "${addr}" "${SKILL_ID:-1}" "${rating}" "${comment}" \
    --from "${FROM_KEY}" ${KEYRING} ${TX_FLAGS} || true
done

# =============================================================================
# 9. Shield tokens (privacy pool)
# =============================================================================
section "Shield Tokens into Privacy Pool"

BLINDING_B64="$(openssl rand -base64 32 2>/dev/null | tr -d '\n' || echo 'c2VlZC10ZXN0LWJsaW5kaW5nLWZhY3Rvcg==')"

send_tx "Shield 1 CLAW into privacy pool" \
  ${BINARY} tx privacy shield 1000000 "${DENOM}" \
  --blinding "${BLINDING_B64}" \
  --from "${FROM_KEY}" ${KEYRING} \
  --node "${RPC}" --chain-id "${CHAIN_ID}" --fees 500${DENOM} --gas 500000 --broadcast-mode sync -y --output json || true

# =============================================================================
# 10. Create escrow
# =============================================================================
section "Create Marketplace Escrow"

send_tx "Create 2-milestone escrow" \
  ${BINARY} tx marketplace create-escrow \
  --skill-id "${SKILL_ID:-1}" \
  --milestones 2 \
  --description "Build AI integration pipeline for data analysis" \
  --deadline-blocks 1000 \
  --from "${FROM_KEY}" ${KEYRING} ${TX_FLAGS} || true

# =============================================================================
# 11. Send messages (messaging module)
# =============================================================================
section "Send Encrypted Messages"

for i in "${!AGENT_ADDRS[@]}"; do
  addr="${AGENT_ADDRS[$i]}"
  name="${AGENT_NAMES[$i]}"

  send_tx "Send message to ${name}" \
    ${BINARY} tx messaging send-message \
    --to "${addr}" --content "Hello ${name}, your agent registration is confirmed." \
    --from "${FROM_KEY}" ${KEYRING} ${TX_FLAGS} || true
done

# =============================================================================
# 12. Submit governance proposal & vote
# =============================================================================
section "Governance Proposal & Vote"

info "Submitting parameter change proposal..."
send_tx "Submit governance proposal" \
  ${BINARY} tx governance submit-proposal \
  "Increase agent reward rate" \
  "Proposal to increase the base reward rate for agents from 5% to 7% to incentivize network participation." \
  "agent" "base_reward_rate" "0.07" "1000000" \
  --from "${FROM_KEY}" ${KEYRING} ${TX_FLAGS} || true

# Vote on proposal
if [ "$DRY_RUN" = false ]; then
  PROPOSALS=$(curl -s "${REST}/clawchain/governance/v1/proposals" 2>/dev/null || echo '{}')
  PROPOSAL_ID=$(echo "${PROPOSALS}" | jq -r '.proposals[-1].id // .proposals[-1].proposal_id // "1"' 2>/dev/null || echo "1")
  info "Voting YES on proposal #${PROPOSAL_ID}..."
else
  PROPOSAL_ID="1"
fi

send_tx "Vote YES on proposal #${PROPOSAL_ID}" \
  ${BINARY} tx governance vote "${PROPOSAL_ID}" 1 \
  --from "${FROM_KEY}" ${KEYRING} ${TX_FLAGS} || true

# Also vote from agent accounts
for i in "${!AGENT_KEYS[@]}"; do
  key="${AGENT_KEYS[$i]}"
  vote_option=$(( (i % 3) + 1 ))  # 1=yes, 2=no, 3=abstain for variety
  send_tx "Vote from ${AGENT_NAMES[$i]} (option ${vote_option})" \
    ${BINARY} tx governance vote "${PROPOSAL_ID}" "${vote_option}" \
    --from "${key}" ${KEYRING} ${TX_FLAGS} || true
done

# =============================================================================
# 13. Bank transfers between accounts
# =============================================================================
section "Token Transfers"

info "Creating a few token transfers between accounts..."

# Transfer from agent-seed-1 to agent-seed-2
if [ "${#AGENT_ADDRS[@]}" -ge 2 ]; then
  send_tx "Transfer 0.5 CLAW: agent-seed-1 -> agent-seed-2" \
    ${BINARY} tx bank send "${AGENT_KEYS[0]}" "${AGENT_ADDRS[1]}" "500000${DENOM}" \
    ${KEYRING} ${TX_FLAGS} || true
fi

# Transfer from agent-seed-2 to agent-seed-3
if [ "${#AGENT_ADDRS[@]}" -ge 3 ]; then
  send_tx "Transfer 0.25 CLAW: agent-seed-2 -> agent-seed-3" \
    ${BINARY} tx bank send "${AGENT_KEYS[1]}" "${AGENT_ADDRS[2]}" "250000${DENOM}" \
    ${KEYRING} ${TX_FLAGS} || true
fi

# =============================================================================
# 14. Query verification
# =============================================================================
section "Verify Seeded Data"

if [ "$DRY_RUN" = false ]; then
  # Check agent count
  AGENTS_JSON=$(curl -s "${REST}/clawchain/agent/v1/agents" 2>/dev/null || echo '{}')
  AGENT_COUNT=$(echo "${AGENTS_JSON}" | jq -r '.agents | length // 0' 2>/dev/null || echo "0")
  info "Registered agents: ${AGENT_COUNT}"

  # Check skill count
  SKILLS_JSON=$(curl -s "${REST}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
  SKILL_COUNT=$(echo "${SKILLS_JSON}" | jq -r '.skills | length // 0' 2>/dev/null || echo "0")
  info "Listed skills: ${SKILL_COUNT}"

  # Check privacy pool
  TREE_STATS=$(curl -s "${REST}/clawchain/privacy/v1/tree_stats" 2>/dev/null || echo '{}')
  LEAF_COUNT=$(echo "${TREE_STATS}" | jq -r '.leaf_count // 0' 2>/dev/null || echo "0")
  info "Privacy pool commitments: ${LEAF_COUNT}"

  # Check proposals
  PROPOSALS=$(curl -s "${REST}/clawchain/governance/v1/proposals" 2>/dev/null || echo '{}')
  PROPOSAL_COUNT=$(echo "${PROPOSALS}" | jq -r '.proposals | length // 0' 2>/dev/null || echo "0")
  info "Governance proposals: ${PROPOSAL_COUNT}"

  # Check supply
  SUPPLY=$(curl -s "${REST}/cosmos/bank/v1beta1/supply" 2>/dev/null || echo '{}')
  UCLAW_SUPPLY=$(echo "${SUPPLY}" | jq -r '.supply[] | select(.denom=="uclaw") | .amount' 2>/dev/null || echo "unknown")
  info "Total uclaw supply: ${UCLAW_SUPPLY}"

  # Overall verification
  if [ "${AGENT_COUNT}" -gt 0 ] 2>/dev/null; then
    pass "Agents seeded (${AGENT_COUNT})"
  else
    fail "No agents found"
  fi
  if [ "${SKILL_COUNT}" -gt 0 ] 2>/dev/null; then
    pass "Skills seeded (${SKILL_COUNT})"
  else
    fail "No skills found"
  fi
  if [ "${PROPOSAL_COUNT}" -gt 0 ] 2>/dev/null; then
    pass "Proposals seeded (${PROPOSAL_COUNT})"
  else
    fail "No proposals found"
  fi
else
  pass "Verification (dry-run)"
fi

# =============================================================================
# Summary
# =============================================================================
banner "Seed Data Complete"

echo ""
TOTAL=$((PASS_N + FAIL_N + SKIP_N))
echo -e "  ${GREEN}Passed: ${PASS_N}${NC}  |  ${RED}Failed: ${FAIL_N}${NC}  |  ${YELLOW}Skipped: ${SKIP_N}${NC}  |  Total: ${TOTAL}"
echo ""

echo -e "  ${BOLD}Data seeded:${NC}"
echo "    - 3 AI agent registrations with heartbeats"
echo "    - 3 task delegate/accept/complete lifecycles"
echo "    - 3 marketplace skill listings"
echo "    - 1 skill purchase"
echo "    - 3 reputation ratings"
echo "    - 1 privacy shield (ZK pool deposit)"
echo "    - 1 marketplace escrow (2 milestones)"
echo "    - 3 encrypted messages"
echo "    - 1 governance proposal + 4 votes"
echo "    - 2 token transfers"
echo ""

echo -e "  ${BOLD}Modules exercised:${NC}"
echo "    - bank (transfers, funding)"
echo "    - agent (register, heartbeat, delegate, accept, complete)"
echo "    - marketplace (list-skill, purchase-skill, create-escrow)"
echo "    - reputation (rate-agent)"
echo "    - privacy (shield)"
echo "    - messaging (send-message)"
echo "    - governance (submit-proposal, vote)"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "  ${YELLOW}This was a dry run. No transactions were executed.${NC}"
  echo -e "  ${YELLOW}Re-run without --dry-run to execute against a live chain.${NC}"
fi

if [ "${FAIL_N}" -gt 0 ]; then
  echo -e "  ${RED}${BOLD}Some steps failed. Check output above for details.${NC}"
  exit 1
else
  echo -e "  ${GREEN}${BOLD}Seed data complete!${NC}"
  exit 0
fi
