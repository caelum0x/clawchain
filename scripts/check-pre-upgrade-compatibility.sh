#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

modules=(agent privacy marketplace reputation messaging)

extract_version() {
  local module="$1"
  local file="x/${module}/module/module.go"
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing module file '$file'." >&2
    exit 1
  fi

  local version
  version="$(rg -n 'ConsensusVersion\(\).*return[[:space:]]+[0-9]+' "$file" | head -1 | rg -o '[0-9]+' | tail -1 || true)"
  if [[ -z "$version" ]]; then
    echo "ERROR: could not parse ConsensusVersion() for module '$module'." >&2
    exit 1
  fi
  echo "$version"
}

if [[ ! -f docs/upgrade-runbook.md ]]; then
  echo "ERROR: missing docs/upgrade-runbook.md." >&2
  exit 1
fi

if [[ ! -f docs/testnet-upgrade-cadence.md ]]; then
  echo "ERROR: missing docs/testnet-upgrade-cadence.md." >&2
  exit 1
fi

if [[ ! -f testnet/rollback-upgrade-playbook.md ]]; then
  echo "ERROR: missing testnet/rollback-upgrade-playbook.md." >&2
  exit 1
fi

if ! rg -n 'Module Migration \+ Version Plan|Pre-Upgrade State Compatibility Checks|Testnet Upgrade Cadence' docs/upgrade-runbook.md >/dev/null; then
  echo "ERROR: upgrade runbook is missing migration plan, compatibility checks, or cadence section." >&2
  exit 1
fi

for module in "${modules[@]}"; do
  version="$(extract_version "$module")"
  if ! rg -n "\`x/${module}\`:\s+\`ConsensusVersion = ${version}\`" docs/upgrade-runbook.md >/dev/null; then
    echo "ERROR: runbook ledger missing or mismatched for x/${module} ConsensusVersion=${version}." >&2
    exit 1
  fi
  if ! rg -n "\`x/${module}\`" docs/upgrade-runbook.md >/dev/null; then
    echo "ERROR: migration plan does not mention x/${module}." >&2
    exit 1
  fi
done

if ! rg -n 'Fixed Cadence|Release Stages Per Window|Gate Requirements Per Window|Rollback Requirement' docs/testnet-upgrade-cadence.md >/dev/null; then
  echo "ERROR: docs/testnet-upgrade-cadence.md missing required policy sections." >&2
  exit 1
fi

if ! rg -n 'bi-weekly|Tuesday|18:00 UTC|90 minutes' docs/testnet-upgrade-cadence.md >/dev/null; then
  echo "ERROR: docs/testnet-upgrade-cadence.md missing frozen schedule details." >&2
  exit 1
fi

echo "pre-upgrade compatibility gate passed."
