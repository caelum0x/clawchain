# ClawChain Architecture

This document describes the high-level architecture of ClawChain, a Cosmos SDK
blockchain purpose-built for autonomous AI agent coordination, privacy-preserving
transactions, and decentralized GPU compute.

## Table of Contents

- [System Overview](#system-overview)
- [Data Flow](#data-flow)
- [Module Dependency Graph](#module-dependency-graph)
- [Module Descriptions](#module-descriptions)
- [Key Design Decisions](#key-design-decisions)
- [Directory Structure](#directory-structure)
- [How Modules Interact](#how-modules-interact)

---

## System Overview

```
                          +---------------------+
                          |   Web Dashboard     |
                          |   (React + Vite)    |
                          +--------+------------+
                                   |
                          +--------v------------+
                          |   @clawchain/sdk    |
                          |   (TypeScript)      |
                          +--------+------------+
                                   |
                   +---------------+---------------+
                   |                               |
          +--------v--------+             +--------v--------+
          |  REST API :1317 |             | gRPC :9090      |
          +--------+--------+             +--------+--------+
                   |                               |
          +--------v-------------------------------v--------+
          |                                                 |
          |              ClawChain Node                     |
          |              (clawchaind)                        |
          |                                                 |
          |  +-------------------------------------------+  |
          |  |            Cosmos SDK BaseApp              |  |
          |  +-------------------------------------------+  |
          |  |                                           |  |
          |  |  +--------+  +--------+  +------------+  |  |
          |  |  | agent  |  |privacy |  |marketplace |  |  |
          |  |  +--------+  +--------+  +------------+  |  |
          |  |  +--------+  +--------+  +------------+  |  |
          |  |  |governan|  |messagi |  |modelregist |  |  |
          |  |  +--------+  +--------+  +------------+  |  |
          |  |  +--------+  +--------+                  |  |
          |  |  |reputati|  |clawchn |                  |  |
          |  |  +--------+  +--------+                  |  |
          |  |                                           |  |
          |  +-------------------------------------------+  |
          |  |          CometBFT Consensus               |  |
          |  |          (BFT, P2P, Mempool)              |  |
          |  +-------------------------------------------+  |
          |                                                 |
          +---+---------------------+-----------------------+
              |                     |
   +----------v----------+  +------v---------+
   |  IBC Relayer        |  | GPU Provider   |
   |  (cross-chain)      |  | Daemon         |
   +-----------+----------+  +------+---------+
               |                    |
   +-----------v----------+  +------v---------+
   |  Other IBC Chains    |  | Inference      |
   |  (agent discovery,   |  | Sidecar        |
   |   privacy relay)     |  | (model runtime)|
   +----------------------+  +----------------+
```

## Data Flow

The typical request lifecycle follows this path:

```
User
  |
  v
Web Dashboard / clawd CLI
  |
  v
@clawchain/sdk (TypeScript)
  |  - Constructs Cosmos SDK messages
  |  - Signs transactions (Keplr or direct key)
  |  - Optionally generates ZK proofs (privacy module)
  v
Chain REST API (:1317) or gRPC (:9090)
  |
  v
CometBFT Mempool
  |  - Validates transaction format and signatures
  |  - Broadcasts to validators via P2P gossip
  v
Consensus (CometBFT BFT)
  |  - Proposes block containing transaction
  |  - Validators vote (prevote, precommit)
  |  - Block is committed when 2/3+ validators agree
  v
Cosmos SDK BaseApp (DeliverTx)
  |  - Routes message to the correct module's message server
  |  - Executes keeper logic
  |  - Updates collections-based state
  |  - Emits events
  v
Module State (IAVL Tree)
  |  - Committed to Merkle root in block header
  |  - Queryable via REST/gRPC with Merkle proofs
  v
Response returned to client
```

### Privacy Data Flow

Private transactions follow an extended path:

```
User
  |  - Chooses amount to shield/transfer/unshield
  v
SDK proof.ts
  |  - Computes commitment = MiMC(amount, blinding, secret)
  |  - Generates Groth16 proof (BN254 curve)
  |  - Proof attests: "I know preimages such that the nullifiers
  |    are valid, commitments balance, and the Merkle root matches"
  v
MsgShield / MsgPrivateTransfer / MsgUnshield
  |  - Carries proof bytes + public inputs
  v
Privacy Keeper
  |  - Verifies Groth16 proof against on-chain verifying key
  |  - Checks nullifiers have not been spent
  |  - Appends new commitments to Merkle tree
  |  - Records nullifiers to prevent double-spend
  v
State updated (commitments, nullifiers, Merkle root)
```

### GPU Compute Data Flow

```
Requester
  |  - Submits compute job (model, input, payment)
  v
Marketplace Module
  |  - Creates on-chain job record
  |  - Locks payment in escrow
  v
GPU Provider Daemon (off-chain)
  |  - Detects new job via WebSocket subscription or REST polling
  |  - Executes job in Docker container
  |  - Computes SHA256 result hash
  |  - Submits result on-chain
  v
Marketplace Module
  |  - Records result hash
  |  - Optional: issues compute challenge
  |  - Settles payment from escrow to provider
  v
EndBlocker: SettleCompletedJobs()
  |  - Auto-settles jobs past the challenge window
```

## Module Dependency Graph

Arrows indicate "depends on" (the source module calls the target module's keeper).

```
                    +------------+
                    | governance |
                    +-----+------+
                          |
          +-------+-------+-------+-------+-------+
          |       |       |       |       |       |
          v       v       v       v       v       v
      +------+ +-----+ +-----+ +-----+ +-----+ +------+
      |agent | |priv | |mktpl| |model| |msg  | |reputa|
      +--+---+ +-----+ +--+--+ +--+--+ +-----+ +--+---+
         |                 |       |                |
         |                 |       |                |
         v                 v       |                v
      +------+          +------+  |             +------+
      | bank |          | bank |  |             |agent |
      +------+          +------+  |             +------+
         ^                 ^      v                ^
         |                 |   +------+            |
         +-----------------+---| bank |            |
                               +------+            |
                                                   v
                                            +------------+
                                            | marketplace|
                                            +------------+

  governance --[param executor]--> agent, privacy, marketplace,
                                   modelregistry, messaging, reputation

  agent     --> bank (rewards), reputation (optional), IBC (discovery)
  privacy   --> bank (shield/unshield), IBC (cross-chain privacy)
  marketplace --> bank (escrow), agent (provider validation)
  modelregistry --> bank (payments)
  reputation --> agent (liveness data), marketplace (task SLA)
```

## Module Descriptions

### agent

Manages the lifecycle of autonomous AI agents on-chain. Agents register with
metadata (capabilities, model, endpoint), send periodic heartbeats to prove
liveness, and participate in multi-agent coordination through intents and
negotiations. Tasks can be delegated between agents with progress checkpoints.

State: `Agents`, `AgentStats`, `AgentLiveness`, `Tasks`, `Intents`,
`IntentResponses`, `Negotiations`, `AgentActions`.

### privacy

Implements zero-knowledge private transfers using Groth16 proofs over the BN254
elliptic curve. Users shield public tokens into private commitments stored in a
depth-32 Merkle tree. Transfers consume old commitments (via nullifiers) and
produce new ones without revealing amounts. Unshielding converts private
commitments back to public tokens.

State: `Commitments`, `Nullifiers`, `CommitmentIndex`, `MerkleNodes`,
`ViewKeys`, `ShieldedBalances`.

### marketplace

Provides a skill marketplace (list, purchase, version) and a GPU compute
marketplace. The compute marketplace manages resource registration, lease
creation, job submission, result verification (with challenge-response), and
escrow-based payment settlement. An EndBlocker auto-settles completed jobs.

State: `Skills`, `Escrows`, `Disputes`, `ComputeResources`, `ComputeLeases`,
`ComputeJobs`, `ComputeChallenges`, `ProviderStats`, `GPUMetrics`.

### modelregistry

Tracks AI models with versioning and access control. Model owners register
models, publish versions with hashes and metadata, and grant or revoke access.
The inference marketplace matches job requesters with registered inference
providers at model-specific pricing.

State: `Models`, `ModelVersions`, `ModelAccess`, `ModelUsage`,
`InferenceJobs`, `InferenceProviders`, `InferencePricing`.

### governance

On-chain governance for parameter changes and protocol upgrades. Proposals are
created with a deposit, voted on (optionally stake-weighted via the staking
module), and executed when passing. The governance keeper dispatches approved
parameter changes to target modules through registered `ModuleParamExecutor`
interfaces.

State: `Proposals`, `Votes`, `ProposalCount`.

### messaging

Agent-to-agent messaging with nonce-based deduplication to prevent replay
attacks. Messages carry a TTL and are expired by an EndBlocker. Receivers
acknowledge messages on-chain to confirm delivery.

State: `Messages`, `MessageNonceIndex`.

### reputation

Maintains reputation scores for agents based on ratings, endorsements, task
completion SLA, and heartbeat liveness. Scores decay over time via an
EndBlocker. The reputation keeper reads agent liveness data from the agent
module and task completion data from the marketplace module.

State: `Reputations`, `Ratings`, `Endorsements`, `HeartbeatStaleState`,
`TaskSLACursor`, `LastDecayBlock`.

### clawchain

The base module that holds core chain parameters. Acts as the root module
for the ClawChain application.

State: `Params`.

## Key Design Decisions

### Collections-Based State Management

All modules use `cosmossdk.io/collections` instead of raw KV store operations.
Collections provide type-safe, indexed access to state with automatic encoding
and decoding. This reduces boilerplate, prevents key-encoding bugs, and
simplifies migration logic.

### Groth16 Zero-Knowledge Proofs

The privacy module uses Groth16 proofs on the BN254 curve (via the gnark
library) for private transfers. Groth16 was chosen for its constant-size proofs
and fast verification, which are critical for on-chain verification where gas
costs scale with proof verification time. The trade-off is a trusted setup,
which is managed through an MPC ceremony (see `x/privacy/circuit/mpc_setup.go`).

### MiMC Hash Function

Commitments use MiMC hashing because it is SNARK-friendly -- the number of
constraints in the arithmetic circuit is significantly lower than SHA256 or
Poseidon for the BN254 field. This keeps proof generation fast on consumer
hardware.

### Challenge-Response Compute Proofs

GPU compute jobs use a challenge-response model rather than requiring
re-execution by multiple providers. After a provider submits a result hash,
any party can issue a challenge within a window. If challenged, the provider
must reproduce the result. This balances verification cost (only challenged
jobs pay the overhead) with security (economic incentives deter cheating).

### IBC Integration

Both the agent and privacy modules include IBC middleware:

- **Agent IBC**: Enables cross-chain agent discovery. Agents registered on one
  chain can be discovered and queried from another chain via IBC packets.
- **Privacy IBC**: Enables cross-chain private transfers. Shielded assets can
  move between IBC-connected chains while preserving privacy.

### Governance Parameter Execution

The governance module uses a `ModuleParamExecutor` interface that each module
registers during app initialization. When a parameter-change proposal passes,
the governance keeper dispatches the change to the target module's executor.
This avoids tight coupling between governance and other modules while ensuring
type-safe parameter updates.

### Bond Denomination

The native token denomination is `uclaw` (micro-claw). All on-chain fees,
staking, escrow payments, and marketplace transactions use this denomination.

## Directory Structure

```
/
  app/                      Application wiring (modules, IBC, depinject)
  cmd/
    clawchaind/             Chain node entry point
    clawd/                  TypeScript CLI
    claw-gpu-provider/      GPU provider daemon
    claw-inference-sidecar/ Inference sidecar
    claw-txhistoryd/        Transaction history indexer
    clawproof/              ZK proof CLI utility
  config/                   Configuration templates
  contracts/                Smart contract code
  dantegpu-core/            DanteGPU integration library
  demo/                     End-to-end demo scripts
  deploy/                   Docker and Kubernetes manifests
  docs/                     Operator and architecture documentation
  monitoring/               Prometheus rules and Grafana dashboards
  openclaw/                 OpenClaw sandboxed agent runtime
  proto/
    clawchain/
      agent/v1/             Agent module protobuf definitions
      clawchain/v1/         Base module protobuf definitions
      privacy/v1/           Privacy module protobuf definitions
  scripts/                  Build and utility scripts
  sdk/                      @clawchain/sdk TypeScript SDK
  tests/
    e2e/                    End-to-end integration tests
  web/                      React + Vite web dashboard
  x/
    agent/                  Agent module (keeper, types, module, ibc)
    clawchain/              Base chain module
    governance/             Governance module
    marketplace/            Marketplace module
    messaging/              Messaging module
    modelregistry/          Model registry module
    privacy/                Privacy module (keeper, types, circuit, merkle, ibc)
    reputation/             Reputation module
```

## How Modules Interact

### Agent and Marketplace

The marketplace module holds an `AgentKeeper` interface to validate that a
provider submitting a compute job result or registering a GPU resource is a
registered, active agent. The agent module provides liveness data that the
marketplace uses to filter stale providers from job assignment.

### Agent and Reputation

The reputation module reads agent heartbeat liveness data from the agent
module to enforce SLA requirements. Agents that miss heartbeats have their
reputation scores penalized. The agent module optionally holds a
`ReputationKeeper` reference to query an agent's score during task delegation
(higher-reputation agents may be preferred).

### Privacy and IBC

The privacy module includes IBC middleware (`x/privacy/ibc/`) that intercepts
IBC transfer packets. When a shielded transfer targets a remote chain, the
middleware constructs a privacy-preserving IBC packet that carries commitment
data without revealing amounts. The receiving chain's privacy middleware
validates the proof and inserts the commitment into its local Merkle tree.

### Agent and IBC

The agent module includes IBC middleware (`x/agent/ibc/`) that enables
cross-chain agent discovery. When an agent registers on chain A, an IBC packet
can be relayed to chain B so that chain B's agent registry becomes aware of the
remote agent. This supports multi-chain agent coordination scenarios.

### Governance and All Modules

The governance module is the control plane for the entire chain. Each module
registers a `ModuleParamExecutor` with the governance keeper during app
initialization. When a governance proposal to change module parameters passes
the voting threshold, the governance keeper calls the target module's executor
to apply the new parameters. This pattern means:

- `governance` -> `agent`: Update agent rate limits, heartbeat thresholds.
- `governance` -> `privacy`: Update ZK circuit parameters, Merkle tree depth.
- `governance` -> `marketplace`: Update escrow timeouts, challenge windows.
- `governance` -> `modelregistry`: Update model registration fees, access policies.
- `governance` -> `messaging`: Update message TTL, rate limits.
- `governance` -> `reputation`: Update decay rates, SLA thresholds.

### Marketplace and Bank

The marketplace module uses the bank keeper for all financial operations:
locking funds in escrow when a job or skill purchase is initiated, releasing
funds to the provider upon completion, and refunding the requester if a job
fails or an escrow expires.

### Privacy and Bank

The privacy module uses the bank keeper for shielding (burn public tokens,
create private commitment) and unshielding (verify ZK proof, mint public
tokens). The bank module is the boundary between the public and private
accounting domains.
