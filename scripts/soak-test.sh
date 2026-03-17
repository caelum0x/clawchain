#!/usr/bin/env bash
#
# soak-test.sh - Extended stability/soak test runner for ClawChain testnet.
#
# Monitors block production, validator health, resource usage, and optionally
# generates transaction load over an extended period. Produces periodic
# summary reports and a final PASS/FAIL verdict.
#
# Requirements:
#   - Running ClawChain node (RPC + REST endpoints)
#   - jq installed
#   - curl installed
#   - clawchaind binary in PATH (only needed with --load)
#
# Usage:
#   bash scripts/soak-test.sh
#   bash scripts/soak-test.sh --duration 2h --interval 30s --load
#   bash scripts/soak-test.sh --duration 30m --json --output /tmp/soak.json
#   bash scripts/soak-test.sh --rpc http://node:26657 --rest http://node:1317
#
set -euo pipefail

# ============================================================================
# Defaults
# ============================================================================
DURATION="1h"
CHECK_INTERVAL="30s"
REPORT_INTERVAL="5m"
RPC_URL="http://localhost:26657"
REST_URL="http://localhost:1317"
CHAIN_ID="clawchain-testnet-1"
DENOM="uclaw"
BINARY="clawchaind"
KEYRING_BACKEND="test"
DATA_DIR="${HOME}/.clawchaind"
LOAD_ENABLED=false
JSON_MODE=false
OUTPUT_FILE=""
EXPECTED_BLOCK_TIME=6  # seconds

# ANSI colors (disabled in JSON mode)
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ============================================================================
# Argument parsing
# ============================================================================
usage() {
  cat <<'USAGE'
Usage: soak-test.sh [OPTIONS]

Options:
  --duration <time>     Test duration (e.g. 30m, 1h, 7d)       [default: 1h]
  --interval <time>     Check interval (e.g. 10s, 30s, 1m)     [default: 30s]
  --report-interval <t> Periodic report interval (e.g. 5m, 1h) [default: 5m]
  --rpc <url>           CometBFT RPC endpoint                   [default: http://localhost:26657]
  --rest <url>          REST/LCD endpoint                        [default: http://localhost:1317]
  --chain-id <id>       Chain ID                                 [default: clawchain-testnet-1]
  --data-dir <path>     Chain data directory for disk monitoring [default: ~/.clawchaind]
  --load                Enable transaction load generation
  --json                Output in machine-readable JSON
  --output <file>       Write final report to file
  -h, --help            Show this help message
USAGE
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration)        DURATION="$2";          shift 2 ;;
    --interval)        CHECK_INTERVAL="$2";    shift 2 ;;
    --report-interval) REPORT_INTERVAL="$2";   shift 2 ;;
    --rpc)             RPC_URL="$2";           shift 2 ;;
    --rest)            REST_URL="$2";          shift 2 ;;
    --chain-id)        CHAIN_ID="$2";          shift 2 ;;
    --data-dir)        DATA_DIR="$2";          shift 2 ;;
    --load)            LOAD_ENABLED=true;      shift   ;;
    --json)            JSON_MODE=true;         shift   ;;
    --output)          OUTPUT_FILE="$2";       shift 2 ;;
    -h|--help)         usage ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

# Disable colors in JSON mode
if $JSON_MODE; then
  GREEN="" RED="" YELLOW="" CYAN="" BOLD="" NC=""
fi

# ============================================================================
# Utility functions
# ============================================================================

# Convert duration string (30s, 5m, 2h, 7d) to seconds.
parse_duration() {
  local input="$1"
  local num="${input%[smhd]*}"
  local unit="${input##*[0-9]}"
  case "$unit" in
    s) echo "$num" ;;
    m) echo $((num * 60)) ;;
    h) echo $((num * 3600)) ;;
    d) echo $((num * 86400)) ;;
    *) echo "$num" ;;  # bare number = seconds
  esac
}

# Portable timestamp in seconds (integer).
now_epoch() {
  date +%s
}

# ISO-8601 UTC timestamp.
now_iso() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

# Format seconds as human-readable duration.
fmt_duration() {
  local secs=$1
  local d=$((secs / 86400))
  local h=$(( (secs % 86400) / 3600 ))
  local m=$(( (secs % 3600) / 60 ))
  local s=$((secs % 60))
  local out=""
  [[ $d -gt 0 ]] && out="${d}d "
  [[ $h -gt 0 ]] && out="${out}${h}h "
  [[ $m -gt 0 ]] && out="${out}${m}m "
  out="${out}${s}s"
  echo "$out"
}

