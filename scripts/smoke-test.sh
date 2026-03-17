#!/usr/bin/env bash
#
# smoke-test.sh - Docker Compose full-stack smoke test for ClawChain.
#
# Boots all 12 services, waits for healthy state, runs connectivity
# and functional checks, then tears down (unless --keep).
#
# Usage:
#   bash scripts/smoke-test.sh
#   bash scripts/smoke-test.sh --json
#   bash scripts/smoke-test.sh --keep
#   bash scripts/smoke-test.sh --timeout 300
#
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Defaults ──────────────────────────────────────────────────────────
JSON_MODE=false
KEEP_SERVICES=false
MAX_TIMEOUT=300          # seconds
COMPOSE_FILE=""
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Parse arguments ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)    JSON_MODE=true; shift ;;
    --keep)    KEEP_SERVICES=true; shift ;;
    --timeout)
      shift
      if [[ $# -eq 0 ]] || ! [[ "$1" =~ ^[0-9]+$ ]]; then
        echo "Error: --timeout requires a numeric value in seconds" >&2
        exit 1
      fi
      MAX_TIMEOUT="$1"; shift ;;
    -f)
      shift
      COMPOSE_FILE="$1"; shift ;;
    -h|--help)
      echo "Usage: $0 [--json] [--keep] [--timeout <seconds>] [-f <compose-file>]"
      echo ""
      echo "Options:"
      echo "  --json              Machine-readable JSON output"
      echo "  --keep              Do not tear down services after test"
      echo "  --timeout <secs>    Max wait time for all services (default: 300)"
      echo "  -f <file>           Path to docker-compose file"
      exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Resolve compose file
if [[ -n "$COMPOSE_FILE" ]]; then
  COMPOSE_ARGS="-f $COMPOSE_FILE"
else
  COMPOSE_ARGS="-f ${PROJECT_DIR}/docker-compose.yml"
fi

# ── Counters / accumulators ──────────────────────────────────────────
PASS=0
FAIL=0
TOTAL_TESTS=0
declare -a RESULTS=()      # Array of "name|status|latency_ms|detail"

log() {
  $JSON_MODE || echo -e "$@"
}

log_header() {
  log "\n${BOLD}${CYAN}$1${NC}"
}

record() {
  local name="$1" status="$2" latency="$3" detail="${4:-}"
  RESULTS+=("${name}|${status}|${latency}|${detail}")
  ((TOTAL_TESTS++)) || true
  if [[ "$status" == "pass" ]]; then
    ((PASS++)) || true
    log "  ${GREEN}[PASS]${NC}  ${name}  ${DIM}(${latency}ms)${NC}"
  else
    ((FAIL++)) || true
    log "  ${RED}[FAIL]${NC}  ${name}  ${DIM}(${latency}ms)${NC}  ${YELLOW}${detail}${NC}"
  fi
}

# Measure HTTP request: sets REPLY_CODE and REPLY_MS
http_check() {
  local url="$1" timeout="${2:-5}"
  local start_ms end_ms
  start_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  REPLY_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
  end_ms=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  REPLY_MS=$(( end_ms - start_ms ))
}

http_get() {
  local url="$1" timeout="${2:-5}"
  curl -s --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>/dev/null || echo ""
}

# ── Cleanup trap ─────────────────────────────────────────────────────
cleanup() {
  if $KEEP_SERVICES; then
    log "\n${CYAN}--keep specified: services left running.${NC}"
  else
    log "\n${CYAN}Tearing down services...${NC}"
    docker compose ${COMPOSE_ARGS} down --volumes --remove-orphans --timeout 30 2>/dev/null || true
    log "${GREEN}Cleanup complete.${NC}"
  fi
}

trap cleanup EXIT

# ══════════════════════════════════════════════════════════════════════
# Phase 1: Prerequisites
# ══════════════════════════════════════════════════════════════════════
log_header "Phase 1: Checking prerequisites"

if ! command -v docker &>/dev/null; then
  log "  ${RED}[FAIL]${NC}  Docker is not installed or not in PATH."
  exit 1
fi
log "  ${GREEN}[OK]${NC}    Docker found: $(docker --version)"

if ! docker compose version &>/dev/null; then
  log "  ${RED}[FAIL]${NC}  Docker Compose (v2 plugin) is not available."
  exit 1
fi
log "  ${GREEN}[OK]${NC}    Docker Compose found: $(docker compose version --short)"

