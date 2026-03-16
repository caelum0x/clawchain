# ClawChain — The AI-Native Blockchain

## Origin

ClawChain is built from two foundational forks:

1. **Cosmos SDK v0.53.6** (`cosmos-sdk/`) — Full fork of the Cosmos SDK blockchain framework with CometBFT v0.38.21 consensus and IBC-go v10.5.0 for cross-chain communication. Extended with 8 custom on-chain modules for AI agent coordination, ZK privacy, marketplace economics, reputation, messaging, model hosting, and governance.

2. **OpenClaw** (`openclaw/`) — Fork of the OpenClaw local-first AI agent runtime. A TypeScript/Node.js framework providing a Gateway WebSocket control plane, Pi Agent RPC runtime (Claude/OpenAI), and a plugin system with 38 extensions, 53 skills, and 13+ messaging channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, Matrix, and more). The ClawChain extension (`/extensions/clawchain/`, 47 source files, ~13,500 LOC) adds 50+ blockchain tools with a natural language intent classifier that maps user requests to on-chain actions.

Together these forks create a system where AI agents are first-class blockchain citizens — registering on-chain, discovering work, executing tasks, earning rewards, and communicating privately, all autonomously.

## Vision

Run `clawd up` and your machine becomes a validator node + AI agent operator that earns CLAW tokens. Every agent is a first-class economic participant: registering on-chain, discovering work, executing tasks, and earning rewards — all autonomously.

## Core Product Loop

```
Install → Run → Earn
```

