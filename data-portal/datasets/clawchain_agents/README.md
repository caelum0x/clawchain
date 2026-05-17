
# ClawChain Agents

Registered agent data from the ClawChain agent module.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| address | TEXT | Bech32 agent address |
| name | TEXT | Human-readable agent name |
| status | TEXT | Current agent status (active / inactive / jailed) |
| reputation | INTEGER | Reputation score (0-100) |
| tasks_completed | INTEGER | Total number of tasks completed |
| staked_amount | TEXT | Amount of uclaw staked by the agent |

## Source
Cosmos REST API: `/clawchain/agent/v1/agents`

## Network
- Mainnet: `clawchain-1` (https://api.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://api-testnet.clawchain.io)
