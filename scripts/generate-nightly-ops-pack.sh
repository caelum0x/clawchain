#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DAY_UTC="${DAY_UTC:-$(date -u +%Y%m%d)}"
OUT_DIR="${OUT_DIR:-artifacts/operations}"
MANIFEST="${MANIFEST:-unknown}"
HOST="${HOST:-unknown}"

mkdir -p "$OUT_DIR"

gate_artifact="${OUT_DIR}/nightly-gate-summary-${DAY_UTC}.json"
release_artifact="${OUT_DIR}/nightly-release-evidence-${DAY_UTC}.json"
summary_artifact="${OUT_DIR}/nightly-ops-pack-${DAY_UTC}.json"
latest_artifact="${OUT_DIR}/nightly-ops-pack-latest.json"

gate_status="passed"
if ! bash ./scripts/gate-summary.sh --json >"$gate_artifact" 2>/dev/null; then
  gate_status="failed"
fi

release_status="passed"
if ! MANIFEST="$MANIFEST" HOST="$HOST" bash ./scripts/generate-release-evidence.sh >/dev/null 2>&1; then
  release_status="failed"
fi
if [[ -f artifacts/release-evidence.json ]]; then
  cp artifacts/release-evidence.json "$release_artifact"
else
  release_status="failed"
  printf '{"status":"missing","reason":"artifacts/release-evidence.json not found"}\n' >"$release_artifact"
fi

overall_status="passed"
if [[ "$gate_status" != "passed" || "$release_status" != "passed" ]]; then
  overall_status="failed"
fi

cat >"$summary_artifact" <<JSON
{
  "generatedAtUtc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "dayUtc": "$DAY_UTC",
  "cronSafe": true,
  "checks": {
    "gateSummary": {
      "status": "$gate_status",
      "artifact": "${gate_artifact}"
    },
    "releaseEvidenceRefresh": {
      "status": "$release_status",
      "artifact": "${release_artifact}"
    }
  },
  "overallStatus": "$overall_status"
}
JSON

cp "$summary_artifact" "$latest_artifact"

echo "nightly ops pack written."
echo "  summary: $summary_artifact"
echo "  latest:  $latest_artifact"
