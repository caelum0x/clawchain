#!/usr/bin/env bash
set -euo pipefail

# Parse flags
REQUIRE_NODE_ID=false
for arg in "$@"; do
  case "$arg" in
    --require-node-id) REQUIRE_NODE_ID=true ;;
  esac
done

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
PUBLIC_DIR="$TESTNET_DIR/public"
GENESIS_FILE="$TESTNET_DIR/data/node0/config/genesis.json"
LIFECYCLE_FILE="$PUBLIC_DIR/manifest-lifecycle.json"
LIFECYCLE_LOG_FILE="$PUBLIC_DIR/manifest-lifecycle.log.jsonl"

if [[ ! -f "$GENESIS_FILE" ]]; then
  echo "missing genesis file: $GENESIS_FILE" >&2
  echo "run testnet/setup-testnet.sh first" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for testnet manifest generation" >&2
  exit 1
fi

CHAIN_ID="$(jq -r '.chain_id' "$GENESIS_FILE")"
if [[ -z "$CHAIN_ID" || "$CHAIN_ID" == "null" ]]; then
  echo "could not read chain_id from $GENESIS_FILE" >&2
  exit 1
fi

GENESIS_SHA256="$(
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$GENESIS_FILE" | awk '{print $1}'
  else
    shasum -a 256 "$GENESIS_FILE" | awk '{print $1}'
  fi
)"

SEED_NODE_HOME="${SEED_NODE_HOME:-$TESTNET_DIR/data/node0}"
SEED_HOST="${SEED_HOST:-127.0.0.1}"
SEED_P2P_PORT="${SEED_P2P_PORT:-26656}"
SEED_NODE_ID="${SEED_NODE_ID:-}"

if [[ -z "$SEED_NODE_ID" ]]; then
  if ! command -v clawchaind >/dev/null 2>&1; then
    echo "WARNING: clawchaind not found on PATH. Cannot auto-detect seed node ID." >&2
    if [[ "$REQUIRE_NODE_ID" == "true" ]]; then
      echo "ERROR: --require-node-id flag set but clawchaind is not on PATH and SEED_NODE_ID is not set." >&2
      echo "Install clawchaind (make install) or set SEED_NODE_ID env var." >&2
      exit 1
    fi
  else
    SEED_NODE_ID="$(clawchaind comet show-node-id --home "$SEED_NODE_HOME" 2>/dev/null || true)"
  fi
fi
if [[ -z "$SEED_NODE_ID" ]]; then
  SEED_NODE_ID="REPLACE_NODE_ID"
  echo "WARNING: Using placeholder seed node ID 'REPLACE_NODE_ID'." >&2
  echo "External validators will not be able to join with this manifest." >&2
  if [[ "$REQUIRE_NODE_ID" == "true" ]]; then
    echo "ERROR: --require-node-id flag set but seed node ID could not be determined." >&2
    exit 1
  fi
fi

PUBLISHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
PROBE_TIMEOUT_SEC="${PROBE_TIMEOUT_SEC:-3}"
ENABLE_PUBLIC_PROBES="${ENABLE_PUBLIC_PROBES:-1}"
MANIFEST_LIFECYCLE_ID="${MANIFEST_LIFECYCLE_ID:-public-testnet-stable-endpoints-v1}"

# Public endpoints can be set via env for real deployment values.
RPC_URL="${PUBLIC_RPC_URL:-http://127.0.0.1:26657}"
REST_URL="${PUBLIC_REST_URL:-http://127.0.0.1:1317}"
GRPC_ADDR="${PUBLIC_GRPC_ADDR:-127.0.0.1:9090}"
FAUCET_URL="${PUBLIC_FAUCET_URL:-http://127.0.0.1:8888}"
EXPLORER_URL="${PUBLIC_EXPLORER_URL:-}"
GRAFANA_URL="${PUBLIC_GRAFANA_URL:-}"
PROMETHEUS_URL="${PUBLIC_PROMETHEUS_URL:-}"
MANIFEST_SIGNATURE_PUBKEY="${MANIFEST_SIGNATURE_PUBKEY:-}"
MANIFEST_SIGNATURE_HEX="${MANIFEST_SIGNATURE_HEX:-}"

MANIFEST_SIGNATURES_JSON="[]"
if [[ -n "$MANIFEST_SIGNATURE_PUBKEY" && -n "$MANIFEST_SIGNATURE_HEX" ]]; then
  MANIFEST_SIGNATURES_JSON="$(printf '[{"pubkey":"%s","signature":"%s"}]' "$MANIFEST_SIGNATURE_PUBKEY" "$MANIFEST_SIGNATURE_HEX")"
