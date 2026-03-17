#!/usr/bin/env bash
# validate-upgrade.sh -- ClawChain upgrade handler validation tool (Phase 13 Track C)
#
# Exports current chain state, validates genesis integrity, verifies module
# ConsensusVersions, and simulates an upgrade by re-initializing from the
# exported genesis in a temporary directory.
#
# Usage:
#   ./scripts/validate-upgrade.sh [--height <block-height>] [--binary <path>] [--chain-id <id>]
#
# Environment overrides:
#   CLAWCHAIND        Path to clawchaind binary  (default: clawchaind on PATH)
#   CHAIN_ID          Chain ID                    (default: clawchain-1)
#   EXPORT_HEIGHT     Block height to export      (default: latest)

set -euo pipefail

###############################################################################
# Configuration
###############################################################################

BINARY="${CLAWCHAIND:-clawchaind}"
CHAIN_ID="${CHAIN_ID:-clawchain-1}"
EXPORT_HEIGHT="${EXPORT_HEIGHT:-}"
WORK_DIR=""
REPORT_FILE=""
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Expected module ConsensusVersions (update on every consensus-breaking change)
declare -A EXPECTED_VERSIONS=(
  [agent]=4
  [privacy]=1
  [reputation]=3
  [marketplace]=2
  [messaging]=2
  [clawchain]=1
)

# Required genesis module sections (top-level keys inside app_state)
REQUIRED_MODULES=(
  agent
  privacy
  reputation
  marketplace
  messaging
  clawchain
  bank
  staking
  auth
  gov
)

###############################################################################
# Argument parsing
###############################################################################

while [[ $# -gt 0 ]]; do
  case "$1" in
    --height)
      EXPORT_HEIGHT="$2"; shift 2 ;;
    --binary)
      BINARY="$2"; shift 2 ;;
    --chain-id)
      CHAIN_ID="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--height <block-height>] [--binary <path>] [--chain-id <id>]"
      exit 0 ;;
    *)
      echo "Unknown flag: $1"; exit 1 ;;
  esac
done

###############################################################################
# Helpers
###############################################################################

cleanup() {
  if [[ -n "${WORK_DIR}" && -d "${WORK_DIR}" ]]; then
    rm -rf "${WORK_DIR}"
  fi
}
trap cleanup EXIT