# Safe integer division with fallback.
safe_div() {
  local num=$1 den=$2 scale=${3:-2}
  if [[ "$den" -eq 0 ]]; then
    echo "N/A"
  else
    echo "scale=${scale}; ${num} / ${den}" | bc 2>/dev/null || echo "N/A"
  fi
}

# Log to stderr in non-JSON mode.
log() {
  $JSON_MODE || echo -e "$@" >&2
}

# ============================================================================
# Data collection helpers
# ============================================================================

# Query latest block height and time from RPC.
get_block_info() {
  local resp
  resp=$(curl -s --connect-timeout 5 --max-time 10 "${RPC_URL}/status" 2>/dev/null) || { echo ""; return; }
  local height time
  height=$(echo "$resp" | jq -r '.result.sync_info.latest_block_height // empty' 2>/dev/null)
  time=$(echo "$resp" | jq -r '.result.sync_info.latest_block_time // empty' 2>/dev/null)
  if [[ -n "$height" && -n "$time" ]]; then
    echo "${height}|${time}"
  fi
}

# Query validator set from REST.
get_validators() {
  curl -s --connect-timeout 5 --max-time 10 \
    "${REST_URL}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=200" 2>/dev/null || echo ""
}

# Query all validators (including jailed) from REST.
get_all_validators() {
  curl -s --connect-timeout 5 --max-time 10 \
    "${REST_URL}/cosmos/staking/v1beta1/validators?pagination.limit=200" 2>/dev/null || echo ""
}

# Get process info for clawchaind.
get_process_info() {
  # Try to find the chain daemon process
  local pid
  pid=$(pgrep -x clawchaind 2>/dev/null | head -1) || true
  if [[ -z "$pid" ]]; then
    echo ""
    return
  fi

  local rss_kb cpu
  if [[ "$(uname)" == "Darwin" ]]; then
    rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ') || rss_kb=0
    cpu=$(ps -o %cpu= -p "$pid" 2>/dev/null | tr -d ' ') || cpu="0.0"
  else
    rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ') || rss_kb=0
    cpu=$(ps -o %cpu= -p "$pid" 2>/dev/null | tr -d ' ') || cpu="0.0"
  fi

  local rss_mb=$(( rss_kb / 1024 ))
  echo "${pid}|${rss_mb}|${cpu}"
}

# Get disk usage of data directory in MB.
get_disk_usage_mb() {
  if [[ -d "$DATA_DIR" ]]; then
    du -sm "$DATA_DIR" 2>/dev/null | awk '{print $1}' || echo "0"
  else
    echo "0"
  fi
}

# Send a bank send transaction (for load generation).
send_load_tx() {
  local from_key="$1"
  local to_addr="$2"
  local amount="$3"
  local result
  result=$(${BINARY} tx bank send "$from_key" "$to_addr" "${amount}${DENOM}" \
    --chain-id "$CHAIN_ID" --keyring-backend "$KEYRING_BACKEND" \
    --fees "500${DENOM}" --yes --broadcast-mode sync \
    --node "$RPC_URL" 2>&1) || true

  if echo "$result" | grep -q "txhash"; then
    echo "ok"
  else
    echo "fail"
  fi
}

# ============================================================================
# Converted durations
# ============================================================================
DURATION_SECS=$(parse_duration "$DURATION")
INTERVAL_SECS=$(parse_duration "$CHECK_INTERVAL")
REPORT_INTERVAL_SECS=$(parse_duration "$REPORT_INTERVAL")

# ============================================================================
# State tracking arrays / counters
# ============================================================================
declare -a BLOCK_HEIGHTS=()
declare -a BLOCK_TIMES_SEC=()
declare -a BLOCK_TIMESTAMPS=()
MISSED_BLOCKS=0
TOTAL_CHECKS=0
FAILED_CHECKS=0
TX_SENT=0
TX_SUCCESS=0
TX_FAIL=0

# Resource tracking
START_RSS_MB=0
START_DISK_MB=0
CURRENT_RSS_MB=0
CURRENT_CPU="0.0"
CURRENT_DISK_MB=0
PEAK_RSS_MB=0

# Validator tracking
INITIAL_ACTIVE_VALIDATORS=0
JAILED_EVENTS=0
CURRENT_ACTIVE_VALIDATORS=0
CURRENT_JAILED_VALIDATORS=0

# Block time stats
MIN_BLOCK_TIME=999999
MAX_BLOCK_TIME=0
SUM_BLOCK_TIME=0
BLOCK_TIME_COUNT=0

PREV_HEIGHT=0
PREV_BLOCK_EPOCH=0

