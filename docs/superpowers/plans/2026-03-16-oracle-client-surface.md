# Oracle Client Surface + Completeness Pass — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the oracle module fully queryable by external clients (REST, gRPC, CLI, SDK, web dashboard) and close remaining housekeeping gaps (.gitignore, tokenfactory tests, PRD update).

**Architecture:** The oracle keeper already has all business logic (23 tests pass). We add gRPC service layers (QueryServer, MsgServer) that delegate to existing keeper methods, a gRPC-gateway for REST, then build clawd CLI commands, SDK methods, and a web page — all consuming the same REST endpoints. Housekeeping tasks are independent.

**Tech Stack:** Go 1.24 (Cosmos SDK v0.53.6, cosmossdk.io/collections), TypeScript/Node.js 22+ (Commander.js, @cosmjs/stargate), React (Vite)

**Dependency order:** Chunk 1 (Go gRPC) must complete first — it creates the REST endpoints. Chunks 2, 3, 4 can run in parallel. Chunk 5 (housekeeping) is fully independent.

---

## Chunk 1: Oracle gRPC Services (Go)

### Task 1.1: Rewrite `x/oracle/types/query.pb.go` — Full gRPC Query Service

**Files:**
- Rewrite: `x/oracle/types/query.pb.go`

Follow the exact pattern from `x/governance/types/query.pb.go`. This file defines:
- Request/response message types matching `proto/clawchain/oracle/v1/query.proto`
- `QueryServer` interface (6 methods)
- `QueryClient` implementation
- `RegisterQueryServer` function
- gRPC service descriptor with handler functions
- `UnimplementedQueryServer` for forward compatibility

- [ ] **Step 1: Write the query.pb.go file**

The file must define these types and interfaces:

```go
package types

import (
	"context"
	grpc1 "github.com/cosmos/gogoproto/grpc"
	grpc "google.golang.org/grpc"
	codes "google.golang.org/grpc/codes"
	status "google.golang.org/grpc/status"
)

// ── Request/Response types ──────────────────────────────────────

type QueryPriceRequest struct {
	DenomPair string `protobuf:"bytes,1,opt,name=denom_pair,json=denomPair,proto3" json:"denom_pair,omitempty"`
}
type QueryPriceResponse struct {
	Rate *ExchangeRate `protobuf:"bytes,1,opt,name=rate,proto3" json:"rate,omitempty"`
}

type QueryPricesRequest struct{}
type QueryPricesResponse struct {
	Rates []ExchangeRate `protobuf:"bytes,1,rep,name=rates,proto3" json:"rates"`
}

type QueryPriceHistoryRequest struct {
	DenomPair string `protobuf:"bytes,1,opt,name=denom_pair,json=denomPair,proto3" json:"denom_pair,omitempty"`
	Limit     uint64 `protobuf:"varint,2,opt,name=limit,proto3" json:"limit,omitempty"`
}
type QueryPriceHistoryResponse struct {
	Entries []PriceHistoryEntry `protobuf:"bytes,1,rep,name=entries,proto3" json:"entries"`
}

type QueryFeederDelegationRequest struct {
	Validator string `protobuf:"bytes,1,opt,name=validator,proto3" json:"validator,omitempty"`
}
type QueryFeederDelegationResponse struct {
	Feeder string `protobuf:"bytes,1,opt,name=feeder,proto3" json:"feeder,omitempty"`
}

type QueryMissCounterRequest struct {
	Validator string `protobuf:"bytes,1,opt,name=validator,proto3" json:"validator,omitempty"`
}
type QueryMissCounterResponse struct {
	MissCounter uint64 `protobuf:"varint,1,opt,name=miss_counter,json=missCounter,proto3" json:"miss_counter,omitempty"`
}

type QueryOracleParamsRequest struct{}
type QueryOracleParamsResponse struct {
	Params OracleParams `protobuf:"bytes,1,opt,name=params,proto3" json:"params"`
}

// ── QueryServer interface ───────────────────────────────────────

type QueryServer interface {
	Price(context.Context, *QueryPriceRequest) (*QueryPriceResponse, error)
	Prices(context.Context, *QueryPricesRequest) (*QueryPricesResponse, error)
	PriceHistory(context.Context, *QueryPriceHistoryRequest) (*QueryPriceHistoryResponse, error)
	FeederDelegation(context.Context, *QueryFeederDelegationRequest) (*QueryFeederDelegationResponse, error)
	MissCounter(context.Context, *QueryMissCounterRequest) (*QueryMissCounterResponse, error)
	Params(context.Context, *QueryOracleParamsRequest) (*QueryOracleParamsResponse, error)
}

type UnimplementedQueryServer struct{}
// ... all 6 methods returning codes.Unimplemented

// ── RegisterQueryServer ─────────────────────────────────────────

func RegisterQueryServer(s grpc1.Server, srv QueryServer) {
	s.RegisterService(&_Query_serviceDesc, srv)
}

// ── Handler functions (one per RPC) ─────────────────────────────
// Pattern: decode request, call server method (with optional interceptor)

// ── Service descriptor ──────────────────────────────────────────
var Query_serviceDesc = _Query_serviceDesc
var _Query_serviceDesc = grpc.ServiceDesc{
	ServiceName: "clawchain.oracle.v1.Query",
	HandlerType: (*QueryServer)(nil),
	Methods: []grpc.MethodDesc{
		{MethodName: "Price", Handler: _Query_Price_Handler},
		{MethodName: "Prices", Handler: _Query_Prices_Handler},
		{MethodName: "PriceHistory", Handler: _Query_PriceHistory_Handler},
		{MethodName: "FeederDelegation", Handler: _Query_FeederDelegation_Handler},
		{MethodName: "MissCounter", Handler: _Query_MissCounter_Handler},
		{MethodName: "Params", Handler: _Query_Params_Handler},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "clawchain/oracle/v1/query.proto",
}

// ── QueryClient ─────────────────────────────────────────────────
type QueryClient interface { /* same 6 methods with grpc.CallOption */ }
type queryClient struct { cc grpc1.ClientConn }
func NewQueryClient(cc grpc1.ClientConn) QueryClient { return &queryClient{cc} }
// ... 6 client methods using cc.Invoke
```

