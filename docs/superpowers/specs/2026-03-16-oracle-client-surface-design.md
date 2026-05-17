# Oracle Client Surface + Completeness Pass — Design Spec

> **Date**: 2026-03-16
> **Goal**: Make the oracle module fully queryable by external clients (REST, gRPC, CLI, SDK, web dashboard) and close remaining housekeeping gaps.

## Status Amendment — 2026-05-17

This design is historical. The PRD now records the oracle work as complete through the Terra Classic oracle fork and production client surface: `x/oracle`, price feeder, clawd oracle commands, SDK oracle methods, web Oracle dashboard, and REST routes under `/clawchain/oracle/v1beta1/`. Do not restart the older hand-written `/clawchain/oracle/v1/` gRPC surface from this March 16 draft unless a new design explicitly supersedes the Terra fork.

The repository packaging assumptions have also changed: forked dependencies are vendored as normal directories, not Git submodules. Use the current `readme.md` and `prd.md` for clone, funding, and repository-layout guidance.

## Background

The oracle module has a complete keeper with business logic (prevote/vote cycle, EndBlocker aggregation, TWAP, miss counting, price history) and 23 passing tests. However, it has **no gRPC service registration** — no `RegisterQueryServer`, no `RegisterMsgServer`, no REST gateway. Clients cannot interact with it. The proto files exist at `proto/clawchain/oracle/v1/` but the hand-written `.pb.go` files lack service descriptors and handlers.

## Section 1: Oracle gRPC Services (Go)

### Query Service — 6 RPCs

All query RPCs delegate to existing keeper methods. No new business logic needed.

| RPC | Keeper Method | REST Endpoint |
|-----|--------------|---------------|
| `Price(QueryPriceRequest)` | `QueryPrice(ctx, denomPair)` | `GET /clawchain/oracle/v1/price/{denom_pair}` |
| `Prices(QueryPricesRequest)` | `QueryPrices(ctx)` | `GET /clawchain/oracle/v1/prices` |
| `PriceHistory(QueryPriceHistoryRequest)` | `QueryPriceHistory(ctx, denomPair, limit)` | `GET /clawchain/oracle/v1/price_history/{denom_pair}` |
| `FeederDelegation(QueryFeederDelegationRequest)` | `QueryFeederDelegation(ctx, validator)` | `GET /clawchain/oracle/v1/feeder/{validator}` |
| `MissCounter(QueryMissCounterRequest)` | `QueryMissCounter(ctx, validator)` | `GET /clawchain/oracle/v1/miss/{validator}` |
| `Params(QueryParamsRequest)` | `GetParams(ctx)` | `GET /clawchain/oracle/v1/params` |

### Msg Service — 3 RPCs

All msg RPCs delegate to existing keeper handlers.

| RPC | Keeper Method |
|-----|--------------|
| `AggregateExchangeRatePrevote(MsgPrevote)` | `HandlePrevote(ctx, hash, feeder, validator)` |
| `AggregateExchangeRateVote(MsgVote)` | `HandleVote(ctx, salt, exchangeRates, feeder, validator)` |
| `DelegateFeedConsent(MsgDelegateFeedConsent)` | `HandleDelegateFeeder(ctx, validator, feeder)` |

### Files to Modify/Create

1. **`x/oracle/types/query.pb.go`** — REWRITE. Add full gRPC query service: request/response types, `QueryServer` interface, `QueryClient`, service descriptor, HTTP annotations. Follow the exact pattern from `x/governance/types/query.pb.go`.

2. **`x/oracle/types/tx.pb.go`** — REWRITE. Add full gRPC msg service: `MsgServer` interface, `MsgClient`, service descriptor, handler functions. Follow `x/governance/types/tx.pb.go`.

3. **`x/oracle/types/query.pb.gw.go`** — CREATE. gRPC gateway HTTP handlers that route REST calls to gRPC server methods. Follow `x/governance/types/query.pb.gw.go`.

4. **`x/oracle/keeper/grpc_query_server.go`** — REWRITE. Implement `types.QueryServer` interface using existing keeper query methods.

5. **`x/oracle/keeper/grpc_msg_server.go`** — REWRITE. Implement `types.MsgServer` interface using existing keeper handlers.

6. **`x/oracle/module/module.go`** — MODIFY. Register gRPC services in `RegisterServices()` and wire gateway routes in `RegisterGRPCGatewayRoutes()`.

### Proto Definitions (Reference)

The proto files already exist at:
- `proto/clawchain/oracle/v1/query.proto` — 6 RPC methods with HTTP annotations
- `proto/clawchain/oracle/v1/tx.proto` — 3 RPC methods
- `proto/clawchain/oracle/v1/types.proto` — Core types
- `proto/clawchain/oracle/v1/genesis.proto` — Genesis state

All Go code must match these proto definitions exactly. Use `option go_package = "clawchain/x/oracle/types";`.

### Verification

- `go build ./x/oracle/...` must pass
- `go test ./x/oracle/...` must pass (existing 23 tests + new gRPC tests)
- New tests: query server tests (6 RPCs), msg server tests (3 RPCs)

