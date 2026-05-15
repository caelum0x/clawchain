# ClawChain Upgrade Guide

Phase 13 Track C -- Upgrade Handler Validation and Procedures

---

## Module ConsensusVersions

The following table lists the current ConsensusVersion for each ClawChain module.
ConsensusVersion is incremented on every consensus-breaking state change.

| Module        | ConsensusVersion | Last Migration Notes                          |
|---------------|:----------------:|-----------------------------------------------|
| `agent`       | 4                | v3 -> v4: deposit params, deregister msg      |
| `privacy`     | 1                | Initial version; merkle tree state             |
| `reputation`  | 3                | v2 -> v3: SLA coupling params                 |
| `marketplace` | 2                | v1 -> v2: escrow flow updates                 |
| `messaging`   | 2                | v1 -> v2: relay endpoint config                |
| `clawchain`   | 1                | Initial version (root module)                  |

---

## Upgrade Procedure

### Option A: Cosmovisor (Recommended)

Cosmovisor automates binary swaps at the upgrade height.

#### 1. Install Cosmovisor

```bash
go install cosmossdk.io/tools/cosmovisor/cmd/cosmovisor@latest
```

#### 2. Set Up Directory Structure

```bash
export DAEMON_NAME=clawchaind
export DAEMON_HOME=$HOME/.clawchain

# Create the upgrade directory
mkdir -p $DAEMON_HOME/cosmovisor/upgrades/<upgrade-name>/bin

# Place the new binary
cp /path/to/new/clawchaind $DAEMON_HOME/cosmovisor/upgrades/<upgrade-name>/bin/clawchaind
```

#### 3. Configure Cosmovisor

```bash
export DAEMON_NAME=clawchaind
export DAEMON_HOME=$HOME/.clawchain
export DAEMON_ALLOW_DOWNLOAD_BINARIES=false
export DAEMON_RESTART_AFTER_UPGRADE=true
export DAEMON_LOG_BUFFER_SIZE=512
export UNSAFE_SKIP_BACKUP=false   # Keep backups enabled
```

#### 4. Start with Cosmovisor

```bash
cosmovisor run start
```

Cosmovisor will automatically swap to the new binary at the upgrade height
specified in the on-chain upgrade proposal.

### Option B: Manual Upgrade

For validators who prefer manual control:

#### 1. Stop the Node at Upgrade Height

Monitor the chain for the upgrade halt:

```bash
# The node will halt automatically at the upgrade height
# Watch logs for: "UPGRADE "<upgrade-name>" NEEDED at height: <height>"
```

#### 2. Swap the Binary

```bash
# Stop the node (if not already halted)
systemctl stop clawchaind

# Replace the binary
cp /path/to/new/clawchaind $(which clawchaind)

# Verify binary version
clawchaind version
```

#### 3. Restart the Node

```bash
systemctl start clawchaind

# Monitor logs
journalctl -u clawchaind -f
```

---

## Pre-Upgrade Checklist

Complete every item before proceeding with the upgrade.

### Backup State

- [ ] **Full data directory backup**
  ```bash
  # Stop the node first
  systemctl stop clawchaind
  tar czf clawchain-backup-$(date +%Y%m%d-%H%M%S).tar.gz $HOME/.clawchain/data
  ```

- [ ] **Export genesis state** (for extra safety)
  ```bash
  clawchaind export --height <pre-upgrade-height> > pre-upgrade-genesis.json
  ```

- [ ] **Back up validator key**
  ```bash
  cp $HOME/.clawchain/config/priv_validator_key.json ./priv_validator_key.json.bak
  cp $HOME/.clawchain/data/priv_validator_state.json ./priv_validator_state.json.bak
  ```

### Verify Binary Compatibility

- [ ] **Download or build the new binary**
  ```bash
  git checkout <release-tag>
  make install
  clawchaind version --long
  ```

- [ ] **Verify the binary hash** against the published release checksums
  ```bash
  sha256sum $(which clawchaind)
  ```

- [ ] **Run the upgrade validation script**
  ```bash
  make validate-upgrade
  # Or directly:
  ./scripts/validate-upgrade.sh --height <pre-upgrade-height>
  ```

- [ ] **Confirm Go version compatibility** (check go.mod for required version)

- [ ] **Review release notes** for any manual migration steps

### Infrastructure Checks

- [ ] **Sufficient disk space** for state migration (at least 2x current data size recommended)
- [ ] **Monitoring and alerting** configured for the upgrade window
- [ ] **Communication channel** with other validators established

