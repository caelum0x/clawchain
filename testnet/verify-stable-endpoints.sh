#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
ENV_FILE="${1:-$TESTNET_DIR/public.env}"
MANIFEST_FILE="${2:-$TESTNET_DIR/public/manifest.json}"
STATUS_FILE="${3:-$TESTNET_DIR/public/status.json}"

REQUIRE_COMPONENTS_UP="${REQUIRE_COMPONENTS_UP:-1}"
PROBE_TIMEOUT_SEC="${PROBE_TIMEOUT_SEC:-5}"
STRICT_PUBLIC="${STRICT_PUBLIC:-0}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi
if [[ ! -f "$MANIFEST_FILE" ]]; then
  echo "missing manifest file: $MANIFEST_FILE" >&2
  exit 1
fi
if [[ ! -f "$STATUS_FILE" ]]; then
  echo "missing status file: $STATUS_FILE" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

errors=0

check_equal() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "mismatch for $label" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    errors=$((errors + 1))
  fi
}

check_public_http_url_policy() {
  local value="$1"
  local label="$2"
  if [[ "$STRICT_PUBLIC" != "1" ]]; then
    return 0
  fi
  if [[ ! "$value" =~ ^https:// ]]; then
    echo "strict public mode requires https URL for $label: $value" >&2
    errors=$((errors + 1))
  fi
  if [[ "$value" == *"127.0.0.1"* || "$value" == *"localhost"* ]]; then
    echo "strict public mode forbids localhost URL for $label: $value" >&2
    errors=$((errors + 1))
  fi
}

check_public_grpc_policy() {
  local value="$1"
  local label="$2"
  if [[ "$STRICT_PUBLIC" != "1" ]]; then
    return 0
  fi
  if [[ "$value" == *"127.0.0.1"* || "$value" == *"localhost"* ]]; then
    echo "strict public mode forbids localhost address for $label: $value" >&2
    errors=$((errors + 1))
  fi
}

check_manifest_endpoint() {
  local jq_path="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual="$(jq -r "$jq_path" "$MANIFEST_FILE")"
  check_equal "$expected" "$actual" "$label"
}

check_status_endpoint() {
  local jq_path="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual="$(jq -r "$jq_path" "$STATUS_FILE")"
  check_equal "$expected" "$actual" "$label"
}

check_component_up() {
  local component="$1"
  local status
  status="$(jq -r ".components.${component}.status" "$STATUS_FILE")"
  if [[ "$REQUIRE_COMPONENTS_UP" == "1" && "$status" != "up" ]]; then
    local err
    err="$(jq -r ".components.${component}.error" "$STATUS_FILE")"
    echo "component ${component} is not up (status=${status}, error=${err})" >&2
    errors=$((errors + 1))
  fi
}

probe_http() {
  local label="$1"
  local url="$2"
  if ! curl -fsS -m "$PROBE_TIMEOUT_SEC" -o /dev/null "$url"; then
    echo "live probe failed for $label: $url" >&2
    errors=$((errors + 1))
  fi
}

probe_tcp() {
  local label="$1"
  local addr="$2"
  if ! command -v nc >/dev/null 2>&1; then
    echo "nc not installed; skipping live tcp probe for $label ($addr)" >&2
    return 0
  fi
  local host="${addr%:*}"
  local port="${addr##*:}"
  if [[ -z "$host" || -z "$port" || "$host" == "$addr" ]]; then
    echo "invalid $label address: $addr" >&2
    errors=$((errors + 1))
    return 0
  fi
  if ! nc -z -w "$PROBE_TIMEOUT_SEC" "$host" "$port" >/dev/null 2>&1; then
    echo "live tcp probe failed for $label: $addr" >&2
    errors=$((errors + 1))
  fi
}

check_manifest_endpoint '.endpoints.rpc' "${PUBLIC_RPC_URL:-}" "manifest.endpoints.rpc"
check_manifest_endpoint '.endpoints.rest' "${PUBLIC_REST_URL:-}" "manifest.endpoints.rest"
check_manifest_endpoint '.endpoints.grpc' "${PUBLIC_GRPC_ADDR:-}" "manifest.endpoints.grpc"
check_manifest_endpoint '.endpoints.faucet' "${PUBLIC_FAUCET_URL:-}" "manifest.endpoints.faucet"
check_manifest_endpoint '.endpoints.grafana' "${PUBLIC_GRAFANA_URL:-}" "manifest.endpoints.grafana"
check_manifest_endpoint '.endpoints.prometheus' "${PUBLIC_PROMETHEUS_URL:-}" "manifest.endpoints.prometheus"

check_status_endpoint '.components.rpc.url' "${PUBLIC_RPC_URL:-}" "status.components.rpc.url"
check_status_endpoint '.components.rest.url' "${PUBLIC_REST_URL:-}" "status.components.rest.url"
check_status_endpoint '.components.grpc.address' "${PUBLIC_GRPC_ADDR:-}" "status.components.grpc.address"
check_status_endpoint '.components.faucet.url' "${PUBLIC_FAUCET_URL:-}" "status.components.faucet.url"
check_status_endpoint '.components.grafana.url' "${PUBLIC_GRAFANA_URL:-}" "status.components.grafana.url"
check_status_endpoint '.components.prometheus.url' "${PUBLIC_PROMETHEUS_URL:-}" "status.components.prometheus.url"

check_public_http_url_policy "${PUBLIC_RPC_URL:-}" "PUBLIC_RPC_URL"
check_public_http_url_policy "${PUBLIC_REST_URL:-}" "PUBLIC_REST_URL"
check_public_http_url_policy "${PUBLIC_FAUCET_URL:-}" "PUBLIC_FAUCET_URL"
check_public_http_url_policy "${PUBLIC_GRAFANA_URL:-}" "PUBLIC_GRAFANA_URL"
check_public_http_url_policy "${PUBLIC_PROMETHEUS_URL:-}" "PUBLIC_PROMETHEUS_URL"
check_public_grpc_policy "${PUBLIC_GRPC_ADDR:-}" "PUBLIC_GRPC_ADDR"

check_component_up "rpc"
check_component_up "rest"
check_component_up "grpc"
check_component_up "faucet"
check_component_up "grafana"
check_component_up "prometheus"

probe_http "rpc" "${PUBLIC_RPC_URL%/}/health"
probe_http "rest" "${PUBLIC_REST_URL%/}/cosmos/base/tendermint/v1beta1/syncing"
probe_http "faucet" "${PUBLIC_FAUCET_URL%/}/health"
probe_http "grafana" "${PUBLIC_GRAFANA_URL%/}/api/health"
probe_http "prometheus" "${PUBLIC_PROMETHEUS_URL%/}/-/healthy"
probe_tcp "grpc" "${PUBLIC_GRPC_ADDR:-}"

if [[ "$errors" -gt 0 ]]; then
  echo "stable endpoint verification failed with $errors error(s)." >&2
  exit 1
fi

echo "stable endpoint verification passed."
echo "  manifest: $MANIFEST_FILE"
echo "  status:   $STATUS_FILE"
echo "  rpc:      ${PUBLIC_RPC_URL:-}"
echo "  rest:     ${PUBLIC_REST_URL:-}"
echo "  faucet:   ${PUBLIC_FAUCET_URL:-}"
echo "  grafana:  ${PUBLIC_GRAFANA_URL:-}"
echo "  prom:     ${PUBLIC_PROMETHEUS_URL:-}"
echo "  grpc:     ${PUBLIC_GRPC_ADDR:-}"
