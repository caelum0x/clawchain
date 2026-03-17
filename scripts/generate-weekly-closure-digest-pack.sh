#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
PUBLICATION_PACKET="${PUBLICATION_PACKET:-artifacts/launch-control/weekly-publication-packet-latest.json}"
HANDOFF_NOTE="${HANDOFF_NOTE:-artifacts/launch-control/weekly-handoff-note-latest.md}"
CLOSURE_BUNDLE="${CLOSURE_BUNDLE:-artifacts/launch-control/weekly-closure-bundle-latest.json}"
ARTIFACT_INDEX="${ARTIFACT_INDEX:-artifacts/launch-control/ops-artifact-index-latest.json}"
OPS_MATURITY_PACKET="${OPS_MATURITY_PACKET:-artifacts/launch-control/ops-maturity-packet-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

sha256_of() {
  local file="$1"
  local hash=""
  hash="$(shasum -a 256 "$file" 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "$hash" ]]; then
    hash="$(sha256sum "$file" 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo "$hash"
}

files=(
  "$PUBLICATION_PACKET"
  "$HANDOFF_NOTE"
  "$CLOSURE_BUNDLE"
  "$ARTIFACT_INDEX"
  "$OPS_MATURITY_PACKET"
)

for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing digest input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$PUBLICATION_PACKET")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: weekly publication packet missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
pack_file="${OUT_DIR}/weekly-closure-digest-pack-${week_id}.json"
latest_file="${OUT_DIR}/weekly-closure-digest-pack-latest.json"

tmp_entries="$(mktemp)"
trap 'rm -f "$tmp_entries"' EXIT

for file in "${files[@]}"; do
  hash="$(sha256_of "$file")"
  if [[ -z "$hash" ]]; then
    echo "ERROR: failed to hash '$file'." >&2
    exit 1
  fi
  size_bytes="$(wc -c <"$file" | tr -d ' ')"
  jq -n \
    --arg path "$file" \
    --arg sha256 "$hash" \
    --argjson sizeBytes "${size_bytes:-0}" \
    '
    {
      path: $path,
      sha256: $sha256,
      sizeBytes: $sizeBytes
    }
    ' >>"$tmp_entries"
done

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --argjson entries "$(jq -s '.' "$tmp_entries")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    entries: $entries
  }
  ' >"$pack_file"

cp "$pack_file" "$latest_file"

echo "weekly closure digest pack written."
echo "  pack:   $pack_file"
echo "  latest: $latest_file"
