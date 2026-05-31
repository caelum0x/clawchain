#!/usr/bin/env bash
#
# Generate the privacy module's Groth16 keys for a DEV node and install them where
# both the node and the off-chain prover read them — emitting proving + verifying
# keys TOGETHER so the shield->unshield round-trip needs no manual VK swap.
#
#   bash scripts/gen-privacy-keys.sh [NODE_HOME]   # default NODE_HOME=.local-node
#
# After running, restart the node so it loads the new verifying keys, then point
# clawproof at the same dir:  clawproof unshield-proof --keys-dir <NODE_HOME>/keys ...
#
# SECURITY: these dev keys come from a single-party `clawproof setup` (NOT secure).
# Mainnet MUST use the MPC trusted-setup ceremony output — never these.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NODE_HOME="${1:-.local-node}"
KEYS_DIR="$NODE_HOME/keys"
CLAWPROOF="build/clawproof"
SETUP_DIR="$HOME/.clawchain/keys" # clawproof setup writes here (no output flag)

if [ ! -x "$CLAWPROOF" ]; then
  echo "--> Building clawproof"
  go build -o "$CLAWPROOF" ./cmd/clawproof
fi

echo "--> Running clawproof trusted setup (DEV — single party, NOT secure)"
"$CLAWPROOF" setup >/dev/null

mkdir -p "$KEYS_DIR"
echo "--> Installing proving + verifying keys into $KEYS_DIR"
for f in transfer_pk.bin transfer_vk.bin unshield_pk.bin unshield_vk.bin; do
  if [ ! -f "$SETUP_DIR/$f" ]; then
    echo "error: expected $SETUP_DIR/$f after setup" >&2
    exit 1
  fi
  cp "$SETUP_DIR/$f" "$KEYS_DIR/$f"
done

echo "--> Done. Keys (pk+vk) installed in $KEYS_DIR:"
ls -1 "$KEYS_DIR"/*.bin | sed 's#^#    #'
cat <<EOF

Next:
  1. Restart the node so it loads the verifying keys from $KEYS_DIR
     (the app now honors --home; keys load at construction).
  2. Generate proofs against the SAME keys dir:
       $CLAWPROOF unshield-proof --keys-dir $KEYS_DIR ...
  Because the pk and vk are a matched pair from one setup, proofs verify on-chain
  with no manual VK swap.
EOF