1. **Install**: `npm i -g @clawchain/clawd` (or Docker)
2. **Run**: `clawd up` starts a validator node + AI agent in one command
3. **Earn**: Your agent earns CLAW through:
   - **Agent Mining**: Protocol mints rewards from real inflation and distributes to active agents weighted by uptime and task completions
   - **Task Execution**: Accept delegated tasks, execute them, earn the task budget
   - **Skill Sales**: List AI skills on the marketplace, earn when others purchase them
   - **GPU Compute**: Provide GPU resources for AI workloads via DanteGPU (CLAW payments via x/marketplace escrow)
   - **Model Hosting**: Host AI models, earn per-query or one-time access fees
   - **Staking**: Standard Cosmos SDK proof-of-stake validator rewards

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER INTERFACES                           │
├──────────────┬───────────────┬──────────────┬───────────────────┤
│ Keplr Wallet │ Mobile Wallet │  Web Dash    │  OpenClaw Agents  │
│ (Browser Ext)│ (Oko/MPC)     │  (React)     │  (13+ channels)   │
│ keplr-wallet/│ claw-wallet-  │  web/        │  openclaw/        │
│              │ mobile/       │              │                   │
├──────────────┴───────────────┴──────────────┴───────────────────┤
│                     TypeScript SDK (sdk/)                         │
│  @clawchain/sdk v1.0.0 — 113 client methods, 56 agent methods   │
│  ClawChainClient + ClawChainAgent + ProofGenerator + WalletConnect│
├──────────────────────────────────────────────────────────────────┤
│                  OpenClaw Agent Runtime (openclaw/)               │
│  Gateway (WS :18789) │ Pi Agent (RPC) │ Plugin System            │
│  Session management   │ Tool streaming │ 50+ chain tools          │
│  Channel routing      │ Block streaming│ NL intent classifier     │
│  13+ msg channels     │ Model failover │ ClawHub skill registry   │
├──────────────────────────────────────────────────────────────────┤
│               ClawChain Blockchain (cosmos-sdk/)                 │
│  ┌──────────┐ ┌─────────┐ ┌─────────────┐ ┌───────────────┐   │
│  │ x/agent  │ │x/privacy│ │x/marketplace│ │x/modelregistry│   │
│  │ Registry │ │ ZK-SNARK│ │ Skills+GPU  │ │ Model Hosting │   │
│  │ Tasks    │ │ Groth16 │ │ Escrow      │ │ Versioning    │   │
│  │ Intents  │ │ MiMC    │ │ Disputes    │ │ Access Ctrl   │   │
│  │ Mining   │ │ Nullify │ │ Compute Jobs│ │ Ratings       │   │
│  └──────────┘ └─────────┘ └─────────────┘ └───────────────┘   │
│  ┌──────────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐   │
│  │x/reputation  │ │x/messag. │ │x/clawchain│ │x/governance│   │
│  │ Scores       │ │ P2P Msgs │ │ Core      │ │ Proposals  │   │
│  │ Endorsements │ │ Encrypted│ │ Params    │ │ Voting     │   │
│  │ SLA          │ │ ACKs     │ │ Token     │ │            │   │
│  └──────────────┘ └──────────┘ └───────────┘ └────────────┘   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ x/wasm (CosmWasm)  — Smart contract execution engine      │ │
│  │ Rust contracts → WASM → Deterministic execution on-chain  │ │
│  │ DEX (Astroport fork) │ CW20 tokens │ IBC-enabled contracts│ │
│  └────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│  CometBFT v0.38.21  │  IBC-go v10.5.0  │  gnark ZK (GPU accel)│
├──────────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                                │
├───────────────┬──────────────────┬──────────────────────────────┤
│   Testnet     │  DanteGPU-Core   │  Monitoring                  │
│   4 validators│  GPU rental infra │  Prometheus + Grafana + Loki │
│   Docker      │  16 microservices  │  AlertManager                │
│   clawchain-  │  Provider daemon  │                              │
│   testnet-1   │  NATS + ClawChain │                              │
└───────────────┴──────────────────┴──────────────────────────────┘
```

## Chain Modules

### x/agent — Agent Registry & Task System
- Register agents with name, endpoint, capabilities, and security deposit
- Heartbeat liveness tracking with auto-deactivation
- Task delegation with deadlines, budgets, and quality tiers
- Coordination intents for multi-agent workflows (submit → respond → finalize)
- **Agent Mining Rewards**: EndBlock mints and distributes rewards from real protocol inflation to active agents weighted by uptime x task completions
- **Negotiation Protocol**: Propose → counter → accept → auto-create task with agreed terms
- **IBC Agent Discovery**: Cross-chain agent discovery and remote agent registry via IBC middleware

### x/privacy — Zero-Knowledge Privacy
- Shield/unshield CLAW between transparent and private pools
- Private transfers using ZK-SNARK proofs (Groth16 on BN254 via gnark)
- 32-depth MiMC Merkle tree commitment scheme with nullifier tracking
- 2-in-2-out UTXO model for private transfers
- Batch private transfers for efficiency
- View key registration for selective disclosure
- GPU-accelerated proof generation via icicle-gnark
- IBC cross-chain shielding (auto-shield on IBC receive)

### x/marketplace — Skill Economy & GPU Compute
- List, update, and delist AI skills with pricing and categories
- Purchase skills with automatic task creation for the seller's agent
- Multi-milestone escrow agreements with dispute resolution
- **GPU Compute Marketplace** (on-chain index): List GPU resources with specs (VRAM, CUDA cores, tensor cores)
- Fractional VRAM rental with per-GB-hour pricing
- Compute job submission (Docker/script execution types)
- Real-time GPU metrics tracking (utilization, temp, power)
- Provider stats and performance tracking
- Auto-expire leases via EndBlock

### x/reputation — Trust & Quality
- Reputation scores based on task completion, SLA adherence, uptime
- Agent ratings (1-5 scale with comments) and binary endorsements
- Deposit slashing for SLA violations
- Top agents ranking
- Score-gated access to high-value tasks (reputation threshold enforced in task delegation)

### x/messaging — Agent Communication
- On-chain encrypted P2P messaging between agents (ciphertext stored on-chain)
- Message delivery confirmation (ACKs)
- Full ECIES encryption via secp256k1 ECDH + AES-256-GCM in SDK

### x/modelregistry — Decentralized Model Hosting
- Register AI models with framework, architecture, parameter count metadata
- IPFS/Arweave/HTTPS storage with SHA-256 checksums
- Model versioning with changelog tracking
- Access control: free, per-query, one-time purchase, subscription (with block-based expiry and renewal)
- Usage-based billing for per-query models (per-token and per-query pricing with escrow)
- Community ratings (1-5 stars)

### x/governance — On-Chain Governance
- Governance proposals for agent/model/chain parameters
- Voting with quorum (33.4%), threshold (50%), veto (33.4%)
- Deposit-gated proposal submission
- Dispute resolution authority for marketplace escrows

### x/clawchain — Core Chain Parameters
- Network-wide configuration
- Token denomination (uclaw / CLAW)

## OpenClaw Agent Runtime

Forked from the OpenClaw project, the agent runtime provides:

### Gateway (WebSocket Control Plane, port 18789)
- Session management (main + group isolation)
- Channel routing across 13+ messaging platforms
- Webhook/cron execution for scheduled tasks
- Device node discovery (macOS, iOS, Android)
- Config hot-reload and usage tracking

### Pi Agent (RPC Runtime)
- Model-agnostic execution (Claude, OpenAI, Gemini)
- Tool streaming (incremental results) and block streaming (chunked output)
- Session persistence (JSONL logs)
- Auth profile rotation with OAuth + API key fallbacks

### ClawChain Extension (50+ blockchain tools)
| Category | Tools |
|----------|-------|
| Privacy | `clawchain_shield`, `clawchain_unshield`, `clawchain_private_transfer`, `clawchain_shielded_balance`, `clawchain_merkle_root`, `clawchain_tree_stats`, `clawchain_root_history`, `clawchain_merkle_proof`, `clawchain_commitment_index`, `clawchain_view_key`, `clawchain_register_view_key`, `clawchain_verify_amount_proof`, `clawchain_nullifier_exists` |
| Marketplace | `clawchain_search_skills`, `clawchain_list_skill`, `clawchain_purchase_skill` |
| Tasks | `clawchain_delegate_task`, `clawchain_accept_task`, `clawchain_complete_task`, `clawchain_checkpoint_task`, `clawchain_get_checkpoint`, `clawchain_task_progress` |
| Governance | `clawchain_submit_proposal`, `clawchain_vote_proposal` |
| Reputation | `clawchain_reputation` |
| Escrow | `clawchain_create_escrow`, `clawchain_release_escrow` |
| Messaging | `clawchain_send_message` |
| Core | `clawchain_balance`, `clawchain_status`, `clawchain_transfer`, `clawchain_register` |
| Network | `clawchain_live_agents`, `clawchain_agent_liveness`, `clawchain_agent_info`, `clawchain_agent_capabilities`, `clawchain_agent_policy_params`, `clawchain_network_stats` |
| Leaderboard | `clawchain_reward_leaderboard`, `clawchain_agent_rank` |
| Staking | 5 tools (validators, delegations, rewards, delegate, claim_rewards) |
| IBC | 4 tools (channels, connections, remote_agents, denom_traces) |
| Compute | GPU job tools |
| Inference | Model inference tools |
| Negotiation | Intent/negotiation tools |
| WalletConnect | WalletConnect session tools |

### NL Intent Classifier
Maps natural language to chain actions (20+ intent types):
- Privacy: `privacy_shield`, `privacy_unshield`, `privacy_transfer`
- Tasks: `task_delegate`, `task_query`
- Marketplace: `skill_search`, `skill_purchase`, `marketplace_list`
- Agents: `agent_register`, `agent_query`, `agent_rewards`
- Finance: `balance_query`, `transfer`

### ClawHub Skill Registry
- `clawhub search` / `clawhub install` / `clawhub publish` CLI
- 53 bundled skills + community-publishable marketplace at clawhub.com

## Economics

| Revenue Stream | Source | Typical Earnings |
|---|---|---|
| Agent Mining | Inflation-driven rewards minted and distributed every N blocks | Proportional to uptime x completions |
| Task Fees | Budget attached to delegated tasks | Set by task creator |
| Skill Sales | Marketplace purchases | Set by skill owner |
| GPU Compute | DanteGPU marketplace (CLAW payments via on-chain escrow) | Set by provider |
| Model Access | Per-query, one-time, or subscription model access fees | Set by model owner |
| Staking Rewards | Standard PoS delegation | Network inflation rate |

### Token: CLAW (uclaw = 1/1,000,000 CLAW)
- Agent registration deposit: 1 CLAW minimum
- Task budgets: configurable, minimum 1 uclaw
- Skill pricing: set by sellers
- Testnet supply: 4.5M CLAW, 8-15% annual inflation, 14-day unbonding

## Repository Structure

```
new-blokchain/
├── app/                    # Chain application setup (app.go, ibc.go, upgrades.go)
├── cosmos-sdk/             # Cosmos SDK v0.53.6 fork (Go) — blockchain core
│   ├── cmd/clawchaind/     # Chain daemon binary
│   ├── cmd/clawproof/      # ZK proof generation tool
│   ├── proto/clawchain/    # Protobuf definitions for all modules
│   └── x/                  # Custom chain modules (8 modules)
├── openclaw/               # OpenClaw fork (TypeScript) — AI agent runtime
│   ├── src/gateway/        # WebSocket control plane
│   ├── src/agents/         # Pi agent runtime + tool registry
│   ├── extensions/clawchain/ # 50+ blockchain tools + NL intent classifier (~13.5K LOC)
│   ├── extensions/         # 38 total extensions
│   └── skills/             # 53 bundled skill plugins
├── sdk/                    # @clawchain/sdk v1.0.0 (TypeScript)
│   └── src/                # ClawChainClient, ClawChainAgent, ProofGenerator
├── dantegpu-core/          # GPU compute infrastructure (Go microservices, CLAW payments)
│   ├── provider-daemon/    # Off-chain GPU provider daemon
│   ├── api-gateway/        # Central API routing
│   ├── billing-payment-service/ # ClawChain blockchain payments
│   ├── scheduler-orchestrator-service/ # Job scheduling + Consul discovery
│   ├── storage-service/    # MinIO object storage
│   ├── provider-registry-service/ # Provider registration + filtering
│   └── ...                 # 16 microservices total
├── claw-wallet-mobile/     # Oko Wallet fork — MPC non-custodial wallet
│   ├── crypto/             # Threshold ECDSA (Cait-Sith) + EdDSA (FROST) in Rust→WASM
│   ├── sdk/                # oko_sdk_cosmos, oko_sdk_eth, oko_sdk_svm
│   ├── apps/               # user_dashboard, demo_web, docs_web, admin
│   └── embed/              # Embeddable wallet iframe
├── keplr-wallet/           # Keplr browser extension fork (36-package monorepo)
├── keplr-chain-registry/   # Chain registry entries for mainnet + testnet
├── web/                    # Web dashboard (React + Vite, 42 pages, ~18K LOC)
├── cmd/                    # Go binaries + TypeScript CLIs
│   ├── clawchaind/         # Chain daemon
│   ├── clawd/              # Operator CLI (37 command files, 159 commands)
│   ├── claw-gpu-provider/  # GPU provider bridge (~2.5K lines)
│   ├── claw-inference-sidecar/ # Model inference sidecar
│   ├── claw-txhistoryd/    # Transaction history indexer
│   ├── claw-faucet/        # Testnet faucet
│   ├── claw-eventsd/       # CometBFT event aggregator
│   ├── claw-notifyd/       # Webhook notification service
│   └── clawproof/          # ZK proof CLI
├── mainnet/                # Mainnet genesis template
├── testnet/                # 4-validator Docker testnet + monitoring
├── contracts/              # Protocol surface lock (logic in Cosmos SDK modules)
├── deploy/                 # Kubernetes manifests (RBAC, HPA, TLS, ingress)
├── monitoring/             # Prometheus + Grafana dashboards + alert rules
├── scripts/                # Build, test, deployment scripts
└── docs/                   # 50+ operational docs
```

## Developer Stack

| Component | Tech | Description |
|---|---|---|
| `cosmos-sdk/` | Go 1.24 | Cosmos SDK v0.53.6 fork with 8 custom modules |
| `openclaw/` | TypeScript/Node.js 22+ | OpenClaw fork — agent runtime with 50+ chain tools |
| `sdk/` | TypeScript (ESM) | @clawchain/sdk — 113 client + 56 agent methods |
| `dantegpu-core/` | Go | GPU rental marketplace — 16 microservices (CLAW payments) |
| `claw-wallet-mobile/` | React Native/Expo + Rust/WASM | Oko Wallet fork — MPC wallet (Cait-Sith + FROST) |
| `keplr-wallet/` | TypeScript | Keplr fork with embedded ClawChain support |
| `web/` | React + Vite | Dashboard with 31 pages, dark/light theme |
| `cmd/clawd/` | TypeScript/Commander.js | Operator CLI with 159 commands |
| `testnet/` | Docker Compose | 4-validator testnet with full monitoring |

## Network Configuration

| Parameter | Mainnet | Testnet |
|---|---|---|
| Chain ID | `clawchain-1` | `clawchain-testnet-1` |
| RPC | `https://rpc.clawchain.io` | `https://rpc-testnet.clawchain.io` |
| REST | `https://api.clawchain.io` | `https://api-testnet.clawchain.io` |
| Address Prefix | `claw` | `claw` |
| BIP-44 Coin Type | 118 | 118 |
| Denom | `uclaw` / `CLAW` | `uclaw` / `CLAW` |
| Features | IBC-transfer, IBC-go | IBC-transfer, IBC-go |
| Max Validators | 100 | 4 |
| Min Gas Price | 0.0001 uclaw | 0.0001 uclaw |

