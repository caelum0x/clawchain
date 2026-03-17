#!/usr/bin/env bash
#
# ibc-setup-two-chains.sh — Initialize and start 2 local ClawChain instances for IBC testing.
#
# This script creates two independent chains (clawchain-ibc-a and clawchain-ibc-b)
# on separate ports, suitable for manual IBC testing or as a dependency for
# ibc-two-chain-test.sh.
#
# Usage:
#   ./ibc-setup-two-chains.sh
#
# Ports:
#   Chain A: RPC 26657, REST 1317, gRPC 9090, P2P 26656
#   Chain B: RPC 26667, REST 1327, gRPC 9100, P2P 26666
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${PROJECT_ROOT}/artifacts/ibc-test"
BINARY="clawchaind"
KEYRING="test"
DENOM="uclaw"

CHAIN_A_ID="clawchain-ibc-a"
CHAIN_B_ID="clawchain-ibc-b"

# Chain A ports
CHAIN_A_RPC=26657
CHAIN_A_REST=1317
CHAIN_A_GRPC=9090
CHAIN_A_P2P=26656

# Chain B ports
CHAIN_B_RPC=26667
CHAIN_B_REST=1327
CHAIN_B_GRPC=9100
CHAIN_B_P2P=26666

INITIAL_BALANCE="10000000000000"   # 10,000,000 CLAW
VALIDATOR_STAKE="100000000"         # 100 CLAW

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; }

# ---------------------------------------------------------------------------
# Cleanup trap — kill background chains on exit
# ---------------------------------------------------------------------------
CHAIN_A_PID=""
CHAIN_B_PID=""

cleanup() {
    info "Cleaning up..."
    if [ -n "${CHAIN_A_PID}" ] && kill -0 "${CHAIN_A_PID}" 2>/dev/null; then
        kill "${CHAIN_A_PID}" 2>/dev/null || true
        wait "${CHAIN_A_PID}" 2>/dev/null || true
        ok "Chain A (PID ${CHAIN_A_PID}) stopped"
    fi
    if [ -n "${CHAIN_B_PID}" ] && kill -0 "${CHAIN_B_PID}" 2>/dev/null; then
        kill "${CHAIN_B_PID}" 2>/dev/null || true
        wait "${CHAIN_B_PID}" 2>/dev/null || true
        ok "Chain B (PID ${CHAIN_B_PID}) stopped"
    fi
}

# Only set the trap if we are NOT being sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    trap cleanup EXIT
fi

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
check_binary() {
    if ! command -v "${BINARY}" &>/dev/null; then
        # Try local build
        if [ -x "${PROJECT_ROOT}/clawchaind" ]; then
            BINARY="${PROJECT_ROOT}/clawchaind"
            info "Using local binary: ${BINARY}"
        else
            fail "${BINARY} not found. Run 'make build' or 'make install' first."
            exit 1
        fi
    fi
    ok "Binary: $(command -v ${BINARY})"
}

check_ports() {
    local ports=("${CHAIN_A_RPC}" "${CHAIN_A_REST}" "${CHAIN_A_GRPC}" "${CHAIN_A_P2P}" \
                 "${CHAIN_B_RPC}" "${CHAIN_B_REST}" "${CHAIN_B_GRPC}" "${CHAIN_B_P2P}")
    for port in "${ports[@]}"; do
        if lsof -i ":${port}" -sTCP:LISTEN &>/dev/null 2>&1; then
            fail "Port ${port} is already in use. Kill the process or change ports."
            exit 1
        fi
    done
    ok "All ports available"
}

