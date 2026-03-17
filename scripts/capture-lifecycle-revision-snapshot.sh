#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LIFECYCLE_FILE="${1:-testnet/public/manifest-lifecycle.json}"
OUT_DIR="${OUT_DIR:-artifacts/launch-control}"

if [[ ! -f "$LIFECYCLE_FILE" ]]; then
  echo "ERROR: missing lifecycle file '$LIFECYCLE_FILE'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="$OUT_DIR/lifecycle-revision-snapshot-$ts.json"
latest_file="$OUT_DIR/lifecycle-revision-snapshot.json"

jq -n \
  --arg capturedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg source "$LIFECYCLE_FILE" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --argjson lifecycle "$(cat "$LIFECYCLE_FILE")" \
  '
  {
    capturedAtUtc: $capturedAtUtc,
    source: $source,
    gitCommit: $gitCommit,
    id: ($lifecycle.id // ""),
    network: ($lifecycle.network // ""),
    revision: ($lifecycle.revision // 0),
    signedUpdate: ($lifecycle.signedUpdate // false),
    signatureCount: ($lifecycle.signatureCount // 0),
    manifestSha256: ($lifecycle.manifestSha256 // ""),
    updatedAtUtc: ($lifecycle.updatedAtUtc // "")
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"
echo "lifecycle revision snapshot captured."
echo "  snapshot: $out_file"
echo "  latest:   $latest_file"
