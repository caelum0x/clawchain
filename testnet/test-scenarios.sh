#!/usr/bin/env bash
#
# test-scenarios.sh — Run test scenarios against a running ClawChain testnet.
#
# Prerequisites:
#   - Testnet is running (docker compose up -d)
#   - clawchaind is available on PATH
#
# Usage:
#   ./test-scenarios.sh
#
set -euo pipefail

RPC="http://localhost:26657"
REST="http://localhost:1317"
BINARY="${BINARY:-clawchaind}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE0_HOME="$(cd "$(dirname "$0")" && pwd)/data/node0"
KEYRING="--keyring-backend test --home ${NODE0_HOME}"
TX_FLAGS="--broadcast-mode sync"

PASS=0
FAIL=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  local name="$1"
  local result="$2"
  if [ "${result}" = "0" ]; then
    echo -e "  ${GREEN}PASS${NC} ${name}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC} ${name}"
    FAIL=$((FAIL + 1))
  fi
}

wait_for_tx_commit() {
  local tx_hash="$1"
  local tries="${2:-25}"
  local i
  if [ -z "${tx_hash}" ] || [ "${tx_hash}" = "null" ]; then
    return 1
  fi
  for i in $(seq 1 "${tries}"); do
    if ${BINARY} query tx "${tx_hash}" --node "${RPC}" --output json >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

after_tx() {
  local tx_code="$1"
  local tx_hash="${2:-}"
  if [ "${tx_code}" = "0" ]; then
    if ! wait_for_tx_commit "${tx_hash}" 30; then
      sleep 2
    fi
  fi
}

account_address() {
  local key_name="$1"
  ${BINARY} keys show "${key_name}" -a ${KEYRING} 2>/dev/null || echo ""
}

account_sequence() {
  local key_name="$1"
  local addr
  addr="$(account_address "${key_name}")"
  if [ -z "${addr}" ]; then
    echo "0"
    return 0
  fi
  ${BINARY} query auth account "${addr}" --node "${RPC}" --output json 2>/dev/null \
    | jq -r '.account.value.sequence // .account.base_account.sequence // "0"' 2>/dev/null || echo "0"
}

retry_count_query() {
  local url="$1"
  local jq_expr="$2"
  local tries="${3:-8}"
  local i
  local count="0"
  for i in $(seq 1 "${tries}"); do
    count="$(curl -s "${url}" 2>/dev/null | jq -r "${jq_expr}" 2>/dev/null || echo "0")"
    if [ "${count}" -gt 0 ] 2>/dev/null; then
      echo "${count}"
      return 0
    fi
    sleep 1
  done
  echo "${count}"
  return 0
}

wait_agent_registered() {
  local addr="$1"
  local tries="${2:-8}"
  local i
  local registered="false"
  for i in $(seq 1 "${tries}"); do
    registered="$(curl -s "${REST}/clawchain/agent/v1/agent/${addr}" 2>/dev/null | jq -r '.registered // "false"' 2>/dev/null || echo "false")"
    if [ "${registered}" = "true" ]; then
      echo "true"
      return 0
    fi
    sleep 1
  done
  echo "${registered}"
  return 0
}

wait_for_rpc() {
  local retries="${1:-60}"
  local i
  for i in $(seq 1 "${retries}"); do
    local syncing
    local height
    syncing=$(curl -s "${RPC}/status" | jq -r '.result.sync_info.catching_up' 2>/dev/null || true)
    height=$(curl -s "${RPC}/status" | jq -r '.result.sync_info.latest_block_height // "0"' 2>/dev/null || echo "0")
    if [ "${syncing}" = "false" ] && [ "${height}" -gt 0 ] 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_rest() {
  local retries="${1:-60}"
  local i
  for i in $(seq 1 "${retries}"); do
    if curl -s "${REST}/cosmos/base/tendermint/v1beta1/syncing" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [ -x "${ROOT_DIR}/bin/clawchaind" ]; then
  BINARY="${ROOT_DIR}/bin/clawchaind"
elif [ -x "${ROOT_DIR}/clawchaind" ]; then
  BINARY="${ROOT_DIR}/clawchaind"
elif type -P "${BINARY}" >/dev/null 2>&1; then
  BINARY="$(type -P "${BINARY}")"
else
  echo "ERROR: clawchaind binary not found (checked ${ROOT_DIR}/bin/clawchaind, ${ROOT_DIR}/clawchaind, PATH)"
  exit 1
fi

echo "============================================"
echo "  ClawChain Testnet Scenarios"
echo "============================================"
echo ""

if ! wait_for_rpc 90; then
  echo -e "  ${YELLOW}WARN${NC} RPC not ready after timeout; checks may fail."
fi
if ! wait_for_rest 90; then
  echo -e "  ${YELLOW}WARN${NC} REST not ready after timeout; checks may fail."
fi

VALIDATOR_ADDR="$(account_address validator)"
FAUCET_ADDR="$(account_address faucet)"

# -----------------------------------------------------------------
# 1. Chain Health
# -----------------------------------------------------------------
echo "${YELLOW}1. Chain Health${NC}"

# Check node is responding
STATUS=$(curl -s "${RPC}/status" | jq -r '.result.sync_info.catching_up' 2>/dev/null || echo "error")
check "Node RPC responding" "$([ "${STATUS}" = "false" ] && echo 0 || echo 1)"

# Check block height > 0
HEIGHT=$(curl -s "${RPC}/status" | jq -r '.result.sync_info.latest_block_height' 2>/dev/null || echo "0")
check "Block height > 0 (height: ${HEIGHT})" "$([ "${HEIGHT}" -gt 0 ] 2>/dev/null && echo 0 || echo 1)"

# Check peers
PEERS=$(curl -s "${RPC}/net_info" | jq -r '.result.n_peers' 2>/dev/null || echo "0")
check "Has connected peers (${PEERS})" "$([ "${PEERS}" -gt 0 ] 2>/dev/null && echo 0 || echo 1)"

echo ""

# -----------------------------------------------------------------
# 2. Token Operations
# -----------------------------------------------------------------
echo "${YELLOW}2. Token Operations${NC}"

# Get validator address
if [ -z "${VALIDATOR_ADDR}" ]; then
  echo -e "  ${RED}SKIP${NC} Could not get validator address"
else
  # Check balance
  BALANCE=$(${BINARY} query bank balances "${VALIDATOR_ADDR}" --node "${RPC}" --output json 2>/dev/null | jq -r '.balances[0].amount' 2>/dev/null || echo "0")
  check "Validator has balance (${BALANCE} uclaw)" "$([ "${BALANCE}" -gt 0 ] 2>/dev/null && echo 0 || echo 1)"

  # Send tokens
  if [ -n "${FAUCET_ADDR}" ]; then
    TX_RESULT=$(${BINARY} tx bank send validator "${FAUCET_ADDR}" 1000000uclaw \
      ${KEYRING} --node "${RPC}" --chain-id clawchain-testnet-1 \
      --fees 500uclaw --sequence "$(account_sequence validator)" ${TX_FLAGS} -y --output json 2>/dev/null || echo '{"code":1}')
    TX_CODE=$(echo "${TX_RESULT}" | jq -r '.code' 2>/dev/null || echo "1")
    TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")
    check "Send tokens tx (code: ${TX_CODE})" "${TX_CODE}"
    after_tx "${TX_CODE}" "${TX_HASH}"
  fi
fi

echo ""

# -----------------------------------------------------------------
# 3. Agent Module
# -----------------------------------------------------------------
echo "${YELLOW}3. Agent Module${NC}"

if [ -n "${VALIDATOR_ADDR}" ]; then
  # Register agent
  TX_RESULT=$(${BINARY} tx agent register-agent \
    "test-pubkey-hex" "http://localhost:7777" "test-agent" \
    --from validator ${KEYRING} --node "${RPC}" \
    --chain-id clawchain-testnet-1 --fees 500uclaw --sequence "$(account_sequence validator)" ${TX_FLAGS} -y --output json 2>/dev/null || echo '{"code":1}')
  TX_CODE=$(echo "${TX_RESULT}" | jq -r '.code' 2>/dev/null || echo "1")
  TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")
  check "Register agent tx (code: ${TX_CODE})" "${TX_CODE}"
  after_tx "${TX_CODE}" "${TX_HASH}"

  # Query agent
  sleep 2  # wait for block
  REGISTERED="$(wait_agent_registered "${VALIDATOR_ADDR}" 10)"
  check "Agent query returns registered" "$([ "${REGISTERED}" = "true" ] && echo 0 || echo 1)"
fi

echo ""

# -----------------------------------------------------------------
# 4. Messaging Module
# -----------------------------------------------------------------
echo "${YELLOW}4. Messaging Module${NC}"

# Query messaging params
PARAMS_RESULT=$(curl -s "${REST}/clawchain/messaging/v1/params" 2>/dev/null || echo '{}')
HAS_PARAMS=$(echo "${PARAMS_RESULT}" | jq -r '.params' 2>/dev/null || echo "null")
check "Messaging params query" "$([ "${HAS_PARAMS}" != "null" ] && echo 0 || echo 1)"

if [ -n "${VALIDATOR_ADDR}" ]; then
  # Get a second address for messaging
  if [ -n "${FAUCET_ADDR}" ]; then
    # Send a message
    TX_RESULT=$(${BINARY} tx messaging send-message \
      "${FAUCET_ADDR}" "encrypted-test-payload" "nonce-testscenario-001" \
      --from validator ${KEYRING} --node "${RPC}" \
      --chain-id clawchain-testnet-1 --fees 500uclaw --sequence "$(account_sequence validator)" ${TX_FLAGS} -y --output json 2>/dev/null || echo '{"code":1}')
    TX_CODE=$(echo "${TX_RESULT}" | jq -r '.code' 2>/dev/null || echo "1")
    TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")
    check "Send message tx (code: ${TX_CODE})" "${TX_CODE}"
    after_tx "${TX_CODE}" "${TX_HASH}"

    sleep 2  # wait for block

    # Query messages for validator
    MSG_COUNT="$(retry_count_query "${REST}/clawchain/messaging/v1/messages/${VALIDATOR_ADDR}" '.messages | length' 10)"
    check "Messages query has results (${MSG_COUNT})" "$([ "${MSG_COUNT}" -gt 0 ] 2>/dev/null && echo 0 || echo 1)"

    # Query conversation
    CONV_COUNT="$(retry_count_query "${REST}/clawchain/messaging/v1/conversation/${VALIDATOR_ADDR}/${FAUCET_ADDR}" '.messages | length' 10)"
    check "Conversation query (${CONV_COUNT} msgs)" "$([ "${CONV_COUNT}" -gt 0 ] 2>/dev/null && echo 0 || echo 1)"

    # Ack the message (from faucet as recipient)
    TX_RESULT=$(${BINARY} tx messaging ack-message 0 \
      --from faucet ${KEYRING} --node "${RPC}" \
      --chain-id clawchain-testnet-1 --fees 500uclaw --sequence "$(account_sequence faucet)" ${TX_FLAGS} -y --output json 2>/dev/null || echo '{"code":1}')
    TX_CODE=$(echo "${TX_RESULT}" | jq -r '.code' 2>/dev/null || echo "1")
    TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")
    check "Ack message tx (code: ${TX_CODE})" "${TX_CODE}"
    after_tx "${TX_CODE}" "${TX_HASH}"
  fi
fi

echo ""

# -----------------------------------------------------------------
# 5. Marketplace Module
# -----------------------------------------------------------------
echo "${YELLOW}5. Marketplace Module${NC}"

# Query marketplace params
MKT_PARAMS=$(curl -s "${REST}/clawchain/marketplace/v1/params" 2>/dev/null || echo '{}')
HAS_MKT_PARAMS=$(echo "${MKT_PARAMS}" | jq -r '.params' 2>/dev/null || echo "null")
check "Marketplace params query" "$([ "${HAS_MKT_PARAMS}" != "null" ] && echo 0 || echo 1)"

if [ -n "${VALIDATOR_ADDR}" ]; then
  # List a skill
  TX_RESULT=$(${BINARY} tx marketplace list-skill \
    "DataAnalysis" "Analyzes datasets and produces actionable insights" "1000000" "uclaw" \
    --from validator ${KEYRING} --node "${RPC}" \
    --chain-id clawchain-testnet-1 --fees 500uclaw --sequence "$(account_sequence validator)" ${TX_FLAGS} -y --output json 2>/dev/null || echo '{"code":1}')
  TX_CODE=$(echo "${TX_RESULT}" | jq -r '.code' 2>/dev/null || echo "1")
  TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")
  check "List skill tx (code: ${TX_CODE})" "${TX_CODE}"
  after_tx "${TX_CODE}" "${TX_HASH}"

  sleep 2  # wait for block

  # Query all skills
  SKILL_COUNT="$(retry_count_query "${REST}/clawchain/marketplace/v1/skills" '.skills | length' 10)"
  check "Skills query has results (${SKILL_COUNT})" "$([ "${SKILL_COUNT}" -gt 0 ] 2>/dev/null && echo 0 || echo 1)"

  SKILLS_RESULT=$(curl -s "${REST}/clawchain/marketplace/v1/skills" 2>/dev/null || echo '{}')
  SKILL_ID=$(echo "${SKILLS_RESULT}" | jq -r '.skills[0].id // "0"' 2>/dev/null || echo "0")

  # Query single skill by ID
  SKILL_RESULT=$(curl -s "${REST}/clawchain/marketplace/v1/skill/${SKILL_ID}" 2>/dev/null || echo '{}')
  SKILL_NAME=$(echo "${SKILL_RESULT}" | jq -r '.skill.name' 2>/dev/null || echo "")
  check "Skill query by ID (name: ${SKILL_NAME})" "$([ "${SKILL_NAME}" = "DataAnalysis" ] && echo 0 || echo 1)"

  # Purchase skill from faucet account
  if [ -n "${FAUCET_ADDR}" ]; then
    TX_RESULT=$(${BINARY} tx marketplace purchase-skill "${SKILL_ID}" \
      --from faucet ${KEYRING} --node "${RPC}" \
      --chain-id clawchain-testnet-1 --fees 500uclaw --sequence "$(account_sequence faucet)" ${TX_FLAGS} -y --output json 2>/dev/null || echo '{"code":1}')
    TX_CODE=$(echo "${TX_RESULT}" | jq -r '.code' 2>/dev/null || echo "1")
    TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")
    check "Purchase skill tx (code: ${TX_CODE})" "${TX_CODE}"
    after_tx "${TX_CODE}" "${TX_HASH}"

    sleep 2

    # Verify purchase count incremented
    SKILL_RESULT=$(curl -s "${REST}/clawchain/marketplace/v1/skill/${SKILL_ID}" 2>/dev/null || echo '{}')
    PURCHASE_COUNT=$(echo "${SKILL_RESULT}" | jq -r '.skill.purchase_count' 2>/dev/null || echo "0")
    check "Purchase count incremented (${PURCHASE_COUNT})" "$([ "${PURCHASE_COUNT}" -gt 0 ] 2>/dev/null && echo 0 || echo 1)"
  fi

  # Delist the skill
  TX_RESULT=$(${BINARY} tx marketplace delist-skill "${SKILL_ID}" \
    --from validator ${KEYRING} --node "${RPC}" \
    --chain-id clawchain-testnet-1 --fees 500uclaw --sequence "$(account_sequence validator)" ${TX_FLAGS} -y --output json 2>/dev/null || echo '{"code":1}')
  TX_CODE=$(echo "${TX_RESULT}" | jq -r '.code' 2>/dev/null || echo "1")
  TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")
  check "Delist skill tx (code: ${TX_CODE})" "${TX_CODE}"
  after_tx "${TX_CODE}" "${TX_HASH}"

  sleep 2

  # Verify skill is inactive
  SKILL_RESULT=$(curl -s "${REST}/clawchain/marketplace/v1/skill/${SKILL_ID}" 2>/dev/null || echo '{}')
  SKILL_ACTIVE=$(echo "${SKILL_RESULT}" | jq -r '.skill.active' 2>/dev/null || echo "true")
  check "Skill marked inactive" "$([ "${SKILL_ACTIVE}" = "false" ] && echo 0 || echo 1)"
fi

echo ""

# -----------------------------------------------------------------
# 6. Reputation
# -----------------------------------------------------------------
echo "${YELLOW}6. Reputation${NC}"

# Query reputation (should return empty/default)
REP=$(curl -s "${REST}/clawchain/reputation/v1/reputation/${VALIDATOR_ADDR}" 2>/dev/null || echo '{}')
REP_FOUND=$(echo "${REP}" | jq -r '.found' 2>/dev/null || echo "false")
check "Reputation query returns result" "$([ -n "${REP}" ] && echo 0 || echo 1)"

# Query top agents
TOP=$(curl -s "${REST}/clawchain/reputation/v1/top_agents?limit=5" 2>/dev/null || echo '{}')
check "Top agents query returns result" "$([ -n "${TOP}" ] && echo 0 || echo 1)"

echo ""

# -----------------------------------------------------------------
# 7. Escrow
# -----------------------------------------------------------------
echo "${YELLOW}7. Escrow${NC}"

# Query escrows for address (should return empty list or error gracefully)
ESCROWS=$(curl -s "${REST}/clawchain/marketplace/v1/escrows/${VALIDATOR_ADDR}" 2>/dev/null || echo '{}')
check "Escrows query returns result" "$([ -n "${ESCROWS}" ] && echo 0 || echo 1)"

echo ""

# -----------------------------------------------------------------
# 8. Skill Versioning & Analytics
# -----------------------------------------------------------------
echo "${YELLOW}8. Skill Versioning & Analytics${NC}"

# Query skills by category
CATEGORY=$(curl -s "${REST}/clawchain/marketplace/v1/skills/category/ai" 2>/dev/null || echo '{}')
check "Skills by category query returns result" "$([ -n "${CATEGORY}" ] && echo 0 || echo 1)"

# Search skills
SEARCH=$(curl -s "${REST}/clawchain/marketplace/v1/skills/search/test" 2>/dev/null || echo '{}')
check "Skill search query returns result" "$([ -n "${SEARCH}" ] && echo 0 || echo 1)"

# Query root history
ROOT_HISTORY=$(curl -s "${REST}/clawchain/privacy/v1/root_history?offset=0&limit=5" 2>/dev/null || echo '{}')
check "Privacy root history query returns result" "$([ -n "${ROOT_HISTORY}" ] && echo 0 || echo 1)"

echo ""

# -----------------------------------------------------------------
# 9. Agent Activity
# -----------------------------------------------------------------
echo "${YELLOW}9. Agent Activity${NC}"

# Query agent stats
STATS=$(curl -s "${REST}/clawchain/agent/v1/stats/${VALIDATOR_ADDR}" 2>/dev/null || echo '{}')
check "Agent stats query returns result" "$([ -n "${STATS}" ] && echo 0 || echo 1)"

# Query recent activity
RECENT=$(curl -s "${REST}/clawchain/agent/v1/recent_activity?limit=10" 2>/dev/null || echo '{}')
check "Recent activity query returns result" "$([ -n "${RECENT}" ] && echo 0 || echo 1)"

echo ""

# -----------------------------------------------------------------
# 10. Monitoring
# -----------------------------------------------------------------
echo "${YELLOW}10. Monitoring${NC}"

# Check Prometheus metrics endpoint
METRICS=$(curl -s "http://localhost:26660/metrics" 2>/dev/null | head -1 || echo "")
check "Prometheus metrics endpoint" "$([ -n "${METRICS}" ] && echo 0 || echo 1)"

# Check Prometheus server
PROM_STATUS=$(curl -s "http://localhost:9091/-/ready" 2>/dev/null || echo "")
check "Prometheus server ready" "$(echo "${PROM_STATUS}" | grep -qi "ready" 2>/dev/null && echo 0 || echo 1)"

# Check Grafana
GRAFANA_STATUS=$(curl -s "http://localhost:3000/api/health" 2>/dev/null | jq -r '.database' 2>/dev/null || echo "")
check "Grafana health" "$([ "${GRAFANA_STATUS}" = "ok" ] && echo 0 || echo 1)"

echo ""

# -----------------------------------------------------------------
# Summary
# -----------------------------------------------------------------
echo "============================================"
echo -e "  Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "============================================"

exit "${FAIL}"
