#!/usr/bin/env bash
#
# demo.sh — End-to-end ClawChain feature demonstration.
#
# Walks through the complete feature set of ClawChain:
#   1. Chain health and validator status
#   2. Token transfers (bank module)
#   3. Agent registration and query
#   4. Marketplace: list, purchase, and delist skills
#   5. Messaging: send, query, and acknowledge messages
#   6. Privacy module: shield tokens into the shielded pool
#
# Prerequisites:
#   - Running testnet (cd testnet && docker compose up -d)
#   - clawchaind binary on PATH
#   - jq installed
#
# Usage:
#   ./demo.sh
#
set -euo pipefail

RPC="http://localhost:26657"
REST="http://localhost:1317"
BINARY="${BINARY:-clawchaind}"
CHAIN_ID="clawchain-testnet-1"
DENOM="uclaw"
NODE0_HOME="$(cd "$(dirname "$0")/../testnet" && pwd)/data/node0"
KEYRING="--keyring-backend test --home ${NODE0_HOME}"
TX_COMMON="--node ${RPC} --chain-id ${CHAIN_ID} --fees 500${DENOM} --broadcast-mode sync -y --output json"
TX_SHIELD_COMMON="--node ${RPC} --chain-id ${CHAIN_ID} --fees 500${DENOM} --gas 500000 --broadcast-mode sync -y --output json"

# Colors & formatting
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

step() {
  echo -e "\n${YELLOW}>>> $1${NC}"
}

ok() {
  echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
  echo -e "  ${RED}✗${NC} $1"
}

