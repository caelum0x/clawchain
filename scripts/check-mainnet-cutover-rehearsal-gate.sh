#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/mainnet-cutover-rehearsal.md
  docs/cutover-rollback-rehearsal.md
  docs/final-cutover-runbook.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing Track C cutover doc '$doc'." >&2
    exit 1
  fi
done

if rg -n '\bTBD\b|\bPending\b' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track C cutover docs contain placeholder values." >&2
  exit 1
fi

if ! rg -n 'fresh-machine-acceptance-gate|runtime-readiness-gate|Result: `pass`' docs/mainnet-cutover-rehearsal.md >/dev/null; then
  echo "ERROR: cutover rehearsal doc missing fresh-machine/readiness evidence." >&2
  exit 1
fi

if ! rg -n 'Timed Rollback Sequence|release-ready-gate|Result: `pass`' docs/cutover-rollback-rehearsal.md >/dev/null; then
  echo "ERROR: rollback rehearsal doc missing timed rollback sequence and gate re-pass." >&2
  exit 1
fi

if ! rg -n 'Final Cutover Command Flow|Rollback Command Flow|Accountable Owners|Owner Sign-Off' docs/final-cutover-runbook.md >/dev/null; then
  echo "ERROR: final cutover runbook missing required sections." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track C cutover docs missing concrete UTC timestamps." >&2
  exit 1
fi

echo "mainnet cutover rehearsal gate passed."
