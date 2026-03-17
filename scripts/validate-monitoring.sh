#!/usr/bin/env bash
# validate-monitoring.sh - Validate the ClawChain monitoring stack
#
# Checks Prometheus, Grafana, and AlertManager health, scrape targets,
# key metrics, and dashboard availability.
#
# Usage:
#   ./scripts/validate-monitoring.sh [OPTIONS]
#
# Options:
#   --prometheus-url URL     Prometheus base URL (default: http://localhost:9090)
#   --grafana-url URL        Grafana base URL    (default: http://localhost:3000)
#   --alertmanager-url URL   AlertManager base URL (default: http://localhost:9093)
#   --json                   Output results as JSON instead of a table
#   -h, --help               Show this help message

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
PROMETHEUS_URL="http://localhost:9090"
GRAFANA_URL="http://localhost:3000"
ALERTMANAGER_URL="http://localhost:9093"
JSON_OUTPUT=false

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prometheus-url)  PROMETHEUS_URL="$2"; shift 2 ;;
    --grafana-url)     GRAFANA_URL="$2";    shift 2 ;;
    --alertmanager-url) ALERTMANAGER_URL="$2"; shift 2 ;;
    --json)            JSON_OUTPUT=true;     shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
declare -a RESULTS=()  # Each entry: "category|check|status|detail"

add_result() {
  local category="$1" check="$2" status="$3" detail="$4"
  RESULTS+=("${category}|${check}|${status}|${detail}")
  case "$status" in
    PASS) ((PASS_COUNT++)) ;;
    FAIL) ((FAIL_COUNT++)) ;;
    WARN) ((WARN_COUNT++)) ;;
  esac
}

http_get() {
  # Returns HTTP body; sets HTTP_CODE as side-effect.
  local url="$1"
  local tmpfile
  tmpfile=$(mktemp)
  HTTP_CODE=$(curl -s -o "$tmpfile" -w '%{http_code}' --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")
  cat "$tmpfile"
  rm -f "$tmpfile"
}

# ---------------------------------------------------------------------------
# 1. Prometheus Health
# ---------------------------------------------------------------------------
check_prometheus_health() {
  local body
  body=$(http_get "${PROMETHEUS_URL}/api/v1/status/config")
  if [[ "$HTTP_CODE" == "200" ]]; then
    add_result "Prometheus" "Health (/api/v1/status/config)" "PASS" "Prometheus is running (HTTP 200)"
  else
    add_result "Prometheus" "Health (/api/v1/status/config)" "FAIL" "Prometheus unreachable (HTTP ${HTTP_CODE})"
  fi
}

# ---------------------------------------------------------------------------
# 2. Scrape Targets
# ---------------------------------------------------------------------------
check_scrape_targets() {
  local body
  body=$(http_get "${PROMETHEUS_URL}/api/v1/targets")
  if [[ "$HTTP_CODE" != "200" ]]; then
    add_result "Prometheus" "Scrape Targets" "FAIL" "Could not query /api/v1/targets (HTTP ${HTTP_CODE})"
    return
  fi

  # Expected targets from prometheus.yml
  local -a EXPECTED_JOBS=("cometbft" "cosmos-sdk-app" "node-exporter" "claw-gpu-provider" "prometheus")

  for job in "${EXPECTED_JOBS[@]}"; do
    # Extract health for this job from the JSON response
    local health
    health=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
targets = data.get('data', {}).get('activeTargets', [])
for t in targets:
    if t.get('labels', {}).get('job') == '${job}':
        print(t.get('health', 'unknown'))
        sys.exit(0)
print('not_found')
" 2>/dev/null || echo "parse_error")

    case "$health" in
      up)
        add_result "Scrape Targets" "${job}" "PASS" "Target is UP"
        ;;
      down)
        add_result "Scrape Targets" "${job}" "FAIL" "Target is DOWN"
        ;;
      not_found)
        add_result "Scrape Targets" "${job}" "WARN" "Target not found in active targets"
        ;;
      *)
        add_result "Scrape Targets" "${job}" "WARN" "Health status: ${health}"
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# 3. Key Metrics Exist
# ---------------------------------------------------------------------------
check_key_metrics() {
  local -a METRICS=(
    "cometbft_consensus_height|Block height"
    "cometbft_consensus_validators|Validator count"
    "cometbft_consensus_rounds|Consensus rounds"
    "cometbft_p2p_peers|Peer count"
    "cometbft_mempool_size|Mempool size"
    "cometbft_consensus_num_txs|Transaction count"
    "clawchain_agent_registrations_total|Agent registrations (custom)"
    "claw_gpu_provider_active_jobs|GPU provider active jobs (custom)"
    "claw_gpu_provider_jobs_total|GPU provider total jobs (custom)"
  )

  for entry in "${METRICS[@]}"; do
    local metric="${entry%%|*}"
    local label="${entry##*|}"
    local body
    body=$(http_get "${PROMETHEUS_URL}/api/v1/query?query=${metric}")

    if [[ "$HTTP_CODE" != "200" ]]; then
      add_result "Key Metrics" "${metric}" "FAIL" "Prometheus query failed (HTTP ${HTTP_CODE})"
      continue
    fi

    local result_count
    result_count=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data.get('data', {}).get('result', [])
print(len(results))
" 2>/dev/null || echo "0")

    if [[ "$result_count" -gt 0 ]]; then
      add_result "Key Metrics" "${metric}" "PASS" "${label} - ${result_count} series found"
    else
      add_result "Key Metrics" "${metric}" "WARN" "${label} - no data (metric may not be reporting yet)"
    fi
  done
}

