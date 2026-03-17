#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/production-launch-artifact-index.md
  docs/integrator-onboarding-evidence.md
  docs/launch-decision-packet.md
  docs/capacity-slo-evidence.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing production data replacement doc '$doc'." >&2
    exit 1
  fi
done

if rg -n 'testnet\.clawchain\.dev|atlas\.partner\.net|example\.com/manifest\.json' docs/integrator-onboarding-evidence.md docs/launch-decision-packet.md >/dev/null; then
  echo "ERROR: demo/testnet placeholder endpoints remain in Track A docs." >&2
  exit 1
fi

if rg -n '\bTBD\b|\bPending\b' docs/production-launch-artifact-index.md >/dev/null; then
  echo "ERROR: production launch artifact index contains placeholder values." >&2
  exit 1
fi

if ! rg -n 'Final Validator Set|Genesis hash|Release Artifact Checksums|Command Output Index|Evidence Cross-Reference Index' docs/production-launch-artifact-index.md >/dev/null; then
  echo "ERROR: production launch artifact index missing required sections." >&2
  exit 1
fi

if ! rg -n 'clawvaloper1|clawvalconspub1' docs/production-launch-artifact-index.md >/dev/null; then
  echo "ERROR: validator set evidence missing validator addresses/pubkeys." >&2
  exit 1
fi

if ! rg -n '[0-9a-f]{64}' docs/production-launch-artifact-index.md >/dev/null; then
  echo "ERROR: production launch artifact index missing concrete hashes/checksums." >&2
  exit 1
fi

if ! rg -n 'artifacts/' docs/production-launch-artifact-index.md >/dev/null; then
  echo "ERROR: command output or cross-reference index missing artifact paths." >&2
  exit 1
fi

echo "production data replacement gate passed."
