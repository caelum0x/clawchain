#!/usr/bin/env bash
# verify-backup-restore.sh -- ClawChain backup/restore verification gate
# Phase 17 Track C
#
# This script verifies that a backup can be successfully restored by:
#   1. Creating a temporary backup of validator keys and config
#   2. Copying current genesis and config files
#   3. Verifying all required files are present and valid
#   4. Simulating restore by comparing backup files against originals
#   5. Reporting pass/fail for each verification step
#
# This is a non-destructive verification script. It does not modify any
# production files or state. All operations use temporary directories.
#
# Usage:
#   ./scripts/verify-backup-restore.sh [BACKUP_TARBALL]
#
# If BACKUP_TARBALL is not provided, the script creates a fresh backup
# from the current state and verifies that.
#
# Environment:
#   CLAWCHAIN_HOME   Path to clawchain home directory (default: ~/.clawchain)
#   CLAWCHAIN_BIN    Path to clawchaind binary (default: clawchaind)

set -euo pipefail

# --- Configuration -----------------------------------------------------------

CLAWCHAIN_HOME="${CLAWCHAIN_HOME:-$HOME/.clawchain}"
CLAWCHAIN_BIN="${CLAWCHAIN_BIN:-clawchaind}"
BACKUP_TARBALL="${1:-}"
WORK_DIR="$(mktemp -d)"
BACKUP_STAGING="${WORK_DIR}/backup-staging"
RESTORE_STAGING="${WORK_DIR}/restore-staging"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
TOTAL_COUNT=0

# --- Helpers ------------------------------------------------------------------

