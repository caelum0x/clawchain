#!/usr/bin/env bash
# ClawChain Monitoring Setup Script
# Phase 13 Track C - Production Observability
#
# This script:
#   1. Enables Prometheus metrics in ~/.clawchain/config/config.toml
#   2. Checks if Prometheus is installed
#   3. Checks if Grafana is installed
#   4. Prints a monitoring stack setup summary
#
# Usage:
#   ./scripts/monitoring-setup.sh
#   make monitoring-setup

set -euo pipefail

CLAWCHAIN_HOME="${CLAWCHAIN_HOME:-$HOME/.clawchain}"
CONFIG_TOML="${CLAWCHAIN_HOME}/config/config.toml"
APP_TOML="${CLAWCHAIN_HOME}/config/app.toml"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

echo ""
echo "============================================"
echo "  ClawChain Monitoring Setup"
echo "  Phase 13 Track C - Observability"
echo "============================================"
echo ""

# --------------------------------------------------
# Step 1: Enable Prometheus in config.toml
# --------------------------------------------------
info "Step 1: Checking CometBFT Prometheus configuration"

if [ ! -f "${CONFIG_TOML}" ]; then
    warn "config.toml not found at ${CONFIG_TOML}"
    warn "Initialize the chain first: clawchaind init <moniker>"
    warn "Skipping config.toml modifications."
    COMETBFT_CONFIGURED=false
else
    # Check if prometheus is already enabled
    if grep -q '^prometheus = true' "${CONFIG_TOML}" 2>/dev/null; then
        success "Prometheus is already enabled in config.toml"
        COMETBFT_CONFIGURED=true
    elif grep -q '^prometheus = false' "${CONFIG_TOML}" 2>/dev/null; then
        info "Enabling prometheus in ${CONFIG_TOML}..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's/^prometheus = false/prometheus = true/' "${CONFIG_TOML}"
        else
            sed -i 's/^prometheus = false/prometheus = true/' "${CONFIG_TOML}"
        fi
        success "Prometheus enabled in config.toml"
        COMETBFT_CONFIGURED=true
    else
        warn "Could not find prometheus setting in config.toml."
        warn "Add the following to the [instrumentation] section:"
        echo "    prometheus = true"
        echo "    prometheus_listen_addr = \":26660\""
        COMETBFT_CONFIGURED=false
    fi

    # Check prometheus_listen_addr
    if grep -q 'prometheus_listen_addr' "${CONFIG_TOML}" 2>/dev/null; then
        LISTEN_ADDR=$(grep 'prometheus_listen_addr' "${CONFIG_TOML}" | head -1 | cut -d'"' -f2)
        info "Prometheus listen address: ${LISTEN_ADDR:-:26660}"
    fi
fi

echo ""

# --------------------------------------------------
# Step 2: Enable Telemetry in app.toml (if exists)
# --------------------------------------------------
info "Step 1b: Checking Cosmos SDK telemetry configuration"

if [ ! -f "${APP_TOML}" ]; then
    warn "app.toml not found at ${APP_TOML}"
    warn "Skipping app telemetry configuration."
else
    if grep -q 'prometheus-retention-time = 0' "${APP_TOML}" 2>/dev/null; then
        info "Setting prometheus-retention-time to 60 in app.toml..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' 's/prometheus-retention-time = 0/prometheus-retention-time = 60/' "${APP_TOML}"
        else
            sed -i 's/prometheus-retention-time = 0/prometheus-retention-time = 60/' "${APP_TOML}"
        fi
        success "Cosmos SDK telemetry retention set to 60s"
    elif grep -q 'prometheus-retention-time' "${APP_TOML}" 2>/dev/null; then
        RETENTION=$(grep 'prometheus-retention-time' "${APP_TOML}" | head -1 | awk '{print $NF}')
        if [ "${RETENTION}" != "0" ]; then
            success "Cosmos SDK telemetry already configured (retention: ${RETENTION}s)"
        fi
    fi

    # Enable telemetry if disabled
    if grep -q '^enabled = false' "${APP_TOML}" 2>/dev/null; then
        # Only change the first occurrence (in [telemetry] section)
        info "Note: Check that [telemetry] enabled = true in app.toml"
    fi
fi

echo ""

# --------------------------------------------------
# Step 3: Check Prometheus installation
# --------------------------------------------------
info "Step 2: Checking Prometheus installation"

if command -v prometheus &>/dev/null; then
    PROM_VERSION=$(prometheus --version 2>&1 | head -1 || echo "unknown")
    success "Prometheus is installed: ${PROM_VERSION}"
    PROMETHEUS_INSTALLED=true
