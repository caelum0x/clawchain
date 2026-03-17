#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ClawChain Endpoint Verification Script  --  Phase 17 Track B
#
# Reads testnet/manifest.json and verifies every listed endpoint is live and
# responding correctly. Intended for release gating and CI pipelines.
#
# Usage:
#   ./scripts/verify-endpoints.sh                             # default manifest
#   MANIFEST=path/to/manifest.json ./scripts/verify-endpoints.sh
#
# Exit codes:  0 = all endpoints pass   1 = one or more failures
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${MANIFEST:-${ROOT_DIR}/testnet/manifest.json}"
CURL_TIMEOUT="${CURL_TIMEOUT:-5}"

# ── Preflight ────────────────────────────────────────────────────────────────

if [[ ! -f "$MANIFEST" ]]; then
  echo "ERROR: manifest not found at ${MANIFEST}"
  echo "  Remediation: create testnet/manifest.json or set MANIFEST=<path>"
  exit 1
fi

# Require jq
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed."
  echo "  Remediation: brew install jq  (macOS) or apt-get install jq (Linux)"
  exit 1
fi

# ── Parse manifest ───────────────────────────────────────────────────────────

RPC_URL=$(jq -r '.endpoints.rpc // empty' "$MANIFEST")
REST_URL=$(jq -r '.endpoints.rest // empty' "$MANIFEST")
GRPC_ADDR=$(jq -r '.endpoints.grpc // empty' "$MANIFEST")
FAUCET_URL=$(jq -r '.endpoints.faucet // empty' "$MANIFEST")
PROMETHEUS_URL=$(jq -r '.endpoints.monitoring.prometheus // empty' "$MANIFEST")
GRAFANA_URL=$(jq -r '.endpoints.monitoring.grafana // empty' "$MANIFEST")
CHAIN_ID=$(jq -r '.chain_id // "unknown"' "$MANIFEST")

PASS=0
FAIL=0
TOTAL=0

# ── Helpers ──────────────────────────────────────────────────────────────────

check_http() {
  local label="$1" url="$2" expected_field="${3:-}"
  TOTAL=$(( TOTAL + 1 ))

  if [[ -z "$url" ]]; then
    printf "  %-45s SKIP  (not configured in manifest)\n" "$label"
    return
  fi

  printf "  %-45s" "$label"

  local http_code
  http_code=$(curl -so /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null || echo "000")

  if [[ "$http_code" == "000" ]]; then
    echo "FAIL  (connection refused or timeout)"
    echo "    Remediation: verify the service is running and the URL is correct: $url"
    FAIL=$(( FAIL + 1 ))
    return
  fi

  if [[ "$http_code" != "200" ]]; then
    echo "FAIL  (HTTP $http_code)"
    echo "    Remediation: check service logs; expected HTTP 200 from $url"
    FAIL=$(( FAIL + 1 ))
    return
  fi

  # Optionally verify a field in the response body
  if [[ -n "$expected_field" ]]; then
    local body
    body=$(curl -sf --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null || echo "")
    if echo "$body" | grep -q "$expected_field"; then
      echo "OK"
      PASS=$(( PASS + 1 ))
    else
      echo "FAIL  (missing expected field: $expected_field)"
      echo "    Remediation: endpoint responded but payload is unexpected; verify service version"
      FAIL=$(( FAIL + 1 ))
    fi
  else
    echo "OK"
    PASS=$(( PASS + 1 ))
  fi
}

check_grpc() {
  local label="$1" addr="$2"
  TOTAL=$(( TOTAL + 1 ))

  if [[ -z "$addr" ]]; then
    printf "  %-45s SKIP  (not configured in manifest)\n" "$label"
    return
  fi

  printf "  %-45s" "$label"

  # Extract host and port
  local host port
  host="${addr%%:*}"
  port="${addr##*:}"

  # Try a TCP connection to verify the gRPC port is open
  if command -v nc >/dev/null 2>&1; then
    if nc -z -w "$CURL_TIMEOUT" "$host" "$port" 2>/dev/null; then
      echo "OK  (port open)"
      PASS=$(( PASS + 1 ))
    else
      echo "FAIL  (port $port not reachable on $host)"
      echo "    Remediation: ensure gRPC server is listening on $addr"
      FAIL=$(( FAIL + 1 ))
    fi
  else
    # Fallback: attempt a curl to the gRPC address (will fail gracefully)
    local http_code
    http_code=$(curl -so /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "http://${addr}" 2>/dev/null || echo "000")
    if [[ "$http_code" != "000" ]]; then
      echo "OK  (port responding)"
      PASS=$(( PASS + 1 ))
    else
      echo "FAIL  (port not reachable; install nc for better gRPC checks)"
      echo "    Remediation: ensure gRPC server is listening on $addr"
      FAIL=$(( FAIL + 1 ))
    fi
  fi
}

# ── Run verification ────────────────────────────────────────────────────────

echo "ClawChain Endpoint Verification"
echo "================================"
echo ""
echo "Manifest:  $MANIFEST"
echo "Chain ID:  $CHAIN_ID"
echo ""

echo "-- RPC Endpoint --"
check_http "RPC /status"            "${RPC_URL}/status"          "latest_block_height"
check_http "RPC /health"            "${RPC_URL}/health"          ""
check_http "RPC /net_info"          "${RPC_URL}/net_info"        "n_peers"

echo ""
echo "-- REST Endpoint --"
check_http "REST /node_info"        "${REST_URL}/cosmos/base/tendermint/v1beta1/node_info"     "default_node_info"
check_http "REST /syncing"          "${REST_URL}/cosmos/base/tendermint/v1beta1/syncing"       "syncing"
check_http "REST /latest_block"     "${REST_URL}/cosmos/base/tendermint/v1beta1/blocks/latest" "block_id"

echo ""
echo "-- gRPC Endpoint --"
check_grpc "gRPC port"              "$GRPC_ADDR"

echo ""
echo "-- Faucet Endpoint --"
check_http "Faucet liveness"        "$FAUCET_URL"                ""

echo ""
echo "-- Monitoring Endpoints --"
check_http "Prometheus"             "$PROMETHEUS_URL"            ""
check_http "Grafana"                "$GRAFANA_URL"               ""

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "================================"
echo "Results: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo ""

if (( FAIL > 0 )); then
  echo "ENDPOINT VERIFICATION FAILED -- ${FAIL} endpoint(s) unreachable or unhealthy."
  echo ""
  echo "Common remediation steps:"
  echo "  1. Ensure the testnet is running (make testnet-start)"
  echo "  2. Verify manifest.json URLs match your deployment"
  echo "  3. Check firewall rules allow inbound traffic on required ports"
  echo "  4. Review service logs: docker compose logs -f"
  exit 1
else
  echo "ALL ENDPOINTS VERIFIED SUCCESSFULLY"
  exit 0
fi
