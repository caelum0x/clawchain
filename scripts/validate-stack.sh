#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ClawChain Full-Stack Integration Validation
#
# Validates the entire ClawChain stack against a running Docker testnet.
# Tests chain health, core Cosmos modules, custom modules, transaction
# processing, web dashboard connectivity, and infrastructure services.
#
# Prerequisites:
#   - Docker testnet running (4 validators, clawchain-node0 container)
#   - Web dashboard dev server on :3000 (optional)
#   - curl, jq, docker CLI available
#
# Usage:
#   ./scripts/validate-stack.sh
#   ./scripts/validate-stack.sh --skip-web       # skip web dashboard checks
#   ./scripts/validate-stack.sh --skip-infra     # skip infrastructure checks
#   ./scripts/validate-stack.sh --skip-tx        # skip transaction test
#   ./scripts/validate-stack.sh --verbose        # show response bodies
#
# Exit codes:  0 = all critical tests passed   1 = one or more critical failures
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ───────────────────────────────────────────────────────────
RPC_URL="${RPC_URL:-http://localhost:26657}"
REST_URL="${REST_URL:-http://localhost:1317}"
GRPC_HOST="${GRPC_HOST:-localhost:9090}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
DOCKER_NODE="${DOCKER_NODE:-clawchain-node0}"
VALIDATOR_ADDR="${VALIDATOR_ADDR:-claw1ythm3uxuqath04pvqxqnkg0u9w4evn68584fsk}"
FAUCET_ADDR="${FAUCET_ADDR:-claw1shg6zt99ygw4cwj0n2upvez9uww7kcwyjc3kc5}"
CURL_TIMEOUT="${CURL_TIMEOUT:-10}"
BLOCK_WAIT_TIMEOUT="${BLOCK_WAIT_TIMEOUT:-30}"

PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9091}"
ALERTMANAGER_URL="${ALERTMANAGER_URL:-http://localhost:9093}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"

# ── Flags ───────────────────────────────────────────────────────────────────
SKIP_WEB=false
SKIP_INFRA=false
SKIP_TX=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-web)   SKIP_WEB=true; shift ;;
    --skip-infra) SKIP_INFRA=true; shift ;;
    --skip-tx)    SKIP_TX=true; shift ;;
    --verbose)    VERBOSE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--skip-web] [--skip-infra] [--skip-tx] [--verbose]"
      echo ""
      echo "Environment variables:"
      echo "  RPC_URL          Chain RPC       (default: http://localhost:26657)"
      echo "  REST_URL         Chain REST/LCD  (default: http://localhost:1317)"
      echo "  GRPC_HOST        Chain gRPC      (default: localhost:9090)"
      echo "  WEB_URL          Web dashboard   (default: http://localhost:3000)"
      echo "  CHAIN_ID         Expected chain  (default: clawchain-testnet-1)"
      echo "  DOCKER_NODE      Container name  (default: clawchain-node0)"
      echo "  CURL_TIMEOUT     Request timeout (default: 10s)"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Counters ────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
WARN=0
CRITICAL_FAIL=0

# ── Helpers ─────────────────────────────────────────────────────────────────

section() {
  echo ""
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
}

subsection() {
  echo ""
  echo -e "${BOLD}  ── $1 ──${NC}"
}

check_pass() {
  local label="$1"
  local detail="${2:-}"
  PASS=$(( PASS + 1 ))
  printf "  ${GREEN}[OK]${NC}   %-45s %s\n" "$label" "${DIM}${detail}${NC}"
}

check_fail() {
  local label="$1"
  local critical="${2:-true}"
  local detail="${3:-}"
  FAIL=$(( FAIL + 1 ))
  if [[ "$critical" == "true" ]]; then
    CRITICAL_FAIL=$(( CRITICAL_FAIL + 1 ))
    printf "  ${RED}[FAIL]${NC} %-45s %s\n" "$label" "${detail}"
  else
    printf "  ${RED}[FAIL]${NC} %-45s %s\n" "$label" "${detail}"
  fi
}

check_warn() {
  local label="$1"
  local detail="${2:-}"
  WARN=$(( WARN + 1 ))
  printf "  ${YELLOW}[WARN]${NC} %-45s %s\n" "$label" "${detail}"
}

