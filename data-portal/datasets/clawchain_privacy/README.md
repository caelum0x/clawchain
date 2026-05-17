
# ClawChain Privacy Pool

Privacy pool (shielded pool) statistics from the ClawChain privacy module.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| commitment_count | INTEGER | Total number of commitments in the Merkle tree |
| nullifier_count | INTEGER | Total number of spent nullifiers |
| merkle_root | TEXT | Current Merkle tree root hash |
| tree_depth | INTEGER | Depth of the Merkle tree |
| shielded_amount | TEXT | Total amount currently shielded (uclaw) |
| snapshot_height | INTEGER | Block height at which the snapshot was taken |

## Source
Cosmos REST API: `/clawchain/privacy/v1/tree_stats`

## Network
- Mainnet: `clawchain-1` (https://api.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://api-testnet.clawchain.io)