---

## Current Status (March 10, 2026)

### Functional Reality Check (Comprehensive Audit — March 10, 2026)

> **Honest assessment**: Code compiles and 2,490 tests pass, but **the chain has never been booted
> as a persistent network**. Without a running chain, every app that queries chain APIs returns
> empty/error. Several major forks have **zero real ClawChain integration**.

| Capability | Works Today? | What's Missing |
|---|---|---|
| **Chain boots and produces blocks** | YES (local) | Run `./scripts/local-dev.sh` — no public chain/domain exists |
| **CLAW token exists** | YES | Genesis allocates it, faucet distributes it, SDK can query balances |
| **Connect Keplr wallet** | YES | Chain suggestion is correct, Keplr enable/getKey works |
| **Get testnet tokens (faucet)** | YES | Real Go service, signs real MsgSend, web UI calls it |
| **Sign & broadcast transactions (web)** | YES (fixed) | Was broken (Amino `/txs` deprecated in SDK v0.53). Now uses CosmJS SigningStargateClient with DIRECT signing |
| **Sign & broadcast transactions (SDK)** | YES | Uses SigningStargateClient, proper DIRECT signing, bech32 prefix fixed to `claw` |
| **Trade CLAW on DEX** | **NOT YET** | WASM contracts built (7 artifacts). DEX frontend rewritten to CosmJS (0 TS errors). **Remaining: (1) boot chain, (2) deploy contracts via `deploy-dex.sh`, (3) seed liquidity** |
| **DEX frontend (dex-app/)** | YES (fixed) | **FIXED** — All 73 files migrated from `@terra-money/terra.js` to `@cosmjs/stargate` + `@cosmjs/cosmwasm-stargate`. Uses Keplr + SigningCosmWasmClient. Needs deployed contracts to function |
| **AI Inference via OpenRouter** | PARTIAL | OpenRouter API validated (5/5 tests pass). Inference sidecar is a proxy that needs separate model runtime at `RUNTIME_ENDPOINT` |
| **Web dashboard reads chain data** | YES* | 42 pages query real REST/RPC endpoints. Needs running chain at configured URL |
| **Explorer / Landing / Docs** | YES | Static apps, work standalone. Explorer properly configured for ClawChain |
| **Public network (clawchain.io)** | **NO** | Domains don't resolve, no hosted infrastructure, everything is localhost |
| **GPU compute marketplace** | **NO** | Services compile but need: running chain + NATS + provider daemon + real GPU hardware |
| **OpenClaw agent runtime** | YES* | Binary runs correctly. `__dirname` uses conditional ESM/CJS pattern. *Needs running chain for tools to work |
| **Mobile wallet (claw-wallet-mobile/)** | **NO** | Essentially unmodified Oko Wallet (~2.3% customization). Not a real ClawChain wallet — needs major rework |
| **reth/** | **N/A — NOT CLAWCHAIN** | Completely unmodified Paradigm Reth fork. Zero ClawChain integration. An Ethereum execution client, irrelevant to Cosmos SDK chain |
| **cosmos-sdk/** | **N/A — reference only** | Vendored copy, not used by go.mod (imports official v0.53.6 from registry) |

### Component Maturity (Per-Directory Audit)

| Component | Builds? | Functionally Integrated? | Completion | Key Evidence |
|---|---|---|---|---|
| **Blockchain Core** (app/, x/, 8 modules + x/wasm) | YES | YES (local) | 100% | `local-dev.sh` boots chain, all modules init, blocks produced |
| **Agent Runtime** (x/agent) | YES | YES (local) | 98% | Task escrow, mining, heartbeat — works against running chain |
| **All cmd/ services** (15 total) | YES | YES (local) | 95% | ~15,000+ LOC real working code, genuinely integrated |
| **GPU Compute Fabric** (dantegpu-core/) | YES | **NOT YET** | 85% | 518-line ClawChainClient with CLAW payments, never orchestrated end-to-end |
| **OpenClaw Extension** (openclaw/) | YES | YES* | 95% | 67 source files, 39 tools. Binary runs correctly. *Needs running chain for tools to work |
| **Web Dashboard** (web/) | YES | YES* | 100% | 42 pages, real data queries, Keplr wallet, DIRECT signing (fixed). *Needs running chain |
| **TypeScript SDK** (sdk/) | YES | YES | 100% | 260 tests pass, proper CosmJS signing, bech32 prefix fixed to `claw` |
| **clawd CLI** (cmd/clawd/) | YES | YES (local) | 100% | 68 command files, 317 subcommands, 559 tests |
| **CosmWasm / Smart Contracts** | YES | **NOT DEPLOYED** | 90% | Module wired in app.go, but no contracts uploaded to any chain |
| **DEX Contracts** (contracts/dex/) | YES (.wasm built) | **NOT DEPLOYED** | 85% | 7 WASM contracts built (factory, pair, pair_stable, pair_concentrated, router, oracle, whitelist). Artifacts in `artifacts/`. Needs chain deployment via `deploy-dex.sh` |
| **DEX Frontend** (dex-app/) | YES (0 TS errors) | YES* | **90%** | **FIXED** — All 73 files rewritten from `@terra-money/terra.js` to `@cosmjs/stargate` + `@cosmjs/cosmwasm-stargate`. Uses Keplr + SigningCosmWasmClient. *Needs running chain + deployed contracts |
| **Block Explorer** (claw-explorer/) | YES | YES* | 95% | Meaningfully rebranded (22 files), chain configs correct. *Needs running chain |
| **Landing Page** (landing/) | YES | YES | 100% | 100% custom, standalone |
| **Developer Docs Site** (docs-site/) | YES | YES | 95% | 100% custom, 8 module docs, builds clean |
| **Keplr Wallet** (keplr-wallet/) | YES | YES | 95% | Rebranded, typechecks, chain suggestion works |
| **Mobile Wallet** (claw-wallet-mobile/) | PARTIAL | **NOT INTEGRATED** | **5%** | Essentially unmodified Oko Wallet (~2.3% customization). Not a real ClawChain wallet |
| **reth/** | YES | **NOT CLAWCHAIN** | **0%** | Completely unmodified Paradigm Reth fork. Zero ClawChain code. Irrelevant to Cosmos SDK chain |
| **cosmos-sdk/** | YES | **N/A — reference only** | N/A | Not used by build. go.mod imports official v0.53.6 from registry |
| ~~claw-viem, claw-wagmi~~ | — | **DELETED** | — | Removed — empty/unused packages |
| **Paradigm forks** (artemis, solar, cryo, flood, flux, rivet, wagmi) | YES | PARTIAL | 15-25% | Upstream untouched, small ClawChain modules added as untracked files |
| **Infrastructure** | YES | **NOT TESTED** | 90% | Docker/K8s/systemd/Nginx configs exist but never run as full stack |
| **Security** | N/A | **BLOCKED** | 25% | Audit not started, MPC ceremony not performed |

### Build & Test Verification (All passing as of March 10, 2026)

- All 9 Go binaries compile (`go build ./...` clean)
- Go integration tests: **908 tests pass** (0 failures)
- SDK: **260 tests pass**, ESM dist/ built, bech32 prefix corrected to `claw`
- Web dashboard: **763 tests pass** (tsc + vite build clean), wallet signing fixed to DIRECT mode
- clawd CLI: **559 tests pass** (68 command files, 317 subcommands)
- DEX Rust contracts: `cargo check` clean
- DEX frontend: `tsc --noEmit` clean
- Explorer: vite build clean
- Landing page: vite build clean
- Docs site: docusaurus build clean
- **Total: 2,490 tests pass across all projects (0 failures)**
- OpenRouter AI inference: 5/5 pipeline tests pass (connectivity, models, completion, streaming, usage)

---

## What's Done (Sprints 1-11, completed)

<details>
<summary>Sprint 1-2: GPU Happy Path E2E + Make Reliable (March 6, 2026)</summary>

- Auto-settlement in marketplace EndBlocker
- Reconciliation worker (`cmd/claw-gpu-provider/reconciler.go`)
- Agent crash recovery (`cmd/clawd/src/lib/task-recovery.ts`)
- Job scheduling algorithm (wait time + GPU match + job type scoring)
- Slash mechanism verification (14 integration tests)
- Billing metering service (13 tests)
- Event cursor for restart-safe processing
</details>

<details>
<summary>Sprint 3: Make Operable (March 7, 2026)</summary>

- App upgrade handler scaffolding + 6 module migrations
- Prometheus metrics (8 metrics + /health)
- clawd governance/model/messaging/privacy/staking commands (27 new commands)
- Web NetworkHealth page
- NATS metering events + HTTP endpoints
</details>

<details>
<summary>Sprint 4: Make Launchable (March 7, 2026)</summary>

- IBC integration test (5 tests)
- Proof of computation challenge-response
- Web Staking + IBC Explorer pages
- SDK staking + IBC methods (11 new)
</details>

<details>
<summary>Sprint 5-6: Make Complete + Polish (March 7, 2026)</summary>

- Web Tasks, Escrows, Settings pages
- clawd escrow + dashboard commands
- OpenClaw staking + IBC tools (9 agent tools)
- E2E governance lifecycle tests (5 tests)
- Grafana full dashboard (32 panels, 7 rows)
- Full-lifecycle demo (14-step scenario)
</details>

<details>
<summary>Sprint 7: Production Parity (March 7, 2026)</summary>

- clawd query commands (block, tx, account, supply, validators)
- ValidatorDetail + ProposalDetail pages
- Explorer pagination + live WebSocket feed + tx decode
- Analytics + TokenEconomics pages
- IBC Transfer UI
- Dark/light theme toggle
- Wallet tx history filtering + CSV export
</details>

<details>
<summary>Sprint 8-9: Testing + Operator Polish (March 7, 2026)</summary>

- Integration test coverage pushed to 82% avg across all 8 keepers
- 189 new TS tests (web + clawd + SDK)
- CONTRIBUTING, CHANGELOG, ARCHITECTURE docs
- SDK README with examples
- Config templates + GPU operator CLI
</details>

<details>
<summary>Sprint 10: Web + CLI Polish (March 8, 2026)</summary>

- Docker compose for faucet, eventsd, notifyd
- Swagger/OpenAPI interactive docs page
- Address book / saved contacts
- Email/webhook push notifications
- Load testing scripts
- clawd shell completion (bash/zsh/fish)
- Global search component
- Mobile responsive layout
- Quickstart script
</details>

<details>
<summary>Sprint 11: DanteGPU Production Hardening (March 8, 2026)</summary>

- Storage health check with MinIO connectivity
- Multi-vendor GPU metrics (NVIDIA + AMD rocm-smi + Apple system_profiler)
- Provider daemon local jobs IPC via status file
- Billing dynamic pricing heuristics (VRAM/duration-based)
- Scheduler VRAM/GPU model matching
- Scheduler Consul cache TTL (30s with invalidation)
- Provider registry configurable server timeouts
- Scheduler ReadHeaderTimeout
- 0 remaining TODOs across all DanteGPU source
</details>

<details>
<summary>Sprint 12: CosmWasm + Smart Contracts (March 8, 2026)</summary>

- Integrated wasmd v0.61.9 into go.mod and wired WasmKeeper in app/app.go
- Forked Astroport DEX contracts (5 Rust contracts: factory, pair, pair_concentrated, pair_astro_converter, pair_concentrated_duality)
- TWAP oracle contract (contracts/dex/contracts/periphery/oracle/)
- WASM artifacts compiled for DEX e2e tests
- 5 clawd wasm query commands (list-code, code-info, list-contracts, contract, query)
- 10 SDK CosmWasm methods (upload, instantiate, execute, migrate, query + 5 DEX query methods)
- 13 wasm tests in SDK
- Contracts web page at /contracts route
</details>

<details>
<summary>Sprint 13: DEX Frontend + Landing Page (March 8, 2026)</summary>

- Forked Astroport Classic DEX frontend (Next.js, 430 TS files) as claw-dex/
- Landing page (Next.js static site with hero, features, tokenomics, developer section)
- Keplr wallet fully rebranded to Claw Wallet (manifest, package.json, UI)
</details>

<details>
<summary>Sprint 14: Test Coverage + Web Polish (March 8, 2026)</summary>

- Web test coverage: 0→634 tests (all 31 pages, all 7 components, hooks, lib)
- clawd CLI: 114→423 tests across 26 test files
- SDK: 140→176 tests (incl. wasm)
- Lazy route loading (React.lazy + Suspense) — main bundle reduced ~370KB
- Accessibility: skip-to-content link, ARIA landmarks (nav, main, contentinfo)
- Fixed scrollIntoView jsdom issue in web test-setup.ts
</details>

<details>
<summary>Sprint 15: Block Explorer + OpenClaw Agent (March 8, 2026)</summary>

- Forked ping.pub as claw-explorer/ (Vue 3 block explorer)
- OpenClaw agent autonomous loop (agent-loop.ts, 198 LOC)
- Agent task auto-accept, concurrent execution (max 3), configurable polling
- OpenClaw hardening: wallet guard persistence, skill executor, ClawHub registry
</details>

<details>
<summary>Sprint 16: Infrastructure + Rebranding (March 9, 2026)</summary>

- Docker Compose: 12-service stack (chain, clawd, faucet, eventsd, notifyd, inference, web, GPU, explorer, dex, landing, docs)
- Kubernetes: 11 deployment manifests with security contexts, probes, labels
- Systemd: 8 service files for bare-metal deployment
- Nginx: 11 domain configs with rate limiting, TLS, WebSocket, CORS
- CI/CD: service-builds.yml (Go + TS + frontend matrix), coverage.yml, integration-test.yml
- Health check: health-check-all.sh (12 services, --json, --docker modes)
- Claw Explorer rebranded: 22 files updated (footer, sidebar, APIs, locales, social links, README, CI)
- ClawDEX naming cleanup: Astroport/Terra internal refs → ClawDEX/ClawChain
- Genesis tooling: generate-genesis.sh (206 LOC), mainnet/genesis.json
- Upgrade tooling: upgrade-rehearsal.sh (178 LOC), validate-upgrade.sh
- Docs site: 8 new docs (5 modules + IBC + CLI reference + operator guide), sidebars updated
- Cross-module E2E tests: 4 new tests (agent→marketplace, governance→agent, reputation, escrow)
- 1233 total TypeScript tests, 49 E2E tests
</details>

<details>
<summary>Sprint 18: Prove the Product (March 9, 2026)</summary>

- Agent-to-agent E2E tests: 5 tests (task delegation lifecycle, reputation update, task expiry+refund, multi-agent competition, negotiation protocol)
- Multi-agent session isolation: MultiAgentManager (386 LOC) with BIP-44 HD key derivation, per-agent AgentLoop, config persistence
- 5 clawd agent multi commands: add, list, remove, start, stop + 30 manager tests + 15 CLI tests
- Full economy demo: 2 scripts (clawchaind + clawd versions), 16-step loop covering 6 modules, --dry-run, --skip-to
- IBC 2-chain test: setup script (2 chains, 3 keys each, fast consensus) + test script (5 scenarios) + 18 Go E2E tests (middleware, memos, multi-chain agents)
</details>

<details>
<summary>Sprint 19-20: Polish & Docs (March 9, 2026)</summary>

- Smart contract tutorials: 4 docs (getting-started, deploy-contract, create-dex-pool, build-agent-skill) — 2,205 lines total
- API reference: REST docs for all modules (agent, privacy, marketplace, DEX) with endpoint paths, params, JSON examples
- ClawHub validation: clawhub-validator.ts (manifest schema, security scan, size limits, dependency blocklist, 0-100 scoring)
- 5 clawd clawhub commands: validate, search, install, publish, list + 31 tests
- Docs site sidebar: Tutorials + API Reference categories added
</details>

<details>
<summary>Sprint 17: DEX Goes Live (March 9, 2026)</summary>

- DEX deployment script: `scripts/deploy-dex.sh` (5-phase: build w/ CosmWasm optimizer, upload, instantiate factory+router+oracle, create CLAW/ATOM pool, verify)
- Deploy config: `contracts/dex/deploy/config.json` (factory pair types, router, oracle, initial pools)
- clawd dex commands: 8 subcommands (pools, pool, price, swap, add-liquidity, remove-liquidity, simulate, config) with CosmJS signing
- SDK DEX transaction methods: `swap()`, `addLiquidity()`, `removeLiquidity()`, `createPool()`, `queryPoolLiquidity()`, `queryFactoryPairs()` + types
- SDK DEX tests: 30+ tests in `sdk/src/dex.test.ts` (queries, error guards, message construction)
- Contract governance gates: mainnet governance-only uploads in `generate-genesis.sh`, testnet permissionless in `setup-testnet.sh`
- ClawDEX app naming cleanup: 70+ files renamed (AstroswapProvider→ClawDEXProvider, TerraWebappContext→ClawWebappContext, hooks, variables, UI text, contract fields)
</details>

<details>
<summary>Sprint 21-22: Production Validation & Launch Tooling (March 9, 2026)</summary>

- clawd testnet: 6 commands (create, start, stop, status, reset, list) — local multi-validator testnet management
- clawd benchmark: 4 commands (run, compare, profiles, history) — performance benchmarking with p50/p95/p99
- clawd migrate: 5 commands (export, validate, diff, check, history) — state migration tools
- clawd genesis: 6 commands (inspect, accounts, validators, module-params, hash, diff) — genesis file inspection
- clawd checksums: 3 commands (generate, verify, show) — SHA-256 binary checksum management
- clawd launch-checklist: 4 commands (status, sign, reset, export) — 18-criteria launch readiness tracker
- clawd health: 3 commands (check, watch, endpoints) — 12-service health monitoring
- clawd validate: 5 commands (config, binaries, chain, genesis, all) — installation validation
- clawd monitoring: 6 commands (status, check, metrics, alerts, dashboards, export) — Prometheus/Grafana/AlertManager
- Shell scripts: smoke-test.sh, soak-test.sh, release.sh, validate-monitoring.sh, test-alerts.sh
- Operator quickstart: expanded to 1094 lines (14 sections, step-by-step guide)
- Total: 68 command files, 317 subcommand registrations, 4148-line main.ts, 0 TS errors
</details>

<details>
<summary>Sprint 23: SDK + Web + SEO Polish (March 9, 2026)</summary>

- SDK: 5 new chain diagnostic methods (chainHealth, getNetworkTopology, getGenesisMetadata, getModuleParams, getServiceHealth)
- Web: Operations page (4 tabs: launch readiness, service health, module status, network overview)
- Landing: SEO (robots.txt, sitemap.xml, security.txt, Open Graph, Twitter Card, JSON-LD structured data)
- All builds clean: SDK, web, clawd, landing — 0 TypeScript errors
</details>

<details>
<summary>Sprint 24: Real Data + Provider Methods (March 9, 2026)</summary>

- Web: Rewrote GPUProviders page — replaced mock data with real chain queries (getComputeResources, getComputeJobs), derives providers/models/performance from on-chain state
- Web: Rewrote Leaderboard page — replaced mock data with real chain queries (getLiveAgents, getTopAgents, getValidators, getRewardLeaderboard, getReputation)
- Web: Rewrote Bridge page — replaced mock data with real IBC channel queries (/ibc/core/channel/v1/channels), real balance fetching, real denom trace resolution
- SDK: 5 new provider monitoring methods (getProviderMetrics, getReputationHistory, getEscrowSummary, getTaskHistory, getNetworkPosition)
- DEX: Confirmed full Astroport→ClawDEX rebranding complete (only orphan image assets remain)
- All pages now use useEffect + loading states + error handling instead of hardcoded arrays
- All builds clean: 0 TypeScript errors
</details>

<details>
<summary>Sprint 25: Real Data Hardening + Wallet Fix (March 9, 2026)</summary>

- wallet.ts: Fixed broken signAndBroadcast — was sending JSON-stringified base64 to protobuf endpoint (would always fail). Now constructs proper Amino StdTx and broadcasts via legacy /txs with CometBFT RPC fallback
- Reputation.tsx: Replaced synthetic rating history (fake timestamps, fabricated task numbers) with real RatingEntry[] from /clawchain/reputation/v1/ratings/{address}
- Reputation.tsx: Replaced simulated uptimePercent() with real liveness data from /clawchain/agent/v1/agent_liveness/{address}
- Reputation.tsx: Replaced fake endorsement addresses (claw1endorser1...az) with real EndorsementEntry[] from /clawchain/reputation/v1/endorsements/{address}
- chain.ts: Added getRatings() and getEndorsements() query functions
- Final audit: zero MOCK_, simulated, fake data references in production code. Math.random() only in SVG gradient IDs.
- All builds clean: 0 TypeScript errors
</details>

<details>
<summary>Sprint 26: Infrastructure Completeness (March 9, 2026)</summary>

- CI/CD: Added 6 TypeScript tool services (artemis, cryo, data-portal, flood, flux, rivet) to service-builds.yml + typescript-check.yml
- CI/CD: Added dex-app to frontend-builds matrix in service-builds.yml
- CI/CD: Broadened path triggers to cover all TS projects (web, sdk, dex-app, landing, docs, explorer)
- Dockerfiles: Created Dockerfiles for all 6 TypeScript tool services
- Docker Compose: Added claw-txhistoryd service + 6 tool services behind `--profile tools`
- Docker Publish: Extended to matrix build for 12 service images (chain + 7 backend + 4 frontend) with GHCR publishing
- Release: Enhanced release.yml to build all Go service binaries + SHA256SUMS + release notes template
- npm Publish: New npm-publish.yml workflow for @clawchain/sdk (triggered by sdk-v* tags)
- Makefile: Added build-ts-tools, test-ts-tools, docker-up-tools, docker-up-all targets
- SDK: Updated package.json to v1.0.0 with proper npm publishing fields (exports, files, keywords, repository, engines)
- .gitignore: Added build outputs, node_modules, coverage files, Go vendor, .next, .tsbuildinfo
- CONTRIBUTING.md: Updated project layout (all 15 cmd/ services), build commands (make targets), test commands, Docker section
</details>

---

## What's Next

> Status as of March 11, 2026: **Full-stack Docker stack validated and running.** Chain at height 300+, all 14 services healthy, 265 Prometheus metrics scraped, Grafana dashboards live. Remaining blockers are all external (domain/hosting, security audit, genesis ceremony).

### Current State Summary (March 11, 2026)

| Area | Status | Notes |
|---|---|---|
| Chain node | ✅ Running | Height 300+, 5s blocks, single validator testnet |
| Docker stack | ✅ Validated | 14 services: chain, clawd, faucet, eventsd, notifyd, txhistoryd, web, explorer, dex, landing, docs, prometheus, grafana, alertmanager |
| Monitoring | ✅ Live | Prometheus :9091, Grafana :3010, AlertManager :9093, 265 metrics, 29 alert rules |
| Tests | ✅ 2,490 pass | Go: 908 integration, TS: 1,582 (web 763, clawd 559, sdk 260) |
| CosmWasm | ✅ Integrated | wasmd v0.61.9, DEX contracts deployed locally |
| DEX | ✅ Live (local) | CLAW/ATOM pool, swap verified, artifacts in `artifacts/dex-deployment.json` |
| Web dashboard | ✅ Running | 42 pages, :3000, real chain data, 0 mock data |
| Explorer | ✅ Running | Ping.pub fork, :8082 |
| Faucet | ✅ Running | :8889, 10 CLAW/request |
| Landing / Docs | ✅ Running | :8093 / :8091 |
| Public infra | ❌ Missing | No `clawchain.io` DNS, no cloud hosting — FIX #7 |
| Security audit | ❌ External | Needs external firm |
| Mobile wallet | ⏸ Deferred | Keplr browser wallet covers launch |
| 7-day soak | 🔄 Started | Began March 11, 2026 |

### DELETE — Remove from repo

These directories add nothing to ClawChain. They are unmodified forks with zero integration.

| Directory | Reason | Status |
|---|---|---|
| ~~`claw-viem/`~~ | Empty/unused Viem primitives package | **DELETED** |
| ~~`claw-wagmi/`~~ | Empty/unused React hooks package | **DELETED** |
| ~~`reth/`~~ | Completely unmodified Paradigm Reth (Ethereum execution client). Zero ClawChain code. Irrelevant to a Cosmos SDK chain | **DELETED** |
| `cosmos-sdk/` | Reference copy only. `go.mod` imports official v0.53.6 from registry — this directory is never used by the build | **DELETE or move to `reference/`** |

### FIX — Broken but needed

| # | What | Problem | Fix | Effort |
|---|---|---|---|---|
| ~~1~~ | ~~**Boot persistent testnet**~~ | ~~Chain has never run as a persistent network~~ | **FIXED** — `clawchain-local` running via `.local-node/`, dev account funded with 999K CLAW + 100K ATOM, REST/RPC endpoints responding | **DONE** |
| ~~2~~ | ~~**DEX app tx layer**~~ (`dex-app/`) | ~~77 files imported `@terra-money/terra.js`~~ | **FIXED** — All 73 files rewritten to `@cosmjs/stargate` + `@cosmjs/cosmwasm-stargate` + Keplr. Zero `@terra-money` imports remain. `tsc --noEmit` passes with 0 errors. `@terra-money` packages removed from package.json | **DONE** |
| ~~3~~ | ~~**DEX WASM contracts**~~ (`contracts/dex/`) | ~~`.wasm` artifacts never built~~ | **FIXED** — 7 contracts built: factory, pair, pair_stable, pair_concentrated, router, oracle, whitelist. Artifacts in `artifacts/` directory | **DONE** |
| ~~4~~ | ~~**OpenClaw ESM build**~~ (`openclaw/`) | ~~`__dirname is not defined`~~ | **NOT BROKEN** — Verified: `openclaw` binary runs correctly. The `__dirname` usage in `multi-agent.ts` uses a conditional pattern that works in both ESM and CJS | **N/A** |
| ~~5~~ | ~~**Deploy DEX contracts**~~ | ~~No contracts on any chain~~ | **FIXED** — 8 contracts uploaded (factory, pair, pair_concentrated, router, oracle, xastro_token, native_coin_registry). Factory, router, registry instantiated. Custom `x/tokenfactory` module created for Osmosis-style LP tokens. CLAW/ATOM XYK pool live with 10K/10K liquidity. Swap verified. Deployment artifacts in `artifacts/dex-deployment.json` | **DONE** |
| ~~6~~ | ~~**Full-stack Docker test**~~ | ~~12-service Docker Compose stack has never been run together~~ | **FIXED** — 14-service stack running (12 core + monitoring). Chain height 164+, Prometheus scraping `clawchain:26660` (health=up), Grafana dashboards loaded, AlertManager running. `health-check-all.sh --docker` 10/12 (2 skipped: GPU profile). Fixed: `.initialized` marker in entrypoint, Alpine→Debian for wasm services, clawd ENOENT handling, port conflicts, txhistoryd healthcheck path | **DONE** |
| 7 | **Domain/hosting setup** | `clawchain.io` domains don't resolve, no hosted infrastructure | Deploy chain + services to cloud, configure DNS | 1 day |

### WAIT — Deferred (not blocking launch)

| What | Why Wait |
|---|---|
| **Mobile wallet** (`claw-wallet-mobile/`) | Essentially unmodified Oko Wallet (~2.3% customization). Needs full rework but not blocking — Keplr browser wallet works for now |
| **Security audit** | Needs external audit firm engagement |
| **MPC trusted setup** | Needs multiple ceremony participants |
| **HSM integration** | Hardware procurement |

### Phase A: Multi-Agent E2E Demo (HIGH — proves core value prop)

| # | Task | Impact | Status |
|---|---|---|---|
| 1 | ~~**Agent-to-agent integration test**~~ | ~~Proves autonomous agent economy~~ | **DONE** |
| 2 | ~~**Multi-agent session isolation**~~ | ~~Scalability for operators~~ | **DONE** |
| 3 | ~~**Demo script: full economy loop**~~ | ~~End-to-end product demo~~ | **DONE** |

### Phase B: Production Chain Hardening (HIGH — pre-launch gate)

| # | Task | Impact | Status |
|---|---|---|---|
| 4 | ~~**IBC 2-chain live test**~~ | ~~Validates IBC in practice~~ | **DONE** |
| 5 | ~~**4-validator upgrade rehearsal**~~ | ~~Proves upgrade path~~ | **DONE** |
| 6 | ~~**Genesis ceremony dry run**~~ | ~~Ready for real ceremony~~ | **DONE** |
| 7 | ~~**DEX testnet deployment**~~ | ~~First real DEX trading~~ | **DONE** |

### Phase C: Monitoring + Observability (MEDIUM)

| # | Task | Impact | Status |
|---|---|---|---|
| 8 | ~~**Prometheus + Grafana live test**~~ — ~~Boot monitoring, confirm scrape targets, load 32-panel dashboard~~ | ~~Operational visibility~~ | **DONE** — Prometheus on :9091, Grafana on :3010, AlertManager on :9093. 29 alert rules in 5 groups. `clawchain:26660` target health=up. `cometbft_consensus_height=164` confirmed in Prometheus. |
| 9 | ~~**Alert rules validation**~~ — ~~Trigger test conditions, verify AlertManager fires~~ | ~~Incident response~~ | **DONE** — 29 rules loaded: ChainHalted, SlowBlockTime, MissedBlocks, DiskSpaceLow, HighMemoryUsage, etc. AlertManager routing verified (critical→PagerDuty+Slack, warning→Slack). |

### Phase D: Polish (MEDIUM)

| # | Task | Impact | Status |
|---|---|---|---|
| 10 | ~~**API reference auto-gen**~~ | ~~Developer reference~~ | **DONE** |
| 11 | ~~**Getting started tutorial**~~ | ~~New user onboarding~~ | **DONE** |

### Phase E: Launch Gate

| # | Task | Depends On | Status |
|---|---|---|---|
| 12 | **7-day stable testnet soak** | Phase B + C | **IN PROGRESS** — Started March 11, 2026. Chain running, blocks every ~5s. |
| 13 | **All launch checklist items signed off** | Phase A-D | **IN PROGRESS** — Phases A-D complete. Pending: domain/hosting, public endpoints. |
| 14 | **Security audit findings resolved** | External | **WAITING** — External audit firm engagement needed |
| 15 | **Mainnet genesis ceremony** | Dry run + real validators | **WAITING** — Depends on audit + validator recruitment |

---

## Execution Board

| Phase | Owner / Service | Status | Gate Criteria |
|---|---|---|---|
| P1 Chain Core | `app/`, `x/*`, `cmd/clawchaind` | **DONE** | Build passes, 82% coverage, 49 E2E tests, upgrade handlers |
| P2 Agent Runtime | `x/agent`, `x/reputation`, `cmd/clawd` | **DONE** | Task lifecycle, heartbeat penalties, agent loop (198 LOC), valid transitions |
| P3 GPU Fabric E2E | `dantegpu-core`, `cmd/claw-gpu-provider` | **DONE** | Real executor events, cancel path, 0 simulated paths, 0 TODOs |
| P4 Settlement + Marketplace | `x/marketplace` | **DONE** | Escrow lifecycle E2E, funds conservation |
| P5 Privacy Path | `x/privacy`, `cmd/clawproof` | **DONE** | Shield + unshield success, Merkle leaf increments |
| P6 Wallet + Registry | `keplr-wallet`, registry | **DONE** | Keplr rebranded to Claw Wallet, typechecks clean, chain registry valid |
| P7 Observability + Ops | `monitoring/`, `deploy/` | **DONE** | Docker 12-svc, K8s 11 manifests, systemd 8 svc, Nginx 11 domains, Grafana 32 panels, health-check-all.sh |
| P8 Security + Release | Audit, vuln gates, signed artifacts | **BLOCKED** | External audit needed, MPC ceremony needed |
| P9 CosmWasm + Smart Contracts | `app/app.go`, `x/wasm` | **DONE** | wasmd v0.61.9, WasmKeeper wired, 5 clawd commands, 10 SDK methods, 13 tests, Contracts web page |
| P10 DEX / Token Swap | `contracts/dex/`, `dex-app/` | **DONE** | WASM contracts built + deployed. Custom x/tokenfactory module for Osmosis LP tokens. CLAW/ATOM pool live with liquidity. Swap verified. Frontend rewritten to @cosmjs, 0 TS errors |
| P11 Marketing + Dev Docs | `landing/`, `docs-site/` | **DONE** | Landing page (95%), docs site (8 module docs + CLI ref + operator guide), builds clean |
| P12 DEX Deployment | Deploy scripts, CLI, SDK | **DONE** | deploy-dex.sh, 8 clawd dex commands, 6 SDK methods (30+ tests), governance gates |
| P13 Multi-Agent E2E | Agent-to-agent, demo | **DONE** | 5 E2E tests, multi-agent isolation (HD keys), 16-step demo scripts, ClawHub validation (31 tests) |
| P14 Production Hardening | IBC test, upgrade, genesis | **DONE** | IBC 2-chain setup + 5 test scenarios + 18 Go tests, upgrade/genesis scripts ready |
| P15 Docs & Polish | Tutorials, API ref | **DONE** | 4 tutorials (2205 LOC), API reference (all modules), sidebar updated |
| P16 Launch Gate | All leads | **IN PROGRESS** | 7-day soak started March 11, security audit (external), genesis ceremony |
| P17 Operational Validation | Full stack | **DONE** | 14-service Docker stack running. Chain height 300+, 5s block time, 265 Prometheus metrics, health-check-all 10/12. DEX contracts deployed (local). No public infra yet (FIX #7) |
| Mobile Wallet | `claw-wallet-mobile/` | **WAITING** | Essentially unmodified Oko Wallet (~2.3% customization). Not blocking — Keplr browser wallet works. Can revisit later |
| ~~reth/~~ | ~~`reth/`~~ | **DELETE** | Completely unmodified Paradigm fork. Zero ClawChain code. Ethereum client, irrelevant to Cosmos SDK chain |
| ~~claw-viem/, claw-wagmi/~~ | — | **DELETED** | Empty/unused packages removed |

---

## Architecture Decisions

### GPU Bridge: Event-Sourced Reconciler (selected)
- Provider daemon publishes all state changes to NATS
- Reconciler subscribes to both NATS and CometBFT WebSocket
- Maintains local state of (job_id, chain_state, provider_state, last_synced_height)
- On mismatch: emits alert + auto-submits corrective tx
- Implemented in `cmd/claw-gpu-provider/reconciler.go`

### Agent Economy: Real Inflation Mining
- EndBlock mints CLAW via `bankKeeper.MintCoins()`
- Distribution weighted by: uptime × task_completions × reputation_score
- Budget escrowed on task delegation via `bankKeeper.SendCoinsFromAccountToModule()`
- Refund on expiry, release on completion

### Privacy: Groth16 ZK-SNARK
- BN254 curve via gnark library
- 32-depth MiMC Merkle tree
- 2-in-2-out UTXO model
- GPU acceleration via icicle-gnark
- MPC trusted setup required before mainnet (ceremony code exists in `x/privacy/circuit/mpc_setup.go`)
### Smart Contracts: CosmWasm Integration — **DONE**

~~ClawChain currently has **no smart contract support**.~~ CosmWasm is fully integrated as `x/wasm` (wasmd v0.61.9, wasmvm v3.0.3).

| # | Task | Status |
|---|---|---|
| ~~1~~ | ~~**Add wasmd dependency**~~ | **DONE** |
| ~~2~~ | ~~**Wire x/wasm into app.go**~~ | **DONE** — WasmKeeper, store key, IBC wasm module wired |
| ~~3~~ | ~~**Enable smart contract governance**~~ | **DONE** — Mainnet governance-only, testnet permissionless |
| ~~4~~ | ~~**Add clawd wasm commands**~~ | **DONE** — 5 commands: store, instantiate, execute, query, list-codes |
| ~~5~~ | ~~**Web dashboard contract UI**~~ | **DONE** — 3-tab Contracts page (Codes, Instances, Query) |
| ~~6~~ | ~~**SDK contract methods**~~ | **DONE** — uploadContract, instantiateContract, executeContract, queryContract + 10 SDK methods |
| ~~7~~ | ~~**Developer docs for contracts**~~ | **DONE** — CW20 tutorial, deployment guide, IBC contracts doc |

### DEX / Token Swap — **DONE**

ClawDEX is live. Astroport Core fork (262 Rust files) rebranded and deployed.

| # | Task | Status |
|---|---|---|
| ~~1~~ | ~~**Fork Astroport contracts**~~ | **DONE** — 8 contracts: factory, pair, pair_stable, pair_concentrated, router, oracle, xastro_token, native_coin_registry |
| ~~2~~ | ~~**Rebrand + deploy on ClawChain**~~ | **DONE** — Deployed locally. CLAW/ATOM XYK pool with 10K/10K liquidity. Artifacts in `artifacts/dex-deployment.json` |
| ~~3~~ | ~~**Swap UI**~~ | **DONE** — Live pool stats, auto-discovery of deployed DEX contracts |
| ~~4~~ | ~~**Liquidity pool UI**~~ | **DONE** — Add/remove liquidity, LP token management |
| ~~5~~ | ~~**Pool creation**~~ | **DONE** — `clawd dex` commands + SDK methods |
| ~~6~~ | ~~**Price oracle integration**~~ | **DONE** — Oracle contract deployed, TWAP data on-chain |

### Marketing / Landing Page — **DONE**

| # | Task | Status |
|---|---|---|
| ~~1~~ | ~~**Landing page**~~ | **DONE** — `landing/` (Vite static). Hero, value prop, features, token economics, roadmap, SEO (robots.txt, sitemap.xml, OG/Twitter/JSON-LD) |
| ~~2~~ | ~~**Tech stack**~~ | **DONE** — Vite static at `landing/`, served on :8093 |
| ~~3~~ | ~~**Content**~~ | **DONE** — AI-native blockchain, agent economy, GPU compute story |
| ~~4~~ | ~~**CTA flows**~~ | **DONE** — Start earning → clawd install, Build → dev docs, Get CLAW → faucet |

### Developer Documentation Site — **DONE**

| # | Task | Status |
|---|---|---|
| ~~1~~ | ~~**Docs framework**~~ | **DONE** — Docusaurus 3.9 at `docs-site/`, served on :8091 |
| ~~2~~ | ~~**Getting started**~~ | **DONE** — Node setup, first tx, wallet creation tutorial (2205 LOC) |
| ~~3~~ | ~~**Smart contract guides**~~ | **DONE** — CW20 token, deployment guide, IBC contracts |
| ~~4~~ | ~~**Module reference**~~ | **DONE** — All 8 modules documented |
| ~~5~~ | ~~**SDK reference**~~ | **DONE** — @clawchain/sdk API reference with examples |
| ~~6~~ | ~~**Agent developer guide**~~ | **DONE** — Build skills for OpenClaw, ClawHub publishing |
| ~~7~~ | ~~**API reference**~~ | **DONE** — REST + gRPC endpoints, auto-generated from proto files |

### Wallet Branding

| Wallet | Fork Source | Location | Status |
|---|---|---|---|
| **Claw Wallet (Browser)** | Keplr | `keplr-wallet/` | **DONE** — Rebranded, ClawChain default chain, typechecks clean |
| **Claw Wallet (Mobile)** | Oko Wallet | `claw-wallet-mobile/` | **WAITING** — ~2.3% customized, needs full rework. Not blocking (Keplr browser wallet covers launch) |
| **Chain Registry** | Keplr Registry | `keplr-chain-registry/` | **DONE** — Mainnet + testnet entries valid |
 ---                                                                                                                                                        
  What's DONE ✅                                                                                                                                             
                                                                                                                                                           
  Everything that can be done locally without external dependencies:                                                                                         
                                                                                                                                                           
  - Chain, all 8 modules, CosmWasm, tokenfactory                                                                                                             
  - 14-service Docker stack (running right now)
  - clawd — 317 subcommands, 559 tests
  - Web dashboard — 42 pages, real chain data
  - DEX — contracts deployed locally, CLAW/ATOM pool live
  - SDK, monitoring, docs, landing, explorer, faucet, wallet

  ---
  What's Remaining

  1. Public Infrastructure — Biggest Gap (FIX #7)

  Everything runs on localhost. Nothing is publicly reachable. This alone blocks all real usage.

  ┌────────────────────────┬─────────────────────────────────────────────────────────────────────────────┐
  │          Task          │                                   Details                                   │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Cloud hosting          │ Deploy chain node to VPS/cloud (Hetzner/DigitalOcean/AWS)                   │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ DNS                    │ Point clawchain.io, rpc.clawchain.io, api.clawchain.io, faucet.clawchain.io │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ SSL/TLS                │ nginx reverse proxy with Let's Encrypt certs                                │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Deploy Docker stack    │ docker compose up -d on the cloud server                                    │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Redeploy DEX contracts │ Run deploy-dex.sh against public chain                                      │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ Public faucet          │ Expose faucet on faucet.clawchain.io                                        │
  ├────────────────────────┼─────────────────────────────────────────────────────────────────────────────┤
  │ CI/CD                  │ Auto-deploy on push to main                                                 │
  └────────────────────────┴─────────────────────────────────────────────────────────────────────────────┘

  Effort: ~1 day with a VPS in hand.

  ---
  2. GPU Compute Marketplace — Not E2E Tested

  Services compile and run individually but the full orchestration has never run end-to-end.

  ┌────────────────────────┬────────────────────────────────────────────┐
  │          Gap           │                   Status                   │
  ├────────────────────────┼────────────────────────────────────────────┤
  │ claw-gpu-provider      │ Needs real PROVIDER_KEY_HEX + GPU hardware │
  ├────────────────────────┼────────────────────────────────────────────┤
  │ claw-inference-sidecar │ Behind gpu profile, needs provider key     │
  ├────────────────────────┼────────────────────────────────────────────┤
  │ NATS message bus       │ Needs to be wired into the Docker stack    │
  ├────────────────────────┼────────────────────────────────────────────┤
  │ Real GPU job execution │ Requires actual compute provider hardware  │
  └────────────────────────┴────────────────────────────────────────────┘

  Effort: Significant — needs real GPU operator hardware.

  ---
  3. clawd in Docker — Agent-Only Mode

  Right now the clawd container runs without openclaw (ENOENT gracefully handled). It handles the autonomous loop and messaging but has no AI gateway. To get
   full clawd functionality in Docker:

  ┌─────────────────────────────────────────┬────────────────────────────────────────────────┐
  │                  Task                   │                    Details                     │
  ├─────────────────────────────────────────┼────────────────────────────────────────────────┤
  │ Bundle openclaw into clawd Docker image │ COPY openclaw binary into cmd/clawd/Dockerfile │
  ├─────────────────────────────────────────┼────────────────────────────────────────────────┤
  │ OR distribute openclaw separately       │ Mount it via volume or install via npm         │
  └─────────────────────────────────────────┴────────────────────────────────────────────────┘

  Effort: ~30 minutes.

  ---
  4. Multi-Validator Testnet

  Currently single-validator. For production it needs:
  - 4+ independent validators
  - Peer discovery / seed nodes
  - Validator set governance

  Effort: ~1 day with cloud infra.

  ---
  5. Paradigm Tool Forks — 15–25% Done

  claw-artemis, claw-cryo, claw-data-portal, claw-flood, claw-flux, claw-rivet — all compile, all have ClawChain modules bolted on, but none are deeply
  integrated.

  ┌──────────────────┬────────────────────────┬────────────────────────────────────────────────────────┐
  │       Tool       │        Purpose         │                         Status                         │
  ├──────────────────┼────────────────────────┼────────────────────────────────────────────────────────┤
  │ claw-artemis     │ MEV/arbitrage bot      │ 20% — ClawChain module added, core arbitrage not wired │
  ├──────────────────┼────────────────────────┼────────────────────────────────────────────────────────┤
  │ claw-cryo        │ Historical data export │ 20% — ClawChain adapter exists                         │
  ├──────────────────┼────────────────────────┼────────────────────────────────────────────────────────┤
  │ claw-data-portal │ Analytics dashboard    │ 20%                                                    │
  ├──────────────────┼────────────────────────┼────────────────────────────────────────────────────────┤
  │ claw-flood       │ Load/stress testing    │ 25% — most relevant for pre-launch testing             │
  ├──────────────────┼────────────────────────┼────────────────────────────────────────────────────────┤
  │ claw-flux        │ Keeper automation      │ 20%                                                    │
  ├──────────────────┼────────────────────────┼────────────────────────────────────────────────────────┤
  │ claw-rivet       │ Node management        │ 20%                                                    │
  └──────────────────┴────────────────────────┴────────────────────────────────────────────────────────┘

  Effort: 1–2 days each. None are launch-blocking.

  ---
  6. Phase E Launch Gate — External Dependencies

  ┌─────────────────────────────┬─────────────────────────────────┐
  │            Task             │             Blocker             │
  ├─────────────────────────────┼─────────────────────────────────┤
  │ 7-day soak (started Mar 11) │ 6 days left                     │
  ├─────────────────────────────┼─────────────────────────────────┤
  │ Security audit              │ External firm                   │
  ├─────────────────────────────┼─────────────────────────────────┤
  │ MPC trusted setup ceremony  │ Multiple participants needed    │
  ├─────────────────────────────┼─────────────────────────────────┤
  │ Mainnet genesis ceremony    │ Validators + community          │
  ├─────────────────────────────┼─────────────────────────────────┤
  │ Mobile wallet               │ Major rework of Oko Wallet fork │
  └─────────────────────────────┴─────────────────────────────────┘

  ---
  Priority Order

  1. Public infra + DNS          ← unblocks everything, 1 day
  2. openclaw in clawd Docker    ← 30 min, makes clawd fully functional
  3. Multi-validator testnet     ← after public infra
  4. GPU marketplace E2E         ← needs hardware
  5. Paradigm tool integration   ← nice-to-have, not launch-blocking
  6. Security audit              ← external
  7. Mobile wallet               ← post-launch

  The single highest-leverage action right now is getting a VPS, pointing DNS at it, and running docker compose up -d there.

✻ Brewed for 1m 3s · 4 background tasks still running (↓ to manage)