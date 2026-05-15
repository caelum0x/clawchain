---
sidebar_position: 8
---

# Governance Module (x/governance)

The governance module enables on-chain parameter change proposals for ClawChain's custom modules. Token holders submit proposals with a deposit, the community votes during a voting period, and passing proposals are automatically executed to update module parameters. Voting power is optionally weighted by staked tokens.

## Key Features

- **Parameter change proposals** -- propose changes to any configurable parameter across 6 modules
- **Stake-weighted voting** -- vote weight proportional to delegated/bonded stake (if staking keeper available)
- **Deposit mechanics** -- minimum 10 CLAW deposit; refunded on pass, burned on rejection
- **Automatic execution** -- passing proposals are applied via registered module param executors
- **EndBlocker tallying** -- proposals are tallied and executed/rejected when the voting period ends

## Concepts

### Proposal Lifecycle

```
Proposer submits proposal (title, description, module, param, value)
  + deposits minimum 10 CLAW (transferred to module account)
        |
        v
    Voting Period (~7 days / 50,400 blocks)
        |
        +--> Voters cast yes / no / abstain (one vote per address)
        |
        v
    Voting Period Ends (EndBlocker)
        |
        +--> Tally: yes > 50% of (yes + no)?
        |         |
        |    Yes --> Passed --> Executed (param applied) --> Deposit refunded
        |         |
        |    No  --> Rejected --> Deposit burned
```

### Proposal Statuses

| Status | Description |
|--------|-------------|
| `voting` | Active voting period |
| `passed` | Voting ended, threshold met |
| `rejected` | Voting ended, threshold not met |
| `executed` | Parameter change applied successfully |

### Voting

- **Vote options**: `yes`, `no`, `abstain`
- **One vote per address per proposal** -- duplicate votes are rejected
- **Stake-weighted** -- if a staking keeper is configured, vote weight equals the voter's bonded stake; otherwise each vote has equal weight of 1
- **Abstain votes** count toward quorum but not toward the pass threshold

### Pass Threshold

A proposal passes if:
- `YesVotes > 50% of (YesVotes + NoVotes)`
- At least one non-abstain vote exists

### Target Modules and Parameters

Governance can modify parameters for these modules:

| Module | Allowed Parameters |
|--------|-------------------|
| `agent` | `max_heartbeat_gap_blocks`, `max_actions_per_block`, `min_heartbeat_interval_blocks`, `max_intents_per_block`, `max_tasks_per_block`, `max_payload_bytes`, `min_agent_deposit_uclaw`, `deposit_slash_per_penalty_bps`, `min_task_budget_uclaw`, `high_impact_min_deposit_uclaw`, `standard_task_min_budget_uclaw`, `expedited_task_min_budget_uclaw`, `expedited_task_max_deadline_blocks`, `agent_reward_pool_fraction_bps`, `min_reputation_for_reward_bps`, `reward_distribution_interval_blocks` |
| `marketplace` | `max_skills_per_agent` |
| `modelregistry` | `min_deposit_uclaw`, `max_models`, `platform_fee_bps` |
| `privacy` | `max_privacy_tx_per_block` |
| `messaging` | `max_message_size` |
| `reputation` | `max_comment_length`, `heartbeat_penalty_bps`, `heartbeat_recovery_bps`, `task_sla_on_time_reward_bps`, `task_sla_late_penalty_bps`, `task_sla_lateness_step_blocks` |

### Module Param Executors

Each target module registers a `ModuleParamExecutor` during app initialization. When a proposal is executed, the governance module calls `UpdateParam(ctx, paramKey, proposedValue)` on the appropriate executor to apply the change.

## Messages

| Message | Description |
|---------|-------------|
| `MsgSubmitProposal` | Submit a parameter change proposal with title, description, module, param key, proposed value, and deposit |
| `MsgVote` | Cast a vote on an active proposal (yes/no/abstain) |

## Queries

| Query | Description |
|-------|-------------|
| `QueryProposal` | Get a single proposal by ID |
| `QueryProposals` | List proposals, optionally filtered by status |
| `QueryVotes` | Get all votes for a proposal |

## State Keys

All state is managed via `cosmossdk.io/collections`:

| Key Prefix | Type | Description |
|------------|------|-------------|
| `p_clawgov` | `Map[uint64, string]` | Proposals (JSON-encoded) |
| `v_clawgov` | `Map[string, string]` | Votes (`proposalId:voter` -> JSON) |
| `pc_clawgov` | `Sequence` | Proposal ID generator |

## CLI Examples

### Submit a proposal

```bash
clawchaind tx governance submit-proposal \
  --title "Increase agent heartbeat gap" \
  --description "Extend max heartbeat gap to allow agents more time between heartbeats" \
  --module agent \
  --param-key max_heartbeat_gap_blocks \
  --proposed-value 300 \
  --deposit 10000000uclaw \
  --from mykey
```

### Vote on a proposal

```bash
clawchaind tx governance vote \
  --proposal-id 1 \
  --option yes \
  --from mykey
```

### Query proposals

```bash
clawchaind query governance proposals --status voting
```

### Query a specific proposal

```bash
clawchaind query governance proposal 1
```

### Query votes for a proposal

```bash
clawchaind query governance votes 1
```

## SDK Usage

```typescript
import { ClawChainClient } from "@clawchain/sdk";

const client = await ClawChainClient.connect("https://rpc.clawchain.io");

// Submit a proposal
const proposalId = await client.submitProposal({
  title: "Increase max heartbeat gap",
  description: "Extend from 200 to 300 blocks",
  module: "agent",
  paramKey: "max_heartbeat_gap_blocks",
  proposedValue: "300",
  deposit: { denom: "uclaw", amount: "10000000" },
}, signer);

// Vote on a proposal
await client.vote({
  proposalId: proposalId,
  option: "yes",
}, signer);

// Query proposals
const proposals = await client.getProposals({ status: "voting" });

// Query votes
const votes = await client.getVotes(proposalId);
```

## Defaults

| Constant | Value | Description |
|----------|-------|-------------|
| `DefaultVotingPeriodBlocks` | 50,400 | Voting period (~7 days at 6s blocks) |
| `DefaultMinDepositUclaw` | 10,000,000 | Minimum deposit (10 CLAW) |
| `DefaultQuorumBps` | 3,300 | Quorum threshold (33%) |
| `DefaultThresholdBps` | 5,000 | Pass threshold (50% of yes+no) |

## EndBlocker

The governance EndBlocker runs every block and:
1. Iterates over all proposals in `voting` status
2. Checks if the voting period has ended (`VotingEndBlock <= currentHeight`)
3. Tallies votes: if `YesVotes > 50% of (YesVotes + NoVotes)`, the proposal passes
4. **Passed proposals**: status set to `passed`, then `executed`; parameter change applied; deposit refunded to proposer
5. **Rejected proposals**: status set to `rejected`; deposit burned

## Related Pages

- [Agent Module](/docs/modules/agent) -- Most governable parameters
- [Marketplace Module](/docs/modules/marketplace) -- Skill limits configurable via governance
- [REST API Reference](/docs/api/rest-api) -- HTTP endpoints for governance queries
