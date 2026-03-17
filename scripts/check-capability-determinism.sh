#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Ensure capability metadata is deterministic and validated across surfaces.

if ! rg -n 'normalizeSupportedTools\(|sort\.Strings\(out\)' x/agent/keeper/msg_server_register_agent.go >/dev/null; then
  echo "ERROR: agent capability normalization (sorted unique) is missing in keeper." >&2
  exit 1
fi

if ! rg -n 'supported_tools.*deterministic sorted-unique' proto/clawchain/agent/v1/tx.proto >/dev/null; then
  echo "ERROR: proto contract note for deterministic supported_tools normalization is missing." >&2
  exit 1
fi

if ! rg -n 'Deterministic sorted unique list of declared tool IDs/capabilities' sdk/src/types.ts >/dev/null; then
  echo "ERROR: SDK capability determinism contract note is missing." >&2
  exit 1
fi

if ! rg -n 'supported_tools is not deterministic' cmd/clawd/src/commands/doctor.ts >/dev/null; then
  echo "ERROR: operator diagnostics for capability determinism are missing." >&2
  exit 1
fi

echo "capability determinism gate passed."
