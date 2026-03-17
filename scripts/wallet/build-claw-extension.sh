#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEPLR_DIR="$ROOT_DIR/vendor/keplr-wallet"
OUT_V3="$KEPLR_DIR/apps/extension/build/claw/manifest-v3"
OUT_V2="$KEPLR_DIR/apps/extension/build/claw/manifest-v2"

if [ ! -d "$KEPLR_DIR" ]; then
  echo "error: missing $KEPLR_DIR"
  exit 1
fi

cd "$KEPLR_DIR"

yarn workspace @keplr-wallet/extension build:claw

echo
echo "Claw Wallet extension build complete."
echo "Manifest v3 (Chrome/Edge): $OUT_V3"
echo "Manifest v2 (Firefox):     $OUT_V2"
