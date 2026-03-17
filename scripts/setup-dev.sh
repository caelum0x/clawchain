#!/usr/bin/env bash
#
# setup-dev.sh - Complete developer setup for ClawChain.
#
# Checks prerequisites, builds all binaries, installs JS dependencies,
# initializes a local testnet, and prints a summary of what to do next.
#
# Usage:
#   bash scripts/setup-dev.sh
#
# Environment variables:
#   CLAWCHAIN_HOME - Override testnet home directory (default: ~/.clawchain-testnet)
#   SKIP_TESTNET   - Set to 1 to skip testnet initialization
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

ERRORS=0
WARNINGS=0

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; ((WARNINGS++)) || true; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; ((ERRORS++)) || true; }
step()    { echo ""; echo -e "${BOLD}--- $* ---${NC}"; }
divider() { echo "========================================="; }

divider
echo "  ClawChain Development Setup"
divider
echo ""

########################################
# Phase 1: Prerequisite Checks
########################################
step "Phase 1: Checking Prerequisites"

# Go
REQUIRED_GO_MAJOR=1
REQUIRED_GO_MINOR=23
if command -v go &>/dev/null; then
  GO_VERSION=$(go version | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)
  GO_MAJOR=$(echo "${GO_VERSION}" | cut -d. -f1)
  GO_MINOR=$(echo "${GO_VERSION}" | cut -d. -f2)
  if [ "${GO_MAJOR}" -ge "${REQUIRED_GO_MAJOR}" ] && [ "${GO_MINOR}" -ge "${REQUIRED_GO_MINOR}" ]; then
    ok "Go ${GO_VERSION} (>= ${REQUIRED_GO_MAJOR}.${REQUIRED_GO_MINOR})"
  else
    fail "Go ${GO_VERSION} found, but >= ${REQUIRED_GO_MAJOR}.${REQUIRED_GO_MINOR} required"
    echo "       Install: https://go.dev/dl/"
  fi
else
  fail "Go not found in PATH"
  echo "       Install: https://go.dev/dl/"
fi

# Node.js
REQUIRED_NODE_MAJOR=18
if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | sed 's/^v//')
  NODE_MAJOR=$(echo "${NODE_VERSION}" | cut -d. -f1)
  if [ "${NODE_MAJOR}" -ge "${REQUIRED_NODE_MAJOR}" ]; then
    ok "Node.js ${NODE_VERSION} (>= ${REQUIRED_NODE_MAJOR})"
  else
    fail "Node.js ${NODE_VERSION} found, but >= ${REQUIRED_NODE_MAJOR} required"
    echo "       Install: https://nodejs.org/"
  fi
else
  fail "Node.js not found in PATH"
  echo "       Install: https://nodejs.org/"
fi

# npm
if command -v npm &>/dev/null; then
  NPM_VERSION=$(npm --version)
  ok "npm ${NPM_VERSION}"
else
  fail "npm not found in PATH"
  echo "       npm ships with Node.js: https://nodejs.org/"
fi

# git
if command -v git &>/dev/null; then
  GIT_VERSION=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  GIT_USER=$(git config user.name 2>/dev/null || echo "")
  GIT_EMAIL=$(git config user.email 2>/dev/null || echo "")
  if [ -n "${GIT_USER}" ] && [ -n "${GIT_EMAIL}" ]; then
    ok "git ${GIT_VERSION} (user: ${GIT_USER})"
  else
    warn "git ${GIT_VERSION} found but user.name/user.email not configured"
    echo "       Run: git config --global user.name \"Your Name\""
    echo "       Run: git config --global user.email \"you@example.com\""
  fi
else
  fail "git not found in PATH"
fi

# jq (needed for testnet init)
if command -v jq &>/dev/null; then
  ok "jq $(jq --version 2>/dev/null | sed 's/^jq-//' || echo 'available')"
else
  warn "jq not found (needed for testnet init)"
  echo "       Install: brew install jq (macOS) / apt install jq (Linux)"
fi

# curl (needed for health checks)
if command -v curl &>/dev/null; then
  ok "curl available"
else
  warn "curl not found (needed for health checks)"
fi

if [ "${ERRORS}" -gt 0 ]; then
  echo ""
  fail "Prerequisites check failed with ${ERRORS} error(s). Fix them before continuing."
  exit 1
fi

if [ "${WARNINGS}" -gt 0 ]; then
  echo ""
  warn "${WARNINGS} warning(s) above. Setup will continue but some features may not work."
fi

########################################
# Phase 2: Build Go Binaries
########################################
step "Phase 2: Building Go Binaries"

mkdir -p "${BUILD_DIR}"
cd "${PROJECT_ROOT}"

