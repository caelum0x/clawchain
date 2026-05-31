#!/usr/bin/env bash
#
# Generate the privacy module's Groth16 keys for a DEV node and install them where
# both the node and the off-chain prover read them — emitting proving + verifying
# keys TOGETHER so the shield->unshield round-trip needs no manual VK swap.
#
#   bash scripts/gen-privacy-keys.sh [NODE_HOME]   # default NODE_HOME=.local-node
#
# This is a thin wrapper over `clawchaind privacy gen-dev-keys <dir>`, which writes
# transfer_{vk,pk}.bin and unshield_{vk,pk}.bin into <NODE_HOME>/keys. After running,
# (re)start the node so it loads the verifying keys, then point the prover at the
# same dir:  clawproof unshield-proof --keys-dir <NODE_HOME>/keys ...
#
# SECURITY: these dev keys come from a single-party local Groth16 setup (NOT secure).
# Mainnet MUST use the MPC trusted-setup ceremony output — never these.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NODE_HOME="${1:-.local-node}"
KEYS_DIR="$NODE_HOME/keys"
BIN="build/clawchaind"

if [ ! -x "$BIN" ]; then
  echo "--> Building clawchaind"
  make build
fi

echo "--> Generating privacy dev keys (pk+vk) into $KEYS_DIR"
"$BIN" privacy gen-dev-keys "$KEYS_DIR"

echo "--> Done. Keys installed:"
ls -1 "$KEYS_DIR"/*.bin | sed 's#^#    #'
cat <<EOF

Next:
  1. (Re)start the node so it loads the verifying keys from $KEYS_DIR
     (the app honors --home; keys load at construction).
  2. Generate proofs against the SAME keys dir:
       $BIN ... ; clawproof unshield-proof --keys-dir $KEYS_DIR ...
  pk and vk are a matched pair from one setup, so proofs verify on-chain with no
  manual VK swap.
EOF
