#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MANIFEST="${MANIFEST:-}"
HOST="${HOST:-}"

if [[ -z "$MANIFEST" ]]; then
  echo "ERROR: MANIFEST is required for release-ready-gate." >&2
  echo "Usage: make release-ready-gate MANIFEST=<manifest-url-or-path> HOST=<public-host>" >&2
  exit 1
fi

if [[ -z "$HOST" ]]; then
  echo "ERROR: HOST is required for release-ready-gate." >&2
  echo "Usage: make release-ready-gate MANIFEST=<manifest-url-or-path> HOST=<public-host>" >&2
  exit 1
fi

if [[ ! -f testnet/public.env ]]; then
  echo "ERROR: missing testnet/public.env required for public reproducibility checks." >&2
  echo "Run: make testnet-public-env" >&2
  echo "Then edit testnet/public.env with real endpoint values." >&2
  exit 1
fi

bash ./testnet/validate-public-env.sh ./testnet/public.env >/dev/null

echo "release-ready input preflight passed."
