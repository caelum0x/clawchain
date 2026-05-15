# Claw Tx History API Contract

This document defines the minimum HTTP contract needed by the Claw Wallet extension.
The current implementation queries ClawChain LCD (`/cosmos/tx/v1beta1/txs` and `/cosmos/tx/v1beta1/txs/{hash}`) and maps results into wallet history schema.
It now also classifies additional message families (`authz MsgExec`, `bank MsgMultiSend`, `gov MsgVoteWeighted`, `distribution MsgWithdrawDelegatorReward`, `distribution MsgWithdrawValidatorCommission`, `distribution MsgFundCommunityPool`) into wallet-supported relations where possible.

Default local base URL:
- `http://127.0.0.1:17171`

## Endpoints

### 1) Supported chains
- `GET /tx-history/supports`
- Response: JSON array of chain identifiers

Example:
```json
["clawchain", "clawchain-testnet"]
```

### 2) Explorer template by chain
- `GET /tx-history/explorer/{chainIdentifierOrChainId}`
- Response:

```json
{ "link": "https://explorer.clawchain.dev/tx/{txHash}" }
```

Notes:
- Wallet replaces placeholders:
  - `{txHash}`
  - `{txHash:lowercase}`
  - `{txHash:uppercase}`

### 3) Multi-chain history (activities page)
- `GET /history/v2/msgs/keplr-multi-chain`
- Query params used by wallet:
  - `baseHexAddress`
  - `chainIdentifiers`
  - `relations`
  - `vsCurrencies`
  - `limit`
  - `cursor` (optional)
  - `otherHexAddresses` (optional)
- Response:

```json
{
  "msgs": [],
  "nextCursor": "",
  "pagination": {
    "limit": 20,
    "next_cursor": "",
    "has_more": false
  }
}
```

### 4) Single-chain history (token detail)
- `GET /history/v2/msgs/{chainIdentifier}/{address}`
- Query params used by wallet:
  - `relations`
  - `denoms`
  - `vsCurrencies`
  - `limit`
  - `cursor` (optional)
- Response:

```json
{
  "msgs": [],
  "nextCursor": "",
  "pagination": {
    "limit": 20,
    "next_cursor": "",
    "has_more": false
  }
}
```

### 5) Legacy history path (earn screens)
- `GET /history/msgs/{chainIdentifier}/{address}`
- Same response shape as v2.

### 5b) Earnings aggregation (windowed)
- `GET /history/v2/earnings/{chainIdentifier}/{address}`
- Query params:
  - `window` (default `7d`, supports `24h`, `7d`, `30d`, etc.)
- Response:

```json
{
  "address": "claw1...",
  "chainId": "clawchain-1",
  "chainIdentifier": "clawchain",
  "window": "7d",
  "since": "2026-02-21T00:00:00Z",
  "scannedItems": 123,
  "totals": [{ "denom": "uclaw", "amount": "12345" }],
  "breakdown": {
    "staking_rewards": [{ "denom": "uclaw", "amount": "1000" }],
    "task_fees": [{ "denom": "uclaw", "amount": "2000" }],
    "skill_sales": [{ "denom": "uclaw", "amount": "3000" }],
    "incoming_transfers": [{ "denom": "uclaw", "amount": "6345" }]
  }
}
```

### 6) Tx fee lookup by hash
- `GET /block/txs/by-hash/{chainIdentifier}/{txHash}`
- Response:

```json
{
  "authInfo": {
    "fee": {
      "amount": [],
      "gas_limit": "0",
      "payer": "",
      "granter": ""
    }
  }
}
```

### 7) Message lookup by tx + msg index
- `GET /block/msg/{chainIdentifier}/{txHash}/{msgIndex}`
- Response:

```json
{ "msg": {} }
```

## Health check
- `GET /healthz` -> `{ "status": "ok" }`

## Metrics
- `GET /metrics` -> Prometheus text exposition
- Includes:
  - `claw_txhistory_requests_total{path=...}`
  - `claw_txhistory_upstream_requests_total{type=...}`
  - `claw_txhistory_upstream_latency_seconds_sum{type=...}`
  - `claw_txhistory_price_cache_hits_total`
  - `claw_txhistory_price_cache_misses_total`

## Local server implementation
- Command: `go run ./cmd/claw-txhistoryd`
- Convenience script: `bash scripts/wallet/run-claw-tx-history.sh`
- Contract tests: `bash scripts/wallet/test-claw-tx-history.sh`

## Environment variables (server)
- `PORT` (default: `17171`)
- `CLAW_TX_HISTORY_SUPPORTS` (default: `clawchain,clawchain-testnet`)
- `CLAW_EXPLORER_MAINNET_TEMPLATE`
- `CLAW_EXPLORER_TESTNET_TEMPLATE`
- `CLAW_EXPLORER_DEFAULT_TEMPLATE`
- `CLAW_LCD_MAINNET` (default: `https://api.mainnet.clawchain.dev`)
- `CLAW_LCD_TESTNET` (default: `https://rest.testnet.clawchain.dev`)
- `CLAW_ENABLE_PRICE_ENRICHMENT` (`true`/`false`, default: `false`)
- `CLAW_COINGECKO_BASE_URL` (default: `https://api.coingecko.com/api/v3`)
- `CLAW_DENOM_PRICE_IDS` (CSV `denom:coingecko_id`, default: `uclaw:claw`)
- `CLAW_PRICE_CACHE_TTL_SECONDS` (default: `30`, max: `3600`)
