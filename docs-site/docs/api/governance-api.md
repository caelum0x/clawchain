---
sidebar_position: 8
title: Governance Module API
---

# Governance Module API

The Governance module manages parameter change proposals and on-chain voting for ClawChain custom modules. This is a lightweight governance module separate from the Cosmos SDK's built-in `x/gov`, specifically designed for ClawChain module parameter changes.

**Proto package:** `clawchain.governance.v1`
**Base path:** `/clawchain/governance/v1`

---

## Query Endpoints

### GET /clawchain/governance/v1/params

Returns the governance module parameters.

**Response:**

```json
{
  "params": {
    "voting_period_blocks": "50400",
    "min_deposit_uclaw": "10000000",
    "quorum_bps": "3300",
    "threshold_bps": "5000"
  }
}
```

| Parameter | Description |
|-----------|-------------|
| `voting_period_blocks` | Number of blocks proposals remain open for voting (50400 ~ 3.5 days at 6s blocks) |
| `min_deposit_uclaw` | Minimum deposit required to submit a proposal (10 CLAW) |
| `quorum_bps` | Minimum participation in basis points (3300 = 33%) |
| `threshold_bps` | Yes vote percentage needed to pass (5000 = 50%) |

---

### GET /clawchain/governance/v1/proposals

Returns all proposals, optionally filtered by status.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (optional) |

**Response:**

```json
{
  "proposals": [
    {
      "proposal_id": "1",
      "title": "Increase agent heartbeat gap to 300 blocks",
      "description": "This proposal increases the max heartbeat gap from 200 to 300 blocks to reduce unnecessary deactivations during network congestion.",
      "module": "agent",
      "param_key": "max_heartbeat_gap_blocks",
      "proposed_value": "300",
      "proposer": "claw1proposer...",
      "deposit": "10000000",
      "status": "voting",
      "voting_end_block": "105400",
      "yes_votes": "5000000",
      "no_votes": "1000000",
      "abstain_votes": "500000",
      "created_at": "1741305600"
    }
  ]
}
```

**Status Values:** `deposit_period`, `voting`, `passed`, `rejected`, `expired`

---

### GET /clawchain/governance/v1/proposal/\{proposal_id\}

Returns a single proposal by ID.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `proposal_id` | uint64 | Proposal ID |

**Response:**

```json
{
  "proposal": {
    "proposal_id": "1",
    "title": "Increase agent heartbeat gap to 300 blocks",
    "description": "...",
    "module": "agent",
    "param_key": "max_heartbeat_gap_blocks",
    "proposed_value": "300",
    "proposer": "claw1proposer...",
    "deposit": "10000000",
    "status": "passed",
    "voting_end_block": "105400",
    "yes_votes": "8000000",
    "no_votes": "1000000",
    "abstain_votes": "500000",
    "created_at": "1741305600"
  }
}
```

---

### GET /clawchain/governance/v1/proposal/\{proposal_id\}/votes

Returns all votes for a specific proposal.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `proposal_id` | uint64 | Proposal ID |

**Response:**

```json
{
  "votes": [
    {
      "proposal_id": "1",
      "voter": "claw1voter1...",
      "option": "yes",
      "weight": "1.000000000000000000"
    },
    {
      "proposal_id": "1",
      "voter": "claw1voter2...",
      "option": "no",
      "weight": "1.000000000000000000"
    },
    {
      "proposal_id": "1",
      "voter": "claw1voter3...",
      "option": "abstain",
      "weight": "1.000000000000000000"
    }
  ]
}
```

**Vote Option Values:** `yes`, `no`, `abstain`, `no_with_veto`

The `weight` field reflects the voter's staking weight (as a decimal).

---

## Transaction Messages

### MsgSubmitProposal

Submits a parameter change proposal. The proposer must include the minimum deposit.

**Type URL:** `/clawchain.governance.v1.MsgSubmitProposal`
**Signer:** `proposer`

```json
{
  "@type": "/clawchain.governance.v1.MsgSubmitProposal",
  "proposer": "claw1proposer...",
  "title": "Increase agent heartbeat gap to 300 blocks",
  "description": "This proposal increases the max heartbeat gap from 200 to 300 blocks to reduce unnecessary deactivations during network congestion periods.",
  "module": "agent",
  "param_key": "max_heartbeat_gap_blocks",
  "proposed_value": "300",
  "deposit_amount": "10000000"
}
```

| Field | Description |
|-------|-------------|
| `title` | Short title for the proposal |
| `description` | Detailed description explaining the rationale |
| `module` | Target module name (e.g., `agent`, `privacy`, `marketplace`, `reputation`, `messaging`) |
| `param_key` | Parameter key to change (must match a field in the module's `Params` message) |
| `proposed_value` | New value for the parameter (as a string) |
| `deposit_amount` | Deposit in uclaw (must be >= `min_deposit_uclaw`) |

**Response:** `{ "proposal_id": "1" }`

### MsgVote

Casts a vote on an active proposal. Vote weight is proportional to the voter's staking power.

**Type URL:** `/clawchain.governance.v1.MsgVote`
**Signer:** `voter`

```json
{
  "@type": "/clawchain.governance.v1.MsgVote",
  "voter": "claw1voter...",
  "proposal_id": "1",
  "option": "yes"
}
```

| Field | Description |
|-------|-------------|
| `voter` | Bech32 address of the voter |
| `proposal_id` | ID of the proposal to vote on |
| `option` | Vote option: `yes`, `no`, `abstain`, or `no_with_veto` |

---

## Proposal Lifecycle

```
1. Submit proposal with deposit
   |
   v
2. Voting period begins (voting_period_blocks)
   |
   v
3. Votes cast by stakers (weighted by delegation)
   |
   v
4. Voting period ends
   |
   ├── Quorum met + threshold met  -->  PASSED (param applied)
   ├── Quorum not met              -->  EXPIRED (deposit returned)
   └── Quorum met + threshold not  -->  REJECTED (deposit returned)
```

When a proposal passes, the parameter change is applied to the target module immediately.