fi
SIGNATURE_COUNT="$(printf '%s' "$MANIFEST_SIGNATURES_JSON" | jq 'length')"
SIGNED_UPDATE="false"
if [[ "$SIGNATURE_COUNT" -gt 0 ]]; then
  SIGNED_UPDATE="true"
fi

LIFECYCLE_REVISION=1
if [[ -f "$LIFECYCLE_FILE" ]]; then
  previous_revision="$(jq -r '.revision // 0' "$LIFECYCLE_FILE")"
  if [[ "$previous_revision" =~ ^[0-9]+$ ]]; then
    LIFECYCLE_REVISION="$((previous_revision + 1))"
  fi
fi

PREVIOUS_MANIFEST_SHA256=""
if [[ -f "$PUBLIC_DIR/manifest.json" ]]; then
  PREVIOUS_MANIFEST_SHA256="$(
    if command -v sha256sum >/dev/null 2>&1; then
      sha256sum "$PUBLIC_DIR/manifest.json" | awk '{print $1}'
    else
      shasum -a 256 "$PUBLIC_DIR/manifest.json" | awk '{print $1}'
    fi
  )"
fi

set_component_probe() {
  local prefix="$1"
  local status="$2"
  local checked="$3"
  local target="$4"
  local err="$5"
  printf -v "${prefix}_STATUS" "%s" "$status"
  printf -v "${prefix}_CHECKED_AT_UTC" "%s" "$checked"
  printf -v "${prefix}_PROBE_TARGET" "%s" "$target"
  printf -v "${prefix}_ERROR" "%s" "$err"
}