else
    warn "Prometheus is not installed."
    echo ""
    echo "  Install Prometheus:"
    echo ""
    echo "  macOS:   brew install prometheus"
    echo "  Ubuntu:  sudo apt-get install -y prometheus"
    echo "  Docker:  docker run -d --name prometheus -p 9090:9090 \\"
    echo "             -v \$(pwd)/monitoring/prometheus.yml:/etc/prometheus/prometheus.yml \\"
    echo "             -v \$(pwd)/monitoring/alerting-rules.yml:/etc/prometheus/alerting-rules.yml \\"
    echo "             prom/prometheus:latest"
    echo ""
    PROMETHEUS_INSTALLED=false
fi

echo ""

# --------------------------------------------------
# Step 4: Check Grafana installation
# --------------------------------------------------
info "Step 3: Checking Grafana installation"

if command -v grafana-server &>/dev/null || command -v grafana &>/dev/null; then
    if command -v grafana-server &>/dev/null; then
        GRAF_VERSION=$(grafana-server -v 2>&1 | head -1 || echo "unknown")
    else
        GRAF_VERSION=$(grafana -v 2>&1 | head -1 || echo "unknown")
    fi
    success "Grafana is installed: ${GRAF_VERSION}"
    GRAFANA_INSTALLED=true
else
    warn "Grafana is not installed."
    echo ""
    echo "  Install Grafana:"
    echo ""
    echo "  macOS:   brew install grafana && brew services start grafana"
    echo "  Ubuntu:  sudo apt-get install -y grafana"
    echo "           sudo systemctl enable grafana-server"
    echo "           sudo systemctl start grafana-server"
    echo "  Docker:  docker run -d --name grafana -p 3000:3000 grafana/grafana:latest"
    echo ""
    GRAFANA_INSTALLED=false
fi

echo ""

# --------------------------------------------------
# Step 5: Check node_exporter installation
# --------------------------------------------------
info "Step 4: Checking node_exporter installation"

if command -v node_exporter &>/dev/null; then
    success "node_exporter is installed"
    NODE_EXPORTER_INSTALLED=true
else
    warn "node_exporter is not installed (needed for CPU/memory/disk metrics)."
    echo ""
    echo "  Install node_exporter:"
    echo ""
    echo "  macOS:   brew install node_exporter"
    echo "  Ubuntu:  sudo apt-get install -y prometheus-node-exporter"
    echo "  Docker:  docker run -d --name node-exporter --net=host --pid=host \\"
    echo "             -v /:/host:ro,rslave \\"
    echo "             quay.io/prometheus/node-exporter:latest --path.rootfs=/host"
    echo ""
    NODE_EXPORTER_INSTALLED=false
fi

echo ""

# --------------------------------------------------
# Summary
# --------------------------------------------------
echo "============================================"
echo "  Monitoring Stack Summary"
echo "============================================"
echo ""

if [ "${COMETBFT_CONFIGURED:-false}" = "true" ]; then
    echo -e "  CometBFT Metrics:    ${GREEN}ENABLED${NC}  (port 26660)"
else
    echo -e "  CometBFT Metrics:    ${YELLOW}NOT CONFIGURED${NC}"
fi

if [ "${PROMETHEUS_INSTALLED}" = "true" ]; then
    echo -e "  Prometheus:          ${GREEN}INSTALLED${NC}"
else
    echo -e "  Prometheus:          ${RED}NOT FOUND${NC}"
fi

if [ "${GRAFANA_INSTALLED}" = "true" ]; then
    echo -e "  Grafana:             ${GREEN}INSTALLED${NC}"
else
    echo -e "  Grafana:             ${RED}NOT FOUND${NC}"
fi

if [ "${NODE_EXPORTER_INSTALLED}" = "true" ]; then
    echo -e "  Node Exporter:       ${GREEN}INSTALLED${NC}"
else
    echo -e "  Node Exporter:       ${RED}NOT FOUND${NC}"
fi

echo ""
echo "  Config files:"
echo "    Prometheus config:   ${REPO_ROOT}/monitoring/prometheus.yml"
echo "    Alerting rules:      ${REPO_ROOT}/monitoring/alerting-rules.yml"
echo "    Grafana dashboard:   ${REPO_ROOT}/monitoring/grafana-dashboard.json"
echo "    Documentation:       ${REPO_ROOT}/docs/observability.md"
echo ""

if [ "${PROMETHEUS_INSTALLED}" = "true" ]; then
    echo "  Quick start:"
    echo "    prometheus --config.file=${REPO_ROOT}/monitoring/prometheus.yml"
    echo ""
fi

if [ "${GRAFANA_INSTALLED}" = "true" ]; then
    echo "  Import the Grafana dashboard:"
    echo "    1. Open http://localhost:3000"
    echo "    2. Add Prometheus data source -> http://localhost:9090"
    echo "    3. Import dashboard from ${REPO_ROOT}/monitoring/grafana-dashboard.json"
    echo ""
fi

echo "  Full setup guide: ${REPO_ROOT}/docs/observability.md"
echo ""
echo "============================================"
