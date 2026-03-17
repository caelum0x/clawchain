#!/usr/bin/env bash
#
# quickstart.sh - One-command quickstart for ClawChain local development.
#
# Builds all binaries (if needed), initializes a local testnet, and starts
# the full stack including chain, faucet, event proxy, notifications, and
# web dashboard.
#
# Usage:
#   ./scripts/quickstart.sh
#
# Environment variables:
#   CLAWCHAIN_HOME - Override testnet home directory (default: ~/.clawchain-testnet)
#   SKIP_BUILD     - Set to 1 to skip building binaries
#   SKIP_WEB       - Set to 1 to skip starting the web dashboard
#   SKIP_FAUCET    - Set to 1 to skip starting the faucet
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

echo ""
echo "========================================="
echo "  ClawChain Quick Start"
echo "========================================="
echo ""

########################################
# Step 1: Build if needed
########################################

NEEDS_BUILD=false

if [ "${SKIP_BUILD:-0}" = "1" ]; then
  echo -e "${BLUE}[INFO]${NC}  Skipping build (SKIP_BUILD=1)"
elif [ ! -x "${BUILD_DIR}/clawchaind" ]; then
  NEEDS_BUILD=true
  echo -e "${YELLOW}[WARN]${NC}  clawchaind not found in ${BUILD_DIR}/. Running full setup..."
else
  # Check if key binaries exist
  MISSING=()
  for bin in clawchaind claw-faucet claw-eventsd claw-notifyd; do
    if [ ! -x "${BUILD_DIR}/${bin}" ]; then
      MISSING+=("${bin}")
    fi
  done
  if [ ${#MISSING[@]} -gt 0 ]; then
    NEEDS_BUILD=true
    echo -e "${YELLOW}[WARN]${NC}  Missing binaries: ${MISSING[*]}. Running setup..."
  else
    echo -e "${GREEN}[OK]${NC}    All binaries found in ${BUILD_DIR}/"
  fi
fi

if [ "${NEEDS_BUILD}" = true ]; then
  echo ""
  bash "${SCRIPT_DIR}/setup-dev.sh"
  echo ""
fi

########################################
# Step 2: Initialize testnet if needed
########################################

if [ ! -d "${CLAWCHAIN_HOME}/config" ]; then
  echo -e "${YELLOW}[WARN]${NC}  Testnet not initialized. Initializing..."
  export PATH="${BUILD_DIR}:${PATH}"
  CLAWCHAIN_HOME="${CLAWCHAIN_HOME}" bash "${SCRIPT_DIR}/testnet/init-testnet.sh"
  echo ""
else
  echo -e "${GREEN}[OK]${NC}    Testnet already initialized at ${CLAWCHAIN_HOME}"
fi

########################################
# Step 3: Start all services
########################################

echo ""
echo -e "${BOLD}Starting all services...${NC}"
echo ""

exec bash "${SCRIPT_DIR}/start-all.sh"
