# ClawChain Mainnet Launch Checklist -- Phase 12 Track E

> Last updated: 2026-02-26

> Current status (2026-03-02): **No-launch hold**.
> This checklist remains the authoritative readiness tracker for launch approval.
> If any other document reports `launch` while rows below are still `Pending`, treat this checklist as the source of truth.

---

## 1. Go / No-Go Criteria

All criteria must be **Pass** for launch. Any single **Fail** triggers a no-launch hold.

| # | Criterion | Status | Owner | Notes |
|---|-----------|--------|-------|-------|
| 1 | All module unit tests pass (`go test ./x/...`) | Pending | Core Dev | Includes agent, privacy, reputation, marketplace, messaging |
| 2 | All integration tests pass | Pending | Core Dev | `privacy_integration_test.go`, `agent_integration_test.go`, `reputation_integration_test.go`, `marketplace_integration_test.go`, `messaging_integration_test.go`, `state_machine_integration_test.go` |
| 3 | Security review checklist fully signed off | Pending | Security Lead | See `docs/security-review-checklist.md` |
| 4 | Threat model reviewed and accepted | Pending | Security Lead | See `docs/threat-model.md` |
| 5 | Trusted setup ceremony completed for all 3 circuits | Pending | Crypto Lead | TransferCircuit, UnshieldCircuit, ViewKeyCircuit |
| 6 | Verifying keys embedded and verified | Pending | Crypto Lead | Hash matches ceremony transcript |
| 7 | Dependency audit clean (no critical/high CVEs) | Pending | Core Dev | `govulncheck`, `npm audit` |
| 8 | Genesis file reviewed and validated | Pending | Ops Lead | Params, initial balances, validator set |
| 9 | Minimum validator count reached (>= 5) | Pending | Community Lead | Geographically distributed |
| 10 | Governance participation threshold met | Pending | Community Lead | >= 3 validators voted on test proposals |
| 11 | Load testing completed and within capacity | Pending | Core Dev | See `docs/mainnet-capacity-criteria.md` |
| 12 | Testnet running stable for >= 7 days | Pending | Ops Lead | No chain halts, no consensus failures |
| 13 | Binary provenance verified (checksums published) | Pending | Release Mgr | SHA-256 for all platform binaries |
| 14 | Incident runbook reviewed and tested | Pending | Ops Lead | See `docs/incident-runbook.md` |
| 15 | Key custody policy documented and acknowledged | Pending | Security Lead | See `docs/key-custody-policy.md` |
| 16 | Operator quickstart guide complete | Pending | Docs Lead | See `docs/operator-quickstart.md` |
| 17 | SDK and OpenClaw extension builds pass | Pending | Core Dev | `cd sdk && npm run build`, extension builds |
| 18 | E2E demo script runs cleanly | Pending | QA | See `demo/demo.sh` |

---

## 2. Explicit No-Launch Triggers

The following conditions **immediately block launch**, regardless of other criteria:

- **Trusted setup not completed**: any circuit using single-party `groth16.Setup()` instead of MPC output
- **Critical CVE unpatched**: any known critical vulnerability in gnark, gnark-crypto, Cosmos SDK, ibc-go, or CometBFT
- **Test failures**: any failing unit or integration test in `x/privacy/`, `x/agent/`, or `x/marketplace/`
- **Consensus divergence detected**: any testnet node produces a different app hash for the same block
- **Deterministic blinding in production**: `msg_server_shield.go` still uses `commitCount + 1` as blinding (must be client-provided for mainnet)
- **Validator count below minimum**: fewer than 5 active validators at proposed genesis time
- **Security review incomplete**: any section of `docs/security-review-checklist.md` unsigned
- **Chain halt on testnet**: any unresolved chain halt within 72 hours of proposed launch
- **Key material exposure**: any private key, mnemonic, or ceremony toxic waste leaked

---

## 3. Genesis Coordination

### 3.1 Genesis File Preparation

- [ ] Set chain ID: `clawchain-1`
- [ ] Set genesis time (coordinate across validators, allow >= 24h for preparation)
- [ ] Configure module parameters:
  - `x/agent`: `min_agent_deposit_uclaw`, `max_heartbeat_gap_blocks`, rate limit params
  - `x/privacy`: verifying keys (from trusted setup ceremony), Merkle tree depth (32)
  - `x/reputation`: rating score range, comment length cap, SLA penalty params
  - `x/marketplace`: escrow timeout defaults, max skills per agent
  - `x/messaging`: max message size
- [ ] Set initial token distribution (community pool, foundation, validator allocations)
- [ ] Set staking parameters (min self-delegation, unbonding period, max validators)
- [ ] Set governance parameters (voting period, quorum, threshold, min deposit)
- [ ] Set slashing parameters (downtime window, double-sign slash fraction)

### 3.2 Genesis Validation

- [ ] Run `clawchaind genesis validate` -- must pass with no errors
- [ ] Verify genesis hash matches across all validators
- [ ] Confirm no test accounts, faucet accounts, or development keys in genesis
- [ ] Verify total token supply matches documented tokenomics
- [ ] Confirm module accounts have correct permissions (agent, privacy, marketplace module accounts)

### 3.3 Genesis Distribution

- [ ] Publish genesis file to a signed, versioned release
- [ ] Distribute genesis hash via at least 2 independent channels (GitHub release, Discord announcement, website)
- [ ] All validators confirm genesis hash match before starting nodes

---

## 4. Validator Onboarding Procedure

### 4.1 Prerequisites

