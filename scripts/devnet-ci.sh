#!/usr/bin/env bash
#
# CI-style ephemeral devnet gate. Boots a clean devnet, runs the live smoke, and
# always tears it down.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
  bash scripts/devnet-reset.sh >/dev/null 2>&1 || true
}
trap cleanup EXIT

bash scripts/devnet-reset.sh
bash scripts/local-dev.sh --devnet
bash scripts/devnet-smoke.sh