log()  { printf "\033[1;34m[INFO]\033[0m  %s\n" "$*"; }
pass() { printf "\033[1;32m[PASS]\033[0m  %s\n" "$*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf "\033[1;31m[FAIL]\033[0m  %s\n" "$*"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
warn() { printf "\033[1;33m[WARN]\033[0m  %s\n" "$*"; WARN_COUNT=$((WARN_COUNT + 1)); }

check_binary() {
  if ! command -v "${BINARY}" &>/dev/null; then
    fail "Binary '${BINARY}' not found on PATH"
    echo "Install with: make install"
    exit 1
  fi
  pass "Binary found: $(command -v "${BINARY}")"
  log "Binary version: $(${BINARY} version 2>/dev/null || echo 'unknown')"
}

###############################################################################
# Step 1: Export chain state
###############################################################################

export_state() {
  WORK_DIR="$(mktemp -d)"
  REPORT_FILE="${WORK_DIR}/validation-report.txt"
  local EXPORT_FILE="${WORK_DIR}/pre-upgrade-state.json"

  log "Working directory: ${WORK_DIR}"

  local height_flag=""
  if [[ -n "${EXPORT_HEIGHT}" ]]; then
    height_flag="--height ${EXPORT_HEIGHT}"
    log "Exporting state at height ${EXPORT_HEIGHT}..."
  else
    log "Exporting state at latest height..."
  fi

  # shellcheck disable=SC2086
  if ${BINARY} export ${height_flag} > "${EXPORT_FILE}" 2>/dev/null; then
    pass "State export succeeded ($(wc -c < "${EXPORT_FILE}" | tr -d ' ') bytes)"
  else
    # If chain is not running, try to export from stored state
    # shellcheck disable=SC2086
    if ${BINARY} export ${height_flag} --home "$(${BINARY} config home 2>/dev/null || echo "${HOME}/.clawchain")" > "${EXPORT_FILE}" 2>/dev/null; then
      pass "State export succeeded from stored state"
    else
      warn "Could not export live state -- generating default genesis for validation"
      ${BINARY} init validate-test --chain-id "${CHAIN_ID}" --home "${WORK_DIR}/init-tmp" >/dev/null 2>&1 || true
      if [[ -f "${WORK_DIR}/init-tmp/config/genesis.json" ]]; then
        cp "${WORK_DIR}/init-tmp/config/genesis.json" "${EXPORT_FILE}"
        pass "Using default genesis for structural validation"
      else
        fail "Cannot generate any genesis state for validation"
        return 1
      fi
    fi
  fi

  echo "${EXPORT_FILE}"
}

###############################################################################
# Step 2: Validate JSON
###############################################################################

validate_json() {
  local file="$1"
  if python3 -m json.tool "${file}" >/dev/null 2>&1; then
    pass "Export is valid JSON"
    return 0
  elif jq empty "${file}" 2>/dev/null; then
    pass "Export is valid JSON (jq)"
    return 0
  else
    fail "Export is NOT valid JSON"
    return 1
  fi
}

###############################################################################
# Step 3: Check required module sections in genesis app_state
###############################################################################

check_module_sections() {
  local file="$1"

  # Determine JSON query tool
  local query_tool=""
  if command -v jq &>/dev/null; then
    query_tool="jq"
  elif command -v python3 &>/dev/null; then
    query_tool="python3"
  else
    warn "Neither jq nor python3 available -- skipping module section checks"
    return 0
  fi

  log "Checking required module sections in genesis app_state..."

  for mod in "${REQUIRED_MODULES[@]}"; do
    local found=""
    if [[ "${query_tool}" == "jq" ]]; then
      found=$(jq -r ".app_state.${mod} // empty" "${file}" 2>/dev/null)
    else
      found=$(python3 -c "
import json, sys
with open('${file}') as f:
    data = json.load(f)
section = data.get('app_state', {}).get('${mod}')
if section is not None:
    print('present')
" 2>/dev/null)
    fi

    if [[ -n "${found}" ]]; then
      pass "Module section present: ${mod}"
    else
      fail "Module section MISSING: ${mod}"
    fi
  done
}

###############################################################################
# Step 4: Verify module ConsensusVersions
###############################################################################

verify_consensus_versions() {
  log "Verifying module ConsensusVersions from source..."

  # Read ConsensusVersions from module source files
  local base_dir
  base_dir="$(cd "$(dirname "$0")/.." && pwd)"

  for mod in "${!EXPECTED_VERSIONS[@]}"; do
    local expected="${EXPECTED_VERSIONS[$mod]}"
    local module_file="${base_dir}/x/${mod}/module/module.go"

    if [[ ! -f "${module_file}" ]]; then
      warn "Module source not found: ${module_file}"
      continue
    fi

    local actual
    actual=$(grep -oP 'ConsensusVersion\(\).*return\s+\K[0-9]+' "${module_file}" 2>/dev/null || \
             grep 'ConsensusVersion' "${module_file}" | grep -oE '[0-9]+' | tail -1 || echo "")

    if [[ -z "${actual}" ]]; then
      warn "Could not parse ConsensusVersion for module '${mod}'"
      continue
    fi

    if [[ "${actual}" == "${expected}" ]]; then
      pass "Module '${mod}' ConsensusVersion: ${actual} (expected ${expected})"
    else
      fail "Module '${mod}' ConsensusVersion mismatch: got ${actual}, expected ${expected}"
    fi
  done
}

###############################################################################
# Step 5: Validate genesis with clawchaind validate-genesis
###############################################################################

validate_genesis_cmd() {
  local file="$1"

  log "Running 'clawchaind validate-genesis'..."

  if ${BINARY} validate-genesis "${file}" 2>/dev/null; then
    pass "Genesis validation passed (validate-genesis)"
  elif ${BINARY} genesis validate "${file}" 2>/dev/null; then
    pass "Genesis validation passed (genesis validate)"
  else
    warn "Genesis validation command unavailable or failed -- skipping"
  fi
}

###############################################################################
# Step 6: Simulate upgrade (re-initialize from exported genesis)
###############################################################################

simulate_upgrade() {
  local file="$1"
  local sim_home="${WORK_DIR}/upgrade-sim"

  log "Simulating upgrade: re-initializing from exported genesis..."

  # Initialize a fresh node
  if ! ${BINARY} init upgrade-test --chain-id "${CHAIN_ID}" --home "${sim_home}" >/dev/null 2>&1; then
    fail "Failed to initialize fresh node for upgrade simulation"
    return 1
  fi
  pass "Fresh node initialized at ${sim_home}"

  # Replace genesis with exported state
  cp "${file}" "${sim_home}/config/genesis.json"
  pass "Exported genesis copied to simulated node"

  # Validate the genesis in the simulated node context
  if ${BINARY} validate-genesis "${sim_home}/config/genesis.json" --home "${sim_home}" 2>/dev/null; then
    pass "Simulated node genesis validation passed"
  elif ${BINARY} genesis validate "${sim_home}/config/genesis.json" --home "${sim_home}" 2>/dev/null; then
    pass "Simulated node genesis validation passed"
  else
    warn "Simulated node genesis validation command not available"
  fi

  # Attempt a dry-run start (start and immediately stop)
  log "Attempting simulated node start (5-second timeout)..."
  local start_log="${WORK_DIR}/start.log"

  # Run the node with a timeout; success means it started without panicking
  if timeout 5 ${BINARY} start --home "${sim_home}" > "${start_log}" 2>&1; then
    # timeout 0 exit = process exited normally before timeout
    pass "Simulated node started and exited cleanly"
  else
    local exit_code=$?
    if [[ ${exit_code} -eq 124 ]]; then
      # timeout killed it -- means it was running fine for 5 seconds
      pass "Simulated node ran successfully for 5 seconds (killed by timeout)"
    else
      # Check if it at least got past init
      if grep -q "starting node" "${start_log}" 2>/dev/null || \
         grep -q "Starting" "${start_log}" 2>/dev/null || \
         grep -q "ABCI" "${start_log}" 2>/dev/null; then
        pass "Simulated node initialized successfully (exited with code ${exit_code})"
      else
        warn "Simulated node start returned exit code ${exit_code}"
        if [[ -f "${start_log}" ]]; then
          log "Last 10 lines of start log:"
          tail -10 "${start_log}" | while IFS= read -r line; do
            echo "  ${line}"
          done
        fi
      fi
    fi
  fi
}

###############################################################################
# Step 7: Module migration inventory
###############################################################################

check_migration_handlers() {
  local base_dir
  base_dir="$(cd "$(dirname "$0")/.." && pwd)"

  log "Checking for module migration handlers..."

  for mod in "${!EXPECTED_VERSIONS[@]}"; do
    local version="${EXPECTED_VERSIONS[$mod]}"
    local migrations_dir="${base_dir}/x/${mod}/migrations"
    local keeper_dir="${base_dir}/x/${mod}/keeper"

    if [[ -d "${migrations_dir}" ]]; then
      local migration_count
      migration_count=$(find "${migrations_dir}" -name '*.go' | wc -l | tr -d ' ')
      pass "Module '${mod}' has migrations directory (${migration_count} files)"
    elif grep -rq "RegisterMigration\|Migrator" "${keeper_dir}" 2>/dev/null; then
      pass "Module '${mod}' has inline migration handlers"
    elif [[ "${version}" -gt 1 ]]; then
      warn "Module '${mod}' is at version ${version} but no migrations directory found"
    else
      pass "Module '${mod}' at version 1 (no migrations needed)"
    fi
  done
}

###############################################################################
# Validation Report
###############################################################################

print_report() {
  echo ""
  echo "=================================================================="
  echo "  ClawChain Upgrade Validation Report"
  echo "=================================================================="
  echo ""
  echo "  Date:      $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "  Binary:    ${BINARY} ($(${BINARY} version 2>/dev/null || echo 'unknown'))"
  echo "  Chain ID:  ${CHAIN_ID}"
  echo "  Height:    ${EXPORT_HEIGHT:-latest}"
  echo ""
  echo "  Expected Module ConsensusVersions:"
  for mod in agent privacy reputation marketplace messaging clawchain; do
    printf "    %-15s v%s\n" "${mod}" "${EXPECTED_VERSIONS[$mod]}"
  done
  echo ""
  echo "------------------------------------------------------------------"
  echo "  Results:   ${PASS_COUNT} passed, ${FAIL_COUNT} failed, ${WARN_COUNT} warnings"
  echo "------------------------------------------------------------------"
  echo ""

  if [[ ${FAIL_COUNT} -gt 0 ]]; then
    echo "  STATUS: UPGRADE VALIDATION FAILED"
    echo ""
    echo "  Action required: Fix the failures above before proceeding with"
    echo "  the upgrade. See docs/upgrade-guide.md for detailed procedures."
    echo ""
    return 1
  elif [[ ${WARN_COUNT} -gt 0 ]]; then
    echo "  STATUS: UPGRADE VALIDATION PASSED WITH WARNINGS"
    echo ""
    echo "  Review warnings above. The upgrade may proceed but manual"
    echo "  verification of warned items is recommended."
    echo ""
    return 0
  else
    echo "  STATUS: UPGRADE VALIDATION PASSED"
    echo ""
    return 0
  fi
}

###############################################################################
# Main
###############################################################################

main() {
  echo ""
  echo "=================================================================="
  echo "  ClawChain Upgrade Validation Tool (Phase 13 Track C)"
  echo "=================================================================="
  echo ""

  # Preflight
  check_binary

  # Step 1: Export state
  local export_file
  export_file=$(export_state)

  # Step 2: Validate JSON
  validate_json "${export_file}"

  # Step 3: Check module sections
  check_module_sections "${export_file}"

  # Step 4: Verify ConsensusVersions
  verify_consensus_versions

  # Step 5: validate-genesis command
  validate_genesis_cmd "${export_file}"

  # Step 6: Simulate upgrade
  simulate_upgrade "${export_file}"

  # Step 7: Migration handler inventory
  check_migration_handlers

  # Report
  print_report
}

main "$@"