if ! docker info &>/dev/null; then
  log "  ${RED}[FAIL]${NC}  Docker daemon is not running."
  exit 1
fi
log "  ${GREEN}[OK]${NC}    Docker daemon is running."

# ══════════════════════════════════════════════════════════════════════
# Phase 2: Boot services
# ══════════════════════════════════════════════════════════════════════
log_header "Phase 2: Booting services (docker compose up -d)"

docker compose ${COMPOSE_ARGS} up -d --build 2>&1 | while IFS= read -r line; do
  log "  ${DIM}${line}${NC}"
done

# ══════════════════════════════════════════════════════════════════════
# Phase 3: Wait for services to become healthy
# ══════════════════════════════════════════════════════════════════════
log_header "Phase 3: Waiting for services to become healthy (timeout: ${MAX_TIMEOUT}s)"

# service_name container_name port health_url per_service_timeout
SERVICES=(
  "ClawChain Node|clawchain-node|26657|http://localhost:26657/health|120"
  "Token Faucet|clawchain-faucet|8888|http://localhost:8888/health|60"
  "Event Proxy|clawchain-eventsd|8891|http://localhost:8891/health|60"
  "Notification Service|clawchain-notifyd|8892|http://localhost:8892/health|60"
  "Inference Sidecar|clawchain-inference-sidecar|8090|http://localhost:8090/health|60"
  "Web Dashboard|clawchain-web|3000|http://localhost:3000|90"
  "Block Explorer|clawchain-explorer|8080|http://localhost:8080|90"
  "ClawDEX|clawchain-dex|3001|http://localhost:3001|90"
  "Landing Page|clawchain-landing|8093|http://localhost:8093|60"
  "Documentation|clawchain-docs|8091|http://localhost:8091|60"
  "clawd Agent|clawchain-clawd|-|docker:running|60"
)

GLOBAL_START=$(date +%s)

wait_for_service() {
  local name="$1" container="$2" port="$3" health_url="$4" svc_timeout="$5"
  local deadline=$(( $(date +%s) + svc_timeout ))

  # Cap per-service timeout by global timeout
  local global_deadline=$(( GLOBAL_START + MAX_TIMEOUT ))
  if (( deadline > global_deadline )); then
    deadline=$global_deadline
  fi

  while (( $(date +%s) < deadline )); do
    if [[ "$health_url" == "docker:running" ]]; then
      local state
      state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
      if [[ "$state" == "running" ]]; then
        return 0
      fi
    else
      local code
      code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 --max-time 3 "$health_url" 2>/dev/null || echo "000")
      if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
        return 0
      fi
    fi
    sleep 3
  done
  return 1
}

