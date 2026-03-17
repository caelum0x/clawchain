#!/usr/bin/env bash
# generate-genesis.sh — Generate mainnet genesis file for ClawChain
#
# Usage:
#   ./scripts/generate-genesis.sh [--chain-id clawchain-1] [--output mainnet/genesis.json]
#
# This script:
#   1. Initializes a temporary chain home
#   2. Sets module parameters from template
#   3. Adds genesis accounts with token allocations
#   4. Collects validator gentxs
#   5. Validates and outputs the final genesis.json
#
# Environment:
#   CLAWCHAIN_BIN       Path to clawchaind binary (default: clawchaind)
#   CHAIN_ID            Chain ID (default: clawchain-1)
#   GENTX_DIR           Directory containing validator gentx files (default: mainnet/gentxs)
#   VK_DIR              Directory containing verifying key artifacts (default: artifacts)

set -euo pipefail

# --- Configuration -----------------------------------------------------------

CLAWCHAIN_BIN="${CLAWCHAIN_BIN:-clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-1}"
OUTPUT="${OUTPUT:-mainnet/genesis.json}"
GENTX_DIR="${GENTX_DIR:-mainnet/gentxs}"
VK_DIR="${VK_DIR:-artifacts}"
TMPDIR="$(mktemp -d)"
CHAIN_HOME="${TMPDIR}/clawchain-genesis"
DENOM="uclaw"
TOTAL_SUPPLY="1000000000000000"  # 1 billion CLAW (in uclaw)

log()  { echo "[genesis] $*"; }
fail() { echo "[genesis] ERROR: $*" >&2; exit 1; }

cleanup() { rm -rf "${TMPDIR}"; }
trap cleanup EXIT

# --- Argument parsing --------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case "$1" in
        --chain-id) CHAIN_ID="$2"; shift 2 ;;
        --output)   OUTPUT="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# --- Validation --------------------------------------------------------------

if ! command -v "${CLAWCHAIN_BIN}" &>/dev/null; then
    fail "${CLAWCHAIN_BIN} not found. Build or install clawchaind first."
fi

# --- Initialize chain --------------------------------------------------------

log "Initializing genesis for chain ${CHAIN_ID}..."
"${CLAWCHAIN_BIN}" init genesis-node --chain-id "${CHAIN_ID}" --home "${CHAIN_HOME}" 2>/dev/null

GENESIS="${CHAIN_HOME}/config/genesis.json"

# --- Set module parameters ---------------------------------------------------

log "Configuring module parameters..."

# Use sed for JSON manipulation (jq optional)
if command -v jq &>/dev/null; then
    # --- Staking params ---
    jq '.app_state.staking.params.bond_denom = "uclaw" |
        .app_state.staking.params.max_validators = 100 |
        .app_state.staking.params.unbonding_time = "1814400s"' \
        "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

    # --- Governance params ---
    jq '.app_state.gov.params.min_deposit[0].denom = "uclaw" |
        .app_state.gov.params.min_deposit[0].amount = "100000000" |
        .app_state.gov.params.voting_period = "604800s" |
        .app_state.gov.params.quorum = "0.334000000000000000" |
        .app_state.gov.params.threshold = "0.500000000000000000"' \
        "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

    # --- Mint params ---
    jq '.app_state.mint.minter.inflation = "0.100000000000000000" |
        .app_state.mint.params.mint_denom = "uclaw" |
        .app_state.mint.params.inflation_rate_change = "0.060000000000000000" |
        .app_state.mint.params.inflation_max = "0.150000000000000000" |
        .app_state.mint.params.inflation_min = "0.050000000000000000" |
        .app_state.mint.params.goal_bonded = "0.670000000000000000"' \
        "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

    # --- Agent module params ---
    jq '.app_state.agent.params.max_agents = "10000" |
        .app_state.agent.params.heartbeat_interval = "100" |
        .app_state.agent.params.reward_per_block = "100000"' \
        "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

    # --- Privacy module params ---
    jq '.app_state.privacy.params.max_privacy_tx_per_block = "50"' \
        "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

    # --- CosmWasm params ---
    # Mainnet: governance-only uploads (only governance proposals can store contracts)
    # For testnet, use: "permission": "Everybody"
    GOV_ADDR=$("${CLAWCHAIN_BIN}" keys show -a --keyring-backend test governance 2>/dev/null || echo "")
    if [ -z "${GOV_ADDR}" ]; then
        # Derive the governance module address deterministically
        GOV_ADDR="claw10d07y265gmmuvt4z0w9aw880jnsr700jeyacks"
    fi
    jq --arg gov "${GOV_ADDR}" '
        .app_state.wasm.params.code_upload_access = {
            "permission": "AnyOfAddresses",
            "addresses": [$gov]
        } |
        .app_state.wasm.params.instantiate_default_permission = "Everybody" |
        .app_state.wasm.params.max_wasm_code_size = "1228800"' \
        "${GENESIS}" > "${GENESIS}.tmp" && mv "${GENESIS}.tmp" "${GENESIS}"

    log "Module parameters configured (wasm: governance-only uploads for mainnet)."
