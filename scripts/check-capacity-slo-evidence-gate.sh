#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DOC="docs/capacity-slo-evidence.md"

if [[ ! -f "$DOC" ]]; then
  echo "ERROR: missing capacity/SLO evidence doc '$DOC'." >&2
  exit 1
fi

if ! rg -n 'Baseline Load|Heavy Load|Endpoint Availability \+ Error Budget Evidence|Observability Export Evidence|Owner Sign-Off' "$DOC" >/dev/null; then
  echo "ERROR: capacity/SLO evidence doc missing required sections." >&2
  exit 1
fi

if rg -n '\bTBD\b|\bPending\b' "$DOC" >/dev/null; then
  echo "ERROR: capacity/SLO evidence doc contains placeholder values." >&2
  exit 1
fi

if ! rg -n 'Sustained throughput:\s*`?[0-9]+(\.[0-9]+)?\s*tx/s`?|Peak throughput:\s*`?[0-9]+(\.[0-9]+)?\s*tx/s`?' "$DOC" >/dev/null; then
  echo "ERROR: throughput evidence missing numeric values." >&2
  exit 1
fi

if ! rg -n 'p95 tx inclusion:\s*`?[0-9]+(\.[0-9]+)?s`?' "$DOC" >/dev/null; then
  echo "ERROR: latency evidence missing p95 inclusion values." >&2
  exit 1
fi

if ! rg -n 'availability.*`?[0-9]+(\.[0-9]+)?%`?' "$DOC" >/dev/null; then
  echo "ERROR: availability evidence missing percentage values." >&2
  exit 1
fi

if ! rg -n '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z' "$DOC" >/dev/null; then
  echo "ERROR: capacity/SLO evidence missing concrete UTC timestamps." >&2
  exit 1
fi

echo "capacity/SLO evidence gate passed."
