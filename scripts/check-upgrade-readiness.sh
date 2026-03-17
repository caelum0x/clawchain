#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_modules=(agent privacy marketplace reputation messaging)
for module in "${required_modules[@]}"; do
  module_file="x/${module}/module/module.go"
  if [[ ! -f "$module_file" ]]; then
    echo "ERROR: missing module file '$module_file' for upgrade-readiness checks." >&2
    exit 1
  fi
  if ! rg -n 'ConsensusVersion\(\)\s+uint64\s+\{\s+return\s+[0-9]+\s+\}' "$module_file" >/dev/null; then
    echo "ERROR: module '$module' is missing explicit ConsensusVersion() return value." >&2
    exit 1
  fi
done

if [[ ! -f docs/upgrade-runbook.md ]]; then
  echo "ERROR: missing docs/upgrade-runbook.md required for operator migration/rollback flow." >&2
  exit 1
fi

if [[ ! -f docs/testnet-upgrade-cadence.md ]]; then
  echo "ERROR: missing docs/testnet-upgrade-cadence.md required for frozen testnet upgrade policy." >&2
  exit 1
fi

if [[ ! -f testnet/rollback-upgrade-playbook.md ]]; then
  echo "ERROR: missing testnet/rollback-upgrade-playbook.md required for failed-upgrade recovery." >&2
  exit 1
fi

if ! rg -n 'Versioned Migration Checklist|Consensus Version Ledger|Module Migration \+ Version Plan|Pre-Upgrade State Compatibility Checks|Rollback Playbook|Testnet Upgrade Cadence' docs/upgrade-runbook.md >/dev/null; then
  echo "ERROR: docs/upgrade-runbook.md is missing required checklist/ledger/rollback sections." >&2
  exit 1
fi

if ! rg -n 'x/agent.*ConsensusVersion.*4|x/privacy.*ConsensusVersion.*1|x/marketplace.*ConsensusVersion.*2|x/reputation.*ConsensusVersion.*3|x/messaging.*ConsensusVersion.*2' docs/upgrade-runbook.md >/dev/null; then
  echo "ERROR: docs/upgrade-runbook.md consensus version ledger is incomplete/outdated." >&2
  exit 1
fi

if ! bash ./scripts/check-pre-upgrade-compatibility.sh >/dev/null; then
  echo "ERROR: pre-upgrade compatibility gate failed." >&2
  exit 1
fi

if ! rg -n 'upgrade-readiness-gate|release-evidence-pack|release-ready-gate' Makefile >/dev/null; then
  echo "ERROR: Makefile is missing release upgrade-readiness/evidence gate wiring." >&2
  exit 1
fi

echo "upgrade-readiness gate passed."
