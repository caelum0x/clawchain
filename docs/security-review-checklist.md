# ClawChain Security Review Checklist -- Phase 12 Track E

> Last updated: 2026-02-26
>
> All items must be completed and signed off before mainnet launch.
> Use `[x]` to mark completed items. Each section requires at least one reviewer sign-off.

---

## 1. Code Review

### 1.1 Agent Module (`x/agent/`)

- [ ] Review `msg_server_register_agent.go` -- validate deposit lock path, address validation, duplicate-agent check
- [ ] Review `msg_server_agent_action.go` -- confirm rate-limit enforcement (`AgentActionRateLimitKey`), payload size check
- [ ] Review `msg_server_agent_heartbeat.go` -- verify heartbeat interval enforcement, reactivation logic
- [ ] Review `msg_server_submit_intent.go` / `msg_server_respond_intent.go` / `msg_server_finalize_intent.go` -- validate intent lifecycle state machine, self-response block, creator-only finalization
- [ ] Review `msg_server_delegate_task.go` / `msg_server_accept_task.go` / `msg_server_complete_task.go` -- verify task state transitions, budget validation, assignee-only checks, self-delegation block
- [ ] Review `endblock.go` -- confirm heartbeat staleness deactivation logic, no panics on missing agents
- [ ] Review `reputation_adapter.go` -- verify `SlashAgentDeposit()` arithmetic (no overflow/underflow on `deposit * bps / 10000`), `WalkCompletedTaskSLAEvents()` correctness
- [ ] Review `policy.go` -- validate all default constants are reasonable for mainnet
- [ ] Review `stats.go` -- confirm aggregate stat updates are deterministic and cannot cause consensus divergence
- [ ] Confirm all error codes in `types/errors.go` are unique and non-overlapping with other modules

### 1.2 Privacy Module (`x/privacy/`)

- [ ] Review `msg_server_shield.go` -- validate coin transfer to module account, commitment computation, Merkle tree insertion
- [ ] Review `msg_server_unshield.go` -- validate proof verification, nullifier consumption, coin release from module account
- [ ] Review `msg_server_private_transfer.go` -- verify proof deserialization, public witness construction, nullifier checks, new commitment insertion
- [ ] Review `msg_server_batch_private_transfer.go` -- confirm batch logic does not skip individual proof verification
- [ ] Review `msg_server_register_view_key.go` -- validate view key proof verification, commitment ownership check
- [ ] Review `state_machine.go` / `keeper.go` -- verify Merkle tree state consistency, `insertLeafAndUpdateTree()` correctness, `computeRootFromState()` accuracy
- [ ] Review `query_nullifier_exists.go` -- confirm read-only, no state mutation
- [ ] Review `query_merkle_proof.go` -- verify proof path computation matches circuit expectations
- [ ] Review `query_root_history.go` -- confirm root history is append-only and bounded
- [ ] Review `ibc_shield.go` -- validate `ShieldForAccount()` amount parsing, denom handling, event emission
- [ ] Confirm deterministic blinding in `msg_server_shield.go` is documented as development-only and not used by production clients

### 1.3 Privacy IBC Middleware (`x/privacy/ibc/`)

- [ ] Review `middleware.go` -- verify `OnRecvPacket()` fail-open behavior is acceptable for mainnet
- [ ] Review `types.go` -- validate `ParsePrivacyMetadata()` memo parsing against injection attacks
- [ ] Confirm channel/port validation does not allow arbitrary source chains to trigger auto-shield
- [ ] Verify amount overflow handling in `strconv.ParseUint(data.Amount, 10, 64)`

### 1.4 Reputation Module (`x/reputation/`)

- [ ] Review `msg_server.go` -- validate `RateAgent` (self-rating block, purchase-gate, score range 1-5, comment length cap 280)
- [ ] Review `msg_server.go` -- validate `EndorseAgent` (self-endorsement block, registered-agent check)
- [ ] Review reputation aggregate computation (`AvgRatingBps` calculation) for rounding correctness
- [ ] Review heartbeat/SLA integration (`HeartbeatStaleStateKey`, `TaskSLACursorKey`) for cross-module consistency
- [ ] Confirm no unbounded iteration in `query_top_agents.go`

### 1.5 Marketplace Module (`x/marketplace/`)