Each handler follows this exact pattern (from governance):
```go
func _Query_Price_Handler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	in := new(QueryPriceRequest)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return srv.(QueryServer).Price(ctx, in)
	}
	info := &grpc.UnaryServerInfo{
		Server:     srv,
		FullMethod: "/clawchain.oracle.v1.Query/Price",
	}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return srv.(QueryServer).Price(ctx, req.(*QueryPriceRequest))
	}
	return interceptor(ctx, in, info, handler)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `go build ./x/oracle/types/...`
Expected: PASS

### Task 1.2: Rewrite `x/oracle/types/tx.pb.go` — Full gRPC Msg Service

**Files:**
- Rewrite: `x/oracle/types/tx.pb.go`

Same pattern as governance tx.pb.go. Must define:
- Message types matching `proto/clawchain/oracle/v1/tx.proto` (4 RPCs: DelegateFeeder, AggregateExchangeRatePrevote, AggregateExchangeRateVote, UpdateParams)
- `MsgServer` interface (4 methods)
- `RegisterMsgServer` function
- Service descriptor with handler functions
- `MsgClient` implementation

Message types from proto:
```go
type MsgDelegateFeeder struct {
	Validator string `protobuf:"bytes,1,opt,name=validator,proto3" json:"validator,omitempty"`
	Feeder    string `protobuf:"bytes,2,opt,name=feeder,proto3" json:"feeder,omitempty"`
}
type MsgDelegateFeederResponse struct{}

type MsgAggregateExchangeRatePrevote struct {
	Hash      string `protobuf:"bytes,1,opt,name=hash,proto3" json:"hash,omitempty"`
	Feeder    string `protobuf:"bytes,2,opt,name=feeder,proto3" json:"feeder,omitempty"`
	Validator string `protobuf:"bytes,3,opt,name=validator,proto3" json:"validator,omitempty"`
}
type MsgAggregateExchangeRatePrevoteResponse struct{}

type MsgAggregateExchangeRateVote struct {
	Salt          string `protobuf:"bytes,1,opt,name=salt,proto3" json:"salt,omitempty"`
	ExchangeRates string `protobuf:"bytes,2,opt,name=exchange_rates,json=exchangeRates,proto3" json:"exchange_rates,omitempty"`
	Feeder        string `protobuf:"bytes,3,opt,name=feeder,proto3" json:"feeder,omitempty"`
	Validator     string `protobuf:"bytes,4,opt,name=validator,proto3" json:"validator,omitempty"`
}
type MsgAggregateExchangeRateVoteResponse struct{}

