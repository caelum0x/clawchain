
# ClawChain Transactions

Transaction-level data from the ClawChain Cosmos SDK blockchain.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| height | uint64 | Block height containing the transaction |
| tx_hash | string | Transaction hash (hex) |
| msg_type | string | Cosmos SDK message type URL |
| sender | string | Transaction sender address (bech32) |
| gas_used | uint64 | Gas consumed by the transaction |
| gas_wanted | uint64 | Gas requested by the transaction |
| fee_amount | string | Fee amount paid |
| fee_denom | string | Fee denomination (e.g. uclaw) |
| success | boolean | Whether the transaction succeeded |
| memo | string | Transaction memo field |

## Source
CometBFT RPC: `/tx_search` and Cosmos REST API: `/cosmos/tx/v1beta1/txs`

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
