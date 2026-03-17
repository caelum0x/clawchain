#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PUBLICATION_PACKET="${1:-artifacts/launch-control/weekly-publication-packet-latest.json}"
HANDOFF_NOTE="${2:-artifacts/launch-control/weekly-handoff-note-latest.md}"
CLOSURE_BUNDLE="${3:-artifacts/launch-control/weekly-closure-bundle-latest.json}"

bash ./scripts/check-phase20-product-complete-gate.sh >/dev/null
bash ./scripts/check-phase21-artifact-index-gate.sh >/dev/null
bash ./scripts/check-phase21-publication-packet-gate.sh "$PUBLICATION_PACKET" >/dev/null
bash ./scripts/check-phase21-handoff-gate.sh "$HANDOFF_NOTE" >/dev/null

if [[ ! -f "$CLOSURE_BUNDLE" ]]; then
  echo "ERROR: missing weekly closure bundle '$CLOSURE_BUNDLE'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

bundle_week="$(jq -r '.weekId // ""' "$CLOSURE_BUNDLE")"
summary_week="$(jq -r '.weekId // ""' artifacts/launch-control/post-launch-weekly-executive-summary-latest.json)"
if [[ -z "$bundle_week" || "$bundle_week" != "$summary_week" ]]; then
  echo "ERROR: weekly closure bundle weekId mismatch." >&2
  exit 1
fi

echo "phase21 program closure gate passed."
