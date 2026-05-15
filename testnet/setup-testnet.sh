#!/usr/bin/env bash
#
# setup-testnet.sh — Initialize a 4-validator ClawChain testnet.
#
# This script generates all node directories under ./data/ with proper
# genesis, keys, and peer configuration. Run it once before `docker compose up`.
#
# Usage:
#   ./setup-testnet.sh [NUM_VALIDATORS]
#
# Default: 4 validators
#
set -euo pipefail

# Parse flags
FRESH_MODE=false
NUM_VALIDATORS=""
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH_MODE=true ;;
    *) NUM_VALIDATORS="$arg" ;;
  esac
done
NUM_VALIDATORS="${NUM_VALIDATORS:-4}"
CHAIN_ID="clawchain-testnet-1"
DENOM="uclaw"
STAKE_DENOM="uclaw"
INITIAL_SUPPLY="1000000000000"   # 1,000,000 CLAW
VALIDATOR_STAKE="100000000"       # 100 CLAW per validator
FAUCET_BALANCE="500000000000"     # 500,000 CLAW
KEYRING_BACKEND="test"
DATA_DIR="$(cd "$(dirname "$0")" && pwd)/data"
BINARY="clawchaind"

echo "============================================"
echo "  ClawChain Testnet Setup"
echo "  Validators: ${NUM_VALIDATORS}"
echo "  Chain ID:   ${CHAIN_ID}"
echo "  Data dir:   ${DATA_DIR}"
echo "============================================"
echo ""

# Check binary
if ! command -v "${BINARY}" &>/dev/null; then
  echo "ERROR: ${BINARY} not found. Run 'make install' first."
  exit 1
fi

# Clean previous data
if [ -d "${DATA_DIR}" ]; then
  if [ "${FRESH_MODE}" = true ]; then
    echo "Fresh mode: cleaning previous testnet data..."
    rm -rf "${DATA_DIR}"
  else
    echo "Cleaning previous testnet data..."
    rm -rf "${DATA_DIR}"
  fi
fi

# -----------------------------------------------------------------
# Step 1: Initialize each validator node
# -----------------------------------------------------------------
echo ""
echo "Step 1: Initializing ${NUM_VALIDATORS} validator nodes..."

declare -a NODE_IDS
declare -a VALIDATOR_ADDRS

for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
  NODE_HOME="${DATA_DIR}/node${i}"
  MONIKER="validator-${i}"

  ${BINARY} init "${MONIKER}" --chain-id "${CHAIN_ID}" --home "${NODE_HOME}" --default-denom "${DENOM}" > /dev/null 2>&1

  # Create validator key
  ${BINARY} keys add "validator" --keyring-backend "${KEYRING_BACKEND}" --home "${NODE_HOME}" > /dev/null 2>&1
  ADDR=$(${BINARY} keys show "validator" -a --keyring-backend "${KEYRING_BACKEND}" --home "${NODE_HOME}")
  VALIDATOR_ADDRS+=("${ADDR}")

  # Get node ID
  NODE_ID=$(${BINARY} comet show-node-id --home "${NODE_HOME}")
  NODE_IDS+=("${NODE_ID}")

  echo "  node${i}: ${NODE_ID} (${ADDR})"
done

# Create faucet key on node0
FAUCET_HOME="${DATA_DIR}/node0"
${BINARY} keys add "faucet" --keyring-backend "${KEYRING_BACKEND}" --home "${FAUCET_HOME}" > /dev/null 2>&1
FAUCET_ADDR=$(${BINARY} keys show "faucet" -a --keyring-backend "${KEYRING_BACKEND}" --home "${FAUCET_HOME}")
echo "  faucet: ${FAUCET_ADDR}"

# -----------------------------------------------------------------
# Step 2: Build genesis on node0 and distribute
# -----------------------------------------------------------------
echo ""
echo "Step 2: Building genesis..."

GENESIS_HOME="${DATA_DIR}/node0"

# Add all validator accounts to genesis
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
  ${BINARY} genesis add-genesis-account "${VALIDATOR_ADDRS[$i]}" "${INITIAL_SUPPLY}${DENOM}" \
    --keyring-backend "${KEYRING_BACKEND}" --home "${GENESIS_HOME}" > /dev/null 2>&1
done

# Add faucet account
${BINARY} genesis add-genesis-account "${FAUCET_ADDR}" "${FAUCET_BALANCE}${DENOM}" \
  --keyring-backend "${KEYRING_BACKEND}" --home "${GENESIS_HOME}" > /dev/null 2>&1

echo "  Genesis accounts added."

# -----------------------------------------------------------------
# Step 3: Generate gentx for each validator
# -----------------------------------------------------------------
echo ""
echo "Step 3: Generating gentx for each validator..."