# Periodic report counters
LAST_REPORT_EPOCH=0
PERIOD_BLOCKS=0
PERIOD_TX_SENT=0
PERIOD_TX_SUCCESS=0
REPORT_NUMBER=0

# ============================================================================
# Preflight checks
# ============================================================================
log ""
log "${BOLD}=========================================${NC}"
log "${BOLD}  ClawChain Soak Test${NC}"
log "${BOLD}=========================================${NC}"
log ""
log "  Duration:         ${DURATION} (${DURATION_SECS}s)"
log "  Check interval:   ${CHECK_INTERVAL} (${INTERVAL_SECS}s)"
log "  Report interval:  ${REPORT_INTERVAL} (${REPORT_INTERVAL_SECS}s)"
log "  RPC:              ${RPC_URL}"
log "  REST:             ${REST_URL}"
log "  Load generation:  ${LOAD_ENABLED}"
log "  JSON output:      ${JSON_MODE}"
[[ -n "$OUTPUT_FILE" ]] && log "  Output file:      ${OUTPUT_FILE}"
log ""

# Verify connectivity
log "Preflight checks..."

BLOCK_INFO=$(get_block_info)
if [[ -z "$BLOCK_INFO" ]]; then
  log "${RED}FATAL: Cannot reach RPC at ${RPC_URL}${NC}"
  exit 1
fi

INIT_HEIGHT="${BLOCK_INFO%%|*}"
log "  ${GREEN}[OK]${NC} RPC reachable, height: ${INIT_HEIGHT}"

REST_CHECK=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "${REST_URL}/cosmos/base/tendermint/v1beta1/blocks/latest" 2>/dev/null || echo "000")
if [[ "$REST_CHECK" =~ ^2[0-9][0-9]$ ]]; then
  log "  ${GREEN}[OK]${NC} REST API reachable"
else
  log "  ${YELLOW}[WARN]${NC} REST API unreachable (HTTP ${REST_CHECK}); validator checks will be limited"
fi

# Check jq
if ! command -v jq &>/dev/null; then
  log "${RED}FATAL: jq is required but not found${NC}"
  exit 1
fi
log "  ${GREEN}[OK]${NC} jq available"

# Check bc (used for float math)
if ! command -v bc &>/dev/null; then
  log "  ${YELLOW}[WARN]${NC} bc not found; some stats will show N/A"
fi

# Load generation preflight
if $LOAD_ENABLED; then
  if ! command -v "$BINARY" &>/dev/null; then
    log "  ${YELLOW}[WARN]${NC} ${BINARY} not found; disabling load generation"
    LOAD_ENABLED=false
  else
    log "  ${GREEN}[OK]${NC} ${BINARY} available for load generation"
  fi
fi

# Capture initial resource baseline
PROC_INFO=$(get_process_info)
if [[ -n "$PROC_INFO" ]]; then
  START_RSS_MB=$(echo "$PROC_INFO" | cut -d'|' -f2)
  PEAK_RSS_MB=$START_RSS_MB
  log "  ${GREEN}[OK]${NC} Process found, initial RSS: ${START_RSS_MB} MB"
else
  log "  ${YELLOW}[WARN]${NC} clawchaind process not found locally; resource monitoring limited"
fi

START_DISK_MB=$(get_disk_usage_mb)
if [[ "$START_DISK_MB" -gt 0 ]]; then
  log "  ${GREEN}[OK]${NC} Data directory: ${DATA_DIR} (${START_DISK_MB} MB)"
fi

# Initial validator state
VAL_RESP=$(get_all_validators)
if [[ -n "$VAL_RESP" ]]; then
  INITIAL_ACTIVE_VALIDATORS=$(echo "$VAL_RESP" | jq '[.validators[]? | select(.status == "BOND_STATUS_BONDED")] | length' 2>/dev/null || echo "0")
  CURRENT_ACTIVE_VALIDATORS=$INITIAL_ACTIVE_VALIDATORS
  CURRENT_JAILED_VALIDATORS=$(echo "$VAL_RESP" | jq '[.validators[]? | select(.jailed == true)] | length' 2>/dev/null || echo "0")
  log "  ${GREEN}[OK]${NC} Validators: ${INITIAL_ACTIVE_VALIDATORS} active, ${CURRENT_JAILED_VALIDATORS} jailed"
fi

log ""
log "${BOLD}Starting soak test at $(now_iso)${NC}"
log ""

# ============================================================================
# Main soak loop
# ============================================================================
START_EPOCH=$(now_epoch)
END_EPOCH=$((START_EPOCH + DURATION_SECS))
LAST_REPORT_EPOCH=$START_EPOCH
PREV_HEIGHT=$INIT_HEIGHT
PREV_BLOCK_EPOCH=$START_EPOCH

