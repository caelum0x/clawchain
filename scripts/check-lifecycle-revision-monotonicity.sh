#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CURRENT_FILE="${1:-testnet/public/manifest-lifecycle.json}"
SNAPSHOT_FILE="${2:-artifacts/launch-control/lifecycle-revision-snapshot.json}"

for file in "$CURRENT_FILE" "$SNAPSHOT_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing lifecycle comparison file '$file'." >&2
    exit 1
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

current_revision="$(jq -r '.revision // 0' "$CURRENT_FILE")"
snapshot_revision="$(jq -r '.revision // 0' "$SNAPSHOT_FILE")"

if [[ ! "$current_revision" =~ ^[0-9]+$ || ! "$snapshot_revision" =~ ^[0-9]+$ ]]; then
  echo "ERROR: invalid revision values in lifecycle files." >&2
  exit 1
fi

if [[ "$current_revision" -lt "$snapshot_revision" ]]; then
  echo "ERROR: lifecycle revision regression detected." >&2
  echo "  snapshot revision: $snapshot_revision" >&2
  echo "  current revision:  $current_revision" >&2
  exit 1
fi

echo "lifecycle revision monotonicity check passed."
echo "  snapshot revision: $snapshot_revision"
echo "  current revision:  $current_revision"
