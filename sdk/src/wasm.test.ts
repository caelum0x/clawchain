import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ClawChainClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helper: mock globalThis.fetch and return a client wired to localhost
// ---------------------------------------------------------------------------

function mockFetchClient(mockBody: unknown, httpStatus = 200) {
  const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: any, _init?: any) => {
    fetchCalls.push(String(input));
    return {
      ok: httpStatus >= 200 && httpStatus < 300,
      status: httpStatus,
      json: async () => mockBody,
      text: async () => JSON.stringify(mockBody),
    } as Response;
  }) as typeof globalThis.fetch;

  const restore = () => {
    globalThis.fetch = originalFetch;
  };

  return { client, fetchCalls, restore };
}

// ---------------------------------------------------------------------------
// CosmWasm query tests (mock fetch)
// ---------------------------------------------------------------------------

describe("ClawChainClient CosmWasm query – queryContract", () => {
  test("queryContract encodes query as base64 and returns data", async () => {
    const mockResponse = { data: { balance: "1000000" } };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.queryContract("cosmos1contract", { balance: { address: "cosmos1abc" } });
      assert.deepEqual(result, { balance: "1000000" });
      // URL should contain the contract address and /smart/
      assert.ok(fetchCalls[0].includes("/cosmwasm/wasm/v1/contract/cosmos1contract/smart/"));
      // Verify that the query data is base64-encoded JSON
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded, { balance: { address: "cosmos1abc" } });
    } finally {
      restore();
    }
  });

  test("queryContract throws on HTTP error", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.queryContract("cosmos1contract", { balance: {} }),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

describe("ClawChainClient CosmWasm query – getContractCodes", () => {
  test("getContractCodes parses response correctly", async () => {
    const mockResponse = {
      code_infos: [
        {
          code_id: "1",
          creator: "cosmos1creator",
          data_hash: "ABCDEF1234567890",
          instantiate_permission: {
            permission: "ACCESS_TYPE_EVERYBODY",
          },
        },
        {
          code_id: "2",
          creator: "cosmos1other",
          data_hash: "1234567890ABCDEF",
          instantiate_permission: {
            permission: "ACCESS_TYPE_ONLY_ADDRESS",
            address: "cosmos1admin",
          },
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getContractCodes();
      assert.equal(result.length, 2);
      assert.equal(result[0].codeId, 1);
      assert.equal(result[0].creator, "cosmos1creator");
      assert.equal(result[0].dataHash, "ABCDEF1234567890");
      assert.equal(result[0].instantiatePermission.permission, "Everybody");
      assert.equal(result[1].codeId, 2);
      assert.equal(result[1].creator, "cosmos1other");
      assert.equal(result[1].instantiatePermission.permission, "OnlyAddress");
      assert.ok(fetchCalls[0].includes("/cosmwasm/wasm/v1/code"));
    } finally {
      restore();
    }
  });

  test("getContractCodes handles empty response", async () => {
    const { client, restore } = mockFetchClient({ code_infos: [] });
    try {
      const result = await client.getContractCodes();
      assert.equal(result.length, 0);
    } finally {
      restore();
    }
  });
});

describe("ClawChainClient CosmWasm query – getCodeInfo", () => {
  test("getCodeInfo parses response correctly", async () => {
    const mockResponse = {
      code_info: {
        code_id: "42",
        creator: "cosmos1creator",
        data_hash: "DEADBEEF",
        instantiate_permission: {
          permission: "ACCESS_TYPE_ANY_OF_ADDRESSES",
          addresses: ["cosmos1a", "cosmos1b"],
        },
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getCodeInfo(42);
      assert.equal(result.codeId, 42);
      assert.equal(result.creator, "cosmos1creator");
      assert.equal(result.dataHash, "DEADBEEF");
      assert.equal(result.instantiatePermission.permission, "AnyOfAddresses");
      assert.deepEqual(result.instantiatePermission.addresses, ["cosmos1a", "cosmos1b"]);
      assert.ok(fetchCalls[0].includes("/cosmwasm/wasm/v1/code/42"));
    } finally {
      restore();
    }
  });

  test("getCodeInfo throws on HTTP error", async () => {
    const { client, restore } = mockFetchClient({}, 404);
    try {
      await assert.rejects(
        () => client.getCodeInfo(999),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

describe("ClawChainClient CosmWasm query – getContractInfo", () => {
  test("getContractInfo parses response correctly", async () => {
    const mockResponse = {
      address: "cosmos1contractaddr",
      contract_info: {
        code_id: "5",
        creator: "cosmos1creator",
        admin: "cosmos1admin",
        label: "my-token",
        created: {
          block_height: "100",
          tx_index: "0",
        },
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getContractInfo("cosmos1contractaddr");
      assert.equal(result.address, "cosmos1contractaddr");
      assert.equal(result.codeId, 5);
      assert.equal(result.creator, "cosmos1creator");
      assert.equal(result.admin, "cosmos1admin");
      assert.equal(result.label, "my-token");
      assert.equal(result.created?.blockHeight, 100);
      assert.equal(result.created?.txIndex, 0);
      assert.ok(fetchCalls[0].includes("/cosmwasm/wasm/v1/contract/cosmos1contractaddr"));
    } finally {
      restore();
    }
  });

  test("getContractInfo handles missing created field", async () => {
    const mockResponse = {
      address: "cosmos1contractaddr",
      contract_info: {
        code_id: "3",
        creator: "cosmos1creator",
        admin: "",
        label: "test",
      },
    };
    const { client, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getContractInfo("cosmos1contractaddr");
      assert.equal(result.codeId, 3);
      assert.equal(result.created, undefined);
    } finally {
      restore();
    }
  });
});

describe("ClawChainClient CosmWasm query – getContractsByCode", () => {
  test("getContractsByCode parses response correctly", async () => {
    const mockResponse = {
      contracts: ["cosmos1contract1", "cosmos1contract2", "cosmos1contract3"],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getContractsByCode(5);
      assert.equal(result.length, 3);
      assert.equal(result[0], "cosmos1contract1");
      assert.equal(result[1], "cosmos1contract2");
      assert.equal(result[2], "cosmos1contract3");
      assert.ok(fetchCalls[0].includes("/cosmwasm/wasm/v1/code/5/contracts"));
    } finally {
      restore();
    }
  });

  test("getContractsByCode handles empty response", async () => {
    const { client, restore } = mockFetchClient({ contracts: [] });
    try {
      const result = await client.getContractsByCode(99);
      assert.equal(result.length, 0);
    } finally {
      restore();
    }
  });
});

describe("ClawChainClient CosmWasm query – getContractHistory", () => {
  test("getContractHistory parses response correctly", async () => {
    const mockResponse = {
      entries: [
        {
          operation: "CONTRACT_CODE_HISTORY_OPERATION_TYPE_INIT",
          code_id: "1",
          msg: { initial_supply: "1000000" },
        },
        {
          operation: "CONTRACT_CODE_HISTORY_OPERATION_TYPE_MIGRATE",
          code_id: "2",
          msg: { new_feature: true },
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getContractHistory("cosmos1contract");
      assert.equal(result.length, 2);
      assert.equal(result[0].operation, "Init");
      assert.equal(result[0].codeId, 1);
      assert.deepEqual(result[0].msg, { initial_supply: "1000000" });
      assert.equal(result[1].operation, "Migrate");
      assert.equal(result[1].codeId, 2);
      assert.deepEqual(result[1].msg, { new_feature: true });
      assert.ok(fetchCalls[0].includes("/cosmwasm/wasm/v1/contract/cosmos1contract/history"));
    } finally {
      restore();
    }
  });

  test("getContractHistory handles empty entries", async () => {
    const { client, restore } = mockFetchClient({ entries: [] });
    try {
      const result = await client.getContractHistory("cosmos1contract");
      assert.equal(result.length, 0);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// CosmWasm transaction error guard tests
// ---------------------------------------------------------------------------

describe("ClawChainClient CosmWasm transactions – error guards", () => {
  test("uploadContract throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.uploadContract("cosmos1sender", new Uint8Array([0, 1, 2])),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("instantiateContract throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.instantiateContract("cosmos1sender", 1, { count: 0 }, "counter"),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("executeContract throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.executeContract("cosmos1sender", "cosmos1contract", { increment: {} }),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("migrateContract throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.migrateContract("cosmos1sender", "cosmos1contract", 2, {}),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });
});
