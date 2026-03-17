#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f docs/mainnet-capacity-criteria.md ]]; then
  echo "ERROR: missing docs/mainnet-capacity-criteria.md." >&2
  exit 1
fi

if ! rg -n 'Acceptance Thresholds|Runtime readiness latency|Fresh-machine acceptance|Startup determinism|Peer baseline|Chain responsiveness' docs/mainnet-capacity-criteria.md >/dev/null; then
  echo "ERROR: docs/mainnet-capacity-criteria.md missing required acceptance threshold sections." >&2
  exit 1
fi

if ! rg -n 'fresh-machine-acceptance-gate|runtime-readiness-gate|release-evidence.json' docs/mainnet-capacity-criteria.md >/dev/null; then
  echo "ERROR: docs/mainnet-capacity-criteria.md missing required gate/evidence references." >&2
  exit 1
fi

if ! rg -n '^fresh-machine-acceptance-gate:|^runtime-readiness-gate:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing required readiness/capacity gate targets." >&2
  exit 1
fi

echo "mainnet capacity gate passed."
