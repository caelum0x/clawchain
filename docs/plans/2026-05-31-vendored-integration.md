# Vendored-Project Integration Plan (make `viem` / `wagmi` / `alloy` use ClawChain)

_Plan only — no code yet. Status: 2026-05-31. Owner: TBD._

## The core mismatch (read first)

The vendored projects are **Ethereum/EVM** libraries:
- `viem/` — TypeScript Ethereum client (JSON-RPC, ABI, accounts).
- `wagmi/` — React hooks over viem.
- `alloy/` — Rust Ethereum client.

ClawChain is a **pure Cosmos SDK chain** — verified: there is **no `x/evm` / no
ethermint / no Ethereum JSON-RPC** today (`grep` finds no EVM module). So these libs
**cannot talk to ClawChain as-is**: ClawChain speaks Tendermint RPC + Cosmos gRPC/REST
+ protobuf `Any` txs, not `eth_*` JSON-RPC + RLP/ABI.

There are two fundamentally different ways to close this, and the choice drives
everything. They are not mutually exclusive (B can ship first, A later).

## Option A — Add EVM compatibility to ClawChain

Integrate an EVM execution layer (evmOS/Ethermint-style `x/evm` + `x/feemarket` +
Ethereum JSON-RPC server + secp256k1/eth-address account compat) into the chain.

- **Pro:** the vendored libs work **unmodified** — point viem/wagmi/alloy at the
  chain's `eth_*` JSON-RPC and the entire Ethereum tooling ecosystem (wallets,
  indexers, Foundry, etc.) works. Maximum leverage.
- **Con:** large, invasive chain change (new modules, dual account system, gas/fee
  reconciliation, state-machine + consensus implications, re-audit). Months, not days.
  Risks the verified Cosmos module set.
- **When:** justified only if EVM/Solidity contract support is a product goal, not just
  "use these libs."

## Option B — Adapt the libraries to speak Cosmos (recommended first)

Keep each library's developer-facing API shape but back it with Cosmos transport
(`@clawchain/sdk` / cosmjs / Tendermint RPC) instead of `eth_*`. This is the direction
the repo already takes for other forks (`docs/plans/2026-03-09-open-source-forks-design.md`:
tools execute "CosmWasm MsgExecuteContract swap txs via @clawchain/sdk").

What maps cleanly vs not:
- **Maps well:** chain/client connect, block/tx/account reads, balance queries, send,
  event subscriptions, contract *calls* → CosmWasm query/execute.
- **Does NOT map:** EVM-specific surface (`eth_call` with EVM bytecode, Solidity ABI
  encoding, RLP, EVM gas, `eth_getLogs` topic model). Those parts are either dropped or
  reshaped to Cosmos equivalents (protobuf msgs, CosmWasm schemas, Tendermint events).

### Recommendation

Start with **Option B**, scoped per library, exposing a ClawChain-native client with a
familiar API — and treat Option A as a separate, later product decision (needs its own
design + audit).

## Phased plan (Option B)

### V0 — Decide & scope (design spike)
- Confirm the goal: "use ClawChain from these ecosystems" (transport + contracts) vs
  "run EVM contracts" (→ Option A). Document the decision.
- Inventory which exact APIs of each lib are in scope (connect, accounts, read, send,
  contract exec) and which are explicitly out (EVM execution).

### V1 — TypeScript: `viem` adapter
- Provide a `@clawchain/viem` (or a viem transport) that implements viem's client
  surface over Tendermint RPC + `@clawchain/sdk`'s registry (the 9-module cosmjs
  `Registry` already exists in `cmd/clawd/src/lib/registry.ts`).
- Contract interactions route to CosmWasm (`MsgExecuteContract`/smart-query) rather
  than `eth_call`.
- Tests against a devnet (the devnet plan) for connect/read/send/contract-exec.

### V2 — React: `wagmi` adapter
- Since wagmi is hooks-over-viem, build it on the V1 viem adapter: a ClawChain
  connector + chain definition so `useAccount`/`useBalance`/`useWriteContract`-style
  hooks resolve against ClawChain. Wallet connector targets Keplr/Leap (Cosmos), not
  MetaMask (`keplr-wallet/`, `keplr-chain-registry/` are also vendored — reuse).

### V3 — Rust: `alloy` adapter
- Mirror V1 in Rust: an alloy provider/transport backed by Cosmos gRPC/Tendermint RPC,
  CosmWasm for contracts. Lower priority unless a Rust integrator needs it.

### V4 — Examples & docs
- One end-to-end example per ecosystem (connect → query balance → send → CosmWasm
  exec) runnable against devnet/testnet.
- Update `docs/reference-integrations.md` + `docs/integrator-quickstart.md`.

## Acceptance criteria (per library, Option B)

- Connect to a ClawChain devnet, read chain id/height/account/balance.
- Sign + broadcast a bank send and a CosmWasm `MsgExecuteContract` that lands code 0.
- Subscribe to / read Tendermint events for a tx.
- A runnable example + docs; no `eth_*` dependency in the happy path.

## Open decisions

- **The big one:** Option A (EVM compat, libs unmodified) vs Option B (adapt libs to
  Cosmos). Default recommendation: B now, A as a separate product track.
- Whether to publish adapters as standalone packages or fold into `@clawchain/sdk`.
- Keep the vendored upstreams as references (do NOT delete — see memory:
  "vendored forks are intentional") and layer adapters alongside.

## Dependencies / references

- `docs/plans/2026-03-09-open-source-forks-design.md` (existing fork direction)
- `@clawchain/sdk` (`sdk/`), `cmd/clawd/src/lib/registry.ts` (9-module cosmjs registry)
- `viem/`, `wagmi/`, `alloy/`, `keplr-wallet/`, `keplr-chain-registry/`
- Devnet plan (the test substrate for adapters).
