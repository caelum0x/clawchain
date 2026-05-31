# External Integrator Quickstart

This is the minimal path for external teams integrating wallets, bots, or backend services with clawd.

## 1) Runtime readiness gate

Use the same startup/readiness flow operators run:

```bash
make clawd-build
make clawd-up-ready MANIFEST="https://testnet.clawchain.dev/manifest.json" HOST="your.public.host"
make runtime-readiness-gate
```

If you are integrating through OpenClaw runtime:

```bash
make openclaw-up-ready MANIFEST="https://testnet.clawchain.dev/manifest.json" HOST="your.public.host"
```

## 2) Query path (read-only)

Use the SDK for canonical query paths:

```ts
import { ClawChainClient } from "@clawchain/sdk";

const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
await client.connect();
const root = await client.getMerkleRoot();
const skills = await client.getSkills();
await client.disconnect();
```

See full query+tx templates in `sdk/examples/README.md`.

## 3) Transaction path (signed)

Pass a mnemonic and broadcast through typed module methods:

```ts
import { ClawChainClient } from "@clawchain/sdk";

const client = new ClawChainClient({
  rpcUrl: "http://localhost:26657",
  mnemonic: process.env.CLAWCHAIN_MNEMONIC,
});
await client.connect();
const tx = await client.delegateTask({
  assignee: "claw1...",
  description: "Run task X",
  budget: "100000uclaw",
  deadlineBlocks: 200,
});
console.log(tx.transactionHash);
await client.disconnect();
```

## 3b) viem-style and wagmi-style ClawChain adapters in `@clawchain/sdk`

If your team is coming from the Ethereum tooling world, the SDK ships adapters with a
familiar viem/wagmi API shape. Caveat: ClawChain is a pure Cosmos SDK chain (no `x/evm`,
no Ethereum JSON-RPC), so these route to Tendermint RPC + Cosmos bank + CosmWasm — they
do NOT emulate EVM (`eth_*`, Solidity ABI, RLP). Wallets are Cosmos (Keplr/Leap).

viem-style client (`sdk/examples/viem-adapter.ts`):

```ts
import { createClawViemClient } from "@clawchain/sdk";

const client = createClawViemClient({ rpcUrl: "http://localhost:26657" });
await client.connect();
console.log(await client.getBlockNumber());
await client.disconnect();
```

wagmi-style config + actions (`sdk/examples/wagmi-adapter.ts`):

```ts
import { defineClawChain, createKeplrConnector, createClawWagmiConfig, getBalance } from "@clawchain/sdk";

const chain = defineClawChain({ id: "clawchain-testnet-1", rpcUrl: "http://localhost:26657" });
const config = createClawWagmiConfig({ chain, connectors: [createKeplrConnector()] });
await config.client.connect();
console.log(await getBalance(config, { address: "claw1..." }));
```

## 4) Release-facing integration gate

For release candidate verification without CI/test-suite expansion:

```bash
make protocol-sanity
make release-ready-gate MANIFEST="https://testnet.clawchain.dev/manifest.json" HOST="your.public.host"
```

This ensures protocol surface lock consistency, readiness-oriented startup flow, and reproducibility/provenance checks required by current PRD gates.