resolve_binary() {
  local root
  root="$(cd "$(dirname "$0")/.." && pwd)"
  if [ -x "${root}/bin/clawchaind" ]; then
    BINARY="${root}/bin/clawchaind"
  elif [ -x "${root}/clawchaind" ]; then
    BINARY="${root}/clawchaind"
  elif type -P "${BINARY}" >/dev/null 2>&1; then
    BINARY="$(type -P "${BINARY}")"
  else
    echo "ERROR: clawchaind binary not found"
    exit 1
  fi
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
  local i
  if [ -z "${hash}" ] || [ "${hash}" = "null" ]; then
    sleep 2
    return 0
  fi
  echo -e "  ${CYAN}…${NC} Waiting for tx commit: ${hash:0:12}..."
  for i in $(seq 1 "${tries}"); do
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

tx_deliver_log() {
  local hash="$1"
  if [ -z "${hash}" ] || [ "${hash}" = "null" ]; then
    echo "unknown tx hash"
    return 0
  fi
  ${BINARY} query tx "${hash}" --node "${RPC}" --output json 2>/dev/null | jq -r '.raw_log // ""' 2>/dev/null || echo ""
}

wait_block() {
  local seconds="${1:-2}"
  sleep "${seconds}"
}

# =========================================================================
banner "ClawChain End-to-End Demo"
# =========================================================================

resolve_binary

echo ""
echo "  Chain ID:  ${CHAIN_ID}"
echo "  RPC:       ${RPC}"
echo "  REST:      ${REST}"
echo "  Binary:    ${BINARY}"
echo "  Node home: ${NODE0_HOME}"

# =========================================================================
banner "1. Chain Health"
# =========================================================================

step "Querying node status..."
STATUS_JSON=$(curl -s "${RPC}/status")
HEIGHT=$(echo "${STATUS_JSON}" | jq -r '.result.sync_info.latest_block_height')
CATCHING_UP=$(echo "${STATUS_JSON}" | jq -r '.result.sync_info.catching_up')
ok "Block height: ${HEIGHT}"
ok "Catching up: ${CATCHING_UP}"

step "Querying connected peers..."
PEERS=$(curl -s "${RPC}/net_info" | jq -r '.result.n_peers')
ok "Connected peers: ${PEERS}"

# =========================================================================
banner "2. Token Operations"
# =========================================================================

VALIDATOR_ADDR=$(${BINARY} keys show validator -a ${KEYRING} 2>/dev/null)
FAUCET_ADDR=$(${BINARY} keys show faucet -a ${KEYRING} 2>/dev/null)
VAL0_ADDR="${VALIDATOR_ADDR}"
VAL1_KEY="faucet"
VAL0_KEY="validator"

step "Validator address: ${VALIDATOR_ADDR}"
step "Faucet address:    ${FAUCET_ADDR}"

step "Checking validator balance..."
BALANCE=$(${BINARY} query bank balances "${VALIDATOR_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[] | select(.denom=="uclaw") | .amount' || echo "0")
ok "Validator balance: ${BALANCE} ${DENOM}"

step "Sending 5 CLAW (5000000 uclaw) from validator to faucet..."
TX=$(${BINARY} tx bank send validator "${FAUCET_ADDR}" "5000000${DENOM}" \
  ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  ok "TX hash: ${TX_HASH}"
else
  fail "Bank send failed (code: ${TX_CODE})"
fi
wait_tx "${TX_HASH}"
if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
  fail "Bank send deliver failed: $(tx_deliver_log "${TX_HASH}")"
fi

step "Checking faucet balance..."
FAUCET_BAL=$(${BINARY} query bank balances "${FAUCET_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[] | select(.denom=="uclaw") | .amount' || echo "0")
ok "Faucet balance: ${FAUCET_BAL} ${DENOM}"

# =========================================================================
banner "3. Agent Registration"
# =========================================================================

step "Registering validator as an agent..."
TX=$(${BINARY} tx agent register-agent \
  "demo-pubkey-$(date +%s)" "http://localhost:7777" "demo-agent" \
  --from validator ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  ok "Register TX: ${TX_HASH}"
else
  fail "Register agent failed (code: ${TX_CODE})"
fi
wait_tx "${TX_HASH}"
REGISTER_LOG="$(tx_deliver_log "${TX_HASH}")"
if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
  if echo "${REGISTER_LOG}" | grep -qi "already registered"; then
    ok "Validator agent already registered"
  else
    fail "Register agent deliver failed: ${REGISTER_LOG}"
  fi
fi

step "Registering faucet as a second agent (for endorsement flow)..."
TX=$(${BINARY} tx agent register-agent \
  "demo-pubkey-faucet-$(date +%s)" "http://localhost:7778" "demo-agent-faucet" \
  --from faucet ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  wait_tx "${TX_HASH}"
  FAUCET_REGISTER_LOG="$(tx_deliver_log "${TX_HASH}")"
  if [ "$(tx_deliver_code "${TX_HASH}")" = "0" ]; then
    ok "Faucet agent register TX: ${TX_HASH}"
  elif echo "${FAUCET_REGISTER_LOG}" | grep -qi "already registered"; then
    ok "Faucet agent already registered"
  else
    fail "Faucet agent register deliver failed: ${FAUCET_REGISTER_LOG}"
  fi
else
  fail "Faucet agent registration failed (code: ${TX_CODE})"
fi

step "Querying agent info..."
AGENT_JSON=$(curl -s "${REST}/clawchain/agent/v1/agent/${VALIDATOR_ADDR}" 2>/dev/null || echo '{}')
REGISTERED=$(echo "${AGENT_JSON}" | jq -r '.registered' 2>/dev/null || echo "false")
AGENT_NAME=$(echo "${AGENT_JSON}" | jq -r '.name' 2>/dev/null || echo "")
if [ "${REGISTERED}" = "true" ]; then
  ok "Agent '${AGENT_NAME}' registered on-chain"
else
  fail "Agent not found (may already be registered from a previous run)"
fi

# =========================================================================
banner "4. Marketplace: Skill Economy"
# =========================================================================

step "Listing a skill: 'SentimentAnalysis' for 2 CLAW..."
TX=$(${BINARY} tx marketplace list-skill \
  "SentimentAnalysis" "Analyzes text sentiment with 95% accuracy" "2000000" "${DENOM}" \
  --from validator ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  ok "List skill TX: ${TX_HASH}"
else
  fail "List skill failed (code: ${TX_CODE})"
fi
wait_tx "${TX_HASH}"
if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
  fail "List skill deliver failed: $(tx_deliver_log "${TX_HASH}")"
fi

step "Querying marketplace skills..."
SKILLS_JSON=$(curl -s "${REST}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
SKILL_COUNT=$(echo "${SKILLS_JSON}" | jq -r '.skills | length' 2>/dev/null || echo "0")
ok "Total skills listed: ${SKILL_COUNT}"

# Find the skill we just listed (latest one)
SKILL_ID=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].id' 2>/dev/null || echo "0")
SKILL_NAME=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].name' 2>/dev/null || echo "unknown")
SKILL_PRICE=$(echo "${SKILLS_JSON}" | jq -r '.skills[-1].price' 2>/dev/null || echo "0")
ok "Latest skill: ID=${SKILL_ID}, name='${SKILL_NAME}', price=${SKILL_PRICE} ${DENOM}"

step "Purchasing skill #${SKILL_ID} from faucet account..."
TX=$(${BINARY} tx marketplace purchase-skill "${SKILL_ID}" \
  --from faucet ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  ok "Purchase TX: ${TX_HASH}"
else
  fail "Purchase failed (code: ${TX_CODE})"
fi
wait_tx "${TX_HASH}"
if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
  fail "Purchase deliver failed: $(tx_deliver_log "${TX_HASH}")"
fi

step "Verifying purchase..."
SKILL_JSON=$(curl -s "${REST}/clawchain/marketplace/v1/skill/${SKILL_ID}" 2>/dev/null || echo '{}')
PURCHASE_COUNT=$(echo "${SKILL_JSON}" | jq -r '.skill.purchase_count' 2>/dev/null || echo "0")
ok "Purchase count: ${PURCHASE_COUNT}"

step "Keeping skill #${SKILL_ID} active for reputation/escrow/versioning phases..."
ok "Skill remains active for downstream demo steps"

# =========================================================================
banner "5. Task Lifecycle (Delegate → Accept → Execute → Payment)"
# =========================================================================

step "Validator (agent) records validator balance before task delegation..."
VAL_BAL_BEFORE=$(${BINARY} query bank balances "${VALIDATOR_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[] | select(.denom=="uclaw") | .amount' || echo "0")
FAUCET_BAL_BEFORE=$(${BINARY} query bank balances "${FAUCET_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[] | select(.denom=="uclaw") | .amount' || echo "0")
ok "Validator balance before delegation: ${VAL_BAL_BEFORE} ${DENOM}"
ok "Faucet balance before delegation:    ${FAUCET_BAL_BEFORE} ${DENOM}"

step "Validator delegates task to faucet agent (budget 1 CLAW)..."
TX=$(${BINARY} tx agent delegate-task \
  "${FAUCET_ADDR}" \
  "Run sentiment analysis on the SentimentAnalysis skill result" \
  '{"model":"sentiment-v1","input":"demo dataset"}' \
  "1000000" 200 \
  --from validator ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  ok "DelegateTask TX: ${TX_HASH}"
else
  fail "DelegateTask failed (code: ${TX_CODE})"
fi
wait_tx "${TX_HASH}"
DELEGATE_LOG="$(tx_deliver_log "${TX_HASH}")"
if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
  fail "DelegateTask deliver failed: ${DELEGATE_LOG}"
fi

# Extract task ID from the response events
TASK_ID=$(${BINARY} query tx "${TX_HASH}" --node "${RPC}" --output json 2>/dev/null \
  | jq -r '.events[] | select(.type=="delegate_task") | .attributes[] | select(.key=="task_id") | .value' 2>/dev/null \
  | head -1)
if [ -z "${TASK_ID}" ] || [ "${TASK_ID}" = "null" ]; then
  # Fallback: query tasks by delegator and get the latest
  TASK_ID=$(curl -s "${REST}/clawchain/agent/v1/tasks/delegator/${VALIDATOR_ADDR}" 2>/dev/null \
    | jq -r '.tasks[-1].task_id // .tasks[-1].id // empty' 2>/dev/null | head -1)
fi
ok "Task ID: ${TASK_ID:-unknown}"

step "Faucet agent accepts the task..."
if [ -n "${TASK_ID}" ] && [ "${TASK_ID}" != "null" ] && [ "${TASK_ID}" != "unknown" ]; then
  TX=$(${BINARY} tx agent accept-task "${TASK_ID}" \
    --from faucet ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
  TX_CODE=$(tx_code "${TX}")
  TX_HASH=$(tx_hash "${TX}")
  if [ "${TX_CODE}" = "0" ]; then
    ok "AcceptTask TX: ${TX_HASH}"
    wait_tx "${TX_HASH}"
    if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
      fail "AcceptTask deliver failed: $(tx_deliver_log "${TX_HASH}")"
    fi
  else
    fail "AcceptTask failed (code: ${TX_CODE})"
  fi
else
  ok "Skipping AcceptTask (task ID not available — check on-chain)"
fi

step "Faucet agent completes the task (submits result)..."
if [ -n "${TASK_ID}" ] && [ "${TASK_ID}" != "null" ] && [ "${TASK_ID}" != "unknown" ]; then
  TX=$(${BINARY} tx agent complete-task "${TASK_ID}" \
    '{"output":"positive","confidence":0.97,"model":"sentiment-v1"}' \
    --from faucet ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
  TX_CODE=$(tx_code "${TX}")
  TX_HASH=$(tx_hash "${TX}")
  if [ "${TX_CODE}" = "0" ]; then
    ok "CompleteTask TX: ${TX_HASH}"
    wait_tx "${TX_HASH}"
    if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
      fail "CompleteTask deliver failed: $(tx_deliver_log "${TX_HASH}")"
    fi
  else
    fail "CompleteTask failed (code: ${TX_CODE})"
  fi
else
  ok "Skipping CompleteTask (task ID not available — check on-chain)"
fi

step "Verifying payment was released to faucet agent after task completion..."
FAUCET_BAL_AFTER=$(${BINARY} query bank balances "${FAUCET_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[] | select(.denom=="uclaw") | .amount' || echo "0")
ok "Faucet balance after task completion: ${FAUCET_BAL_AFTER} ${DENOM} (was: ${FAUCET_BAL_BEFORE} ${DENOM})"

step "Querying task status..."
if [ -n "${TASK_ID}" ] && [ "${TASK_ID}" != "null" ] && [ "${TASK_ID}" != "unknown" ]; then
  TASK_JSON=$(curl -s "${REST}/clawchain/agent/v1/task/${TASK_ID}" 2>/dev/null || echo '{}')
  TASK_STATUS=$(echo "${TASK_JSON}" | jq -r '.status' 2>/dev/null || echo "unknown")
  ok "Task #${TASK_ID} status: ${TASK_STATUS}"
else
  ok "Task query skipped (task ID not available)"
fi

# =========================================================================
banner "6. Agent Messaging"
# =========================================================================

step "Sending encrypted message from validator to faucet..."
TX=$(${BINARY} tx messaging send-message \
  "${FAUCET_ADDR}" "aes256gcm-encrypted-demo-payload-$(date +%s)" "nonce-demo-$(date +%s)" \
  --from validator ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  ok "Send message TX: ${TX_HASH}"
else
  fail "Send message failed (code: ${TX_CODE})"
fi
wait_tx "${TX_HASH}"

step "Querying messages for faucet..."
MSGS_JSON=$(curl -s "${REST}/clawchain/messaging/v1/messages/${FAUCET_ADDR}" 2>/dev/null || echo '{}')
MSG_COUNT=$(echo "${MSGS_JSON}" | jq -r '.messages | length' 2>/dev/null || echo "0")
ok "Messages for faucet: ${MSG_COUNT}"

if [ "${MSG_COUNT}" -gt 0 ]; then
  LATEST_MSG_ID=$(echo "${MSGS_JSON}" | jq -r '.messages[-1].id' 2>/dev/null || echo "0")
  LATEST_SENDER=$(echo "${MSGS_JSON}" | jq -r '.messages[-1].sender' 2>/dev/null || echo "?")
  ok "Latest message: ID=${LATEST_MSG_ID}, from=${LATEST_SENDER:0:20}..."

  step "Acknowledging message #${LATEST_MSG_ID} from faucet..."
  TX=$(${BINARY} tx messaging ack-message "${LATEST_MSG_ID}" \
    --from faucet ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
  TX_CODE=$(tx_code "${TX}")
  TX_HASH=$(tx_hash "${TX}")
  if [ "${TX_CODE}" = "0" ]; then
    ok "Ack TX: ${TX_HASH}"
  else
    fail "Ack message failed (code: ${TX_CODE})"
  fi
  wait_tx "${TX_HASH}"
  if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
    fail "Ack message deliver failed: $(tx_deliver_log "${TX_HASH}")"
  fi
fi

step "Querying conversation between validator and faucet..."
CONV_JSON=$(curl -s "${REST}/clawchain/messaging/v1/conversation/${VALIDATOR_ADDR}/${FAUCET_ADDR}" 2>/dev/null || echo '{}')
CONV_COUNT=$(echo "${CONV_JSON}" | jq -r '.messages | length' 2>/dev/null || echo "0")
ok "Conversation messages: ${CONV_COUNT}"

# =========================================================================
banner "7. Privacy Module (Shield)"
# =========================================================================

step "Querying Merkle tree stats..."
TREE_STATS=$(curl -s "${REST}/clawchain/privacy/v1/tree_stats" 2>/dev/null || echo '{}')
TOTAL_COMMITMENTS=$(echo "${TREE_STATS}" | jq -r '.leaf_count // 0' 2>/dev/null || echo "0")
MERKLE_ROOT=$(echo "${TREE_STATS}" | jq -r '.current_root' 2>/dev/null || echo "none")
ok "Total commitments: ${TOTAL_COMMITMENTS}"
ok "Merkle root: ${MERKLE_ROOT:0:32}..."

step "Shielding 1 CLAW (1000000 uclaw) from validator..."
BLINDING_B64="$(openssl rand -base64 32 | tr -d '\n')"
TX=$(${BINARY} tx privacy shield 1000000 "${DENOM}" \
  --blinding "${BLINDING_B64}" \
  --from validator ${KEYRING} ${TX_SHIELD_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
TX_HASH=$(tx_hash "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  ok "Shield TX: ${TX_HASH}"
else
  fail "Shield TX failed (code: ${TX_CODE})"
fi
wait_tx "${TX_HASH}"
if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
  fail "Shield deliver failed: $(tx_deliver_log "${TX_HASH}")"
fi

step "Querying updated tree stats..."
TREE_STATS=$(curl -s "${REST}/clawchain/privacy/v1/tree_stats" 2>/dev/null || echo '{}')
NEW_COMMITMENTS=$(echo "${TREE_STATS}" | jq -r '.leaf_count // 0' 2>/dev/null || echo "0")
ok "Total commitments: ${NEW_COMMITMENTS}"

# =========================================================================
banner "8. Agent Reputation"
# =========================================================================

step "Rating agent (faucet rates validator for purchased skill ${SKILL_ID})..."
TX=$(${BINARY} tx reputation rate-agent "${VAL0_ADDR}" "${SKILL_ID}" 5 "Great skill!" \
  --from "${VAL1_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  TX_HASH=$(tx_hash "${TX}")
  ok "Rate agent TX: ${TX_HASH}"
  wait_tx "${TX_HASH}"
  if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
    fail "Rate agent deliver failed: $(tx_deliver_log "${TX_HASH}")"
  fi
else
  fail "Rate agent TX failed (code: ${TX_CODE})"
fi

step "Endorsing agent (val1 endorses val0)..."
TX=$(${BINARY} tx reputation endorse-agent "${VAL0_ADDR}" "Reliable agent" \
  --from "${VAL1_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  TX_HASH=$(tx_hash "${TX}")
  ok "Endorse agent TX: ${TX_HASH}"
  wait_tx "${TX_HASH}"
  if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
    fail "Endorse agent deliver failed: $(tx_deliver_log "${TX_HASH}")"
  fi
else
  fail "Endorse agent TX failed (code: ${TX_CODE})"
fi

step "Querying reputation..."
REP=$(curl -s "${REST}/clawchain/reputation/v1/reputation/${VAL0_ADDR}" 2>/dev/null || echo '{}')
FOUND=$(echo "${REP}" | jq -r '.found // false' 2>/dev/null || echo "false")
AVG_BPS=$(echo "${REP}" | jq -r '.reputation.avg_rating_bps // 0' 2>/dev/null || echo "0")
ENDORSEMENTS=$(echo "${REP}" | jq -r '.reputation.endorsements // .reputation.endorsement_count // 0' 2>/dev/null || echo "0")
ok "Reputation found: ${FOUND}"
ok "Avg rating (bps): ${AVG_BPS}"
ok "Agent endorsements: ${ENDORSEMENTS}"

step "Querying top agents..."
TOP=$(curl -s "${REST}/clawchain/reputation/v1/top_agents?limit=5" 2>/dev/null || echo '{}')
TOP_COUNT=$(echo "${TOP}" | jq '.agents // .top_agents | length' 2>/dev/null || echo "0")
ok "Top agents returned: ${TOP_COUNT}"

# =========================================================================
banner "9. Marketplace Escrow"
# =========================================================================

step "Creating escrow for skill ${SKILL_ID}..."
TX=$(${BINARY} tx marketplace create-escrow \
  --skill-id "${SKILL_ID}" \
  --milestones 2 \
  --description "Build integration" \
  --deadline-blocks 1000 \
  --from "${VAL1_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  TX_HASH=$(tx_hash "${TX}")
  ok "Create escrow TX: ${TX_HASH}"
  wait_tx "${TX_HASH}"
  if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
    fail "Create escrow deliver failed: $(tx_deliver_log "${TX_HASH}")"
  fi
else
  fail "Create escrow TX failed (code: ${TX_CODE})"
fi

ESCROW_ID=$(curl -s "${REST}/clawchain/marketplace/v1/escrows/${FAUCET_ADDR}" 2>/dev/null | jq -r '.escrows[-1].id' 2>/dev/null || echo "0")
step "Querying escrow #${ESCROW_ID}..."
ESCROW=$(curl -s "${REST}/clawchain/marketplace/v1/escrow/${ESCROW_ID}" 2>/dev/null || echo '{}')
ESCROW_STATUS=$(echo "${ESCROW}" | jq -r '.escrow.status' 2>/dev/null || echo "unknown")
ok "Escrow status: ${ESCROW_STATUS}"

step "Completing escrow #${ESCROW_ID}..."
TX=$(${BINARY} tx marketplace complete-escrow \
  --escrow-id "${ESCROW_ID}" \
  --from "${VAL1_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  TX_HASH=$(tx_hash "${TX}")
  ok "Complete escrow TX: ${TX_HASH}"
  wait_tx "${TX_HASH}"
  if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
    fail "Complete escrow deliver failed: $(tx_deliver_log "${TX_HASH}")"
  fi
else
  fail "Complete escrow TX failed (code: ${TX_CODE})"
fi

# =========================================================================
banner "10. Skill Versioning"
# =========================================================================

step "Updating skill ${SKILL_ID} with version bump..."
TX=$(${BINARY} tx marketplace update-skill \
  --skill-id "${SKILL_ID}" \
  --description "Updated description" \
  --price "2000000" \
  --category "ai" \
  --from "${VAL0_KEY}" ${KEYRING} ${TX_COMMON} 2>/dev/null || echo '{}')
TX_CODE=$(tx_code "${TX}")
if [ "${TX_CODE}" = "0" ]; then
  TX_HASH=$(tx_hash "${TX}")
  ok "Update skill TX: ${TX_HASH}"
  wait_tx "${TX_HASH}"
  if [ "$(tx_deliver_code "${TX_HASH}")" != "0" ]; then
    fail "Update skill deliver failed: $(tx_deliver_log "${TX_HASH}")"
  fi
else
  fail "Update skill TX failed (code: ${TX_CODE})"
fi

step "Querying skill analytics..."
ANALYTICS=$(curl -s "${REST}/clawchain/marketplace/v1/skills/analytics/${SKILL_ID}" 2>/dev/null || echo '{}')
VERSION_COUNT=$(echo "${ANALYTICS}" | jq -r '.version // .version_count // .versionCount // 0' 2>/dev/null || echo "0")
ok "Skill version count: ${VERSION_COUNT}"

# =========================================================================
banner "Demo Complete!"
# =========================================================================

echo ""
echo "  ClawChain features demonstrated:"
echo "    1.  Chain health and validator status"
echo "    2.  Token transfers (bank module)"
echo "    3.  Agent registration and on-chain identity"
echo "    4.  Marketplace skill economy (list, purchase)"
echo "    5.  Task lifecycle (delegate -> accept -> execute -> payment release)"
echo "    6.  Encrypted agent-to-agent messaging"
echo "    7.  Privacy module (shielded pool)"
echo "    8.  Agent reputation (rate, endorse, leaderboard)"
echo "    9.  Marketplace escrow (create, complete)"
echo "    10. Skill versioning (update, analytics)"
echo ""
echo "  For more details, see:"
echo "    - PRD:              ./prd.md"
echo "    - Testnet setup:    ./testnet/setup-testnet.sh"
echo "    - Stress test:      ./testnet/stress-test.sh"
echo "    - Benchmarks:       ./testnet/benchmark.sh"
echo "    - Validator guide:  ./testnet/VALIDATOR-GUIDE.md"
echo ""
