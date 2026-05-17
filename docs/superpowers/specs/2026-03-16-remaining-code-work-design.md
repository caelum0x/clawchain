# ClawChain — Remaining Code Work Design Spec

**Date**: 2026-03-16
**Scope**: Full feature completeness — all code gaps closed
**Approach**: Risk-first ordering, vertical slice delivery, module-first within each slice

---

## Status Amendment — 2026-05-17

This design is retained as historical planning context. The current PRD records the major March 16 work as complete or superseded: governance hardening, IBC hardening, oracle productionization, GPU E2E mock pipeline, mobile wallet integration, Paradigm tool verification, and the later OpenClaw/Claw Agent hardening phases.

Implementation agents should not treat the unchecked items in this file as the current execution board. Use `prd.md` for product truth and use the current repository state before applying any of the old snippets. In particular, the final oracle implementation uses the Terra Classic v4.0.0 oracle fork and `/clawchain/oracle/v1beta1/` REST surface, not the earlier new-module sketch in this document.

Repository packaging has also changed since this draft: external forks are vendored as normal source directories and `.gitmodules` has been removed.

## Context

ClawChain is an AI-native Cosmos SDK blockchain with 8 custom modules, an OpenClaw agent runtime, TypeScript SDK, web dashboard, CLI, DEX, and supporting infrastructure. As of March 16, 2026:

- All 8 modules compile, 908 Go tests pass, 2,490 total tests across all projects
- 14-service Docker stack validated and running
- Chain produces blocks locally, DEX contracts deployed, faucet operational

**Remaining code gaps** identified through codebase audit (not just PRD claims):

1. x/governance: EndBlocker auto-executes proposals, but missing `MsgCancelProposal`, `QueryTallyResult`, `QueryVoterVotes`, and `no_with_veto` vote option. ParamExecutor already wired for agent + privacy, but not marketplace/reputation/messaging/modelregistry.
2. x/agent/ibc (367 LOC) and x/privacy/ibc (191 LOC): functional middleware exists for `discover`, `announce`, `delegate_task`, `query_task` and auto-shield-on-receive. Missing: IBC task completion ACK flow, remote agent heartbeat expiry, configurable auto-shield threshold, cross-chain unshield transport.
3. No oracle/price feed module
4. GPU compute pipeline never orchestrated end-to-end
5. Mobile wallet ~2.3% customized — Oko Wallet is a multi-package TS/Rust monorepo (web SDKs, web apps, Expo sandbox), not a standalone React Native app
6. Paradigm tool forks untested against live ClawChain data — each has both a Rust core (root-level dir) and a TypeScript CLI wrapper (cmd/claw-*)

---

## Section 1: Governance Completion Vertical

### Current State
The governance module already has:
- `MsgSubmitProposal` and `MsgVote` handlers
- `EndBlocker` that auto-tallies at voting period end and auto-executes passed proposals
- `ExecuteProposal` and `RejectProposal` keeper methods
- `ModuleParamExecutor` interface in `x/governance/types/expected_keepers.go`
- ParamExecutor already implemented and registered for all 6 modules (agent, privacy, marketplace, modelregistry, messaging, reputation) in `app/app.go`
- Proposal status tracking: `voting` → `passed`/`rejected` → `executed`

### What's Actually Missing

**New proto rpc + message type (requires proto change):**
- `MsgCancelProposal` — new rpc in `tx.proto`. Creator can cancel before voting period ends. Refunds deposit. Fails if voting already concluded or caller is not the proposer.

**New vote option — `no_with_veto` (requires changes across proto/types/keeper/tally):**
- Add `VOTE_OPTION_NO_WITH_VETO = 4` to the VoteOption enum in proto
- Add `VetoVotes` field to `TallyResult` type
- Update `TallyProposal` keeper logic: if veto votes > 33.4% of total, reject proposal AND slash deposit (not refund)
- Update EndBlocker to check veto threshold before executing

**New query handlers:**
- `QueryTallyResult` — returns current yes/no/abstain/veto counts and percentages for an active proposal
- `QueryVoterVotes` — returns all votes cast by a given address across all proposals

