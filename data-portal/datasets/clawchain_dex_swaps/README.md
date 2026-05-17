
# ClawChain DEX Swaps

Decentralized exchange swap data from ClawDEX pools on the ClawChain blockchain.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| height | uint64 | Block height containing the swap |
| tx_hash | string | Transaction hash (hex) |
| pool_address | string | DEX pool contract address |
| sender | string | Swap initiator address (bech32) |
| offer_asset | string | Offered asset denomination |
| offer_amount | string | Offered asset amount |
| return_asset | string | Returned asset denomination |
| return_amount | string | Returned asset amount |
| spread | string | Spread amount |
| fee | string | Swap fee amount |

## Source
CometBFT RPC: `/block_results?height={n}` filtered for `wasm-swap` event types

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
