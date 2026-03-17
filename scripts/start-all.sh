#!/usr/bin/env bash
#
# start-all.sh - Start all ClawChain services in the background.
#
# Starts the chain node, faucet, event proxy, notification service, and web
# dashboard. Press Ctrl+C to stop everything.
#
# Usage:
#   bash scripts/start-all.sh
#
# Environment variables:
#   CLAWCHAIN_HOME   - Override testnet home directory (default: ~/.clawchain-testnet)
#   FAUCET_MNEMONIC  - Faucet account mnemonic (optional; faucet uses keyring if unset)
#   SKIP_FAUCET      - Set to 1 to skip starting the faucet
#   SKIP_WEB         - Set to 1 to skip starting the web dashboard
#
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/build"
CLAWCHAIN_HOME="${CLAWCHAIN_HOME:-$HOME/.clawchain-testnet}"
LOG_DIR="${PROJECT_ROOT}/logs"

PIDS=()
SERVICE_NAMES=()

info() { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; }

cleanup() {
  echo ""
  echo -e "${YELLOW}Stopping all services...${NC}"
  for i in "${!PIDS[@]}"; do
    local pid="${PIDS[$i]}"
    local name="${SERVICE_NAMES[$i]:-unknown}"
    if kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      echo "  Stopped ${name} (PID ${pid})"
    fi
  done
  # Wait briefly for graceful shutdown
  sleep 1
  # Force-kill any remaining
  for pid in "${PIDS[@]}"; do
    kill -9 "${pid}" 2>/dev/null || true
  done
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}
trap cleanup INT TERM

########################################
# Pre-flight checks
########################################

echo "========================================="
echo "  ClawChain Full Stack Launcher"
echo "========================================="
echo ""

# Check that the chain binary exists
if [ ! -x "${BUILD_DIR}/clawchaind" ]; then
  fail "clawchaind not found in ${BUILD_DIR}/"
  echo "       Run 'bash scripts/setup-dev.sh' first."
  exit 1
fi

# Check that testnet is initialized
if [ ! -d "${CLAWCHAIN_HOME}/config" ]; then
  fail "Testnet not initialized at ${CLAWCHAIN_HOME}"
  echo "       Run 'bash scripts/setup-dev.sh' first."
  exit 1
fi

# Create log directory
mkdir -p "${LOG_DIR}"

########################################
# Start services
########################################

# 1. Chain node
info "Starting clawchaind..."
"${BUILD_DIR}/clawchaind" start \
  --home "${CLAWCHAIN_HOME}" \
  --minimum-gas-prices 0.001uclaw \
  > "${LOG_DIR}/clawchaind.log" 2>&1 &
PIDS+=($!)
SERVICE_NAMES+=("clawchaind")

# Wait for chain to be ready
info "Waiting for chain to start (up to 30s)..."
READY=false
for i in $(seq 1 30); do
  if curl -sf http://localhost:26657/health > /dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done

if [ "${READY}" = true ]; then
  ok "Chain is running (PID ${PIDS[0]})"
else
  fail "Chain did not start within 30 seconds. Check ${LOG_DIR}/clawchaind.log"
  kill "${PIDS[0]}" 2>/dev/null || true
  exit 1
fi

# 2. Faucet
if [ "${SKIP_FAUCET:-0}" != "1" ] && [ -x "${BUILD_DIR}/claw-faucet" ]; then
  info "Starting faucet..."
  FAUCET_MNEMONIC="${FAUCET_MNEMONIC:-}" \
    "${BUILD_DIR}/claw-faucet" \
    > "${LOG_DIR}/claw-faucet.log" 2>&1 &
  PIDS+=($!)
  SERVICE_NAMES+=("claw-faucet")
  ok "Faucet started (PID ${PIDS[-1]})"
else
  warn "Skipping faucet (binary not found or SKIP_FAUCET=1)"
fi

# 3. Event proxy
if [ -x "${BUILD_DIR}/claw-eventsd" ]; then
  info "Starting event proxy..."
  "${BUILD_DIR}/claw-eventsd" \
    > "${LOG_DIR}/claw-eventsd.log" 2>&1 &
  PIDS+=($!)
  SERVICE_NAMES+=("claw-eventsd")
  ok "Event proxy started (PID ${PIDS[-1]})"
else
  warn "Skipping event proxy (binary not found)"
fi

# 4. Notification service
if [ -x "${BUILD_DIR}/claw-notifyd" ]; then
  info "Starting notification service..."
  "${BUILD_DIR}/claw-notifyd" \
    > "${LOG_DIR}/claw-notifyd.log" 2>&1 &
  PIDS+=($!)
  SERVICE_NAMES+=("claw-notifyd")
  ok "Notification service started (PID ${PIDS[-1]})"
else
  warn "Skipping notification service (binary not found)"
fi

# 5. Web dashboard
if [ "${SKIP_WEB:-0}" != "1" ]; then
  info "Starting web dashboard..."
  (cd "${PROJECT_ROOT}/web" && npx vite --host) \
    > "${LOG_DIR}/web-dashboard.log" 2>&1 &
  PIDS+=($!)
  SERVICE_NAMES+=("web-dashboard")
  # Give vite a moment to spin up
  sleep 2
  ok "Web dashboard started (PID ${PIDS[-1]})"
else
  warn "Skipping web dashboard (SKIP_WEB=1)"
fi

########################################
# Summary
########################################
echo ""
echo "========================================="
echo -e "  ${GREEN}All services running!${NC}"
echo "========================================="
echo ""
echo "Endpoints:"
echo "  Chain RPC:       http://localhost:26657"
echo "  Chain REST:      http://localhost:1317"
echo "  Chain gRPC:      localhost:9090"
echo "  Faucet:          http://localhost:8888"
echo "  Events WS:       ws://localhost:8891/ws"
echo "  Notifications:   http://localhost:8892"
echo "  Web Dashboard:   http://localhost:3000"
echo ""
echo "Logs directory:    ${LOG_DIR}/"
echo "  tail -f ${LOG_DIR}/clawchaind.log"
echo ""
echo "Running processes:"
for i in "${!PIDS[@]}"; do
  echo "  ${SERVICE_NAMES[$i]}: PID ${PIDS[$i]}"
done
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Keep running until interrupted
wait
