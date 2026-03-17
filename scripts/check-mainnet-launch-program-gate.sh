#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/mainnet-tokenomics-validator-policy.md
  docs/genesis-ceremony-ownership-log.md
  docs/external-audit-closure.md
  docs/legal-compliance-launch-review.md
  docs/mainnet-launch-checklist.md
  docs/security-review-checklist.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing launch-program artifact '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'Tokenomics Freeze Set|Validator Policy Freeze Set|Freeze Rule' docs/mainnet-tokenomics-validator-policy.md >/dev/null; then
  echo "ERROR: tokenomics/validator freeze policy is incomplete." >&2
  exit 1
fi

if ! rg -n 'Ownership Sign-Off|Artifact Checklist|Genesis SHA256' docs/genesis-ceremony-ownership-log.md >/dev/null; then
  echo "ERROR: genesis ceremony ownership log is incomplete." >&2
  exit 1
fi

if ! rg -n 'Findings Summary|Closure Requirements|Sign-Off' docs/external-audit-closure.md >/dev/null; then
  echo "ERROR: external audit closure record is incomplete." >&2
  exit 1
fi

if ! rg -n 'Region Matrix|Required Checks|Sign-Off' docs/legal-compliance-launch-review.md >/dev/null; then
  echo "ERROR: legal/compliance launch review is incomplete." >&2
  exit 1
fi

if ! rg -n 'Go / No-Go Criteria|Explicit No-Launch Triggers|Genesis Coordination|Sign-Off' docs/mainnet-launch-checklist.md >/dev/null; then
  echo "ERROR: mainnet launch checklist is missing required launch sections." >&2
  exit 1
fi

if ! rg -n 'All items must be completed and signed off before mainnet launch|Trusted Setup|Sign-Off' docs/security-review-checklist.md >/dev/null; then
  echo "ERROR: security review checklist is missing required launch gating sections." >&2
  exit 1
fi

echo "mainnet launch program gate passed."