# Load generation state
LOAD_FROM_KEY=""
LOAD_TO_ADDR=""
if $LOAD_ENABLED; then
  # Try to get the first key in the keyring for load generation
  LOAD_FROM_KEY=$(${BINARY} keys list --keyring-backend "$KEYRING_BACKEND" --output json 2>/dev/null \
    | jq -r '.[0].name // empty' 2>/dev/null) || true
  if [[ -n "$LOAD_FROM_KEY" ]]; then
    LOAD_TO_ADDR=$(${BINARY} keys show "$LOAD_FROM_KEY" -a --keyring-backend "$KEYRING_BACKEND" 2>/dev/null) || true
  fi
  if [[ -z "$LOAD_FROM_KEY" || -z "$LOAD_TO_ADDR" ]]; then
    log "${YELLOW}[WARN]${NC} No keys found in keyring; disabling load generation"
    LOAD_ENABLED=false
  fi
fi

while true; do
  CURRENT_EPOCH=$(now_epoch)

  # Check if duration exceeded
  if [[ $CURRENT_EPOCH -ge $END_EPOCH ]]; then
    break
  fi

  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

  # ------------------------------------------------------------------
  # Block production check
  # ------------------------------------------------------------------
  BLOCK_INFO=$(get_block_info)
  if [[ -z "$BLOCK_INFO" ]]; then
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    log "  ${RED}[$(now_iso)]${NC} RPC unreachable"
    sleep "$INTERVAL_SECS"
    continue
  fi

  CURRENT_HEIGHT="${BLOCK_INFO%%|*}"
  BLOCK_HEIGHTS+=("$CURRENT_HEIGHT")
  BLOCK_TIMESTAMPS+=("$CURRENT_EPOCH")

  if [[ $PREV_HEIGHT -gt 0 && "$CURRENT_HEIGHT" -gt "$PREV_HEIGHT" ]]; then
    HEIGHT_DIFF=$((CURRENT_HEIGHT - PREV_HEIGHT))
    TIME_DIFF=$((CURRENT_EPOCH - PREV_BLOCK_EPOCH))

    if [[ $TIME_DIFF -gt 0 && $HEIGHT_DIFF -gt 0 ]]; then
      # Average block time for this interval
      INTERVAL_BT=$(echo "scale=2; ${TIME_DIFF} / ${HEIGHT_DIFF}" | bc 2>/dev/null || echo "0")
      INTERVAL_BT_INT=${INTERVAL_BT%.*}
      [[ -z "$INTERVAL_BT_INT" ]] && INTERVAL_BT_INT=0

      BLOCK_TIMES_SEC+=("$INTERVAL_BT")
      SUM_BLOCK_TIME=$((SUM_BLOCK_TIME + TIME_DIFF))
      BLOCK_TIME_COUNT=$((BLOCK_TIME_COUNT + HEIGHT_DIFF))

      # Min/max tracking (integer seconds for simplicity)
      if [[ $INTERVAL_BT_INT -lt $MIN_BLOCK_TIME && $INTERVAL_BT_INT -gt 0 ]]; then
        MIN_BLOCK_TIME=$INTERVAL_BT_INT
      fi
      if [[ $INTERVAL_BT_INT -gt $MAX_BLOCK_TIME ]]; then
        MAX_BLOCK_TIME=$INTERVAL_BT_INT
      fi

      # Detect missed blocks: gap > expected * 3
      MISSED_THRESHOLD=$((EXPECTED_BLOCK_TIME * 3))
      if [[ $INTERVAL_BT_INT -gt $MISSED_THRESHOLD ]]; then
        GAP_BLOCKS=$(( (INTERVAL_BT_INT / EXPECTED_BLOCK_TIME) - 1 ))
        MISSED_BLOCKS=$((MISSED_BLOCKS + GAP_BLOCKS))
        log "  ${YELLOW}[$(now_iso)]${NC} Possible missed blocks: gap=${INTERVAL_BT}s (${GAP_BLOCKS} missed) at height ${CURRENT_HEIGHT}"
      fi
    fi

    PERIOD_BLOCKS=$((PERIOD_BLOCKS + HEIGHT_DIFF))
    PREV_BLOCK_EPOCH=$CURRENT_EPOCH
  elif [[ "$CURRENT_HEIGHT" -eq "$PREV_HEIGHT" ]]; then
    # No new block since last check — not necessarily a miss, just stalled momentarily
    :
  fi

  PREV_HEIGHT=$CURRENT_HEIGHT

  # ------------------------------------------------------------------
  # Validator health check
  # ------------------------------------------------------------------
  VAL_RESP=$(get_all_validators)
  if [[ -n "$VAL_RESP" ]]; then
    NEW_ACTIVE=$(echo "$VAL_RESP" | jq '[.validators[]? | select(.status == "BOND_STATUS_BONDED")] | length' 2>/dev/null || echo "0")
    NEW_JAILED=$(echo "$VAL_RESP" | jq '[.validators[]? | select(.jailed == true)] | length' 2>/dev/null || echo "0")

    if [[ "$NEW_JAILED" -gt "$CURRENT_JAILED_VALIDATORS" ]]; then
      JAILED_DIFF=$((NEW_JAILED - CURRENT_JAILED_VALIDATORS))
      JAILED_EVENTS=$((JAILED_EVENTS + JAILED_DIFF))
      log "  ${RED}[$(now_iso)]${NC} New jailing event! ${JAILED_DIFF} validator(s) jailed (total: ${NEW_JAILED})"
    fi

    CURRENT_ACTIVE_VALIDATORS=$NEW_ACTIVE
    CURRENT_JAILED_VALIDATORS=$NEW_JAILED
  fi

  # ------------------------------------------------------------------
  # Resource monitoring (local process)
  # ------------------------------------------------------------------
  PROC_INFO=$(get_process_info)
  if [[ -n "$PROC_INFO" ]]; then
    CURRENT_RSS_MB=$(echo "$PROC_INFO" | cut -d'|' -f2)
    CURRENT_CPU=$(echo "$PROC_INFO" | cut -d'|' -f3)
    if [[ $CURRENT_RSS_MB -gt $PEAK_RSS_MB ]]; then
      PEAK_RSS_MB=$CURRENT_RSS_MB
    fi
  fi

  CURRENT_DISK_MB=$(get_disk_usage_mb)

  # ------------------------------------------------------------------
  # Transaction load generation
  # ------------------------------------------------------------------
  if $LOAD_ENABLED; then
    TX_RESULT=$(send_load_tx "$LOAD_FROM_KEY" "$LOAD_TO_ADDR" "1")
    TX_SENT=$((TX_SENT + 1))
    PERIOD_TX_SENT=$((PERIOD_TX_SENT + 1))
    if [[ "$TX_RESULT" == "ok" ]]; then
      TX_SUCCESS=$((TX_SUCCESS + 1))
      PERIOD_TX_SUCCESS=$((PERIOD_TX_SUCCESS + 1))
    else
      TX_FAIL=$((TX_FAIL + 1))
    fi
  fi

  # ------------------------------------------------------------------
  # Periodic report
  # ------------------------------------------------------------------
  ELAPSED_SINCE_REPORT=$((CURRENT_EPOCH - LAST_REPORT_EPOCH))
  if [[ $ELAPSED_SINCE_REPORT -ge $REPORT_INTERVAL_SECS ]]; then
    REPORT_NUMBER=$((REPORT_NUMBER + 1))
    ELAPSED_TOTAL=$((CURRENT_EPOCH - START_EPOCH))
    TOTAL_BLOCKS=$((CURRENT_HEIGHT - INIT_HEIGHT))
    AVG_BT="N/A"
    if [[ $BLOCK_TIME_COUNT -gt 0 ]]; then
      AVG_BT=$(safe_div $SUM_BLOCK_TIME $BLOCK_TIME_COUNT 2)
    fi
    BLOCKS_PER_MIN="N/A"
    if [[ $ELAPSED_TOTAL -gt 0 ]]; then
      BLOCKS_PER_MIN=$(safe_div $((TOTAL_BLOCKS * 60)) $ELAPSED_TOTAL 1)
    fi

    log ""
    log "${CYAN}--- Periodic Report #${REPORT_NUMBER} [$(now_iso)] ---${NC}"
    log "  Uptime:            $(fmt_duration $ELAPSED_TOTAL) / $(fmt_duration $DURATION_SECS)"
    log "  Height:            ${CURRENT_HEIGHT} (+${TOTAL_BLOCKS} since start)"
    log "  Period blocks:     ${PERIOD_BLOCKS}"
    log "  Avg block time:    ${AVG_BT}s"
    log "  Blocks/min:        ${BLOCKS_PER_MIN}"
    log "  Missed blocks:     ${MISSED_BLOCKS}"
    log "  Validators:        ${CURRENT_ACTIVE_VALIDATORS} active, ${CURRENT_JAILED_VALIDATORS} jailed"
    if $LOAD_ENABLED; then
      log "  Txs (period):      ${PERIOD_TX_SENT} sent, ${PERIOD_TX_SUCCESS} ok"
      log "  Txs (total):       ${TX_SENT} sent, ${TX_SUCCESS} ok, ${TX_FAIL} fail"
    fi
    if [[ $CURRENT_RSS_MB -gt 0 ]]; then
      log "  Memory (RSS):      ${CURRENT_RSS_MB} MB (peak: ${PEAK_RSS_MB} MB, start: ${START_RSS_MB} MB)"
      log "  CPU:               ${CURRENT_CPU}%"
    fi
    if [[ $CURRENT_DISK_MB -gt 0 ]]; then
      DISK_GROWTH=$((CURRENT_DISK_MB - START_DISK_MB))
      log "  Disk:              ${CURRENT_DISK_MB} MB (+${DISK_GROWTH} MB)"
    fi
    log "  Failed checks:     ${FAILED_CHECKS}/${TOTAL_CHECKS}"
    log ""

    # Reset period counters
    LAST_REPORT_EPOCH=$CURRENT_EPOCH
    PERIOD_BLOCKS=0
    PERIOD_TX_SENT=0
    PERIOD_TX_SUCCESS=0
  fi

  sleep "$INTERVAL_SECS"
