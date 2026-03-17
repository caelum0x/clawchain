#!/usr/bin/env bash
set -euo pipefail

SRC_ROOT="clawchain/x"
DST_ROOT="x"

if [ ! -d "$SRC_ROOT" ]; then
  exit 0
fi

while IFS= read -r -d '' src_file; do
  rel_path="${src_file#${SRC_ROOT}/}"
  dst_file="${DST_ROOT}/${rel_path}"
  dst_dir="$(dirname "$dst_file")"
  mkdir -p "$dst_dir"
  cp "$src_file" "$dst_file"
done < <(find "$SRC_ROOT" -type f \( -name '*.pb.go' -o -name '*.pb.gw.go' \) -print0)

exit 0