- [ ] Review `msg_server_list_skill.go` / `msg_server_update_skill.go` / `msg_server_delist_skill.go` -- validate ownership checks, versioning logic
- [ ] Review `msg_server_purchase_skill.go` -- verify fund transfer, `ErrSelfPurchase` check, `ErrInsufficientFunds` handling
- [ ] Review `msg_server_create_escrow.go` -- validate fund lock, deadline/milestone validation, party authorization
- [ ] Review `msg_server_complete_escrow.go` / `msg_server_complete_milestone.go` -- verify payout arithmetic in `escrow_funds.go` (integer division, remainder handling on final milestone)
- [ ] Review `msg_server_dispute_escrow.go` / `msg_server_resolve_dispute.go` -- validate dispute state machine, governance resolution path
- [ ] Review `escrow_expire.go` -- confirm EndBlock expiration logic, refund path
- [ ] Review `reputation_adapter.go` -- verify purchase-check interface is correct

### 1.6 Messaging Module (`x/messaging/`)

- [ ] Review `msg_server_send_message.go` -- validate self-message block, ciphertext/nonce non-empty checks, `MaxMessageSize` enforcement
- [ ] Review `msg_server_ack_message.go` -- validate recipient-only ack check, `ErrAlreadyAcked` prevention
- [ ] Confirm message storage does not leak metadata beyond sender/recipient/block
- [ ] Verify nonce uniqueness enforcement does not have state-growth issues

---

## 2. Cryptographic Review

### 2.1 ZK Circuits (`x/privacy/circuit/`)

- [ ] Audit `TransferCircuit.Define()` -- confirm all five constraints are sound: balance conservation, commitment validity, nullifier derivation, Merkle inclusion, new commitment validity
- [ ] Audit `UnshieldCircuit.Define()` -- confirm commitment ownership, nullifier derivation, and Merkle inclusion constraints
- [ ] Audit `ViewKeyCircuit.Define()` -- confirm selective disclosure proof is sound
- [ ] Verify 64-bit range proofs (`api.ToBinary(amount, 64)`) prevent negative amounts and overflow
- [ ] Verify MiMC hash usage over BN254 scalar field -- confirm no known algebraic attacks apply
- [ ] Confirm Merkle tree depth (32) provides sufficient capacity (2^32 = ~4 billion commitments)
- [ ] Review gnark library version for known vulnerabilities
- [ ] Verify no private inputs are leaked through public witness construction in `msg_server_private_transfer.go`

### 2.2 Key Derivation and Encryption

- [ ] Audit ECIES encryption in `clawd` CLI for agent-to-agent messaging -- confirm curve choice, KDF, MAC
- [ ] Verify key derivation does not reuse nonces or exhibit related-key weaknesses
- [ ] Confirm no hardcoded secrets, test keys, or seed phrases in the codebase
- [ ] Verify random number generation uses `crypto/rand` (not `math/rand`) for all security-critical paths

### 2.3 Trusted Setup

- [ ] Document trusted setup ceremony plan for `TransferCircuit`, `UnshieldCircuit`, and `ViewKeyCircuit`
- [ ] Verify `groth16.Setup()` is replaced with MPC-based ceremony output before mainnet
- [ ] Define toxic-waste destruction protocol
- [ ] Specify minimum number of ceremony participants (recommend >= 10)
- [ ] Plan for ceremony transcript publication and independent verification

---

## 3. Economic Review

### 3.1 Deposit Mechanics

- [ ] Verify `MinAgentDepositUclaw` (1 CLAW) is economically meaningful relative to expected mainnet token value
- [ ] Verify `HighImpactMinDepositUClaw` (1 CLAW) provides adequate protection for high-impact actions
- [ ] Review deposit slash rate (`DepositSlashPerPenaltyBps = 100` = 1% per penalty) -- is it sufficient deterrent?
- [ ] Confirm deposit refund path on deregistration does not have race conditions
- [ ] Verify `ErrAgentHasActiveTasks` prevents premature deregistration/deposit withdrawal

### 3.2 Slashing

- [ ] Review `SlashAgentDeposit()` for integer overflow on `deposit * bps / 10000`
- [ ] Verify slashed tokens are burned (deflationary) vs. redirected (redistributive) -- confirm burn is intentional
- [ ] Confirm slashing cannot be triggered by non-authority callers
- [ ] Review cross-module slashing path: reputation -> agent deposit slash

### 3.3 Fee Structure

- [ ] Verify gas costs for privacy operations (proof verification) are appropriately high to prevent spam
- [ ] Review marketplace skill pricing -- confirm no free-mint or zero-price exploit paths
- [ ] Verify escrow payout arithmetic: `base = total / milestones`, final milestone gets remainder
- [ ] Confirm task budget validation (`MinTaskBudgetUclaw`, `StandardTaskMinBudgetUclaw`, `ExpeditedTaskMinBudgetUclaw`)
- [ ] Review `ExpeditedTaskMaxDeadlineBlocks = 100` (~10 min at 6s blocks) -- confirm classification threshold

---

## 4. Operational Security

### 4.1 Key Management

