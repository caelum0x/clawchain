import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  connect,
  createClawWagmiConfig,
  createKeplrConnector,
  defineClawChain,
  disconnect,
  getAccount,
  getBalance,
  getBlockNumber,
  readContract,
  type ClawViemClient,
  type InjectedCosmosWallet,
} from "./index.js";

// A mock viem client (the data/read backend) so wagmi actions can be tested offline.
function mockViemClient(): ClawViemClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async connect() {
      calls.push("connect");
      return this as unknown as ClawViemClient;
    },
    async disconnect() {
      calls.push("disconnect");
    },
    async getChainId() {
      return "clawchain-testnet-1";
    },
    async getBlockNumber() {
      calls.push("getBlockNumber");
      return 99n;
    },
    getAccount() {
      return { address: "claw1backend" };
    },
    async getBalance(args) {
      calls.push(`getBalance:${args.address}:${args.denom ?? "?"}`);
      return 12345n;
    },
    async sendTransaction() {
      return { hash: "TX", height: 1n, code: 0, rawLog: "", gasUsed: 0n, gasWanted: 0n };
    },
    async readContract(args) {
      calls.push(`readContract:${args.address}:${args.functionName}`);
      return { ok: true };
    },
    async writeContract() {
      return { hash: "WTX", height: 2n, code: 0, rawLog: "", gasUsed: 0n, gasWanted: 0n };
    },
    watchTransactions() {
      return () => {};
    },
    watchEvent() {
      return () => {};
    },
  } as ClawViemClient & { calls: string[] };
}

// A mock Keplr-like wallet.
function mockWallet(addr: string): InjectedCosmosWallet & { enabled: string[] } {
  const enabled: string[] = [];
  return {
    enabled,
    async enable(chainId: string) {
      enabled.push(chainId);
    },
    async getKey(_chainId: string) {
      return { bech32Address: addr };
    },
    getOfflineSigner(_chainId: string) {
      return { __mockSigner: true };
    },
  };
}

describe("wagmi adapter", () => {
  test("defineClawChain produces a CLAW chain descriptor", () => {
    const chain = defineClawChain({ id: "clawchain-testnet-1", rpcUrl: "http://localhost:26657" });
    assert.equal(chain.id, "clawchain-testnet-1");
    assert.equal(chain.nativeCurrency.symbol, "CLAW");
    assert.equal(chain.nativeCurrency.decimals, 6);
    assert.equal(chain.bech32Prefix, "claw");
    assert.deepEqual(chain.rpcUrls.default.http, ["http://localhost:26657"]);
  });

  test("connect enables the wallet and sets the active account", async () => {
    const wallet = mockWallet("claw1user");
    const chain = defineClawChain({ id: "clawchain-testnet-1" });
    const config = createClawWagmiConfig({
      chain,
      connectors: [createKeplrConnector(() => wallet)],
      viemClient: mockViemClient(),
    });

    assert.equal(getAccount(config).isConnected, false);
    const res = await connect(config, "keplr");
    assert.equal(res.address, "claw1user");
    assert.equal(res.connector, "keplr");
    assert.deepEqual(wallet.enabled, ["clawchain-testnet-1"]);

    const acct = getAccount(config);
    assert.equal(acct.isConnected, true);
    assert.equal(acct.address, "claw1user");
    assert.equal(acct.connector, "keplr");
  });

  test("getBalance uses the connected address by default", async () => {
    const config = createClawWagmiConfig({
      chain: defineClawChain({ id: "clawchain-testnet-1" }),
      connectors: [createKeplrConnector(() => mockWallet("claw1user"))],
      viemClient: mockViemClient(),
    });
    await connect(config, "keplr");
    const bal = await getBalance(config);
    assert.equal(bal.value, 12345n);
    assert.equal(bal.denom, "uclaw");
  });

  test("getBlockNumber + readContract route through the data client", async () => {
    const client = mockViemClient();
    const config = createClawWagmiConfig({
      chain: defineClawChain({ id: "clawchain-testnet-1" }),
      connectors: [createKeplrConnector(() => mockWallet("claw1user"))],
      viemClient: client,
    });
    assert.equal(await getBlockNumber(config), 99n);
    const r = await readContract(config, { address: "claw1contract", functionName: "config" });
    assert.deepEqual(r, { ok: true });
    assert.ok(client.calls.includes("getBlockNumber"));
    assert.ok(client.calls.includes("readContract:claw1contract:config"));
  });

  test("disconnect clears the active account", async () => {
    const config = createClawWagmiConfig({
      chain: defineClawChain({ id: "clawchain-testnet-1" }),
      connectors: [createKeplrConnector(() => mockWallet("claw1user"))],
      viemClient: mockViemClient(),
    });
    await connect(config, "keplr");
    await disconnect(config);
    assert.equal(getAccount(config).isConnected, false);
  });

  test("unknown connector id throws", async () => {
    const config = createClawWagmiConfig({
      chain: defineClawChain({ id: "clawchain-testnet-1" }),
      connectors: [createKeplrConnector(() => mockWallet("claw1user"))],
      viemClient: mockViemClient(),
    });
    await assert.rejects(() => connect(config, "metamask"), /unknown connector/);
  });

  test("getBalance with no address and no connection throws", async () => {
    const config = createClawWagmiConfig({
      chain: defineClawChain({ id: "clawchain-testnet-1" }),
      connectors: [createKeplrConnector(() => mockWallet("claw1user"))],
      viemClient: mockViemClient(),
    });
    await assert.rejects(() => getBalance(config), /no address/);
  });
});
