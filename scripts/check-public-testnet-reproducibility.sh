#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Final DoD proof path: public testnet operator flow is documented and reproducible.

required_make_targets=(
  openclaw-up-profile-vps
  openclaw-up-profile-macmini
  openclaw-up-profile-local
  testnet-public-env
  testnet-public-validate
  testnet-public-deploy
  testnet-public-stable-endpoints
  testnet-public-deployment-gate
  testnet-public-verify-artifacts-only
  testnet-public-deploy-hetzner
)

for target in "${required_make_targets[@]}"; do
  if ! rg -n "^${target}:" Makefile >/dev/null; then
    echo "ERROR: missing Make target '${target}' required for reproducible public path." >&2
    exit 1
  fi
done

required_scripts=(
  testnet/validate-public-env.sh
  testnet/publish-static-endpoint.sh
  testnet/validate-public-manifest.sh
  testnet/validate-public-status.sh
  testnet/verify-stable-endpoints.sh
  testnet/verify-public-artifacts-only.sh
)

for script_path in "${required_scripts[@]}"; do
  if [[ ! -f "$script_path" ]]; then
    echo "ERROR: missing script '${script_path}' required for reproducible public path." >&2
    exit 1
  fi
done

if ! rg -n '^PUBLIC_BASE_URL=|^PUBLIC_RPC_URL=|^PUBLIC_REST_URL=|^PUBLIC_GRPC_ADDR=|^PUBLIC_FAUCET_URL=|^PUBLIC_GRAFANA_URL=|^PUBLIC_PROMETHEUS_URL=' testnet/public.env.example >/dev/null; then
  echo "ERROR: public.env.example is missing required stable endpoint variables." >&2
  exit 1
fi

if ! rg -n 'Public testnet publish checklist|make testnet-public-validate|make testnet-public-deploy|make testnet-public-stable-endpoints|make testnet-public-deployment-gate|make testnet-public-verify-artifacts-only|published artifacts only|openclaw-up-profile-vps|openclaw-up-profile-macmini|openclaw-up-profile-local' docs/operator-quickstart.md >/dev/null; then
  echo "ERROR: operator quickstart is missing reproducible public testnet proof path steps." >&2
  exit 1
fi

echo "public testnet reproducibility proof path gate passed."
