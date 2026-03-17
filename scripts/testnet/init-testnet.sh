#!/usr/bin/env bash
#
# init-testnet.sh - Initialize a single-validator local testnet for ClawChain.
#
# Creates a ready-to-run local testnet with:
#   - Chain ID:    clawchain-testnet-1
#   - 1 validator  (validator)
#   - 3 funded accounts (alice, bob, charlie) with 1,000 CLAW each
#   - 1 faucet account with 1,000,000 CLAW
#   - Fast governance (100s voting period, 50s expedited)
#   - Short agent reward interval (10 blocks)
#   - 1s block time target
#
# Usage:
#   ./scripts/testnet/init-testnet.sh
#
set -euo pipefail

CHAIN_ID="clawchain-testnet-1"
BINARY="clawchaind"
HOME_DIR="${CLAWCHAIN_HOME:-$HOME/.clawchain-testnet}"
DENOM="uclaw"
KEYRING="test"

echo "============================================"
echo "  ClawChain Local Testnet Init"
echo "  Chain ID: ${CHAIN_ID}"
echo "  Home:     ${HOME_DIR}"
echo "============================================"
echo ""

# Check binary
if ! command -v "${BINARY}" &>/dev/null; then
  echo "ERROR: ${BINARY} not found in PATH."
  echo "Run 'make install' first."
  exit 1
fi

# Check jq
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required for genesis patching."
  echo "Install jq: brew install jq  (macOS) / apt install jq (Linux)"
  exit 1
fi

# Clean previous state
if [ -d "${HOME_DIR}" ]; then
  echo "Removing previous testnet data at ${HOME_DIR}..."
  rm -rf "${HOME_DIR}"
fi

# -----------------------------------------------------------------
# Step 1: Initialize the chain
# -----------------------------------------------------------------
echo ""
echo "Step 1: Initializing chain..."
${BINARY} init testnet-node --chain-id "${CHAIN_ID}" --home "${HOME_DIR}" --default-denom "${DENOM}" > /dev/null 2>&1

# -----------------------------------------------------------------
# Step 2: Create keys
# -----------------------------------------------------------------
echo "Step 2: Creating keys..."

ACCOUNTS=("validator" "alice" "bob" "charlie" "faucet")
declare -A ADDRS

for acct in "${ACCOUNTS[@]}"; do
  ${BINARY} keys add "${acct}" --keyring-backend "${KEYRING}" --home "${HOME_DIR}" > /dev/null 2>&1
  ADDRS[${acct}]=$(${BINARY} keys show "${acct}" -a --keyring-backend "${KEYRING}" --home "${HOME_DIR}")
  echo "  ${acct}: ${ADDRS[${acct}]}"
done

# -----------------------------------------------------------------
# Step 3: Fund genesis accounts
# -----------------------------------------------------------------
echo ""
echo "Step 3: Funding genesis accounts..."

# Validator: 100,000 CLAW (100000000000 uclaw)
${BINARY} genesis add-genesis-account "${ADDRS[validator]}" "100000000000${DENOM}" \
  --keyring-backend "${KEYRING}" --home "${HOME_DIR}"

# Alice, Bob, Charlie: 1,000 CLAW each (1000000000 uclaw)
for acct in alice bob charlie; do
  ${BINARY} genesis add-genesis-account "${ADDRS[${acct}]}" "1000000000${DENOM}" \
    --keyring-backend "${KEYRING}" --home "${HOME_DIR}"
done

# Faucet: 1,000,000 CLAW (1000000000000 uclaw)
${BINARY} genesis add-genesis-account "${ADDRS[faucet]}" "1000000000000${DENOM}" \
  --keyring-backend "${KEYRING}" --home "${HOME_DIR}"

echo "  Accounts funded."

# -----------------------------------------------------------------
# Step 4: Create genesis transaction
# -----------------------------------------------------------------
echo ""
echo "Step 4: Creating genesis transaction..."

${BINARY} genesis gentx validator "50000000000${DENOM}" \
  --chain-id "${CHAIN_ID}" \
  --keyring-backend "${KEYRING}" \
  --home "${HOME_DIR}" \
  --moniker "testnet-node" > /dev/null 2>&1

${BINARY} genesis collect-gentxs --home "${HOME_DIR}" > /dev/null 2>&1

echo "  Gentx collected."

# -----------------------------------------------------------------
# Step 5: Patch genesis for testnet params
# -----------------------------------------------------------------
echo ""
echo "Step 5: Patching genesis for testnet parameters..."

GENESIS="${HOME_DIR}/config/genesis.json"

# --- Governance: fast voting for testing ---
jq '.app_state.gov.params.min_deposit = [{"denom": "uclaw", "amount": "10000000"}]' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.gov.params.voting_period = "100s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.gov.params.expedited_voting_period = "50s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.gov.params.max_deposit_period = "100s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.gov.params.quorum = "0.334000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.gov.params.threshold = "0.500000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.gov.params.veto_threshold = "0.334000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