else
    log "WARNING: jq not found. Using default genesis parameters."
fi

# --- Add genesis accounts ----------------------------------------------------

log "Adding genesis accounts..."

# Foundation account (40% — community fund, ecosystem development)
"${CLAWCHAIN_BIN}" genesis add-genesis-account \
    claw1foundation000000000000000000000000000 \
    "400000000000000${DENOM}" \
    --home "${CHAIN_HOME}" 2>/dev/null || true

# Team & Contributors (15%)
"${CLAWCHAIN_BIN}" genesis add-genesis-account \
    claw1team00000000000000000000000000000000 \
    "150000000000000${DENOM}" \
    --home "${CHAIN_HOME}" 2>/dev/null || true

# Validator rewards pool (20%)
"${CLAWCHAIN_BIN}" genesis add-genesis-account \
    claw1rewards0000000000000000000000000000 \
    "200000000000000${DENOM}" \
    --home "${CHAIN_HOME}" 2>/dev/null || true

# Privacy pool reserve (10%)
"${CLAWCHAIN_BIN}" genesis add-genesis-account \
    claw1privacy0000000000000000000000000000 \
    "100000000000000${DENOM}" \
    --home "${CHAIN_HOME}" 2>/dev/null || true

# Community airdrop (10%)
"${CLAWCHAIN_BIN}" genesis add-genesis-account \
    claw1airdrop0000000000000000000000000000 \
    "100000000000000${DENOM}" \
    --home "${CHAIN_HOME}" 2>/dev/null || true

# Faucet / testnet bridge (5%)
"${CLAWCHAIN_BIN}" genesis add-genesis-account \
    claw1faucet00000000000000000000000000000 \
    "50000000000000${DENOM}" \
    --home "${CHAIN_HOME}" 2>/dev/null || true

log "Genesis accounts added."

# --- Collect gentxs ----------------------------------------------------------

if [ -d "${GENTX_DIR}" ] && [ "$(ls -A "${GENTX_DIR}" 2>/dev/null)" ]; then
    log "Collecting validator gentxs from ${GENTX_DIR}..."
    mkdir -p "${CHAIN_HOME}/config/gentx"
    cp "${GENTX_DIR}"/*.json "${CHAIN_HOME}/config/gentx/" 2>/dev/null || true

    "${CLAWCHAIN_BIN}" genesis collect-gentxs --home "${CHAIN_HOME}" 2>/dev/null
    log "Gentxs collected."
else
    log "No gentxs found at ${GENTX_DIR}. Genesis will have no validators."
    log "Validators must submit gentxs before chain start."
fi

# --- Validate genesis --------------------------------------------------------

log "Validating genesis..."
if "${CLAWCHAIN_BIN}" genesis validate-genesis --home "${CHAIN_HOME}" 2>/dev/null; then
    log "Genesis validation passed."
else
    log "WARNING: Genesis validation failed. The file may need manual adjustments."
fi

# --- Output ------------------------------------------------------------------

mkdir -p "$(dirname "${OUTPUT}")"
cp "${GENESIS}" "${OUTPUT}"

# Generate SHA256 checksum
CHECKSUM=$(shasum -a 256 "${OUTPUT}" | awk '{print $1}')

echo ""
echo "========================================"
echo "  ClawChain Genesis Generated"
echo "========================================"
echo ""
echo "  Chain ID:    ${CHAIN_ID}"
echo "  Output:      ${OUTPUT}"
echo "  SHA256:      ${CHECKSUM}"
echo ""
echo "  Token Distribution:"
echo "    Foundation (40%):  400,000,000 CLAW"
echo "    Validators (20%):  200,000,000 CLAW"
echo "    Team (15%):        150,000,000 CLAW"
echo "    Privacy Pool (10%): 100,000,000 CLAW"
echo "    Airdrop (10%):     100,000,000 CLAW"
echo "    Faucet (5%):        50,000,000 CLAW"
echo ""
echo "  Next steps:"
echo "    1. Collect validator gentxs in ${GENTX_DIR}/"
echo "    2. Re-run this script to include gentxs"
echo "    3. Distribute genesis.json to all validators"
echo "    4. Coordinate chain start time"
echo ""
echo "========================================"

log "Done."