GO_BINARIES=(
  "clawchaind:./cmd/clawchaind:chain binary"
  "claw-gpu-provider:./cmd/claw-gpu-provider:GPU provider daemon"
  "claw-inference-sidecar:./cmd/claw-inference-sidecar:inference sidecar"
  "claw-faucet:./cmd/claw-faucet:token faucet"
  "claw-eventsd:./cmd/claw-eventsd:WebSocket event proxy"
  "claw-notifyd:./cmd/claw-notifyd:notification service"
  "claw-txhistoryd:./cmd/claw-txhistoryd:transaction history daemon"
  "clawproof:./cmd/clawproof:ZK proof generator"
)

for entry in "${GO_BINARIES[@]}"; do
  IFS=: read -r name pkg desc <<< "${entry}"
  info "Building ${name} (${desc})..."
  if go build -o "${BUILD_DIR}/${name}" "${pkg}" 2>&1; then
    ok "Built ${BUILD_DIR}/${name}"
  else
    fail "Failed to build ${name}"
  fi
done

########################################
# Phase 3: Install JavaScript Dependencies
########################################
step "Phase 3: Installing JavaScript Dependencies"

# SDK (must be first since web depends on it)
info "Installing SDK dependencies..."
if (cd "${PROJECT_ROOT}/sdk" && npm install --silent 2>&1); then
  ok "SDK dependencies installed"
else
  warn "SDK npm install had issues (non-fatal)"
fi

# Build SDK (web depends on the dist/ output)
info "Building SDK..."
if (cd "${PROJECT_ROOT}/sdk" && npm run build 2>&1); then
  ok "SDK built"
else
  warn "SDK build had issues"
fi

# Web dashboard
info "Installing web dashboard dependencies..."
if (cd "${PROJECT_ROOT}/web" && npm install --silent 2>&1); then
  ok "Web dashboard dependencies installed"
else
  warn "Web dashboard npm install had issues (non-fatal)"
fi

# clawd CLI
info "Installing clawd CLI dependencies..."
if (cd "${PROJECT_ROOT}/cmd/clawd" && npm install --silent 2>&1); then
  ok "clawd dependencies installed"
else
  warn "clawd npm install had issues (non-fatal)"
fi

info "Building clawd CLI..."
if (cd "${PROJECT_ROOT}/cmd/clawd" && npm run build 2>&1); then
  ok "clawd built"
else
  warn "clawd build had issues"
fi

########################################
# Phase 4: Initialize Local Testnet
########################################
if [ "${SKIP_TESTNET:-0}" != "1" ]; then
  step "Phase 4: Initializing Local Testnet"

  # The testnet init script requires the binary to be in PATH.
  # Temporarily add build dir to PATH and also install to GOPATH/bin.
  export PATH="${BUILD_DIR}:${PATH}"

  if [ -f "${SCRIPT_DIR}/testnet/init-testnet.sh" ]; then
    info "Running testnet initialization..."
    CLAWCHAIN_HOME="${CLAWCHAIN_HOME}" bash "${SCRIPT_DIR}/testnet/init-testnet.sh"
    ok "Testnet initialized at ${CLAWCHAIN_HOME}"
  else
    warn "Testnet init script not found at ${SCRIPT_DIR}/testnet/init-testnet.sh"
    echo "       You can initialize manually later."
  fi
else
  info "Skipping testnet init (SKIP_TESTNET=1)"
fi

########################################
# Summary
########################################
echo ""
divider
echo -e "  ${GREEN}Setup Complete!${NC}"
divider
echo ""
echo "What was built:"
echo "  - clawchaind            (chain binary)"
echo "  - claw-gpu-provider     (GPU provider daemon)"
echo "  - claw-inference-sidecar (inference sidecar)"
echo "  - claw-faucet           (token faucet)"
echo "  - claw-eventsd          (WebSocket event proxy)"
echo "  - claw-notifyd          (notification service)"
echo "  - claw-txhistoryd       (transaction history daemon)"
echo "  - clawproof             (ZK proof generator)"
echo "  - clawd                 (CLI tool)"
echo "  - Web dashboard         (React + Vite)"
echo ""
echo "Binaries are in: ${BUILD_DIR}/"
echo "Testnet home:    ${CLAWCHAIN_HOME}"
echo ""
echo "To start the chain:"
echo "  ${BUILD_DIR}/clawchaind start --home ${CLAWCHAIN_HOME}"
echo ""
echo "To start the web dashboard:"
echo "  cd web && npm run dev"
echo ""
echo "To start the full stack:"
echo "  bash scripts/start-all.sh"
echo ""
echo "To run a health check:"
echo "  bash scripts/health-check-all.sh"
echo ""
