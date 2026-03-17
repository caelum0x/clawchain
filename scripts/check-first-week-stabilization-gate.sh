#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/first-week-health-summaries.md
  docs/launch-week-incidents.md
  docs/week-one-retrospective.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing Track E stabilization doc '$doc'." >&2
    exit 1
  fi
done

if rg -n '\bTBD\b|\bPending\b' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track E stabilization docs contain placeholder values." >&2
  exit 1
fi

if ! rg -n 'Daily Summary Windows|Evidence Artifacts|Sign-Off' docs/first-week-health-summaries.md >/dev/null; then
  echo "ERROR: first-week health summary doc missing required sections." >&2
  exit 1
fi

if ! rg -n 'Incident Register|Closure Evidence|Open P1 incidents: `0`|Open P2 incidents: `0`' docs/launch-week-incidents.md >/dev/null; then
  echo "ERROR: launch-week incidents doc missing closure requirements." >&2
  exit 1
fi

if ! rg -n 'Follow-Up Actions|Action Ownership|Sign-Off' docs/week-one-retrospective.md >/dev/null; then
  echo "ERROR: week-one retrospective doc missing required sections." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "${required_docs[@]}" >/dev/null; then
  echo "ERROR: Track E stabilization docs missing concrete UTC timestamps." >&2
  exit 1
fi

echo "first-week stabilization gate passed."
