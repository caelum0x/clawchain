#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"
MOBILE_DIR="${1:-$ROOT_DIR/vendor/claw-wallet-mobile}"

if [ ! -d "$MOBILE_DIR" ]; then
  echo "error: missing mobile wallet repo at $MOBILE_DIR"
  echo "hint: run bash scripts/wallet/vendor-mobile-wallet.sh"
  exit 1
fi

if [ ! -f "$MOBILE_DIR/package.json" ]; then
  echo "error: missing package.json in $MOBILE_DIR"
  exit 1
fi

echo "ok: mobile wallet repo present at $MOBILE_DIR"

REQUIRED_FILES=(
  "$MOBILE_DIR/apps/user_dashboard/src/constants/claw_chains.ts"
  "$MOBILE_DIR/apps/user_dashboard/src/hooks/queries/use_chains.ts"
  "$MOBILE_DIR/apps/user_dashboard/src/state/chains.ts"
  "$MOBILE_DIR/apps/user_dashboard/src/app/transaction_history/constant.ts"
  "$MOBILE_DIR/embed/oko_attached/src/requests/chain_infos.ts"
  "$MOBILE_DIR/apps/demo_web/src/hooks/use_get_chain_infos.ts"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "error: missing required Claw patch file: $f"
    exit 1
  fi
done

grep -q "clawchain-1" "$MOBILE_DIR/apps/user_dashboard/src/constants/claw_chains.ts"
grep -q "clawchain-testnet-1" "$MOBILE_DIR/apps/user_dashboard/src/constants/claw_chains.ts"
grep -q "withClawChains" "$MOBILE_DIR/apps/user_dashboard/src/hooks/queries/use_chains.ts"
grep -q "CLAW_CHAIN_IDENTIFIER" "$MOBILE_DIR/apps/user_dashboard/src/state/chains.ts"
grep -q "CLAW_MAINNET_CHAIN_ID" "$MOBILE_DIR/apps/user_dashboard/src/app/transaction_history/constant.ts"
grep -q "withClawChains" "$MOBILE_DIR/embed/oko_attached/src/requests/chain_infos.ts"
grep -q "withClawChains" "$MOBILE_DIR/apps/demo_web/src/hooks/use_get_chain_infos.ts"

echo "ok: ClawChain mobile constants/config patch detected"