type MsgUpdateParams struct {
	Authority string       `protobuf:"bytes,1,opt,name=authority,proto3" json:"authority,omitempty"`
	Params    OracleParams `protobuf:"bytes,2,opt,name=params,proto3" json:"params"`
}
type MsgUpdateParamsResponse struct{}
```

MsgServer interface:
```go
type MsgServer interface {
	DelegateFeeder(context.Context, *MsgDelegateFeeder) (*MsgDelegateFeederResponse, error)
	AggregateExchangeRatePrevote(context.Context, *MsgAggregateExchangeRatePrevote) (*MsgAggregateExchangeRatePrevoteResponse, error)
	AggregateExchangeRateVote(context.Context, *MsgAggregateExchangeRateVote) (*MsgAggregateExchangeRateVoteResponse, error)
	UpdateParams(context.Context, *MsgUpdateParams) (*MsgUpdateParamsResponse, error)
}
```

Service descriptor:
```go
var _Msg_serviceDesc = grpc.ServiceDesc{
	ServiceName: "clawchain.oracle.v1.Msg",
	HandlerType: (*MsgServer)(nil),
	Methods: []grpc.MethodDesc{
		{MethodName: "DelegateFeeder", Handler: _Msg_DelegateFeeder_Handler},
		{MethodName: "AggregateExchangeRatePrevote", Handler: _Msg_AggregateExchangeRatePrevote_Handler},
		{MethodName: "AggregateExchangeRateVote", Handler: _Msg_AggregateExchangeRateVote_Handler},
		{MethodName: "UpdateParams", Handler: _Msg_UpdateParams_Handler},
	},
	Streams:  []grpc.StreamDesc{},
	Metadata: "clawchain/oracle/v1/tx.proto",
}
```

- [ ] **Step 1: Write the tx.pb.go file**
- [ ] **Step 2: Verify it compiles**: `go build ./x/oracle/types/...`

### Task 1.3: Create `x/oracle/types/query.pb.gw.go` — gRPC Gateway REST Handlers

**Files:**
- Create: `x/oracle/types/query.pb.gw.go`

This file maps REST HTTP routes to gRPC query server calls. Follow `x/governance/types/query.pb.gw.go` pattern exactly.

Must implement:
- `RegisterQueryHandlerServer(ctx, mux, server)` — registers HTTP handlers for server-side
- `RegisterQueryHandlerClient(ctx, mux, client)` — registers HTTP handlers for client-side
- `request_Query_*` functions — parse HTTP path/query params into proto request
- `local_request_Query_*` functions — same for server-side
- URL patterns matching the proto HTTP annotations

URL patterns (from proto):
```go
var (
	pattern_Query_Price_0         = "/clawchain/oracle/v1/price/{denom_pair}"
	pattern_Query_Prices_0        = "/clawchain/oracle/v1/prices"
	pattern_Query_PriceHistory_0  = "/clawchain/oracle/v1/price_history/{denom_pair}"
	pattern_Query_FeederDelegation_0 = "/clawchain/oracle/v1/feeder/{validator}"
	pattern_Query_MissCounter_0   = "/clawchain/oracle/v1/miss/{validator}"
	pattern_Query_Params_0        = "/clawchain/oracle/v1/params"
)
```

Key imports:
```go
import (
	"context"
	"io"
	"net/http"
	"github.com/grpc-ecosystem/grpc-gateway/runtime"
	"github.com/grpc-ecosystem/grpc-gateway/utilities"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/grpclog"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)
```

- [ ] **Step 1: Write the query.pb.gw.go file**
- [ ] **Step 2: Verify it compiles**: `go build ./x/oracle/types/...`

### Task 1.4: Update `x/oracle/types/codec.go` — Register Message Types

**Files:**
- Modify: `x/oracle/types/codec.go`

Register oracle message types in `RegisterInterfaces` so they can be decoded by the Cosmos SDK:

```go
func RegisterInterfaces(registry codectypes.InterfaceRegistry) {
	registry.RegisterImplementations((*sdk.Msg)(nil),
		&MsgDelegateFeeder{},
		&MsgAggregateExchangeRatePrevote{},
		&MsgAggregateExchangeRateVote{},
		&MsgUpdateParams{},
	)
	msgservice.RegisterMsgServiceDesc(registry, &_Msg_serviceDesc)
}
```

The Msg types need `sdk.Msg` interface methods. Add to tx.pb.go or a separate file:
```go
func (m *MsgDelegateFeeder) GetSigners() []sdk.AccAddress { return []sdk.AccAddress{sdk.AccAddress(m.Validator)} }
func (m *MsgDelegateFeeder) ValidateBasic() error { /* validate addresses */ }
// ... same for other 3 msg types
```

- [ ] **Step 1: Update codec.go**
- [ ] **Step 2: Verify it compiles**: `go build ./x/oracle/...`

### Task 1.5: Rewrite gRPC Server Implementations

**Files:**
- Rewrite: `x/oracle/keeper/grpc_query_server.go`
- Rewrite: `x/oracle/keeper/grpc_msg_server.go`

**Query Server** — delegates to existing keeper methods:

```go
package keeper

import (
	"context"
	"clawchain/x/oracle/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type queryServer struct { keeper Keeper }

func NewQueryServerImpl(keeper Keeper) types.QueryServer {
	return &queryServer{keeper: keeper}
}

var _ types.QueryServer = queryServer{}

func (q queryServer) Price(ctx context.Context, req *types.QueryPriceRequest) (*types.QueryPriceResponse, error) {
	if req == nil { return nil, status.Error(codes.InvalidArgument, "empty request") }
	rate, err := q.keeper.QueryPrice(ctx, req.DenomPair)
	if err != nil { return nil, err }
	return &types.QueryPriceResponse{Rate: rate}, nil
}

func (q queryServer) Prices(ctx context.Context, req *types.QueryPricesRequest) (*types.QueryPricesResponse, error) {
	if req == nil { return nil, status.Error(codes.InvalidArgument, "empty request") }
	rates, err := q.keeper.QueryPrices(ctx)
	if err != nil { return nil, err }
	return &types.QueryPricesResponse{Rates: rates}, nil
}

func (q queryServer) PriceHistory(ctx context.Context, req *types.QueryPriceHistoryRequest) (*types.QueryPriceHistoryResponse, error) {
	if req == nil { return nil, status.Error(codes.InvalidArgument, "empty request") }
	limit := req.Limit
	if limit == 0 { limit = 20 }
	entries, err := q.keeper.QueryPriceHistory(ctx, req.DenomPair, limit)
	if err != nil { return nil, err }
	return &types.QueryPriceHistoryResponse{Entries: entries}, nil
}

func (q queryServer) FeederDelegation(ctx context.Context, req *types.QueryFeederDelegationRequest) (*types.QueryFeederDelegationResponse, error) {
	if req == nil { return nil, status.Error(codes.InvalidArgument, "empty request") }
	feeder, err := q.keeper.QueryFeederDelegation(ctx, req.Validator)
	if err != nil { return nil, err }
	return &types.QueryFeederDelegationResponse{Feeder: feeder}, nil
}

func (q queryServer) MissCounter(ctx context.Context, req *types.QueryMissCounterRequest) (*types.QueryMissCounterResponse, error) {
	if req == nil { return nil, status.Error(codes.InvalidArgument, "empty request") }
	count, err := q.keeper.QueryMissCounter(ctx, req.Validator)
	if err != nil { return nil, err }
	return &types.QueryMissCounterResponse{MissCounter: count}, nil
}

func (q queryServer) Params(ctx context.Context, req *types.QueryOracleParamsRequest) (*types.QueryOracleParamsResponse, error) {
	if req == nil { return nil, status.Error(codes.InvalidArgument, "empty request") }
	params := q.keeper.GetParams(ctx)
	return &types.QueryOracleParamsResponse{Params: params}, nil
}
```

**Msg Server** — delegates to existing keeper handlers:

```go
package keeper

import (
	"context"
	"clawchain/x/oracle/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type msgServer struct { keeper Keeper }

func NewMsgServerImpl(keeper Keeper) types.MsgServer {
	return &msgServer{keeper: keeper}
}

var _ types.MsgServer = msgServer{}

func (m msgServer) DelegateFeeder(ctx context.Context, msg *types.MsgDelegateFeeder) (*types.MsgDelegateFeederResponse, error) {
	if err := m.keeper.HandleDelegateFeeder(ctx, msg.Validator, msg.Feeder); err != nil {
		return nil, err
	}
	return &types.MsgDelegateFeederResponse{}, nil
}

func (m msgServer) AggregateExchangeRatePrevote(ctx context.Context, msg *types.MsgAggregateExchangeRatePrevote) (*types.MsgAggregateExchangeRatePrevoteResponse, error) {
	if err := m.keeper.HandlePrevote(ctx, msg.Hash, msg.Feeder, msg.Validator); err != nil {
		return nil, err
	}
	return &types.MsgAggregateExchangeRatePrevoteResponse{}, nil
}

func (m msgServer) AggregateExchangeRateVote(ctx context.Context, msg *types.MsgAggregateExchangeRateVote) (*types.MsgAggregateExchangeRateVoteResponse, error) {
	if err := m.keeper.HandleVote(ctx, msg.Salt, msg.ExchangeRates, msg.Feeder, msg.Validator); err != nil {
		return nil, err
	}
	return &types.MsgAggregateExchangeRateVoteResponse{}, nil
}

func (m msgServer) UpdateParams(ctx context.Context, msg *types.MsgUpdateParams) (*types.MsgUpdateParamsResponse, error) {
	authority := m.keeper.GetAuthority()
	if msg.Authority != string(authority) {
		return nil, status.Error(codes.PermissionDenied, "unauthorized")
	}
	if err := m.keeper.SetParams(ctx, msg.Params); err != nil {
		return nil, err
	}
	return &types.MsgUpdateParamsResponse{}, nil
}
```

- [ ] **Step 1: Write both files**
- [ ] **Step 2: Verify compilation**: `go build ./x/oracle/...`

### Task 1.6: Update Oracle Module Registration

**Files:**
- Modify: `x/oracle/module/module.go`

Update `RegisterServices` to register both servers:
```go
func (am AppModule) RegisterServices(cfg module.Configurator) {
	types.RegisterMsgServer(cfg.MsgServer(), keeper.NewMsgServerImpl(am.keeper))
	types.RegisterQueryServer(cfg.QueryServer(), keeper.NewQueryServerImpl(am.keeper))
	m := keeper.NewMigrator(am.keeper)
	if err := cfg.RegisterMigration(types.ModuleName, 1, m.Migrate1to2); err != nil {
		panic(fmt.Sprintf("failed to migrate x/%s from version 1 to 2: %v", types.ModuleName, err))
	}
}
```

Update `RegisterGRPCGatewayRoutes`:
```go
func (AppModule) RegisterGRPCGatewayRoutes(clientCtx client.Context, mux *runtime.ServeMux) {
	if err := types.RegisterQueryHandlerClient(context.Background(), mux, types.NewQueryClient(clientCtx)); err != nil {
		panic(err)
	}
}
```

Add import: `"context"` if not present.

- [ ] **Step 1: Update module.go**
- [ ] **Step 2: Full build check**: `go build ./cmd/clawchaind/...`
- [ ] **Step 3: Run all oracle tests**: `go test -count=1 ./x/oracle/...`

### Task 1.7: Oracle gRPC Integration Tests

**Files:**
- Create: `x/oracle/keeper/grpc_server_test.go`

Test all 6 query RPCs and 4 msg RPCs through the gRPC server implementations:

```go
package keeper_test

// Test QueryServer
func TestGRPCQueryPrice(t *testing.T)            // set rate, query, verify
func TestGRPCQueryPriceNotFound(t *testing.T)     // query missing pair, expect error
func TestGRPCQueryPrices(t *testing.T)            // set 2 rates, query all, verify both
func TestGRPCQueryPriceHistory(t *testing.T)      // set history, query with limit
func TestGRPCQueryFeederDelegation(t *testing.T)  // delegate feeder, query, verify
func TestGRPCQueryMissCounter(t *testing.T)       // set miss counter, query, verify
func TestGRPCQueryParams(t *testing.T)            // query default params

// Test MsgServer
func TestGRPCMsgDelegateFeeder(t *testing.T)      // delegate, verify stored
func TestGRPCMsgPrevote(t *testing.T)             // submit prevote, verify stored
func TestGRPCMsgVote(t *testing.T)                // prevote + vote cycle
func TestGRPCMsgUpdateParams(t *testing.T)        // update params with correct authority
func TestGRPCMsgUpdateParamsUnauthorized(t *testing.T)  // wrong authority, expect error
```

Use the existing `setupOracleKeeper(t)` test helper from `oracle_test_helpers_test.go`.

- [ ] **Step 1: Write the test file**
- [ ] **Step 2: Run tests**: `go test -count=1 -v ./x/oracle/keeper/...`
- [ ] **Step 3: Commit Chunk 1**

---

## Chunk 2: clawd Oracle Commands (TypeScript)

### Task 2.1: Create `cmd/clawd/src/commands/oracle.ts`

**Files:**
- Create: `cmd/clawd/src/commands/oracle.ts`
- Modify: `cmd/clawd/src/main.ts`

6 command functions following the governance.ts pattern (direct REST fetch, Commander.js):

```typescript
export async function runOraclePrice(pair: string) {
  const cfg = loadClawdConfig();
  const restUrl = cfg.restUrl ?? deriveRestFromRpc(cfg.rpcUrl ?? "http://localhost:26657");
  const res = await fetch(`${restUrl}/clawchain/oracle/v1/price/${encodeURIComponent(pair)}`);
  if (!res.ok) throw new Error(`Failed to query price: ${res.statusText}`);
  const data = await res.json();
  console.log(table([
    ["Pair", data.rate?.denom_pair ?? pair],
    ["Price", data.rate?.price ?? "N/A"],
    ["Height", data.rate?.block_height ?? "N/A"],
    ["Updated", data.rate?.timestamp ? new Date(Number(data.rate.timestamp) * 1000).toISOString() : "N/A"],
  ]));
}

export async function runOraclePrices() { /* fetch /clawchain/oracle/v1/prices, display table */ }
export async function runOracleHistory(pair: string, opts: { limit?: string }) { /* fetch with ?limit= */ }
export async function runOracleParams() { /* fetch /clawchain/oracle/v1/params */ }
export async function runOraclePrevote(hash: string, opts: { validator: string }) { /* sign+broadcast MsgAggregateExchangeRatePrevote */ }
export async function runOracleVote(salt: string, rates: string, opts: { validator: string }) { /* sign+broadcast MsgAggregateExchangeRateVote */ }
```

Register in `main.ts`:
```typescript
import { runOraclePrice, runOraclePrices, runOracleHistory, runOracleParams, runOraclePrevote, runOracleVote } from "./commands/oracle.js";

const oracleCmd = program.command("oracle").description("Oracle price feed commands");
oracleCmd.command("price <pair>").description("Query oracle price for a pair").action(runOraclePrice);
oracleCmd.command("prices").description("List all oracle prices").action(runOraclePrices);
oracleCmd.command("history <pair>").description("Price history").option("--limit <n>", "Max entries", "20").action(runOracleHistory);
oracleCmd.command("params").description("Oracle module parameters").action(runOracleParams);
oracleCmd.command("prevote <hash>").description("Submit aggregate prevote").requiredOption("--validator <addr>", "Validator address").action(runOraclePrevote);
oracleCmd.command("vote <salt> <rates>").description("Submit aggregate vote").requiredOption("--validator <addr>", "Validator address").action(runOracleVote);
```

- [ ] **Step 1: Write oracle.ts**
- [ ] **Step 2: Register in main.ts**
- [ ] **Step 3: Verify TypeScript compiles**: `cd cmd/clawd && npx tsc --noEmit`
- [ ] **Step 4: Commit**

---

## Chunk 3: SDK Oracle Methods (TypeScript)

### Task 3.1: Add Oracle Constants, Types, and Client Methods

**Files:**
- Modify: `sdk/src/constants.ts`
- Modify: `sdk/src/types.ts`
- Modify: `sdk/src/client.ts`
- Modify: `sdk/src/index.ts`

**Constants** (add to `sdk/src/constants.ts`):
```typescript
export const REST_ORACLE_PRICE = "/clawchain/oracle/v1/price";
export const REST_ORACLE_PRICES = "/clawchain/oracle/v1/prices";
export const REST_ORACLE_PRICE_HISTORY = "/clawchain/oracle/v1/price_history";
export const REST_ORACLE_PARAMS = "/clawchain/oracle/v1/params";
export const REST_ORACLE_MISS = "/clawchain/oracle/v1/miss";
export const REST_ORACLE_FEEDER = "/clawchain/oracle/v1/feeder";
```

**Types** (add to `sdk/src/types.ts`):
```typescript
export interface OraclePrice {
  denom_pair: string;
  price: string;
  block_height: string;
  timestamp: string;
}

export interface OraclePriceResponse {
  rate: OraclePrice;
}

export interface OraclePricesResponse {
  rates: OraclePrice[];
}

export interface OraclePriceHistoryEntry {
  price: string;
  block_height: string;
  timestamp: string;
  duration_blocks?: string;
}

export interface OraclePriceHistoryResponse {
  entries: OraclePriceHistoryEntry[];
}

export interface OracleParamsData {
  vote_period: string;
  vote_threshold: string;
  reward_band: string;
  slash_fraction: string;
  slash_window: string;
  min_valid_per_window: string;
  whitelist: string[];
}

export interface OracleParamsResponse {
  params: OracleParamsData;
}

export interface OracleMissCounterResponse {
  miss_counter: string;
}

export interface OracleFeederResponse {
  feeder: string;
}
```

**Client methods** (add to `ClawChainClient` class in `sdk/src/client.ts`):
```typescript
async getOraclePrice(denomPair: string): Promise<OraclePriceResponse> {
  const url = `${this.restUrl}${REST_ORACLE_PRICE}/${encodeURIComponent(denomPair)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Oracle price query failed: ${res.statusText}`);
  return res.json();
}

async getOraclePrices(): Promise<OraclePricesResponse> {
  const url = `${this.restUrl}${REST_ORACLE_PRICES}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Oracle prices query failed: ${res.statusText}`);
  return res.json();
}

async getOraclePriceHistory(denomPair: string, limit?: number): Promise<OraclePriceHistoryResponse> {
  const qs = limit ? `?limit=${limit}` : "";
  const url = `${this.restUrl}${REST_ORACLE_PRICE_HISTORY}/${encodeURIComponent(denomPair)}${qs}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Oracle price history query failed: ${res.statusText}`);
  return res.json();
}

