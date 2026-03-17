#!/usr/bin/env bash
set -euo pipefail

required_files=(
  docs/operator-quickstart.md
  scripts/fresh-machine-acceptance.sh
  Makefile
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing required file '$file'." >&2
    exit 1
  fi
done

if ! rg -n '^openclaw-up-profile-vps:|^openclaw-up-profile-macmini:|^openclaw-up-profile-local:|^fresh-machine-acceptance:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing required profile/bootstrap targets for Track A." >&2
  exit 1
fi

if ! rg -n 'Platform parity startup flow|openclaw-up-profile-vps|openclaw-up-profile-macmini|openclaw-up-profile-local|make runtime-readiness-gate|make fresh-machine-acceptance|artifacts/bootstrap/' docs/operator-quickstart.md >/dev/null; then
  echo "ERROR: operator quickstart missing platform parity/bootstrap evidence flow." >&2
  exit 1
fi

echo "phase17 operator bootstrap gate passed."
