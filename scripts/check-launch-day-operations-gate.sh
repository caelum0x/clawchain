#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/launch-day-operations-log.md
  docs/launch-day-status-workflow-log.md
  docs/launch-day-incident-bridge-ack.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing Track D launch-day doc '$doc'." >&2
    exit 1
  fi
done

if rg -n '\bTBD\b|\bPending\b' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track D launch-day docs contain placeholder values." >&2
  exit 1
fi

if ! rg -n 'Go/No-Go Command Sequence|Archived Raw Outputs|Sign-Off' docs/launch-day-operations-log.md >/dev/null; then
  echo "ERROR: launch-day operations log missing required sections." >&2
  exit 1
fi

if ! rg -n 'mainnet-readiness-gate|release-ready-gate|release-evidence-pack' docs/launch-day-operations-log.md >/dev/null; then
  echo "ERROR: launch-day operations log missing required command sequence evidence." >&2
  exit 1
fi

if ! rg -n 'Decision Update|Activation Update|First Post-Launch Checkpoint|Evidence Artifacts' docs/launch-day-status-workflow-log.md >/dev/null; then
  echo "ERROR: launch-day status workflow log missing required status update sections." >&2
  exit 1
fi

if ! rg -n 'Ownership Assignments|Acknowledgement Receipts|P1 paging test result' docs/launch-day-incident-bridge-ack.md >/dev/null; then
  echo "ERROR: launch-day incident bridge log missing ownership/ack evidence." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track D launch-day docs missing concrete UTC timestamps." >&2
  exit 1
fi

echo "launch-day operations gate passed."
