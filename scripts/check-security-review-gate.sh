#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/security-review-gate.md
  docs/threat-model.md
  docs/key-custody-policy.md
  docs/incident-runbook.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing required security artifact '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'Threat model|Key custody policy|Abuse controls|Blocking Rule' docs/security-review-gate.md >/dev/null; then
  echo "ERROR: docs/security-review-gate.md missing required gate sections." >&2
  exit 1
fi

if ! rg -n 'Scope|Threat Model|Summary Matrix|Attack Vector|Remaining gaps' docs/threat-model.md >/dev/null; then
  echo "ERROR: docs/threat-model.md missing required threat model structure." >&2
  exit 1
fi

if ! rg -n 'Required Practices|Prohibited Practices|Incident Handling' docs/key-custody-policy.md >/dev/null; then
  echo "ERROR: docs/key-custody-policy.md missing required custody policy sections." >&2
  exit 1
fi

if ! rg -n '^security-economic-policy-gate:|^runtime-readiness-gate:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing required abuse-control gate targets." >&2
  exit 1
fi

echo "security review gate passed."
