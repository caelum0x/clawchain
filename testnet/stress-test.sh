#!/usr/bin/env bash
#
# stress-test.sh — Multi-node stress testing for ClawChain testnet.
#
# Simulates heavy load across all validator nodes with concurrent transactions
# to measure throughput, latency, and error rates.
#
# Requirements:
#   - Running testnet (docker compose up)
#   - jq installed
#   - curl installed
#
# Usage:
#   ./stress-test.sh [TOTAL_TXS] [CONCURRENCY]
#
# Default: 500 transactions, 10 concurrent workers
#
set -euo pipefail

TOTAL_TXS="${1:-500}"
CONCURRENCY="${2:-10}"
CHAIN_ID="clawchain-testnet-1"
DENOM="uclaw"
BINARY="clawchaind"
KEYRING_BACKEND="test"
DATA_DIR="$(cd "$(dirname "$0")" && pwd)/data"
RESULTS_DIR="$(cd "$(dirname "$0")" && pwd)/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Node endpoints
RPC_NODES=("http://localhost:26657" "http://localhost:26757" "http://localhost:26857" "http://localhost:26957")
REST_NODES=("http://localhost:1317" "http://localhost:1417" "http://localhost:1517" "http://localhost:1617")

mkdir -p "${RESULTS_DIR}"
REPORT="${RESULTS_DIR}/stress-test-${TIMESTAMP}.txt"

echo "============================================" | tee "${REPORT}"
echo "  ClawChain Stress Test" | tee -a "${REPORT}"
echo "  Total TXs:    ${TOTAL_TXS}" | tee -a "${REPORT}"
echo "  Concurrency:  ${CONCURRENCY}" | tee -a "${REPORT}"
echo "  Timestamp:    ${TIMESTAMP}" | tee -a "${REPORT}"
echo "============================================" | tee -a "${REPORT}"
echo "" | tee -a "${REPORT}"

# ---- Preflight checks ----
echo "Preflight checks..." | tee -a "${REPORT}"

for rpc in "${RPC_NODES[@]}"; do
  STATUS=$(curl -s "${rpc}/status" 2>/dev/null || echo "FAIL")
  if echo "${STATUS}" | jq -e '.result.sync_info.latest_block_height' > /dev/null 2>&1; then
    HEIGHT=$(echo "${STATUS}" | jq -r '.result.sync_info.latest_block_height')
    echo "  ${rpc}: OK (height ${HEIGHT})" | tee -a "${REPORT}"
  else
    echo "  ${rpc}: UNREACHABLE" | tee -a "${REPORT}"
  fi
done

# ---- Create stress test accounts ----
echo "" | tee -a "${REPORT}"
echo "Creating stress test accounts..." | tee -a "${REPORT}"

NODE0_HOME="${DATA_DIR}/node0"
VALIDATOR_ADDR=$(${BINARY} keys show "validator" -a --keyring-backend "${KEYRING_BACKEND}" --home "${NODE0_HOME}")

# Create test accounts
declare -a TEST_ADDRS
for i in $(seq 0 $((CONCURRENCY - 1))); do
  KEY_NAME="stress-${i}"
  # Create key if it doesn't exist
  if ! ${BINARY} keys show "${KEY_NAME}" --keyring-backend "${KEYRING_BACKEND}" --home "${NODE0_HOME}" > /dev/null 2>&1; then
    ${BINARY} keys add "${KEY_NAME}" --keyring-backend "${KEYRING_BACKEND}" --home "${NODE0_HOME}" > /dev/null 2>&1
  fi
  ADDR=$(${BINARY} keys show "${KEY_NAME}" -a --keyring-backend "${KEYRING_BACKEND}" --home "${NODE0_HOME}")
  TEST_ADDRS+=("${ADDR}")
done

echo "  Created ${CONCURRENCY} test accounts" | tee -a "${REPORT}"

# Fund test accounts from validator
echo "  Funding test accounts..." | tee -a "${REPORT}"
for i in $(seq 0 $((CONCURRENCY - 1))); do
  ${BINARY} tx bank send "${VALIDATOR_ADDR}" "${TEST_ADDRS[$i]}" "10000000${DENOM}" \
    --chain-id "${CHAIN_ID}" --keyring-backend "${KEYRING_BACKEND}" --home "${NODE0_HOME}" \
    --fees "500${DENOM}" --yes --broadcast-mode sync > /dev/null 2>&1 || true
