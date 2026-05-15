#!/usr/bin/env bash
#
# restore.sh — Restore testnet data from a backup archive.
#
# Usage:
#   ./restore.sh <backup-file.tar.gz>
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  echo ""
  echo "Available backups:"
  ls -lh "${SCRIPT_DIR}/backups/"*.tar.gz 2>/dev/null || echo "  (none)"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "Verifying archive integrity..."
if ! tar -tzf "${BACKUP_FILE}" > /dev/null 2>&1; then
  echo "ERROR: Backup archive is corrupted: ${BACKUP_FILE}"
  exit 1
fi

echo "Stopping testnet..."
(cd "${SCRIPT_DIR}" && docker compose down 2>/dev/null || true)

echo "Cleaning existing data..."
rm -rf "${DATA_DIR}"

echo "Restoring from: ${BACKUP_FILE}"
tar -xzf "${BACKUP_FILE}" -C "${SCRIPT_DIR}"

echo "Restore complete. Data directory contents:"
ls -la "${DATA_DIR}/"

echo ""
echo "Start the testnet with: cd testnet && docker compose up -d"
