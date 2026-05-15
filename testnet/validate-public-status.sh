#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
STATUS_FILE="${1:-$TESTNET_DIR/public/status.json}"
STRICT_PUBLIC="${STRICT_PUBLIC:-0}"

if [[ ! -f "$STATUS_FILE" ]]; then
  echo "missing status file: $STATUS_FILE" >&2
  echo "run: make testnet-public-manifest" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

errors=0

check_non_empty() {
  local jq_path="$1"
  local label="$2"
  local value
  value="$(jq -r "$jq_path" "$STATUS_FILE")"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "missing $label ($jq_path)" >&2
    errors=$((errors + 1))
  fi
}

check_http_url() {
  local jq_path="$1"
  local label="$2"
  local value
  value="$(jq -r "$jq_path" "$STATUS_FILE")"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "missing $label ($jq_path)" >&2
    errors=$((errors + 1))
    return
  fi
  if [[ ! "$value" =~ ^https?:// ]]; then
    echo "invalid $label URL: '$value'" >&2
    errors=$((errors + 1))
  fi
  if [[ "$STRICT_PUBLIC" == "1" && ! "$value" =~ ^https:// ]]; then
    echo "strict public mode requires https URL for $label: '$value'" >&2
    errors=$((errors + 1))
  fi
  if [[ "$STRICT_PUBLIC" == "1" && ( "$value" == *"127.0.0.1"* || "$value" == *"localhost"* ) ]]; then
    echo "public status cannot use localhost URL for $label: '$value'" >&2
    errors=$((errors + 1))
  fi
}

check_non_empty '.network' "network"
check_non_empty '.chainId' "chainId"
check_non_empty '.updatedAtUtc' "updatedAtUtc"
check_non_empty '.status' "status"
check_http_url '.components.rpc.url' "rpc"
check_http_url '.components.rest.url' "rest"
check_http_url '.components.faucet.url' "faucet"
check_http_url '.components.grafana.url' "grafana"
check_http_url '.components.prometheus.url' "prometheus"
check_non_empty '.components.grpc.address' "grpc address"

check_component_status() {
  local component="$1"
  local status
  status="$(jq -r ".components.${component}.status" "$STATUS_FILE")"
  case "$status" in
    up|down|unknown)
      ;;
    *)
      echo "invalid status for ${component}: '$status' (expected up|down|unknown)" >&2
      errors=$((errors + 1))
      ;;
  esac
}

check_component_probe_fields() {
  local component="$1"
  check_non_empty ".components.${component}.checkedAtUtc" "${component}.checkedAtUtc"
  if [[ "$(jq -r ".components.${component} | has(\"probeTarget\")" "$STATUS_FILE")" != "true" ]]; then
    echo "missing ${component}.probeTarget field" >&2
    errors=$((errors + 1))
  fi
  # `error` can be empty when component is up; require key presence only.
  if [[ "$(jq -r ".components.${component} | has(\"error\")" "$STATUS_FILE")" != "true" ]]; then
    echo "missing ${component}.error field" >&2
    errors=$((errors + 1))
  fi

  local status
  local err
  status="$(jq -r ".components.${component}.status" "$STATUS_FILE")"
  err="$(jq -r ".components.${component}.error" "$STATUS_FILE")"
  if [[ "$status" == "up" && -n "$err" ]]; then
    echo "invalid ${component}.error: must be empty when status is up" >&2
    errors=$((errors + 1))
  fi
  if [[ "$status" != "up" && -z "$err" ]]; then
    echo "invalid ${component}.error: must be non-empty when status is down/unknown" >&2
    errors=$((errors + 1))
  fi
}

check_component_status "rpc"
check_component_status "rest"
check_component_status "grpc"
check_component_status "faucet"
check_component_status "grafana"
check_component_status "prometheus"

check_component_probe_fields "rpc"
check_component_probe_fields "rest"
check_component_probe_fields "grpc"
check_component_probe_fields "faucet"
check_component_probe_fields "grafana"
check_component_probe_fields "prometheus"

if [[ "$errors" -gt 0 ]]; then
  echo "status validation failed with $errors error(s)." >&2
  exit 1
fi

echo "public status validation passed."
echo "  file: $STATUS_FILE"