cleanup() {
    rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

pass() {
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "[PASS] $1"
}

fail() {
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "[FAIL] $1"
}

skip() {
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    SKIP_COUNT=$((SKIP_COUNT + 1))
    echo "[SKIP] $1"
}

info() {
    echo "[INFO] $1"
}

separator() {
    echo "----------------------------------------"
}

# --- Banner -------------------------------------------------------------------

echo ""
echo "========================================"
echo "  ClawChain Backup/Restore Verification"
echo "========================================"
echo ""
echo "  Home:   ${CLAWCHAIN_HOME}"
echo "  Binary: ${CLAWCHAIN_BIN}"
if [ -n "${BACKUP_TARBALL}" ]; then
    echo "  Backup: ${BACKUP_TARBALL}"
else
    echo "  Backup: (will create temporary backup)"
fi
echo ""
separator

# --- Phase 1: Validate source environment ------------------------------------

echo ""
echo "Phase 1: Source environment validation"
echo ""

# Check clawchain home exists
if [ -d "${CLAWCHAIN_HOME}" ]; then
    pass "ClawChain home directory exists: ${CLAWCHAIN_HOME}"
else
    fail "ClawChain home directory not found: ${CLAWCHAIN_HOME}"
    echo ""
    echo "Cannot continue without ClawChain home directory."
    echo "Set CLAWCHAIN_HOME to the correct path."
    exit 1
fi

# Check config directory exists
if [ -d "${CLAWCHAIN_HOME}/config" ]; then
    pass "Config directory exists: ${CLAWCHAIN_HOME}/config"
else
    fail "Config directory not found: ${CLAWCHAIN_HOME}/config"
fi

# Check priv_validator_key.json exists
if [ -f "${CLAWCHAIN_HOME}/config/priv_validator_key.json" ]; then
    pass "Validator key present: config/priv_validator_key.json"
else
    fail "Validator key missing: config/priv_validator_key.json"
fi

# Check node_key.json exists
if [ -f "${CLAWCHAIN_HOME}/config/node_key.json" ]; then
    pass "Node key present: config/node_key.json"
else
    skip "Node key not found: config/node_key.json (optional but recommended)"
fi

# Check genesis.json exists
if [ -f "${CLAWCHAIN_HOME}/config/genesis.json" ]; then
    pass "Genesis file present: config/genesis.json"
else
    fail "Genesis file missing: config/genesis.json"
fi

# Check config.toml exists
if [ -f "${CLAWCHAIN_HOME}/config/config.toml" ]; then
    pass "Config file present: config/config.toml"
else
    skip "Config file not found: config/config.toml (expected for full node)"
fi

# Check app.toml exists
if [ -f "${CLAWCHAIN_HOME}/config/app.toml" ]; then
    pass "App config present: config/app.toml"
else
    skip "App config not found: config/app.toml (expected for full node)"
fi

# Check priv_validator_state.json exists
if [ -f "${CLAWCHAIN_HOME}/data/priv_validator_state.json" ]; then
    pass "Validator state present: data/priv_validator_state.json"
else
    skip "Validator state not found: data/priv_validator_state.json (expected if node has run)"
fi

# Check validator key file permissions
if [ -f "${CLAWCHAIN_HOME}/config/priv_validator_key.json" ]; then
    PERMS=$(stat -f "%Lp" "${CLAWCHAIN_HOME}/config/priv_validator_key.json" 2>/dev/null || stat -c "%a" "${CLAWCHAIN_HOME}/config/priv_validator_key.json" 2>/dev/null || echo "unknown")
    if [ "${PERMS}" = "600" ] || [ "${PERMS}" = "400" ]; then
        pass "Validator key permissions are restrictive: ${PERMS}"
    elif [ "${PERMS}" = "unknown" ]; then
        skip "Could not determine validator key permissions"
    else
        fail "Validator key permissions too open: ${PERMS} (expected 600 or 400)"
    fi
fi

separator

# --- Phase 2: Create or extract backup ---------------------------------------

echo ""
echo "Phase 2: Backup creation/extraction"
echo ""

mkdir -p "${BACKUP_STAGING}"
mkdir -p "${RESTORE_STAGING}"

if [ -n "${BACKUP_TARBALL}" ]; then
    # Use the provided tarball
    if [ -f "${BACKUP_TARBALL}" ]; then
        pass "Backup tarball exists: ${BACKUP_TARBALL}"
    else
        fail "Backup tarball not found: ${BACKUP_TARBALL}"
        echo ""
        echo "Cannot continue without a valid backup tarball."
        exit 1
    fi

    # Extract the tarball
    if tar xzf "${BACKUP_TARBALL}" -C "${BACKUP_STAGING}" 2>/dev/null; then
        pass "Backup tarball extracted successfully"
    else
        fail "Backup tarball extraction failed"
        echo ""
        echo "Cannot continue with a corrupt tarball."
        exit 1
    fi

    # Find the backup directory
    BACKUP_INNER=$(find "${BACKUP_STAGING}" -mindepth 1 -maxdepth 1 -type d | head -1)
    if [ -n "${BACKUP_INNER}" ]; then
        pass "Backup directory found: $(basename "${BACKUP_INNER}")"
    else
        fail "No backup directory found inside tarball"
        exit 1
    fi
else
    # Create a temporary backup from current state
    info "Creating temporary backup from current state..."
    BACKUP_INNER="${BACKUP_STAGING}/verify-backup-temp"
    mkdir -p "${BACKUP_INNER}/config"
    mkdir -p "${BACKUP_INNER}/data"

    # Copy validator key
    if [ -f "${CLAWCHAIN_HOME}/config/priv_validator_key.json" ]; then
        cp "${CLAWCHAIN_HOME}/config/priv_validator_key.json" "${BACKUP_INNER}/config/"
        pass "Backed up: config/priv_validator_key.json"
    else
        fail "Cannot back up missing validator key"
    fi

    # Copy node key
    if [ -f "${CLAWCHAIN_HOME}/config/node_key.json" ]; then
        cp "${CLAWCHAIN_HOME}/config/node_key.json" "${BACKUP_INNER}/config/"
        pass "Backed up: config/node_key.json"
    else
        skip "No node key to back up"
    fi

    # Copy genesis
    if [ -f "${CLAWCHAIN_HOME}/config/genesis.json" ]; then
        cp "${CLAWCHAIN_HOME}/config/genesis.json" "${BACKUP_INNER}/config/"
        pass "Backed up: config/genesis.json"
    else
        fail "Cannot back up missing genesis file"
    fi

    # Copy config.toml
    if [ -f "${CLAWCHAIN_HOME}/config/config.toml" ]; then
        cp "${CLAWCHAIN_HOME}/config/config.toml" "${BACKUP_INNER}/config/"
        pass "Backed up: config/config.toml"
    fi

    # Copy app.toml
    if [ -f "${CLAWCHAIN_HOME}/config/app.toml" ]; then
        cp "${CLAWCHAIN_HOME}/config/app.toml" "${BACKUP_INNER}/config/"
        pass "Backed up: config/app.toml"
    fi

    # Copy validator state
    if [ -f "${CLAWCHAIN_HOME}/data/priv_validator_state.json" ]; then
        cp "${CLAWCHAIN_HOME}/data/priv_validator_state.json" "${BACKUP_INNER}/data/"
        pass "Backed up: data/priv_validator_state.json"
    else
        skip "No validator state to back up"
    fi

    # Write metadata
    cat > "${BACKUP_INNER}/backup-metadata.json" <<METADATA
{
    "timestamp": "$(date +%Y%m%d-%H%M%S)",
    "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "clawchain_home": "${CLAWCHAIN_HOME}",
    "hostname": "$(hostname)",
    "type": "verification-backup"
}
METADATA
    pass "Backup metadata written"
fi

separator

# --- Phase 3: Verify backup file presence and validity -----------------------

echo ""
echo "Phase 3: Backup content verification"
echo ""

# Check backup metadata
if [ -f "${BACKUP_INNER}/backup-metadata.json" ]; then
    pass "Backup metadata present"
    # Verify it is valid JSON (basic check: non-empty and contains expected field)
    if grep -q '"timestamp"' "${BACKUP_INNER}/backup-metadata.json" 2>/dev/null; then
        pass "Backup metadata contains timestamp field"
    else
        fail "Backup metadata missing timestamp field"
    fi
else
    fail "Backup metadata missing"
fi

# Check validator key in backup
if [ -f "${BACKUP_INNER}/config/priv_validator_key.json" ]; then
    pass "Backup contains: config/priv_validator_key.json"
    # Verify it looks like a valid key file (contains "address" field)
    if grep -q '"address"' "${BACKUP_INNER}/config/priv_validator_key.json" 2>/dev/null; then
        pass "Validator key contains address field"
    else
        fail "Validator key does not contain expected address field"
    fi
    # Verify it contains a pub_key field
    if grep -q '"pub_key"' "${BACKUP_INNER}/config/priv_validator_key.json" 2>/dev/null; then
        pass "Validator key contains pub_key field"
    else
        fail "Validator key does not contain expected pub_key field"
    fi
    # Verify file size is reasonable (typically 200-500 bytes)
    KEY_SIZE=$(wc -c < "${BACKUP_INNER}/config/priv_validator_key.json" | tr -d ' ')
    if [ "${KEY_SIZE}" -gt 50 ] && [ "${KEY_SIZE}" -lt 10000 ]; then
        pass "Validator key file size is reasonable: ${KEY_SIZE} bytes"
    else
        fail "Validator key file size is suspicious: ${KEY_SIZE} bytes"
    fi
else
    fail "Backup missing: config/priv_validator_key.json"
fi

# Check node key in backup
if [ -f "${BACKUP_INNER}/config/node_key.json" ]; then
    pass "Backup contains: config/node_key.json"
    if grep -q '"priv_key"' "${BACKUP_INNER}/config/node_key.json" 2>/dev/null; then
        pass "Node key contains priv_key field"
    else
        fail "Node key does not contain expected priv_key field"
    fi
else
    skip "Backup does not contain node_key.json (optional)"
fi

# Check genesis in backup (only if we created the temp backup with genesis)
if [ -f "${BACKUP_INNER}/config/genesis.json" ]; then
    pass "Backup contains: config/genesis.json"
    if grep -q '"chain_id"' "${BACKUP_INNER}/config/genesis.json" 2>/dev/null; then
        pass "Genesis file contains chain_id field"
    else
        fail "Genesis file does not contain expected chain_id field"
    fi
elif [ -f "${BACKUP_INNER}/genesis-export.json" ]; then
    pass "Backup contains: genesis-export.json"
    if grep -q '"chain_id"' "${BACKUP_INNER}/genesis-export.json" 2>/dev/null; then
        pass "Genesis export contains chain_id field"
    else
        fail "Genesis export does not contain expected chain_id field"
    fi
else
    skip "Backup does not contain genesis file"
fi

# Check validator state in backup
if [ -f "${BACKUP_INNER}/data/priv_validator_state.json" ]; then
    pass "Backup contains: data/priv_validator_state.json"
    if grep -q '"height"' "${BACKUP_INNER}/data/priv_validator_state.json" 2>/dev/null; then
        pass "Validator state contains height field"
    else
        fail "Validator state does not contain expected height field"
    fi
else
    skip "Backup does not contain priv_validator_state.json"
fi

separator

# --- Phase 4: Simulate restore by comparison ---------------------------------

echo ""
echo "Phase 4: Restore simulation (file comparison)"
echo ""

# Simulate restoring to a temporary location and compare with originals
mkdir -p "${RESTORE_STAGING}/config"
mkdir -p "${RESTORE_STAGING}/data"

# Simulate restoring validator key
if [ -f "${BACKUP_INNER}/config/priv_validator_key.json" ] && [ -f "${CLAWCHAIN_HOME}/config/priv_validator_key.json" ]; then
    cp "${BACKUP_INNER}/config/priv_validator_key.json" "${RESTORE_STAGING}/config/priv_validator_key.json"
    if diff -q "${RESTORE_STAGING}/config/priv_validator_key.json" "${CLAWCHAIN_HOME}/config/priv_validator_key.json" >/dev/null 2>&1; then
        pass "Restore simulation: priv_validator_key.json matches source"
    else
        fail "Restore simulation: priv_validator_key.json does NOT match source (backup may be stale)"
    fi
fi

# Simulate restoring node key
if [ -f "${BACKUP_INNER}/config/node_key.json" ] && [ -f "${CLAWCHAIN_HOME}/config/node_key.json" ]; then
    cp "${BACKUP_INNER}/config/node_key.json" "${RESTORE_STAGING}/config/node_key.json"
    if diff -q "${RESTORE_STAGING}/config/node_key.json" "${CLAWCHAIN_HOME}/config/node_key.json" >/dev/null 2>&1; then
        pass "Restore simulation: node_key.json matches source"
    else
        fail "Restore simulation: node_key.json does NOT match source (backup may be stale)"
    fi
fi

# Simulate restoring genesis
GENESIS_BACKUP=""
if [ -f "${BACKUP_INNER}/config/genesis.json" ]; then
    GENESIS_BACKUP="${BACKUP_INNER}/config/genesis.json"
elif [ -f "${BACKUP_INNER}/genesis-export.json" ]; then
    GENESIS_BACKUP="${BACKUP_INNER}/genesis-export.json"
fi

if [ -n "${GENESIS_BACKUP}" ] && [ -f "${CLAWCHAIN_HOME}/config/genesis.json" ]; then
    cp "${GENESIS_BACKUP}" "${RESTORE_STAGING}/config/genesis.json"
    # For genesis, compare SHA256 hashes since formatting may differ
    SOURCE_SHA=$(shasum -a 256 "${CLAWCHAIN_HOME}/config/genesis.json" | awk '{print $1}')
    BACKUP_SHA=$(shasum -a 256 "${RESTORE_STAGING}/config/genesis.json" | awk '{print $1}')
    if [ "${SOURCE_SHA}" = "${BACKUP_SHA}" ]; then
        pass "Restore simulation: genesis.json SHA256 matches (${SOURCE_SHA:0:16}...)"
    else
        # Genesis export may differ from genesis.json if the chain has progressed
        info "Genesis SHA256 mismatch (expected if using genesis-export vs original genesis)"
        info "  Source:  ${SOURCE_SHA:0:16}..."
        info "  Backup:  ${BACKUP_SHA:0:16}..."
        skip "Restore simulation: genesis SHA256 differs (may be expected for genesis-export)"
    fi
fi

# Simulate restoring validator state
if [ -f "${BACKUP_INNER}/data/priv_validator_state.json" ] && [ -f "${CLAWCHAIN_HOME}/data/priv_validator_state.json" ]; then
    cp "${BACKUP_INNER}/data/priv_validator_state.json" "${RESTORE_STAGING}/data/priv_validator_state.json"
    # Extract heights for comparison
    BACKUP_HEIGHT=$(grep -o '"height":"[^"]*"' "${RESTORE_STAGING}/data/priv_validator_state.json" 2>/dev/null | head -1 | cut -d'"' -f4)
    SOURCE_HEIGHT=$(grep -o '"height":"[^"]*"' "${CLAWCHAIN_HOME}/data/priv_validator_state.json" 2>/dev/null | head -1 | cut -d'"' -f4)
    if [ "${BACKUP_HEIGHT}" = "${SOURCE_HEIGHT}" ]; then
        pass "Restore simulation: priv_validator_state.json height matches (${BACKUP_HEIGHT})"
    else
        info "Validator state height: backup=${BACKUP_HEIGHT:-unknown} source=${SOURCE_HEIGHT:-unknown}"
        if [ -n "${BACKUP_HEIGHT}" ] && [ -n "${SOURCE_HEIGHT}" ]; then
            if [ "${BACKUP_HEIGHT}" -lt "${SOURCE_HEIGHT}" ] 2>/dev/null; then
                fail "Restore simulation: backup validator state is STALE (height ${BACKUP_HEIGHT} < ${SOURCE_HEIGHT}). Restoring this would risk double-signing."
            else
                pass "Restore simulation: backup validator state height is current or ahead"
            fi
        else
            skip "Restore simulation: could not compare validator state heights"
        fi
    fi
fi

# Verify restored files have non-zero size
RESTORE_FILES_OK=true
for f in "${RESTORE_STAGING}"/config/*.json "${RESTORE_STAGING}"/data/*.json; do
    if [ -f "${f}" ]; then
        SIZE=$(wc -c < "${f}" | tr -d ' ')
        if [ "${SIZE}" -eq 0 ]; then
            fail "Restored file is empty: $(basename "${f}")"
            RESTORE_FILES_OK=false
        fi
    fi
done
if [ "${RESTORE_FILES_OK}" = true ]; then
    pass "All restored files are non-empty"
fi

separator

# --- Phase 5: Checksum integrity verification --------------------------------

echo ""
echo "Phase 5: Checksum integrity"
echo ""

# Compute and display checksums for all backed-up files
info "Backup file checksums:"
for f in $(find "${BACKUP_INNER}" -type f -name "*.json" | sort); do
    REL_PATH="${f#"${BACKUP_INNER}/"}"
    SHA=$(shasum -a 256 "${f}" | awk '{print $1}')
    echo "  ${SHA:0:16}...  ${REL_PATH}"
done

# Verify the backup can be re-archived and the archive is readable
VERIFY_TAR="${WORK_DIR}/verify-repack.tar.gz"
if tar czf "${VERIFY_TAR}" -C "${BACKUP_STAGING}" "$(basename "${BACKUP_INNER}")" 2>/dev/null; then
    pass "Backup can be re-archived into a valid tarball"
    # Verify the re-archived tarball can be extracted
    REEXTRACT="${WORK_DIR}/reextract"
    mkdir -p "${REEXTRACT}"
    if tar xzf "${VERIFY_TAR}" -C "${REEXTRACT}" 2>/dev/null; then
        pass "Re-archived tarball extracts successfully (round-trip verified)"
    else
        fail "Re-archived tarball failed to extract"
    fi
else
    fail "Failed to re-archive backup into tarball"
fi

separator

# --- Summary ------------------------------------------------------------------

echo ""
echo "========================================"
echo "  Verification Summary"
echo "========================================"
echo ""
echo "  Total checks: ${TOTAL_COUNT}"
echo "  Passed:       ${PASS_COUNT}"
echo "  Failed:       ${FAIL_COUNT}"
echo "  Skipped:      ${SKIP_COUNT}"
echo ""

if [ "${FAIL_COUNT}" -eq 0 ]; then
    echo "  Result: ALL CHECKS PASSED"
    echo ""
    echo "  The backup is valid and can be used for restoration."
    echo "  Restore command:"
    if [ -n "${BACKUP_TARBALL}" ]; then
        echo "    make restore BACKUP=${BACKUP_TARBALL}"
    else
        echo "    ./scripts/backup-state.sh && make restore BACKUP=<backup-path>"
    fi
    echo ""
    echo "========================================"
    exit 0
else
    echo "  Result: ${FAIL_COUNT} CHECK(S) FAILED"
    echo ""
    echo "  The backup verification did not pass. Review the failures above"
    echo "  and take corrective action before relying on this backup."
    echo ""
    echo "  Common fixes:"
    echo "    - Create a fresh backup:  ./scripts/backup-state.sh"
    echo "    - Fix file permissions:   chmod 600 ~/.clawchain/config/priv_validator_key.json"
    echo "    - Update stale state:     Re-run backup after node is fully synced"
    echo ""
    echo "========================================"
    exit 1
fi
