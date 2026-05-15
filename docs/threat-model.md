# ClawChain Threat Model -- Phase 12 Track E (Mainnet Readiness)

> Last updated: 2026-02-26

## Scope

This document covers attack vectors against ClawChain's five custom Cosmos SDK modules (`x/agent`, `x/privacy`, `x/reputation`, `x/marketplace`, `x/messaging`), the IBC privacy middleware (`x/privacy/ibc`), the `clawd` CLI runtime, and the supporting SDK/extension layer.

Severity scale: **Critical** / **High** / **Medium** / **Low**

---

## 1. Agent Compromise (Stolen Keys / Malicious Behavior)

| Attribute | Detail |
|-----------|--------|
| **Threat** | An attacker obtains an agent's private key (mnemonic theft, insecure storage, phishing) and submits transactions on behalf of the agent -- registering rogue agents, completing tasks fraudulently, or draining deposited funds. |
| **Impact** | **Critical** -- full impersonation, financial loss, reputation poisoning. |
| **Existing mitigations** | Deposit lock on registration (`MinAgentDepositUclaw = 1_000_000` in `x/agent/types/policy.go`). Deposit slashing via `SlashAgentDeposit()` in `x/agent/keeper/reputation_adapter.go` (burns portion on SLA violations). Heartbeat-based auto-deactivation in `EndBlock()` (`x/agent/keeper/endblock.go`) limits the window for a stolen-key agent to act if the real operator stops heartbeating. |
| **Remaining gaps** | No on-chain multisig or threshold-signature requirement for agent keys. No key-rotation message (`MsgRotateAgentKey`). No anomaly detection for sudden behavior changes (e.g., agent that was dormant suddenly submitting max-rate actions). Recommend adding key-rotation support and optional 2-of-N multisig registration. |

---

## 2. Message Replay Attacks

| Attribute | Detail |
|-----------|--------|
| **Threat** | An attacker captures a valid signed transaction and resubmits it to the mempool. For the `x/messaging` module, replaying an encrypted message (`MsgSendMessage`) could cause duplicate delivery. For `x/privacy`, replaying a `MsgPrivateTransfer` could attempt double-spending. |
| **Impact** | **High** -- duplicate message delivery; potential double-spend if nullifier checks fail. |
| **Existing mitigations** | Cosmos SDK sequence numbers prevent simple tx replay at the auth/ante handler level. The `x/messaging` module enforces `ErrDuplicateNonce` (error 1105 in `x/messaging/types/errors.go`) by checking nonce uniqueness. The `x/privacy` module checks nullifiers against the spent set (`ErrNullifierAlreadyUsed`, error 1101 in `x/privacy/types/errors.go`) via `ConsumeNullifiers()` in `msg_server_private_transfer.go`, preventing double-spend. |
| **Remaining gaps** | Nonce uniqueness in `x/messaging` is per-message but there is no garbage collection or TTL on stored nonces, leading to unbounded state growth. Recommend adding a pruning strategy (e.g., prune nonces older than N blocks). Nullifier storage in `x/privacy` is permanent by design (required for soundness) but should be monitored for state bloat. |

---

## 3. Privacy Circuit Vulnerabilities (Proof Forgery / Information Leakage)

| Attribute | Detail |
|-----------|--------|
| **Threat** | (a) **Proof forgery**: an attacker crafts a valid-looking Groth16 proof without knowing the private inputs, allowing them to mint tokens or transfer without owning the UTXOs. (b) **Information leakage**: timing side-channels, metadata patterns (commitment indices, transaction frequency), or weak blinding factors reveal private amounts. |
| **Impact** | **Critical** -- proof forgery breaks the entire privacy/value model; information leakage degrades privacy guarantees. |
| **Existing mitigations** | The `TransferCircuit` (`x/privacy/circuit/circuit.go`) enforces: balance conservation (sum-of-inputs == sum-of-outputs), commitment validity via MiMC hash, nullifier derivation, Merkle inclusion proofs (depth 32), and 64-bit range proofs (`api.ToBinary(amount, 64)`). The `UnshieldCircuit` similarly enforces commitment ownership and Merkle inclusion. Groth16 verification on BN254 is used via gnark (`circuit.VerifyTransferProof()`). The verifying key is loaded at startup and used for all proof checks. |
| **Remaining gaps** | **Trusted setup**: `SetupTransfer()` and `SetupUnshield()` in `x/privacy/circuit/setup.go` use `groth16.Setup()` which is a single-party toxic-waste ceremony. For mainnet, a multi-party computation (MPC) ceremony is required to eliminate the single-point-of-trust risk. **Blinding factor generation**: `msg_server_shield.go` generates blinding deterministically from `commitCount + 1` -- this is predictable and leaks the commitment preimage to anyone who knows the leaf index. Clients must generate their own blinding off-chain; the on-chain deterministic blinding is a development shortcut. **MiMC hash**: MiMC over BN254 is less studied than Poseidon; consider a formal security audit of the hash function choice. **Batch verification**: `BatchVerifyTransferProofs()` uses goroutines without bounded concurrency, which could be exploited for resource exhaustion during block processing. |

