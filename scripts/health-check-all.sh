#!/usr/bin/env bash
#
# health-check-all.sh - Full health check for all ClawChain services.
#
# Checks all 12 services and reports status.
# Exits 0 if all pass, 1 if any fail.
#
# Usage:
#   bash scripts/health-check-all.sh
#   bash scripts/health-check-all.sh --json
#   bash scripts/health-check-all.sh --docker
#
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
JSON_MODE=false
DOCKER_MODE=false
JSON_RESULTS=()

for arg in "$@"; do
  case "$arg" in
    --json)   JSON_MODE=true ;;
    --docker) DOCKER_MODE=true ;;
  esac
done

check() {
  local name=$1
  local url=$2
  local timeout=${3:-3}

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>/dev/null || echo "000")

  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    $JSON_MODE || echo -e "  ${GREEN}[OK]${NC}   ${name} (${url})"
    ((PASS++)) || true
    JSON_RESULTS+=("{\"name\":\"$name\",\"url\":\"$url\",\"status\":\"ok\",\"code\":$code}")
  else
    $JSON_MODE || echo -e "  ${RED}[FAIL]${NC} ${name} (${url}) HTTP ${code}"
    ((FAIL++)) || true
    JSON_RESULTS+=("{\"name\":\"$name\",\"url\":\"$url\",\"status\":\"fail\",\"code\":$code}")
  fi
}

check_docker() {
  local name=$1
  local container=$2

  local state
  state=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
  local health="n/a"
  if [ "$state" = "running" ]; then
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-check{{end}}' "$container" 2>/dev/null)
  fi

  if [ "$state" = "running" ] && [[ "$health" =~ ^(healthy|no-check)$ ]]; then
    $JSON_MODE || echo -e "  ${GREEN}[OK]${NC}   ${name} (${container}) state=${state} health=${health}"
    ((PASS++)) || true
    JSON_RESULTS+=("{\"name\":\"$name\",\"container\":\"$container\",\"status\":\"ok\",\"state\":\"$state\",\"health\":\"$health\"}")
  else
    $JSON_MODE || echo -e "  ${RED}[FAIL]${NC} ${name} (${container}) state=${state} health=${health}"
    ((FAIL++)) || true
    JSON_RESULTS+=("{\"name\":\"$name\",\"container\":\"$container\",\"status\":\"fail\",\"state\":\"$state\",\"health\":\"$health\"}")
  fi
}

$JSON_MODE || echo ""
$JSON_MODE || echo "========================================="
$JSON_MODE || echo "  ClawChain Full Stack Health Check"
$JSON_MODE || echo "========================================="
$JSON_MODE || echo ""

if $DOCKER_MODE; then
  $JSON_MODE || echo -e "${BOLD}Docker Containers:${NC}"
  check_docker "ClawChain Node"       "clawchain-node"
  check_docker "clawd Agent"          "clawchain-clawd"
  check_docker "Token Faucet"         "clawchain-faucet"
  check_docker "Event Proxy"          "clawchain-eventsd"
  check_docker "Notification Service" "clawchain-notifyd"
  check_docker "Inference Sidecar"    "clawchain-inference-sidecar"
  check_docker "Web Dashboard"        "clawchain-web"
  check_docker "Block Explorer"       "clawchain-explorer"
  check_docker "ClawDEX"              "clawchain-dex"
  check_docker "Landing Page"         "clawchain-landing"
  check_docker "Documentation"        "clawchain-docs"
  check_docker "GPU Provider"         "clawchain-gpu-provider"
else
  $JSON_MODE || echo -e "${BOLD}Core Chain:${NC}"
  check "Chain RPC"          "http://localhost:26657/health"
  check "Chain REST API"     "http://localhost:1317/cosmos/base/tendermint/v1beta1/blocks/latest"

  $JSON_MODE || echo ""
  $JSON_MODE || echo -e "${BOLD}Backend Services:${NC}"
  check "Token Faucet"       "http://localhost:8888/health"
  check "Event Proxy"        "http://localhost:8891/health"
  check "Notifications"      "http://localhost:8892/health"
  check "Inference Sidecar"  "http://localhost:8090/health"

  $JSON_MODE || echo ""
  $JSON_MODE || echo -e "${BOLD}Frontend Apps:${NC}"
  check "Web Dashboard"      "http://localhost:3000"
  check "Block Explorer"     "http://localhost:8080"
  check "ClawDEX"            "http://localhost:3001"
  check "Landing Page"       "http://localhost:8093"
  check "Documentation"      "http://localhost:8091"
fi

$JSON_MODE || echo ""
$JSON_MODE || echo "-----------------------------------------"
$JSON_MODE || echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
$JSON_MODE || echo "-----------------------------------------"

if $JSON_MODE; then
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"passed\": $PASS,"
  echo "  \"failed\": $FAIL,"
  echo "  \"services\": ["
  for i in "${!JSON_RESULTS[@]}"; do
    if [ "$i" -lt $((${#JSON_RESULTS[@]} - 1)) ]; then
      echo "    ${JSON_RESULTS[$i]},"
    else
      echo "    ${JSON_RESULTS[$i]}"
    fi
  done
  echo "  ]"
  echo "}"
fi

if [ "${FAIL}" -eq 0 ]; then
  $JSON_MODE || echo -e "\n${GREEN}All services healthy.${NC}"
  exit 0
else
  $JSON_MODE || echo -e "\n${YELLOW}Some services are not responding.${NC}"
  $JSON_MODE || echo "Run: docker compose up -d  OR  bash scripts/start-all.sh"
  exit 1
fi