probe_http_component() {
  local prefix="$1"
  local base="$2"
  local timeout_sec="$3"
  shift 3

  local checked
  checked="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if [[ -z "$base" ]]; then
    set_component_probe "$prefix" "unknown" "$checked" "" "endpoint not configured"
    return 0
  fi
  if [[ ! "$base" =~ ^https?:// ]]; then
    set_component_probe "$prefix" "unknown" "$checked" "$base" "non-http endpoint"
    return 0
  fi

  local path
  local candidate
  local last_candidate="$base"
  local candidates=("$base")
  for path in "$@"; do
    candidates+=("${base%/}/${path}")
  done

  for candidate in "${candidates[@]}"; do
    last_candidate="$candidate"
    if curl -fsS -m "$timeout_sec" -o /dev/null "$candidate"; then
      set_component_probe "$prefix" "up" "$checked" "$candidate" ""
      return 0
    fi
  done

  set_component_probe "$prefix" "down" "$checked" "$last_candidate" "unreachable or non-2xx"
}

probe_grpc_component() {
  local prefix="$1"
  local grpc_addr="$2"
  local checked
  checked="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  if [[ -z "$grpc_addr" ]]; then
    set_component_probe "$prefix" "unknown" "$checked" "" "endpoint not configured"
    return 0
  fi
  if [[ "$grpc_addr" =~ ^https?:// ]]; then
    if curl -fsS -m "$PROBE_TIMEOUT_SEC" -o /dev/null "$grpc_addr"; then
      set_component_probe "$prefix" "up" "$checked" "$grpc_addr" ""
    else
      set_component_probe "$prefix" "down" "$checked" "$grpc_addr" "unreachable or non-2xx"
    fi
    return 0
  fi
  if ! command -v nc >/dev/null 2>&1; then
    set_component_probe "$prefix" "unknown" "$checked" "$grpc_addr" "nc not installed"
    return 0
  fi
  local host="${grpc_addr%:*}"
  local port="${grpc_addr##*:}"
  if [[ -z "$host" || -z "$port" || "$host" == "$grpc_addr" ]]; then
    set_component_probe "$prefix" "unknown" "$checked" "$grpc_addr" "invalid host:port"
    return 0
  fi
  if nc -z -w "$PROBE_TIMEOUT_SEC" "$host" "$port" >/dev/null 2>&1; then
    set_component_probe "$prefix" "up" "$checked" "$grpc_addr" ""
  else
    set_component_probe "$prefix" "down" "$checked" "$grpc_addr" "tcp dial failed"
  fi
}

RPC_STATUS="unknown"
RPC_CHECKED_AT_UTC=""
RPC_PROBE_TARGET=""
RPC_ERROR=""
REST_STATUS="unknown"
REST_CHECKED_AT_UTC=""
REST_PROBE_TARGET=""
REST_ERROR=""
GRPC_STATUS="unknown"
GRPC_CHECKED_AT_UTC=""
GRPC_PROBE_TARGET=""
GRPC_ERROR=""
FAUCET_STATUS="unknown"
FAUCET_CHECKED_AT_UTC=""
FAUCET_PROBE_TARGET=""
FAUCET_ERROR=""
GRAFANA_STATUS="unknown"
GRAFANA_CHECKED_AT_UTC=""
GRAFANA_PROBE_TARGET=""
GRAFANA_ERROR=""
PROMETHEUS_STATUS="unknown"
PROMETHEUS_CHECKED_AT_UTC=""
PROMETHEUS_PROBE_TARGET=""
PROMETHEUS_ERROR=""

if [[ "$ENABLE_PUBLIC_PROBES" == "1" ]]; then
  probe_http_component RPC "$RPC_URL" "$PROBE_TIMEOUT_SEC" "health"
  probe_http_component REST "$REST_URL" "$PROBE_TIMEOUT_SEC" "cosmos/base/tendermint/v1beta1/syncing" "health"
  probe_http_component FAUCET "$FAUCET_URL" "$PROBE_TIMEOUT_SEC" "health"
  probe_http_component GRAFANA "$GRAFANA_URL" "$PROBE_TIMEOUT_SEC" "api/health"
  probe_http_component PROMETHEUS "$PROMETHEUS_URL" "$PROBE_TIMEOUT_SEC" "-/healthy"
  probe_grpc_component GRPC "$GRPC_ADDR"
else
  checked_disabled="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  set_component_probe RPC "unknown" "$checked_disabled" "" "probes disabled"
  set_component_probe REST "unknown" "$checked_disabled" "" "probes disabled"
  set_component_probe GRPC "unknown" "$checked_disabled" "" "probes disabled"
  set_component_probe FAUCET "unknown" "$checked_disabled" "" "probes disabled"
  set_component_probe GRAFANA "unknown" "$checked_disabled" "" "probes disabled"
  set_component_probe PROMETHEUS "unknown" "$checked_disabled" "" "probes disabled"
fi

mkdir -p "$PUBLIC_DIR"
cp "$GENESIS_FILE" "$PUBLIC_DIR/genesis.json"

cat > "$PUBLIC_DIR/manifest.json" <<EOF
{
  "network": "clawchain-public-testnet",
  "publishedAtUtc": "$PUBLISHED_AT",
  "chainId": "$CHAIN_ID",
  "genesis": {
    "path": "testnet/public/genesis.json",
    "sha256": "$GENESIS_SHA256"
  },
  "endpoints": {
    "rpc": "$RPC_URL",
    "rest": "$REST_URL",
    "grpc": "$GRPC_ADDR",
    "faucet": "$FAUCET_URL",
    "explorer": "$EXPLORER_URL",
    "grafana": "$GRAFANA_URL",
    "prometheus": "$PROMETHEUS_URL"
  },
  "seeds": [
    "$SEED_NODE_ID@$SEED_HOST:$SEED_P2P_PORT"
  ],
  "signatures": $MANIFEST_SIGNATURES_JSON,
  "lifecycle": {
    "id": "$MANIFEST_LIFECYCLE_ID",
    "revision": $LIFECYCLE_REVISION,
    "signedUpdate": $SIGNED_UPDATE,
    "signatureCount": $SIGNATURE_COUNT,
    "stableEndpointSet": {
      "rpc": "$RPC_URL",
      "rest": "$REST_URL",
      "grpc": "$GRPC_ADDR",
      "faucet": "$FAUCET_URL",
      "grafana": "$GRAFANA_URL",
      "prometheus": "$PROMETHEUS_URL"
    },
    "previousManifestSha256": "$PREVIOUS_MANIFEST_SHA256"
  }
}
EOF

MANIFEST_SHA256="$(
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$PUBLIC_DIR/manifest.json" | awk '{print $1}'
  else
    shasum -a 256 "$PUBLIC_DIR/manifest.json" | awk '{print $1}'
  fi
)"
printf '%s  manifest.json\n' "$MANIFEST_SHA256" > "$PUBLIC_DIR/manifest.sha256"

cat > "$PUBLIC_DIR/status.json" <<EOF
{
  "network": "clawchain-public-testnet",
  "chainId": "$CHAIN_ID",
  "updatedAtUtc": "$PUBLISHED_AT",
  "status": "operational",
  "components": {
    "rpc": {
      "url": "$RPC_URL",
      "status": "$RPC_STATUS",
      "checkedAtUtc": "$RPC_CHECKED_AT_UTC",
      "probeTarget": "$RPC_PROBE_TARGET",
      "error": "$RPC_ERROR"
    },
    "rest": {
      "url": "$REST_URL",
      "status": "$REST_STATUS",
      "checkedAtUtc": "$REST_CHECKED_AT_UTC",
      "probeTarget": "$REST_PROBE_TARGET",
      "error": "$REST_ERROR"
    },
    "grpc": {
      "address": "$GRPC_ADDR",
      "status": "$GRPC_STATUS",
      "checkedAtUtc": "$GRPC_CHECKED_AT_UTC",
      "probeTarget": "$GRPC_PROBE_TARGET",
      "error": "$GRPC_ERROR"
    },
    "faucet": {
      "url": "$FAUCET_URL",
      "status": "$FAUCET_STATUS",
      "checkedAtUtc": "$FAUCET_CHECKED_AT_UTC",
      "probeTarget": "$FAUCET_PROBE_TARGET",
      "error": "$FAUCET_ERROR"
    },
    "grafana": {
      "url": "$GRAFANA_URL",
      "status": "$GRAFANA_STATUS",
      "checkedAtUtc": "$GRAFANA_CHECKED_AT_UTC",
      "probeTarget": "$GRAFANA_PROBE_TARGET",
      "error": "$GRAFANA_ERROR"
    },
    "prometheus": {
      "url": "$PROMETHEUS_URL",
      "status": "$PROMETHEUS_STATUS",
      "checkedAtUtc": "$PROMETHEUS_CHECKED_AT_UTC",
      "probeTarget": "$PROMETHEUS_PROBE_TARGET",
      "error": "$PROMETHEUS_ERROR"
    }
  },
  "notes": [
    "Generated by testnet/publish-public-testnet.sh",
    "Probe timeout: ${PROBE_TIMEOUT_SEC}s",
    "Active probes: ${ENABLE_PUBLIC_PROBES}"
  ],
  "manifestLifecycle": {
    "id": "$MANIFEST_LIFECYCLE_ID",
    "revision": $LIFECYCLE_REVISION,
    "manifestSha256": "$MANIFEST_SHA256",
    "signedUpdate": $SIGNED_UPDATE
  }
}
EOF

cat > "$LIFECYCLE_FILE" <<EOF
{
  "id": "$MANIFEST_LIFECYCLE_ID",
  "network": "clawchain-public-testnet",
  "updatedAtUtc": "$PUBLISHED_AT",
  "revision": $LIFECYCLE_REVISION,
  "manifestSha256": "$MANIFEST_SHA256",
  "previousManifestSha256": "$PREVIOUS_MANIFEST_SHA256",
  "signedUpdate": $SIGNED_UPDATE,
  "signatureCount": $SIGNATURE_COUNT,
  "stableEndpointSet": {
    "rpc": "$RPC_URL",
    "rest": "$REST_URL",
    "grpc": "$GRPC_ADDR",
    "faucet": "$FAUCET_URL",
    "grafana": "$GRAFANA_URL",
    "prometheus": "$PROMETHEUS_URL"
  }
}
EOF
printf '{"updatedAtUtc":"%s","revision":%s,"manifestSha256":"%s","signedUpdate":%s}\n' "$PUBLISHED_AT" "$LIFECYCLE_REVISION" "$MANIFEST_SHA256" "$SIGNED_UPDATE" >> "$LIFECYCLE_LOG_FILE"

cat > "$PUBLIC_DIR/NETWORK.md" <<EOF
# ClawChain Public Testnet Bootstrap

- Published: $PUBLISHED_AT
- Chain ID: \`$CHAIN_ID\`
- Genesis SHA256: \`$GENESIS_SHA256\`

## Endpoints

- RPC: \`$RPC_URL\`
- REST: \`$REST_URL\`
- gRPC: \`$GRPC_ADDR\`
- Faucet: \`$FAUCET_URL\`

## Seeds

- \`$SEED_NODE_ID@$SEED_HOST:$SEED_P2P_PORT\`

## Validator Join

1. Download \`genesis.json\` from this folder.
2. Verify SHA256:
   \`$GENESIS_SHA256\`
3. Configure seeds in \`config.toml\`:
   \`$SEED_NODE_ID@$SEED_HOST:$SEED_P2P_PORT\`
4. Follow \`testnet/VALIDATOR-GUIDE.md\`.
EOF

echo "wrote:"
echo "  - $PUBLIC_DIR/genesis.json"
echo "  - $PUBLIC_DIR/manifest.json"
echo "  - $PUBLIC_DIR/manifest.sha256"
echo "  - $PUBLIC_DIR/status.json"
echo "  - $LIFECYCLE_FILE"
echo "  - $LIFECYCLE_LOG_FILE"
echo "  - $PUBLIC_DIR/NETWORK.md"
