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
# ============================================================================
#  WARNING — DEVELOPMENT / TESTNET ONLY.
#  This script auto-initializes a SINGLE-validator node with unsafe CORS and,
#  by default, the insecure `test` keyring backend (keys stored UNENCRYPTED on
#  disk). It MUST NOT be used to run a mainnet validator. A mainnet validator
#  must use a proper multi-party genesis ceremony, an encrypted keyring
#  (`file`/`os`) or a remote signer/HSM, and authenticated RPC behind a proxy.
# ============================================================================
#
# Environment variables:
#   CHAIN_ID          - Chain ID (default: clawchain-testnet-1)
#   HOME_DIR          - Node home directory (default: /root/.clawchain)
#   MONIKER           - Node moniker (default: clawchain-docker)
#   KEYRING_BACKEND   - Cosmos keyring backend (default: test). Use `file` or
#                       `os` for any node holding real value.
#   KEYRING_PASSWORD  - Passphrase for the keyring; REQUIRED when
#                       KEYRING_BACKEND is not `test`.
#   FAUCET_MNEMONIC   - Optional faucet mnemonic to recover and fund at genesis.
#   DEVNET_FAST       - Set to true for fast local devnet gov/staking params and
#                       insecure privacy proving/verifying keys.
#
set -euo pipefail

CHAIN_ID="${CHAIN_ID:-clawchain-testnet-1}"
HOME_DIR="${HOME_DIR:-/root/.clawchain}"
MONIKER="${MONIKER:-clawchain-docker}"
DENOM="uclaw"
KEYRING_BACKEND="${KEYRING_BACKEND:-test}"
KEYRING_PASSWORD="${KEYRING_PASSWORD:-}"
FAUCET_MNEMONIC="${FAUCET_MNEMONIC:-}"
DEVNET_FAST="${DEVNET_FAST:-false}"

# A non-`test` backend stores keys encrypted and therefore needs a passphrase.
# Fail closed if one wasn't provided rather than silently falling back.
if [ "${KEYRING_BACKEND}" != "test" ] && [ -z "${KEYRING_PASSWORD}" ]; then
    echo "ERROR: KEYRING_BACKEND='${KEYRING_BACKEND}' requires KEYRING_PASSWORD to be set." >&2
    exit 1
fi

if [ "${KEYRING_BACKEND}" = "test" ]; then
    echo "WARNING: using insecure 'test' keyring backend (unencrypted keys). Dev/testnet only — do NOT use for a mainnet validator." >&2
fi

# kr runs a clawchaind command, supplying the keyring passphrase on stdin twice
# (set + confirm). With the `test` backend no prompt appears and the input is
# harmlessly ignored, so this wrapper is safe for every backend.
kr() {
    clawchaind "$@" <<EOF
${KEYRING_PASSWORD}
${KEYRING_PASSWORD}
EOF
}

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
    kr keys add validator --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" > /dev/null 2>&1

    # Fund validator and faucet
    kr genesis add-genesis-account validator "100000000000${DENOM}" \
        --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" > /dev/null 2>&1
    if [ -n "${FAUCET_MNEMONIC}" ] && [ "${KEYRING_BACKEND}" = "test" ]; then
        echo "${FAUCET_MNEMONIC}" | clawchaind keys add faucet --recover \
            --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" > /dev/null 2>&1
    else
        kr keys add faucet --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" > /dev/null 2>&1
    fi
    kr genesis add-genesis-account faucet "1000000000000${DENOM}" \
        --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" > /dev/null 2>&1

    # Create and collect gentx
    kr genesis gentx validator "50000000000${DENOM}" \
        --chain-id "${CHAIN_ID}" --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" > /dev/null 2>&1
    clawchaind genesis collect-gentxs --home "${HOME_DIR}" > /dev/null 2>&1

    # Configure app.toml
    APP_TOML="${HOME_DIR}/config/app.toml"
    sed -i 's|^minimum-gas-prices *=.*|minimum-gas-prices = "0.0001uclaw"|' "${APP_TOML}"
    sed -i '/^\[api\]/,/^\[/{s|^enable = false|enable = true|}' "${APP_TOML}"
    sed -i '/^\[grpc\]/,/^\[/{s|^enable = false|enable = true|}' "${APP_TOML}"
    sed -i 's|enabled-unsafe-cors = false|enabled-unsafe-cors = true|g' "${APP_TOML}"
    sed -i 's|address = "tcp://localhost:1317"|address = "tcp://0.0.0.0:1317"|g' "${APP_TOML}"

    if [ "${DEVNET_FAST}" = "true" ]; then
        GENESIS_JSON="${HOME_DIR}/config/genesis.json"
        jq '
          .app_state.gov.params.voting_period = "30s" |
          .app_state.gov.params.expedited_voting_period = "20s" |
          .app_state.gov.params.max_deposit_period = "30s" |
          .app_state.staking.params.unbonding_time = "60s" |
          .app_state.slashing.params.signed_blocks_window = "1000" |
          .app_state.slashing.params.min_signed_per_window = "0.050000000000000000" |
          if .app_state.wasm? then
            .app_state.wasm.params.code_upload_access.permission = "Everybody" |
            .app_state.wasm.params.instantiate_default_permission = "Everybody"
          else . end
        ' "${GENESIS_JSON}" > "${GENESIS_JSON}.tmp" && mv "${GENESIS_JSON}.tmp" "${GENESIS_JSON}"
        sed -i 's|^minimum-gas-prices *=.*|minimum-gas-prices = "0.025uclaw"|' "${APP_TOML}"
        clawchaind privacy gen-dev-keys "${HOME_DIR}/keys" >/dev/null 2>&1 || true
    fi

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
    echo "Validator: $(kr keys show validator -a --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" 2>/dev/null || echo 'N/A')"
    echo "Faucet:    $(kr keys show faucet -a --keyring-backend "${KEYRING_BACKEND}" --home "${HOME_DIR}" 2>/dev/null || echo 'N/A')"
    echo ""
fi

exec "$@"
