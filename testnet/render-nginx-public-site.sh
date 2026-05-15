#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
ENV_FILE="${1:-$TESTNET_DIR/public.env}"
TEMPLATE_FILE="$TESTNET_DIR/nginx/testnet-public.conf.tpl"
OUT_FILE="${2:-$TESTNET_DIR/nginx/testnet-public.conf}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing env file: $ENV_FILE" >&2
  echo "copy template and edit values first: cp $TESTNET_DIR/public.env.example $TESTNET_DIR/public.env" >&2
  exit 1
fi

if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "missing template file: $TEMPLATE_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

DOMAIN="${PUBLIC_DOMAIN:-}"
if [[ -z "$DOMAIN" ]]; then
  if [[ -n "${PUBLIC_BASE_URL:-}" ]]; then
    DOMAIN="$(printf '%s' "$PUBLIC_BASE_URL" | sed -E 's#^https?://([^/]+)/?.*$#\1#')"
  fi
fi

PUBLIC_DIR="${TESTNET_PUBLISH_SSH_DIR:-/var/www/testnet.clawchain.example/public}"

if [[ -z "$DOMAIN" ]]; then
  echo "PUBLIC_DOMAIN or PUBLIC_BASE_URL must be set in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

sed \
  -e "s#{{DOMAIN}}#$DOMAIN#g" \
  -e "s#{{PUBLIC_DIR}}#$PUBLIC_DIR#g" \
  "$TEMPLATE_FILE" > "$OUT_FILE"

echo "wrote nginx config: $OUT_FILE"
echo "  domain: $DOMAIN"
echo "  root:   $PUBLIC_DIR"