**Verify existing ParamExecutor registrations:**
- All 6 modules already have `param_executor.go` and are registered in `app/app.go`
- Verify each executor handles its module's param keys correctly (marketplace fee rates, reputation decay rate, messaging TTL, model access pricing defaults)
- Add test coverage for any untested param change paths

**Supplementary execution log (extends existing Proposal status tracking):**
- Add `execution_height` and `execution_error` fields to existing `Proposal` type (not a separate store)
- Populated by EndBlocker when auto-execution runs

### SDK (sdk/src/)
- `cancelProposal(proposalId)` — sign and broadcast MsgCancelProposal
- `getTallyResult(proposalId)` — query live tally
- `getVoterHistory(voterAddress)` — query voter's vote history

### CLI (cmd/clawd/)
- `clawd governance cancel <proposal-id>` — cancel own proposal
- `clawd governance tally <proposal-id>` — show live vote tally
- `clawd governance voter-history <address>` — show voting record

### Web (web/)
- Enhance `ProposalDetail` page: live tally progress bar (yes/no/abstain/veto), execution status badge with height + error if failed, cancel button (visible only to creator before voting ends)
- Enhance `Governance` list page: filter by status (voting, passed, executed, failed, cancelled)

### Tests
- Keeper: MsgCancelProposal (cancel before voting ends, reject after voting ends, reject non-proposer)
- Keeper: no_with_veto vote option — >33.4% veto blocks execution and slashes deposit
- Keeper: QueryTallyResult returns correct counts during active voting
- Keeper: QueryVoterVotes returns full history for an address
- Keeper: cross-module param propagation via new ParamExecutors (change marketplace fee, verify x/marketplace sees new value)
- Integration: full governance flow including veto path with real bank balances

---

## Section 2: IBC Hardening Vertical

### Current State
The IBC middleware is more substantial than initially assessed:
- `x/agent/ibc/middleware.go` (367 LOC): handles `discover`, `announce`, `delegate_task`, `query_task` memo actions using `clawchain_agent` memo key format
- `x/privacy/ibc/middleware.go` (191 LOC): functional auto-shield-on-receive when memo contains `auto_shield: true`
- `StoreRemoteAgent` exists on the agent keeper interface
- Existing IBC test infrastructure in the repo (18 Go E2E tests)

### What's Actually Missing

### Chain — x/agent/ibc/

**Task completion ACK flow (extends existing middleware):**
- Current state: `delegate_task` action creates task on receiving chain, but no ACK sends result back
- Add: when local task is completed (`MsgCompleteTask`), check if task has `ibc_source_channel` + `ibc_sequence` metadata. If so, construct IBC ACK packet with result hash and send back to source chain
- Add: source chain's `OnAcknowledgementPacket` handler processes completion ACK, marks delegated task as complete
- Add: on IBC timeout, source chain auto-refunds escrowed task budget

**Remote agent heartbeat expiry:**
- Add `EndBlocker` logic: iterate remote agents, deactivate any where `last_heartbeat + ttl < current_block_height` (TTL from params, default 1000 blocks)
- Remote agents with expired heartbeats get status `inactive` but are not deleted (can be reactivated by new IBC announcement)

**State (extends existing):**
- `IBCTaskMap`: ibc_sequence → local_task_id (new — for ACK correlation)
- Verify `RemoteAgentRegistry` store is implemented on the keeper (not just the interface)

### Chain — x/privacy/ibc/

**Configurable auto-shield threshold (extends existing):**
- Current state: shields if `auto_shield: true` in memo (binary on/off)
- Add params: `auto_shield_mode` (`off`, `memo_only`, `all`, `threshold_only`), `auto_shield_threshold` (minimum amount, default 0)
- In `all` mode: shield every incoming IBC transfer regardless of memo
- In `threshold_only` mode: shield transfers above threshold amount regardless of memo
- In `memo_only` mode: current behavior (only shield when memo requests it)

**Cross-chain unshield transport:**
- Not a new on-chain message type — uses the existing memo-based IBC packet approach (consistent with current architecture)
- Sender generates ZK proof locally, constructs IBC transfer with memo: `{"clawchain_privacy": {"action": "unshield", "proof": "...", "nullifier": "...", "amount": "..."}}`
- Receiving chain's privacy IBC middleware verifies proof against local Merkle tree before accepting transfer
- Uses existing Groth16 verifier — no new circuit needed, just IBC transport wrapper

