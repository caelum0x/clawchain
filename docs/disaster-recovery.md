# Disaster Recovery Plan

**Phase 13 Track B -- ClawChain Operational Resilience**

This document defines the disaster recovery (DR) procedures for ClawChain operators. It covers backup strategies, recovery objectives, incident response flows, and module-specific considerations.

---

## Table of Contents

1. [Recovery Objectives](#recovery-objectives)
2. [State Snapshot Procedures](#state-snapshot-procedures)
3. [Validator Key Backup Guidance](#validator-key-backup-guidance)
4. [Regular Backup Schedule](#regular-backup-schedule)
5. [Chain Halt Recovery](#chain-halt-recovery)
6. [State Corruption Recovery](#state-corruption-recovery)
7. [Validator Key Compromise Response](#validator-key-compromise-response)
8. [Double-Sign Incident Response](#double-sign-incident-response)
9. [Module-Specific Recovery Notes](#module-specific-recovery-notes)
10. [Rollback Procedures](#rollback-procedures)

---

## Recovery Objectives

### Recovery Time Objective (RTO)

| Scenario | Target RTO | Notes |
| --- | --- | --- |
| Single-node restart (clean) | < 5 min | Binary restart, no state repair |
| Single-node recovery from snapshot | < 30 min | Restore data dir + replay or import genesis |
| Multi-validator coordinated restart | < 2 hr | Requires 2/3+ validator coordination |
| Full chain recovery from genesis export | < 4 hr | Genesis import + catch-up sync |

### Recovery Point Objective (RPO)

| Strategy | RPO |
| --- | --- |
| Running node (normal) | Last committed block (zero data loss) |
| Periodic state export backup | Time since last backup (see schedule below) |
| Continuous data-dir rsync | Seconds behind tip (risk of inconsistent mid-block state) |

The target RPO is **last committed block**. Operators should configure backups frequently enough that the gap between the last backup and a failure is acceptable for their deployment.

---

## State Snapshot Procedures

### Method 1: Genesis State Export (portable, cross-version)

Export the current application state as a genesis JSON file. This is the most portable format and survives binary upgrades.

```bash
# Stop the node first to ensure a consistent snapshot
sudo systemctl stop clawchaind

# Export genesis state
clawchaind export --home ~/.clawchain > genesis-export-$(date +%Y%m%d-%H%M%S).json
```

To restore from a genesis export, see [State Corruption Recovery](#state-corruption-recovery).

### Method 2: Data Directory Backup (fast, same-version only)

Copy the entire data directory for a byte-level backup. This is faster to restore but is only compatible with the same binary version.

```bash
# Stop the node first
sudo systemctl stop clawchaind

# Archive the data directory
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
tar czf clawchain-data-backup-${TIMESTAMP}.tar.gz \
    -C ~/.clawchain \
    data/ \
    config/priv_validator_key.json \
    config/node_key.json \
    data/priv_validator_state.json
```

### Method 3: Automated Backup Script

Use the provided backup script for a standardized backup workflow:

```bash
# From the repository root
make backup

# Or invoke directly
./scripts/backup-state.sh
```

See `scripts/backup-state.sh` for details.

---

## Validator Key Backup Guidance

### Critical Files

| File | Location | Purpose | Sensitivity |
| --- | --- | --- | --- |
| `priv_validator_key.json` | `~/.clawchain/config/` | Consensus signing key | CRITICAL -- loss means validator cannot sign; compromise means double-sign risk |
| `node_key.json` | `~/.clawchain/config/` | P2P identity key | HIGH -- loss means new peer ID; compromise means impersonation risk |
| `priv_validator_state.json` | `~/.clawchain/data/` | Last signed block height/round/step | CRITICAL -- stale copy causes double-sign on restore |

### Backup Recommendations

1. **priv_validator_key.json**: Back up once at creation time. Store encrypted in an offline location (hardware security module, air-gapped USB, or encrypted cloud vault). This file does not change.

2. **node_key.json**: Back up once at creation time. Less sensitive than the validator key, but still store securely to maintain peer identity across restores.

3. **priv_validator_state.json**: Back up with every state snapshot. This file changes on every signed block. **Never restore a stale copy** -- doing so risks double-signing if the validator has already signed a more recent block on another node.

### Key Backup Procedure

```bash
# Encrypt and store validator keys offline
BACKUP_DIR="/secure/offline/clawchain-keys"
mkdir -p "${BACKUP_DIR}"

# Copy with restrictive permissions
cp ~/.clawchain/config/priv_validator_key.json "${BACKUP_DIR}/"
cp ~/.clawchain/config/node_key.json "${BACKUP_DIR}/"
chmod 600 "${BACKUP_DIR}"/*.json

# Optionally encrypt with GPG
gpg --symmetric --cipher-algo AES256 "${BACKUP_DIR}/priv_validator_key.json"
gpg --symmetric --cipher-algo AES256 "${BACKUP_DIR}/node_key.json"
rm "${BACKUP_DIR}/priv_validator_key.json" "${BACKUP_DIR}/node_key.json"
```

### Double-Sign Prevention on Restore

Before restoring a validator node:

1. Confirm the validator is **not running** on any other machine.
2. Verify `priv_validator_state.json` reflects the most recent signing state.
3. If in doubt, skip restoring `priv_validator_state.json` and let the node catch up from a non-signing state, then manually re-enable signing once the node is synced.

---

## Regular Backup Schedule

### Recommended Schedule

| Backup Type | Frequency | Retention | Automation |
| --- | --- | --- | --- |
| Genesis state export | Daily | 7 days rolling | Cron + `make backup` |
| Data directory snapshot | Every 6 hours | 48 hours rolling | Cron + filesystem snapshot |
| Validator key backup | Once (at creation) | Permanent (offline) | Manual |
| Validator state backup | With every data snapshot | Match data retention | Included in data snapshot |

### Sample Cron Entry

```cron
# Daily genesis export at 02:00 UTC
0 2 * * * cd /path/to/new-blokchain && ./scripts/backup-state.sh >> /var/log/clawchain-backup.log 2>&1

# Rotate backups older than 7 days
0 3 * * * find /var/backups/clawchain -name "clawchain-backup-*.tar.gz" -mtime +7 -delete
```

---

## Chain Halt Recovery

A chain halt occurs when fewer than 2/3 of validators are online or when a consensus bug causes all nodes to stop at the same height.

### Diagnosis

```bash
# Check if the node process is running
systemctl status clawchaind

# Check the last committed block height
clawchaind status --home ~/.clawchain 2>&1 | jq '.sync_info.latest_block_height'

# Review logs for panic or consensus errors
journalctl -u clawchaind --since "1 hour ago" --no-pager | tail -100
```

### Recovery Steps

1. **Identify the cause**: Check logs for panics, out-of-memory errors, disk-full conditions, or consensus failures (e.g., apphash mismatch).

2. **Coordinate with other validators**: Use the operator communication channel to confirm the halt height and cause. All validators must agree on the recovery strategy before proceeding.

3. **If the halt is due to a bug in the binary**:
   - Build/obtain the patched binary.
   - Replace the binary on all validator nodes.
   - Restart all validators within the coordinated window.

4. **If the halt is due to state divergence (apphash mismatch)**:
   - Identify which validators have the correct state.
   - Validators with incorrect state must restore from a known-good snapshot at the halt height.
   - Restart the network once 2/3+ validators agree on state.

5. **Restart procedure**:

```bash
# Restart the node
sudo systemctl restart clawchaind

# Monitor for consensus progress
journalctl -u clawchaind -f | grep -E "committed state|executed block"
```

6. **Verify recovery**:

```bash
# Confirm block production resumed
clawchaind status --home ~/.clawchain 2>&1 | jq '.sync_info'
```

---

## State Corruption Recovery

State corruption can occur from disk errors, improper shutdowns, or software bugs.

### Symptoms

- Node crashes with `panic: ... IAVL` or LevelDB/PebbleDB errors on startup.
- Apphash mismatch at a specific height.
- Missing or corrupted WAL files.

### Recovery from Data Directory Backup

```bash
# Stop the node
sudo systemctl stop clawchaind

# Remove corrupted data
rm -rf ~/.clawchain/data

# Restore from backup tarball
make restore BACKUP=/var/backups/clawchain/clawchain-backup-YYYYMMDD-HHMMSS.tar.gz

# Restart and let the node catch up
sudo systemctl start clawchaind
```

### Recovery from Genesis Export

Use this when no compatible data-directory backup is available, or after a binary upgrade.

```bash
# Stop the node
sudo systemctl stop clawchaind

# Reset all chain data (preserves config)
clawchaind comet unsafe-reset-all --home ~/.clawchain

# Replace genesis with the exported snapshot
cp genesis-export-YYYYMMDD-HHMMSS.json ~/.clawchain/config/genesis.json

# Restart -- the node will replay from genesis
sudo systemctl start clawchaind
```

**Warning**: `unsafe-reset-all` destroys all local chain data. Only use after confirming you have a valid backup or genesis export. See [Rollback Procedures](#rollback-procedures).

### Recovery Using the Restore Script

```bash
# Restore from tarball (data directory mode)
make restore BACKUP=/path/to/clawchain-backup-YYYYMMDD-HHMMSS.tar.gz

# Restore from genesis export
make restore BACKUP=/path/to/clawchain-backup-YYYYMMDD-HHMMSS.tar.gz GENESIS_RESTORE=1
```

---

## Validator Key Compromise Response

If a validator's `priv_validator_key.json` is suspected or confirmed compromised, act immediately.

### Immediate Actions (within minutes)

1. **Stop the compromised validator node immediately**:

```bash
sudo systemctl stop clawchaind
```

2. **Revoke the compromised key**: Submit an `unjail` transaction from the operator account (if the validator was jailed) and immediately rotate to a new key, or tombstone the validator.

3. **Notify the validator set**: Alert other validators and the operator channel that the key is compromised. Provide the validator address so they can monitor for rogue blocks.

4. **Generate a new validator key**:

```bash
# On a secure, clean machine
clawchaind init temp-node --chain-id clawchain-local-1 --home /tmp/new-validator
cp /tmp/new-validator/config/priv_validator_key.json ~/.clawchain/config/priv_validator_key.json

# Reset validator state to prevent double-sign with old key
echo '{"height":"0","round":0,"step":0}' > ~/.clawchain/data/priv_validator_state.json

rm -rf /tmp/new-validator
```

5. **Re-register the validator** with the new consensus pubkey:

```bash
clawchaind tx staking create-validator \
    --pubkey $(clawchaind comet show-validator --home ~/.clawchain) \
    --chain-id clawchain-local-1 \
    --from <operator-key> \
    --home ~/.clawchain
```

### Post-Incident

- Conduct a root-cause analysis of how the key was exposed.
- Review access controls on the validator machine.
- Consider migrating to a remote signer (e.g., Horcrux, TMKMS) for key isolation.
- Update the key backup in offline storage.

---

## Double-Sign Incident Response

A double-sign occurs when a validator signs two different blocks at the same height and round. This results in automatic jailing and slashing on Cosmos SDK chains.

### Causes

- Running two instances of the same validator simultaneously (most common).
- Restoring `priv_validator_state.json` from a stale backup.
- Clock skew combined with manual intervention.

### Detection

```bash
# Check if the validator is jailed
clawchaind query staking validator <validator-operator-address> --home ~/.clawchain | grep jailed

# Check slashing events
clawchaind query slashing signing-info <validator-consensus-pubkey> --home ~/.clawchain
```

### Response Steps

1. **Immediately stop all duplicate instances**. Identify every machine running the validator key and shut down all but one.

2. **Determine the correct signing state**: Compare `priv_validator_state.json` across all instances. The file with the highest `height` value is authoritative.

3. **Restore the correct state file**:

```bash
# On the single surviving instance
cat ~/.clawchain/data/priv_validator_state.json
# Confirm height matches or exceeds the double-sign height
```

4. **Wait for the jail period to expire** (if applicable), then unjail:

```bash
clawchaind tx slashing unjail \
    --from <operator-key> \
    --chain-id clawchain-local-1 \
    --home ~/.clawchain
```

5. **Post-incident review**:
   - Document the root cause (duplicate node, stale state restore, etc.).
   - Implement safeguards: run a single validator instance, use a remote signer, or add process-level locks.

---

## Module-Specific Recovery Notes

### x/privacy -- Merkle Tree and Nullifier Recovery

The privacy module maintains an append-only Merkle tree of shielded commitments and a nullifier set to prevent double-spending.

- **Merkle tree state**: Stored in the module's KV store. If state is corrupted, the tree must be rebuilt from genesis or a known-good snapshot. There is no way to reconstruct the tree from on-chain transactions alone without replaying from block 1.
- **Nullifier set**: Must remain consistent with the Merkle tree. A missing nullifier allows double-spend; an extra nullifier locks funds permanently.
- **View keys**: Registered view keys (`MsgRegisterViewKey`) are stored in state. Loss of view key registrations means users cannot decrypt their shielded balances through the chain query interface, though funds remain safe.
- **Recovery strategy**: Always prefer a data-directory restore over genesis replay for the privacy module, as genesis replay requires re-execution of all ZK proof verifications, which is computationally expensive.

```bash
# Verify privacy module state integrity after restore
clawchaind query privacy tree-stats --home ~/.clawchain
clawchaind query privacy root-history --home ~/.clawchain
```

### x/agent -- Agent Registry and Deposits

The agent module manages agent registrations, task lifecycle, and staked deposits.

- **Agent deposits**: Registered agents have bonded deposits. If state is lost, deposit balances in the bank module may become inconsistent with agent registration records.
- **Task state**: In-progress tasks (`AcceptTask`, `CompleteTask`) have lifecycle state. A restore to a point before task completion may cause tasks to appear incomplete. Agents and task delegators should verify task status after a restore.
- **Heartbeat/liveness**: Agent liveness records are ephemeral. After a restore, agents may appear offline until they send a new heartbeat.
- **Intent system**: Pending intents (`SubmitIntent`, `RespondIntent`, `FinalizeIntent`) may be lost or reverted. Participants should resubmit intents after a state restore if they are not confirmed on-chain.

```bash
# Verify agent module state after restore
clawchaind query agent params --home ~/.clawchain
clawchaind query agent live-agents --home ~/.clawchain
```

### x/reputation -- Score Consistency

- **Reputation scores**: Computed from on-chain events (task completions, SLA adherence). Scores are deterministic given the same event history, so a genesis replay will produce identical scores.
- **Decay state**: Reputation decay is applied at EndBlock. A restore to a mid-decay point is safe as long as the full block is replayed.

### x/marketplace -- Escrow and Listings

- **Escrow funds**: Active escrows lock funds in module accounts. A state restore must ensure the bank module balances and marketplace escrow records are consistent. Always restore both together (never restore marketplace state alone).
- **Listings**: Skill listings and dispute records are stored in the marketplace KV store. Loss of listing state requires re-registration by service providers.

### x/messaging -- Message Delivery

- **Message state**: Stored messages and acknowledgment records may be lost on restore. The messaging module is eventually consistent; senders should retry unacknowledged messages after a restore.
- **IBC channels**: If messaging uses IBC, channel state must be consistent with the counterparty chain. An IBC relayer restart may be required after a restore.

---

## Rollback Procedures

### When to Roll Back

- A botched upgrade produces incorrect state (apphash mismatch with supermajority).
- A module bug corrupts state at a known block height.
- A governance proposal has unintended consequences.

### Rollback to a Previous Block Height

**Note**: This is only possible if you have a data snapshot from before the problematic height.

```bash
# Stop the node
sudo systemctl stop clawchaind

# Remove current data
rm -rf ~/.clawchain/data

# Restore from a pre-problem snapshot
tar xzf clawchain-backup-before-problem.tar.gz -C ~/.clawchain/

# Restart
sudo systemctl start clawchaind
```

### `unsafe-reset-all` -- Last Resort

`comet unsafe-reset-all` deletes all chain data (blocks, state, WAL) but preserves configuration and keys. Use this only when:

- You have a valid genesis file to restart from.
- All other recovery methods have failed.
- The entire validator set is coordinating a fresh start from a genesis export.

```bash
# Confirm you have a backup before proceeding
ls -la /var/backups/clawchain/

# Reset all chain data
clawchaind comet unsafe-reset-all --home ~/.clawchain

# If restarting from a genesis export, replace genesis.json
cp genesis-export.json ~/.clawchain/config/genesis.json

# Restart
sudo systemctl start clawchaind
```

**Warnings**:
- This command is irreversible. All local block history is destroyed.
- `priv_validator_state.json` is reset to height 0. If you re-join an existing network (not a fresh genesis), you risk double-signing.
- Only use this if the entire validator set is restarting, or you are setting up a new node from scratch.

---

## Quick Reference: Recovery Decision Tree

```
Problem detected
    |
    +--> Node crashed, data intact?
    |       YES --> Restart the binary (systemctl restart clawchaind)
    |       NO  --> Continue below
    |
    +--> Data directory corrupted?
    |       YES --> Restore from data-dir backup (make restore BACKUP=...)
    |       NO  --> Continue below
    |
    +--> Apphash mismatch with network?
    |       YES --> Coordinate with validators, restore from known-good snapshot
    |       NO  --> Continue below
    |
    +--> Need to start from genesis export?
    |       YES --> unsafe-reset-all + import genesis (make restore BACKUP=... GENESIS_RESTORE=1)
    |       NO  --> Continue below
    |
    +--> Validator key compromised?
            YES --> Stop node, rotate key, re-register (see Key Compromise section)
            NO  --> Escalate to operator channel
```
