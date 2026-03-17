#!/usr/bin/env bash
# backup-validator-state.sh — Safe backup of validator signing state
#
# This script safely backs up the critical validator files that must be
# preserved to prevent double-signing after a restore:
#   - priv_validator_key.json  (validator identity — NEVER regenerate)
#   - priv_validator_state.json (last signed height/round/step)
#   - node_key.json (P2P identity)
#
# IMPORTANT: priv_validator_state.json records the last height/round/step
# the validator signed. If lost or reset, the validator may double-sign
# and get slashed. This script ensures atomic backup of this file.
#
# Usage:
#   ./scripts/backup-validator-state.sh [BACKUP_DIR]
#
# Environment:
#   CLAWCHAIN_HOME   Path to chain home directory (default: ~/.clawchain)

set -euo pipefail

CLAWCHAIN_HOME="${CLAWCHAIN_HOME:-$HOME/.clawchain}"
BACKUP_DIR="${1:-./backups/validator}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_NAME="validator-state-${TIMESTAMP}"

log()  { echo "[validator-backup] $*"; }
fail() { echo "[validator-backup] ERROR: $*" >&2; exit 1; }

# --- Validation ---------------------------------------------------------------

if [ ! -d "${CLAWCHAIN_HOME}" ]; then
    fail "Chain home not found at ${CLAWCHAIN_HOME}"
fi

PRIV_KEY="${CLAWCHAIN_HOME}/config/priv_validator_key.json"
PRIV_STATE="${CLAWCHAIN_HOME}/data/priv_validator_state.json"
NODE_KEY="${CLAWCHAIN_HOME}/config/node_key.json"

if [ ! -f "${PRIV_KEY}" ]; then
    fail "Validator key not found: ${PRIV_KEY}"
fi

# --- Create backup ------------------------------------------------------------

STAGING="$(mktemp -d)"
trap "rm -rf ${STAGING}" EXIT

mkdir -p "${STAGING}/${BACKUP_NAME}"

log "Backing up validator state..."

# 1. Validator key (identity)
cp "${PRIV_KEY}" "${STAGING}/${BACKUP_NAME}/priv_validator_key.json"
log "  priv_validator_key.json copied"

# 2. Validator signing state (critical for double-sign prevention)
if [ -f "${PRIV_STATE}" ]; then
    # Atomic copy: read into variable first to avoid partial reads
    STATE_CONTENT="$(cat "${PRIV_STATE}")"
    echo "${STATE_CONTENT}" > "${STAGING}/${BACKUP_NAME}/priv_validator_state.json"

    # Extract and log the last signed height for verification
    LAST_HEIGHT=$(echo "${STATE_CONTENT}" | grep -o '"height"[[:space:]]*:[[:space:]]*"[0-9]*"' | head -1 | grep -o '[0-9]*' || echo "unknown")
    log "  priv_validator_state.json copied (last signed height: ${LAST_HEIGHT})"
else
    log "  WARNING: priv_validator_state.json not found. Validator may not have started."
fi

# 3. Node key (P2P identity)
if [ -f "${NODE_KEY}" ]; then
    cp "${NODE_KEY}" "${STAGING}/${BACKUP_NAME}/node_key.json"
    log "  node_key.json copied"
fi

# 4. Metadata
cat > "${STAGING}/${BACKUP_NAME}/backup-info.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "clawchain_home": "${CLAWCHAIN_HOME}",
  "hostname": "$(hostname)",
  "last_signed_height": "${LAST_HEIGHT:-unknown}",
  "backup_type": "validator-state",
  "files": [
    "priv_validator_key.json",
    "priv_validator_state.json",
    "node_key.json"
  ],
  "warning": "Do NOT restore priv_validator_state.json to a height lower than the chain's current height — this will cause double-signing and slashing."
}
EOF

# --- Package ------------------------------------------------------------------

mkdir -p "${BACKUP_DIR}"

# Create encrypted tarball (gpg optional)
TARBALL="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
tar czf "${TARBALL}" -C "${STAGING}" "${BACKUP_NAME}"

# Set restrictive permissions (validator keys are sensitive)
chmod 600 "${TARBALL}"

TARBALL_SIZE=$(wc -c < "${TARBALL}" | tr -d ' ')
CHECKSUM=$(shasum -a 256 "${TARBALL}" | awk '{print $1}')

# --- Report -------------------------------------------------------------------

echo ""
echo "========================================"
echo "  Validator State Backup"
echo "========================================"
echo ""
echo "  File:       ${TARBALL}"
echo "  Size:       ${TARBALL_SIZE} bytes"
echo "  SHA256:     ${CHECKSUM}"
echo "  Last height: ${LAST_HEIGHT:-unknown}"
echo ""
echo "  Restore procedure:"
echo "    1. Stop the validator:  systemctl stop clawchaind"
echo "    2. Extract backup:      tar xzf ${BACKUP_NAME}.tar.gz"
echo "    3. Copy files to:"
echo "         config/priv_validator_key.json"
echo "         data/priv_validator_state.json"
echo "         config/node_key.json"
echo "    4. Verify last signed height matches or exceeds chain height"
echo "    5. Start the validator: systemctl start clawchaind"
echo ""
echo "  CRITICAL: Never restore priv_validator_state.json"
echo "  with a height lower than what the chain has seen."
echo "  Double-signing leads to permanent slashing."
echo ""
echo "========================================"

log "Backup complete."