# ── HTTP helper ─────────────────────────────────────────────────────────────
# http_get writes to two temp files so the caller can read both the HTTP
# status code and the response body WITHOUT using a subshell (which would
# prevent global variable propagation).
#
# Usage:
#   http_get "http://example.com/path"
#   # Now HTTP_CODE and HTTP_BODY are set in the current shell.
#
HTTP_CODE=0
HTTP_BODY=""
_HTTP_CODE_FILE=$(mktemp)
_HTTP_BODY_FILE=$(mktemp)
trap 'rm -f "$_HTTP_CODE_FILE" "$_HTTP_BODY_FILE"' EXIT

http_get() {
  local url="$1"
  local code
  code=$(curl -so "$_HTTP_BODY_FILE" -w '%{http_code}' --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null) || code="000"
  HTTP_CODE="$code"
  HTTP_BODY=$(cat "$_HTTP_BODY_FILE" 2>/dev/null) || HTTP_BODY=""
  if $VERBOSE && [[ -n "$HTTP_BODY" ]]; then
    echo -e "    ${DIM}Response: ${HTTP_BODY:0:200}${NC}" >&2
  fi
}

# json_field <json> <jq_expression> - extracts a field via jq
json_field() {
  echo "$1" | jq -r "$2" 2>/dev/null || echo ""
}

# ── Dependency check ────────────────────────────────────────────────────────
for cmd in curl jq docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo -e "${RED}Error: '$cmd' is required but not found in PATH${NC}" >&2
    exit 1
  fi
done

# ════════════════════════════════════════════════════════════════════════════
#  START VALIDATION
# ════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}ClawChain Full-Stack Integration Validation${NC}"
echo -e "${DIM}$(date -u +"%Y-%m-%dT%H:%M:%SZ")${NC}"
echo ""
echo -e "  RPC:       ${RPC_URL}"
echo -e "  REST:      ${REST_URL}"
echo -e "  gRPC:      ${GRPC_HOST}"
echo -e "  Web:       ${WEB_URL}"
echo -e "  Chain ID:  ${CHAIN_ID}"
echo -e "  Node:      ${DOCKER_NODE}"

# ────────────────────────────────────────────────────────────────────────────
#  SECTION 1: Chain Health
# ────────────────────────────────────────────────────────────────────────────
section "1. Chain Health"

# 1a. RPC status
subsection "RPC Status"
http_get "${RPC_URL}/status"
if [[ "$HTTP_CODE" == "200" ]] && [[ -n "$HTTP_BODY" ]]; then
  check_pass "RPC reachable" "HTTP $HTTP_CODE"

  RPC_RESP="$HTTP_BODY"

  # Block height
  BLOCK_HEIGHT=$(json_field "$RPC_RESP" '.result.sync_info.latest_block_height')
  if [[ -n "$BLOCK_HEIGHT" ]] && [[ "$BLOCK_HEIGHT" != "null" ]] && (( BLOCK_HEIGHT > 0 )); then
    check_pass "Block height > 0" "height=$BLOCK_HEIGHT"
  else
    check_fail "Block height > 0" true "got: $BLOCK_HEIGHT"
  fi

  # Not catching up
  CATCHING_UP=$(json_field "$RPC_RESP" '.result.sync_info.catching_up')
  if [[ "$CATCHING_UP" == "false" ]]; then
    check_pass "Node not catching up"
  else
    check_fail "Node not catching up" true "catching_up=$CATCHING_UP"
  fi

  # Chain ID
  NODE_CHAIN_ID=$(json_field "$RPC_RESP" '.result.node_info.network')
  if [[ "$NODE_CHAIN_ID" == "$CHAIN_ID" ]]; then
    check_pass "Chain ID matches" "$NODE_CHAIN_ID"
  else
    check_fail "Chain ID matches" true "expected=$CHAIN_ID got=$NODE_CHAIN_ID"
  fi

  # Node version
  NODE_VERSION=$(json_field "$RPC_RESP" '.result.node_info.version')
  if [[ -n "$NODE_VERSION" ]] && [[ "$NODE_VERSION" != "null" ]]; then
    check_pass "Node version reported" "v$NODE_VERSION"
  else
    check_warn "Node version not reported"
  fi

  # Moniker
  MONIKER=$(json_field "$RPC_RESP" '.result.node_info.moniker')
  if [[ -n "$MONIKER" ]] && [[ "$MONIKER" != "null" ]]; then
    check_pass "Node moniker" "$MONIKER"
  else
    check_warn "Node moniker not set"
  fi
