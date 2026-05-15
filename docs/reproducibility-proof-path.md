# Reproducibility Proof Path

This document provides a step-by-step guide for an independent operator to join
the ClawChain public testnet using only published artifacts. No private access,
invitation, or out-of-band coordination is required.

## Prerequisites

| Requirement | Minimum |
|---|---|
| OS | Linux amd64 or macOS arm64 |
| Go | 1.22+ |
| Git | 2.x |
| curl, jq | latest |
| Disk | 20 GB free |
| RAM | 4 GB |
| Network | Public IP with ports 26656 (P2P) and 26657 (RPC) open |

## Step 1: Download the Manifest

The manifest is the single source of truth for the testnet. It contains genesis
URL, endpoint addresses, seed nodes, and binary version/checksum.

```bash
curl -fsSL https://testnet.clawchain.dev/manifest.json -o manifest.json

# Inspect contents
cat manifest.json | jq .
```

Verify the manifest fields are populated:

```bash
jq -r '.chain_id' manifest.json
# Expected: clawchain-testnet-1
```

## Step 2: Build or Download the Binary

### Option A: Build from source (recommended for verification)

```bash
git clone https://github.com/clawchain/clawchain.git
cd clawchain

# Check out the version specified in the manifest
BINARY_VERSION=$(jq -r '.binary.version' ../manifest.json)
git checkout "$BINARY_VERSION"

make install
```

### Option B: Download a pre-built binary

```bash
BINARY_VERSION=$(jq -r '.binary.version' manifest.json)
curl -fsSL "https://testnet.clawchain.dev/bin/clawchaind-${BINARY_VERSION}-$(uname -s)-$(uname -m)" \
  -o /usr/local/bin/clawchaind
chmod +x /usr/local/bin/clawchaind
```

## Step 3: Verify Binary Checksum

The manifest includes a SHA-256 checksum of the official binary. Verify your
build or download matches:

```bash
EXPECTED_CHECKSUM=$(jq -r '.binary.checksum' manifest.json)
ACTUAL_CHECKSUM=$(shasum -a 256 "$(which clawchaind)" | awk '{print $1}')

echo "Expected: $EXPECTED_CHECKSUM"
echo "Actual:   $ACTUAL_CHECKSUM"

if [ "$EXPECTED_CHECKSUM" = "$ACTUAL_CHECKSUM" ]; then
  echo "PASS: binary checksum matches"
else
  echo "WARN: checksum mismatch -- rebuild from the exact tagged source"
fi
```

Note: Checksums for source-built binaries may differ across OS/architecture.
The manifest checksum corresponds to the official release build. When building
from source, the version tag match is the primary verification.

## Step 4: Initialize the Node

```bash
CHAIN_ID=$(jq -r '.chain_id' manifest.json)

clawchaind init my-node --chain-id "$CHAIN_ID"
```

## Step 5: Download and Install Genesis

Replace the auto-generated genesis with the official testnet genesis:

```bash
GENESIS_URL=$(jq -r '.genesis.url' manifest.json)
GENESIS_SHA256=$(jq -r '.genesis.sha256' manifest.json)

curl -fsSL "$GENESIS_URL" -o ~/.clawchain/config/genesis.json

# Verify genesis integrity
ACTUAL_SHA256=$(shasum -a 256 ~/.clawchain/config/genesis.json | awk '{print $1}')

echo "Expected genesis SHA-256: $GENESIS_SHA256"
echo "Actual genesis SHA-256:   $ACTUAL_SHA256"

if [ "$GENESIS_SHA256" = "$ACTUAL_SHA256" ]; then
  echo "PASS: genesis file integrity verified"
else
  echo "FAIL: genesis hash mismatch -- re-download from the manifest URL"
  exit 1
fi
```

## Step 6: Configure Seed Nodes

Extract seeds from the manifest and write them into the node configuration:

```bash
SEEDS=$(jq -r '.seeds | join(",")' manifest.json)

# Update config.toml with seed addresses
sed -i.bak "s/^seeds = .*/seeds = \"${SEEDS}\"/" ~/.clawchain/config/config.toml
echo "Configured seeds: $SEEDS"
```

## Step 7: Start the Node and Sync to Head

```bash
clawchaind start
```

The node will connect to seed peers, discover the network, and begin syncing
blocks. Monitor progress:

```bash
# In another terminal
curl -s http://localhost:26657/status | jq '{
  catching_up: .result.sync_info.catching_up,
  latest_block_height: .result.sync_info.latest_block_height,
  latest_block_time: .result.sync_info.latest_block_time
}'
```

Wait until `catching_up` is `false`. Depending on chain height, this may take
minutes to hours.

## Step 8: Verify Chain State Matches

Once synced, verify your node agrees with the public endpoints listed in the
manifest:

```bash
RPC_URL=$(jq -r '.endpoints.rpc' manifest.json)

# Get the latest block from the public RPC
PUBLIC_HEIGHT=$(curl -s "${RPC_URL}/status" | jq -r '.result.sync_info.latest_block_height')

# Get the same block from your local node
LOCAL_HASH=$(curl -s "http://localhost:26657/block?height=${PUBLIC_HEIGHT}" | jq -r '.result.block_id.hash')
PUBLIC_HASH=$(curl -s "${RPC_URL}/block?height=${PUBLIC_HEIGHT}" | jq -r '.result.block_id.hash')

echo "Block height: $PUBLIC_HEIGHT"
echo "Public hash:  $PUBLIC_HASH"
echo "Local hash:   $LOCAL_HASH"

if [ "$LOCAL_HASH" = "$PUBLIC_HASH" ]; then
  echo "PASS: chain state matches -- node is in consensus"
else
  echo "FAIL: block hash mismatch at height $PUBLIC_HEIGHT"
  echo "  This may indicate a fork or misconfiguration. Re-check genesis and binary version."
  exit 1
fi
```

## Step 9: Run Endpoint Verification (Optional)

Verify all public endpoints are healthy using the automated script:

```bash
make verify-endpoints
# Or directly:
./scripts/verify-endpoints.sh
```

## Automated Reproducibility via Make Targets

For operators who prefer a single-command flow:

```bash
# Bootstrap from manifest with readiness gating
make clawd-bootstrap-ready MANIFEST=https://testnet.clawchain.dev/manifest.json HOST=<your-public-ip>
```

Or use the OpenClaw unified runtime:

```bash
make openclaw-up-profile-vps MANIFEST=https://testnet.clawchain.dev/manifest.json HOST=<your-public-ip>
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Node cannot find peers | Seeds unreachable | Check firewall, verify seed addresses in manifest |
| Genesis mismatch error on start | Wrong genesis file | Re-download from manifest genesis URL, verify SHA-256 |
| Binary panics on start | Version mismatch | Rebuild from the exact tag in `manifest.binary.version` |
| Sync stalls | Network partition or low peers | Add persistent peers, check `net_info` for peer count |
| Block hash mismatch after sync | Binary or genesis divergence | Wipe data, re-init from scratch with verified artifacts |

## Summary

An independent operator can join the ClawChain testnet with zero privileged
access by following this path:

1. Download `manifest.json` (public URL)
2. Build or download the binary; verify checksum
3. Initialize node with the correct chain ID
4. Install verified genesis file
5. Configure seeds from the manifest
6. Start the node and sync to head
7. Verify block hashes match the public network

All inputs are derived from the published manifest. No private keys, invite
codes, or side-channel coordination is required.
