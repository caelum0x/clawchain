#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ClawChain Health Check  --  Phase 13 Track B
#
# Checks:  RPC | gRPC-gateway | REST | block production | validator signing
#          disk space | clawchaind memory
#
# Exit codes:  0 = healthy   1 = degraded   2 = critical
#
# Usage:
#   ./scripts/health-check.sh                       # defaults
#   RPC_URL=http://myhost:26657 ./scripts/health-check.sh
#   QUIET=1 ./scripts/health-check.sh               # JSON only, no stderr
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configurable endpoints ────────────────────────────────────────────────────
RPC_URL="${RPC_URL:-http://localhost:26657}"
GRPC_GATEWAY_URL="${GRPC_GATEWAY_URL:-http://localhost:1317}"
REST_URL="${REST_URL:-http://localhost:1317}"
BINARY="${BINARY:-clawchaind}"
BLOCK_AGE_WARN_SECONDS="${BLOCK_AGE_WARN_SECONDS:-30}"
BLOCK_AGE_CRIT_SECONDS="${BLOCK_AGE_CRIT_SECONDS:-60}"
DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-80}"
DISK_CRIT_PERCENT="${DISK_CRIT_PERCENT:-95}"
MEM_WARN_MB="${MEM_WARN_MB:-4096}"
MEM_CRIT_MB="${MEM_CRIT_MB:-8192}"
MISSED_BLOCKS_WARN="${MISSED_BLOCKS_WARN:-50}"
MISSED_BLOCKS_CRIT="${MISSED_BLOCKS_CRIT:-500}"
CURL_TIMEOUT="${CURL_TIMEOUT:-5}"
QUIET="${QUIET:-0}"
TESTNET_CONTAINER_NAME="${TESTNET_CONTAINER_NAME:-clawchain-node0}"

# ── Helpers ───────────────────────────────────────────────────────────────────
OVERALL_STATUS="healthy"   # healthy | degraded | critical
declare -a CHECKS=()       # JSON fragments collected here

log() { [[ "$QUIET" == "1" ]] || echo >&2 "[health-check] $*"; }

set_status() {
  local new="$1"
  case "$OVERALL_STATUS" in
    critical) ;;  # already worst
    degraded) [[ "$new" == "critical" ]] && OVERALL_STATUS="critical" ;;
    *)        OVERALL_STATUS="$new" ;;
  esac
}

# Append a check result (JSON object) to the CHECKS array.
# Usage: add_check <name> <status> <message> [extra_json_fields]
add_check() {
  local name="$1" status="$2" message="$3" extra="${4:-}"
  local json
  json=$(printf '{"name":"%s","status":"%s","message":"%s"%s}' \
    "$name" "$status" "$message" "${extra:+,$extra}")
  CHECKS+=("$json")
  case "$status" in
    degraded) set_status degraded ;;
    critical) set_status critical ;;
  esac
}

iso_now() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ── 1. RPC health ────────────────────────────────────────────────────────────
check_rpc() {
  log "Checking RPC ($RPC_URL/status) ..."
  local resp
  if ! resp=$(curl -sf --max-time "$CURL_TIMEOUT" "${RPC_URL}/status" 2>/dev/null); then
    add_check "rpc" "critical" "RPC unreachable at ${RPC_URL}"
    return
  fi

  # Detect catching_up
  local catching_up
  catching_up=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['sync_info']['catching_up'])" 2>/dev/null || echo "unknown")

  if [[ "$catching_up" == "True" || "$catching_up" == "true" ]]; then
    add_check "rpc" "degraded" "Node is catching up (syncing)" "\"catching_up\":true"
  elif [[ "$catching_up" == "False" || "$catching_up" == "false" ]]; then
    add_check "rpc" "healthy" "RPC responding, node synced" "\"catching_up\":false"
  else
    add_check "rpc" "degraded" "RPC responded but could not parse catching_up"
  fi
}

