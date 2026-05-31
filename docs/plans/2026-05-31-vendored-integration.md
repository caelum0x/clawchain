# Vendored-Project Integration Plan (make `viem` / `wagmi` / `alloy` use ClawChain)

_Status: 2026-05-31. V1 + V2 TypeScript adapter slices implemented in `@clawchain/sdk`
(viem-style + wagmi-style), with V4 examples/docs. Owner: TBD._

## Current implementation status

Option B is selected for the first implementation slice: ClawChain-native adapters
layered beside the vendored projects. No EVM compatibility or `eth_*` JSON-RPC
emulation has been added.

Implemented now:
- `sdk/src/viem.ts` exports `createClawViemClient`, a viem-style client surface
  backed by Tendermint status, Cosmos bank sends, and CosmWasm smart query/execute.
- `sdk/src/index.ts` exports the adapter and its public TypeScript types from
  `@clawchain/sdk`.
- `sdk/examples/viem-adapter.ts` is a runnable read-only example, with signed account
  reads enabled by `CLAW_MNEMONIC`.
- `sdk/src/viem.test.ts` covers connect/disconnect, chain id, block height, account,
  balance, bank send mapping, CosmWasm read mapping, CosmWasm write mapping, and
  event subscription mapping.
- `sdk/src/wagmi.ts` exports the wagmi-style slice (V2): `defineClawChain`,
  `createKeplrConnector`/`createLeapConnector`, `createClawWagmiConfig`,
  `signingClientFromConnector`, and actions `connect`/`disconnect`/`getAccount`/
  `getBalance`/`getBlockNumber`/`readContract`/`writeContract`, built on the viem client.
- `sdk/examples/wagmi-adapter.ts` is a runnable read-only example (connector wiring +
  account/balance/readContract); a real browser uses `window.keplr`.
- `sdk/src/wagmi.test.ts` covers chain definition, connect/disconnect, default-address
  balance, block height + contract read routing, and connector/error paths.

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
design + audit). This is now the active path for V1.

## Phased plan (Option B)

### V0 — Decide & scope (design spike)
- [x] Confirm the goal: "use ClawChain from these ecosystems" (transport + contracts) vs
  "run EVM contracts" (→ Option A). Document the decision.
- [x] Inventory which exact APIs of each lib are in scope (connect, accounts, read, send,
  contract exec) and which are explicitly out (EVM execution).

### V1 — TypeScript: `viem` adapter
- [x] Provide a first viem-style adapter in `@clawchain/sdk` that implements a familiar
  client surface over Tendermint RPC + existing SDK methods.
- [x] Contract interactions route to CosmWasm (`MsgExecuteContract`/smart-query) rather
  than `eth_call`.
- [x] Unit tests cover connect/read/send/contract mapping with a mocked backend.
- [x] Event subscription mapping is exposed through `watchTransactions` and
  `watchEvent`.
- [x] Live signed bank send verified against the local 4-validator testnet via the
  viem adapter's `offlineSigner` path (chainId/blockNumber/balance read + bank send
  code 0). Required fixing `createClawViemClient` to forward `offlineSigner` to its
  backend.
- [x] Live CosmWasm `execute` pass: deployed hackatom on the local testnet and ran the viem
  adapter's `readContract` (verifier query) + `writeContract` (release) — code 0, height 58.

### V2 — React: `wagmi` adapter
- [x] Since wagmi is hooks-over-viem, build it on the V1 viem adapter: a ClawChain
  connector + chain definition so `useAccount`/`useBalance`/`useWriteContract`-style
  hooks resolve against ClawChain. Wallet connector targets Keplr/Leap (Cosmos), not
  MetaMask (`keplr-wallet/`, `keplr-chain-registry/` are also vendored — reuse).
  Implemented in `sdk/src/wagmi.ts`: `defineClawChain`, `createKeplrConnector`/
  `createLeapConnector`, `createClawWagmiConfig`, `signingClientFromConnector`, and the
  wagmi-style actions `connect`/`disconnect`/`getAccount`/`getBalance`/`getBlockNumber`/
  `readContract`/`writeContract`. Covered by `sdk/src/wagmi.test.ts`.

### V3 — Rust: `alloy` adapter
- Mirror V1 in Rust: an alloy provider/transport backed by Cosmos gRPC/Tendermint RPC,
  CosmWasm for contracts. Lower priority unless a Rust integrator needs it.

**V3 status (2026-05-31): read-provider implemented.** A standalone `clawchain-alloy/`
crate at repo root (NOT inside the vendored `alloy/` workspace) provides an alloy-style
`ClawProvider` with a Cosmos read path — `chain_id()`/`block_number()` from Tendermint
`GET {rpc}/status`, `get_balance(addr, denom)` from Cosmos REST
`GET {rest}/cosmos/bank/v1beta1/balances/{addr}`, and `query_contract(contract, msg_json)`
from CosmWasm smart-query `GET {rest}/cosmwasm/wasm/v1/contract/{contract}/smart/{base64(msg)}`.
URL-building and response-parsing live in pure functions (`parse_status`, `parse_balance`,
`balance_query_path`, `smart_query_path`, `parse_smart_query`) unit-tested OFFLINE with
fixture JSON (`cargo test`, 11 tests, no network). The vendored `alloy/` upstream is
untouched. **Follow-up (out of scope here):** Cosmos tx signing + broadcast in Rust
(SIGN_MODE_DIRECT, protobuf `Any`, secp256k1, account/sequence + fee/gas, broadcast) —
no write path exists yet.

### V4 — Examples & docs
- [x] One end-to-end example per ecosystem (connect → query balance → send → CosmWasm
  exec) runnable against devnet/testnet. TypeScript: `sdk/examples/viem-adapter.ts`
  (viem-style) and `sdk/examples/wagmi-adapter.ts` (wagmi-style). Rust (alloy) example
  pending V3.
- [x] Update `docs/reference-integrations.md` + `docs/integrator-quickstart.md`
  (added "viem-style and wagmi-style ClawChain adapters in `@clawchain/sdk`" sections).

## Acceptance criteria (per library, Option B)

- [x] Adapter can read chain id/height/account/balance through the SDK surface.
- [x] Adapter maps `sendTransaction` to Cosmos bank send.
- [x] Adapter maps `readContract`/`writeContract` to CosmWasm smart query/execute.
- [x] Runnable example and SDK docs exist; no `eth_*` dependency in the happy path.
- [x] Subscribe to / read Tendermint transaction events through the SDK WebSocket
  subscription path.
- [x] Live signed bank send AND CosmWasm execute (viem adapter, offlineSigner path)
  against the local multi-validator testnet — both code 0.

## Open decisions

- **Resolved for V1:** Option B (adapt libs to Cosmos). Option A remains a separate
  product track only if EVM/Solidity support becomes a product requirement.
- Whether to publish adapters as standalone packages or keep them folded into
  `@clawchain/sdk`.
- Keep the vendored upstreams as references (do NOT delete — see memory:
  "vendored forks are intentional") and layer adapters alongside.

## Dependencies / references

- `docs/plans/2026-03-09-open-source-forks-design.md` (existing fork direction)
- `@clawchain/sdk` (`sdk/`), `cmd/clawd/src/lib/registry.ts` (9-module cosmjs registry)
- `viem/`, `wagmi/`, `alloy/`, `keplr-wallet/`, `keplr-chain-registry/`
- Devnet plan (the test substrate for adapters).
