#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/value-proposition.md
  docs/incentive-loop-design.md
  docs/support-community-pipeline.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -f "$doc" ]]; then
    echo "ERROR: missing growth/user-layer doc '$doc'." >&2
    exit 1
  fi
done

if ! rg -n 'Operators|Agent Builders|Product Promise' docs/value-proposition.md >/dev/null; then
  echo "ERROR: docs/value-proposition.md missing required positioning sections." >&2
  exit 1
fi

if ! rg -n 'Core Loops|Required Design Inputs|Guardrails' docs/incentive-loop-design.md >/dev/null; then
  echo "ERROR: docs/incentive-loop-design.md missing required incentive sections." >&2
  exit 1
fi

if ! rg -n 'Pipeline Stages|Ownership|SLA Targets' docs/support-community-pipeline.md >/dev/null; then
  echo "ERROR: docs/support-community-pipeline.md missing support pipeline sections." >&2
  exit 1
fi

echo "growth/user-layer gate passed."
