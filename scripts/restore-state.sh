#!/usr/bin/env bash
# restore-state.sh -- ClawChain state restoration script (Phase 13 Track B)
#
# Restores a ClawChain node from a backup tarball created by backup-state.sh.
#
# Usage:
#   ./scripts/restore-state.sh <backup-tarball>
#
# Options (via environment):
#   CLAWCHAIN_HOME     Path to clawchain home directory (default: ~/.clawchain)
#   CLAWCHAIN_BIN      Path to clawchaind binary (default: clawchaind)
#   GENESIS_RESTORE    Set to "1" to restore from genesis export (unsafe-reset-all + import genesis)
#   SKIP_STOP          Set to "1" to skip the chain-stop step (if you already stopped it)
#   YES                Set to "1" to skip confirmation prompts

set -euo pipefail

# --- Configuration -----------------------------------------------------------

CLAWCHAIN_HOME="${CLAWCHAIN_HOME:-$HOME/.clawchain}"
CLAWCHAIN_BIN="${CLAWCHAIN_BIN:-clawchaind}"
GENESIS_RESTORE="${GENESIS_RESTORE:-0}"
SKIP_STOP="${SKIP_STOP:-0}"
YES="${YES:-0}"
BACKUP_TARBALL="${1:-}"
STAGING_DIR="$(mktemp -d)"

# --- Helpers ------------------------------------------------------------------

log()  { echo "[restore] $*"; }
warn() { echo "[restore] WARNING: $*" >&2; }
fail() { echo "[restore] ERROR: $*" >&2; exit 1; }

