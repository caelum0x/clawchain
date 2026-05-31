import {
  createClawWagmiConfig,
  createKeplrConnector,
  defineClawChain,
  connect,
  getAccount,
  getBalance,
  getBlockNumber,
  readContract,
  type InjectedCosmosWallet,
} from "../src/wagmi.js";

// Define the ClawChain network (wagmi-style chain descriptor).
const chain = defineClawChain({
  id: process.env.CLAW_CHAIN_ID ?? "clawchain-testnet-1",
  rpcUrl: process.env.CLAW_RPC_URL ?? "http://localhost:26657",
});

// In a real browser, `createKeplrConnector()` reads `window.keplr`. Here we keep the
// example node-runnable: without an injected wallet, connect() throws, so we only
// connect when a wallet is provided. Pass a wallet via the connector factory to test.
const wallet = (globalThis as { keplr?: InjectedCosmosWallet }).keplr;
const config = createClawWagmiConfig({
  chain,
  connectors: [createKeplrConnector()],
  rpcUrl: chain.rpcUrls.default.http[0],
});

// Read-only path works without any wallet (Tendermint + bank + CosmWasm).
await config.client.connect();
const height = await getBlockNumber(config);
console.log(`connected ${chain.id} at height ${height}`);

if (wallet) {
  const { address, connector } = await connect(config, "keplr");
  console.log(`connected ${connector} as ${address}`);

  const acct = getAccount(config);
  console.log(`account: ${acct.address} (isConnected=${acct.isConnected})`);

  const balance = await getBalance(config);
  console.log(`balance: ${balance.value}${balance.denom}`);

  // Read a CosmWasm contract (maps to a smart query, not eth_call).
  const contract = process.env.CLAW_CONTRACT;
  if (contract) {
    const cfg = await readContract(config, { address: contract, functionName: "config" });
    console.log("contract config:", cfg);
  } else {
    console.log("set CLAW_CONTRACT to demo readContract against a CosmWasm contract");
  }
} else {
  console.log(
    "no Keplr wallet detected (this is a node example); in a browser, " +
      "createKeplrConnector() reads window.keplr to enable connect/getBalance/writeContract",
  );
}

await config.client.disconnect();