# ---------------------------------------------------------------------------
# 4. Grafana Health
# ---------------------------------------------------------------------------
check_grafana_health() {
  local body
  body=$(http_get "${GRAFANA_URL}/api/health")
  if [[ "$HTTP_CODE" == "200" ]]; then
    local db_status
    db_status=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('database', 'unknown'))
" 2>/dev/null || echo "unknown")
    if [[ "$db_status" == "ok" ]]; then
      add_result "Grafana" "Health (/api/health)" "PASS" "Grafana is healthy (database: ok)"
    else
      add_result "Grafana" "Health (/api/health)" "WARN" "Grafana responded but database status: ${db_status}"
    fi
  else
    add_result "Grafana" "Health (/api/health)" "FAIL" "Grafana unreachable (HTTP ${HTTP_CODE})"
  fi
}

# ---------------------------------------------------------------------------
# 5. Dashboard Loaded
# ---------------------------------------------------------------------------
check_grafana_dashboard() {
  local body
  # Search for the ClawChain dashboard by UID
  body=$(http_get "${GRAFANA_URL}/api/dashboards/uid/clawchain-prod-v1")

  if [[ "$HTTP_CODE" == "200" ]]; then
    local panel_count title
    panel_count=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
panels = data.get('dashboard', {}).get('panels', [])
print(len(panels))
" 2>/dev/null || echo "0")
    title=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('dashboard', {}).get('title', 'unknown'))
" 2>/dev/null || echo "unknown")
    add_result "Grafana" "Dashboard (clawchain-prod-v1)" "PASS" "\"${title}\" loaded with ${panel_count} panels"
  elif [[ "$HTTP_CODE" == "404" ]]; then
    # Fallback: search via the search API
    body=$(http_get "${GRAFANA_URL}/api/search?query=ClawChain")
    if [[ "$HTTP_CODE" == "200" ]]; then
      local count
      count=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(len(data))
" 2>/dev/null || echo "0")
      if [[ "$count" -gt 0 ]]; then
        add_result "Grafana" "Dashboard (clawchain-prod-v1)" "WARN" "UID not found but ${count} ClawChain dashboard(s) exist via search"
      else
        add_result "Grafana" "Dashboard (clawchain-prod-v1)" "FAIL" "Dashboard not found (not imported)"
      fi
    else
      add_result "Grafana" "Dashboard (clawchain-prod-v1)" "FAIL" "Dashboard not found and search failed (HTTP ${HTTP_CODE})"
    fi
  else
    add_result "Grafana" "Dashboard (clawchain-prod-v1)" "FAIL" "Could not query dashboards (HTTP ${HTTP_CODE})"
  fi
}