---

## Post-Upgrade Verification Steps

After the upgrade, verify the chain is operating correctly:

### 1. Node Health

```bash
# Check node status
clawchaind status

# Verify the node is syncing/producing blocks
clawchaind status | jq '.sync_info.catching_up'
# Should be: false

# Check latest block height is advancing
clawchaind status | jq '.sync_info.latest_block_height'
```

### 2. Module Versions

```bash
# Query module versions from state
clawchaind query upgrade module_versions

# Expected output should match the ConsensusVersions table above
```

### 3. Module-Specific Checks

```bash
# Agent module: verify params include deposit settings
clawchaind query agent params

# Privacy module: verify merkle tree root is preserved
clawchaind query privacy tree-stats

# Reputation module: verify SLA coupling params are present
clawchaind query reputation params
```

### 4. Transaction Tests

```bash
# Send a test transaction to verify tx processing
clawchaind tx bank send <from> <to> 1uclaw --chain-id clawchain-1 --yes

# Register a test agent to verify agent module
clawchaind tx agent register-agent --name "upgrade-test" --from <key> --yes
```

### 5. Peer Connectivity

```bash
# Check peer count
clawchaind status | jq '.node_info.network'
curl -s localhost:26657/net_info | jq '.result.n_peers'
```

### 6. Run Validation Script

```bash
make validate-upgrade
```

---

## Rollback Procedure

If the upgrade fails and the chain cannot produce blocks:

### Scenario 1: Immediate Rollback (Before State Migration)

If the new binary panics on startup before modifying state:

```bash
# Stop the node
systemctl stop clawchaind

# Restore the old binary
cp /path/to/old/clawchaind $(which clawchaind)

# Restart with the old binary
systemctl start clawchaind
```

### Scenario 2: State Restore from Backup

If state has been modified by the migration:

```bash
# Stop the node
systemctl stop clawchaind

# Remove current data
rm -rf $HOME/.clawchain/data

# Restore from backup
tar xzf clawchain-backup-<timestamp>.tar.gz -C $HOME/.clawchain/

# Restore validator state
cp ./priv_validator_state.json.bak $HOME/.clawchain/data/priv_validator_state.json

# Restore old binary
cp /path/to/old/clawchaind $(which clawchaind)

# Restart
systemctl start clawchaind
```

### Scenario 3: Genesis Export Rollback

If backups are unavailable, reconstruct from the pre-upgrade genesis export:

```bash
# Stop the node
systemctl stop clawchaind

# Reset the node (preserves keys)
clawchaind tendermint unsafe-reset-all

# Copy the pre-upgrade genesis
cp pre-upgrade-genesis.json $HOME/.clawchain/config/genesis.json

# Restore old binary and restart
cp /path/to/old/clawchaind $(which clawchaind)
systemctl start clawchaind
```

**Important:** Genesis export rollback requires coordination among all validators.
The chain will re-process blocks from the export height.

---

## Module Migration Notes

### agent: v3 -> v4

**Changes:**
- Added `min_deposit` and `max_deposit` parameters to module params
- Added `MsgDeregisterAgent` message type for clean agent removal
- Agent records now include `deposit_amount` field
- EndBlocker updated to handle deposit refunds on deregistration

**Migration behavior:**
- Existing agent records are migrated to include a zero deposit amount
- New deposit params are set to module defaults
- No manual intervention required

**Validation:**
```bash
clawchaind query agent params
# Verify min_deposit and max_deposit fields are present
```

### privacy: Merkle Tree State Preservation

**Changes:**
- Merkle tree state (roots, commitments, nullifiers) must be preserved across upgrades
- Root history is maintained for proof verification of pre-upgrade transactions
- Commitment index continuity is critical

**Migration behavior:**
- No structural changes to privacy state in current version (v1)
- Future upgrades must ensure merkle tree roots are carried forward
- Nullifier set must remain complete to prevent double-spend

**Validation:**
```bash
# Verify tree stats are consistent
clawchaind query privacy tree-stats

# Verify root history is preserved
clawchaind query privacy root-history
```

### reputation: v2 -> v3 SLA Coupling Params

**Changes:**
- Added SLA (Service Level Agreement) coupling parameters
- Reputation scores now factor in task completion timeliness
- New params: `sla_penalty_weight`, `sla_grace_period`, `sla_evaluation_window`
- Reputation decay adjusted to account for SLA compliance

