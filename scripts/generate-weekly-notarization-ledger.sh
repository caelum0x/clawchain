#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/launch-control}"
AUDIT_LOG_FILE="${AUDIT_LOG_FILE:-artifacts/launch-control/weekly-audit-log-latest.json}"
SIGNOFF_JSON="${SIGNOFF_JSON:-artifacts/launch-control/weekly-signoff-manifest-latest.json}"
SIGNOFF_MD="${SIGNOFF_MD:-artifacts/launch-control/weekly-signoff-manifest-latest.md}"

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

for file in "$AUDIT_LOG_FILE" "$SIGNOFF_JSON" "$SIGNOFF_MD"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing notarization input '$file'." >&2
    exit 1
  fi
done

week_id="$(jq -r '.weekId // ""' "$SIGNOFF_JSON")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: signoff manifest missing weekId." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
json_file="${OUT_DIR}/weekly-notarization-ledger-${week_id}.json"
latest_file="${OUT_DIR}/weekly-notarization-ledger-latest.json"

tmp_entries="$(mktemp)"
trap 'rm -f "$tmp_entries"' EXIT

for file in "$AUDIT_LOG_FILE" "$SIGNOFF_JSON" "$SIGNOFF_MD"; do
  hash="$(sha256_of "$file")"
  if [[ -z "$hash" ]]; then
    echo "ERROR: failed to hash '$file'." >&2
    exit 1
  fi
  jq -n --arg path "$file" --arg sha256 "$hash" '{path:$path, sha256:$sha256}' >>"$tmp_entries"
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
  ' >"$json_file"

cp "$json_file" "$latest_file"

echo "weekly notarization ledger written."
echo "  ledger: $json_file"
echo "  latest: $latest_file"