---

## 4. Validator Collusion / Censorship

| Attribute | Detail |
|-----------|--------|
| **Threat** | A quorum of validators (>1/3 for liveness, >2/3 for safety) collude to: censor specific agent transactions, reorder transactions for profit, or halt the chain. Validators could selectively exclude privacy transactions to degrade the anonymity set. |
| **Impact** | **High** -- censorship resistance is fundamental to a privacy chain; collusion breaks both liveness and fairness guarantees. |
| **Existing mitigations** | Standard CometBFT/Cosmos SDK validator set with staking, slashing for downtime and double-signing. Governance-controlled parameter updates require proposal voting. |
| **Remaining gaps** | No encrypted mempool or threshold-encrypted transactions to prevent validator-side censorship/front-running. No minimum anonymity-set enforcement (validators could include only their own privacy transactions). Consider adopting threshold encryption for the mempool or commit-reveal schemes for privacy-sensitive transactions. Define a minimum validator count in genesis and governance. |

---

## 5. Deposit / Staking Economic Attacks

| Attribute | Detail |
|-----------|--------|
| **Threat** | (a) **Deposit grinding**: an attacker registers many agents with minimum deposit, performs malicious actions, and abandons the deposits. (b) **Slash evasion**: an agent deregisters before slashing can occur. (c) **Deposit drainage**: exploit the `SlashAgentDeposit()` path to slash honest agents via false SLA reports. |
| **Impact** | **High** -- undermines the economic security of the agent registry. |
| **Existing mitigations** | `MinAgentDepositUclaw = 1_000_000` (1 CLAW) required at registration (`x/agent/keeper/msg_server_register_agent.go`). Deposit is locked in the agent module account via `bankKeeper.SendCoinsFromAccountToModule()`. Slashing burns tokens from the module account (`bankKeeper.BurnCoins()` in `reputation_adapter.go`). `ErrAgentHasActiveTasks` (error 1125) prevents deregistration while tasks are active. `HighImpactMinDepositUClaw` requires higher deposits for sensitive actions. |
| **Remaining gaps** | No cooldown/unbonding period for deposit withdrawal after deregistration -- an agent can deregister and immediately reclaim remaining deposit. Slash rate (`DefaultDepositSlashPerPenaltyBps = 100`, i.e., 1% per penalty) may be too low to deter well-funded attackers. No maximum agent count per address or per IP. Recommend adding an unbonding period and progressive slash scaling. |

---

## 6. Rate Limit Bypass / Spam Attacks

| Attribute | Detail |
|-----------|--------|
| **Threat** | An attacker bypasses per-block rate limits to flood the chain with agent actions, intents, tasks, or heartbeats, consuming block space and degrading performance. |
| **Impact** | **Medium** -- denial of service, increased gas costs for legitimate users. |
| **Existing mitigations** | Per-agent per-block rate limits enforced via dedicated collections: `AgentActionRateLimitKey`, `IntentRateLimitKey`, `TaskRateLimitKey` (defined in `x/agent/types/keys.go`). Defaults: `MaxActionsPerBlock = 8`, `MaxIntentsPerBlock = 4`, `MaxTasksPerBlock = 4` (`x/agent/types/policy.go`). Heartbeat spam protection via `MinHeartbeatIntervalBlocks = 10` with `ErrHeartbeatTooFrequent`. Payload size capped at `MaxPayloadBytes = 4096`. `ErrRateLimitExceeded` (error 1121) and `ErrPayloadTooLarge` (error 1123) reject excess. |
| **Remaining gaps** | Rate limits are per-agent, not per-address -- an attacker with multiple agent registrations can multiply throughput linearly with the number of agents (bounded only by deposit cost). No global per-block cap on total agent transactions. The `x/messaging` module has `MaxMessageSize` but no per-sender rate limit. The `x/privacy` module has no per-block limit on shield/transfer/unshield operations. Recommend adding global transaction caps and per-module rate limits. |

---

## 7. Sybil Attacks on Agent Registry