**Migration behavior:**
- New SLA params are initialized with defaults
- Existing reputation scores are preserved
- SLA evaluation begins from first block post-upgrade

**Validation:**
```bash
clawchaind query reputation params
# Verify sla_penalty_weight, sla_grace_period, sla_evaluation_window fields
```

---

## Coordinated Upgrade Timing for Multi-Validator Networks

### Upgrade Proposal Flow

1. **Submit upgrade proposal**
   ```bash
   clawchaind tx gov submit-proposal software-upgrade <upgrade-name> \
     --title "ClawChain <version> Upgrade" \
     --description "Upgrade to <version> with <summary>" \
     --upgrade-height <target-height> \
     --deposit 10000000uclaw \
     --from <proposer> \
     --chain-id clawchain-1
   ```

2. **Voting period** -- all validators vote on the proposal
   ```bash
   clawchaind tx gov vote <proposal-id> yes --from <validator> --chain-id clawchain-1
   ```

3. **At the upgrade height** -- all nodes halt automatically

4. **Binary swap** -- all validators swap to the new binary (cosmovisor or manual)

5. **Chain resumes** -- once 2/3+ voting power restarts with the new binary

### Timing Guidelines

| Network Size   | Recommended Window | Communication Lead Time |
|----------------|-------------------|------------------------|
| 4 validators   | 30 minutes        | 24 hours               |
| 10 validators  | 1 hour            | 48 hours               |
| 50+ validators | 2 hours           | 1 week                 |

### Communication Checklist

- [ ] Announce upgrade proposal with exact height and estimated time
- [ ] Share new binary hash and download links
- [ ] Confirm all validators have the new binary ready
- [ ] Agree on communication channel for real-time coordination
- [ ] Designate a coordinator to confirm validator readiness
- [ ] Set a deadline for "go/no-go" decision before upgrade height

### Handling Stragglers

If some validators are slow to upgrade:

- The chain will not produce blocks until 2/3+ voting power is online
- Stragglers have until the next block timeout to join
- If a validator misses the upgrade window, they can still join later by:
  1. Installing the new binary
  2. Restarting their node (state migration will run on first start)

---

## Emergency Upgrade Procedures

For critical security patches that cannot wait for the standard governance flow.

### Emergency Binary Patch

When a vulnerability requires an immediate out-of-band binary swap:

1. **Coordinate out-of-band** via secure communication channel
2. **All validators halt simultaneously**
   ```bash
   systemctl stop clawchaind
   ```
3. **Swap binary on all nodes**
   ```bash
   cp /path/to/patched/clawchaind $(which clawchaind)
   clawchaind version  # verify
   ```
4. **Restart in agreed-upon order**
   - Largest validators first to reach 2/3+ quorum quickly
   ```bash
   systemctl start clawchaind
   ```

### Emergency State Halt

If the chain is producing invalid state:

1. **Identify the problematic block height**
2. **Coordinate a halt at a safe height**
   ```bash
   # Set halt height in app.toml
   halt-height = <safe-height>
   ```
3. **Export state at the safe height**
   ```bash
   clawchaind export --height <safe-height> > emergency-export.json
   ```
4. **Apply fix and re-genesis if needed**
   ```bash
   # Modify genesis if state correction is required
   # Redistribute to all validators
   # Restart with corrected state
   ```

### Emergency Contacts and Escalation

Maintain an up-to-date contact list for emergency coordination:

- Primary coordinator: `<to be designated>`
- Backup coordinator: `<to be designated>`
- Communication channels: Discord, Telegram, or Signal group
- Escalation path: coordinator -> core devs -> all validators

---

## Appendix: Upgrade Validation Script

The `scripts/validate-upgrade.sh` script automates pre-upgrade checks:

```bash
# Run all validations
make validate-upgrade

# Run with specific height
./scripts/validate-upgrade.sh --height 12345

# Run with custom binary path
./scripts/validate-upgrade.sh --binary /usr/local/bin/clawchaind

# Run with custom chain ID
./scripts/validate-upgrade.sh --chain-id clawchain-testnet-1
```

The script performs:
1. State export and JSON validation
2. Module section completeness check
3. ConsensusVersion verification against source code
4. Genesis validity check via `clawchaind validate-genesis`
5. Upgrade simulation (re-init from exported genesis in temp directory)
6. Migration handler inventory
7. Summary report with pass/fail/warn counts
