#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! cmp -s README.md readme.md; then
  echo "ERROR: README.md and readme.md are out of sync."
  echo "Run: cp README.md readme.md"
  exit 1
fi

echo "README sync check passed."
