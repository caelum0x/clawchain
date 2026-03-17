#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  testnet/public.env
  testnet/public/manifest.json
  testnet/public/status.json
  testnet/validate-public-env.sh
  testnet/validate-public-manifest.sh
  testnet/validate-public-status.sh
  testnet/verify-stable-endpoints.sh
  Makefile
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing required deployment gate input '$file'." >&2
    exit 1
  fi
done

if ! rg -n '^testnet-public-deployment-gate:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing testnet-public-deployment-gate target." >&2
  exit 1
fi

STRICT_PUBLIC=1 bash ./testnet/validate-public-env.sh ./testnet/public.env >/dev/null
STRICT_PUBLIC=1 bash ./testnet/validate-public-manifest.sh ./testnet/public/manifest.json >/dev/null
STRICT_PUBLIC=1 bash ./testnet/validate-public-status.sh ./testnet/public/status.json >/dev/null
STRICT_PUBLIC=1 REQUIRE_COMPONENTS_UP=0 bash ./testnet/verify-stable-endpoints.sh \
  ./testnet/public.env \
  ./testnet/public/manifest.json \
  ./testnet/public/status.json >/dev/null

echo "public testnet deployment gate passed."