- [ ] Validator operator has read `docs/operator-quickstart.md`
- [ ] Validator operator has read `docs/key-custody-policy.md`
- [ ] Hardware meets minimum requirements: 4 CPU cores, 16 GB RAM, 500 GB NVMe SSD, 100 Mbps network
- [ ] Sentry node architecture recommended for mainnet validators

### 4.2 Key Generation

- [ ] Generate validator key using `clawchaind init` with secure keyring backend (OS or file, not test)
- [ ] Back up mnemonic to offline, encrypted storage (min 2 copies, geographically separated)
- [ ] Generate node key (`node_key.json`) and validator key (`priv_validator_key.json`)
- [ ] Consider HSM integration for validator signing key (recommended for top validators)

### 4.3 Node Setup

- [ ] Install official release binary (verify checksum against published SHA-256)
- [ ] Configure `config.toml`: persistent peers, seed nodes, P2P port
- [ ] Configure `app.toml`: minimum gas prices (`0.025uclaw`), pruning strategy, API/gRPC settings
- [ ] Configure firewall: allow P2P (26656), restrict RPC/gRPC/API to trusted IPs
- [ ] Enable Prometheus metrics (bind to localhost or internal network only)
- [ ] Configure log rotation (systemd journal or logrotate)
- [ ] Set up monitoring (Prometheus + Grafana recommended)

### 4.4 Genesis Join

- [ ] Place genesis file in `~/.clawchain/config/genesis.json`
- [ ] Verify genesis hash: `sha256sum genesis.json`
- [ ] Submit `gentx` (for genesis validators) or prepare `MsgCreateValidator` (for post-genesis join)
- [ ] Start node and confirm it connects to peers and begins syncing
- [ ] Verify validator is signing blocks after genesis time

### 4.5 Post-Launch Validation

- [ ] Confirm validator is in the active set
- [ ] Verify block signing rate > 99%
- [ ] Set up alerting for missed blocks, peer drops, disk usage
- [ ] Test governance proposal voting flow

---

## 5. Community Governance Gates

| Gate | Requirement | Status |
|------|-------------|--------|
| Minimum validator count | >= 5 active validators in genesis | Pending |
| Geographic distribution | Validators in >= 3 distinct jurisdictions | Pending |
| Governance test | >= 3 validators have voted on testnet governance proposals | Pending |
| Param change test | At least 1 successful param-change proposal executed on testnet | Pending |
| Software upgrade test | At least 1 coordinated software upgrade completed on testnet | Pending |
| Community review period | Genesis params published >= 7 days before launch for public comment | Pending |
| Emergency halt test | Chain halt and recovery drill completed on testnet | Pending |

---

## 6. Release Management

### 6.1 Versioning

- [ ] Release version follows semver: `v1.0.0` for mainnet genesis
- [ ] Git tag matches binary version string (`clawchaind version`)
- [ ] Changelog covers all changes since last testnet release
- [ ] Breaking changes (if any) documented with migration guide

### 6.2 Binary Provenance

- [ ] Build binaries for: `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`
- [ ] Publish SHA-256 checksums in release notes
- [ ] Sign release with GPG key (key published on keyserver and project website)
- [ ] Docker image published with pinned tag matching release version
- [ ] Verify Dockerfile builds reproduce the same binary hash

### 6.3 Release Artifacts

- [ ] GitHub release with: binaries, checksums, changelog, genesis file
- [ ] Documentation site updated with mainnet endpoints and chain ID
- [ ] SDK package published (`npm publish` for `@clawchain/sdk`)
- [ ] OpenClaw extension updated with mainnet configuration

---

## 7. Post-Launch Monitoring Plan

### 7.1 First 24 Hours (Critical Watch Period)

- [ ] Assign 24/7 on-call rotation (minimum 2 engineers)
- [ ] Monitor block production rate (target: 1 block per ~6 seconds)
- [ ] Monitor validator participation rate (target: > 95% of active set signing)
- [ ] Monitor memory and CPU usage on all core nodes
- [ ] Watch for `agent_deactivated` events (heartbeat failures)
- [ ] Watch for `ibc_auto_shield_failed` events (IBC middleware issues)
- [ ] Monitor nullifier growth rate for anomalies
- [ ] Monitor agent registration rate for Sybil patterns

### 7.2 First 7 Days

- [ ] Daily review of chain metrics: TPS, block time distribution, gas usage
- [ ] Review agent economy: registration count, heartbeat health, task completion rate
- [ ] Review privacy pool: shield/unshield ratio, commitment growth, Merkle tree utilization
- [ ] Review marketplace: skill listings, purchase volume, escrow creation rate
- [ ] Review reputation: rating distribution, endorsement patterns, top-agent rankings
- [ ] Monitor state database growth rate and project storage requirements
- [ ] Conduct first governance proposal (non-critical param change) to validate governance flow

### 7.3 Ongoing (Post-Stabilization)

- [ ] Weekly chain health reports published to community
- [ ] Monthly dependency audit (`govulncheck`, `npm audit`)
- [ ] Quarterly review of threat model and security posture
- [ ] Upgrade cadence: follow `docs/testnet-upgrade-cadence.md` for coordinated upgrades
- [ ] Incident response: follow `docs/incident-runbook.md` for any production issues

---

## Sign-Off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Core Dev Lead | | | |
| Security Lead | | | |
| Crypto Lead | | | |
| Ops Lead | | | |
| Community Lead | | | |
| Release Manager | | | |

**Launch decision**: All rows above must be signed before genesis time is confirmed.