done

# ============================================================================
# Final data collection
# ============================================================================
FINAL_EPOCH=$(now_epoch)
FINAL_ELAPSED=$((FINAL_EPOCH - START_EPOCH))
FINAL_BLOCK_INFO=$(get_block_info)
FINAL_HEIGHT=0
if [[ -n "$FINAL_BLOCK_INFO" ]]; then
  FINAL_HEIGHT="${FINAL_BLOCK_INFO%%|*}"
fi

TOTAL_BLOCKS=$((FINAL_HEIGHT - INIT_HEIGHT))

# Average block time
AVG_BLOCK_TIME="N/A"
AVG_BLOCK_TIME_NUM=0
if [[ $BLOCK_TIME_COUNT -gt 0 ]]; then
  AVG_BLOCK_TIME=$(safe_div $SUM_BLOCK_TIME $BLOCK_TIME_COUNT 2)
  AVG_BLOCK_TIME_NUM=$(echo "$SUM_BLOCK_TIME / $BLOCK_TIME_COUNT" | bc 2>/dev/null || echo "0")
fi

# Min/max block time fixup
[[ $MIN_BLOCK_TIME -eq 999999 ]] && MIN_BLOCK_TIME=0

# Blocks per minute
BLOCKS_PER_MIN="N/A"
if [[ $FINAL_ELAPSED -gt 0 ]]; then
  BLOCKS_PER_MIN=$(safe_div $((TOTAL_BLOCKS * 60)) $FINAL_ELAPSED 1)
