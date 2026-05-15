#!/usr/bin/env bash
#
# benchmark.sh — Hardware benchmarks for ClawChain.
#
# Measures proof generation times, transaction throughput, and system resource
# usage. Outputs a structured report.
#
# Requirements:
#   - clawproof binary built (make install)
#   - clawchaind binary built
#   - jq installed
#   - Optionally: a running testnet for tx benchmarks
#
# Usage:
#   ./benchmark.sh [--json]
#
# Options:
#   --json   Write a structured JSON report alongside the text report.
#
set -euo pipefail

JSON_OUTPUT=false
for arg in "$@"; do
  case "$arg" in
    --json) JSON_OUTPUT=true ;;
  esac
done

RESULTS_DIR="$(cd "$(dirname "$0")" && pwd)/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT="${RESULTS_DIR}/benchmark-${TIMESTAMP}.txt"
TMPDIR=$(mktemp -d)

mkdir -p "${RESULTS_DIR}"

echo "============================================" | tee "${REPORT}"
echo "  ClawChain Hardware Benchmark" | tee -a "${REPORT}"
echo "  Date:     $(date)" | tee -a "${REPORT}"
echo "  Host:     $(hostname)" | tee -a "${REPORT}"
echo "  OS:       $(uname -s) $(uname -r)" | tee -a "${REPORT}"
echo "  Arch:     $(uname -m)" | tee -a "${REPORT}"
echo "  CPU:      $(sysctl -n machdep.cpu.brand_string 2>/dev/null || nproc 2>/dev/null || echo 'unknown')" | tee -a "${REPORT}"
echo "  Cores:    $(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 'unknown')" | tee -a "${REPORT}"
echo "  Memory:   $(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f GB", $1/1073741824}' 2>/dev/null || free -h 2>/dev/null | awk '/Mem:/{print $2}' || echo 'unknown')" | tee -a "${REPORT}"
echo "============================================" | tee -a "${REPORT}"
echo "" | tee -a "${REPORT}"

# Helper to measure execution time in milliseconds
bench() {
  local label="$1"
  shift
  local start end elapsed

  start=$(date +%s%N)
  "$@" > /dev/null 2>&1
  local rc=$?
  end=$(date +%s%N)
  elapsed=$(( (end - start) / 1000000 ))

  echo "${elapsed}"
}

# =========================================================================
# Benchmark 1: ZK Proof Generation (clawproof binary)
# =========================================================================
echo "Benchmark 1: ZK Proof Generation" | tee -a "${REPORT}"
echo "---------------------------------" | tee -a "${REPORT}"

CLAWPROOF=""
if command -v clawproof &>/dev/null; then
  CLAWPROOF="clawproof"
elif [ -f "$(cd "$(dirname "$0")/.." && pwd)/clawproof/clawproof" ]; then
  CLAWPROOF="$(cd "$(dirname "$0")/.." && pwd)/clawproof/clawproof"
fi

if [ -n "${CLAWPROOF}" ]; then
  # Setup (one-time key generation)
  echo "  Running trusted setup..." | tee -a "${REPORT}"
  SETUP_MS=$(bench "setup" "${CLAWPROOF}" setup --workdir "${TMPDIR}")
  echo "  Trusted setup:       ${SETUP_MS}ms" | tee -a "${REPORT}"

  # Commitment generation (10 rounds)
  echo "  Benchmarking commitment generation..." | tee -a "${REPORT}"
  COMMIT_TOTAL=0
  COMMIT_COUNT=10
  for i in $(seq 1 ${COMMIT_COUNT}); do
    MS=$(bench "commit-${i}" "${CLAWPROOF}" commitment --amount "$((i * 1000000))" --blinding "$(printf '%064x' $((RANDOM * 10000 + i)))" --workdir "${TMPDIR}")
    COMMIT_TOTAL=$((COMMIT_TOTAL + MS))
  done
  COMMIT_AVG=$((COMMIT_TOTAL / COMMIT_COUNT))
  echo "  Commitment gen (avg): ${COMMIT_AVG}ms (${COMMIT_COUNT} rounds)" | tee -a "${REPORT}"

  # Nullifier generation (10 rounds)
  echo "  Benchmarking nullifier generation..." | tee -a "${REPORT}"
  NULL_TOTAL=0
  NULL_COUNT=10
  for i in $(seq 1 ${NULL_COUNT}); do
    MS=$(bench "null-${i}" "${CLAWPROOF}" nullifier --secret "$(printf '%064x' $((RANDOM * 10000 + i)))" --commitment "$(printf '%064x' $((RANDOM * 10000 + i + 100)))" --workdir "${TMPDIR}")
    NULL_TOTAL=$((NULL_TOTAL + MS))
  done
  NULL_AVG=$((NULL_TOTAL / NULL_COUNT))
  echo "  Nullifier gen (avg):  ${NULL_AVG}ms (${NULL_COUNT} rounds)" | tee -a "${REPORT}"

  # Shield data generation (5 rounds)
  echo "  Benchmarking shield data generation..." | tee -a "${REPORT}"
  SHIELD_TOTAL=0
  SHIELD_COUNT=5
  for i in $(seq 1 ${SHIELD_COUNT}); do
    MS=$(bench "shield-${i}" "${CLAWPROOF}" shield-data --amount "$((i * 500000))" --blinding "$(printf '%032x' $((RANDOM * 10000 + i)))" --workdir "${TMPDIR}")
    SHIELD_TOTAL=$((SHIELD_TOTAL + MS))
  done
  SHIELD_AVG=$((SHIELD_TOTAL / SHIELD_COUNT))
  echo "  Shield data (avg):    ${SHIELD_AVG}ms (${SHIELD_COUNT} rounds)" | tee -a "${REPORT}"
