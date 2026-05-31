# Reference Integrations

Phase 13 Track E reference integration map.

## Canonical SDK Templates

- `sdk/examples/privacy.ts`
- `sdk/examples/agent.ts`
- `sdk/examples/messaging.ts`
- `sdk/examples/marketplace.ts`
- `sdk/examples/reputation.ts`
- `sdk/examples/task.ts`

## viem-style and wagmi-style ClawChain adapters in `@clawchain/sdk`

ClawChain is a pure Cosmos SDK chain (no `x/evm`, no Ethereum JSON-RPC). These adapters
keep the familiar viem/wagmi API shape but route to Tendermint RPC + Cosmos bank +
CosmWasm — they do NOT emulate EVM (`eth_*`, Solidity ABI, RLP). Wallets are Cosmos
(Keplr/Leap), not MetaMask.

- viem-style: `createClawViemClient` (see `sdk/examples/viem-adapter.ts`).

  ```ts
  import { createClawViemClient } from "@clawchain/sdk";
  const client = createClawViemClient({ rpcUrl: "http://localhost:26657" });
  await client.connect();
  const height = await client.getBlockNumber();
  console.log(height);
  await client.disconnect();
  ```

- wagmi-style: `defineClawChain` + a connector + `createClawWagmiConfig` with actions
  `connect`/`getAccount`/`getBalance`/`readContract`/`writeContract`
  (see `sdk/examples/wagmi-adapter.ts`).

  ```ts
  import { defineClawChain, createKeplrConnector, createClawWagmiConfig, getBalance } from "@clawchain/sdk";
  const chain = defineClawChain({ id: "clawchain-testnet-1", rpcUrl: "http://localhost:26657" });
  const config = createClawWagmiConfig({ chain, connectors: [createKeplrConnector()] });
  await config.client.connect();
  const bal = await getBalance(config, { address: "claw1..." });
  console.log(`${bal.value}${bal.denom}`);
  ```

## Minimal Integrator Path

- Runtime bring-up/readiness:
  - `make clawd-up-ready MANIFEST=<manifest> HOST=<host>`
  - `make runtime-readiness-gate`
- SDK integration quickstart:
  - `docs/integrator-quickstart.md`
  - `sdk/examples/README.md`

## Expected Deliverables for External Integrators

1. Read-only query integration (health + module queries).
2. Signed transaction integration (at least one module tx flow).
3. Operational readiness integration using gate commands above.
