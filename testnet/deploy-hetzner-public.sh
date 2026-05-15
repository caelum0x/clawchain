#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
ENV_FILE="${1:-$TESTNET_DIR/public.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  echo "copy template and edit values first:" >&2
  echo "  cp $TESTNET_DIR/public.env.example $TESTNET_DIR/public.env" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

# Conservative defaults for Hetzner static publish.
export TESTNET_PUBLISH_MODE="${TESTNET_PUBLISH_MODE:-ssh}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
export TESTNET_PUBLISH_SSH_TARGET="${TESTNET_PUBLISH_SSH_TARGET:-}"
export TESTNET_PUBLISH_SSH_DIR="${TESTNET_PUBLISH_SSH_DIR:-}"

if [[ "$TESTNET_PUBLISH_MODE" != "ssh" ]]; then
  echo "warning: TESTNET_PUBLISH_MODE is '$TESTNET_PUBLISH_MODE' (expected ssh for Hetzner preset)"
fi

if [[ -z "${TESTNET_PUBLISH_SSH_TARGET:-}" || -z "${TESTNET_PUBLISH_SSH_DIR:-}" ]]; then
  echo "TESTNET_PUBLISH_SSH_TARGET and TESTNET_PUBLISH_SSH_DIR are required" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

echo "deploy preset: hetzner static public artifacts"
echo "env file: $ENV_FILE"
echo "target: $TESTNET_PUBLISH_SSH_TARGET:$TESTNET_PUBLISH_SSH_DIR"

bash "$TESTNET_DIR/publish-static-endpoint.sh"

echo "verifying remote files..."
ssh -o StrictHostKeyChecking=accept-new "$TESTNET_PUBLISH_SSH_TARGET" \
  "ls -la '$TESTNET_PUBLISH_SSH_DIR' | sed -n '1,40p'"

echo "hetzner public deploy complete."
