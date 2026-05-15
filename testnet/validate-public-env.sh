#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
ENV_FILE="${1:-$TESTNET_DIR/public.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  echo "copy template and edit values first: cp $TESTNET_DIR/public.env.example $TESTNET_DIR/public.env" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

MODE="${TESTNET_PUBLISH_MODE:-ssh}"
STRICT_PUBLIC="${STRICT_PUBLIC:-0}"
errors=0

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "missing required env var: $name" >&2
    errors=$((errors + 1))
  fi
}

require_url_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "missing required env var: $name" >&2
    errors=$((errors + 1))
    return
  fi
  if [[ ! "$value" =~ ^https?:// ]]; then
    echo "invalid URL in $name: expected http(s)://..., got '$value'" >&2
    errors=$((errors + 1))
  fi
}

require_https_var_when_strict() {
  local name="$1"
  local value="${!name:-}"
  if [[ "$STRICT_PUBLIC" != "1" ]]; then
    return 0
  fi
  if [[ ! "$value" =~ ^https:// ]]; then
    echo "strict public mode requires https URL in $name, got '$value'" >&2
    errors=$((errors + 1))
  fi
}

reject_placeholder() {
  local name="$1"
  local value="${!name:-}"
  if [[ "$value" == *"example"* || "$value" == *"REPLACE_"* || "$value" == *"your-"* ]]; then
    echo "placeholder value in $name: '$value'" >&2
    errors=$((errors + 1))
  fi
}

reject_localhost_url() {
  local name="$1"
  local value="${!name:-}"
  if [[ "$value" == *"127.0.0.1"* || "$value" == *"localhost"* ]]; then
    echo "public URL cannot use localhost in $name: '$value'" >&2
    errors=$((errors + 1))
  fi
}

require_url_var PUBLIC_BASE_URL
require_url_var PUBLIC_RPC_URL
require_url_var PUBLIC_REST_URL
require_var PUBLIC_GRPC_ADDR
require_url_var PUBLIC_FAUCET_URL
require_url_var PUBLIC_GRAFANA_URL
require_url_var PUBLIC_PROMETHEUS_URL
require_var SEED_NODE_ID
require_var SEED_HOST
require_var SEED_P2P_PORT

reject_placeholder PUBLIC_BASE_URL
reject_placeholder PUBLIC_RPC_URL
reject_placeholder PUBLIC_REST_URL
reject_placeholder PUBLIC_GRPC_ADDR
reject_placeholder PUBLIC_FAUCET_URL
reject_placeholder PUBLIC_GRAFANA_URL
reject_placeholder PUBLIC_PROMETHEUS_URL
reject_placeholder SEED_NODE_ID
reject_placeholder SEED_HOST

require_https_var_when_strict PUBLIC_BASE_URL
require_https_var_when_strict PUBLIC_RPC_URL
require_https_var_when_strict PUBLIC_REST_URL
require_https_var_when_strict PUBLIC_FAUCET_URL
require_https_var_when_strict PUBLIC_GRAFANA_URL
require_https_var_when_strict PUBLIC_PROMETHEUS_URL

if [[ "$STRICT_PUBLIC" == "1" ]]; then
  reject_localhost_url PUBLIC_BASE_URL
  reject_localhost_url PUBLIC_RPC_URL
  reject_localhost_url PUBLIC_REST_URL
  reject_localhost_url PUBLIC_FAUCET_URL
  reject_localhost_url PUBLIC_GRAFANA_URL
  reject_localhost_url PUBLIC_PROMETHEUS_URL
fi

case "$MODE" in
  none)
    ;;
  local)
    require_var TESTNET_PUBLISH_LOCAL_DIR
    ;;
  s3)
    require_var TESTNET_PUBLISH_S3_URI
    ;;
  ssh)
    require_var TESTNET_PUBLISH_SSH_TARGET
    require_var TESTNET_PUBLISH_SSH_DIR
    ;;
  *)
    echo "invalid TESTNET_PUBLISH_MODE: $MODE (expected none|local|s3|ssh)" >&2
    errors=$((errors + 1))
    ;;
esac

if [[ "$errors" -gt 0 ]]; then
  echo "public env validation failed with $errors error(s)." >&2
  exit 1
fi

echo "public env validation passed."
echo "  mode: $MODE"
echo "  base: ${PUBLIC_BASE_URL}"