for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
  NODE_HOME="${DATA_DIR}/node${i}"

  # Copy genesis from node0 to this node so gentx can reference it
  if [ "${i}" -ne 0 ]; then
    cp "${GENESIS_HOME}/config/genesis.json" "${NODE_HOME}/config/genesis.json"
  fi

  ${BINARY} genesis gentx "validator" "${VALIDATOR_STAKE}${STAKE_DENOM}" \
    --chain-id "${CHAIN_ID}" \
    --keyring-backend "${KEYRING_BACKEND}" \
    --home "${NODE_HOME}" \
    --moniker "validator-${i}" > /dev/null 2>&1

  echo "  gentx created for validator-${i}"
done

# -----------------------------------------------------------------
# Step 4: Collect gentxs and finalize genesis
# -----------------------------------------------------------------
echo ""
echo "Step 4: Collecting gentxs..."

# Copy all gentx files to node0
for i in $(seq 1 $((NUM_VALIDATORS - 1))); do
  cp "${DATA_DIR}/node${i}/config/gentx/"*.json "${GENESIS_HOME}/config/gentx/" 2>/dev/null || true
done

${BINARY} genesis collect-gentxs --home "${GENESIS_HOME}" > /dev/null 2>&1

# Validate genesis
${BINARY} genesis validate --home "${GENESIS_HOME}" > /dev/null 2>&1
echo "  Genesis validated."

# -----------------------------------------------------------------
# Step 4b: Configure staking rewards and chain economics
# -----------------------------------------------------------------
echo ""
echo "Step 4b: Configuring chain economics..."

GENESIS="${GENESIS_HOME}/config/genesis.json"

# Check for jq
if command -v jq &>/dev/null; then
  # --- Mint module params ---
  # 8-15% annual inflation (conservative for testnet)
  # Goal: 67% bonded
  jq '.app_state.mint.minter.inflation = "0.100000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.mint.minter.annual_provisions = "0.000000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.mint.params.mint_denom = "uclaw"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.mint.params.inflation_rate_change = "0.130000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.mint.params.inflation_max = "0.150000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.mint.params.inflation_min = "0.080000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.mint.params.goal_bonded = "0.670000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.mint.params.blocks_per_year = "6311520"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

  # --- Distribution module params ---
  # 5% community tax to fund ecosystem development
  jq '.app_state.distribution.params.community_tax = "0.050000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.distribution.params.withdraw_addr_enabled = true' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

  # --- Staking module params ---
  # 14 days unbonding (shorter for testnet agility)
  # 5% minimum commission (encourage validator sustainability)
  jq '.app_state.staking.params.unbonding_time = "1209600s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.staking.params.max_validators = 100' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.staking.params.bond_denom = "uclaw"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.staking.params.min_commission_rate = "0.050000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

  # --- Slashing module params ---
  # Signed blocks window: 10000 (allow ~14 hours offline)
  # Min signed per window: 5% (lenient for testnet)
  # Downtime jail duration: 10 minutes
  jq '.app_state.slashing.params.signed_blocks_window = "10000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.slashing.params.min_signed_per_window = "0.050000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.slashing.params.downtime_jail_duration = "600s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.slashing.params.slash_fraction_double_sign = "0.050000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.slashing.params.slash_fraction_downtime = "0.000100000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

  # --- Governance module params ---
  # 10 CLAW minimum deposit, 2-day voting period (testnet-friendly)
  jq '.app_state.gov.params.min_deposit = [{"denom": "uclaw", "amount": "10000000"}]' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.gov.params.max_deposit_period = "172800s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.gov.params.voting_period = "172800s"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.gov.params.quorum = "0.334000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.gov.params.threshold = "0.500000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"
  jq '.app_state.gov.params.veto_threshold = "0.334000000000000000"' "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

  # --- CosmWasm params (testnet: permissionless uploads) ---
  jq '.app_state.wasm.params.code_upload_access = {"permission": "Everybody"} |
      .app_state.wasm.params.instantiate_default_permission = "Everybody" |
      .app_state.wasm.params.max_wasm_code_size = "1228800"' \
      "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

  # Re-validate genesis after patching
  ${BINARY} genesis validate --home "${GENESIS_HOME}" > /dev/null 2>&1
  echo "  Chain economics configured and validated:"
  echo "    Mint:    8-15% inflation, 67% goal bonded, uclaw denom"
  echo "    Distr:   5% community tax"
  echo "    Staking: 14d unbonding, 100 max validators, 5% min commission"
  echo "    Slash:   10000 block window, 10m jail, 5% double sign"
  echo "    Gov:     10 CLAW deposit, 2d voting, 33.4% quorum"
  echo "    Wasm:    permissionless uploads (testnet), 1.2MB max code size"
