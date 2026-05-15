#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"

ENV_FILE="${1:-$TESTNET_DIR/public.env}"
MANIFEST_FILE="${2:-$TESTNET_DIR/public/manifest.json}"
STATUS_FILE="${3:-$TESTNET_DIR/public/status.json}"
LIFECYCLE_FILE="${4:-$TESTNET_DIR/public/manifest-lifecycle.json}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/artifacts/testnet}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

for file in "$ENV_FILE" "$MANIFEST_FILE" "$STATUS_FILE" "$LIFECYCLE_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "missing required file: $file" >&2
    exit 1
  fi
done

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    shasum -a 256 "$file" | awk '{print $1}'
  fi
}

manifest_sha="$(sha256_file "$MANIFEST_FILE")"
status_sha="$(sha256_file "$STATUS_FILE")"
lifecycle_sha="$(sha256_file "$LIFECYCLE_FILE")"

revision="$(jq -r '.revision // 0' "$LIFECYCLE_FILE")"
signed_update="$(jq -r '.signedUpdate // false' "$LIFECYCLE_FILE")"
signature_count="$(jq -r '.signatureCount // 0' "$LIFECYCLE_FILE")"
chain_id="$(jq -r '.chainId // "unknown"' "$MANIFEST_FILE")"

mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$OUT_DIR/public-deploy-proof-$ts.json"
latest_file="$OUT_DIR/public-deploy-proof-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg envFile "${ENV_FILE#$ROOT_DIR/}" \
  --arg manifestFile "${MANIFEST_FILE#$ROOT_DIR/}" \
  --arg statusFile "${STATUS_FILE#$ROOT_DIR/}" \
  --arg lifecycleFile "${LIFECYCLE_FILE#$ROOT_DIR/}" \
  --arg chainId "$chain_id" \
  --arg manifestSha256 "$manifest_sha" \
  --arg statusSha256 "$status_sha" \
  --arg lifecycleSha256 "$lifecycle_sha" \
  --argjson lifecycleRevision "$revision" \
  --argjson signedUpdate "$signed_update" \
  --argjson signatureCount "$signature_count" \
  --argjson manifest "$(cat "$MANIFEST_FILE")" \
  --argjson status "$(cat "$STATUS_FILE")" \
  --argjson lifecycle "$(cat "$LIFECYCLE_FILE")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    inputs: {
      envFile: $envFile,
      manifestFile: $manifestFile,
      statusFile: $statusFile,
      lifecycleFile: $lifecycleFile
    },
    summary: {
      chainId: $chainId,
      lifecycleRevision: $lifecycleRevision,
      signedUpdate: $signedUpdate,
      signatureCount: $signatureCount
    },
    checksums: {
      manifestSha256: $manifestSha256,
      statusSha256: $statusSha256,
      lifecycleSha256: $lifecycleSha256
    },
    artifacts: {
      manifest: $manifest,
      status: $status,
      lifecycle: $lifecycle
    }
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"

echo "public deploy proof written."
echo "  proof:  ${out_file#$ROOT_DIR/}"
echo "  latest: ${latest_file#$ROOT_DIR/}"
