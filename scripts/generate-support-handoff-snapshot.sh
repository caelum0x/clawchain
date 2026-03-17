#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="${OUT_DIR:-artifacts/support}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${OUT_DIR}/support-handoff-snapshot-${TS}.json"
LATEST_FILE="${OUT_DIR}/support-handoff-snapshot-latest.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

tmp_runtime="$(mktemp)"
tmp_doctor="$(mktemp)"
tmp_peers="$(mktemp)"
tmp_release_summary="$(mktemp)"

cleanup() {
  rm -f "$tmp_runtime" "$tmp_doctor" "$tmp_peers" "$tmp_release_summary"
}
trap cleanup EXIT

capture_clawd_json() {
  local label="$1"
  local outfile="$2"
  shift 2

  if [[ ! -f cmd/clawd/dist/main.js ]]; then
    jq -n --arg status "unavailable" --arg reason "cmd/clawd/dist/main.js missing (run make clawd-build)" \
      '{status:$status, reason:$reason}' >"$outfile"
    return 0
  fi

  if (cd cmd/clawd && node ./dist/main.js "$@" >"$outfile" 2>/dev/null); then
    if jq -e . "$outfile" >/dev/null 2>&1; then
      return 0
    fi
  fi

  jq -n --arg status "failed" --arg command "node ./dist/main.js $*" \
    '{status:$status, command:$command}' >"$outfile"
}

capture_clawd_json "runtime_readiness" "$tmp_runtime" readiness --json
capture_clawd_json "doctor" "$tmp_doctor" doctor --json
capture_clawd_json "peers_summary" "$tmp_peers" peers summary --out json
capture_clawd_json "release_summary" "$tmp_release_summary" release-summary --json

jq -n \
  --arg generatedAtUtc "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg gitBranch "$(git rev-parse --abbrev-ref HEAD)" \
  --arg gitCommit "$(git rev-parse HEAD)" \
  --arg releaseEvidencePath "artifacts/release-evidence.json" \
  --argjson runtimeReadiness "$(cat "$tmp_runtime")" \
  --argjson doctor "$(cat "$tmp_doctor")" \
  --argjson peers "$(cat "$tmp_peers")" \
  --argjson releaseSummary "$(cat "$tmp_release_summary")" \
  --argjson releaseEvidence "$(
    if [[ -f artifacts/release-evidence.json ]]; then
      cat artifacts/release-evidence.json
    else
      echo '{"status":"unavailable","reason":"artifacts/release-evidence.json missing"}'
    fi
  )" \
  '
  {
    generatedAtUtc: $generatedAtUtc,
    git: {
      branch: $gitBranch,
      commit: $gitCommit
    },
    releaseEvidencePath: $releaseEvidencePath,
    runtimeReadiness: $runtimeReadiness,
    doctor: $doctor,
    peersSummary: $peers,
    releaseSummary: $releaseSummary,
    releaseEvidence: $releaseEvidence
  }
  ' >"$OUT_FILE"

cp "$OUT_FILE" "$LATEST_FILE"

echo "support handoff snapshot written."
echo "  snapshot: $OUT_FILE"
echo "  latest:   $LATEST_FILE"