check_jq() {
    if ! command -v jq &>/dev/null; then
        fail "jq is required but not found. Install it: brew install jq"
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Initialize a single chain
# ---------------------------------------------------------------------------
init_chain() {
    local chain_id="$1"
    local home_dir="$2"
    local rpc_port="$3"
    local rest_port="$4"
    local grpc_port="$5"
    local p2p_port="$6"

    info "Initializing ${chain_id} at ${home_dir}..."

    # Init chain
    ${BINARY} init "validator" --chain-id "${chain_id}" --home "${home_dir}" --default-denom "${DENOM}" > /dev/null 2>&1

    # Create validator key
    ${BINARY} keys add "validator" --keyring-backend "${KEYRING}" --home "${home_dir}" > /dev/null 2>&1
    local val_addr
    val_addr=$(${BINARY} keys show "validator" -a --keyring-backend "${KEYRING}" --home "${home_dir}")

    # Create relayer key
    ${BINARY} keys add "relayer" --keyring-backend "${KEYRING}" --home "${home_dir}" > /dev/null 2>&1
    local relayer_addr
    relayer_addr=$(${BINARY} keys show "relayer" -a --keyring-backend "${KEYRING}" --home "${home_dir}")

    # Create user key
    ${BINARY} keys add "user" --keyring-backend "${KEYRING}" --home "${home_dir}" > /dev/null 2>&1
    local user_addr
    user_addr=$(${BINARY} keys show "user" -a --keyring-backend "${KEYRING}" --home "${home_dir}")

    # Add genesis accounts
    ${BINARY} genesis add-genesis-account "${val_addr}" "${INITIAL_BALANCE}${DENOM}" \
        --keyring-backend "${KEYRING}" --home "${home_dir}" > /dev/null 2>&1
    ${BINARY} genesis add-genesis-account "${relayer_addr}" "${INITIAL_BALANCE}${DENOM}" \
        --keyring-backend "${KEYRING}" --home "${home_dir}" > /dev/null 2>&1
    ${BINARY} genesis add-genesis-account "${user_addr}" "${INITIAL_BALANCE}${DENOM}" \
        --keyring-backend "${KEYRING}" --home "${home_dir}" > /dev/null 2>&1

    # Generate gentx
    ${BINARY} genesis gentx "validator" "${VALIDATOR_STAKE}${DENOM}" \
        --chain-id "${chain_id}" \
        --keyring-backend "${KEYRING}" \
        --home "${home_dir}" \
        --moniker "validator" > /dev/null 2>&1

    # Collect gentxs
    ${BINARY} genesis collect-gentxs --home "${home_dir}" > /dev/null 2>&1

    # Patch genesis: fast block times, short unbonding for testing
    local genesis="${home_dir}/config/genesis.json"
    if command -v jq &>/dev/null; then
        # Short unbonding time for testing (60 seconds)
        jq '.app_state.staking.params.unbonding_time = "60s"' "${genesis}" > "${genesis}.tmp" && mv "${genesis}.tmp" "${genesis}"
        # Short voting period (30 seconds)
        jq '.app_state.gov.params.voting_period = "30s"' "${genesis}" > "${genesis}.tmp" && mv "${genesis}.tmp" "${genesis}"
        # Enable IBC transfer
        jq '.app_state.transfer.params.send_enabled = true | .app_state.transfer.params.receive_enabled = true' \
            "${genesis}" > "${genesis}.tmp" && mv "${genesis}.tmp" "${genesis}"
    fi

    # Validate genesis
    ${BINARY} genesis validate --home "${home_dir}" > /dev/null 2>&1

    # Configure ports in config.toml
    local config="${home_dir}/config/config.toml"
    sed -i.bak "s|laddr = \"tcp://127.0.0.1:26657\"|laddr = \"tcp://0.0.0.0:${rpc_port}\"|g" "${config}"
    sed -i.bak "s|laddr = \"tcp://localhost:26657\"|laddr = \"tcp://0.0.0.0:${rpc_port}\"|g" "${config}"
    sed -i.bak "s|laddr = \"tcp://0.0.0.0:26656\"|laddr = \"tcp://0.0.0.0:${p2p_port}\"|g" "${config}"
    # Disable pex for local testing
    sed -i.bak "s|pex = true|pex = false|g" "${config}"
    # Allow duplicate IP (both on localhost)
    sed -i.bak "s|allow_duplicate_ip = false|allow_duplicate_ip = true|g" "${config}"
    # Fast consensus for testing
    sed -i.bak "s|timeout_commit = \"5s\"|timeout_commit = \"1s\"|g" "${config}"
    sed -i.bak "s|timeout_propose = \"3s\"|timeout_propose = \"1s\"|g" "${config}"

    # Configure ports in app.toml
    local app_config="${home_dir}/config/app.toml"
    # REST API
    sed -i.bak '/^\[api\]/,/^\[/{s|enable = false|enable = true|}' "${app_config}"
    sed -i.bak "s|address = \"tcp://localhost:1317\"|address = \"tcp://0.0.0.0:${rest_port}\"|g" "${app_config}"
    sed -i.bak "s|address = \"tcp://0.0.0.0:1317\"|address = \"tcp://0.0.0.0:${rest_port}\"|g" "${app_config}"
    # gRPC
    sed -i.bak '/^\[grpc\]/,/^\[/{s|enable = false|enable = true|}' "${app_config}"
    sed -i.bak "s|address = \"0.0.0.0:9090\"|address = \"0.0.0.0:${grpc_port}\"|g" "${app_config}"
    sed -i.bak "s|address = \"localhost:9090\"|address = \"0.0.0.0:${grpc_port}\"|g" "${app_config}"
    # Min gas prices
    sed -i.bak "s|minimum-gas-prices = \"\"|minimum-gas-prices = \"0${DENOM}\"|g" "${app_config}"

    # Clean sed backups
    rm -f "${config}.bak" "${app_config}.bak"

    ok "${chain_id} initialized"
    info "  Validator: ${val_addr}"
    info "  Relayer:   ${relayer_addr}"
    info "  User:      ${user_addr}"

    # Export addresses for callers
    if [ "${chain_id}" = "${CHAIN_A_ID}" ]; then
        CHAIN_A_VAL_ADDR="${val_addr}"
        CHAIN_A_RELAYER_ADDR="${relayer_addr}"
        CHAIN_A_USER_ADDR="${user_addr}"
        CHAIN_A_HOME="${home_dir}"
    else
        CHAIN_B_VAL_ADDR="${val_addr}"
        CHAIN_B_RELAYER_ADDR="${relayer_addr}"
        CHAIN_B_USER_ADDR="${user_addr}"
        CHAIN_B_HOME="${home_dir}"
    fi
}

# ---------------------------------------------------------------------------
# Start a chain in the background
# ---------------------------------------------------------------------------
start_chain() {
    local chain_id="$1"
    local home_dir="$2"
    local log_file="$3"

    info "Starting ${chain_id}..."
    ${BINARY} start --home "${home_dir}" \
        --log_level "error" \
        > "${log_file}" 2>&1 &
    local pid=$!

    if [ "${chain_id}" = "${CHAIN_A_ID}" ]; then
        CHAIN_A_PID="${pid}"
    else
        CHAIN_B_PID="${pid}"
    fi

    ok "${chain_id} started (PID ${pid}, log: ${log_file})"
}

# ---------------------------------------------------------------------------
# Wait for a chain to produce blocks
# ---------------------------------------------------------------------------
wait_for_chain() {
    local rpc_port="$1"
    local chain_id="$2"
    local timeout="${3:-60}"

    info "Waiting for ${chain_id} to produce blocks (timeout ${timeout}s)..."
    local start_time
    start_time=$(date +%s)

    while true; do
        local elapsed=$(( $(date +%s) - start_time ))
        if [ "${elapsed}" -ge "${timeout}" ]; then
            fail "${chain_id} failed to start within ${timeout}s"
            return 1
        fi

        # Check if the node is responding and producing blocks
        local height
        height=$(curl -s "http://localhost:${rpc_port}/status" 2>/dev/null | jq -r '.result.sync_info.latest_block_height // "0"' 2>/dev/null || echo "0")
        if [ "${height}" != "0" ] && [ "${height}" != "null" ] && [ -n "${height}" ]; then
            local h_int
            h_int=$(echo "${height}" | tr -d '"')
            if [ "${h_int}" -gt 1 ] 2>/dev/null; then
                ok "${chain_id} is producing blocks (height: ${h_int})"
                return 0
            fi
        fi

        sleep 1
    done
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo ""
    echo "============================================"
    echo "  ClawChain IBC 2-Chain Setup"
    echo "============================================"
    echo ""

    check_binary
    check_ports
    check_jq

    # Clean previous data
    if [ -d "${DATA_DIR}" ]; then
        info "Removing previous IBC test data..."
        rm -rf "${DATA_DIR}"
    fi
    mkdir -p "${DATA_DIR}"

    # Initialize both chains
    echo ""
    info "=== Initializing chains ==="
    init_chain "${CHAIN_A_ID}" "${DATA_DIR}/chain-a" "${CHAIN_A_RPC}" "${CHAIN_A_REST}" "${CHAIN_A_GRPC}" "${CHAIN_A_P2P}"
    echo ""
    init_chain "${CHAIN_B_ID}" "${DATA_DIR}/chain-b" "${CHAIN_B_RPC}" "${CHAIN_B_REST}" "${CHAIN_B_GRPC}" "${CHAIN_B_P2P}"

    # Start both chains
    echo ""
    info "=== Starting chains ==="
    start_chain "${CHAIN_A_ID}" "${DATA_DIR}/chain-a" "${DATA_DIR}/chain-a.log"
    start_chain "${CHAIN_B_ID}" "${DATA_DIR}/chain-b" "${DATA_DIR}/chain-b.log"

    # Wait for both chains
    echo ""
    info "=== Waiting for chains to produce blocks ==="
    wait_for_chain "${CHAIN_A_RPC}" "${CHAIN_A_ID}" 60
    wait_for_chain "${CHAIN_B_RPC}" "${CHAIN_B_ID}" 60

    echo ""
    echo "============================================"
    echo "  Both chains are running!"
    echo "============================================"
    echo ""
    echo "Chain A (${CHAIN_A_ID}):"
    echo "  RPC:  http://localhost:${CHAIN_A_RPC}"
    echo "  REST: http://localhost:${CHAIN_A_REST}"
    echo "  gRPC: localhost:${CHAIN_A_GRPC}"
    echo "  Home: ${DATA_DIR}/chain-a"
    echo "  Validator: ${CHAIN_A_VAL_ADDR}"
    echo "  Relayer:   ${CHAIN_A_RELAYER_ADDR}"
    echo "  User:      ${CHAIN_A_USER_ADDR}"
    echo ""
    echo "Chain B (${CHAIN_B_ID}):"
    echo "  RPC:  http://localhost:${CHAIN_B_RPC}"
    echo "  REST: http://localhost:${CHAIN_B_REST}"
    echo "  gRPC: localhost:${CHAIN_B_GRPC}"
    echo "  Home: ${DATA_DIR}/chain-b"
    echo "  Validator: ${CHAIN_B_VAL_ADDR}"
    echo "  Relayer:   ${CHAIN_B_RELAYER_ADDR}"
    echo "  User:      ${CHAIN_B_USER_ADDR}"
    echo ""
    echo "Logs:"
    echo "  Chain A: ${DATA_DIR}/chain-a.log"
    echo "  Chain B: ${DATA_DIR}/chain-b.log"
    echo ""
    echo "To stop: kill ${CHAIN_A_PID} ${CHAIN_B_PID}"
    echo ""

    # If running standalone, keep alive
    if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
        info "Press Ctrl+C to stop both chains..."
        wait
    fi
}

# Run main only if script is executed (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