else
  check_fail "RPC reachable" true "HTTP $HTTP_CODE - is the chain running?"
fi

# 1b. REST API
subsection "REST API"
http_get "${REST_URL}/cosmos/base/tendermint/v1beta1/node_info"
if [[ "$HTTP_CODE" == "200" ]]; then
  check_pass "REST API reachable" "HTTP $HTTP_CODE"

  APP_VERSION=$(json_field "$HTTP_BODY" '.application_version.version')
  if [[ -n "$APP_VERSION" ]] && [[ "$APP_VERSION" != "null" ]]; then
    check_pass "Application version" "$APP_VERSION"
  else
    check_warn "Application version not available"
  fi
else
  check_fail "REST API reachable" true "HTTP $HTTP_CODE"
fi

# 1c. Block production (height is increasing)
subsection "Block Production"
if [[ -n "${BLOCK_HEIGHT:-}" ]] && (( BLOCK_HEIGHT > 0 )); then
  echo -e "  ${DIM}Waiting 6 seconds for new blocks...${NC}"
  sleep 6
  http_get "${RPC_URL}/status"
  BLOCK_HEIGHT2=$(json_field "$HTTP_BODY" '.result.sync_info.latest_block_height')
  if [[ -n "$BLOCK_HEIGHT2" ]] && (( BLOCK_HEIGHT2 > BLOCK_HEIGHT )); then
    BLOCKS_PRODUCED=$(( BLOCK_HEIGHT2 - BLOCK_HEIGHT ))
    check_pass "Blocks produced in 6s" "+${BLOCKS_PRODUCED} blocks (${BLOCK_HEIGHT} -> ${BLOCK_HEIGHT2})"
  else
    check_fail "Blocks produced in 6s" true "height unchanged at $BLOCK_HEIGHT"
  fi
else
  check_warn "Block production check skipped" "no initial height"
fi

# ────────────────────────────────────────────────────────────────────────────
#  SECTION 2: Core Cosmos Modules
# ────────────────────────────────────────────────────────────────────────────
section "2. Core Cosmos Modules"

# 2a. Bank - supply
subsection "Bank Module"
http_get "${REST_URL}/cosmos/bank/v1beta1/supply"
if [[ "$HTTP_CODE" == "200" ]]; then
  UCLAW_SUPPLY=$(json_field "$HTTP_BODY" '.supply[] | select(.denom=="uclaw") | .amount')
  if [[ -n "$UCLAW_SUPPLY" ]] && [[ "$UCLAW_SUPPLY" != "null" ]]; then
    CLAW_SUPPLY=$(echo "scale=2; $UCLAW_SUPPLY / 1000000" | bc 2>/dev/null || echo "?")
    check_pass "Bank: total supply" "${CLAW_SUPPLY} CLAW (${UCLAW_SUPPLY} uclaw)"
  else
    check_warn "Bank: uclaw not in supply" "$(json_field "$HTTP_BODY" '.supply[0].denom')"
  fi
else
  check_fail "Bank: supply endpoint" true "HTTP $HTTP_CODE"
fi

# Bank - validator balance
http_get "${REST_URL}/cosmos/bank/v1beta1/balances/${VALIDATOR_ADDR}"
if [[ "$HTTP_CODE" == "200" ]]; then
  VAL_BALANCE=$(json_field "$HTTP_BODY" '.balances[] | select(.denom=="uclaw") | .amount')
  if [[ -n "$VAL_BALANCE" ]]; then
    check_pass "Bank: validator balance" "${VAL_BALANCE} uclaw"
  else
    check_pass "Bank: validator balance query" "no uclaw balance"
  fi
else
  check_fail "Bank: balance query" false "HTTP $HTTP_CODE"
fi