cleanup() {
    rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT

confirm() {
    if [ "${YES}" = "1" ]; then
        return 0
    fi
    echo ""
    read -r -p "[restore] $1 [y/N] " response
    case "${response}" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

# --- Argument validation ------------------------------------------------------

if [ -z "${BACKUP_TARBALL}" ]; then
    echo "Usage: $0 <backup-tarball>"
    echo ""
    echo "Environment variables:"
    echo "  CLAWCHAIN_HOME     ClawChain home directory (default: ~/.clawchain)"
    echo "  GENESIS_RESTORE=1  Restore from genesis export (unsafe-reset-all + import)"
    echo "  SKIP_STOP=1        Skip stopping the chain (already stopped)"
    echo "  YES=1              Skip confirmation prompts"
    exit 1
fi

if [ ! -f "${BACKUP_TARBALL}" ]; then
    fail "Backup tarball not found: ${BACKUP_TARBALL}"
fi

if ! command -v "${CLAWCHAIN_BIN}" &>/dev/null; then
    fail "${CLAWCHAIN_BIN} not found in PATH. Set CLAWCHAIN_BIN to the full path."
fi

# --- Extract and validate tarball ---------------------------------------------

log "Extracting backup tarball: ${BACKUP_TARBALL}"
tar xzf "${BACKUP_TARBALL}" -C "${STAGING_DIR}"

# Find the backup directory inside the tarball (should be clawchain-backup-TIMESTAMP)
BACKUP_DIR=$(find "${STAGING_DIR}" -mindepth 1 -maxdepth 1 -type d | head -1)

if [ -z "${BACKUP_DIR}" ]; then
    fail "Tarball does not contain a backup directory. Is this a valid backup?"
fi

BACKUP_NAME="$(basename "${BACKUP_DIR}")"
log "Found backup: ${BACKUP_NAME}"

# Validate required contents
VALID=true

if [ ! -f "${BACKUP_DIR}/config/priv_validator_key.json" ]; then
    warn "Missing config/priv_validator_key.json in backup"
    VALID=false
fi

if [ ! -f "${BACKUP_DIR}/backup-metadata.json" ]; then
    warn "Missing backup-metadata.json in backup"
fi

if [ "${GENESIS_RESTORE}" = "1" ] && [ ! -f "${BACKUP_DIR}/genesis-export.json" ]; then
    fail "GENESIS_RESTORE=1 requested but genesis-export.json not found in backup"
fi

# --- Print backup metadata ----------------------------------------------------

echo ""
echo "========================================"
echo "  Backup Contents"
echo "========================================"

if [ -f "${BACKUP_DIR}/backup-metadata.json" ]; then
    echo ""
    echo "  Metadata:"
    # Use simple parsing to avoid jq dependency
    while IFS= read -r line; do
        echo "    ${line}"
    done < "${BACKUP_DIR}/backup-metadata.json"
fi

echo ""
echo "  Files:"
(cd "${STAGING_DIR}" && find "${BACKUP_NAME}" -type f | sort | while read -r f; do
    SIZE=$(wc -c < "${STAGING_DIR}/${f}" | tr -d ' ')
    echo "    ${f} (${SIZE} bytes)"
done)

echo ""
echo "  Target home:     ${CLAWCHAIN_HOME}"
echo "  Genesis restore: ${GENESIS_RESTORE}"
echo ""
echo "========================================"

if ! confirm "Proceed with restoration? This will overwrite files in ${CLAWCHAIN_HOME}."; then
    log "Restoration cancelled."
    exit 0
fi

# --- Stop the chain if running ------------------------------------------------

if [ "${SKIP_STOP}" != "1" ]; then
    log "Checking if clawchaind is running..."

    if pgrep -x clawchaind >/dev/null 2>&1; then
        log "clawchaind is running. Attempting to stop..."

        # Try systemctl first, then kill
        if command -v systemctl &>/dev/null && systemctl is-active --quiet clawchaind 2>/dev/null; then
            sudo systemctl stop clawchaind
            log "Stopped clawchaind via systemctl."
        else
            pkill -x clawchaind || true
            # Wait for process to exit
            for i in $(seq 1 10); do
                if ! pgrep -x clawchaind >/dev/null 2>&1; then
                    break
                fi
                sleep 1
            done

            if pgrep -x clawchaind >/dev/null 2>&1; then
                fail "Could not stop clawchaind. Please stop it manually and re-run with SKIP_STOP=1."
            fi
            log "Stopped clawchaind via pkill."
        fi
    else
        log "clawchaind is not running."
    fi
fi

# --- Perform genesis restore (unsafe-reset-all + import) ----------------------

if [ "${GENESIS_RESTORE}" = "1" ]; then
    log "Performing genesis restore (unsafe-reset-all)..."

    if ! confirm "This will run 'comet unsafe-reset-all' and DELETE ALL CHAIN DATA. Continue?"; then
        log "Restoration cancelled."
        exit 0
    fi

    "${CLAWCHAIN_BIN}" comet unsafe-reset-all --home "${CLAWCHAIN_HOME}"
    log "Chain data reset complete."

    log "Importing genesis export..."
    cp "${BACKUP_DIR}/genesis-export.json" "${CLAWCHAIN_HOME}/config/genesis.json"
    log "Genesis file replaced."
fi

# --- Restore validator keys ---------------------------------------------------

log "Restoring validator keys..."

if [ -f "${BACKUP_DIR}/config/priv_validator_key.json" ]; then
    mkdir -p "${CLAWCHAIN_HOME}/config"
    cp "${BACKUP_DIR}/config/priv_validator_key.json" \
        "${CLAWCHAIN_HOME}/config/priv_validator_key.json"
    chmod 600 "${CLAWCHAIN_HOME}/config/priv_validator_key.json"
    log "Restored priv_validator_key.json"
fi

if [ -f "${BACKUP_DIR}/config/node_key.json" ]; then
    cp "${BACKUP_DIR}/config/node_key.json" \
        "${CLAWCHAIN_HOME}/config/node_key.json"
    chmod 600 "${CLAWCHAIN_HOME}/config/node_key.json"
    log "Restored node_key.json"
fi

# --- Restore validator signing state ------------------------------------------

if [ -f "${BACKUP_DIR}/data/priv_validator_state.json" ]; then
    if [ "${GENESIS_RESTORE}" = "1" ]; then
        warn "Skipping priv_validator_state.json restore during genesis restore (state was reset to height 0)."
    else
        mkdir -p "${CLAWCHAIN_HOME}/data"
        cp "${BACKUP_DIR}/data/priv_validator_state.json" \
            "${CLAWCHAIN_HOME}/data/priv_validator_state.json"
        log "Restored priv_validator_state.json"
    fi
fi

# --- Print restoration summary ------------------------------------------------

echo ""
echo "========================================"
echo "  ClawChain Restoration Summary"
echo "========================================"
echo ""
echo "  Backup:          ${BACKUP_NAME}"
echo "  Target home:     ${CLAWCHAIN_HOME}"
echo "  Genesis restore: ${GENESIS_RESTORE}"
echo ""
echo "  Restored files:"

if [ -f "${BACKUP_DIR}/config/priv_validator_key.json" ]; then
    echo "    [OK] config/priv_validator_key.json"
fi

if [ -f "${BACKUP_DIR}/config/node_key.json" ]; then
    echo "    [OK] config/node_key.json"
fi

if [ "${GENESIS_RESTORE}" = "1" ]; then
    echo "    [OK] config/genesis.json (from genesis-export.json)"
    echo "    [--] data/priv_validator_state.json (reset to height 0)"
elif [ -f "${BACKUP_DIR}/data/priv_validator_state.json" ]; then
    echo "    [OK] data/priv_validator_state.json"
fi

echo ""
echo "  Next steps:"

if [ "${GENESIS_RESTORE}" = "1" ]; then
    echo "    1. Start the node: sudo systemctl start clawchaind"
    echo "    2. The node will replay from genesis (this may take time)."
    echo "    3. Monitor: journalctl -u clawchaind -f"
else
    echo "    1. Start the node: sudo systemctl start clawchaind"
    echo "    2. Monitor: journalctl -u clawchaind -f"
    echo "    3. Verify sync: clawchaind status --home ${CLAWCHAIN_HOME}"
fi

echo ""
echo "  WARNING: Verify priv_validator_state.json is current before"
echo "  signing blocks. A stale state file can cause double-signing."
echo ""
echo "========================================"

log "Restoration complete."
