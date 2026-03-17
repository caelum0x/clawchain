#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
PUBLICATION_PACKET="${PUBLICATION_PACKET:-artifacts/launch-control/weekly-publication-packet-latest.json}"
HANDOFF_NOTE="${HANDOFF_NOTE:-artifacts/launch-control/weekly-handoff-note-latest.md}"
OPS_MATURITY_PACKET="${OPS_MATURITY_PACKET:-artifacts/launch-control/ops-maturity-packet-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$PUBLICATION_PACKET" "$HANDOFF_NOTE" "$OPS_MATURITY_PACKET"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing weekly closure bundle input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$PUBLICATION_PACKET")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: publication packet missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
bundle_file="${OUT_DIR}/weekly-closure-bundle-${week_id}.json"
latest_file="${OUT_DIR}/weekly-closure-bundle-latest.json"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg publicationPacket "$PUBLICATION_PACKET" \
  --arg handoffNote "$HANDOFF_NOTE" \
  --arg opsMaturityPacket "$OPS_MATURITY_PACKET" \
  --arg runbook "docs/final-cutover-runbook.md" \
  --argjson publication "$(cat "$PUBLICATION_PACKET")" \
  --arg handoffText "$(cat "$HANDOFF_NOTE")" \
  --argjson opsMaturity "$(cat "$OPS_MATURITY_PACKET")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    inputs: {
      publicationPacket: $publicationPacket,
      handoffNote: $handoffNote,
      opsMaturityPacket: $opsMaturityPacket,
      runbook: $runbook
    },
    artifacts: {
      publication: $publication,
      handoffMarkdown: $handoffText,
      opsMaturity: $opsMaturity
    }
  }
  ' >"$bundle_file"

cp "$bundle_file" "$latest_file"

echo "weekly closure bundle written."
echo "  bundle: $bundle_file"
echo "  latest: $latest_file"
