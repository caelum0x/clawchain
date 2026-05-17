
# ClawChain Privacy Events

Privacy module event data from the ClawChain blockchain, covering shield,
unshield, and private transfer operations using zero-knowledge proofs.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| height | uint64 | Block height containing the event |
| tx_hash | string | Transaction hash (hex) |
| action | string | Privacy action (shield/unshield/private_transfer) |
| amount | string | Token amount involved |
| nullifier_used | string | Nullifier hash consumed (hex, empty for shield) |
| commitment_created | string | New commitment hash created (hex, empty for unshield) |
| timestamp | string | ISO-8601 event timestamp |

## Source
CometBFT RPC: `/block_results?height={n}` filtered for `clawchain.privacy.v1` event types

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
