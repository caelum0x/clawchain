#!/usr/bin/env bash
#
# Reset the isolated local devnet back to a clean state.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${DEVNET_HOME:-$ROOT_DIR/.devnet-node}"
LOGFILE="$ROOT_DIR/build/devnet.log"

if [[ -f "$HOME_DIR/.clawchaind.pid" ]]; then
  pid="$(cat "$HOME_DIR/.clawchaind.pid" 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
  fi
fi

pkill -f "clawchaind start.*$HOME_DIR" 2>/dev/null || true
sleep 1
rm -rf "$HOME_DIR"
rm -f "$LOGFILE"

echo "devnet reset complete: removed $HOME_DIR"
echo "restart with: bash scripts/local-dev.sh --devnet"
