import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { createClawViemClient, type ClawViemClientBackend } from "./viem.js";
import type { TxResult, WasmCoin, WasmExecuteResult } from "./types.js";

function tx(overrides: Partial<TxResult> = {}): TxResult {
  return {
    transactionHash: "ABC123",
    height: 42,
    code: 0,
    rawLog: "",
    gasUsed: 1000,
    gasWanted: 1200,
    events: [],
    ...overrides,
  };
}

function wasmTx(overrides: Partial<WasmExecuteResult> = {}): WasmExecuteResult {
  return {
    transactionHash: "DEF456",
    height: 43,
    gasUsed: 900,
    events: [],
    ...overrides,
  };
}

function mockBackend(): ClawViemClientBackend & {
  calls: Array<{ name: string; args: unknown[] }>;
} {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  return {
    calls,
    async connect() {
      calls.push({ name: "connect", args: [] });
    },
    async disconnect() {
      calls.push({ name: "disconnect", args: [] });
    },
    getAddress() {
      calls.push({ name: "getAddress", args: [] });
      return "claw1sender";
    },
    async getBalance(address: string, denom?: string) {
      calls.push({ name: "getBalance", args: [address, denom] });
      return "12345";
    },
    async sendTokens(recipient: string, amount: string, denom?: string) {
      calls.push({ name: "sendTokens", args: [recipient, amount, denom] });
      return tx();
    },
    async queryContract(contractAddress: string, queryMsg: Record<string, unknown>) {
      calls.push({ name: "queryContract", args: [contractAddress, queryMsg] });
      return { answer: 7 };
    },
    async executeContract(
      senderAddress: string,
      contractAddress: string,
      execMsg: Record<string, unknown>,
      funds?: WasmCoin[],
    ) {
      calls.push({ name: "executeContract", args: [senderAddress, contractAddress, execMsg, funds] });
      return wasmTx();
    },
  };
}

function statusFetch(chainId = "clawchain-devnet", height = "99"): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          node_info: { network: chainId },
          sync_info: { latest_block_height: height },
        },
      }),
      text: async () => "",
    }) as Response) as typeof fetch;
}

describe("createClawViemClient", () => {
  test("connects and disconnects the underlying ClawChain client", async () => {
    const backend = mockBackend();
    const client = createClawViemClient({ client: backend, fetch: statusFetch() });

    assert.equal(await client.connect(), client);
    await client.disconnect();

    assert.deepEqual(backend.calls.map((c) => c.name), ["connect", "disconnect"]);
  });

  test("reads chain id and block height from Tendermint status", async () => {
    const client = createClawViemClient({
      client: mockBackend(),
      fetch: statusFetch("clawchain-test", "123"),
    });

    assert.equal(await client.getChainId(), "clawchain-test");
    assert.equal(await client.getBlockNumber(), 123n);
  });

  test("returns the signer account in viem-style shape", () => {
    const backend = mockBackend();
    const client = createClawViemClient({ client: backend, fetch: statusFetch() });

    assert.deepEqual(client.getAccount(), { address: "claw1sender" });
  });

  test("queries balances as bigint with default denom", async () => {
    const backend = mockBackend();
    const client = createClawViemClient({ client: backend, fetch: statusFetch() });

    assert.equal(await client.getBalance({ address: "claw1abc" }), 12345n);
    assert.deepEqual(backend.calls.at(-1), {
      name: "getBalance",
      args: ["claw1abc", "uclaw"],
    });
  });

  test("maps sendTransaction to a Cosmos bank send", async () => {
    const backend = mockBackend();
    const client = createClawViemClient({ client: backend, fetch: statusFetch() });

    const result = await client.sendTransaction({ to: "claw1dest", value: 1000n });

    assert.deepEqual(backend.calls.at(-1), {
      name: "sendTokens",
      args: ["claw1dest", "1000", "uclaw"],
    });
    assert.equal(result.hash, "ABC123");
    assert.equal(result.height, 42n);
    assert.equal(result.gasUsed, 1000n);
    assert.equal(result.gasWanted, 1200n);
  });

  test("maps readContract to a CosmWasm smart query", async () => {
    const backend = mockBackend();
    const client = createClawViemClient({ client: backend, fetch: statusFetch() });

    const result = await client.readContract({
      address: "claw1contract",
      functionName: "balance",
      args: { address: "claw1holder" },
    });

    assert.deepEqual(result, { answer: 7 });
    assert.deepEqual(backend.calls.at(-1), {
      name: "queryContract",
      args: ["claw1contract", { balance: { address: "claw1holder" } }],
    });
  });

  test("maps writeContract to a CosmWasm execute", async () => {
    const backend = mockBackend();
    const client = createClawViemClient({ client: backend, fetch: statusFetch() });
    const funds = [{ denom: "uclaw", amount: "500" }];

    const result = await client.writeContract({
      address: "claw1contract",
      functionName: "transfer",
      args: { recipient: "claw1dest", amount: "500" },
      funds,
    });

    assert.equal(result.hash, "DEF456");
    assert.deepEqual(backend.calls.at(-1), {
      name: "executeContract",
      args: [
        "claw1sender",
        "claw1contract",
        { transfer: { recipient: "claw1dest", amount: "500" } },
        funds,
      ],
    });
  });

  test("rejects non-integer transfer values", async () => {
    const client = createClawViemClient({ client: mockBackend(), fetch: statusFetch() });

    await assert.rejects(
      () => client.sendTransaction({ to: "claw1dest", value: "1.5" }),
      /value must be an integer string/,
    );
  });
});
