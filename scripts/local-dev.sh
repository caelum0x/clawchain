#!/usr/bin/env bash
# local-dev.sh — Bootstrap a local ClawChain development environment.
# Usage:
#   ./scripts/local-dev.sh              # chain only
#   ./scripts/local-dev.sh --all        # chain + all frontend services via docker compose

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
CHAIN_ID="clawchain-local"
BINARY="$BUILD_DIR/clawchaind"
HOME_DIR="$ROOT_DIR/.local-node"
MONIKER="local-node"
DENOM="uclaw"
KEY_NAME="dev-account"
KEY_MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"
CHAIN_RPC="http://localhost:26657"
CHAIN_REST="http://localhost:1317"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── 1. Prerequisites ──
info "Checking prerequisites..."

check_bin() {
  if command -v "$1" &>/dev/null; then
    ok "$1 found: $(command -v "$1")"
  else
    warn "$1 not found — some features may not work"
  fi
}

# Required
command -v go    &>/dev/null || fail "go is required but not installed. Install from https://go.dev/dl/"
command -v node  &>/dev/null || fail "node is required but not installed. Install from https://nodejs.org/"

check_bin go
check_bin node
check_bin cargo
check_bin docker

echo ""

# ── 2. Build the chain binary ──
info "Building chain binary..."
mkdir -p "$BUILD_DIR"
(cd "$ROOT_DIR" && go build -o "$BINARY" ./cmd/clawchaind/)
ok "Binary built at $BINARY"
echo ""

# ── 3. Initialize chain (skip if already done) ──
if [ -d "$HOME_DIR/config" ]; then
  info "Chain home already exists at $HOME_DIR — skipping init"
else
  info "Initializing chain ($CHAIN_ID)..."
  "$BINARY" init "$MONIKER" --chain-id "$CHAIN_ID" --home "$HOME_DIR" 2>/dev/null
  ok "Chain initialized"
fi
echo ""

# ── 4. Add test account with tokens ──
info "Setting up dev account..."
if "$BINARY" keys show "$KEY_NAME" --home "$HOME_DIR" --keyring-backend test &>/dev/null; then
  info "Key '$KEY_NAME' already exists — skipping"
else
  echo "$KEY_MNEMONIC" | "$BINARY" keys add "$KEY_NAME" \
    --home "$HOME_DIR" \
    --keyring-backend test \
    --recover 2>/dev/null
  ok "Key '$KEY_NAME' added"
fi

DEV_ADDR=$("$BINARY" keys show "$KEY_NAME" --home "$HOME_DIR" --keyring-backend test -a)
info "Dev address: $DEV_ADDR"

# Add genesis account (skip if already present)
if grep -q "$DEV_ADDR" "$HOME_DIR/config/genesis.json" 2>/dev/null; then
  info "Genesis account already present — skipping"
else
  "$BINARY" genesis add-genesis-account "$DEV_ADDR" "1000000000000${DENOM}" \
    --home "$HOME_DIR" --keyring-backend test 2>/dev/null
  ok "Genesis account funded with 1,000,000 CLAW"
fi
echo ""

# ── 5. Set genesis params ──
info "Configuring genesis parameters..."

# Helper to update JSON in genesis.json
update_genesis() {
  local tmp
  tmp=$(mktemp)
  python3 -c "
import json, sys
with open('$HOME_DIR/config/genesis.json') as f:
    g = json.load(f)
$1
with open('$tmp', 'w') as f:
    json.dump(g, f, indent=2)
" 2>/dev/null && mv "$tmp" "$HOME_DIR/config/genesis.json" || rm -f "$tmp"
}

# Set minimum gas prices in app.toml
if [ -f "$HOME_DIR/config/app.toml" ]; then
  sed -i.bak 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uclaw"/' "$HOME_DIR/config/app.toml"
  rm -f "$HOME_DIR/config/app.toml.bak"
  ok "Min gas price set to 0.025uclaw"
fi

# Enable API and Swagger
if [ -f "$HOME_DIR/config/app.toml" ]; then
  sed -i.bak 's/enable = false/enable = true/' "$HOME_DIR/config/app.toml"
  sed -i.bak 's/swagger = false/swagger = true/' "$HOME_DIR/config/app.toml"
  rm -f "$HOME_DIR/config/app.toml.bak"
  ok "REST API and Swagger enabled"
fi

