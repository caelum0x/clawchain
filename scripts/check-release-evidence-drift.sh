#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EVIDENCE_FILE="${1:-artifacts/release-evidence.json}"

if [[ ! -f "$EVIDENCE_FILE" ]]; then
  echo "ERROR: missing release evidence '$EVIDENCE_FILE'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 1
fi

evidence_commit="$(jq -r '.git.commit // ""' "$EVIDENCE_FILE")"
if [[ -z "$evidence_commit" ]]; then
  echo "ERROR: release evidence missing git.commit." >&2
  exit 1
fi

head_commit="$(git rev-parse HEAD)"
if [[ "$evidence_commit" != "$head_commit" ]]; then
  echo "ERROR: release evidence drift detected." >&2
  echo "  evidence commit: $evidence_commit" >&2
  echo "  current HEAD:    $head_commit" >&2
  exit 1
fi

echo "release evidence drift check passed."
