#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f docs/go-live-decision-policy.md ]]; then
  echo "ERROR: missing docs/go-live-decision-policy.md." >&2
  exit 1
fi

if ! rg -n 'Decision Owners|Launch Criteria|No-Launch Criteria|Decision Record' docs/go-live-decision-policy.md >/dev/null; then
  echo "ERROR: docs/go-live-decision-policy.md missing required decision sections." >&2
  exit 1
fi

if ! rg -n 'Release Owner|Security Owner|Operations Owner|Chain Owner' docs/go-live-decision-policy.md >/dev/null; then
  echo "ERROR: docs/go-live-decision-policy.md missing explicit ownership roles." >&2
  exit 1
fi

if ! rg -n 'release-ready-gate|mainnet-readiness-gate|release-evidence.json' docs/go-live-decision-policy.md >/dev/null; then
  echo "ERROR: docs/go-live-decision-policy.md missing required gate/evidence references." >&2
  exit 1
fi

echo "go-live decision gate passed."
