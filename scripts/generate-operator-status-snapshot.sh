#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
SUMMARY_FILE="${SUMMARY_FILE:-artifacts/launch-control/post-launch-weekly-executive-summary-latest.json}"
PUBLICATION_PACKET="${PUBLICATION_PACKET:-artifacts/launch-control/weekly-publication-packet-latest.json}"
DIGEST_PACK="${DIGEST_PACK:-artifacts/launch-control/weekly-closure-digest-pack-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$SUMMARY_FILE" "$PUBLICATION_PACKET" "$DIGEST_PACK"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing operator snapshot input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$SUMMARY_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: summary file missing weekId." >&2
  exit 1
fi

phase20_product="failed"
if bash ./scripts/check-phase20-product-complete-gate.sh >/dev/null; then
  phase20_product="passed"
fi

phase21_program="failed"
if bash ./scripts/check-phase21-program-closure-gate.sh >/dev/null; then
  phase21_program="passed"
fi

phase22_digest="failed"
if bash ./scripts/check-phase22-closure-digest-gate.sh "$DIGEST_PACK" >/dev/null; then
  phase22_digest="passed"
fi

overall_status="passed"
if [[ "$phase20_product" != "passed" || "$phase21_program" != "passed" || "$phase22_digest" != "passed" ]]; then
  overall_status="failed"
fi

mkdir -p "$OUT_DIR"
json_file="${OUT_DIR}/operator-status-snapshot-${week_id}.json"
json_latest="${OUT_DIR}/operator-status-snapshot-latest.json"
md_file="${OUT_DIR}/operator-status-snapshot-${week_id}.md"
md_latest="${OUT_DIR}/operator-status-snapshot-latest.md"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg overallStatus "$overall_status" \
  --arg phase20Product "$phase20_product" \
  --arg phase21Program "$phase21_program" \
  --arg phase22Digest "$phase22_digest" \
  --arg summaryFile "$SUMMARY_FILE" \
  --arg publicationPacket "$PUBLICATION_PACKET" \
  --arg digestPack "$DIGEST_PACK" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    overallStatus: $overallStatus,
    gateStatus: {
      phase20ProductComplete: $phase20Product,
      phase21ProgramClosure: $phase21Program,
      phase22ClosureDigest: $phase22Digest
    },
    references: {
      summaryFile: $summaryFile,
      publicationPacket: $publicationPacket,
      digestPack: $digestPack
    }
  }
  ' >"$json_file"

cp "$json_file" "$json_latest"

cat >"$md_file" <<MD
# Operator Status Snapshot (${week_id})

## Overall Status

- Overall status: ${overall_status}

## Gate Status

- Phase 20 Product Complete: ${phase20_product}
- Phase 21 Program Closure: ${phase21_program}
- Phase 22 Closure Digest: ${phase22_digest}

## Artifact References

- ${SUMMARY_FILE}
- ${PUBLICATION_PACKET}
- ${DIGEST_PACK}
- artifacts/launch-control/weekly-closure-bundle-latest.json
MD

cp "$md_file" "$md_latest"

echo "operator status snapshot written."
echo "  json:   $json_file"
echo "  latest: $json_latest"
echo "  md:     $md_file"
