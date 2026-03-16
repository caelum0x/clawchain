#!/usr/bin/env bash
# Load DEX contract addresses from deployment artifact into dex-app .env files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ARTIFACT="$ROOT_DIR/artifacts/dex-deployment.json"
DEX_APP="$ROOT_DIR/dex-app"

if [ ! -f "$ARTIFACT" ]; then
  echo "ERROR: No deployment artifact at $ARTIFACT"
  echo "Run scripts/deploy-dex.sh first."
  exit 1
fi

FACTORY=$(python3 -c "import json; d=json.load(open('$ARTIFACT')); print(d['contracts']['factory'])")
ROUTER=$(python3 -c "import json; d=json.load(open('$ARTIFACT')); print(d['contracts']['router'])")
CHAIN_ID=$(python3 -c "import json; d=json.load(open('$ARTIFACT')); print(d['chain_id'])")

echo "Loaded from $ARTIFACT:"
echo "  Chain ID: $CHAIN_ID"
echo "  Factory:  $FACTORY"
echo "  Router:   $ROUTER"

# Update .env.development
ENV_DEV="$DEX_APP/.env.development"
if [ -f "$ENV_DEV" ]; then
  # Remove existing entries
  grep -v '^NEXT_PUBLIC_FACTORY_ADDRESS=' "$ENV_DEV" | grep -v '^NEXT_PUBLIC_ROUTER_ADDRESS=' > "$ENV_DEV.tmp" || true
  # Append new entries
  echo "NEXT_PUBLIC_FACTORY_ADDRESS=$FACTORY" >> "$ENV_DEV.tmp"
  echo "NEXT_PUBLIC_ROUTER_ADDRESS=$ROUTER" >> "$ENV_DEV.tmp"
  mv "$ENV_DEV.tmp" "$ENV_DEV"
  echo "Updated $ENV_DEV"
else
  cat > "$ENV_DEV" << EOF
NEXT_PUBLIC_CHAIN_ID=$CHAIN_ID
NEXT_PUBLIC_LCD_URL=http://localhost:1317
NEXT_PUBLIC_RPC_URL=http://localhost:26657
NEXT_PUBLIC_FACTORY_ADDRESS=$FACTORY
NEXT_PUBLIC_ROUTER_ADDRESS=$ROUTER
EOF
  echo "Created $ENV_DEV"
fi

echo "Done. Rebuild dex-app to apply: cd dex-app && npm run build"
