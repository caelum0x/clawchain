#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHECKLIST_FILE="${CHECKLIST_FILE:-artifacts/launch-control/ops-remediation-checklist-latest.json}"
OUT_DIR="${OUT_DIR:-artifacts/launch-control}"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

if [[ ! -f "$CHECKLIST_FILE" ]]; then
  echo "ERROR: missing checklist file '$CHECKLIST_FILE'." >&2
  exit 1
fi

sha256_of() {
  local file="$1"
  local sum=""
  sum="$(shasum -a 256 "$file" 2>/dev/null | awk '{print $1}' || true)"
  if [[ -z "$sum" ]]; then
    sum="$(sha256sum "$file" 2>/dev/null | awk '{print $1}' || true)"
  fi
  echo "$sum"
}

mkdir -p "$OUT_DIR"

week_id="$(jq -r '.weekId // ""' "$CHECKLIST_FILE")"
required="$(jq -r '.required // false' "$CHECKLIST_FILE")"
if [[ -z "$week_id" ]]; then
  echo "ERROR: remediation checklist missing weekId." >&2
  exit 1
fi

ts="$(date -u +%Y%m%dT%H%M%SZ)"
out_file="${OUT_DIR}/ops-remediation-bundle-${week_id}-${ts}.json"
latest_file="${OUT_DIR}/ops-remediation-bundle-latest.json"

tmp_artifacts="$(mktemp)"
trap 'rm -f "$tmp_artifacts"' EXIT

if [[ "$required" == "true" ]]; then
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if [[ ! -f "$path" ]]; then
      echo "ERROR: remediation bundle missing required artifact '$path'." >&2
      exit 1
    fi
    hash="$(sha256_of "$path")"
    if [[ -z "$hash" ]]; then
      echo "ERROR: could not compute sha256 for '$path'." >&2
      exit 1
    fi
    jq -n \
      --arg path "$path" \
      --arg sha256 "$hash" \
      --argjson content "$(cat "$path")" \
      '
      {
        path: $path,
        sha256: $sha256,
        content: $content
      }
      ' >>"$tmp_artifacts"
  done < <(jq -r '.issues[]?.artifactPath // empty' "$CHECKLIST_FILE" | awk '!seen[$0]++')
fi

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg weekId "$week_id" \
  --arg checklistFile "$CHECKLIST_FILE" \
  --argjson required "$(jq -r '.required // false' "$CHECKLIST_FILE")" \
  --argjson openIssuesCount "$(jq -r '.openIssuesCount // 0' "$CHECKLIST_FILE")" \
  --argjson checklist "$(cat "$CHECKLIST_FILE")" \
  --argjson artifacts "$(jq -s '.' "$tmp_artifacts")" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    gitCommit: $gitCommit,
    weekId: $weekId,
    checklistFile: $checklistFile,
    required: $required,
    openIssuesCount: $openIssuesCount,
    checklist: $checklist,
    bundledArtifacts: $artifacts
  }
  ' >"$out_file"

cp "$out_file" "$latest_file"

echo "ops remediation bundle written."
echo "  bundle: $out_file"
echo "  latest: $latest_file"