# Enable CORS for local dev
if [ -f "$HOME_DIR/config/config.toml" ]; then
  sed -i.bak 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/' "$HOME_DIR/config/config.toml"
  rm -f "$HOME_DIR/config/config.toml.bak"
  ok "CORS enabled for local dev"
fi

# Add wasm genesis state if not present
update_genesis "
app = g.get('app_state', {})
if 'wasm' not in app:
    app['wasm'] = {
        'params': {
            'code_upload_access': {'permission': 'Everybody', 'addresses': []},
            'instantiate_default_permission': 'Everybody'
        },
        'codes': [],
        'contracts': [],
        'sequences': [],
    }
    g['app_state'] = app
" && ok "CosmWasm genesis state configured (upload: Everybody)" || warn "Could not set wasm genesis (python3 may be missing)"

echo ""

# ── 6. Create gentx (if not already done) ──
if [ ! -f "$HOME_DIR/config/gentx/"*.json ] 2>/dev/null; then
  info "Creating gentx..."
  "$BINARY" genesis gentx "$KEY_NAME" "100000000${DENOM}" \
    --chain-id "$CHAIN_ID" \
    --home "$HOME_DIR" \
    --keyring-backend test \
    --moniker "$MONIKER" 2>/dev/null && ok "Gentx created" || warn "Gentx may already exist"

  "$BINARY" genesis collect-gentxs --home "$HOME_DIR" 2>/dev/null && ok "Gentxs collected" || true
fi
echo ""

# ── 7. Start the chain in background ──
info "Starting chain..."
LOGFILE="$BUILD_DIR/chain.log"

# Kill any existing instance
pkill -f "clawchaind start.*$HOME_DIR" 2>/dev/null || true
sleep 1

"$BINARY" start --home "$HOME_DIR" \
  --minimum-gas-prices "0.025${DENOM}" \
  --api.enable \
  --grpc.enable \
  > "$LOGFILE" 2>&1 &

CHAIN_PID=$!
ok "Chain starting (PID: $CHAIN_PID, log: $LOGFILE)"
echo ""

# ── 8. Wait for first block ──
info "Waiting for first block..."
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if curl -s "$CHAIN_RPC/status" 2>/dev/null | grep -q '"latest_block_height"'; then
    HEIGHT=$(curl -s "$CHAIN_RPC/status" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['sync_info']['latest_block_height'])" 2>/dev/null || echo "?")
    if [ "$HEIGHT" != "0" ] && [ "$HEIGHT" != "?" ]; then
      ok "Chain is live! Block height: $HEIGHT"
      break
    fi
  fi
  if [ "$i" -eq "$RETRIES" ]; then
    warn "Timed out waiting for first block — chain may still be starting. Check $LOGFILE"
    break
  fi
  sleep 2
done
echo ""

# ── 9. Print endpoint URLs ──
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN} ClawChain Local Development Environment${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Chain RPC:      ${CYAN}http://localhost:26657${NC}"
echo -e "  Chain REST:     ${CYAN}http://localhost:1317${NC}"
echo -e "  Chain gRPC:     ${CYAN}localhost:9090${NC}"
echo -e ""
echo -e "  Web Dashboard:  ${CYAN}http://localhost:3000${NC}"
echo -e "  Explorer:       ${CYAN}http://localhost:8080${NC}"
echo -e "  DEX:            ${CYAN}http://localhost:3001${NC}"
echo -e "  Landing:        ${CYAN}http://localhost:8090${NC}"
echo -e "  Docs:           ${CYAN}http://localhost:8091${NC}"
echo ""
echo -e "  Dev Account:    ${YELLOW}$DEV_ADDR${NC}"
echo -e "  Chain PID:      ${YELLOW}$CHAIN_PID${NC}"
echo -e "  Log file:       ${YELLOW}$LOGFILE${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── 10. Optionally start all frontend services ──
if [ "${1:-}" = "--all" ]; then
  info "Starting all frontend services with docker compose..."
  if [ -f "$ROOT_DIR/docker-compose.yml" ]; then
    (cd "$ROOT_DIR" && docker compose up -d)
    ok "Frontend services started"
  else
    warn "docker-compose.yml not found — skipping frontend services"
  fi
  echo ""
fi

info "To stop the chain: kill $CHAIN_PID"
info "To stop everything: kill $CHAIN_PID && docker compose down"
echo ""
ok "Local dev environment ready!"
