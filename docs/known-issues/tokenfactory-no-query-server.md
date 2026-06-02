# Known issue: `x/tokenfactory` exposes no gRPC query server

_Found 2026-06-02 by the explorer data live-verify (`scripts/testnet/explorer-data-verify.sh`)._

## Symptom

REST calls to the osmosis-style tokenfactory query paths return **HTTP 501 Not Implemented**:

```
GET /osmosis/tokenfactory/v1beta1/params                         -> 501
GET /osmosis/tokenfactory/v1beta1/denoms_from_creator/{creator}  -> 501
GET /osmosis/tokenfactory/v1beta1/denoms/{denom}/authority_metadata -> 501
```

## Root cause

ClawChain's `x/tokenfactory` is a **hand-rolled minimal module** (local `x/tokenfactory/types`,
no vendored osmosis proto). It implements only the **Msg** side — `CreateDenom`, `Mint`, `Burn`,
`SetBeforeSendHook` — and ships **no query service**:

- no `query.proto` / generated query types,
- no `keeper/grpc_query.go` (`QueryServer`),
- `module.go` `RegisterGRPCGatewayRoutes` is an explicit no-op stub.

So there is no on-chain way to read tokenfactory `Params`, a denom's authority/admin metadata,
or "denoms created by X" over gRPC/REST.

## Impact & current handling

- **Explorer:** the Token Factory tab (`claw-explorer/src/modules/[chain]/tokenfactory/`) now
  enumerates factory denoms from the **standard, implemented bank supply endpoint**
  (`GET /cosmos/bank/v1beta1/supply`, filtered to `factory/<creator>/<subdenom>`), which is the
  canonical way to list minted denoms — so the tab is fully functional without the tokenfactory
  query server. Admin/authority metadata is simply not shown (a note says so).
- **Anyone needing denom authority/admin or params on-chain** has no REST/gRPC path today.

## Recommended fix (if/when on-chain tokenfactory reads are needed)

Add a query service to `x/tokenfactory`: a `query.proto` (`Params`, `DenomAuthorityMetadata`,
`DenomsFromCreator`) under the osmosis `v1beta1` path, regenerate via `make proto-gen` (idempotent
now — see `proto-generated-drift.md`), implement `keeper/grpc_query.go`, register it
(`RegisterQueryServer`) and wire `RegisterGRPCGatewayRoutes`. Bank supply covers denom *listing*,
so this is only needed for authority-metadata / params reads.
