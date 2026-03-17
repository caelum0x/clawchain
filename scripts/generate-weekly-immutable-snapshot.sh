#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
LEDGER_FILE="${LEDGER_FILE:-artifacts/launch-control/weekly-notarization-ledger-latest.json}"
AUDIT_LOG_FILE="${AUDIT_LOG_FILE:-artifacts/launch-control/weekly-audit-log-latest.json}"
SIGNOFF_JSON="${SIGNOFF_JSON:-artifacts/launch-control/weekly-signoff-manifest-latest.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

for file in "$LEDGER_FILE" "$AUDIT_LOG_FILE" "$SIGNOFF_JSON"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing immutable snapshot input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$SIGNOFF_JSON")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: signoff manifest missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
json_file="${OUT_DIR}/weekly-immutable-snapshot-${week_id}.json"
json_latest="${OUT_DIR}/weekly-immutable-snapshot-latest.json"
md_file="${OUT_DIR}/weekly-notarization-receipt-${week_id}.md"
md_latest="${OUT_DIR}/weekly-notarization-receipt-latest.md"

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg ledgerFile "$LEDGER_FILE" \
  --arg auditLogFile "$AUDIT_LOG_FILE" \
  --arg signoffJson "$SIGNOFF_JSON" \
  --argjson ledger "$(cat "$LEDGER_FILE")" \
  --argjson auditLog "$(cat "$AUDIT_LOG_FILE")" \
  --argjson signoff "$(cat "$SIGNOFF_JSON")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    references: {
      ledgerFile: $ledgerFile,
      auditLogFile: $auditLogFile,
      signoffJson: $signoffJson
    },
    artifacts: {
      ledger: $ledger,
      auditLog: $auditLog,
      signoff: $signoff
    }
  }
  ' >"$json_file"

cp "$json_file" "$json_latest"

cat >"$md_file" <<MD
# Weekly Notarization Receipt (${week_id})

## Immutable References

- ${LEDGER_FILE}
- ${AUDIT_LOG_FILE}
- ${SIGNOFF_JSON}
- artifacts/launch-control/weekly-closeout-attestation-latest.json
- artifacts/launch-control/weekly-history-rollup-latest.json
MD

cp "$md_file" "$md_latest"

echo "weekly immutable snapshot written."
echo "  json:   $json_file"
echo "  latest: $json_latest"
echo "  md:     $md_file"
