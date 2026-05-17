
# ClawChain Oracle Prices

Oracle price feed data from the ClawChain oracle module.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| denom_pair | TEXT | Denomination pair (e.g. CLAW/USD) |
| price | TEXT | Price as a decimal string |
| timestamp | TEXT | ISO-8601 timestamp of the price observation |
| block_height | INTEGER | Block height when the price was recorded |
| source | TEXT | Oracle source identifier |

## Source
Cosmos REST API: `/clawchain/oracle/v1/prices`

## Network
- Mainnet: `clawchain-1` (https://api.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://api-testnet.clawchain.io)