# ---------------------------------------------------------------------------
# 6. AlertManager Health
# ---------------------------------------------------------------------------
check_alertmanager_health() {
  local body
  body=$(http_get "${ALERTMANAGER_URL}/api/v2/status")
  if [[ "$HTTP_CODE" == "200" ]]; then
    local cluster_status
    cluster_status=$(echo "$body" | python3 -c "
import sys, json
data = json.load(sys.stdin)
cluster = data.get('cluster', {})
print(cluster.get('status', 'unknown'))
" 2>/dev/null || echo "unknown")
    add_result "AlertManager" "Health (/api/v2/status)" "PASS" "AlertManager is running (cluster: ${cluster_status})"
  else
    add_result "AlertManager" "Health (/api/v2/status)" "FAIL" "AlertManager unreachable (HTTP ${HTTP_CODE})"
  fi
}

# ---------------------------------------------------------------------------
# Run all checks
# ---------------------------------------------------------------------------
check_prometheus_health
check_scrape_targets
check_key_metrics
check_grafana_health
check_grafana_dashboard
check_alertmanager_health

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if [[ "$JSON_OUTPUT" == "true" ]]; then
  # Build JSON output
  echo "{"
  echo "  \"summary\": {"
  echo "    \"pass\": ${PASS_COUNT},"
  echo "    \"fail\": ${FAIL_COUNT},"
  echo "    \"warn\": ${WARN_COUNT},"
  echo "    \"total\": $(( PASS_COUNT + FAIL_COUNT + WARN_COUNT ))"
  echo "  },"
  echo "  \"endpoints\": {"
  echo "    \"prometheus\": \"${PROMETHEUS_URL}\","
  echo "    \"grafana\": \"${GRAFANA_URL}\","
  echo "    \"alertmanager\": \"${ALERTMANAGER_URL}\""
  echo "  },"
  echo "  \"checks\": ["
  local first=true
  for entry in "${RESULTS[@]}"; do
    IFS='|' read -r category check status detail <<< "$entry"
    if [[ "$first" == "true" ]]; then
      first=false
    else
      echo ","
    fi
    printf '    {"category": "%s", "check": "%s", "status": "%s", "detail": "%s"}' \
      "$category" "$check" "$status" "$detail"
  done
  echo ""
  echo "  ]"
  echo "}"
else
  # Table output
  echo ""
  echo -e "${BOLD}${CYAN}ClawChain Monitoring Stack Validation${RESET}"
  echo -e "${CYAN}======================================${RESET}"
  echo ""
  echo -e "  Prometheus:   ${PROMETHEUS_URL}"
  echo -e "  Grafana:      ${GRAFANA_URL}"
  echo -e "  AlertManager: ${ALERTMANAGER_URL}"
  echo ""

  # Print table header
  printf "${BOLD}%-20s %-45s %-8s %s${RESET}\n" "CATEGORY" "CHECK" "STATUS" "DETAIL"
  printf "%-20s %-45s %-8s %s\n" "--------------------" "---------------------------------------------" "--------" "------------------------------"

  local current_category=""
  for entry in "${RESULTS[@]}"; do
    IFS='|' read -r category check status detail <<< "$entry"

    # Color the status
    local status_colored
    case "$status" in
      PASS) status_colored="${GREEN}PASS${RESET}" ;;
      FAIL) status_colored="${RED}FAIL${RESET}" ;;
      WARN) status_colored="${YELLOW}WARN${RESET}" ;;
      *)    status_colored="$status" ;;
    esac

    # Print separator between categories
    if [[ "$category" != "$current_category" ]]; then
      if [[ -n "$current_category" ]]; then
        echo ""
      fi
      current_category="$category"
    fi

    printf "%-20s %-45s %-8b %s\n" "$category" "$check" "$status_colored" "$detail"
  done

  echo ""
  echo -e "${BOLD}Summary${RESET}"
  echo -e "  ${GREEN}PASS${RESET}: ${PASS_COUNT}    ${RED}FAIL${RESET}: ${FAIL_COUNT}    ${YELLOW}WARN${RESET}: ${WARN_COUNT}    Total: $(( PASS_COUNT + FAIL_COUNT + WARN_COUNT ))"
  echo ""

  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    echo -e "${RED}${BOLD}Monitoring stack has failures. Review FAIL items above.${RESET}"
    exit 1
  elif [[ "$WARN_COUNT" -gt 0 ]]; then
    echo -e "${YELLOW}${BOLD}Monitoring stack is partially healthy. Review WARN items above.${RESET}"
    exit 0
  else
    echo -e "${GREEN}${BOLD}Monitoring stack is fully healthy.${RESET}"
    exit 0
  fi
fi
