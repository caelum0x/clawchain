#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  testnet/publish-public-testnet.sh
  testnet/verify-stable-endpoints.sh
  testnet/verify-public-artifacts-only.sh
  scripts/check-public-testnet-reproducibility.sh
  docs/operator-quickstart.md
  Makefile
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "ERROR: missing required file '$file'." >&2
    exit 1
  fi
done

if ! rg -n '^testnet-public-stable-endpoints:|^testnet-public-deployment-gate:|^testnet-public-verify-artifacts-only:|^public-testnet-reproducibility-proof-path:|^phase17-public-testnet-stability-gate:' Makefile >/dev/null; then
  echo "ERROR: Makefile missing Track B public testnet targets." >&2
  exit 1
fi

if ! rg -n 'manifest-lifecycle\.json|manifest\.sha256|lifecycle|signedUpdate|stableEndpointSet' testnet/publish-public-testnet.sh >/dev/null; then
  echo "ERROR: publish-public-testnet.sh missing signed lifecycle metadata wiring." >&2
  exit 1
fi

if [[ -f testnet/public.env ]]; then
  bash ./testnet/validate-public-env.sh ./testnet/public.env >/dev/null
fi

if ! rg -n 'testnet-public-verify-artifacts-only|published artifacts only|testnet-public-stable-endpoints|testnet-public-deployment-gate' docs/operator-quickstart.md >/dev/null; then
  echo "ERROR: operator quickstart missing Track B reproducibility/stable endpoint flow." >&2
  exit 1
fi

echo "phase17 public testnet stability gate passed."