# Bank - faucet balance
http_get "${REST_URL}/cosmos/bank/v1beta1/balances/${FAUCET_ADDR}"
if [[ "$HTTP_CODE" == "200" ]]; then
  FAUCET_BALANCE=$(json_field "$HTTP_BODY" '.balances[] | select(.denom=="uclaw") | .amount')
  if [[ -n "$FAUCET_BALANCE" ]]; then
    check_pass "Bank: faucet balance" "${FAUCET_BALANCE} uclaw"
  else
    check_pass "Bank: faucet balance query" "no uclaw balance"
  fi
else
  check_fail "Bank: faucet balance query" false "HTTP $HTTP_CODE"
fi

# 2b. Staking
subsection "Staking Module"
http_get "${REST_URL}/cosmos/staking/v1beta1/validators"
if [[ "$HTTP_CODE" == "200" ]]; then
  VALS_RESP="$HTTP_BODY"
  NUM_VALIDATORS=$(json_field "$VALS_RESP" '.validators | length')
  if [[ -n "$NUM_VALIDATORS" ]] && (( NUM_VALIDATORS > 0 )); then
    check_pass "Staking: validators found" "$NUM_VALIDATORS validator(s)"

    # Check first validator details
    VAL_MONIKER=$(json_field "$VALS_RESP" '.validators[0].description.moniker')
    VAL_STATUS=$(json_field "$VALS_RESP" '.validators[0].status')
    VAL_TOKENS=$(json_field "$VALS_RESP" '.validators[0].tokens')
    if [[ -n "$VAL_MONIKER" ]] && [[ "$VAL_MONIKER" != "null" ]]; then
      check_pass "Staking: validator details" "$VAL_MONIKER status=$VAL_STATUS tokens=$VAL_TOKENS"
    fi

    # Check for bonded validators
    BONDED_COUNT=$(json_field "$VALS_RESP" '[.validators[] | select(.status=="BOND_STATUS_BONDED")] | length')
    if (( BONDED_COUNT > 0 )); then
      check_pass "Staking: bonded validators" "$BONDED_COUNT bonded"
    else
      check_warn "Staking: no bonded validators"
    fi
  else
    check_fail "Staking: validators found" true "none returned"
  fi
else
  check_fail "Staking: validators endpoint" true "HTTP $HTTP_CODE"
fi

# Staking pool
http_get "${REST_URL}/cosmos/staking/v1beta1/pool"
if [[ "$HTTP_CODE" == "200" ]]; then
  BONDED_TOKENS=$(json_field "$HTTP_BODY" '.pool.bonded_tokens')
  NOT_BONDED=$(json_field "$HTTP_BODY" '.pool.not_bonded_tokens')
  check_pass "Staking: pool info" "bonded=${BONDED_TOKENS} not_bonded=${NOT_BONDED}"
else
  check_fail "Staking: pool endpoint" false "HTTP $HTTP_CODE"
fi

# 2c. Gov
subsection "Gov Module"
http_get "${REST_URL}/cosmos/gov/v1/proposals"
if [[ "$HTTP_CODE" == "200" ]]; then
  NUM_PROPOSALS=$(json_field "$HTTP_BODY" '.proposals | length')
  check_pass "Gov: proposals endpoint" "${NUM_PROPOSALS} proposal(s)"
else
  # Some setups return 404 if no proposals - check for that
  if [[ "$HTTP_CODE" == "404" ]]; then
    check_pass "Gov: proposals endpoint" "no proposals (HTTP 404)"
  else
    check_fail "Gov: proposals endpoint" false "HTTP $HTTP_CODE"
  fi
fi

# Gov params
http_get "${REST_URL}/cosmos/gov/v1/params/voting"
if [[ "$HTTP_CODE" == "200" ]]; then
  VOTING_PERIOD=$(json_field "$HTTP_BODY" '.params.voting_period')
  check_pass "Gov: voting params" "voting_period=$VOTING_PERIOD"
else
  check_warn "Gov: voting params" "HTTP $HTTP_CODE"
fi

# 2d. Auth
subsection "Auth Module"
http_get "${REST_URL}/cosmos/auth/v1beta1/accounts"
if [[ "$HTTP_CODE" == "200" ]]; then
  NUM_ACCOUNTS=$(json_field "$HTTP_BODY" '.accounts | length')
  check_pass "Auth: accounts endpoint" "$NUM_ACCOUNTS account(s)"
else
  check_fail "Auth: accounts endpoint" false "HTTP $HTTP_CODE"
