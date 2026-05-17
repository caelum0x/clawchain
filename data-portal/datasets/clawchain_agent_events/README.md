
# ClawChain Agent Events

Agent module event data from the ClawChain blockchain, covering agent registration,
heartbeats, task delegation, task acceptance, and task completion.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| height | uint64 | Block height containing the event |
| tx_hash | string | Transaction hash (hex) |
| action | string | Event action (register/heartbeat/delegate_task/complete_task/accept_task) |
| agent_address | string | Agent bech32 address |
| task_id | string | Task identifier (empty for non-task actions) |
| amount | string | Associated token amount (if any) |
| timestamp | string | ISO-8601 event timestamp |

## Source
CometBFT RPC: `/block_results?height={n}` filtered for `clawchain.agent.v1` event types

## Network
- Mainnet: `clawchain-1` (https://rpc.clawchain.io)
- Testnet: `clawchain-testnet-1` (https://rpc-testnet.clawchain.io)
