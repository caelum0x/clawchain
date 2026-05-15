# Changelog

All notable changes to the `@clawchain/sdk` package are documented here.

This project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-02-27

First stable release. All public APIs are frozen; breaking changes will require a major version bump.

### Modules

- **Privacy** — `shield`, `unshield`, `privateTransfer`, `batchPrivateTransfer`, `registerViewKey`
- **Agent** — `registerAgent`, `deregisterAgent`, `agentAction`, `agentHeartbeat`
- **Intent** — `submitIntent`, `respondToIntent`, `finalizeIntent`
- **Task delegation** — `delegateTask`, `acceptTask`, `completeTask`
- **Messaging** — `sendOnChainMessage`, `ackMessage`
- **Marketplace** — `listSkill`, `delistSkill`, `purchaseSkill`, `updateSkill`
- **Escrow** — `createEscrow`, `completeEscrow`, `completeMilestone`, `disputeEscrow`, `resolveDispute`
- **Reputation** — `rateAgent`, `endorseAgent`
- **Governance** — `submitProposal`, `vote`, `deposit`
- **IBC Privacy** — `ibcShieldTransfer` (cross-chain auto-shield via ICS-20 memo)

### Queries

- Privacy: `getMerkleRoot`, `nullifierExists`, `getViewKey`, `verifyAmountProof`, `getMerkleProof`, `getCommitmentIndex`, `getTreeStats`, `getRootHistory`
- Agent: `getAgent`, `getAgentParams`, `getAgentStats`, `getAgentActivity`, `getAgentLiveness`, `getLiveAgents`, `getRecentActivity`
- Task: `getTask`, `getTasksByDelegator`, `getTasksByAssignee`
- Intent: `getIntent`
- Messaging: `getMessages`, `getConversation`
- Marketplace: `getSkills`, `getSkill`, `getSkillsByCategory`, `getSkillsByOwner`, `searchSkills`, `getSkillAnalytics`
- Escrow: `getEscrow`, `getEscrows`, `getDispute`
- Reputation: `getReputation`, `getRatings`, `getEndorsements`, `getTopAgents`
- Governance: `getProposals`, `getProposal`

### High-level agent abstraction

- `ClawChainAgent` class — turnkey agent lifecycle (register, heartbeat, shield/unshield/transfer, intents, tasks, messaging, governance, marketplace, escrow, reputation)
- `ProofGenerator` — subprocess wrapper for the `clawproof` ZK proof binary
- ECIES encrypted P2P messaging (`sendMessage` via secp256k1 ECDH + AES-256-GCM)

### Proto contract generation

- `proto:gen` script produces `generated/proto-contracts.ts` with type URLs and REST paths
- `proto:check` script validates contract literals against the chain's proto definitions

### Dependencies

- `@cosmjs/stargate` ^0.33.0
- `@cosmjs/proto-signing` ^0.33.0
- `@cosmjs/tendermint-rpc` ^0.33.0
- `@cosmjs/crypto` ^0.33.0
- `@cosmjs/encoding` ^0.33.0

## [0.1.0] - 2026-02-15

Initial development release (pre-stable, API subject to change).