# ── 2. gRPC-gateway health ───────────────────────────────────────────────────
check_grpc_gateway() {
  log "Checking gRPC-gateway ($GRPC_GATEWAY_URL) ..."
  local resp http_code
  http_code=$(curl -so /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" \
    "${GRPC_GATEWAY_URL}/cosmos/base/tendermint/v1beta1/syncing" 2>/dev/null || echo "000")

  if [[ "$http_code" == "200" ]]; then
    add_check "grpc_gateway" "healthy" "gRPC-gateway responding (HTTP $http_code)"
  elif [[ "$http_code" == "000" ]]; then
    add_check "grpc_gateway" "critical" "gRPC-gateway unreachable at ${GRPC_GATEWAY_URL}"
  else
    add_check "grpc_gateway" "degraded" "gRPC-gateway returned HTTP $http_code"
  fi
}

# ── 3. REST API health ───────────────────────────────────────────────────────
check_rest() {
  log "Checking REST ($REST_URL/cosmos/base/tendermint/v1beta1/node_info) ..."
  local http_code
  http_code=$(curl -so /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" \
    "${REST_URL}/cosmos/base/tendermint/v1beta1/node_info" 2>/dev/null || echo "000")

  if [[ "$http_code" == "200" ]]; then
    add_check "rest_api" "healthy" "REST API responding (HTTP $http_code)"
  elif [[ "$http_code" == "000" ]]; then
    add_check "rest_api" "critical" "REST API unreachable at ${REST_URL}"
  else
    add_check "rest_api" "degraded" "REST API returned HTTP $http_code"
  fi
}

# ── 4. Block production ──────────────────────────────────────────────────────
check_block_production() {
  log "Checking block production ..."
  local resp
  if ! resp=$(curl -sf --max-time "$CURL_TIMEOUT" "${RPC_URL}/status" 2>/dev/null); then
    add_check "block_production" "critical" "Cannot fetch latest block (RPC down)"
    return
  fi

  local block_time latest_height
  block_time=$(echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['result']['sync_info']['latest_block_time'])
" 2>/dev/null || echo "")
  latest_height=$(echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['result']['sync_info']['latest_block_height'])
" 2>/dev/null || echo "0")

  if [[ -z "$block_time" ]]; then
    add_check "block_production" "degraded" "Could not parse latest block time"
    return
  fi

  # Compute age in seconds (cross-platform)
  local block_epoch now_epoch age_seconds
  if date --version >/dev/null 2>&1; then
    # GNU date
    block_epoch=$(date -d "$block_time" +%s 2>/dev/null || echo "0")
  else
    # macOS/BSD date -- strip sub-second and parse in UTC.
    # Without -u, timestamps ending in Z get interpreted as local time.
    local clean_time
    clean_time=$(echo "$block_time" | sed 's/\.[0-9]*Z$/Z/' | sed 's/Z$//')
    block_epoch=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "$clean_time" +%s 2>/dev/null || echo "0")
  fi
  now_epoch=$(date +%s)
  age_seconds=$(( now_epoch - block_epoch ))

  local extra
  extra="\"latest_height\":\"${latest_height}\",\"block_age_seconds\":${age_seconds}"

  if (( age_seconds > BLOCK_AGE_CRIT_SECONDS )); then
    add_check "block_production" "critical" "Last block ${age_seconds}s ago (threshold ${BLOCK_AGE_CRIT_SECONDS}s)" "$extra"
  elif (( age_seconds > BLOCK_AGE_WARN_SECONDS )); then
    add_check "block_production" "degraded" "Last block ${age_seconds}s ago (threshold ${BLOCK_AGE_WARN_SECONDS}s)" "$extra"
  else
    add_check "block_production" "healthy" "Block height ${latest_height}, ${age_seconds}s ago" "$extra"
  fi
}

# ── 5. Validator signing (missed blocks) ─────────────────────────────────────
check_validator_signing() {
  log "Checking validator signing info ..."

  # Attempt to read signing info via REST (requires knowing the cons address).
  # We first try to get it from the status endpoint.
  local resp
  if ! resp=$(curl -sf --max-time "$CURL_TIMEOUT" "${RPC_URL}/status" 2>/dev/null); then
    add_check "validator_signing" "degraded" "Cannot fetch validator info (RPC down)"
    return
  fi

  local validator_address
  validator_address=$(echo "$resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['result']['validator_info']['address'])
" 2>/dev/null || echo "")

  if [[ -z "$validator_address" ]]; then
    add_check "validator_signing" "degraded" "Could not determine validator address"
    return
  fi

  # Query slashing signing_infos (list all, search for ours) via REST.
  local signing_resp missed_blocks
  signing_resp=$(curl -sf --max-time "$CURL_TIMEOUT" \
    "${REST_URL}/cosmos/slashing/v1beta1/signing_infos" 2>/dev/null || echo "")

  if [[ -z "$signing_resp" ]]; then
    # Fallback: report address only
    add_check "validator_signing" "degraded" "Could not query signing infos" \
      "\"validator_address\":\"${validator_address}\""
    return
  fi

  # Try to extract missed_blocks_counter from the first entry matching our validator
  missed_blocks=$(echo "$signing_resp" | python3 -c "
import sys, json
data = json.load(sys.stdin)
infos = data.get('info', [])
if not infos:
    print('-1')
else:
    # Use the first signing info (single validator setups)
    print(infos[0].get('missed_blocks_counter', '0'))
" 2>/dev/null || echo "-1")

  local extra
  extra="\"validator_address\":\"${validator_address}\",\"missed_blocks\":${missed_blocks}"

  if [[ "$missed_blocks" == "-1" ]]; then
    add_check "validator_signing" "degraded" "Could not parse missed blocks counter" "$extra"
  elif (( missed_blocks >= MISSED_BLOCKS_CRIT )); then
    add_check "validator_signing" "critical" "Missed ${missed_blocks} blocks (threshold ${MISSED_BLOCKS_CRIT})" "$extra"
  elif (( missed_blocks >= MISSED_BLOCKS_WARN )); then
    add_check "validator_signing" "degraded" "Missed ${missed_blocks} blocks (threshold ${MISSED_BLOCKS_WARN})" "$extra"
  else
    add_check "validator_signing" "healthy" "Missed ${missed_blocks} blocks" "$extra"
  fi
}

# ── 6. Disk space ────────────────────────────────────────────────────────────
check_disk_space() {
  log "Checking disk space ..."

  local data_dir="${HOME}/.clawchain"
  local mount_point disk_pct
  if [[ -d "$data_dir" ]]; then
    mount_point=$(df "$data_dir" | tail -1 | awk '{print $NF}')
    disk_pct=$(df "$data_dir" | tail -1 | awk '{gsub(/%/,""); print $(NF-1)}')
  else
    mount_point=$(df / | tail -1 | awk '{print $NF}')
    disk_pct=$(df / | tail -1 | awk '{gsub(/%/,""); print $(NF-1)}')
  fi

  local extra
  extra="\"mount_point\":\"${mount_point}\",\"used_percent\":${disk_pct}"

  if (( disk_pct >= DISK_CRIT_PERCENT )); then
    add_check "disk_space" "critical" "Disk ${disk_pct}% used on ${mount_point} (threshold ${DISK_CRIT_PERCENT}%)" "$extra"
  elif (( disk_pct >= DISK_WARN_PERCENT )); then
    add_check "disk_space" "degraded" "Disk ${disk_pct}% used on ${mount_point} (threshold ${DISK_WARN_PERCENT}%)" "$extra"
  else
    add_check "disk_space" "healthy" "Disk ${disk_pct}% used on ${mount_point}" "$extra"
  fi
}

# ── 7. Memory usage of clawchaind ────────────────────────────────────────────
check_memory() {
  log "Checking ${BINARY} memory usage ..."

  local pid rss_kb rss_mb
  pid=$(pgrep -x "$BINARY" 2>/dev/null | head -1 || echo "")

  if [[ -z "$pid" ]]; then
    if command -v docker >/dev/null 2>&1; then
      if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${TESTNET_CONTAINER_NAME}"; then
        add_check "memory" "healthy" "${BINARY} not running on host (containerized as ${TESTNET_CONTAINER_NAME})"
        return
      fi
    fi
    add_check "memory" "degraded" "${BINARY} process not found"
    return
  fi

  # ps reports RSS in KB
  rss_kb=$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ' || echo "0")
  rss_mb=$(( rss_kb / 1024 ))

  local extra
  extra="\"pid\":${pid},\"rss_mb\":${rss_mb}"

  if (( rss_mb >= MEM_CRIT_MB )); then
    add_check "memory" "critical" "${BINARY} using ${rss_mb} MB (threshold ${MEM_CRIT_MB} MB)" "$extra"
  elif (( rss_mb >= MEM_WARN_MB )); then
    add_check "memory" "degraded" "${BINARY} using ${rss_mb} MB (threshold ${MEM_WARN_MB} MB)" "$extra"
  else
    add_check "memory" "healthy" "${BINARY} using ${rss_mb} MB (PID ${pid})" "$extra"
  fi
}

# ── Run all checks ───────────────────────────────────────────────────────────
main() {
  log "Starting ClawChain health check at $(iso_now)"

  check_rpc
  check_grpc_gateway
  check_rest
  check_block_production
  check_validator_signing
  check_disk_space
  check_memory

  # ── Build JSON report ────────────────────────────────────────────────────
  local checks_json
  checks_json=$(printf '%s\n' "${CHECKS[@]}" | paste -sd ',' -)

  local report
  report=$(cat <<ENDJSON
{
  "timestamp": "$(iso_now)",
  "status": "${OVERALL_STATUS}",
  "endpoints": {
    "rpc": "${RPC_URL}",
    "grpc_gateway": "${GRPC_GATEWAY_URL}",
    "rest": "${REST_URL}"
  },
  "checks": [${checks_json}]
}
ENDJSON
)

  # Pretty-print if python3 is available, otherwise raw
  if command -v python3 >/dev/null 2>&1; then
    echo "$report" | python3 -m json.tool
  else
    echo "$report"
  fi

  # ── Exit code ────────────────────────────────────────────────────────────
  case "$OVERALL_STATUS" in
    healthy)  log "Overall: HEALTHY";  exit 0 ;;
    degraded) log "Overall: DEGRADED"; exit 1 ;;
    critical) log "Overall: CRITICAL"; exit 2 ;;
  esac
}

main "$@"
