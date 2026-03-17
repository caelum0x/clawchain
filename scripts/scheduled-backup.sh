#!/usr/bin/env bash
# scheduled-backup.sh -- Cron-compatible periodic backup for ClawChain validators
#
# Wraps backup-state.sh with retention management and optional remote upload.
# Designed to run from cron or systemd timers.
#
# Usage:
#   ./scripts/scheduled-backup.sh
#
# Cron example (daily at 3 AM):
#   0 3 * * * /opt/clawchain/scripts/scheduled-backup.sh >> /var/log/clawchain-backup.log 2>&1
#
# Environment variables:
#   CLAWCHAIN_HOME     Path to clawchain home directory (default: ~/.clawchain)
#   CLAWCHAIN_BIN      Path to clawchaind binary (default: clawchaind)
#   BACKUP_DIR         Backup output directory (default: /var/backups/clawchain)
#   RETENTION_DAYS     Number of days to keep local backups (default: 14)
#   S3_BUCKET          S3 bucket for remote backup upload (optional, e.g., s3://clawchain-backups)
#   NOTIFY_WEBHOOK     Slack/Discord webhook URL for notifications (optional)

set -euo pipefail

# --- Configuration -----------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/clawchain}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
S3_BUCKET="${S3_BUCKET:-}"
NOTIFY_WEBHOOK="${NOTIFY_WEBHOOK:-}"
LOCK_FILE="/tmp/clawchain-backup.lock"

# --- Helpers ------------------------------------------------------------------

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [scheduled-backup] $*"; }
fail() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [scheduled-backup] ERROR: $*" >&2; exit 1; }

notify() {
    local message="$1"
    local color="${2:-good}"
    if [ -n "${NOTIFY_WEBHOOK}" ]; then
        curl -s -X POST "${NOTIFY_WEBHOOK}" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"${message}\",\"attachments\":[{\"color\":\"${color}\"}]}" \
            >/dev/null 2>&1 || true
    fi
}

# --- Lock to prevent concurrent runs ----------------------------------------

if [ -f "${LOCK_FILE}" ]; then
    LOCK_PID=$(cat "${LOCK_FILE}" 2>/dev/null || echo "")
    if [ -n "${LOCK_PID}" ] && kill -0 "${LOCK_PID}" 2>/dev/null; then
        fail "Another backup is already running (PID ${LOCK_PID}). Remove ${LOCK_FILE} if stale."
    fi
    log "Removing stale lock file."
    rm -f "${LOCK_FILE}"
fi

echo $$ > "${LOCK_FILE}"
trap 'rm -f "${LOCK_FILE}"' EXIT

# --- Run backup --------------------------------------------------------------

log "Starting scheduled backup..."
START_TIME=$(date +%s)

mkdir -p "${BACKUP_DIR}"

# Run the main backup script.
if ! BACKUP_DIR="${BACKUP_DIR}" "${SCRIPT_DIR}/backup-state.sh" "${BACKUP_DIR}"; then
    log "Backup FAILED"
    notify "[ClawChain Backup] FAILED on $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ)" "danger"
    exit 1
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Find the latest backup file.
LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/clawchain-backup-*.tar.gz 2>/dev/null | head -1)
if [ -z "${LATEST_BACKUP}" ]; then
    fail "No backup file found after running backup-state.sh"
fi

BACKUP_SIZE=$(wc -c < "${LATEST_BACKUP}" | tr -d ' ')
BACKUP_SIZE_MB=$((BACKUP_SIZE / 1024 / 1024))

log "Backup completed in ${DURATION}s: $(basename "${LATEST_BACKUP}") (${BACKUP_SIZE_MB}MB)"

# --- Upload to S3 (optional) ------------------------------------------------

if [ -n "${S3_BUCKET}" ]; then
    if command -v aws &>/dev/null; then
        log "Uploading to ${S3_BUCKET}..."
        if aws s3 cp "${LATEST_BACKUP}" "${S3_BUCKET}/$(basename "${LATEST_BACKUP}")" --quiet; then
            log "S3 upload complete."
        else
            log "WARNING: S3 upload failed."
            notify "[ClawChain Backup] S3 upload failed on $(hostname)" "warning"
        fi
    else
        log "WARNING: aws CLI not found, skipping S3 upload."
    fi
fi

# --- Retention cleanup -------------------------------------------------------

log "Cleaning up backups older than ${RETENTION_DAYS} days..."
DELETED_COUNT=0

find "${BACKUP_DIR}" -name "clawchain-backup-*.tar.gz" -type f -mtime "+${RETENTION_DAYS}" | while read -r old_backup; do
    log "Removing old backup: $(basename "${old_backup}")"
    rm -f "${old_backup}"
    DELETED_COUNT=$((DELETED_COUNT + 1))
done

REMAINING_COUNT=$(find "${BACKUP_DIR}" -name "clawchain-backup-*.tar.gz" -type f | wc -l | tr -d ' ')
log "Retention cleanup done. ${REMAINING_COUNT} backups retained."

# --- Notify ------------------------------------------------------------------

notify "[ClawChain Backup] Success on $(hostname): $(basename "${LATEST_BACKUP}") (${BACKUP_SIZE_MB}MB, ${DURATION}s)" "good"

log "Scheduled backup complete."
