
# ClawChain Marketplace

Marketplace module event data from the ClawChain blockchain, covering skill
listings, purchases, escrow creation, and escrow releases.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| height | uint64 | Block height containing the event |
| tx_hash | string | Transaction hash (hex) |
| action | string | Marketplace action (list_skill/purchase_skill/create_escrow/release_escrow) |
| creator | string | Action initiator bech32 address |
| skill_id | string | Skill or listing identifier |
| price | string | Price amount |
| category | string | Skill category |
| timestamp | string | ISO-8601 event timestamp |

## Source
CometBFT RPC: `/block_results?height={n}` filtered for `clawchain.marketplace.v1` event types

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