# --- Mint module ---
jq '.app_state.mint.params.mint_denom = "uclaw"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.mint.params.inflation_max = "0.150000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.mint.params.inflation_min = "0.080000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.mint.params.goal_bonded = "0.670000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

# --- Staking module ---
jq '.app_state.staking.params.bond_denom = "uclaw"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.staking.params.unbonding_time = "600s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.staking.params.max_validators = 50' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

# --- Consensus: allow higher gas per block ---
jq '.consensus.params.block.max_gas = "100000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

# --- Agent module: fast reward distribution for testing ---
# Only patch if the agent module state exists in genesis
if jq -e '.app_state.agent' "${GENESIS}" > /dev/null 2>&1; then
  jq '.app_state.agent.params.reward_distribution_interval_blocks = "10"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  echo "  Agent module: reward_distribution_interval_blocks = 10"
fi

# --- Slashing: lenient for testnet ---
jq '.app_state.slashing.params.signed_blocks_window = "1000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.slashing.params.min_signed_per_window = "0.050000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
jq '.app_state.slashing.params.downtime_jail_duration = "60s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

echo "  Genesis patched."

# -----------------------------------------------------------------
# Step 6: Configure node for local development
# -----------------------------------------------------------------
echo ""
echo "Step 6: Configuring node for local development..."

CONFIG="${HOME_DIR}/config/config.toml"
APP_CONFIG="${HOME_DIR}/config/app.toml"

# Enable REST API
sed -i.bak '/^\[api\]/,/^\[/{s|^enable = false|enable = true|}' "${APP_CONFIG}" 2>/dev/null || true
# Enable gRPC
sed -i.bak '/^\[grpc\]/,/^\[/{s|^enable = false|enable = true|}' "${APP_CONFIG}" 2>/dev/null || true
# Enable unsafe CORS for development
sed -i.bak 's|enabled-unsafe-cors = false|enabled-unsafe-cors = true|g' "${APP_CONFIG}" 2>/dev/null || true
# Listen on all interfaces for API
sed -i.bak 's|address = "tcp://localhost:1317"|address = "tcp://0.0.0.0:1317"|g' "${APP_CONFIG}" 2>/dev/null || true
# Set minimum gas prices
sed -i.bak 's|^minimum-gas-prices *=.*|minimum-gas-prices = "0.0001uclaw"|' "${APP_CONFIG}" 2>/dev/null || true

# CometBFT: allow CORS
sed -i.bak "s|cors_allowed_origins = \[\]|cors_allowed_origins = [\"*\"]|g" "${CONFIG}" 2>/dev/null || true
# CometBFT: listen on all interfaces
sed -i.bak 's|laddr = "tcp://127.0.0.1:26657"|laddr = "tcp://0.0.0.0:26657"|g' "${CONFIG}" 2>/dev/null || true
sed -i.bak 's|laddr = "tcp://localhost:26657"|laddr = "tcp://0.0.0.0:26657"|g' "${CONFIG}" 2>/dev/null || true
# CometBFT: fast block time for testing
sed -i.bak 's|timeout_commit = "5s"|timeout_commit = "1s"|g' "${CONFIG}" 2>/dev/null || true
# CometBFT: enable Prometheus
sed -i.bak 's|^prometheus = false|prometheus = true|' "${CONFIG}" 2>/dev/null || true

# Clean sed backups
find "${HOME_DIR}/config" -name "*.bak" -delete 2>/dev/null || true

echo "  Node configured."

# -----------------------------------------------------------------
# Step 7: Validate genesis
# -----------------------------------------------------------------
echo ""
echo "Step 7: Validating genesis..."
${BINARY} genesis validate --home "${HOME_DIR}" > /dev/null 2>&1
echo "  Genesis validated successfully."

# -----------------------------------------------------------------
# Summary
# -----------------------------------------------------------------
echo ""
echo "============================================"
echo "  Testnet initialized successfully!"
echo "============================================"
echo ""
echo "Accounts:"
for acct in "${ACCOUNTS[@]}"; do
  echo "  ${acct}: ${ADDRS[${acct}]}"
done
echo ""
echo "Balances:"
echo "  validator: 100,000 CLAW (staking 50,000)"
echo "  alice:     1,000 CLAW"
echo "  bob:       1,000 CLAW"
echo "  charlie:   1,000 CLAW"
echo "  faucet:    1,000,000 CLAW"
echo ""
echo "Parameters:"
echo "  Governance voting:   100s"
echo "  Block time target:   ~1s"
echo "  Agent reward interval: 10 blocks"
echo ""
echo "Start with:"
echo "  ${BINARY} start --home ${HOME_DIR}"
echo ""
