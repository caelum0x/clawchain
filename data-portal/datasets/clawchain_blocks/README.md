
# ClawChain Blocks

Block-level data from the ClawChain Cosmos SDK blockchain.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| height | uint64 | Block height |
| time | string | ISO-8601 block timestamp |
| hash | string | Block hash (hex) |
| proposer | string | Proposer validator address |
| num_txs | uint32 | Number of transactions in block |
| gas_used | uint64 | Total gas used |
| gas_wanted | uint64 | Total gas wanted |
| chain_id | string | Chain identifier |

## Source
CometBFT RPC: `/block?height={n}` and `/block_results?height={n}`

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
