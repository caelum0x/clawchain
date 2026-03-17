#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOCK_FILE="contracts/protocol-surface.lock"

if [ ! -f "$LOCK_FILE" ]; then
  echo "ERROR: protocol surface lock file is missing: $LOCK_FILE"
  echo "Create/update it with: make protocol-surface-lock-refresh"
  exit 1
fi

hash_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1 "  " $2}'
  else
    shasum -a 256 "$file" | awk '{print $1 "  " $2}'
  fi
}

SURFACE_FILES=()
while IFS= read -r file; do
  SURFACE_FILES+=("$file")
done < <(
  find proto/clawchain/agent proto/clawchain/messaging proto/clawchain/privacy proto/clawchain/marketplace proto/clawchain/reputation -type f -name '*.proto' | sort
)
SURFACE_FILES+=(
  "sdk/src/constants.ts"
  "sdk/src/types.ts"
  "sdk/src/client.ts"
  "sdk/src/generated/proto-contracts.ts"
)

tmp_actual="$(mktemp)"
tmp_missing="$(mktemp)"
tmp_extra="$(mktemp)"
trap 'rm -f "$tmp_actual" "$tmp_missing" "$tmp_extra"' EXIT

for file in "${SURFACE_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "ERROR: surface file listed for lock check does not exist: $file"
    exit 1
  fi
  hash_file "$file" >>"$tmp_actual"
done

sort -k2,2 "$tmp_actual" -o "$tmp_actual"

# Verify missing/extra entries first for clear diagnostics.
cut -d' ' -f3- "$LOCK_FILE" | sort >"$tmp_missing"
printf "%s\n" "${SURFACE_FILES[@]}" | sort >"$tmp_extra"

if ! diff -u "$tmp_missing" "$tmp_extra" >/dev/null; then
  echo "ERROR: protocol surface file set drift detected."
  diff -u "$tmp_missing" "$tmp_extra" || true
  echo "Refresh lock with: make protocol-surface-lock-refresh"
  exit 1
fi

tmp_lock_sorted="$(mktemp)"
trap 'rm -f "$tmp_actual" "$tmp_missing" "$tmp_extra" "$tmp_lock_sorted"' EXIT
sort -k2,2 "$LOCK_FILE" >"$tmp_lock_sorted"

if ! diff -u "$tmp_lock_sorted" "$tmp_actual" >/dev/null; then
  echo "ERROR: protocol surface lock mismatch."
  diff -u "$tmp_lock_sorted" "$tmp_actual" || true
  echo "Refresh lock with: make protocol-surface-lock-refresh"
  exit 1
fi

echo "Protocol surface lock check passed."
