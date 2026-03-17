#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"
DEFAULT_REPO="https://github.com/chainapsis/oko.git"

REPO_URL="${1:-${CLAW_MOBILE_WALLET_REPO:-$DEFAULT_REPO}}"
DEST_DIR="${2:-$ROOT_DIR/vendor/claw-wallet-mobile}"
BRANCH="${CLAW_MOBILE_WALLET_BRANCH:-}"

if [ -d "$DEST_DIR/.git" ]; then
  echo "ok: mobile wallet repo already exists at $DEST_DIR"
  exit 0
fi

mkdir -p "$(dirname "$DEST_DIR")"

if [ -n "$BRANCH" ]; then
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$DEST_DIR"
else
  git clone --depth 1 "$REPO_URL" "$DEST_DIR"
fi

echo "ok: vendored mobile wallet repo into $DEST_DIR"
