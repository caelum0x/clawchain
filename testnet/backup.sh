#!/usr/bin/env bash
#
# backup.sh — Create a timestamped backup of testnet data.
#
# Usage:
#   ./backup.sh [--live]
#
# Options:
#   --live   Skip stopping the testnet before backup (hot backup).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
BACKUP_DIR="${SCRIPT_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/testnet-backup-${TIMESTAMP}.tar.gz"

LIVE=false
for arg in "$@"; do
  case "$arg" in
    --live) LIVE=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

if [ ! -d "${DATA_DIR}" ]; then
  echo "ERROR: Data directory not found at ${DATA_DIR}"
  echo "       Is the testnet initialized?"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

if [ "${LIVE}" = false ]; then
  echo "Stopping testnet for consistent backup..."
  (cd "${SCRIPT_DIR}" && docker compose down 2>/dev/null || true)
  echo "Testnet stopped."
else
  echo "Live backup mode — testnet will remain running."
fi

echo "Creating backup: ${BACKUP_FILE}"
tar -czf "${BACKUP_FILE}" -C "${SCRIPT_DIR}" data

echo "Verifying archive integrity..."
if tar -tzf "${BACKUP_FILE}" > /dev/null 2>&1; then
  SIZE=$(ls -lh "${BACKUP_FILE}" | awk '{print $5}')
  echo "Backup created successfully: ${BACKUP_FILE} (${SIZE})"
else
  echo "ERROR: Backup archive verification failed!"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

if [ "${LIVE}" = false ]; then
  echo "Restarting testnet..."
  (cd "${SCRIPT_DIR}" && docker compose up -d)
  echo "Testnet restarted."
fi
