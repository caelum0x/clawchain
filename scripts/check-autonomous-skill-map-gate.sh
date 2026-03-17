#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKILL_ROOTS="${SKILL_ROOTS:-skills,openclaw/skills}"
ID_MAP_JSON="${ID_MAP_JSON:-}"
COMMAND_TEMPLATE="${COMMAND_TEMPLATE:-}"

cmd=(
  node
  ./cmd/clawd/dist/main.js
  autonomous
  map
  sync
  --skills-roots "$SKILL_ROOTS"
  --require-all
  --dry-run
)

if [[ -n "$ID_MAP_JSON" ]]; then
  cmd+=(--id-map-json "$ID_MAP_JSON")
fi

if [[ -n "$COMMAND_TEMPLATE" ]]; then
  cmd+=(--command-template "$COMMAND_TEMPLATE")
fi

echo "--> Running autonomous skill map strict gate"
echo "    roots=$SKILL_ROOTS"
"${cmd[@]}"
echo "--> Autonomous skill map strict gate passed"