## Section 2: clawd Oracle Commands (TypeScript)

New file: `cmd/clawd/src/commands/oracle.ts`

6 commands under `clawd oracle`:

```
clawd oracle price <pair>          # Query single price (e.g. CLAW/USD)
clawd oracle prices                # Query all active oracle prices
clawd oracle history <pair>        # Price history (--limit flag, default 20)
clawd oracle params                # Show oracle module parameters
clawd oracle prevote <hash>        # Submit aggregate prevote (--validator flag)
clawd oracle vote <salt> <rates>   # Submit aggregate vote reveal (--validator flag)
```

Pattern: Direct REST API calls using fetch(), same as existing commands in `governance.ts`, `ibc.ts`. Register in `main.ts` under oracle parent command.

REST endpoints used:
- `GET /clawchain/oracle/v1/price/{denom_pair}`
- `GET /clawchain/oracle/v1/prices`
- `GET /clawchain/oracle/v1/price_history/{denom_pair}?limit=N`
- `GET /clawchain/oracle/v1/params`

Tx commands (prevote, vote) use `POST /cosmos/tx/v1beta1/txs` with appropriate message types.

## Section 3: SDK Oracle Methods (TypeScript)

Add to `sdk/src/client.ts`:

```typescript
// Query methods
getOraclePrice(denomPair: string): Promise<OraclePriceResponse>
getOraclePrices(): Promise<OraclePricesResponse>
getOraclePriceHistory(denomPair: string, limit?: number): Promise<OraclePriceHistoryResponse>
getOracleParams(): Promise<OracleParamsResponse>
getOracleMissCounter(validator: string): Promise<OracleMissCounterResponse>
getOracleFeederDelegation(validator: string): Promise<OracleFeederResponse>
```

Add to `sdk/src/types.ts`:

```typescript
interface OraclePrice { denomPair: string; price: string; updatedAt: string; }
interface OraclePriceHistory { denomPair: string; price: string; height: string; timestamp: string; }
interface OracleParams { votePeriod: string; voteThreshold: string; rewardBand: string; slashFraction: string; slashWindow: string; minValidPerWindow: string; whitelist: string[]; }
```

Add to `sdk/src/constants.ts`:

```typescript
export const REST_ORACLE_PRICE = "/clawchain/oracle/v1/price";
export const REST_ORACLE_PRICES = "/clawchain/oracle/v1/prices";
export const REST_ORACLE_PRICE_HISTORY = "/clawchain/oracle/v1/price_history";
export const REST_ORACLE_PARAMS = "/clawchain/oracle/v1/params";
export const REST_ORACLE_MISS = "/clawchain/oracle/v1/miss";
export const REST_ORACLE_FEEDER = "/clawchain/oracle/v1/feeder";
```

Export new types from `sdk/src/index.ts`.

## Section 4: Web Dashboard Oracle Page

New file: `web/src/pages/Oracle.tsx`

### Layout
- **Price Table**: All active oracle pairs in a table — columns: Pair, Price, Last Updated. Auto-refreshes every 30s.
- **Price History**: Click a pair to see price history entries in a sub-table. Shows height, price, timestamp.
- **Oracle Parameters**: Collapsible section showing vote period, threshold, reward band, whitelist, slash params.
- **Validator Miss Counts**: If wallet connected, show miss counter for the connected validator.

### Data Flow
Uses `fetch()` against REST endpoints (same pattern as other web pages — `useEffect` + loading states + error handling). No mock data.

### Route Registration
Add to `web/src/App.tsx` router: `{ path: "/oracle", element: <Oracle /> }`. Add to sidebar navigation.

## Section 5: Housekeeping

### 5a: `.gitignore`
Add `.local-node/` entry.

### 5b: `x/tokenfactory/` Tests
Create `x/tokenfactory/keeper/tokenfactory_test.go` with real tests:
- TestCreateDenom — create denom, verify it exists
- TestMintTokens — mint to address, verify balance
- TestBurnTokens — burn from address, verify balance decreased
- TestChangeAdmin — change admin, verify old admin can't mint
- TestCreateDenomUnauthorized — non-admin can't mint
- TestMintInvalidDenom — can't mint non-existent denom

Use existing keeper setup patterns from other module tests.

### 5c: PRD Status Update
Update `prd.md` "Current Status" section and execution board to reflect:
- Oracle module: DONE (was missing, now complete with full client surface)
- Governance module: DONE (veto votes, cancel, queries, execution log)
- IBC hardening: DONE
- GPU E2E mock pipeline: DONE
- Mobile wallet: DONE (6 screens, 3 hooks, push notifications)
- Paradigm tools: DONE (127 tests, seed scripts)
- Docker: clawd now bundles openclaw
- tokenfactory: tests added
- Date: March 16, 2026

## Dependency Order

1. Section 1 (Go gRPC) — must be first, establishes REST endpoints
2. Sections 2, 3, 4 (clawd, SDK, web) — can run in parallel after Section 1
3. Section 5 (housekeeping) — independent, can run anytime