### SDK
- `ibcDelegateTask(targetChainId, agentAddress, budget, deadline)` — construct IBC transfer with `clawchain_agent` delegate_task memo
- `queryRemoteAgents(chainId?)` — list remote agents (all chains if no chainId)
- `ibcShield(sourceChannel, amount)` — initiate IBC transfer with auto-shield memo
- `ibcUnshield(destChainId, amount, proof)` — construct IBC transfer with unshield proof memo

### CLI
- `clawd ibc delegate-task <chain-id> <agent-addr> <budget> <deadline>`
- `clawd ibc remote-agents [chain-id]`
- `clawd ibc shield <channel> <amount>`
- `clawd ibc unshield <chain-id> <amount>`

### Web
- Enhance Bridge page: "Remote Agents" tab showing agents discovered from connected chains
- Enhance Bridge page: cross-chain task delegation form
- Enhance Privacy page: IBC shield/unshield option in the shield form

### Tests
- Go: task completion ACK flow (delegate on chain A → complete on chain B → ACK received on chain A)
- Go: IBC timeout → auto-refund on source chain
- Go: remote agent heartbeat expiry (register → no heartbeat for TTL blocks → status inactive)
- Go: auto-shield threshold mode (transfer below threshold → no shield, transfer above → auto-shield)
- Go: cross-chain unshield proof verification via IBC memo
- Integration: create `scripts/setup-ibc-test.sh` — spins up 2 local chains with Hermes relayer, creates IBC channel, seeds test data on both chains

---

## Section 3: Oracle / Price Feed Module (New)

### Problem
No price oracle exists. DEX and marketplace operate without external price reference. Required for mainnet.

### Chain — x/oracle/

**Proto definitions** (`proto/clawchain/oracle/v1/`):
- `tx.proto`: MsgDelegateFeeder, MsgAggregateExchangeRatePrevote, MsgAggregateExchangeRateVote, MsgUpdateParams
- `query.proto`: QueryPrice, QueryPrices, QueryPriceHistory, QueryFeederDelegation, QueryMissCounter, QueryParams
- `genesis.proto`: GenesisState (params, feeder_delegations, exchange_rates, miss_counters, price_history)
- `params.proto`: Params (vote_period, vote_threshold, reward_band, slash_fraction, slash_window, min_valid_per_window, whitelist)

**Keeper implementation:**

Two-phase oracle voting (prevents front-running):
1. **Prevote** (block N): Feeder submits `SHA256(salt + exchange_rates + validator_addr)` — commits to prices without revealing
2. **Vote** (block N+1 to N+vote_period): Feeder reveals salt + exchange_rates — hash must match prevote
3. **Aggregation** (EndBlocker at vote_period boundary): collect all valid votes, compute weighted median (weighted by validator voting power), store as canonical price

**EndBlocker logic:**
- At each vote period boundary: aggregate votes → weighted median → store price
- **Weighted median algorithm** (following Terra oracle design): sort all valid votes by price ascending, iterate accumulating validator voting power until cumulative power >= total_power/2, take that price as the median
- Track miss counter per validator (no vote or vote outside reward band)
- Slash validators who miss > `min_valid_per_window` votes in a `slash_window`
- Reward validators who vote within `reward_band` of the median (from oracle reward pool)
- **TWAP update**: time-weighted average price stored as a separate state entry, updated each vote period. Each price contributes proportional to the duration (in blocks) it was the canonical price. Missing periods use the last known price. Window: configurable, default 10 vote periods. Stored in `TWAPStore`, not computed on query.

**Error codes** (range 1500-1520):
- `1500 ErrInvalidPrevote` — malformed prevote hash or duplicate prevote in same period
- `1501 ErrInvalidVote` — vote hash doesn't match prevote, or vote outside voting window
- `1502 ErrNoMatchingPrevote` — vote submitted without corresponding prevote
- `1503 ErrMissedVotePeriod` — validator failed to vote within the period
- `1504 ErrInvalidFeederDelegation` — non-validator attempting to delegate feeder
- `1505 ErrUnauthorizedFeeder` — feeder not delegated by the validator
- `1506 ErrInvalidDenomPair` — denom pair not in whitelist
- `1507 ErrPriceNotAvailable` — no canonical price for requested denom pair