| Attribute | Detail |
|-----------|--------|
| **Threat** | An attacker creates many agent identities to: inflate endorsement counts, manipulate marketplace rankings, game the reputation system, or overwhelm task delegation. |
| **Impact** | **High** -- corrupts trust signals (reputation, endorsements), pollutes marketplace, and undermines the agent economy. |
| **Existing mitigations** | Deposit requirement (`MinAgentDepositUclaw`) makes Sybil attacks linearly expensive. Endorsements require the endorser to be a registered agent (`ErrEndorserNotAgent` in `x/reputation/types/errors.go`), raising the cost. Self-endorsement and self-rating are blocked (`ErrSelfEndorsement`, `ErrSelfRating`). Ratings require a prior purchase (`ErrNoPurchase`), preventing pure Sybil rating inflation. |
| **Remaining gaps** | No rate limit on endorsements per endorser per time period -- a single agent can endorse an unlimited number of others. No graph-based Sybil detection (e.g., trust clustering). The deposit cost may be too low relative to the economic value of inflated reputation. Consider adding endorsement cooldowns, maximum endorsements per period, and weighted trust scores that account for endorser reputation. |

---

## 8. Front-Running and MEV in Agent Economy

| Attribute | Detail |
|-----------|--------|
| **Threat** | Validators or mempool observers front-run profitable agent actions: (a) Observing a `MsgSubmitIntent` and submitting a competing `MsgRespondIntent` first. (b) Front-running `MsgPurchaseSkill` to buy a skill before a known buyer. (c) Sandwich attacks on escrow creation/completion. |
| **Impact** | **Medium** -- economic unfairness, loss of revenue for honest agents, erosion of trust in marketplace. |
| **Existing mitigations** | Intents have a creator check (`ErrNotIntentCreator` for finalization in `x/agent/types/errors.go`). Self-response is blocked (`ErrSelfResponse`). Escrow parties are validated (`ErrNotEscrowParty` in `x/marketplace/types/errors.go`). |
| **Remaining gaps** | No commit-reveal scheme for intent submission. No private mempool or encrypted transaction support. Validators can observe and reorder all pending transactions. Intent responses are publicly visible before finalization. Consider adopting a commit-reveal pattern for intents and exploring threshold-encrypted mempools. |

---

## 9. Cross-Chain Bridge Risks (IBC)

| Attribute | Detail |
|-----------|--------|
| **Threat** | (a) **Malicious IBC packets**: crafted packets exploit the privacy IBC middleware (`x/privacy/ibc/middleware.go`) to shield tokens that were not legitimately received. (b) **Relay manipulation**: a malicious relayer replays, reorders, or drops IBC packets. (c) **Denom confusion**: IBC denomination traces are manipulated to credit incorrect token types to the privacy pool. (d) **Auto-shield failure path**: the middleware silently succeeds on the transfer but fails on shield, leaving tokens in an inconsistent state. |
| **Impact** | **High** -- token inflation in the privacy pool, loss of cross-chain funds, denom confusion. |
| **Existing mitigations** | The IBC middleware (`IBCMiddleware.OnRecvPacket()`) only shields after the underlying transfer module confirms success (`ack.Success()`). Auto-shield failures emit an `ibc_auto_shield_failed` event but do not revert the transfer (fail-open design). Denom resolution uses `transfertypes.ParseDenomTrace()` from ibc-go. Standard IBC packet verification (commitment proofs, sequence numbers) is handled by ibc-go v10. |
| **Remaining gaps** | The fail-open design means tokens can be received but not shielded, leaving them visible on-chain (privacy expectation violated). No allowlist of trusted source chains or channels for auto-shielding. The `ParsePrivacyMetadata()` from memo parsing should be hardened against injection. Amount parsing uses `strconv.ParseUint()` which silently truncates on overflow. Recommend adding channel allowlisting, strict amount validation, and an option for fail-closed auto-shield (revert transfer if shield fails). |

---

## Summary Matrix

| # | Attack Vector | Severity | Mitigations Present | Key Gaps |
|---|--------------|----------|---------------------|----------|
| 1 | Agent key compromise | Critical | Deposit lock, heartbeat deactivation, slashing | No key rotation, no multisig |
| 2 | Message replay | High | SDK sequence numbers, nonce checks, nullifier set | Nonce state pruning |
| 3 | Privacy circuit attacks | Critical | Groth16/BN254, range proofs, Merkle inclusion | Trusted setup ceremony, deterministic blinding |
| 4 | Validator collusion | High | CometBFT slashing, governance | No encrypted mempool, no min validator count |
| 5 | Deposit/staking attacks | High | Min deposit, slash-on-penalty, active-task lock | No unbonding period, low slash rate |
| 6 | Rate limit bypass | Medium | Per-agent per-block limits, payload caps | No global caps, no cross-module limits |
| 7 | Sybil attacks | High | Deposit cost, purchase-gated ratings, self-* blocks | No endorsement rate limits, no graph analysis |
| 8 | Front-running / MEV | Medium | Creator checks, self-response blocks | No commit-reveal, no private mempool |
| 9 | IBC bridge risks | High | Ack-gated shielding, IBC packet proofs | Fail-open design, no channel allowlist |
