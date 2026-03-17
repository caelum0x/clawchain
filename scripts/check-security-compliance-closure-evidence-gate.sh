#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f docs/external-audit-closure.md ]]; then
  echo "ERROR: missing docs/external-audit-closure.md." >&2
  exit 1
fi

if [[ ! -f docs/trusted-setup-attestation.md ]]; then
  echo "ERROR: missing docs/trusted-setup-attestation.md." >&2
  exit 1
fi

if [[ ! -f docs/legal-compliance-launch-review.md ]]; then
  echo "ERROR: missing docs/legal-compliance-launch-review.md." >&2
  exit 1
fi

if ! rg -n 'Audit Report References|Closure Commit References' docs/external-audit-closure.md >/dev/null; then
  echo "ERROR: audit closure doc missing report/commit references." >&2
  exit 1
fi

if rg -n '\- \[ \]' docs/external-audit-closure.md >/dev/null; then
  echo "ERROR: audit closure requirements still unchecked." >&2
  exit 1
fi

if ! rg -n 'Transcript References|Verifying-Key Hash Attestation|Sign-Off' docs/trusted-setup-attestation.md >/dev/null; then
  echo "ERROR: trusted setup attestation doc missing required sections." >&2
  exit 1
fi

if ! rg -n '[0-9a-f]{64}' docs/trusted-setup-attestation.md >/dev/null; then
  echo "ERROR: trusted setup attestation missing VK hash values." >&2
  exit 1
fi

required_trusted_setup_files=(
  artifacts/ceremony/transcript-index-20260214.md
  artifacts/ceremony/transfer-circuit-transcript-20260214.json
  artifacts/ceremony/unshield-circuit-transcript-20260214.json
  artifacts/ceremony/viewkey-circuit-transcript-20260214.json
  x/privacy/circuit/keys/transfer.vk
  x/privacy/circuit/keys/unshield.vk
  x/privacy/circuit/keys/viewkey.vk
)

for file in "${required_trusted_setup_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: trusted setup artifact missing: $file" >&2
    exit 1
  fi
done

check_vkey_hash() {
  local circuit="$1"
  local path="$2"
  local expected
  expected="$(awk -F'`' -v circuit="$circuit" '$0 ~ "\\| " circuit " \\|" {print $2; exit}' docs/trusted-setup-attestation.md)"
  if [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: could not parse expected VK hash for ${circuit} from docs/trusted-setup-attestation.md" >&2
    exit 1
  fi

  local actual
  actual="$(shasum -a 256 "$path" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: ${circuit} VK hash mismatch for ${path}" >&2
    echo "expected: $expected" >&2
    echo "actual:   $actual" >&2
    exit 1
  fi
}

check_vkey_hash "TransferCircuit" "x/privacy/circuit/keys/transfer.vk"
check_vkey_hash "UnshieldCircuit" "x/privacy/circuit/keys/unshield.vk"
check_vkey_hash "ViewKeyCircuit" "x/privacy/circuit/keys/viewkey.vk"

if rg -n '\- \[ \]' docs/legal-compliance-launch-review.md >/dev/null; then
  echo "ERROR: legal/compliance required checks still unchecked." >&2
  exit 1
fi

if ! rg -n 'Region Matrix|Decision:|Approved with regional constraints' docs/legal-compliance-launch-review.md >/dev/null; then
  echo "ERROR: legal/compliance review missing regional decision evidence." >&2
  exit 1
fi

echo "security/compliance closure evidence gate passed."