**State stores:**
- `ExchangeRate`: denom_pair → (price, block_height, timestamp)
- `PriceHistory`: denom_pair → []PriceEntry (capped ring buffer, default 1000 entries)
- `Prevote`: validator_addr → AggregateExchangeRatePrevote
- `Vote`: validator_addr → AggregateExchangeRateVote
- `FeederDelegation`: validator_addr → feeder_addr
- `MissCounter`: validator_addr → uint64
- `Params`: module params

**Whitelisted denom pairs** (default):
- CLAW/USD, CLAW/ATOM, ATOM/USD

**Integration points:**
- x/marketplace: `GetReferencePrice(denom)` for USD-equivalent pricing on GPU compute jobs
- DEX oracle contract: `OracleQuerier` that reads x/oracle prices and feeds TWAP data
- x/agent: optional param `task_budget_usd_minimum` — validates task budget against oracle price

### Module scaffolding
- `x/oracle/module/module.go` — AppModule, RegisterServices, EndBlock
- `x/oracle/module/autocli.go` — AutoCLI config
- `x/oracle/module/depinject.go` — dependency injection
- `x/oracle/keeper/keeper.go` — Keeper struct, store access
- `x/oracle/keeper/msg_server_*.go` — message handlers
- `x/oracle/keeper/query_*.go` — query handlers
- `x/oracle/keeper/endblock.go` — aggregation + slash logic
- `x/oracle/types/` — keys, errors, params, codec, expected_keepers
- `app/app.go` — wire OracleKeeper, store key, register module

### SDK
- `submitPrevote(salt, prices)` — submit price hash commitment
- `submitVote(salt, prices)` — reveal prices
- `delegateFeeder(feederAddress)` — delegate price submission
- `getPrice(denomPair)` — latest canonical price
- `getPrices()` — all whitelisted prices
- `getPriceHistory(denomPair, limit?)` — historical TWAP
- `getOracleParams()` — module params
- `getMissCounter(validatorAddress)` — miss count

### CLI
- `clawd oracle prevote <salt> <prices>` — submit prevote hash
- `clawd oracle vote <salt> <prices>` — reveal vote
- `clawd oracle delegate-feeder <feeder-address>` — delegate feeder
- `clawd oracle prices` — list all current prices
- `clawd oracle price <denom-pair>` — single price query
- `clawd oracle history <denom-pair>` — price history
- `clawd oracle miss-counter [validator]` — miss counts
- `clawd oracle params` — show oracle params

### Web
- New `Oracle` page (`/oracle`):
  - Price table: denom pair, price, 24h change, last updated block
  - Price chart: sparkline per denom pair (from price history)
  - Feeder status table: validator, feeder, miss counter, status
  - Oracle params display

### Tests
- Keeper: prevote → vote → aggregate → verify median price
- Keeper: weighted median calculation with different validator powers
- Keeper: miss counter increment on no-vote
- Keeper: slash on exceeding miss threshold
- Keeper: reward band filtering (votes outside band rejected)
- Keeper: TWAP calculation over multiple vote periods
- Keeper: feeder delegation (delegated feeder can vote on behalf of validator)
- Integration: full oracle cycle with 3 validators, verify price convergence
- Integration: x/marketplace reads oracle price for USD reference

---

## Section 4: GPU Compute E2E with Mock Executor

### Problem
`dantegpu-core/` has 16 microservices that compile individually but have never been orchestrated. No end-to-end job flow has ever been tested.

### Mock Executor — dantegpu-core/mock-executor/

New Go service (~300 LOC). The gRPC executor interface does NOT currently exist as a proto — the existing `provider-daemon/internal/executor/executor.go` uses an internal Go interface. The mock executor must:

1. First, define the proto: `dantegpu-core/proto/executor/v1/executor.proto`
```
service Executor {
  rpc SubmitJob(JobRequest) returns (JobResponse);
  rpc CancelJob(CancelRequest) returns (CancelResponse);
  rpc GetJobStatus(StatusRequest) returns (StatusResponse);
  rpc StreamMetrics(MetricsRequest) returns (stream MetricsResponse);
}
```
2. Generate Go stubs from this proto
3. Refactor `provider-daemon/internal/executor/executor.go` to use the generated gRPC interface (adapter over existing internal interface)
4. Implement mock executor against the same generated interface

- `SubmitJob`: accepts job spec, sleeps for `job.estimated_duration` (or 5s default), returns deterministic output hash `SHA256(job_id + "mock_output")`
- `CancelJob`: immediately marks job cancelled, returns partial metrics
- `GetJobStatus`: returns current state (queued/running/completed/cancelled/failed)
- `StreamMetrics`: every 1s emits fake GPU metrics: utilization 45-85%, temp 55-75C, VRAM usage proportional to job spec, power 150-300W
- Config: `MOCK_FAILURE_RATE=0.05` (5% of jobs randomly fail, for testing error paths)
- Health endpoint: `GET /health` returns `{"status": "ok", "gpu": "Mock A100 80GB", "jobs_completed": N}`

### Pipeline Wiring

**docker-compose.yml additions** (under `gpu-mock` profile):
- `nats` — NATS message bus (port 4222)
- `mock-executor` — mock GPU executor
- `provider-daemon` — registers with mock GPU specs, connects to NATS
- `scheduler` — receives chain events, dispatches to providers

**NATS topics:**
- `gpu.jobs.submit` — new job from chain
- `gpu.jobs.status` — status updates from executor
- `gpu.jobs.complete` — completion events
- `gpu.jobs.cancel` — cancellation events
- `gpu.metrics` — streaming GPU metrics
- `gpu.billing.meter` — metering events for billing service

**Flow:**
1. User submits `MsgSubmitComputeJob` on chain (x/marketplace)
2. `claw-eventsd` (`cmd/claw-eventsd/`) subscribes to CometBFT WebSocket events. Must verify it handles `EventComputeJobSubmitted` from x/marketplace — if not, add subscription for marketplace compute events alongside existing event types. Publishes to `gpu.jobs.submit` on NATS.
3. Scheduler receives, matches job requirements to registered providers, selects best fit
4. Scheduler dispatches to provider-daemon via gRPC
5. Provider-daemon forwards to mock-executor
6. Mock-executor streams metrics to `gpu.metrics`, publishes completion to `gpu.jobs.complete`
7. Billing service meters duration from NATS events, submits `MsgCompleteComputeJob` on chain
8. Chain releases escrow to provider

### Code Hardening (all 16 services)

For each service in dantegpu-core/:
- Verify `go build` succeeds
- Verify `--help` flag works
- Add `/health` HTTP endpoint if missing
- Ensure `ClawChainClient` (the 518-line payment client) handles: connection refused, timeout, insufficient funds, invalid chain response
- Add graceful shutdown (SIGTERM handler, drain NATS subscriptions)

### Integration Test Script — scripts/test-gpu-pipeline.sh

```
Phase 1: Boot infrastructure (chain + NATS + mock-executor + services)
Phase 2: Register mock provider on-chain
Phase 3: Submit compute job on-chain (Docker type, 10s duration)
Phase 4: Wait for job completion event
Phase 5: Verify on-chain settlement (provider balance increased)
Phase 6: Submit + cancel job (verify refund)
Phase 7: Submit job with timeout (verify auto-refund after deadline)
Phase 8: Report results
```

### Tests
- Go: mock executor unit tests (submit, cancel, status, metrics stream)
- Go: scheduler provider matching (VRAM requirements, GPU model filter)
- Go: billing metering accuracy (duration-based, verify settlement amount)
- Integration: full pipeline test (3 scenarios: success, cancel, timeout)
- Integration: reconciler detects state mismatch between chain and provider

---

## Section 5: Mobile Wallet Meaningful Integration

