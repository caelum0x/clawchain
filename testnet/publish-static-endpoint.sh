#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TESTNET_DIR="$ROOT_DIR/testnet"
PUBLIC_DIR="$TESTNET_DIR/public"
MANIFEST="$PUBLIC_DIR/manifest.json"
STATUS="$PUBLIC_DIR/status.json"

MODE="${TESTNET_PUBLISH_MODE:-none}" # none|local|s3|ssh

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

# Build/update local public artifacts first.
bash "$TESTNET_DIR/publish-public-testnet.sh"

if [[ ! -f "$MANIFEST" ]]; then
  echo "missing manifest: $MANIFEST" >&2
  exit 1
fi
if [[ ! -f "$STATUS" ]]; then
  echo "missing status: $STATUS" >&2
  exit 1
fi

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
if [[ -n "$PUBLIC_BASE_URL" ]]; then
  tmp="$(mktemp)"
  jq --arg base "$PUBLIC_BASE_URL" '
    .artifactBaseUrl = $base
    | .genesis.url = ($base + "/genesis.json")
    | .manifestUrl = ($base + "/manifest.json")
    | .statusUrl = ($base + "/status.json")
  ' "$MANIFEST" > "$tmp"
  mv "$tmp" "$MANIFEST"

  tmp="$(mktemp)"
  jq --arg base "$PUBLIC_BASE_URL" '
    .artifactBaseUrl = $base
    | .manifestUrl = ($base + "/manifest.json")
    | .genesisUrl = ($base + "/genesis.json")
    | .statusUrl = ($base + "/status.json")
  ' "$STATUS" > "$tmp"
  mv "$tmp" "$STATUS"
fi

case "$MODE" in
  none)
    echo "publish mode: none (artifacts generated locally only)"
    ;;
  local)
    DEST_DIR="${TESTNET_PUBLISH_LOCAL_DIR:-}"
    if [[ -z "$DEST_DIR" ]]; then
      echo "TESTNET_PUBLISH_LOCAL_DIR is required for local mode" >&2
      exit 1
    fi
    mkdir -p "$DEST_DIR"
    rsync -a --delete "$PUBLIC_DIR/" "$DEST_DIR/"
    echo "published to local dir: $DEST_DIR"
    ;;
  s3)
    S3_URI="${TESTNET_PUBLISH_S3_URI:-}"
    if [[ -z "$S3_URI" ]]; then
      echo "TESTNET_PUBLISH_S3_URI is required for s3 mode" >&2
      exit 1
    fi
    if ! command -v aws >/dev/null 2>&1; then
      echo "aws cli is required for s3 mode" >&2
      exit 1
    fi
    aws s3 sync "$PUBLIC_DIR/" "$S3_URI/" --delete
    echo "published to s3: $S3_URI"
    ;;
  ssh)
    SSH_TARGET="${TESTNET_PUBLISH_SSH_TARGET:-}"
    SSH_DIR="${TESTNET_PUBLISH_SSH_DIR:-}"
    if [[ -z "$SSH_TARGET" || -z "$SSH_DIR" ]]; then
      echo "TESTNET_PUBLISH_SSH_TARGET and TESTNET_PUBLISH_SSH_DIR are required for ssh mode" >&2
      exit 1
    fi
    rsync -avz --delete "$PUBLIC_DIR/" "$SSH_TARGET:$SSH_DIR/"
    echo "published via ssh: $SSH_TARGET:$SSH_DIR"
    ;;
  *)
    echo "unknown TESTNET_PUBLISH_MODE: $MODE (expected none|local|s3|ssh)" >&2
    exit 1
    ;;
esac

echo "artifact summary:"
echo "  manifest: $MANIFEST"
echo "  status:   $STATUS"
echo "  network:  $PUBLIC_DIR/NETWORK.md"
if [[ -n "$PUBLIC_BASE_URL" ]]; then
  echo "  manifest url: ${PUBLIC_BASE_URL}/manifest.json"
  echo "  genesis  url: ${PUBLIC_BASE_URL}/genesis.json"
  echo "  status   url: ${PUBLIC_BASE_URL}/status.json"
fi