async getOracleParams(): Promise<OracleParamsResponse> {
  const url = `${this.restUrl}${REST_ORACLE_PARAMS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Oracle params query failed: ${res.statusText}`);
  return res.json();
}

async getOracleMissCounter(validator: string): Promise<OracleMissCounterResponse> {
  const url = `${this.restUrl}${REST_ORACLE_MISS}/${encodeURIComponent(validator)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Oracle miss counter query failed: ${res.statusText}`);
  return res.json();
}

async getOracleFeederDelegation(validator: string): Promise<OracleFeederResponse> {
  const url = `${this.restUrl}${REST_ORACLE_FEEDER}/${encodeURIComponent(validator)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Oracle feeder query failed: ${res.statusText}`);
  return res.json();
}
```

**Exports** (add to `sdk/src/index.ts`):
```typescript
export type {
  OraclePrice, OraclePriceResponse, OraclePricesResponse,
  OraclePriceHistoryEntry, OraclePriceHistoryResponse,
  OracleParamsData, OracleParamsResponse,
  OracleMissCounterResponse, OracleFeederResponse,
} from "./types.js";
```

- [ ] **Step 1: Add constants**
- [ ] **Step 2: Add types**
- [ ] **Step 3: Add client methods**
- [ ] **Step 4: Add exports**
- [ ] **Step 5: Verify TypeScript compiles**: `cd sdk && npx tsc --noEmit`
- [ ] **Step 6: Run SDK tests**: `cd sdk && npm test`
- [ ] **Step 7: Commit**

---

## Chunk 4: Web Dashboard Oracle Page (React)

### Task 4.1: Create `web/src/pages/Oracle.tsx`

**Files:**
- Create: `web/src/pages/Oracle.tsx`
- Modify: `web/src/App.tsx` (add route)

Follow the exact pattern from `web/src/pages/Governance.tsx` — `useEffect` + loading states + error handling + real REST data.

The page includes:
- **Price Table**: fetches `/clawchain/oracle/v1/prices`, displays all pairs with price and last updated timestamp
- **Price History**: on row click, fetches `/clawchain/oracle/v1/price_history/{pair}?limit=20` and displays entries
- **Oracle Parameters**: collapsible section fetching `/clawchain/oracle/v1/params`
- **Miss Counter**: if wallet connected, fetches `/clawchain/oracle/v1/miss/{validator}` for the connected validator

Add route in `App.tsx`:
```tsx
import Oracle from './pages/Oracle';
// In router:
{ path: "/oracle", element: <Oracle /> }
```

Add to sidebar navigation (look for existing nav items like Governance, check the sidebar/nav component).

- [ ] **Step 1: Create Oracle.tsx**
- [ ] **Step 2: Add route in App.tsx**
- [ ] **Step 3: Add sidebar nav link**
- [ ] **Step 4: Verify build**: `cd web && npx tsc --noEmit && npx vite build`
- [ ] **Step 5: Commit**

---

## Chunk 5: Housekeeping

### Task 5.1: Fix `.gitignore`

**Files:**
- Modify: `.gitignore`

Add `.local-node/` entry to prevent tracking chain state.

- [ ] **Step 1: Add entry**
- [ ] **Step 2: Commit**

### Task 5.2: Add `x/tokenfactory/` Tests

**Files:**
- Create: `x/tokenfactory/keeper/tokenfactory_test.go`

Write real tests using the existing keeper. The keeper has these methods:
- `CreateDenom(ctx, creator, subdenom) (string, error)`
- `MintTo(ctx, amount, mintTo) error`
- `BurnFrom(ctx, amount, burnFrom) error`
- `SetBeforeSendHook(ctx, denom, contract) error`
- `assertAdmin(ctx, denom, admin) error`

The keeper uses `cosmossdk.io/collections` with `DenomAdmins` and `BeforeSendHooks` maps.

Tests:
```go
func TestCreateDenom(t *testing.T)              // create, verify admin is set
func TestCreateDenomDuplicate(t *testing.T)     // create same denom twice, expect error
func TestMintTo(t *testing.T)                   // create + mint, verify bank mock called
func TestMintToUnauthorized(t *testing.T)       // mint from non-admin, expect error
func TestBurnFrom(t *testing.T)                 // create + burn, verify bank mock called
func TestBurnFromUnauthorized(t *testing.T)     // burn from non-admin, expect error
func TestSetBeforeSendHook(t *testing.T)        // set hook, verify stored
func TestSetBeforeSendHookUnauthorized(t *testing.T) // non-admin, expect error
```

Setup: create test keeper using `cosmossdk.io/core/store` + mock bank keeper.

- [ ] **Step 1: Write test file with setup helper**
- [ ] **Step 2: Run tests**: `go test -count=1 -v ./x/tokenfactory/...`
- [ ] **Step 3: Commit**

### Task 5.3: Update PRD Status

**Files:**
- Modify: `prd.md`

Update the "Current Status" section to reflect March 16 work:
- Change date from "March 11, 2026" to "March 16, 2026"
- Add oracle module completion to execution board (P18 or update existing entries)
- Update mobile wallet status from "WAITING" to "DONE" (6 screens, 3 hooks)
- Update Paradigm tools from 15-25% to "DONE" (127 tests, seed scripts)
- Add new sprint entry for today's work (governance completion, oracle, IBC hardening, GPU mock, mobile wallet, Paradigm tools, Docker openclaw bundling)
- Update test counts (new Go tests, new TS tests)
- Update "What's Remaining" section: remove code items (they're done), keep only external dependencies

- [ ] **Step 1: Update status section**
- [ ] **Step 2: Update execution board**
- [ ] **Step 3: Add sprint entry**
- [ ] **Step 4: Update remaining section**
- [ ] **Step 5: Commit**

### Task 5.4: Final Verification

- [ ] **Step 1: Full Go build**: `go build ./...`
- [ ] **Step 2: Full Go tests**: `go test ./x/...`
- [ ] **Step 3: SDK build + tests**: `cd sdk && npx tsc --noEmit && npm test`
- [ ] **Step 4: clawd build**: `cd cmd/clawd && npx tsc --noEmit`
- [ ] **Step 5: Web build**: `cd web && npx vite build`
- [ ] **Step 6: Final commit if any fixes needed**
