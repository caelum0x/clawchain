#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
MANIFEST_FILE="${1:-$TESTNET_DIR/public/manifest.json}"
STRICT_PUBLIC="${STRICT_PUBLIC:-0}"

if [[ ! -f "$MANIFEST_FILE" ]]; then
  echo "missing manifest file: $MANIFEST_FILE" >&2
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
  value="$(jq -r "$jq_path" "$MANIFEST_FILE")"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "missing $label ($jq_path)" >&2
    errors=$((errors + 1))
    return
  fi
}

check_url() {
  local jq_path="$1"
  local label="$2"
  local value
  value="$(jq -r "$jq_path" "$MANIFEST_FILE")"
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
    echo "public manifest cannot use localhost URL for $label: '$value'" >&2
    errors=$((errors + 1))
  fi
}

check_non_empty '.network' "network"
check_non_empty '.publishedAtUtc' "publishedAtUtc"
check_non_empty '.chainId' "chainId"
check_non_empty '.genesis.sha256' "genesis.sha256"
check_non_empty '.genesis.path' "genesis.path"
check_url '.endpoints.rpc' "rpc"
check_url '.endpoints.rest' "rest"
check_url '.endpoints.faucet' "faucet"
check_url '.endpoints.grafana' "grafana"
check_url '.endpoints.prometheus' "prometheus"
check_non_empty '.endpoints.grpc' "grpc"
check_non_empty '.lifecycle.id' "lifecycle.id"
check_non_empty '.lifecycle.revision' "lifecycle.revision"
check_non_empty '.lifecycle.signatureCount' "lifecycle.signatureCount"
check_non_empty '.lifecycle.stableEndpointSet.rpc' "lifecycle.stableEndpointSet.rpc"
check_non_empty '.lifecycle.stableEndpointSet.rest' "lifecycle.stableEndpointSet.rest"
check_non_empty '.lifecycle.stableEndpointSet.faucet' "lifecycle.stableEndpointSet.faucet"
check_non_empty '.lifecycle.stableEndpointSet.grafana' "lifecycle.stableEndpointSet.grafana"
check_non_empty '.lifecycle.stableEndpointSet.prometheus' "lifecycle.stableEndpointSet.prometheus"

sha="$(jq -r '.genesis.sha256' "$MANIFEST_FILE")"
if [[ ! "$sha" =~ ^[0-9a-f]{64}$ ]]; then
  echo "invalid genesis.sha256: '$sha' (expected lowercase 64 hex chars)" >&2
  errors=$((errors + 1))
fi

seed_count="$(jq '.seeds | length' "$MANIFEST_FILE")"
if [[ "$seed_count" -lt 1 ]]; then
  echo "manifest seeds must include at least one entry" >&2
  errors=$((errors + 1))
fi

if jq -r '.seeds[]?' "$MANIFEST_FILE" | grep -Eq 'REPLACE_NODE_ID|example'; then
  echo "manifest seeds contain placeholder values" >&2
  errors=$((errors + 1))
fi

if [[ "$STRICT_PUBLIC" == "1" ]]; then
  sig_count="$(jq '.signatures | length' "$MANIFEST_FILE")"
  if [[ "$sig_count" -lt 1 ]]; then
    echo "public manifest must include at least one signature entry in signatures[]" >&2
    errors=$((errors + 1))
  fi
  if ! jq -e '.signatures[]? | .pubkey | test("^[0-9a-fA-F]{66}$")' "$MANIFEST_FILE" >/dev/null; then
    echo "manifest signatures[].pubkey must be 33-byte compressed secp256k1 hex" >&2
    errors=$((errors + 1))
  fi
  if ! jq -e '.signatures[]? | .signature | test("^[0-9a-fA-F]{128}$")' "$MANIFEST_FILE" >/dev/null; then
    echo "manifest signatures[].signature must be 64-byte secp256k1 signature hex" >&2
    errors=$((errors + 1))
  fi
  if [[ "$(jq -r '.lifecycle.signedUpdate' "$MANIFEST_FILE")" != "true" ]]; then
    echo "manifest lifecycle.signedUpdate must be true in strict public mode" >&2
    errors=$((errors + 1))
  fi
fi

if [[ "$errors" -gt 0 ]]; then
  echo "manifest validation failed with $errors error(s)." >&2
  exit 1
fi

echo "public manifest validation passed."
echo "  file: $MANIFEST_FILE"
