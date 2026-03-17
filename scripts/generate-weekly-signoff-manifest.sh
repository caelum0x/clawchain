#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
AUDIT_LOG_FILE="${AUDIT_LOG_FILE:-artifacts/launch-control/weekly-audit-log-latest.json}"
ATTESTATION_FILE="${ATTESTATION_FILE:-artifacts/launch-control/weekly-closeout-attestation-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$AUDIT_LOG_FILE" "$ATTESTATION_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing signoff input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$ATTESTATION_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: attestation missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
json_file="${OUT_DIR}/weekly-signoff-manifest-${week_id}.json"
json_latest="${OUT_DIR}/weekly-signoff-manifest-latest.json"
md_file="${OUT_DIR}/weekly-signoff-manifest-${week_id}.md"
md_latest="${OUT_DIR}/weekly-signoff-manifest-latest.md"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg auditLogFile "$AUDIT_LOG_FILE" \
  --arg attestationFile "$ATTESTATION_FILE" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    references: {
      auditLogFile: $auditLogFile,
      attestationFile: $attestationFile
    },
    signoff: {
      releaseOwner: "pending",
      runtimeOwner: "pending",
      chainOwner: "pending"
    }
  }
  ' >"$json_file"

cp "$json_file" "$json_latest"

cat >"$md_file" <<MD
# Weekly Signoff Manifest (${week_id})

## References

- ${AUDIT_LOG_FILE}
- ${ATTESTATION_FILE}
- artifacts/launch-control/weekly-history-rollup-latest.json
- artifacts/launch-control/operator-status-snapshot-latest.json

## Signoff

- Release Owner: pending
- Runtime Owner: pending
- Chain Owner: pending
MD

cp "$md_file" "$md_latest"

echo "weekly signoff manifest written."
echo "  json:   $json_file"
echo "  latest: $json_latest"
echo "  md:     $md_file"