else
  echo "  WARNING: jq not found — skipping genesis param configuration."
  echo "  Install jq to enable custom chain economics."
fi

# -----------------------------------------------------------------
# Step 5: Configure networking and copy final genesis
# -----------------------------------------------------------------
echo ""
echo "Step 5: Configuring networking..."

# Build persistent peers string
PEERS=""
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
  IP="10.0.10.$((i + 2))"
  if [ -n "${PEERS}" ]; then
    PEERS="${PEERS},"
  fi
  PEERS="${PEERS}${NODE_IDS[$i]}@${IP}:26656"
done

for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
  NODE_HOME="${DATA_DIR}/node${i}"

  # Copy final genesis to all nodes
  if [ "${i}" -ne 0 ]; then
    cp "${GENESIS_HOME}/config/genesis.json" "${NODE_HOME}/config/genesis.json"
  fi

  # Patch config.toml
  CONFIG="${NODE_HOME}/config/config.toml"

  # Set persistent peers
  sed -i.bak "s|^persistent_peers *=.*|persistent_peers = \"${PEERS}\"|" "${CONFIG}"

  # Allow non-routable addresses (Docker network)
  sed -i.bak "s|^addr_book_strict *=.*|addr_book_strict = false|" "${CONFIG}"

  # Listen on all interfaces
  sed -i.bak "s|^laddr *=.*\"tcp://127.0.0.1:26657\"|laddr = \"tcp://0.0.0.0:26657\"|" "${CONFIG}"
  sed -i.bak "s|^laddr *=.*\"tcp://localhost:26657\"|laddr = \"tcp://0.0.0.0:26657\"|" "${CONFIG}"

  # Enable Prometheus metrics
  sed -i.bak "s|^prometheus *=.*|prometheus = true|" "${CONFIG}"
  sed -i.bak "s|^prometheus_listen_addr *=.*|prometheus_listen_addr = \":26660\"|" "${CONFIG}"

  # Patch app.toml — enable REST API
  APP_CONFIG="${NODE_HOME}/config/app.toml"
  sed -i.bak "s|^enable *=.*# EnableUnsafeCORS|enable = true # EnableUnsafeCORS|" "${APP_CONFIG}" 2>/dev/null || true
  # Enable API
  sed -i.bak '/^\[api\]/,/^\[/{s|^enable *=.*|enable = true|}' "${APP_CONFIG}" 2>/dev/null || true
  # Enable gRPC
  sed -i.bak '/^\[grpc\]/,/^\[/{s|^enable *=.*|enable = true|}' "${APP_CONFIG}" 2>/dev/null || true
  # Listen on all interfaces for API
  sed -i.bak "s|^address *=.*\"tcp://localhost:1317\"|address = \"tcp://0.0.0.0:1317\"|" "${APP_CONFIG}" 2>/dev/null || true
  # Ensure the app starts with an explicit min gas price
  sed -i.bak "s|^minimum-gas-prices *=.*|minimum-gas-prices = \"0.0001${DENOM}\"|" "${APP_CONFIG}" 2>/dev/null || true

  # Clean sed backups
  rm -f "${CONFIG}.bak" "${APP_CONFIG}.bak"

  # Verify API is enabled in app.toml
  if ! awk '/^\[api\]/,/^\[/' "${APP_CONFIG}" | grep -q 'enable = true'; then
    echo "  WARNING: node${i} app.toml [api] section may not have 'enable = true'."
    echo "  The REST API might not be accessible. Check ${APP_CONFIG} manually."
  fi

  echo "  node${i}: peers configured, prometheus enabled"
done

# -----------------------------------------------------------------
# Step 6: Summary
# -----------------------------------------------------------------
echo ""
echo "============================================"
echo "  Testnet initialized successfully!"
echo "============================================"
echo ""
echo "Validators:"
for i in $(seq 0 $((NUM_VALIDATORS - 1))); do
  echo "  node${i}: ${NODE_IDS[$i]}@10.0.10.$((i + 2)):26656"
  echo "         address: ${VALIDATOR_ADDRS[$i]}"
done
echo ""
echo "Faucet: ${FAUCET_ADDR}"
echo ""
echo "Next steps:"
echo "  cd testnet && docker compose up -d"
echo ""
echo "Endpoints (node0):"
echo "  RPC:        http://localhost:26657"
echo "  REST:       http://localhost:1317"
echo "  gRPC:       localhost:9090"
echo "  Prometheus: http://localhost:26660/metrics"
echo "  Grafana:    http://localhost:3000 (admin/clawchain)"
echo ""
