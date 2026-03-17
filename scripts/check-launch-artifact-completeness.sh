#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docs=(
  docs/mainnet-tokenomics-validator-policy.md
  docs/genesis-ceremony-ownership-log.md
  docs/external-audit-closure.md
  docs/legal-compliance-launch-review.md
  docs/governance-operations-policy.md
  docs/incident-rollback-drill-log.md
  docs/trusted-setup-attestation.md
)

errors=0

for doc in "${docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing launch artifact doc '$doc'." >&2
    errors=$((errors + 1))
    continue
  fi

  if rg -n '\bTBD\b|\bPending\b' "$doc" >/dev/null; then
    echo "ERROR: launch artifact contains placeholder values: $doc" >&2
    rg -n '\bTBD\b|\bPending\b' "$doc" || true
    errors=$((errors + 1))
  fi
done

trusted_setup_files=(
  artifacts/ceremony/transcript-index-20260214.md
  artifacts/ceremony/transfer-circuit-transcript-20260214.json
  artifacts/ceremony/unshield-circuit-transcript-20260214.json
  artifacts/ceremony/viewkey-circuit-transcript-20260214.json
  x/privacy/circuit/keys/transfer.vk
  x/privacy/circuit/keys/unshield.vk
  x/privacy/circuit/keys/viewkey.vk
)

for file in "${trusted_setup_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing trusted setup artifact '$file'." >&2
    errors=$((errors + 1))
  fi
done

check_digest() {
  local label="$1"
  local path="$2"
  if [[ ! -f "$path" ]]; then
    return
  fi
  local expected
  expected="$(rg -n "$label" artifacts/ceremony/transcript-index-20260214.md | sed -E 's/.*([0-9a-f]{64}).*/\1/' | head -n1)"
  local actual
  actual="$(shasum -a 256 "$path" | awk '{print $1}')"
  if [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: transcript index missing digest for '$label'." >&2
    errors=$((errors + 1))
    return
  fi
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: digest mismatch for '$path'." >&2
    echo "expected: $expected" >&2
    echo "actual:   $actual" >&2
    errors=$((errors + 1))
  fi
}

check_digest 'transfer transcript' artifacts/ceremony/transfer-circuit-transcript-20260214.json
check_digest 'unshield transcript' artifacts/ceremony/unshield-circuit-transcript-20260214.json
check_digest 'viewkey transcript' artifacts/ceremony/viewkey-circuit-transcript-20260214.json
check_digest 'transfer vk' x/privacy/circuit/keys/transfer.vk
check_digest 'unshield vk' x/privacy/circuit/keys/unshield.vk
check_digest 'viewkey vk' x/privacy/circuit/keys/viewkey.vk

# Require concrete commit references in key records.
if ! rg -n 'Candidate release commit:\s*`?[0-9a-f]{7,40}`?' docs/mainnet-tokenomics-validator-policy.md >/dev/null; then
  echo "ERROR: tokenomics freeze doc is missing concrete candidate commit hash." >&2
  errors=$((errors + 1))
fi

if ! rg -n 'Candidate commit:\s*`?[0-9a-f]{7,40}`?' docs/external-audit-closure.md >/dev/null; then
  echo "ERROR: audit closure doc is missing concrete candidate commit hash." >&2
  errors=$((errors + 1))
fi

# Require at least one concrete UTC timestamp in each critical artifact.
for doc in docs/mainnet-tokenomics-validator-policy.md docs/genesis-ceremony-ownership-log.md docs/external-audit-closure.md docs/legal-compliance-launch-review.md; do
  if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "$doc" >/dev/null; then
    echo "ERROR: missing concrete UTC timestamp in $doc" >&2
    errors=$((errors + 1))
  fi
done

if [[ "$errors" -gt 0 ]]; then
  echo "launch artifact completeness gate failed with $errors error(s)." >&2
  exit 1
fi

echo "launch artifact completeness gate passed."