else
  echo "  SKIPPED: clawproof binary not found" | tee -a "${REPORT}"
fi

echo "" | tee -a "${REPORT}"

# =========================================================================
# Benchmark 2: Binary build time
# =========================================================================
echo "Benchmark 2: Binary Build Time" | tee -a "${REPORT}"
echo "-------------------------------" | tee -a "${REPORT}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_MS=$(bench "build" go build -o "${TMPDIR}/clawchaind" "${PROJECT_ROOT}/cmd/clawchaind")
echo "  clawchaind build:    ${BUILD_MS}ms" | tee -a "${REPORT}"

echo "" | tee -a "${REPORT}"

# =========================================================================
# Benchmark 3: Transaction throughput (if testnet is running)
# =========================================================================
echo "Benchmark 3: Transaction Throughput" | tee -a "${REPORT}"
echo "------------------------------------" | tee -a "${REPORT}"

RPC="http://localhost:26657"
REST="http://localhost:1317"

if curl -s "${RPC}/status" > /dev/null 2>&1; then
  # Measure block time over 60 seconds
  echo "  Measuring block production (60s window)..." | tee -a "${REPORT}"
  H1=$(curl -s "${RPC}/status" | jq -r '.result.sync_info.latest_block_height')
  T1=$(date +%s)
  sleep 60
  H2=$(curl -s "${RPC}/status" | jq -r '.result.sync_info.latest_block_height')
  T2=$(date +%s)

  BLOCKS=$((H2 - H1))
  ELAPSED=$((T2 - T1))
  if [ "${BLOCKS}" -gt 0 ]; then
    BLOCK_TIME=$(echo "scale=3; ${ELAPSED}.0 / ${BLOCKS}" | bc 2>/dev/null || echo "N/A")
    BLOCKS_PER_MIN=$(echo "scale=1; ${BLOCKS} * 60 / ${ELAPSED}" | bc 2>/dev/null || echo "N/A")
  else
    BLOCK_TIME="N/A"
    BLOCKS_PER_MIN="0"
  fi

  echo "  Blocks produced:      ${BLOCKS}" | tee -a "${REPORT}"
  echo "  Avg block time:       ${BLOCK_TIME}s" | tee -a "${REPORT}"
  echo "  Blocks per minute:    ${BLOCKS_PER_MIN}" | tee -a "${REPORT}"

  # Measure query latency
  echo "  Measuring query latency..." | tee -a "${REPORT}"

  declare -a Q_LATENCIES
  ENDPOINTS=(
    "/cosmos/base/tendermint/v1beta1/blocks/latest"
    "/cosmos/bank/v1beta1/balances/claw1placeholder"
    "/clawchain/privacy/v1/tree_stats"
    "/clawchain/agent/v1/agent/claw1placeholder"
    "/clawchain/marketplace/v1/skills"
  )

  for ep in "${ENDPOINTS[@]}"; do
    START_Q=$(date +%s%N)
    curl -s "${REST}${ep}" > /dev/null 2>&1
    END_Q=$(date +%s%N)
    LAT=$(( (END_Q - START_Q) / 1000000 ))
    Q_LATENCIES+=("${LAT}")
    echo "  ${ep}: ${LAT}ms" | tee -a "${REPORT}"
  done

  # Average
  if [ "${#Q_LATENCIES[@]}" -gt 0 ]; then
    QSUM=0
    for l in "${Q_LATENCIES[@]}"; do QSUM=$((QSUM + l)); done
    QAVG=$((QSUM / ${#Q_LATENCIES[@]}))
    echo "  Avg query latency:    ${QAVG}ms" | tee -a "${REPORT}"
  fi
else
  echo "  SKIPPED: No running testnet at ${RPC}" | tee -a "${REPORT}"
fi

echo "" | tee -a "${REPORT}"

# =========================================================================
# Benchmark 4: Memory & disk usage
# =========================================================================
echo "Benchmark 4: Resource Usage" | tee -a "${REPORT}"
echo "----------------------------" | tee -a "${REPORT}"

# Binary sizes
BINARY_PATH=$(command -v clawchaind 2>/dev/null || echo "")
if [ -n "${BINARY_PATH}" ]; then
  SIZE=$(ls -lh "${BINARY_PATH}" | awk '{print $5}')
  echo "  clawchaind binary:   ${SIZE}" | tee -a "${REPORT}"
fi

PROOF_PATH=$(command -v clawproof 2>/dev/null || echo "")
if [ -n "${PROOF_PATH}" ]; then
  SIZE=$(ls -lh "${PROOF_PATH}" | awk '{print $5}')
  echo "  clawproof binary:    ${SIZE}" | tee -a "${REPORT}"
fi

# Testnet data size
if [ -d "${RESULTS_DIR}/../data" ]; then
  DATA_SIZE=$(du -sh "${RESULTS_DIR}/../data" 2>/dev/null | cut -f1)
  echo "  Testnet data dir:    ${DATA_SIZE}" | tee -a "${REPORT}"
fi

# Node process memory (if running)
if pgrep -f "clawchaind start" > /dev/null 2>&1; then
  MEM=$(ps -o rss= -p "$(pgrep -f 'clawchaind start' | head -1)" 2>/dev/null | awk '{printf "%.0f MB", $1/1024}')
  echo "  Node memory (RSS):   ${MEM}" | tee -a "${REPORT}"
fi

echo "" | tee -a "${REPORT}"

# =========================================================================
# Benchmark 5: Consensus Latency (if testnet is running)
# =========================================================================
echo "Benchmark 5: Consensus Latency" | tee -a "${REPORT}"
echo "--------------------------------" | tee -a "${REPORT}"

CONSENSUS_AVG="N/A"
if curl -s "${RPC}/status" > /dev/null 2>&1; then
  CLAWCHAIND=""
  if command -v clawchaind &>/dev/null; then
    CLAWCHAIND="clawchaind"
  elif [ -f "${PROJECT_ROOT}/bin/clawchaind" ]; then
    CLAWCHAIND="${PROJECT_ROOT}/bin/clawchaind"
  fi

  if [ -n "${CLAWCHAIND}" ]; then
    echo "  Measuring tx confirmation latency (10 iterations)..." | tee -a "${REPORT}"
    CONSENSUS_TOTAL=0
    CONSENSUS_COUNT=10
    CONSENSUS_SUCCESS=0

    # Get a funded account address for sending txs
    SENDER=$(${CLAWCHAIND} keys show validator0 -a --keyring-backend test --home "${SCRIPT_DIR:-$(dirname "$0")}/data/node0" 2>/dev/null || echo "")

    if [ -n "${SENDER}" ]; then
      for i in $(seq 1 ${CONSENSUS_COUNT}); do
        TX_START=$(date +%s%N)

        # Broadcast a small bank send to self with sync mode
        TX_RESULT=$(${CLAWCHAIND} tx bank send "${SENDER}" "${SENDER}" 1uclaw \
          --chain-id clawchain-testnet-1 \
          --keyring-backend test \
          --home "${SCRIPT_DIR:-$(dirname "$0")}/data/node0" \
          --node "${RPC}" \
          --broadcast-mode sync \
          --fees 500uclaw \
          --yes \
          --output json 2>/dev/null || echo "{}")

        TX_HASH=$(echo "${TX_RESULT}" | jq -r '.txhash // empty' 2>/dev/null || echo "")

        if [ -n "${TX_HASH}" ]; then
          # Poll for confirmation (max 30s)
          CONFIRMED=false
          for _ in $(seq 1 60); do
            QUERY_RESULT=$(curl -s "${RPC}/tx?hash=0x${TX_HASH}" 2>/dev/null || echo "{}")
            TX_HEIGHT=$(echo "${QUERY_RESULT}" | jq -r '.result.height // empty' 2>/dev/null || echo "")
            if [ -n "${TX_HEIGHT}" ] && [ "${TX_HEIGHT}" != "null" ]; then
              CONFIRMED=true
              break
            fi
            sleep 0.5
          done

          if [ "${CONFIRMED}" = true ]; then
            TX_END=$(date +%s%N)
            TX_LAT=$(( (TX_END - TX_START) / 1000000 ))
            CONSENSUS_TOTAL=$((CONSENSUS_TOTAL + TX_LAT))
            CONSENSUS_SUCCESS=$((CONSENSUS_SUCCESS + 1))
            echo "  Iteration ${i}: ${TX_LAT}ms" | tee -a "${REPORT}"
          else
            echo "  Iteration ${i}: timeout (not confirmed)" | tee -a "${REPORT}"
          fi
        else
          echo "  Iteration ${i}: tx broadcast failed" | tee -a "${REPORT}"
        fi
      done

      if [ "${CONSENSUS_SUCCESS}" -gt 0 ]; then
        CONSENSUS_AVG=$((CONSENSUS_TOTAL / CONSENSUS_SUCCESS))
        echo "  Avg consensus latency: ${CONSENSUS_AVG}ms (${CONSENSUS_SUCCESS}/${CONSENSUS_COUNT} succeeded)" | tee -a "${REPORT}"
      else
        echo "  All iterations failed" | tee -a "${REPORT}"
      fi
    else
      echo "  SKIPPED: No validator key found for tx broadcast" | tee -a "${REPORT}"
    fi
  else
    echo "  SKIPPED: clawchaind binary not found" | tee -a "${REPORT}"
  fi
else
  echo "  SKIPPED: No running testnet at ${RPC}" | tee -a "${REPORT}"
fi

echo "" | tee -a "${REPORT}"

# =========================================================================
# Summary
# =========================================================================
echo "============================================" | tee -a "${REPORT}"
echo "  Benchmark Summary" | tee -a "${REPORT}"
echo "============================================" | tee -a "${REPORT}"

if [ -n "${CLAWPROOF}" ]; then
  echo "  ZK trusted setup:    ${SETUP_MS}ms" | tee -a "${REPORT}"
  echo "  Commitment gen:      ${COMMIT_AVG}ms avg" | tee -a "${REPORT}"
  echo "  Nullifier gen:       ${NULL_AVG}ms avg" | tee -a "${REPORT}"
  echo "  Shield data gen:     ${SHIELD_AVG}ms avg" | tee -a "${REPORT}"
fi
echo "  Binary build:        ${BUILD_MS}ms" | tee -a "${REPORT}"
if [ -n "${BLOCK_TIME:-}" ] && [ "${BLOCK_TIME}" != "N/A" ]; then
  echo "  Block time:          ${BLOCK_TIME}s" | tee -a "${REPORT}"
  echo "  Blocks/min:          ${BLOCKS_PER_MIN}" | tee -a "${REPORT}"
  echo "  Avg query latency:   ${QAVG:-N/A}ms" | tee -a "${REPORT}"
fi
if [ "${CONSENSUS_AVG}" != "N/A" ]; then
  echo "  Consensus latency:   ${CONSENSUS_AVG}ms avg" | tee -a "${REPORT}"
fi
echo "" | tee -a "${REPORT}"

# =========================================================================
# Threshold Comparison Table
# =========================================================================
echo "============================================" | tee -a "${REPORT}"
echo "  Threshold Comparison" | tee -a "${REPORT}"
echo "============================================" | tee -a "${REPORT}"
printf "  %-25s %-12s %-10s %-6s\n" "Metric" "Value" "Threshold" "Result" | tee -a "${REPORT}"
printf "  %-25s %-12s %-10s %-6s\n" "-------------------------" "------------" "----------" "------" | tee -a "${REPORT}"

# Block time < 6s
if [ -n "${BLOCK_TIME:-}" ] && [ "${BLOCK_TIME}" != "N/A" ]; then
  BT_PASS=$(echo "${BLOCK_TIME} < 6" | bc 2>/dev/null || echo "0")
  BT_RESULT="FAIL"
  [ "${BT_PASS}" = "1" ] && BT_RESULT="PASS"
  printf "  %-25s %-12s %-10s %-6s\n" "Block time" "${BLOCK_TIME}s" "<6s" "${BT_RESULT}" | tee -a "${REPORT}"
else
  printf "  %-25s %-12s %-10s %-6s\n" "Block time" "N/A" "<6s" "SKIP" | tee -a "${REPORT}"
fi

# Query latency < 200ms
if [ -n "${QAVG:-}" ] && [ "${QAVG}" != "N/A" ]; then
  QL_RESULT="FAIL"
  [ "${QAVG}" -lt 200 ] && QL_RESULT="PASS"
  printf "  %-25s %-12s %-10s %-6s\n" "Avg query latency" "${QAVG}ms" "<200ms" "${QL_RESULT}" | tee -a "${REPORT}"
else
  printf "  %-25s %-12s %-10s %-6s\n" "Avg query latency" "N/A" "<200ms" "SKIP" | tee -a "${REPORT}"
fi

# Proof generation < 5000ms (5s)
if [ -n "${CLAWPROOF}" ]; then
  PG_RESULT="FAIL"
  [ "${SHIELD_AVG}" -lt 5000 ] && PG_RESULT="PASS"
  printf "  %-25s %-12s %-10s %-6s\n" "Proof generation" "${SHIELD_AVG}ms" "<5000ms" "${PG_RESULT}" | tee -a "${REPORT}"
else
  printf "  %-25s %-12s %-10s %-6s\n" "Proof generation" "N/A" "<5000ms" "SKIP" | tee -a "${REPORT}"
fi

echo "" | tee -a "${REPORT}"
echo "  Full report: ${REPORT}" | tee -a "${REPORT}"
echo "" | tee -a "${REPORT}"

# =========================================================================
# JSON Output (optional)
# =========================================================================
if [ "${JSON_OUTPUT}" = true ]; then
  JSON_REPORT="${RESULTS_DIR}/benchmark-${TIMESTAMP}.json"
  cat > "${JSON_REPORT}" <<ENDJSON
{
  "timestamp": "${TIMESTAMP}",
  "host": "$(hostname)",
  "os": "$(uname -s) $(uname -r)",
  "arch": "$(uname -m)",
  "benchmarks": {
    "zk_proof": {
      "setup_ms": ${SETUP_MS:-0},
      "commitment_avg_ms": ${COMMIT_AVG:-0},
      "nullifier_avg_ms": ${NULL_AVG:-0},
      "shield_avg_ms": ${SHIELD_AVG:-0}
    },
    "build": {
      "clawchaind_ms": ${BUILD_MS}
    },
    "throughput": {
      "block_time_s": "${BLOCK_TIME:-N/A}",
      "blocks_per_min": "${BLOCKS_PER_MIN:-N/A}",
      "avg_query_latency_ms": ${QAVG:-0}
    },
    "consensus_latency": {
      "avg_ms": ${CONSENSUS_AVG:-0},
      "success_count": ${CONSENSUS_SUCCESS:-0},
      "total_count": ${CONSENSUS_COUNT:-0}
    }
  },
  "thresholds": {
    "block_time_under_6s": $([ -n "${BLOCK_TIME:-}" ] && [ "${BLOCK_TIME}" != "N/A" ] && [ "$(echo "${BLOCK_TIME} < 6" | bc 2>/dev/null)" = "1" ] && echo "true" || echo "false"),
    "query_latency_under_200ms": $([ -n "${QAVG:-}" ] && [ "${QAVG}" != "N/A" ] && [ "${QAVG}" -lt 200 ] 2>/dev/null && echo "true" || echo "false"),
    "proof_gen_under_5s": $([ -n "${SHIELD_AVG:-}" ] && [ "${SHIELD_AVG}" -lt 5000 ] 2>/dev/null && echo "true" || echo "false")
  }
}
ENDJSON
  echo "JSON report: ${JSON_REPORT}" | tee -a "${REPORT}"
fi

# Cleanup
rm -rf "${TMPDIR}"
