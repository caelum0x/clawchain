#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/governance-operations-policy.md
  docs/incident-rollback-drill-log.md
  docs/public-status-communication.md
  docs/incident-runbook.md
  testnet/rollback-upgrade-playbook.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing governance/operations artifact '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'Decision Roles|Required Decision Records|Blocking Rule' docs/governance-operations-policy.md >/dev/null; then
  echo "ERROR: docs/governance-operations-policy.md missing required sections." >&2
  exit 1
fi

if ! rg -n 'Required Drill Types|Completion Rule' docs/incident-rollback-drill-log.md >/dev/null; then
  echo "ERROR: docs/incident-rollback-drill-log.md missing drill requirements." >&2
  exit 1
fi

if ! rg -n 'Incident Communication Stages|Message Minimums' docs/public-status-communication.md >/dev/null; then
  echo "ERROR: docs/public-status-communication.md missing communication workflow sections." >&2
  exit 1
fi

if ! rg -n '^go-live-decision-gate:|^upgrade-readiness-gate:|^release-ready-gate:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing required governance/ops gate targets." >&2
  exit 1
fi

echo "governance/operations gate passed."
