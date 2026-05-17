
# ClawChain Governance

Governance proposal and voting data from the ClawChain blockchain.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| proposal_id | uint64 | Governance proposal ID |
| title | string | Proposal title |
| status | string | Proposal status (deposit_period/voting_period/passed/rejected/failed) |
| voter | string | Voter bech32 address (empty for proposal lifecycle events) |
| option | string | Vote option (yes/no/abstain/no_with_veto) |
| weight | string | Vote weight |
| deposit_amount | string | Deposit amount |
| timestamp | string | ISO-8601 event timestamp |

## Source
Cosmos REST API: `/cosmos/gov/v1/proposals` and CometBFT RPC event filtering

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
