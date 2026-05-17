#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd -- "$OPENCLAW_ROOT/.." && pwd)"

COSMOS_SDK_DIR="${COSMOS_SDK_DIR:-$REPO_ROOT/cosmos-sdk}"
EXPORT_SCRIPT="$COSMOS_SDK_DIR/scripts/clawchain-export-protos.sh"
TARGET_DIR="$REPO_ROOT/third_party/proto/cosmos-sdk"
DEPS_ROOT="$REPO_ROOT/third_party/proto"

if [[ ! -x "$EXPORT_SCRIPT" ]]; then
  echo "missing export script: $EXPORT_SCRIPT" >&2
  echo "expected local cosmos-sdk checkout at: $COSMOS_SDK_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
"$EXPORT_SCRIPT" "$TARGET_DIR"

GOMODCACHE="$(go env GOMODCACHE)"

copy_tree() {
  local src="$1"
  local dst="$2"
  if [[ -d "$src" ]]; then
    mkdir -p "$dst"
    chmod -R u+w "$dst" 2>/dev/null || true
    rsync -a --delete --delete-excluded --chmod=Du+rwx,Dgo+rx,Fu+rw,Fgo+r \
      --include='*/' --include='*.proto' --exclude='*' \
      "$src/" "$dst/"
    return 0
  fi
  return 1
}

find_first_dir() {
  local pattern="$1"
  find "$GOMODCACHE" -type d -path "$pattern" -print -quit 2>/dev/null
}

copy_required_dep() {
  local name="$1"
  local pattern="$2"
  local subpath="$3"
  local dest="$DEPS_ROOT/$name"
  local src
  src="$(find_first_dir "$pattern")"
  if [[ -z "$src" ]]; then
    echo "missing proto dep source for $name ($pattern)" >&2
    return 1
  fi
  copy_tree "$src/$subpath" "$dest/$subpath"
}

copy_required_dep "cosmos-proto" "*/github.com/cosmos/cosmos-proto@*/proto" "cosmos_proto"
copy_required_dep "gogoproto" "*/github.com/cosmos/gogoproto@*" "gogoproto"
copy_required_dep "googleapis" "*/github.com/grpc-ecosystem/grpc-gateway@*/third_party/googleapis" "google"
copy_required_dep "grpc-gateway" "*/github.com/grpc-ecosystem/grpc-gateway/v2@*" "protoc-gen-openapiv2"

echo "Synced local cosmos-sdk protos into: $TARGET_DIR"