fi

# 2e. Distribution
subsection "Distribution Module"
http_get "${REST_URL}/cosmos/distribution/v1beta1/community_pool"
if [[ "$HTTP_CODE" == "200" ]]; then
  POOL_COINS=$(json_field "$HTTP_BODY" '.pool | length')
  if (( POOL_COINS > 0 )); then
    POOL_AMOUNT=$(json_field "$HTTP_BODY" '.pool[0].amount')
    POOL_DENOM=$(json_field "$HTTP_BODY" '.pool[0].denom')
    check_pass "Distribution: community pool" "${POOL_AMOUNT} ${POOL_DENOM}"
  else
    check_pass "Distribution: community pool" "empty (new chain)"
  fi
else
  check_fail "Distribution: community pool" false "HTTP $HTTP_CODE"
fi

# ────────────────────────────────────────────────────────────────────────────
#  SECTION 3: Custom ClawChain Modules
# ────────────────────────────────────────────────────────────────────────────
section "3. Custom ClawChain Modules (REST)"

# Helper for module param checks
check_module_params() {
  local module_name="$1"
  local endpoint="$2"
  http_get "${REST_URL}${endpoint}"
  if [[ "$HTTP_CODE" == "200" ]]; then
    check_pass "${module_name}: params" "HTTP $HTTP_CODE"
  elif [[ "$HTTP_CODE" == "501" ]]; then
    check_warn "${module_name}: params" "Not Implemented (HTTP 501)"
  else
    check_fail "${module_name}: params" false "HTTP $HTTP_CODE"
  fi
}

# Helper for module query checks (may return Not Implemented)
check_module_query() {
  local label="$1"
  local endpoint="$2"
  local critical="${3:-false}"
  http_get "${REST_URL}${endpoint}"
  if [[ "$HTTP_CODE" == "200" ]]; then
    check_pass "$label" "HTTP $HTTP_CODE"
  elif [[ "$HTTP_CODE" == "501" ]]; then
    check_warn "$label" "Not Implemented (expected for this Docker image)"
  elif [[ "$HTTP_CODE" == "400" ]] || [[ "$HTTP_CODE" == "404" ]]; then
    check_warn "$label" "HTTP $HTTP_CODE (endpoint exists but no data)"
  else
    if [[ "$critical" == "true" ]]; then
      check_fail "$label" true "HTTP $HTTP_CODE"
    else
      check_fail "$label" false "HTTP $HTTP_CODE"
    fi
  fi
}

subsection "Agent Module"
check_module_params "Agent" "/clawchain/agent/v1/params"
check_module_query  "Agent: agent list" "/clawchain/agent/v1/agents"
check_module_query  "Agent: live agents" "/clawchain/agent/v1/live_agents"
check_module_query  "Agent: agent stats" "/clawchain/agent/v1/stats"

subsection "Privacy Module"
check_module_params "Privacy" "/clawchain/privacy/v1/params"
check_module_query  "Privacy: tree stats" "/clawchain/privacy/v1/tree_stats"

subsection "Marketplace Module"
check_module_params "Marketplace" "/clawchain/marketplace/v1/params"

subsection "Reputation Module"
check_module_params "Reputation" "/clawchain/reputation/v1/params"

subsection "Messaging Module"
check_module_params "Messaging" "/clawchain/messaging/v1/params"

# ────────────────────────────────────────────────────────────────────────────
#  SECTION 4: Transaction Processing
# ────────────────────────────────────────────────────────────────────────────
section "4. Transaction Processing"

if $SKIP_TX; then
  echo -e "  ${DIM}Skipped (--skip-tx)${NC}"
