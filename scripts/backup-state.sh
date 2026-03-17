#!/usr/bin/env bash
# backup-state.sh -- ClawChain state backup script (Phase 13 Track B)
#
# Creates a timestamped tarball containing:
#   - Genesis state export (clawchaind export)
#   - Validator keys (priv_validator_key.json, node_key.json)
#   - Validator signing state (priv_validator_state.json)
#
# Usage:
#   ./scripts/backup-state.sh [BACKUP_DIR]
#
# Environment:
#   CLAWCHAIN_HOME   Path to clawchain home directory (default: ~/.clawchain)
#   CLAWCHAIN_BIN    Path to clawchaind binary (default: clawchaind)
#   BACKUP_DIR       Override backup output directory (default: ./backups)

set -euo pipefail

# --- Configuration -----------------------------------------------------------

CLAWCHAIN_HOME="${CLAWCHAIN_HOME:-$HOME/.clawchain}"
CLAWCHAIN_BIN="${CLAWCHAIN_BIN:-clawchaind}"
BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_NAME="clawchain-backup-${TIMESTAMP}"
STAGING_DIR="$(mktemp -d)"

# --- Helpers ------------------------------------------------------------------

log()  { echo "[backup] $*"; }
fail() { echo "[backup] ERROR: $*" >&2; exit 1; }

cleanup() {
    rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT

# --- Validation ---------------------------------------------------------------

if ! command -v "${CLAWCHAIN_BIN}" &>/dev/null; then
    fail "${CLAWCHAIN_BIN} not found in PATH. Set CLAWCHAIN_BIN to the full path."
fi

if [ ! -d "${CLAWCHAIN_HOME}" ]; then
    fail "ClawChain home directory not found at ${CLAWCHAIN_HOME}. Set CLAWCHAIN_HOME."
fi

if [ ! -f "${CLAWCHAIN_HOME}/config/priv_validator_key.json" ]; then
    fail "Validator key not found at ${CLAWCHAIN_HOME}/config/priv_validator_key.json"
fi

# --- Create staging directory -------------------------------------------------

mkdir -p "${STAGING_DIR}/${BACKUP_NAME}"
mkdir -p "${STAGING_DIR}/${BACKUP_NAME}/config"
mkdir -p "${STAGING_DIR}/${BACKUP_NAME}/data"

# --- Export genesis state -----------------------------------------------------

log "Exporting genesis state..."
if "${CLAWCHAIN_BIN}" export --home "${CLAWCHAIN_HOME}" > "${STAGING_DIR}/${BACKUP_NAME}/genesis-export.json" 2>/dev/null; then
    GENESIS_SIZE=$(wc -c < "${STAGING_DIR}/${BACKUP_NAME}/genesis-export.json" | tr -d ' ')
    log "Genesis export: ${GENESIS_SIZE} bytes"
else
    log "WARNING: Genesis export failed (node may need to be running or have state). Skipping."
    rm -f "${STAGING_DIR}/${BACKUP_NAME}/genesis-export.json"
fi

# --- Copy validator keys ------------------------------------------------------

log "Copying validator keys..."

cp "${CLAWCHAIN_HOME}/config/priv_validator_key.json" \
    "${STAGING_DIR}/${BACKUP_NAME}/config/priv_validator_key.json"

if [ -f "${CLAWCHAIN_HOME}/config/node_key.json" ]; then
    cp "${CLAWCHAIN_HOME}/config/node_key.json" \
        "${STAGING_DIR}/${BACKUP_NAME}/config/node_key.json"
else
    log "WARNING: node_key.json not found, skipping."
fi

# --- Copy validator signing state ---------------------------------------------

log "Copying validator signing state..."

if [ -f "${CLAWCHAIN_HOME}/data/priv_validator_state.json" ]; then
    cp "${CLAWCHAIN_HOME}/data/priv_validator_state.json" \
        "${STAGING_DIR}/${BACKUP_NAME}/data/priv_validator_state.json"
else
    log "WARNING: priv_validator_state.json not found, skipping."
fi

# --- Write backup metadata ----------------------------------------------------

cat > "${STAGING_DIR}/${BACKUP_NAME}/backup-metadata.json" <<METADATA
{
    "timestamp": "${TIMESTAMP}",
    "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "clawchain_home": "${CLAWCHAIN_HOME}",
    "clawchain_bin": "$(command -v "${CLAWCHAIN_BIN}" || echo "${CLAWCHAIN_BIN}")",
    "hostname": "$(hostname)",
    "backup_name": "${BACKUP_NAME}"
}
METADATA

# --- Compress into tarball ----------------------------------------------------

mkdir -p "${BACKUP_DIR}"

log "Creating backup tarball..."
tar czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" \
    -C "${STAGING_DIR}" \
    "${BACKUP_NAME}"

TARBALL_PATH="$(cd "${BACKUP_DIR}" && pwd)/${BACKUP_NAME}.tar.gz"
TARBALL_SIZE=$(wc -c < "${TARBALL_PATH}" | tr -d ' ')

# --- Print summary ------------------------------------------------------------

echo ""
echo "========================================"
echo "  ClawChain Backup Summary"
echo "========================================"
echo ""
echo "  Timestamp:    ${TIMESTAMP}"
echo "  Backup file:  ${TARBALL_PATH}"
echo "  Size:         ${TARBALL_SIZE} bytes"
echo ""
echo "  Contents:"
echo "    - backup-metadata.json"

if [ -f "${STAGING_DIR}/${BACKUP_NAME}/genesis-export.json" ]; then
    echo "    - genesis-export.json (${GENESIS_SIZE} bytes)"
else
    echo "    - genesis-export.json (SKIPPED)"
fi

echo "    - config/priv_validator_key.json"

if [ -f "${STAGING_DIR}/${BACKUP_NAME}/config/node_key.json" ]; then
    echo "    - config/node_key.json"
fi

if [ -f "${STAGING_DIR}/${BACKUP_NAME}/data/priv_validator_state.json" ]; then
    echo "    - data/priv_validator_state.json"
fi

echo ""
echo "  Restore with:"
echo "    make restore BACKUP=${TARBALL_PATH}"
echo ""
echo "========================================"

log "Backup complete."
