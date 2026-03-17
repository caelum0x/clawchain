#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# ClawChain Endpoint Smoke Test  --  Phase 13 Track B
#
# Quick post-deploy verification: hits every public endpoint once and asserts
# a valid response.  Designed to run in <10 s on a healthy node.
#
# Usage:
#   ./scripts/endpoint-smoke.sh                          # defaults
#   RPC_URL=http://myhost:26657 ./scripts/endpoint-smoke.sh
#
# Exit codes:  0 = all passed   1 = one or more failures
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RPC_URL="${RPC_URL:-http://localhost:26657}"
GRPC_GATEWAY_URL="${GRPC_GATEWAY_URL:-http://localhost:1317}"
REST_URL="${REST_URL:-http://localhost:1317}"
CURL_TIMEOUT="${CURL_TIMEOUT:-5}"

PASS=0
FAIL=0
RESULTS=()

# ── Helpers ───────────────────────────────────────────────────────────────────
smoke() {
  local label="$1" url="$2" expected_field="$3"

  printf "  %-40s" "$label"

  local resp http_code body
  http_code=$(curl -so /dev/null -w '%{http_code}' --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null || echo "000")

  if [[ "$http_code" != "200" ]]; then
    echo "FAIL  (HTTP $http_code)"
    FAIL=$(( FAIL + 1 ))
    RESULTS+=("{\"test\":\"${label}\",\"status\":\"fail\",\"http_code\":${http_code}}")
    return
  fi

  # Optionally verify a field exists in the response body
  if [[ -n "$expected_field" ]]; then
    body=$(curl -sf --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null || echo "")
    if echo "$body" | grep -q "$expected_field"; then
      echo "OK"
      PASS=$(( PASS + 1 ))
      RESULTS+=("{\"test\":\"${label}\",\"status\":\"pass\",\"http_code\":200}")
    else
      echo "FAIL  (missing field: $expected_field)"
      FAIL=$(( FAIL + 1 ))
      RESULTS+=("{\"test\":\"${label}\",\"status\":\"fail\",\"http_code\":200,\"reason\":\"missing_field\"}")
    fi
  else
    echo "OK"
    PASS=$(( PASS + 1 ))
    RESULTS+=("{\"test\":\"${label}\",\"status\":\"pass\",\"http_code\":200}")
  fi
}

# ── Run smoke tests ──────────────────────────────────────────────────────────
echo "ClawChain Endpoint Smoke Test"
echo "============================="
echo ""
echo "RPC:          $RPC_URL"
echo "gRPC-gateway: $GRPC_GATEWAY_URL"
echo "REST:         $REST_URL"
echo ""

echo "-- RPC Endpoints --"
smoke "RPC /status"                       "${RPC_URL}/status"                         "latest_block_height"
smoke "RPC /health"                       "${RPC_URL}/health"                         ""
smoke "RPC /net_info"                     "${RPC_URL}/net_info"                       "n_peers"
smoke "RPC /abci_info"                    "${RPC_URL}/abci_info"                      "response"
smoke "RPC /consensus_state"              "${RPC_URL}/consensus_state"                "round_state"

echo ""
echo "-- REST / gRPC-gateway Endpoints --"
smoke "REST /node_info"                   "${REST_URL}/cosmos/base/tendermint/v1beta1/node_info"       "default_node_info"
smoke "REST /syncing"                     "${REST_URL}/cosmos/base/tendermint/v1beta1/syncing"         "syncing"
smoke "REST /latest_block"                "${REST_URL}/cosmos/base/tendermint/v1beta1/blocks/latest"   "block_id"
smoke "REST /bank/supply"                 "${REST_URL}/cosmos/bank/v1beta1/supply"                     "supply"
smoke "REST /staking/validators"          "${REST_URL}/cosmos/staking/v1beta1/validators"              "validators"
smoke "REST /slashing/signing_infos"      "${REST_URL}/cosmos/slashing/v1beta1/signing_infos"          "info"
smoke "REST /gov/params/voting"           "${REST_URL}/cosmos/gov/v1/params/voting"                    "voting_params"

echo ""
echo "-- ClawChain Module Endpoints --"
smoke "Agent /params"                     "${REST_URL}/clawchain/agent/v1/params"                      ""
smoke "Privacy /params"                   "${REST_URL}/clawchain/privacy/v1/params"                    ""

echo ""
echo "============================="

# ── Summary ──────────────────────────────────────────────────────────────────
local_results=$(printf '%s\n' "${RESULTS[@]}" | paste -sd ',' -)
TOTAL=$(( PASS + FAIL ))

echo "Results: ${PASS}/${TOTAL} passed, ${FAIL} failed"
echo ""

# JSON summary
cat <<ENDJSON
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "passed": ${PASS},
  "failed": ${FAIL},
  "total": ${TOTAL},
  "tests": [${local_results}]
}
ENDJSON

if (( FAIL > 0 )); then
  echo ""
  echo "SMOKE TEST FAILED -- $FAIL endpoint(s) not responding correctly."
  exit 1
else
  echo ""
  echo "ALL ENDPOINTS HEALTHY"
  exit 0
fi
