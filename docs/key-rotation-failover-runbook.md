# Key Rotation and Validator Failover Runbook

**Phase 17 Track C -- ClawChain Operator Security Operations**

This runbook provides executable command checklists for validator key rotation, node key rotation, wallet key backup/recovery, and validator failover procedures.

---

## Table of Contents

1. [Pre-Flight Checklist](#pre-flight-checklist)
2. [Validator Key Rotation](#validator-key-rotation)
3. [Node Key Rotation](#node-key-rotation)
4. [Wallet Key Backup and Recovery](#wallet-key-backup-and-recovery)
5. [Validator Failover Procedure](#validator-failover-procedure)
6. [Post-Rotation Verification](#post-rotation-verification)

---

## Pre-Flight Checklist

Complete every item before starting any rotation or failover procedure. Do not proceed until all items pass.

```
[ ] 1. Current node is fully synced (not catching up)
      clawchaind status --home ~/.clawchain 2>&1 | grep catching_up
      # Must show: "catching_up": false

[ ] 2. Current backup exists and is recent (< 24 hours old)
      ls -lt ./backups/clawchain-backup-*.tar.gz | head -1
      # If no recent backup exists, create one:
      ./scripts/backup-state.sh

[ ] 3. Backup integrity verified
      ./scripts/verify-backup-restore.sh
      # Must show: ALL CHECKS PASSED

[ ] 4. Operator account has sufficient funds for transaction fees
      clawchaind query bank balances <operator-address> --home ~/.clawchain
      # Must have >= 1000uclaw for rotation transactions

[ ] 5. Node is not in incident mode
      clawd doctor --json 2>/dev/null | grep -A2 '"Incident mode"'
      # Must show: "ok": true

[ ] 6. Validator is not currently jailed
      clawchaind query staking validator <validator-operator-address> --home ~/.clawchain | grep jailed
      # Must show: jailed: false

[ ] 7. No active governance upgrade proposal in voting period
      clawchaind query gov proposals --status voting_period --home ~/.clawchain
      # Must show no active upgrade proposals

[ ] 8. Standby node is available (for failover procedures only)
      ssh <standby-host> "clawchaind status --home ~/.clawchain 2>&1 | grep catching_up"
      # Must show: "catching_up": false
```

---

## Validator Key Rotation

Validator key rotation replaces the consensus signing key (`priv_validator_key.json`). This is required when a key is suspected compromised, during scheduled security rotations, or when migrating to new hardware.

### Step 1: Stop the active validator

```bash
# Stop the validator to prevent signing with the old key during rotation
sudo systemctl stop clawchaind
```

### Step 2: Archive the current validator key

```bash
# Create a timestamped archive of the current key for rollback
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE_DIR="$HOME/.clawchain/key-archive/${TIMESTAMP}"
mkdir -p "${ARCHIVE_DIR}"

cp ~/.clawchain/config/priv_validator_key.json "${ARCHIVE_DIR}/priv_validator_key.json.old"
cp ~/.clawchain/data/priv_validator_state.json "${ARCHIVE_DIR}/priv_validator_state.json.old"
chmod 600 "${ARCHIVE_DIR}"/*.json.old

echo "Archived old key to ${ARCHIVE_DIR}"
```

### Step 3: Generate a new validator key

```bash
# Generate a new key using a temporary init on a clean directory
TMPDIR=$(mktemp -d)
clawchaind init key-rotation-temp --chain-id clawchain-local-1 --home "${TMPDIR}"

# Copy the new key into place
cp "${TMPDIR}/config/priv_validator_key.json" ~/.clawchain/config/priv_validator_key.json
chmod 600 ~/.clawchain/config/priv_validator_key.json

# Reset the validator state to prevent double-sign with the old key
echo '{"height":"0","round":0,"step":0}' > ~/.clawchain/data/priv_validator_state.json

# Clean up
rm -rf "${TMPDIR}"

echo "New validator key installed."
```

### Step 4: Record the new consensus public key

```bash
# Display the new consensus public key (needed for the rotation transaction)
NEW_PUBKEY=$(clawchaind comet show-validator --home ~/.clawchain)
echo "New consensus pubkey: ${NEW_PUBKEY}"
```

### Step 5: Submit the validator key rotation transaction

```bash
# Re-register the validator with the new consensus key
clawchaind tx staking create-validator \
    --pubkey "${NEW_PUBKEY}" \
    --amount 1000000uclaw \
    --moniker "<validator-moniker>" \
    --chain-id clawchain-local-1 \
    --commission-rate "0.10" \
    --commission-max-rate "0.20" \
    --commission-max-change-rate "0.01" \
    --min-self-delegation "1" \
    --from <operator-key> \
    --home ~/.clawchain \
    --gas auto \
    --gas-adjustment 1.5 \
    --yes
```

### Step 6: Restart the validator with the new key

```bash
sudo systemctl start clawchaind

# Wait for the node to start signing
sleep 10
clawchaind status --home ~/.clawchain 2>&1 | jq '.validator_info'
```

### Step 7: Verify the rotation

```bash
# Confirm the validator is signing with the new key
clawchaind query staking validator <validator-operator-address> --home ~/.clawchain | grep consensus_pubkey

# Confirm block production is progressing
clawchaind status --home ~/.clawchain 2>&1 | jq '.sync_info.latest_block_height'

# Wait 2 minutes and check height again to confirm active signing
sleep 120
clawchaind status --home ~/.clawchain 2>&1 | jq '.sync_info.latest_block_height'
```

### Step 8: Securely back up the new key

```bash
# Encrypt and store the new key offline
BACKUP_DIR="/secure/offline/clawchain-keys"
mkdir -p "${BACKUP_DIR}"
cp ~/.clawchain/config/priv_validator_key.json "${BACKUP_DIR}/priv_validator_key.json"
chmod 600 "${BACKUP_DIR}/priv_validator_key.json"

# Optionally encrypt with GPG
gpg --symmetric --cipher-algo AES256 "${BACKUP_DIR}/priv_validator_key.json"
rm "${BACKUP_DIR}/priv_validator_key.json"

echo "New validator key backed up and encrypted."
```

---

## Node Key Rotation

Node key rotation replaces the P2P identity key (`node_key.json`). This changes the node's peer ID on the network. Perform this when the node key is compromised or when the node identity should change.

### Step 1: Stop the node

```bash
sudo systemctl stop clawchaind
```

### Step 2: Archive the current node key

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE_DIR="$HOME/.clawchain/key-archive/${TIMESTAMP}"
mkdir -p "${ARCHIVE_DIR}"

cp ~/.clawchain/config/node_key.json "${ARCHIVE_DIR}/node_key.json.old"
chmod 600 "${ARCHIVE_DIR}/node_key.json.old"

echo "Archived old node key to ${ARCHIVE_DIR}"
```

### Step 3: Generate a new node key

```bash
# Generate a new node key using a temporary init
TMPDIR=$(mktemp -d)
clawchaind init node-key-rotation-temp --chain-id clawchain-local-1 --home "${TMPDIR}"

# Copy the new node key into place
cp "${TMPDIR}/config/node_key.json" ~/.clawchain/config/node_key.json
chmod 600 ~/.clawchain/config/node_key.json

# Clean up
rm -rf "${TMPDIR}"

echo "New node key installed."
```

### Step 4: Record the new node ID

```bash
# Display the new node ID (peers will need this to connect)
NEW_NODE_ID=$(clawchaind comet show-node-id --home ~/.clawchain)
echo "New node ID: ${NEW_NODE_ID}"
```

### Step 5: Update peer configuration

```bash
# If this node is listed as a persistent peer or seed by other operators,
# communicate the new node ID. Update the network manifest if applicable.
echo "ACTION REQUIRED: Notify peers of new node ID: ${NEW_NODE_ID}"
echo "Update seeds/persistent_peers entries from old ID to ${NEW_NODE_ID}"
```

### Step 6: Restart the node

```bash
sudo systemctl start clawchaind

# Verify peer connections establish with the new identity
sleep 15
curl -s http://localhost:26657/net_info | jq '.result.n_peers'
```

### Step 7: Verify connectivity

```bash
# Confirm the node has reconnected to peers
clawchaind status --home ~/.clawchain 2>&1 | jq '.node_info.id'

# Verify from clawd
cd cmd/clawd && node ./dist/main.js doctor --json | jq '.checks[] | select(.name == "Peer connectivity")'
```

---

## Wallet Key Backup and Recovery

### Backup: Export wallet key

```bash
# List all keys in the local keyring
clawchaind keys list --home ~/.clawchain --keyring-backend file

# Export a specific key (encrypted with a passphrase)
clawchaind keys export <key-name> --home ~/.clawchain --keyring-backend file \
    > /secure/offline/clawchain-keys/<key-name>.armor

# Alternatively, export the mnemonic (SENSITIVE -- handle with extreme care)
# Only do this on an air-gapped machine
clawchaind keys mnemonic --home ~/.clawchain --keyring-backend file
```

### Backup: Verify the export

```bash
# Confirm the exported file is non-empty and contains armor headers
head -1 /secure/offline/clawchain-keys/<key-name>.armor
# Expected: -----BEGIN TENDERMINT PRIVATE KEY-----

# Verify file size is reasonable (typical: 300-500 bytes)
wc -c < /secure/offline/clawchain-keys/<key-name>.armor
```

### Recovery: Import wallet key from armor export

```bash
# Import the key on the recovery machine
clawchaind keys import <key-name> /secure/offline/clawchain-keys/<key-name>.armor \
    --home ~/.clawchain --keyring-backend file

# Verify the imported key address matches the original
clawchaind keys show <key-name> --address --home ~/.clawchain --keyring-backend file
```

### Recovery: Restore wallet from mnemonic

```bash
# Recover the key from mnemonic phrase (24 words)
clawchaind keys add <key-name> --recover \
    --home ~/.clawchain --keyring-backend file
# You will be prompted to enter the mnemonic phrase

# Verify the recovered address matches the expected address
clawchaind keys show <key-name> --address --home ~/.clawchain --keyring-backend file
```

### Post-Recovery Verification

```bash
# Confirm the wallet can query its own balance
ADDR=$(clawchaind keys show <key-name> --address --home ~/.clawchain --keyring-backend file)
clawchaind query bank balances "${ADDR}" --home ~/.clawchain

# Confirm the wallet can sign a test transaction (use a small amount)
clawchaind tx bank send <key-name> "${ADDR}" 1uclaw \
    --chain-id clawchain-local-1 \
    --home ~/.clawchain \
    --keyring-backend file \
    --gas auto \
    --gas-adjustment 1.5 \
    --dry-run
```

---

## Validator Failover Procedure

Validator failover promotes a standby (sentry/backup) node to active validator duty. This is used when the primary validator host is unreachable, experiencing hardware failure, or requires extended maintenance.

### Prerequisites

- A standby node that is fully synced and running the same binary version.
- The standby node does NOT have `priv_validator_key.json` installed (to prevent double-sign).
- A secure, encrypted backup of `priv_validator_key.json` accessible from the standby host.

### Step 1: Confirm primary is unreachable

```bash
# From an operator workstation, confirm the primary is down
ssh <primary-host> "clawchaind status --home ~/.clawchain" 2>&1 || echo "PRIMARY UNREACHABLE"

# Verify from RPC
curl -s --connect-timeout 5 http://<primary-host>:26657/status || echo "PRIMARY RPC DOWN"
```

### Step 2: Stop the primary (if reachable)

```bash
# CRITICAL: The primary MUST NOT be signing blocks when the standby starts signing.
# If the primary is reachable, stop it immediately.
ssh <primary-host> "sudo systemctl stop clawchaind" 2>/dev/null || echo "Could not reach primary to stop it"

# If the primary is not reachable, confirm it has been down for at least 2 minutes
# before proceeding. This reduces double-sign risk.
echo "WARNING: If primary status is unknown, wait at least 2 minutes before proceeding."
echo "Double-signing results in slashing and jailing."
```

### Step 3: Verify the standby node is synced

```bash
# On the standby host
ssh <standby-host> "clawchaind status --home ~/.clawchain 2>&1 | jq '.sync_info'"

# Confirm:
# - catching_up: false
# - latest_block_height is recent (within a few blocks of network tip)
```

### Step 4: Install the validator key on the standby

```bash
# Securely copy the validator key to the standby host
# Option A: From encrypted offline backup
scp /secure/offline/clawchain-keys/priv_validator_key.json.gpg <standby-host>:/tmp/
ssh <standby-host> "gpg --decrypt /tmp/priv_validator_key.json.gpg > ~/.clawchain/config/priv_validator_key.json && chmod 600 ~/.clawchain/config/priv_validator_key.json && rm /tmp/priv_validator_key.json.gpg"

# Option B: Direct copy from operator workstation
scp ~/.clawchain/config/priv_validator_key.json <standby-host>:~/.clawchain/config/priv_validator_key.json
ssh <standby-host> "chmod 600 ~/.clawchain/config/priv_validator_key.json"
```

### Step 5: Reset validator state on standby

```bash
# Reset the signing state to prevent conflicts with the primary's last signed block.
# The node will refuse to sign any block at or below the height it last signed.
# Since this is a fresh promotion, start from height 0 so the node signs the next block.
ssh <standby-host> 'echo '"'"'{"height":"0","round":0,"step":0}'"'"' > ~/.clawchain/data/priv_validator_state.json'
```

### Step 6: Restart the standby as the active validator

```bash
# Restart the node so it picks up the validator key
ssh <standby-host> "sudo systemctl restart clawchaind"

# Monitor for signing activity
ssh <standby-host> "journalctl -u clawchaind -f --no-pager" &
JOURNAL_PID=$!

# Wait 30 seconds and check for block signing
sleep 30
kill "${JOURNAL_PID}" 2>/dev/null || true
```

### Step 7: Verify failover success

```bash
# Confirm the standby is now signing blocks
ssh <standby-host> "clawchaind status --home ~/.clawchain 2>&1 | jq '.validator_info'"

# Confirm the validator is not jailed
clawchaind query staking validator <validator-operator-address> --home ~/.clawchain | grep jailed
# Must show: jailed: false

# Run full doctor check on standby
ssh <standby-host> "cd cmd/clawd && node ./dist/main.js doctor --json" | jq '.checks'
```

### Step 8: Decommission the primary validator key

```bash
# Once failover is confirmed, remove the validator key from the primary
# to prevent accidental dual-signing if the primary comes back online
ssh <primary-host> "rm -f ~/.clawchain/config/priv_validator_key.json" 2>/dev/null || true
ssh <primary-host> 'echo '"'"'{"height":"0","round":0,"step":0}'"'"' > ~/.clawchain/data/priv_validator_state.json' 2>/dev/null || true

echo "Primary decommissioned. Standby is now the active validator."
```

---

## Post-Rotation Verification

Run this checklist after completing any rotation or failover procedure. All items must pass.

```
[ ] 1. Validator is signing blocks
      clawchaind status --home ~/.clawchain 2>&1 | jq '.validator_info'
      # validator_info.voting_power must be > 0

[ ] 2. Validator is not jailed
      clawchaind query staking validator <validator-operator-address> --home ~/.clawchain | grep jailed
      # Must show: jailed: false

[ ] 3. Block height is advancing
      HEIGHT1=$(clawchaind status --home ~/.clawchain 2>&1 | jq -r '.sync_info.latest_block_height')
      sleep 15
      HEIGHT2=$(clawchaind status --home ~/.clawchain 2>&1 | jq -r '.sync_info.latest_block_height')
      echo "Height advanced from ${HEIGHT1} to ${HEIGHT2}"
      # HEIGHT2 must be > HEIGHT1

[ ] 4. Peer connectivity is healthy
      curl -s http://localhost:26657/net_info | jq '.result.n_peers'
      # Must be > 0

[ ] 5. clawd doctor passes
      cd cmd/clawd && node ./dist/main.js doctor --json | jq '.ok'
      # Must show: true

[ ] 6. New key backup exists in offline storage
      ls -la /secure/offline/clawchain-keys/
      # Must contain current priv_validator_key.json (or .gpg encrypted version)

[ ] 7. Old key has been archived (not deleted)
      ls -la ~/.clawchain/key-archive/
      # Must contain timestamped archive of previous key

[ ] 8. Agent heartbeat is active (if running as agent)
      clawchaind query agent agent-liveness <agent-address> --home ~/.clawchain
      # last_heartbeat must be within the expected interval

[ ] 9. Create a post-rotation backup
      ./scripts/backup-state.sh
      ./scripts/verify-backup-restore.sh
      # Both must complete successfully
```
