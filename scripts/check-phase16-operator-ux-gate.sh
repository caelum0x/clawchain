#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_paths=(
  scripts/weekly-maintenance.sh
  docs/phase16-operator-ux-hardening.md
  cmd/clawd/src/commands/release-summary.ts
)

for p in "${required_paths[@]}"; do
  if [[ ! -f "$p" ]]; then
    echo "ERROR: missing Phase 16 Track C artifact '$p'." >&2
    exit 1
  fi
done

if ! rg -n '^weekly-maintenance:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing weekly-maintenance target." >&2
  exit 1
fi

if ! rg -n 'release-summary' cmd/clawd/src/main.ts cmd/clawd/src/commands/release-summary.ts >/dev/null; then
  echo "ERROR: clawd release-summary command not wired." >&2
  exit 1
fi

if ! rg -n 'remediationHint|getCheckRemediationHint' cmd/clawd/src/commands/doctor.ts >/dev/null; then
  echo "ERROR: doctor --json remediation hints not present." >&2
  exit 1
fi

if rg -n '\bTBD\b|\bPending\b' docs/phase16-operator-ux-hardening.md >/dev/null; then
  echo "ERROR: operator UX hardening doc contains placeholder values." >&2
  exit 1
fi

echo "phase16 operator UX gate passed."
