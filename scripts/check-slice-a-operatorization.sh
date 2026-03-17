#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CLAWD_DIR="$ROOT_DIR/cmd/clawd"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi
if [[ ! -f "$CLAWD_DIR/dist/main.js" ]]; then
  echo "missing clawd build output: $CLAWD_DIR/dist/main.js" >&2
  echo "run: make clawd-build" >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

(
  cd "$CLAWD_DIR"
  node ./dist/main.js doctor --json >"$tmp"
)

if [[ "$(jq -r '.lifecycle.completed' "$tmp")" != "true" ]]; then
  echo "slice-a gate failed: lifecycle is not completed" >&2
  jq -r '.lifecycle' "$tmp" >&2
  exit 1
fi

if [[ "$(jq -r '.checks[] | select(.name=="Integrated readiness") | .ok' "$tmp")" != "true" ]]; then
  echo "slice-a gate failed: integrated readiness check is not passing" >&2
  jq -r '.checks[] | select(.name=="Integrated readiness")' "$tmp" >&2
  exit 1
fi

if [[ "$(jq -r '.checks[] | select(.name=="On-chain agent capabilities metadata") | .ok' "$tmp")" != "true" ]]; then
  echo "slice-a gate failed: capability metadata check is not passing" >&2
  jq -r '.checks[] | select(.name=="On-chain agent capabilities metadata")' "$tmp" >&2
  exit 1
fi

echo "slice-a operatorization gate passed."
