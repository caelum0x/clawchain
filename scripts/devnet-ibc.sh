#!/usr/bin/env bash
#
# Optional two-chain devnet mode for IBC development. It builds the current
# binary, runs the existing two-chain IBC test driver, and leaves artifacts under
# artifacts/ibc-test/.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

KEEP_RUNNING=false
for arg in "$@"; do
  case "$arg" in
    --keep-running) KEEP_RUNNING=true ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$ROOT_DIR/build"
go build -o "$ROOT_DIR/build/clawchaind" ./cmd/clawchaind/

if [ "$KEEP_RUNNING" = true ]; then
  BINARY="$ROOT_DIR/build/clawchaind" bash scripts/ibc-two-chain-test.sh --keep-running
else
  BINARY="$ROOT_DIR/build/clawchaind" bash scripts/ibc-two-chain-test.sh
fi