else
  # Check Docker container is available
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${DOCKER_NODE}$"; then
    check_warn "Docker node container" "${DOCKER_NODE} not found, skipping tx tests"
  else
    subsection "Bank Send (validator -> faucet)"

    # Record faucet balance before
    http_get "${REST_URL}/cosmos/bank/v1beta1/balances/${FAUCET_ADDR}"
    BEFORE_BAL=$(json_field "$HTTP_BODY" '.balances[] | select(.denom=="uclaw") | .amount')
    BEFORE_BAL="${BEFORE_BAL:-0}"
    echo -e "  ${DIM}Faucet balance before: ${BEFORE_BAL} uclaw${NC}"

    SEND_AMOUNT="1000"
    echo -e "  ${DIM}Sending ${SEND_AMOUNT} uclaw from validator to faucet...${NC}"

    # Execute bank send via docker exec
    # Note: --home /clawchain is required because the testnet Docker image
    # stores keys and config under /clawchain, not the default ~/.clawchain.
    TX_OUTPUT=$(docker exec "${DOCKER_NODE}" clawchaind tx bank send \
      validator "${FAUCET_ADDR}" "${SEND_AMOUNT}uclaw" \
      --chain-id "${CHAIN_ID}" \
      --keyring-backend test \
      --home /clawchain \
      --fees "500uclaw" \
      --yes \
      --output json \
      2>&1) || true

    TX_HASH=$(echo "$TX_OUTPUT" | jq -r '.txhash' 2>/dev/null || echo "")

    if [[ -n "$TX_HASH" ]] && [[ "$TX_HASH" != "null" ]] && [[ "$TX_HASH" != "" ]]; then
      check_pass "Tx broadcast" "hash=$TX_HASH"

      # Wait for tx to be included in a block
      echo -e "  ${DIM}Waiting for tx inclusion (up to ${BLOCK_WAIT_TIMEOUT}s)...${NC}"
      TX_INCLUDED=false
      ELAPSED=0
      while (( ELAPSED < BLOCK_WAIT_TIMEOUT )); do
        sleep 2
        ELAPSED=$(( ELAPSED + 2 ))
        http_get "${REST_URL}/cosmos/tx/v1beta1/txs/${TX_HASH}"
        TX_CODE=$(json_field "$HTTP_BODY" '.tx_response.code')
        TX_HEIGHT=$(json_field "$HTTP_BODY" '.tx_response.height')
        if [[ "$HTTP_CODE" == "200" ]] && [[ -n "$TX_HEIGHT" ]] && [[ "$TX_HEIGHT" != "null" ]] && [[ "$TX_HEIGHT" != "0" ]]; then
          TX_INCLUDED=true
          break
        fi
      done

      if $TX_INCLUDED; then
        if [[ "$TX_CODE" == "0" ]]; then
          check_pass "Tx included in block" "height=$TX_HEIGHT code=$TX_CODE"
        else
          check_fail "Tx succeeded" true "code=$TX_CODE (non-zero) height=$TX_HEIGHT"
        fi

        # Verify balance changed
        http_get "${REST_URL}/cosmos/bank/v1beta1/balances/${FAUCET_ADDR}"
        AFTER_BAL=$(json_field "$HTTP_BODY" '.balances[] | select(.denom=="uclaw") | .amount')
        AFTER_BAL="${AFTER_BAL:-0}"
        echo -e "  ${DIM}Faucet balance after: ${AFTER_BAL} uclaw${NC}"

        if (( AFTER_BAL > BEFORE_BAL )); then
          DIFF=$(( AFTER_BAL - BEFORE_BAL ))
          check_pass "Balance increased" "+${DIFF} uclaw"
        elif (( AFTER_BAL == BEFORE_BAL )); then
          check_warn "Balance unchanged" "before=${BEFORE_BAL} after=${AFTER_BAL}"
        else
          check_fail "Balance increased" true "before=${BEFORE_BAL} after=${AFTER_BAL}"
        fi
      else
        check_fail "Tx included in block" true "not included after ${BLOCK_WAIT_TIMEOUT}s"
      fi
    else
      # Try to extract error from output
      TX_ERR=$(echo "$TX_OUTPUT" | head -3)
      check_fail "Tx broadcast" true "no txhash returned: ${TX_ERR:0:120}"
    fi
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
#  SECTION 5: Web Dashboard Connectivity
# ────────────────────────────────────────────────────────────────────────────
section "5. Web Dashboard Connectivity"

if $SKIP_WEB; then
  echo -e "  ${DIM}Skipped (--skip-web)${NC}"
