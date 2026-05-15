#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/artifacts/testnet"

MANIFEST_REF="${1:-${MANIFEST_URL:-$ROOT_DIR/testnet/public/manifest.json}}"
STATUS_REF="${2:-${STATUS_URL:-$ROOT_DIR/testnet/public/status.json}}"
STRICT_PUBLIC="${STRICT_PUBLIC:-1}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

fetch_ref() {
  local ref="$1"
  local out="$2"
  if [[ "$ref" =~ ^https?:// ]]; then
    if ! command -v curl >/dev/null 2>&1; then
      echo "curl is required for URL refs: $ref" >&2
      exit 1
    fi
    curl -fsS "$ref" -o "$out"
  else
    if [[ ! -f "$ref" ]]; then
      echo "missing file ref: $ref" >&2
      exit 1
    fi
    cp "$ref" "$out"
  fi
}

tmp_manifest="$(mktemp)"
tmp_status="$(mktemp)"
tmp_genesis="$(mktemp)"
cleanup() {
  rm -f "$tmp_manifest" "$tmp_status" "$tmp_genesis"
}
trap cleanup EXIT

fetch_ref "$MANIFEST_REF" "$tmp_manifest"
fetch_ref "$STATUS_REF" "$tmp_status"

errors=0

get_manifest() {
  jq -r "$1" "$tmp_manifest"
}
get_status() {
  jq -r "$1" "$tmp_status"
}

require_non_empty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "missing $label" >&2
    errors=$((errors + 1))
  fi
}

require_url() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "missing $label" >&2
    errors=$((errors + 1))
    return
  fi
  if [[ ! "$value" =~ ^https?:// ]]; then
    echo "invalid URL for $label: $value" >&2
    errors=$((errors + 1))
  fi
  if [[ "$STRICT_PUBLIC" == "1" && ( "$value" == *"127.0.0.1"* || "$value" == *"localhost"* ) ]]; then
    echo "public artifact cannot use localhost for $label: $value" >&2
    errors=$((errors + 1))
  fi
}

manifest_chain_id="$(get_manifest '.chainId')"
status_chain_id="$(get_status '.chainId')"
require_non_empty "$manifest_chain_id" "manifest.chainId"
require_non_empty "$status_chain_id" "status.chainId"
if [[ "$manifest_chain_id" != "$status_chain_id" ]]; then
  echo "chainId mismatch between manifest and status" >&2
  errors=$((errors + 1))
fi

for endpoint in rpc rest faucet grafana prometheus; do
  m_val="$(get_manifest ".endpoints.${endpoint}")"
  s_val="$(get_status ".components.${endpoint}.url")"
  require_url "$m_val" "manifest.endpoints.${endpoint}"
  require_url "$s_val" "status.components.${endpoint}.url"
  if [[ "$m_val" != "$s_val" ]]; then
    echo "endpoint mismatch for ${endpoint}" >&2
    errors=$((errors + 1))
  fi
done

grpc_manifest="$(get_manifest '.endpoints.grpc')"
grpc_status="$(get_status '.components.grpc.address')"
require_non_empty "$grpc_manifest" "manifest.endpoints.grpc"
require_non_empty "$grpc_status" "status.components.grpc.address"
if [[ "$grpc_manifest" != "$grpc_status" ]]; then
  echo "endpoint mismatch for grpc" >&2
  errors=$((errors + 1))
fi

sig_count="$(jq '.signatures | length' "$tmp_manifest")"
if [[ "$STRICT_PUBLIC" == "1" && "$sig_count" -lt 1 ]]; then
  echo "manifest must include at least one signature in strict mode" >&2
  errors=$((errors + 1))
fi

lifecycle_signed="$(get_manifest '.lifecycle.signedUpdate')"
if [[ "$STRICT_PUBLIC" == "1" && "$lifecycle_signed" != "true" ]]; then
  echo "manifest.lifecycle.signedUpdate must be true in strict mode" >&2
  errors=$((errors + 1))
fi

genesis_sha="$(get_manifest '.genesis.sha256')"
genesis_url="$(get_manifest '.genesis.url')"
require_non_empty "$genesis_sha" "manifest.genesis.sha256"
require_non_empty "$genesis_url" "manifest.genesis.url"
if [[ "$genesis_sha" != "null" && "$genesis_url" =~ ^https?:// ]]; then
  curl -fsS "$genesis_url" -o "$tmp_genesis" || {
    echo "failed to fetch genesis from manifest.genesis.url: $genesis_url" >&2
    errors=$((errors + 1))
  }
  if [[ -s "$tmp_genesis" ]]; then
    actual_sha="$(
      if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$tmp_genesis" | awk '{print $1}'
      else
        shasum -a 256 "$tmp_genesis" | awk '{print $1}'
      fi
    )"
    if [[ "$actual_sha" != "$genesis_sha" ]]; then
      echo "genesis checksum mismatch from published artifact" >&2
      errors=$((errors + 1))
    fi
  fi
fi

if [[ "$errors" -gt 0 ]]; then
  echo "public artifact reproducibility verification failed with $errors error(s)." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$OUT_DIR/public-reproducibility-proof-$ts.json"
cat >"$out_file" <<EOF
{
  "verifiedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "passed",
  "manifestRef": "$MANIFEST_REF",
  "statusRef": "$STATUS_REF",
  "strictPublic": $([[ "$STRICT_PUBLIC" == "1" ]] && echo "true" || echo "false"),
  "chainId": "$manifest_chain_id",
  "signatureCount": $sig_count,
  "manifestLifecycleSignedUpdate": $lifecycle_signed
}
EOF

echo "public artifact reproducibility verification passed."
echo "  proof: ${out_file#$ROOT_DIR/}"
