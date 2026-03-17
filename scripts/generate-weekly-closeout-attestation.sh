#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
DIGEST_PACK="${DIGEST_PACK:-artifacts/launch-control/weekly-closure-digest-pack-latest.json}"
STATUS_JSON="${STATUS_JSON:-artifacts/launch-control/operator-status-snapshot-latest.json}"
CLOSURE_BUNDLE="${CLOSURE_BUNDLE:-artifacts/launch-control/weekly-closure-bundle-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$DIGEST_PACK" "$STATUS_JSON" "$CLOSURE_BUNDLE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing attestation input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$STATUS_JSON")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: status snapshot missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
json_file="${OUT_DIR}/weekly-closeout-attestation-${week_id}.json"
latest_file="${OUT_DIR}/weekly-closeout-attestation-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg digestPack "$DIGEST_PACK" \
  --arg statusSnapshot "$STATUS_JSON" \
  --arg closureBundle "$CLOSURE_BUNDLE" \
  --argjson digestPackJson "$(cat "$DIGEST_PACK")" \
  --argjson statusSnapshotJson "$(cat "$STATUS_JSON")" \
  --argjson closureBundleJson "$(cat "$CLOSURE_BUNDLE")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    references: {
      digestPack: $digestPack,
      statusSnapshot: $statusSnapshot,
      closureBundle: $closureBundle
    },
    artifacts: {
      digestPack: $digestPackJson,
      statusSnapshot: $statusSnapshotJson,
      closureBundle: $closureBundleJson
    }
  }
  ' >"$json_file"

cp "$json_file" "$latest_file"

echo "weekly closeout attestation written."
echo "  attestation: $json_file"
echo "  latest:      $latest_file"