fi

# Missed block percentage
MISSED_PCT="0.0"
if [[ $TOTAL_BLOCKS -gt 0 ]]; then
  MISSED_PCT=$(safe_div $((MISSED_BLOCKS * 100)) $TOTAL_BLOCKS 1)
fi

# Tx success rate
TX_SUCCESS_RATE="N/A"
if [[ $TX_SENT -gt 0 ]]; then
  TX_SUCCESS_RATE=$(safe_div $((TX_SUCCESS * 100)) $TX_SENT 1)
fi

# Resource delta
FINAL_PROC_INFO=$(get_process_info)
FINAL_RSS_MB=0
FINAL_CPU="0.0"
if [[ -n "$FINAL_PROC_INFO" ]]; then
  FINAL_RSS_MB=$(echo "$FINAL_PROC_INFO" | cut -d'|' -f2)
  FINAL_CPU=$(echo "$FINAL_PROC_INFO" | cut -d'|' -f3)
fi
FINAL_DISK_MB=$(get_disk_usage_mb)
DISK_GROWTH=$((FINAL_DISK_MB - START_DISK_MB))
RSS_GROWTH=$((FINAL_RSS_MB - START_RSS_MB))

# Final validator state
FINAL_VAL_RESP=$(get_all_validators)
FINAL_ACTIVE=0
FINAL_JAILED=0
if [[ -n "$FINAL_VAL_RESP" ]]; then
  FINAL_ACTIVE=$(echo "$FINAL_VAL_RESP" | jq '[.validators[]? | select(.status == "BOND_STATUS_BONDED")] | length' 2>/dev/null || echo "0")
  FINAL_JAILED=$(echo "$FINAL_VAL_RESP" | jq '[.validators[]? | select(.jailed == true)] | length' 2>/dev/null || echo "0")
fi

# ============================================================================
# Pass / Fail verdict
# ============================================================================
VERDICT="PASS"
declare -a FAILURES=()