- [ ] Document validator key generation and storage procedures (HSM recommended)
- [ ] Document agent operator key backup and recovery procedures
- [ ] Verify `clawd` CLI does not log private keys, mnemonics, or proofs to stdout/stderr
- [ ] Confirm keyring backend defaults to OS-secure storage (not `test` backend)
- [ ] Verify no keys are committed to the repository (scan for patterns: `mnemonic`, `private_key`, `seed`)

### 4.2 Node Hardening

- [ ] Document minimum system requirements (CPU, memory, disk, network)
- [ ] Document firewall rules: expose only P2P (26656), RPC (26657), gRPC (9090), API (1317)
- [ ] Verify Prometheus metrics endpoint (`/metrics`) is not publicly exposed by default
- [ ] Document log rotation and retention policy
- [ ] Verify `config.toml` and `app.toml` default settings are production-appropriate

### 4.3 Monitoring and Alerting

- [ ] Define alerting thresholds for: missed blocks, peer count drops, memory usage, disk usage
- [ ] Define privacy-specific alerts: nullifier growth rate, commitment rate, Merkle tree depth utilization
- [ ] Define agent-specific alerts: heartbeat failure rate, deactivation rate, slash events
- [ ] Document incident response procedures (reference `docs/incident-runbook.md`)
- [ ] Verify chain halt recovery procedures are documented and tested

---

## 5. Dependency Audit

### 5.1 Go Modules

- [ ] Run `go list -m all` and audit all direct dependencies for known CVEs
- [ ] Verify gnark version (`github.com/consensys/gnark`) is latest stable with no known vulnerabilities
- [ ] Verify gnark-crypto version (`github.com/consensys/gnark-crypto`) is compatible and patched
- [ ] Verify Cosmos SDK version and all `cosmossdk.io/*` dependencies are on supported releases
- [ ] Verify ibc-go v10 (`github.com/cosmos/ibc-go/v10`) is stable and audited
- [ ] Audit `replace` directives in `go.mod` -- confirm each is justified and the replacement is safe
- [ ] Run `govulncheck ./...` and resolve all findings

### 5.2 npm Packages (SDK / OpenClaw)

- [ ] Run `npm audit` in `sdk/` and resolve all critical/high findings
- [ ] Run `npm audit` in `openclaw/` and resolve all critical/high findings
- [ ] Verify no `postinstall` scripts in dependencies execute untrusted code
- [ ] Pin all dependency versions (no floating ranges in production packages)

### 5.3 Build Reproducibility

- [ ] Verify `go build` produces deterministic binaries (same input = same hash)
- [ ] Document build environment (Go version, OS, architecture)
- [ ] Publish SHA-256 checksums for release binaries
- [ ] Verify Dockerfile produces deterministic images (pinned base image, deterministic layer ordering)

---

## 6. Trusted Setup Ceremony Requirements

### 6.1 Ceremony Scope

Three circuits require trusted setup:
1. `TransferCircuit` -- 2-in-2-out private UTXO transfer (Groth16/BN254)
2. `UnshieldCircuit` -- single UTXO withdrawal (Groth16/BN254)
3. `ViewKeyCircuit` -- selective disclosure proof (Groth16/BN254)

### 6.2 Ceremony Protocol

- [ ] Select MPC protocol (recommend: Hermez-style phase-2 ceremony or MACI-style)
- [ ] Define minimum participant count (>= 10, geographically distributed)
- [ ] Define participant identity verification requirements
- [ ] Build and audit ceremony coordinator software
- [ ] Define entropy source requirements for each participant (hardware RNG recommended)

### 6.3 Ceremony Execution

- [ ] Compile circuits and generate phase-1 (powers of tau) parameters
- [ ] Execute multi-party phase-2 for each circuit
- [ ] Each participant attests to toxic-waste destruction
- [ ] Publish full ceremony transcript (contributions, hashes, attestations)
- [ ] Independently verify ceremony output matches compiled circuits

### 6.4 Post-Ceremony

- [ ] Embed finalized verifying keys in chain genesis or module parameters
- [ ] Verify verifying keys match ceremony output (hash comparison)
- [ ] Distribute proving keys to agent operators via authenticated channel
- [ ] Document verifying key rotation procedure (governance proposal)

---

## Sign-Off

| Section | Reviewer | Date | Status |
|---------|----------|------|--------|
| Code Review -- Agent | | | Pending |
| Code Review -- Privacy | | | Pending |
| Code Review -- Privacy IBC | | | Pending |
| Code Review -- Reputation | | | Pending |
| Code Review -- Marketplace | | | Pending |
| Code Review -- Messaging | | | Pending |
| Cryptographic Review | | | Pending |
| Economic Review | | | Pending |
| Operational Security | | | Pending |
| Dependency Audit | | | Pending |
| Trusted Setup Ceremony | | | Pending |
