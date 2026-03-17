#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/runtime-stability-soak.md
  docs/runtime-update-signing-policy.md
  docs/non-expert-operator-flow.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing runtime-hardening doc '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'Soak Scope|Acceptance Targets|Required Command Path|Evidence' docs/runtime-stability-soak.md >/dev/null; then
  echo "ERROR: docs/runtime-stability-soak.md missing required soak sections." >&2
  exit 1
fi

if ! rg -n 'Requirements|Required Gate Hooks|Blocking Rule' docs/runtime-update-signing-policy.md >/dev/null; then
  echo "ERROR: docs/runtime-update-signing-policy.md missing required update policy sections." >&2
  exit 1
fi

if ! rg -n 'One-Command Bring-Up|Repair Flow|Recovery Proof Path|Success Criteria' docs/non-expert-operator-flow.md >/dev/null; then
  echo "ERROR: docs/non-expert-operator-flow.md missing required operator-flow sections." >&2
  exit 1
fi

if ! rg -n '^openclaw-up-ready:|^clawd-up-ready:|^runtime-readiness-gate:|^fresh-machine-acceptance-gate:|^one-command-agent-gate:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing required runtime hardening targets." >&2
  exit 1
fi

echo "runtime hardening gate passed."
