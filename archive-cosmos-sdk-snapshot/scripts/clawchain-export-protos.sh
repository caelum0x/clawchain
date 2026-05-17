#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  echo "usage: $0 <output-dir>" >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$1"

mkdir -p "$OUT_DIR"

copy_tree() {
  local src="$1"
  local dst="$2"
  if [[ -d "$src" ]]; then
    mkdir -p "$dst"
    rsync -a --delete "$src/" "$dst/"
  fi
}

copy_tree "$SDK_ROOT/proto/cosmos" "$OUT_DIR/cosmos"
copy_tree "$SDK_ROOT/proto/tendermint" "$OUT_DIR/tendermint"
copy_tree "$SDK_ROOT/proto/amino" "$OUT_DIR/amino"

GIT_COMMIT="$(git -C "$SDK_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")"
GIT_BRANCH="$(git -C "$SDK_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
EXPORT_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "$OUT_DIR/CLAWCHAIN_COSMOS_SDK_EXPORT.json" <<EOF
{
  "source": "local-cosmos-sdk",
  "sdkRoot": "$SDK_ROOT",
  "gitCommit": "$GIT_COMMIT",
  "gitBranch": "$GIT_BRANCH",
  "exportedAtUtc": "$EXPORT_TIME",
  "paths": ["cosmos", "tendermint", "amino"]
}
EOF

echo "Exported Cosmos SDK proto trees to: $OUT_DIR"
