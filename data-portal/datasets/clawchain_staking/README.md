
# ClawChain Staking

Staking event data from the ClawChain blockchain, covering delegation,
undelegation, redelegation, and reward claims.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| height | uint64 | Block height containing the event |
| tx_hash | string | Transaction hash (hex) |
| action | string | Staking action (delegate/undelegate/redelegate/claim_rewards) |
| delegator | string | Delegator bech32 address |
| validator | string | Validator operator address |
| amount | string | Staked or claimed amount |
| timestamp | string | ISO-8601 event timestamp |

## Source
CometBFT RPC: `/block_results?height={n}` filtered for `cosmos.staking` and `cosmos.distribution` event types

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
