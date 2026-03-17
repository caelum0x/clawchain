#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

manifest_file="testnet/public/manifest.json"
status_file="testnet/public/status.json"
lifecycle_file="testnet/public/manifest-lifecycle.json"
lifecycle_log="testnet/public/manifest-lifecycle.log.jsonl"
proof_latest="artifacts/testnet/public-deploy-proof-latest.json"

required_files=(
  "$manifest_file"
  "$status_file"
  "$lifecycle_file"
  "$lifecycle_log"
  "$proof_latest"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing required Track B artifact '$file'." >&2
    exit 1
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

revision="$(jq -r '.revision // 0' "$lifecycle_file")"
if [[ ! "$revision" =~ ^[0-9]+$ || "$revision" -lt 1 ]]; then
  echo "ERROR: lifecycle revision must be >= 1." >&2
  exit 1
fi

manifest_revision="$(jq -r '.lifecycle.revision // 0' "$manifest_file")"
if [[ "$manifest_revision" != "$revision" ]]; then
  echo "ERROR: manifest lifecycle revision ($manifest_revision) does not match lifecycle file ($revision)." >&2
  exit 1
fi

signed_update="$(jq -r '.signedUpdate // false' "$lifecycle_file")"
if [[ "$signed_update" != "true" ]]; then
  echo "ERROR: latest manifest lifecycle revision is not signed (signedUpdate=false)." >&2
  exit 1
fi

signature_count="$(jq -r '.signatureCount // 0' "$lifecycle_file")"
if [[ ! "$signature_count" =~ ^[0-9]+$ || "$signature_count" -lt 1 ]]; then
  echo "ERROR: lifecycle signatureCount must be >= 1." >&2
  exit 1
fi

manifest_sig_count="$(jq '.signatures | length' "$manifest_file")"
if [[ "$manifest_sig_count" -lt 1 ]]; then
  echo "ERROR: manifest signatures[] must include at least one signature." >&2
  exit 1
fi

log_last_revision="$(tail -n 1 "$lifecycle_log" | jq -r '.revision // 0')"
if [[ "$log_last_revision" != "$revision" ]]; then
  echo "ERROR: lifecycle log latest revision ($log_last_revision) does not match lifecycle file ($revision)." >&2
  exit 1
fi

proof_revision="$(jq -r '.summary.lifecycleRevision // 0' "$proof_latest")"
proof_signed="$(jq -r '.summary.signedUpdate // false' "$proof_latest")"
if [[ "$proof_revision" != "$revision" ]]; then
  echo "ERROR: public deploy proof lifecycle revision ($proof_revision) does not match latest ($revision)." >&2
  exit 1
fi
if [[ "$proof_signed" != "true" ]]; then
  echo "ERROR: public deploy proof indicates unsigned lifecycle update." >&2
  exit 1
fi

echo "phase18 real endpoint cutover gate passed."
