#!/usr/bin/env bash
#
# docker-entrypoint.sh - Auto-initialize ClawChain node if no chain data exists.
#
# This entrypoint is used by the root Dockerfile. On first run it will:
#   1. Initialize the chain with a single validator
#   2. Fund the validator account
#   3. Enable REST API and gRPC
#   4. Enable unsafe CORS (for development / Docker usage)
#
# Environment variables:
#   CHAIN_ID   - Chain ID (default: clawchain-testnet-1)
#   HOME_DIR   - Node home directory (default: /root/.clawchain)
#   MONIKER    - Node moniker (default: clawchain-docker)
#
set -euo pipefail

CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
HOME_DIR="${HOME_DIR:-/root/.clawchain}"
MONIKER="${MONIKER:-clawchain-docker}"
DENOM="uclaw"

if [ ! -f "${HOME_DIR}/.initialized" ]; then
    echo "========================================"
    echo "  No chain data found. Initializing..."
    echo "  Chain ID: ${CHAIN_ID}"
    echo "  Home:     ${HOME_DIR}"
    echo "========================================"

    # Clean any partial state from previous failed init
    rm -rf "${HOME_DIR:?}/"*

    # Initialize chain
    clawchaind init "${MONIKER}" --chain-id "${CHAIN_ID}" --home "${HOME_DIR}" --default-denom "${DENOM}" > /dev/null 2>&1

    # Create validator key
    clawchaind keys add validator --keyring-backend test --home "${HOME_DIR}" > /dev/null 2>&1

    # Fund validator and faucet
    clawchaind genesis add-genesis-account validator "100000000000${DENOM}" \
        --keyring-backend test --home "${HOME_DIR}" > /dev/null 2>&1
    clawchaind keys add faucet --keyring-backend test --home "${HOME_DIR}" > /dev/null 2>&1
    clawchaind genesis add-genesis-account faucet "1000000000000${DENOM}" \
        --keyring-backend test --home "${HOME_DIR}" > /dev/null 2>&1

    # Create and collect gentx
    clawchaind genesis gentx validator "50000000000${DENOM}" \
        --chain-id "${CHAIN_ID}" --keyring-backend test --home "${HOME_DIR}" > /dev/null 2>&1
    clawchaind genesis collect-gentxs --home "${HOME_DIR}" > /dev/null 2>&1

    # Configure app.toml
    APP_TOML="${HOME_DIR}/config/app.toml"
    sed -i 's|^minimum-gas-prices *=.*|minimum-gas-prices = "0.0001uclaw"|' "${APP_TOML}"
    sed -i '/^\[api\]/,/^\[/{s|^enable = false|enable = true|}' "${APP_TOML}"
    sed -i '/^\[grpc\]/,/^\[/{s|^enable = false|enable = true|}' "${APP_TOML}"
    sed -i 's|enabled-unsafe-cors = false|enabled-unsafe-cors = true|g' "${APP_TOML}"
    sed -i 's|address = "tcp://localhost:1317"|address = "tcp://0.0.0.0:1317"|g' "${APP_TOML}"

    # Configure config.toml
    CONFIG_TOML="${HOME_DIR}/config/config.toml"
    sed -i 's|cors_allowed_origins = \[\]|cors_allowed_origins = ["*"]|g' "${CONFIG_TOML}"
    sed -i 's|laddr = "tcp://127.0.0.1:26657"|laddr = "tcp://0.0.0.0:26657"|g' "${CONFIG_TOML}"
    sed -i 's|laddr = "tcp://localhost:26657"|laddr = "tcp://0.0.0.0:26657"|g' "${CONFIG_TOML}"
    sed -i 's|^prometheus = false|prometheus = true|g' "${CONFIG_TOML}"

    # Validate genesis
    clawchaind genesis validate --home "${HOME_DIR}" > /dev/null 2>&1

    # Mark initialization complete
    touch "${HOME_DIR}/.initialized"

    echo ""
    echo "Chain initialized successfully."
    echo "Validator: $(clawchaind keys show validator -a --keyring-backend test --home "${HOME_DIR}" 2>/dev/null || echo 'N/A')"
    echo "Faucet:    $(clawchaind keys show faucet -a --keyring-backend test --home "${HOME_DIR}" 2>/dev/null || echo 'N/A')"
    echo ""
fi

exec "$@"