### Architecture Reality
`claw-wallet-mobile/` is NOT a standalone React Native app. It is a multi-package TypeScript/Rust monorepo:
- `crypto/` — Rust/WASM: Cait-Sith (tECDSA) + FROST (tEdDSA)
- `sdk/` — TypeScript packages: `oko_sdk_core`, `oko_sdk_eth`, `oko_sdk_cosmos`, `oko_sdk_svm`
- `apps/` — Web applications: `user_dashboard`, `demo_web`, `oko_admin_web`, `customer_dashboard`
- `sandbox/sandbox_react_native/` — Expo sandbox app (expo-router, `app/` directory convention)
- `embed/` — Embeddable wallet iframe
- Uses **yarn workspaces**, not standalone npm

The Expo sandbox is the closest thing to a mobile app. The web apps (`apps/user_dashboard`, `apps/demo_web`) are the actual user-facing products.

### Strategy: Build ClawChain features into BOTH the Expo sandbox AND the user_dashboard web app

### Branding Pass

**Expo sandbox** (`sandbox/sandbox_react_native/`):
- `app.json`: name → "Claw Wallet", slug → "claw-wallet", Android package → `io.clawchain.wallet`
- App icons + splash screen: ClawChain logo
- Default chain config: `clawchain-testnet-1`, bech32 `claw`, denom `uclaw`

**Web user_dashboard** (`apps/user_dashboard/`):
- Page title, favicon, branding → ClawChain
- Default network → ClawChain

**SDK package** (`sdk/oko_sdk_cosmos/`):
- Add ClawChain as a first-class supported chain (alongside existing Cosmos chains)
- Configure bech32 prefix `claw`, coin type 118, denom `uclaw`/`CLAW`

### New Screens (5)

Built as shared components in a new workspace package `packages/clawchain-ui/` so both Expo and web apps can use them. Each component is a React component that receives SDK client as a prop (no platform-specific code).

**1. Agent Dashboard** (`packages/clawchain-ui/src/AgentDashboard.tsx`)
- Header: agent name, status badge (active/inactive/unregistered)
- Stats row: total rewards earned, tasks completed, uptime %
- Agent list (if multi-agent): card per agent with heartbeat indicator
- Register button (if no agent registered): name, endpoint, capabilities form
- Data: `sdk.getLiveAgents()`, `sdk.getAgentRewards()`, `sdk.getAgentLiveness()`

**2. Privacy Shield/Unshield** (`packages/clawchain-ui/src/PrivacyShield.tsx`)
- Toggle: Shield / Unshield mode
- Amount input with CLAW balance display
- Shield: calls `sdk.shield(amount)` — generates commitment client-side
- Unshield: calls `sdk.unshield(amount, proof)` — SDK handles proof generation via WASM ProofGenerator
- Shielded balance display (requires view key)

**3. DEX Swap** (`packages/clawchain-ui/src/DexSwap.tsx`)
- Token pair selector (from deployed pools)
- Amount input with slippage setting
- Simulate → expected output + price impact
- Swap → signs CosmWasm execute msg

**4. Task Manager** (`packages/clawchain-ui/src/TaskManager.tsx`)
- Tabs: My Tasks / Available / Active
- Task card: title, budget, deadline, status, assignee
- Accept and Complete actions

**5. Faucet** (`packages/clawchain-ui/src/Faucet.tsx`)
- One-tap "Get 10 CLAW" button
- Calls faucet HTTP endpoint
- Tx hash display + cooldown

### Navigation Integration

**Expo sandbox** (`sandbox/sandbox_react_native/app/`):
- Add routes: `app/(tabs)/agents.tsx`, `app/(tabs)/privacy.tsx`, `app/(tabs)/dex.tsx`, `app/(tabs)/tasks.tsx`
- Each route imports from `@clawchain-ui/*` and passes SDK client
- Faucet in settings or FAB on testnet

**Web user_dashboard** (`apps/user_dashboard/`):
- Add nav items for each screen
- Import from `@clawchain-ui/*`

### SDK Integration
- Add `@clawchain/sdk` as a workspace dependency in root `package.json`
- Create `packages/clawchain-ui/src/hooks/useClawChain.ts` — hook that initializes ClawChainClient using Oko's `oko_sdk_cosmos` signer
- Adapter: wrap Oko's MPC signing interface to satisfy `@clawchain/sdk`'s `OfflineSigner` interface