# Criterion 1: Average block time < 10s
if [[ $AVG_BLOCK_TIME_NUM -gt 10 ]]; then
  VERDICT="FAIL"
  FAILURES+=("avg_block_time: ${AVG_BLOCK_TIME}s > 10s threshold")
fi

# Criterion 2: Missed blocks < 1%
MISSED_PCT_INT=$(echo "$MISSED_PCT" | cut -d'.' -f1)
[[ -z "$MISSED_PCT_INT" ]] && MISSED_PCT_INT=0
if [[ $MISSED_PCT_INT -ge 1 ]]; then
  VERDICT="FAIL"
  FAILURES+=("missed_blocks: ${MISSED_PCT}% >= 1% threshold")
fi

# Criterion 3: No validators jailed during test
if [[ $JAILED_EVENTS -gt 0 ]]; then
  VERDICT="FAIL"
  FAILURES+=("jailed_validators: ${JAILED_EVENTS} jailing event(s) during test")
fi

# Criterion 4: Tx success rate > 99% (only if load was enabled)
if $LOAD_ENABLED && [[ $TX_SENT -gt 0 ]]; then
  TX_RATE_INT=$(echo "$TX_SUCCESS_RATE" | cut -d'.' -f1)
  [[ -z "$TX_RATE_INT" ]] && TX_RATE_INT=0
  if [[ $TX_RATE_INT -lt 99 ]]; then
    VERDICT="FAIL"
    FAILURES+=("tx_success_rate: ${TX_SUCCESS_RATE}% < 99% threshold")
  fi
fi

# Criterion 5: Chain must have produced blocks
if [[ $TOTAL_BLOCKS -le 0 ]]; then
  VERDICT="FAIL"
  FAILURES+=("no_blocks_produced: chain appears stalled")
fi

# Criterion 6: Check failures < 5% of total checks
if [[ $TOTAL_CHECKS -gt 0 ]]; then
  FAIL_PCT_NUM=$((FAILED_CHECKS * 100 / TOTAL_CHECKS))
  if [[ $FAIL_PCT_NUM -ge 5 ]]; then
    VERDICT="FAIL"
    FAILURES+=("check_failures: ${FAILED_CHECKS}/${TOTAL_CHECKS} (${FAIL_PCT_NUM}%) >= 5% threshold")
  fi
fi

# ============================================================================
# Final report
# ============================================================================