else
  subsection "Vite Dev Server"

  # Check if web dashboard is running.
  # Note: Grafana Docker may occupy :3000, in which case the Vite dev server
  # would need to be on a different port.  We look for an HTML response to
  # distinguish a Vite app from Grafana JSON.
  http_get "${WEB_URL}"
  if [[ "$HTTP_CODE" == "200" ]]; then
    if echo "$HTTP_BODY" | grep -qi "</html>" 2>/dev/null; then
      check_pass "Web dashboard reachable" "HTTP $HTTP_CODE (HTML response)"
    else
      check_warn "Web port reachable but response is not HTML" "Grafana or other service may be on ${WEB_URL}"
    fi
  else
    check_warn "Web dashboard not reachable" "HTTP $HTTP_CODE (dev server may not be running)"
  fi

  subsection "Proxy Endpoints"

  # /api proxy -> REST :1317
  http_get "${WEB_URL}/api/cosmos/bank/v1beta1/supply"
  if [[ "$HTTP_CODE" == "200" ]]; then
    PROXY_SUPPLY=$(json_field "$HTTP_BODY" '.supply | length')
    check_pass "Proxy /api -> REST" "supply returned ($PROXY_SUPPLY denom(s))"
  elif [[ "$HTTP_CODE" == "000" ]]; then
    check_warn "Proxy /api -> REST" "connection refused (web dev server not running?)"
  else
    check_fail "Proxy /api -> REST" false "HTTP $HTTP_CODE"
  fi

  # /rpc proxy -> RPC :26657
  http_get "${WEB_URL}/rpc/status"
  if [[ "$HTTP_CODE" == "200" ]]; then
    PROXY_HEIGHT=$(json_field "$HTTP_BODY" '.result.sync_info.latest_block_height')
    check_pass "Proxy /rpc -> RPC" "height=$PROXY_HEIGHT"
  elif [[ "$HTTP_CODE" == "000" ]]; then
    check_warn "Proxy /rpc -> RPC" "connection refused (web dev server not running?)"
  else
    check_fail "Proxy /rpc -> RPC" false "HTTP $HTTP_CODE"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
#  SECTION 6: Infrastructure Services
# ────────────────────────────────────────────────────────────────────────────
section "6. Infrastructure Services"

if $SKIP_INFRA; then
  echo -e "  ${DIM}Skipped (--skip-infra)${NC}"