### No Changes To
- `crypto/` directory (Rust/WASM MPC — Cait-Sith + FROST)
- Core wallet architecture (key management, backup, recovery, HD derivation)
- Existing bank send / staking flows
- Yarn workspace structure (extend, don't restructure)

### Tests
- Component tests: each of the 5 shared components renders, displays loading state, handles errors
- Integration smoke test: ClawChainClient initializes with mock signer, queries return expected shape
- Expo: verify new routes load without crash

---

## Section 6: Paradigm Tool Verification

### Problem
6 tools (artemis, cryo, flood, flux, rivet, data-portal) exist with ClawChain code but have never been tested against a live chain with real module data.

### Verification Process (per tool)

Prerequisites:
- Local chain running via `.local-node/`
- Dev account funded
- At least 1 registered agent, 1 marketplace listing, 1 DEX pool, 1 privacy shield tx on chain (seed data script)

**Seed data script** — `scripts/seed-test-data.sh`:
- Register agent with capabilities
- List a skill on marketplace
- Shield 100 CLAW into privacy pool
- Submit a compute job
- Send an encrypted message
- These create the chain state that tools need to query

### Per-Tool Verification

Each tool has two components: a **Rust core** (root-level directory, e.g. `artemis/`) which is the upstream Paradigm fork, and a **TypeScript CLI wrapper** (e.g. `cmd/claw-artemis/src/index.ts`) which contains the ClawChain integration. Verification targets the TypeScript CLI wrappers (where ClawChain code lives). If a wrapper delegates to the Rust core, verify both run.

**artemis** (`cmd/claw-artemis/src/index.ts`, Rust core: `artemis/`):
- Run: `node dist/index.js --rpc http://localhost:26657 --rest http://localhost:1317`
- Must: connect to chain, discover DEX pools via factory contract query, scan for price discrepancies across CLAW/ATOM pool
- Must: parse agent-related events (task completions → potential arbitrage signals)
- Fix if: only queries generic Cosmos endpoints, ignores DEX contract queries or agent events

**cryo** (`cmd/claw-cryo/src/index.ts`, Rust core: `cryo/`):
- Run: `node dist/index.js export --blocks 1-100 --output /tmp/cryo-test`
- Must: export blocks with ClawChain-specific event decoding (agent_registered, shield_created, skill_listed, etc.)
- Must: handle all 8 module event types in export schema
- Fix if: only exports raw block data without module-specific event parsing

**flood** (`flood/flood/` — Python, no Rust core):
- Run: `python -m flood --target http://localhost:26657 --scenario cosmos_basic`
- Must: have ClawChain-specific scenarios (agent registration flood, task delegation flood, marketplace purchase flood)
- Must: report per-module transaction latency (not just generic send)
- Fix if: only tests bank send transactions

**flux** (`cmd/claw-flux/src/index.ts`, Rust core: `flux/`):
- Run: `node dist/index.js export --chain http://localhost:1317 --format csv`
- Must: export agent registry, marketplace listings, privacy pool stats, reputation scores
- Must: handle custom module REST endpoints (not just standard Cosmos bank/staking)
- Fix if: only exports standard Cosmos data

**rivet** (`cmd/claw-rivet/src/index.ts`, Rust core: `rivet/`):
- Run: `node dist/index.js inspect --rpc http://localhost:26657`
- Must: decode ClawChain-specific message types in blocks (MsgRegisterAgent, MsgShield, MsgListSkill, etc.)
- Must: show module-specific state when inspecting (agent count, privacy pool size, marketplace listings)
- Fix if: only shows raw protobuf without ClawChain message type resolution

**data-portal** (`cmd/claw-data-portal/src/index.ts`):
- Run: `node dist/index.js serve --port 8095 --chain http://localhost:1317`
- Must: serve REST endpoints for ClawChain analytics (agent stats, marketplace volume, privacy pool depth)
- Must: aggregate data from all 8 modules
- Fix if: only proxies standard Cosmos REST endpoints

### Seed Data Script — scripts/seed-test-data.sh

This is a standalone deliverable, useful for all development, not just tool verification:
- Register an agent with capabilities (compute, inference, general)
- List a skill on marketplace with pricing
- Shield 100 CLAW into privacy pool
- Submit a compute job
- Send an encrypted message between two accounts
- Create a reputation endorsement
- Delegates to a validator
- Idempotent: checks if data already exists before creating

### Deliverable
For each tool: either "verified working" with evidence (screenshot/output log) or "fixed" with diff of changes made.

---

## Section 7: Cross-Cutting Concerns

### Proto Regeneration
- New proto files for x/oracle (tx.proto, query.proto, genesis.proto, params.proto)
- Any changes to x/governance proto (new msg types)
- Run `buf generate` or `scripts/protocgen.sh` once after all proto changes finalized
- Regenerate all `.pb.go`, `.pb.gw.go` files

### SDK Consistency
- Every new chain query → SDK method following existing pattern
- Use `queryClient` for reads, `signingClient` for writes
- Error wrapping: `ClawChainError` with code, message, txHash
- Export all new types from `sdk/src/index.ts`

### CLI Consistency
- Every new SDK method → `clawd` command
- Commander.js pattern: `.command()`, `.description()`, `.action(async () => {})`
- Output: `--json` flag for machine-readable, default human-readable table
- Error handling: catch, format, exit(1)

### Web Consistency
- New pages: `useEffect` data fetching + `useState` loading/error states
- Dark/light theme via existing theme context
- Responsive layout (existing breakpoints)
- Route added to `App.tsx` with `React.lazy` + `Suspense`

### CI Updates
- `go-unit.yml`: add `x/oracle` to test matrix
- `typescript-check.yml`: add mobile wallet if it has TS
- `integration-test.yml`: add oracle integration tests
- `service-builds.yml`: add mock-executor to Go build matrix

### App Wiring (app/app.go)
- Register `OracleKeeper` with store key `oracle`
- Add to module manager, begin/end block order
- Wire into `app/app_config.go` depinject
- Add `upgrades.go` migration entry for oracle module introduction

### Migration
- Oracle module: v1 store migration (initial)
- Governance: if new msg types added to proto, needs codec registration (no store migration needed)
- IBC: no migration — new middleware hooks into existing IBC stack

---

## Execution Order

Risk-first, vertical slices, dependencies respected:

| Phase | Section | Depends On | Estimated Effort |
|-------|---------|------------|-----------------|
| 1 | Governance Completion | None | Medium |
| 2 | Oracle Module | None (parallel with Phase 1) | Large — new module |
| 3 | IBC Hardening | None (parallel with Phases 1-2) | Medium |
| 4 | GPU E2E Mock Pipeline | None (parallel with Phases 1-3) | Large — orchestration |
| 5 | Cross-cutting (proto regen, CI, migrations) | Phases 1-3 proto changes finalized | Small |
| 6 | Mobile Wallet Integration | SDK methods from Phases 1-3 | Medium |
| 7 | Paradigm Tool Verification | Running chain with seed data | Small per tool |

**Parallelization opportunities:**
- Phase 1 (Governance) + Phase 2 (Oracle) + Phase 3 (IBC) + Phase 4 (GPU) can ALL run in parallel — no shared state
- Phase 5 (Cross-cutting) is a merge pass after all proto changes from Phases 1-3 land
- Phase 6 (Mobile) needs SDK methods from Phases 1-3
- Phase 7 (Tools) can start as soon as chain runs with seed data (can overlap with Phase 6)

---

## Success Criteria

- All existing 2,490 tests continue to pass
- New tests bring Go coverage to 85%+ across all modules
- `go build ./...` compiles clean with oracle module
- Docker stack boots with all new services (gpu-mock profile)
- Each Paradigm tool produces ClawChain-specific output against live chain
- Mobile wallet builds and renders all 5 new screens
- Full governance lifecycle works: submit → vote → pass → execute → param changed
- Oracle price feeds work: prevote → vote → aggregate → price available
- IBC agent delegation works: delegate on chain A → task created on chain B → complete → ACK
- GPU pipeline works: submit job → mock execute → settle on chain