if $JSON_MODE; then
  # Build JSON failures array
  JSON_FAILURES="[]"
  if [[ ${#FAILURES[@]} -gt 0 ]]; then
    JSON_FAILURES="["
    for i in "${!FAILURES[@]}"; do
      JSON_FAILURES+="\"${FAILURES[$i]}\""
      [[ $i -lt $((${#FAILURES[@]} - 1)) ]] && JSON_FAILURES+=","
    done
    JSON_FAILURES+="]"
  fi

  REPORT_JSON=$(cat <<ENDJSON
{
  "test": "clawchain-soak-test",
  "timestamp": "$(now_iso)",
  "verdict": "${VERDICT}",
  "config": {
    "duration": "${DURATION}",
    "duration_seconds": ${DURATION_SECS},
    "check_interval": "${CHECK_INTERVAL}",
    "rpc_url": "${RPC_URL}",
    "rest_url": "${REST_URL}",
    "load_enabled": ${LOAD_ENABLED}
  },
  "blocks": {
    "start_height": ${INIT_HEIGHT},
    "end_height": ${FINAL_HEIGHT},
    "total_produced": ${TOTAL_BLOCKS},
    "blocks_per_minute": "${BLOCKS_PER_MIN}",
    "avg_block_time_seconds": "${AVG_BLOCK_TIME}",
    "min_block_time_seconds": ${MIN_BLOCK_TIME},
    "max_block_time_seconds": ${MAX_BLOCK_TIME},
    "missed_blocks": ${MISSED_BLOCKS},
    "missed_blocks_percent": "${MISSED_PCT}"
  },
  "transactions": {
    "sent": ${TX_SENT},
    "success": ${TX_SUCCESS},
    "failed": ${TX_FAIL},
    "success_rate_percent": "${TX_SUCCESS_RATE}"
  },
  "validators": {
    "initial_active": ${INITIAL_ACTIVE_VALIDATORS},
    "final_active": ${FINAL_ACTIVE},
    "final_jailed": ${FINAL_JAILED},
    "jailing_events_during_test": ${JAILED_EVENTS}
  },
  "resources": {
    "memory_start_mb": ${START_RSS_MB},
    "memory_end_mb": ${FINAL_RSS_MB},
    "memory_peak_mb": ${PEAK_RSS_MB},
    "memory_growth_mb": ${RSS_GROWTH},
    "disk_start_mb": ${START_DISK_MB},
    "disk_end_mb": ${FINAL_DISK_MB},
    "disk_growth_mb": ${DISK_GROWTH}
  },
  "health": {
    "total_checks": ${TOTAL_CHECKS},
    "failed_checks": ${FAILED_CHECKS}
  },
  "elapsed_seconds": ${FINAL_ELAPSED},
  "failures": ${JSON_FAILURES}
}
ENDJSON
)

  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$REPORT_JSON" > "$OUTPUT_FILE"
    log "Report written to ${OUTPUT_FILE}"
  fi

  echo "$REPORT_JSON"

else
  # Human-readable report
  REPORT_TEXT=""
  append() { REPORT_TEXT+="$1"$'\n'; }

  append ""
  append "============================================"
  append "  ClawChain Soak Test - Final Report"
  append "============================================"
  append ""
  append "  Start:             $(date -r $START_EPOCH '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d @$START_EPOCH '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$START_EPOCH")"
  append "  End:               $(date -r $FINAL_EPOCH '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d @$FINAL_EPOCH '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "$FINAL_EPOCH")"
  append "  Duration:          $(fmt_duration $FINAL_ELAPSED)"
  append ""
  append "  --- Block Production ---"
  append "  Start height:      ${INIT_HEIGHT}"
  append "  End height:        ${FINAL_HEIGHT}"
  append "  Total blocks:      ${TOTAL_BLOCKS}"
  append "  Blocks/min:        ${BLOCKS_PER_MIN}"
  append "  Avg block time:    ${AVG_BLOCK_TIME}s"
  append "  Min block time:    ${MIN_BLOCK_TIME}s"
  append "  Max block time:    ${MAX_BLOCK_TIME}s"
  append "  Missed blocks:     ${MISSED_BLOCKS} (${MISSED_PCT}%)"
  append ""
  append "  --- Transactions ---"
  if $LOAD_ENABLED; then
    append "  Sent:              ${TX_SENT}"
    append "  Success:           ${TX_SUCCESS}"
    append "  Failed:            ${TX_FAIL}"
    append "  Success rate:      ${TX_SUCCESS_RATE}%"
  else
    append "  Load generation:   disabled"
  fi
  append ""
  append "  --- Validators ---"
  append "  Initial active:    ${INITIAL_ACTIVE_VALIDATORS}"
  append "  Final active:      ${FINAL_ACTIVE}"
  append "  Final jailed:      ${FINAL_JAILED}"
  append "  Jailing events:    ${JAILED_EVENTS}"
  append ""
  append "  --- Resources ---"
  if [[ $START_RSS_MB -gt 0 || $FINAL_RSS_MB -gt 0 ]]; then
    append "  Memory (start):    ${START_RSS_MB} MB"
    append "  Memory (end):      ${FINAL_RSS_MB} MB"
    append "  Memory (peak):     ${PEAK_RSS_MB} MB"
    append "  Memory growth:     ${RSS_GROWTH} MB"
  else
    append "  Memory:            not monitored (process not local)"
  fi
  if [[ $START_DISK_MB -gt 0 || $FINAL_DISK_MB -gt 0 ]]; then
    append "  Disk (start):      ${START_DISK_MB} MB"
    append "  Disk (end):        ${FINAL_DISK_MB} MB"
    append "  Disk growth:       ${DISK_GROWTH} MB"
  fi
  append ""
  append "  --- Health ---"
  append "  Total checks:      ${TOTAL_CHECKS}"
  append "  Failed checks:     ${FAILED_CHECKS}"
  append ""
  append "============================================"

  if [[ "$VERDICT" == "PASS" ]]; then
    append "  VERDICT:  PASS"
  else
    append "  VERDICT:  FAIL"
    append ""
    append "  Failure reasons:"
    for f in "${FAILURES[@]}"; do
      append "    - ${f}"
    done
  fi

  append "============================================"
  append ""

  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$REPORT_TEXT" > "$OUTPUT_FILE"
    log "Report written to ${OUTPUT_FILE}"
  fi

  # Print with colors for terminal
  if [[ "$VERDICT" == "PASS" ]]; then
    echo -e "${GREEN}${REPORT_TEXT}${NC}"
  else
    echo -e "${RED}${REPORT_TEXT}${NC}"
  fi
fi

# Exit code reflects verdict
if [[ "$VERDICT" == "PASS" ]]; then
  exit 0
else
  exit 1
fi