else
  subsection "Monitoring Stack"

  # Prometheus
  http_get "${PROMETHEUS_URL}/-/healthy"
  if [[ "$HTTP_CODE" == "200" ]]; then
    check_pass "Prometheus healthy" "${PROMETHEUS_URL}"
  elif [[ "$HTTP_CODE" == "000" ]]; then
    check_warn "Prometheus not reachable" "${PROMETHEUS_URL} (may not be deployed)"
  else
    check_warn "Prometheus unhealthy" "HTTP $HTTP_CODE"
  fi

  # Check Prometheus targets if available
  http_get "${PROMETHEUS_URL}/api/v1/targets"
  if [[ "$HTTP_CODE" == "200" ]]; then
    ACTIVE_TARGETS=$(json_field "$HTTP_BODY" '.data.activeTargets | length')
    check_pass "Prometheus targets" "$ACTIVE_TARGETS active target(s)"
  fi

  # AlertManager
  http_get "${ALERTMANAGER_URL}/-/healthy"
  if [[ "$HTTP_CODE" == "200" ]]; then
    check_pass "AlertManager healthy" "${ALERTMANAGER_URL}"
  elif [[ "$HTTP_CODE" == "000" ]]; then
    check_warn "AlertManager not reachable" "${ALERTMANAGER_URL} (may not be deployed)"
  else
    check_warn "AlertManager unhealthy" "HTTP $HTTP_CODE"
  fi

  # Grafana -- in the Docker testnet Grafana is on :3000 (same port web dev
  # server would use).  We test /api/health which is Grafana-specific.
  http_get "${GRAFANA_URL}/api/health"
  if [[ "$HTTP_CODE" == "200" ]]; then
    GRAF_DB=$(json_field "$HTTP_BODY" '.database')
    if [[ -n "$GRAF_DB" ]] && [[ "$GRAF_DB" != "null" ]] && [[ "$GRAF_DB" != "" ]]; then
      check_pass "Grafana healthy" "${GRAFANA_URL} db=$GRAF_DB"
    else
      check_warn "Grafana port reachable but /api/health not Grafana" "${GRAFANA_URL} (may be Vite dev server instead)"
    fi
  elif [[ "$HTTP_CODE" == "000" ]]; then
    check_warn "Grafana not reachable" "${GRAFANA_URL} (may not be deployed)"
  else
    check_warn "Grafana status" "HTTP $HTTP_CODE at ${GRAFANA_URL}"
  fi

  subsection "Docker Containers"

  # Check for running ClawChain containers
  RUNNING_CONTAINERS=$(docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -i "claw" || true)
  if [[ -n "$RUNNING_CONTAINERS" ]]; then
    CONTAINER_COUNT=$(echo "$RUNNING_CONTAINERS" | wc -l | tr -d ' ')
    check_pass "ClawChain containers running" "$CONTAINER_COUNT container(s)"

    # Print each container status
    while IFS=$'\t' read -r name status; do
      if echo "$status" | grep -qi "healthy"; then
        printf "    ${GREEN}+${NC} %-30s %s\n" "$name" "$status"
      elif echo "$status" | grep -qi "unhealthy"; then
        printf "    ${RED}-${NC} %-30s %s\n" "$name" "$status"
      else
        printf "    ${YELLOW}~${NC} %-30s %s\n" "$name" "$status"
      fi
    done <<< "$RUNNING_CONTAINERS"
  else
    check_warn "No ClawChain Docker containers found"
  fi

  # Specifically check the 4 validator nodes
  subsection "Validator Nodes"
  for i in 0 1 2 3; do
    NODE_NAME="clawchain-node${i}"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${NODE_NAME}$"; then
      # docker inspect errors if container has no healthcheck configured;
      # redirect stderr and default to "no-healthcheck" on failure.
      NODE_STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$NODE_NAME" 2>/dev/null || echo "no-healthcheck")
      NODE_STATUS=$(echo "$NODE_STATUS" | tr -d '[:space:]')  # strip whitespace/newlines
      if [[ "$NODE_STATUS" == "healthy" ]]; then
        check_pass "Validator ${NODE_NAME}" "healthy"
      elif [[ "$NODE_STATUS" == "no-healthcheck" ]] || [[ -z "$NODE_STATUS" ]]; then
        # No healthcheck defined, but container is running
        check_pass "Validator ${NODE_NAME}" "running (no healthcheck)"
      else
        check_warn "Validator ${NODE_NAME}" "status=$NODE_STATUS"
      fi
    else
      check_warn "Validator ${NODE_NAME}" "container not found"
    fi
  done

  # Check chain metrics endpoint (Prometheus scrape target on node)
  subsection "Chain Metrics"
  http_get "http://localhost:26660/metrics"
  if [[ "$HTTP_CODE" == "200" ]]; then
    check_pass "CometBFT metrics endpoint" ":26660/metrics"
  elif [[ "$HTTP_CODE" == "000" ]]; then
    check_warn "CometBFT metrics" "port 26660 not exposed"
  else
    check_warn "CometBFT metrics" "HTTP $HTTP_CODE"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ════════════════════════════════════════════════════════════════════════════
TOTAL=$(( PASS + FAIL + WARN ))

echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  VALIDATION SUMMARY${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}   ${PASS}"
echo -e "  ${RED}Failed:${NC}   ${FAIL}  (${CRITICAL_FAIL} critical)"
echo -e "  ${YELLOW}Warnings:${NC} ${WARN}"
echo -e "  ${BOLD}Total:${NC}    ${TOTAL}"
echo ""

if (( CRITICAL_FAIL > 0 )); then
  echo -e "  ${RED}${BOLD}RESULT: FAIL${NC}  --  ${CRITICAL_FAIL} critical test(s) failed"
  echo ""
  exit 1
elif (( FAIL > 0 )); then
  echo -e "  ${YELLOW}${BOLD}RESULT: DEGRADED${NC}  --  ${FAIL} non-critical failure(s)"
  echo ""
  exit 0
elif (( WARN > 0 )); then
  echo -e "  ${YELLOW}${BOLD}RESULT: PASS (with warnings)${NC}  --  ${WARN} warning(s)"
  echo ""
  exit 0
else
  echo -e "  ${GREEN}${BOLD}RESULT: PASS${NC}  --  all ${TOTAL} tests passed"
  echo ""
  exit 0
fi