done

# Wait for funding txs to be included
echo "  Waiting for funding transactions..." | tee -a "${REPORT}"
sleep 10

# ---- Test 1: Bank Send throughput ----
echo "" | tee -a "${REPORT}"
echo "Test 1: Bank Send Throughput" | tee -a "${REPORT}"
echo "----------------------------" | tee -a "${REPORT}"

START_HEIGHT=$(curl -s "${RPC_NODES[0]}/status" | jq -r '.result.sync_info.latest_block_height')
START_TIME=$(date +%s%N)

TXS_PER_WORKER=$((TOTAL_TXS / CONCURRENCY))
SUCCESS_COUNT=0
FAIL_COUNT=0
TMPDIR_TX=$(mktemp -d)

for w in $(seq 0 $((CONCURRENCY - 1))); do
  (
    KEY_NAME="stress-${w}"
    success=0
    fail=0
    node_idx=$((w % ${#RPC_NODES[@]}))
    rpc="${RPC_NODES[$node_idx]}"

    for t in $(seq 1 "${TXS_PER_WORKER}"); do
      # Send 1 uclaw to self (minimal tx)
      RESULT=$(${BINARY} tx bank send "${TEST_ADDRS[$w]}" "${TEST_ADDRS[$w]}" "1${DENOM}" \
        --chain-id "${CHAIN_ID}" --keyring-backend "${KEYRING_BACKEND}" --home "${NODE0_HOME}" \
        --from "${KEY_NAME}" --fees "500${DENOM}" --yes --broadcast-mode sync \
        --node "${rpc}" 2>&1 || echo "ERROR")

      if echo "${RESULT}" | grep -q "txhash"; then
        success=$((success + 1))
      else
        fail=$((fail + 1))
      fi
    done

    echo "${success}" > "${TMPDIR_TX}/success_${w}"
    echo "${fail}" > "${TMPDIR_TX}/fail_${w}"
  ) &
done

# Wait for all workers
wait

END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

# Collect results
for w in $(seq 0 $((CONCURRENCY - 1))); do
  s=$(cat "${TMPDIR_TX}/success_${w}" 2>/dev/null || echo "0")
  f=$(cat "${TMPDIR_TX}/fail_${w}" 2>/dev/null || echo "0")
  SUCCESS_COUNT=$((SUCCESS_COUNT + s))
  FAIL_COUNT=$((FAIL_COUNT + f))
done
rm -rf "${TMPDIR_TX}"

# Wait for final block
sleep 6
END_HEIGHT=$(curl -s "${RPC_NODES[0]}/status" | jq -r '.result.sync_info.latest_block_height')
BLOCKS=$((END_HEIGHT - START_HEIGHT))

TPS=0
if [ "${ELAPSED_MS}" -gt 0 ]; then
  TPS=$(echo "scale=2; ${SUCCESS_COUNT} * 1000 / ${ELAPSED_MS}" | bc 2>/dev/null || echo "N/A")
fi

echo "  Submitted: $((SUCCESS_COUNT + FAIL_COUNT))" | tee -a "${REPORT}"
echo "  Succeeded: ${SUCCESS_COUNT}" | tee -a "${REPORT}"
echo "  Failed:    ${FAIL_COUNT}" | tee -a "${REPORT}"
echo "  Duration:  ${ELAPSED_MS}ms" | tee -a "${REPORT}"
echo "  TPS:       ${TPS}" | tee -a "${REPORT}"
echo "  Blocks:    ${BLOCKS} (${START_HEIGHT} -> ${END_HEIGHT})" | tee -a "${REPORT}"
echo "  Error rate: $(echo "scale=1; ${FAIL_COUNT} * 100 / (${SUCCESS_COUNT} + ${FAIL_COUNT})" | bc 2>/dev/null || echo "N/A")%" | tee -a "${REPORT}"

# ---- Test 2: Agent registration burst ----
echo "" | tee -a "${REPORT}"
echo "Test 2: Agent Registration Burst" | tee -a "${REPORT}"
echo "---------------------------------" | tee -a "${REPORT}"

AGENT_START=$(date +%s%N)
AGENT_SUCCESS=0
AGENT_FAIL=0

for w in $(seq 0 $((CONCURRENCY - 1))); do
  KEY_NAME="stress-${w}"
  RESULT=$(${BINARY} tx clawchain-agent register-agent \
    --pubkey "stress-pubkey-${w}" --endpoint "http://stress-${w}:7777" --agent-name "stress-agent-${w}" \
    --chain-id "${CHAIN_ID}" --keyring-backend "${KEYRING_BACKEND}" --home "${NODE0_HOME}" \
    --from "${KEY_NAME}" --fees "500${DENOM}" --yes --broadcast-mode sync \
    --node "${RPC_NODES[$((w % ${#RPC_NODES[@]}))]}" 2>&1 || echo "ERROR")

  if echo "${RESULT}" | grep -q "txhash"; then
    AGENT_SUCCESS=$((AGENT_SUCCESS + 1))
  else
    AGENT_FAIL=$((AGENT_FAIL + 1))
  fi
done

AGENT_END=$(date +%s%N)
AGENT_ELAPSED=$(( (AGENT_END - AGENT_START) / 1000000 ))

echo "  Registered: ${AGENT_SUCCESS} / ${CONCURRENCY}" | tee -a "${REPORT}"
echo "  Failed:     ${AGENT_FAIL}" | tee -a "${REPORT}"
echo "  Duration:   ${AGENT_ELAPSED}ms" | tee -a "${REPORT}"

# ---- Test 3: REST API latency ----
echo "" | tee -a "${REPORT}"
echo "Test 3: REST API Latency" | tee -a "${REPORT}"
echo "------------------------" | tee -a "${REPORT}"

declare -a LATENCIES

for rest in "${REST_NODES[@]}"; do
  # Status endpoint
  START_REQ=$(date +%s%N)
  curl -s "${rest}/cosmos/base/tendermint/v1beta1/blocks/latest" > /dev/null 2>&1
  END_REQ=$(date +%s%N)
  LATENCY_MS=$(( (END_REQ - START_REQ) / 1000000 ))
  LATENCIES+=("${LATENCY_MS}")
  echo "  ${rest} /blocks/latest: ${LATENCY_MS}ms" | tee -a "${REPORT}"
done

# Calculate average
if [ "${#LATENCIES[@]}" -gt 0 ]; then
  SUM=0
  for l in "${LATENCIES[@]}"; do SUM=$((SUM + l)); done
  AVG=$((SUM / ${#LATENCIES[@]}))
  echo "  Average: ${AVG}ms" | tee -a "${REPORT}"
fi

# ---- Test 4: Block production rate ----
echo "" | tee -a "${REPORT}"
echo "Test 4: Block Production Rate" | tee -a "${REPORT}"
echo "-----------------------------" | tee -a "${REPORT}"

H1=$(curl -s "${RPC_NODES[0]}/status" | jq -r '.result.sync_info.latest_block_height')
sleep 30
H2=$(curl -s "${RPC_NODES[0]}/status" | jq -r '.result.sync_info.latest_block_height')
BLOCKS_30S=$((H2 - H1))
BLOCK_TIME="N/A"
if [ "${BLOCKS_30S}" -gt 0 ]; then
  BLOCK_TIME=$(echo "scale=2; 30 / ${BLOCKS_30S}" | bc 2>/dev/null || echo "N/A")
fi

echo "  Blocks in 30s: ${BLOCKS_30S}" | tee -a "${REPORT}"
echo "  Avg block time: ${BLOCK_TIME}s" | tee -a "${REPORT}"

# ---- Summary ----
echo "" | tee -a "${REPORT}"
echo "============================================" | tee -a "${REPORT}"
echo "  Stress Test Summary" | tee -a "${REPORT}"
echo "============================================" | tee -a "${REPORT}"
echo "  Bank Send TPS:          ${TPS}" | tee -a "${REPORT}"
echo "  Bank Send success rate: $(echo "scale=1; ${SUCCESS_COUNT} * 100 / (${SUCCESS_COUNT} + ${FAIL_COUNT})" | bc 2>/dev/null || echo "N/A")%" | tee -a "${REPORT}"
echo "  Agent registrations:    ${AGENT_SUCCESS}/${CONCURRENCY}" | tee -a "${REPORT}"
echo "  Avg REST latency:       ${AVG:-N/A}ms" | tee -a "${REPORT}"
echo "  Avg block time:         ${BLOCK_TIME}s" | tee -a "${REPORT}"
echo "" | tee -a "${REPORT}"
echo "  Full report: ${REPORT}" | tee -a "${REPORT}"
echo "" | tee -a "${REPORT}"