HEALTHY_COUNT=0
TOTAL_SERVICES=${#SERVICES[@]}

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r svc_name svc_container svc_port svc_health svc_timeout <<< "$entry"
  log -n "  Waiting for ${BOLD}${svc_name}${NC}..."
  start_ts=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  if wait_for_service "$svc_name" "$svc_container" "$svc_port" "$svc_health" "$svc_timeout"; then
    end_ts=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    elapsed=$(( end_ts - start_ts ))
    log "\r  ${GREEN}[READY]${NC} ${svc_name} ${DIM}(${elapsed}ms)${NC}                    "
    ((HEALTHY_COUNT++)) || true
  else
    end_ts=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
    elapsed=$(( end_ts - start_ts ))
    log "\r  ${RED}[TIMEOUT]${NC} ${svc_name} did not become healthy within ${svc_timeout}s   "
  fi
done

log "\n  ${BOLD}${HEALTHY_COUNT}/${TOTAL_SERVICES} services ready.${NC}"

if (( HEALTHY_COUNT < 1 )); then
  log "\n${RED}No services came up. Aborting smoke test.${NC}"
  # Still record summary in JSON mode
  if $JSON_MODE; then
    echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"passed\":0,\"failed\":0,\"aborted\":true,\"reason\":\"no services healthy\",\"services\":[]}"
  fi
  exit 1
fi

# ══════════════════════════════════════════════════════════════════════
# Phase 4: Connectivity checks
# ══════════════════════════════════════════════════════════════════════
log_header "Phase 4: Connectivity checks"

# Chain REST API
http_check "http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Chain REST API" "pass" "$REPLY_MS" ""
else
  record "Chain REST API" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# Chain RPC
http_check "http://localhost:26657/health"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Chain CometBFT RPC" "pass" "$REPLY_MS" ""
else
  record "Chain CometBFT RPC" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# Chain gRPC reflection (simple TCP check)
grpc_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
if curl -s --connect-timeout 3 --max-time 3 http://localhost:9090 &>/dev/null || \
   (echo >/dev/tcp/localhost/9090) 2>/dev/null; then
  grpc_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  record "Chain gRPC port" "pass" "$(( grpc_end - grpc_start ))" ""
else
  grpc_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  record "Chain gRPC port" "fail" "$(( grpc_end - grpc_start ))" "port 9090 not reachable"
fi

# Faucet -> chain (the faucet calls chain REST internally; if faucet is up it connected)
http_check "http://localhost:8888/health"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Faucet health" "pass" "$REPLY_MS" ""
else
  record "Faucet health" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# Event proxy -> chain
http_check "http://localhost:8891/health"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Event proxy health" "pass" "$REPLY_MS" ""
else
  record "Event proxy health" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# Notification service -> chain
http_check "http://localhost:8892/health"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Notification service health" "pass" "$REPLY_MS" ""
else
  record "Notification service health" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# Web -> accessible
http_check "http://localhost:3000"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Web dashboard reachable" "pass" "$REPLY_MS" ""
else
  record "Web dashboard reachable" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# Explorer -> accessible
http_check "http://localhost:8080"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Explorer reachable" "pass" "$REPLY_MS" ""
else
  record "Explorer reachable" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# DEX -> accessible
http_check "http://localhost:3001"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "DEX frontend reachable" "pass" "$REPLY_MS" ""
else
  record "DEX frontend reachable" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# clawd agent container running
clawd_state=$(docker inspect --format='{{.State.Status}}' clawchain-clawd 2>/dev/null || echo "missing")
if [[ "$clawd_state" == "running" ]]; then
  record "clawd agent running" "pass" "0" ""
else
  record "clawd agent running" "fail" "0" "state=$clawd_state"
fi

# ══════════════════════════════════════════════════════════════════════
# Phase 5: Functional tests
# ══════════════════════════════════════════════════════════════════════
log_header "Phase 5: Functional tests"

# -- 5a. Chain produces blocks --
log "  ${DIM}Checking block production...${NC}"
block_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
HEIGHT_1=$(http_get "http://localhost:26657/status" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data['result']['sync_info']['latest_block_height'])
except:
    print('0')
" 2>/dev/null)
HEIGHT_1=${HEIGHT_1:-0}

if (( HEIGHT_1 > 0 )); then
  # Wait up to 15 seconds for a new block
  block_incremented=false
  for i in $(seq 1 5); do
    sleep 3
    HEIGHT_2=$(http_get "http://localhost:26657/status" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data['result']['sync_info']['latest_block_height'])
except:
    print('0')
" 2>/dev/null)
    HEIGHT_2=${HEIGHT_2:-0}
    if (( HEIGHT_2 > HEIGHT_1 )); then
      block_incremented=true
      break
    fi
  done
  block_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  if $block_incremented; then
    record "Block production" "pass" "$(( block_end - block_start ))" "height $HEIGHT_1 -> $HEIGHT_2"
  else
    record "Block production" "fail" "$(( block_end - block_start ))" "height stuck at $HEIGHT_1"
  fi
else
  block_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
  record "Block production" "fail" "$(( block_end - block_start ))" "could not read block height"
fi

# -- 5b. REST API node info --
http_check "http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "REST node_info" "pass" "$REPLY_MS" ""
else
  record "REST node_info" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# -- 5c. Faucet endpoint responds --
http_check "http://localhost:8888/health"
if [[ "$REPLY_CODE" =~ ^2[0-9][0-9]$ ]]; then
  record "Faucet endpoint" "pass" "$REPLY_MS" ""
else
  record "Faucet endpoint" "fail" "$REPLY_MS" "HTTP $REPLY_CODE"
fi

# -- 5d. Web dashboard serves HTML --
web_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
WEB_BODY=$(http_get "http://localhost:3000")
web_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
if echo "$WEB_BODY" | grep -qi "<html"; then
  record "Web serves HTML" "pass" "$(( web_end - web_start ))" ""
else
  record "Web serves HTML" "fail" "$(( web_end - web_start ))" "no <html tag in response"
fi

# -- 5e. Explorer serves HTML --
explorer_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
EXPLORER_BODY=$(http_get "http://localhost:8080")
explorer_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
if echo "$EXPLORER_BODY" | grep -qi "<html"; then
  record "Explorer serves HTML" "pass" "$(( explorer_end - explorer_start ))" ""
else
  record "Explorer serves HTML" "fail" "$(( explorer_end - explorer_start ))" "no <html tag in response"
fi

# -- 5f. DEX frontend serves HTML --
dex_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
DEX_BODY=$(http_get "http://localhost:3001")
dex_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
if echo "$DEX_BODY" | grep -qi "<html"; then
  record "DEX serves HTML" "pass" "$(( dex_end - dex_start ))" ""
else
  record "DEX serves HTML" "fail" "$(( dex_end - dex_start ))" "no <html tag in response"
fi

# -- 5g. Docs site serves HTML --
docs_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
DOCS_BODY=$(http_get "http://localhost:8091")
docs_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
if echo "$DOCS_BODY" | grep -qi "<html"; then
  record "Docs site serves HTML" "pass" "$(( docs_end - docs_start ))" ""
else
  record "Docs site serves HTML" "fail" "$(( docs_end - docs_start ))" "no <html tag in response"
fi

# -- 5h. Landing page serves HTML --
landing_start=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
LANDING_BODY=$(http_get "http://localhost:8093")
landing_end=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
if echo "$LANDING_BODY" | grep -qi "<html"; then
  record "Landing page serves HTML" "pass" "$(( landing_end - landing_start ))" ""
else
  record "Landing page serves HTML" "fail" "$(( landing_end - landing_start ))" "no <html tag in response"
fi

# ══════════════════════════════════════════════════════════════════════
# Phase 6: Summary
# ══════════════════════════════════════════════════════════════════════

TOTAL_ELAPSED=$(( $(date +%s) - GLOBAL_START ))

if $JSON_MODE; then
  # ── JSON output ──
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"duration_seconds\": ${TOTAL_ELAPSED},"
  echo "  \"total\": ${TOTAL_TESTS},"
  echo "  \"passed\": ${PASS},"
  echo "  \"failed\": ${FAIL},"
  echo "  \"services\": ["
  for i in "${!RESULTS[@]}"; do
    IFS='|' read -r r_name r_status r_latency r_detail <<< "${RESULTS[$i]}"
    # Escape quotes in detail
    r_detail="${r_detail//\"/\\\"}"
    comma=","
    if (( i == ${#RESULTS[@]} - 1 )); then comma=""; fi
    echo "    {\"name\":\"${r_name}\",\"status\":\"${r_status}\",\"latency_ms\":${r_latency},\"detail\":\"${r_detail}\"}${comma}"
  done
  echo "  ]"
  echo "}"
else
  # ── Table output ──
  log ""
  log "${BOLD}================================================================${NC}"
  log "${BOLD}  ClawChain Smoke Test Summary${NC}"
  log "${BOLD}================================================================${NC}"
  log ""
  printf "  ${BOLD}%-35s %-8s %10s  %s${NC}\n" "SERVICE" "STATUS" "LATENCY" "DETAIL"
  printf "  %-35s %-8s %10s  %s\n" "-----------------------------------" "--------" "----------" "------"
  for entry in "${RESULTS[@]}"; do
    IFS='|' read -r r_name r_status r_latency r_detail <<< "$entry"
    if [[ "$r_status" == "pass" ]]; then
      status_display="${GREEN}PASS${NC}"
    else
      status_display="${RED}FAIL${NC}"
    fi
    printf "  %-35s ${status_display}%-4s %8s ms  %s\n" "$r_name" "" "$r_latency" "$r_detail"
  done
  log ""
  log "  ────────────────────────────────────────────────────────────"
  log "  Total: ${TOTAL_TESTS}  |  ${GREEN}Passed: ${PASS}${NC}  |  ${RED}Failed: ${FAIL}${NC}  |  Duration: ${TOTAL_ELAPSED}s"
  log "  ────────────────────────────────────────────────────────────"
fi

# ── Exit code ────────────────────────────────────────────────────────
if (( FAIL == 0 )); then
  log "\n${GREEN}All smoke tests passed.${NC}"
  exit 0
else
  log "\n${RED}${FAIL} smoke test(s) failed.${NC}"
  exit 1
fi
