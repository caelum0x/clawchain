import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ClawChainClient } from "./client.js";
import type { DexAsset, DexAssetInfo } from "./types.js";

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
// queryFactoryPairs
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – queryFactoryPairs", () => {
  test("returns pairs from factory", async () => {
    const mockPairs = [
      {
        asset_infos: [
          { native_token: { denom: "uclaw" } },
          { native_token: { denom: "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2" } },
        ],
        contract_addr: "claw1pair1",
        liquidity_token: "claw1lp1",
        pair_type: { xyk: {} },
      },
    ];
    const { client, fetchCalls, restore } = mockFetchClient({ data: { pairs: mockPairs } });
    try {
      const result = await client.queryFactoryPairs("claw1factory");
      assert.equal(result.length, 1);
      assert.equal(result[0].contract_addr, "claw1pair1");
      assert.ok(fetchCalls[0].includes("/cosmwasm/wasm/v1/contract/claw1factory/smart/"));
      // Verify the query message is {pairs:{}}
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded, { pairs: {} });
    } finally {
      restore();
    }
  });

  test("returns empty array when no pairs exist", async () => {
    const { client, restore } = mockFetchClient({ data: { pairs: [] } });
    try {
      const result = await client.queryFactoryPairs("claw1factory");
      assert.equal(result.length, 0);
    } finally {
      restore();
    }
  });

  test("passes limit and start_after parameters", async () => {
    const { client, fetchCalls, restore } = mockFetchClient({ data: { pairs: [] } });
    try {
      const startAfter = [
        { native_token: { denom: "uclaw" } },
        { native_token: { denom: "uatom" } },
      ] as [unknown, unknown];
      await client.queryFactoryPairs("claw1factory", startAfter, 10);
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded.pairs.limit, 10);
      assert.deepEqual(decoded.pairs.start_after, startAfter);
    } finally {
      restore();
    }
  });

  test("handles null pairs in response gracefully", async () => {
    const { client, restore } = mockFetchClient({ data: {} });
    try {
      const result = await client.queryFactoryPairs("claw1factory");
      assert.equal(result.length, 0);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// queryPoolState
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – queryPoolState", () => {
  test("returns pool state with assets and total share", async () => {
    const mockPool = {
      assets: [
        { info: { native_token: { denom: "uclaw" } }, amount: "1000000000" },
        { info: { native_token: { denom: "uatom" } }, amount: "500000000" },
      ],
      total_share: "707106781",
    };
    const { client, fetchCalls, restore } = mockFetchClient({ data: mockPool });
    try {
      const result = await client.queryPoolState("claw1pair1");
      assert.equal(result.assets.length, 2);
      assert.equal(result.assets[0].amount, "1000000000");
      assert.equal(result.assets[1].amount, "500000000");
      assert.equal(result.total_share, "707106781");
      // Verify query message
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded, { pool: {} });
    } finally {
      restore();
    }
  });

  test("throws on HTTP error", async () => {
    const { client, restore } = mockFetchClient({}, 500);
    try {
      await assert.rejects(
        () => client.queryPoolState("claw1pair1"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// simulateSwap
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – simulateSwap", () => {
  test("simulates a native token swap", async () => {
    const mockSimulation = {
      return_amount: "980000",
      spread_amount: "10000",
      commission_amount: "10000",
    };
    const offerAsset: DexAsset = {
      info: { native_token: { denom: "uclaw" } },
      amount: "1000000",
    };
    const { client, fetchCalls, restore } = mockFetchClient({ data: mockSimulation });
    try {
      const result = await client.simulateSwap("claw1pair1", offerAsset);
      assert.equal(result.return_amount, "980000");
      assert.equal(result.spread_amount, "10000");
      assert.equal(result.commission_amount, "10000");
      // Verify query message
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded, { simulation: { offer_asset: offerAsset } });
    } finally {
      restore();
    }
  });

  test("simulates a CW20 token swap", async () => {
    const mockSimulation = {
      return_amount: "500000",
      spread_amount: "5000",
      commission_amount: "5000",
    };
    const offerAsset: DexAsset = {
      info: { token: { contract_addr: "claw1cw20token" } },
      amount: "1000000",
    };
    const { client, restore } = mockFetchClient({ data: mockSimulation });
    try {
      const result = await client.simulateSwap("claw1pair1", offerAsset);
      assert.equal(result.return_amount, "500000");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// reverseSimulateSwap
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – reverseSimulateSwap", () => {
  test("reverse simulates to find required offer amount", async () => {
    const mockReverse = {
      offer_amount: "1020000",
      spread_amount: "10000",
      commission_amount: "10000",
    };
    const askAsset: DexAsset = {
      info: { native_token: { denom: "uatom" } },
      amount: "1000000",
    };
    const { client, fetchCalls, restore } = mockFetchClient({ data: mockReverse });
    try {
      const result = await client.reverseSimulateSwap("claw1pair1", askAsset);
      assert.equal(result.offer_amount, "1020000");
      assert.equal(result.spread_amount, "10000");
      assert.equal(result.commission_amount, "10000");
      // Verify query message
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded, { reverse_simulation: { ask_asset: askAsset } });
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// queryRouterConfig
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – queryRouterConfig", () => {
  test("returns router configuration", async () => {
    const mockConfig = {
      astroport_factory: "claw1factory",
    };
    const { client, fetchCalls, restore } = mockFetchClient({ data: mockConfig });
    try {
      const result = await client.queryRouterConfig("claw1router");
      assert.equal(result.astroport_factory, "claw1factory");
      // Verify query message
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded, { config: {} });
    } finally {
      restore();
    }
  });

  test("throws on HTTP error", async () => {
    const { client, restore } = mockFetchClient({}, 404);
    try {
      await assert.rejects(
        () => client.queryRouterConfig("claw1router"),
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

// ---------------------------------------------------------------------------
// swap() – error guards
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – swap error guards", () => {
  test("swap throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.swap("cosmos1sender", "cosmos1pair", "uclaw", "1000000"),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("swap throws when pairAddress is empty", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.swap("cosmos1sender", "", "uclaw", "1000000"),
      (err: Error) => {
        assert.ok(err.message.includes("pairAddress is required"));
        return true;
      },
    );
  });

  test("swap throws when offerAsset is empty", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.swap("cosmos1sender", "cosmos1pair", "", "1000000"),
      (err: Error) => {
        assert.ok(err.message.includes("offerAsset is required"));
        return true;
      },
    );
  });

  test("swap throws when amount is zero", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.swap("cosmos1sender", "cosmos1pair", "uclaw", "0"),
      (err: Error) => {
        assert.ok(err.message.includes("amount must be > 0"));
        return true;
      },
    );
  });

  test("swap throws when amount is empty string", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.swap("cosmos1sender", "cosmos1pair", "uclaw", ""),
      (err: Error) => {
        assert.ok(err.message.includes("amount must be > 0"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// addLiquidity() – error guards
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – addLiquidity error guards", () => {
  test("addLiquidity throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.addLiquidity("cosmos1sender", "cosmos1pair", [
          { denom: "uclaw", amount: "1000000" },
          { denom: "uatom", amount: "500000" },
        ]),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("addLiquidity throws when pairAddress is empty", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.addLiquidity("cosmos1sender", "", [
          { denom: "uclaw", amount: "1000000" },
        ]),
      (err: Error) => {
        assert.ok(err.message.includes("pairAddress is required"));
        return true;
      },
    );
  });

  test("addLiquidity throws when assets array is empty", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () => client.addLiquidity("cosmos1sender", "cosmos1pair", []),
      (err: Error) => {
        assert.ok(err.message.includes("at least one asset is required"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// removeLiquidity() – error guards
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – removeLiquidity error guards", () => {
  test("removeLiquidity throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.removeLiquidity(
          "cosmos1sender",
          "cosmos1pair",
          "cosmos1lptoken",
          "1000000",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("removeLiquidity throws when pairAddress is empty", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.removeLiquidity("cosmos1sender", "", "cosmos1lptoken", "1000000"),
      (err: Error) => {
        assert.ok(err.message.includes("pairAddress is required"));
        return true;
      },
    );
  });

  test("removeLiquidity throws when lpTokenAddress is empty", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.removeLiquidity("cosmos1sender", "cosmos1pair", "", "1000000"),
      (err: Error) => {
        assert.ok(err.message.includes("lpTokenAddress is required"));
        return true;
      },
    );
  });

  test("removeLiquidity throws when lpAmount is zero", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.removeLiquidity(
          "cosmos1sender",
          "cosmos1pair",
          "cosmos1lptoken",
          "0",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("lpAmount must be > 0"));
        return true;
      },
    );
  });

  test("removeLiquidity throws when lpAmount is empty string", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.removeLiquidity(
          "cosmos1sender",
          "cosmos1pair",
          "cosmos1lptoken",
          "",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("lpAmount must be > 0"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// createPool() – error guards
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – createPool error guards", () => {
  test("createPool throws when signing client not available", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.createPool(
          "cosmos1sender",
          "cosmos1factory",
          [
            { native_token: { denom: "uclaw" } },
            { native_token: { denom: "uatom" } },
          ],
          { xyk: {} },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("signing client not available"));
        return true;
      },
    );
  });

  test("createPool throws when factoryAddress is empty", async () => {
    const client = new ClawChainClient();
    await assert.rejects(
      () =>
        client.createPool(
          "cosmos1sender",
          "",
          [
            { native_token: { denom: "uclaw" } },
            { native_token: { denom: "uatom" } },
          ],
          { xyk: {} },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("factoryAddress is required"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// queryPoolLiquidity()
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – queryPoolLiquidity", () => {
  test("returns typed PoolInfo with totalShare", async () => {
    const mockResponse = {
      data: {
        assets: [
          { info: { native_token: { denom: "uclaw" } }, amount: "5000000" },
          { info: { native_token: { denom: "uatom" } }, amount: "2500000" },
        ],
        total_share: "3535533",
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.queryPoolLiquidity("cosmos1pair");
      assert.deepEqual(result.assets[0].info, { native_token: { denom: "uclaw" } });
      assert.equal(result.assets[0].amount, "5000000");
      assert.deepEqual(result.assets[1].info, { native_token: { denom: "uatom" } });
      assert.equal(result.assets[1].amount, "2500000");
      assert.equal(result.totalShare, "3535533");
      // Verify query message is {"pool":{}}
      const urlParts = fetchCalls[0].split("/smart/");
      const decoded = JSON.parse(atob(urlParts[1]));
      assert.deepEqual(decoded, { pool: {} });
    } finally {
      restore();
    }
  });

  test("throws when pairAddress is empty", async () => {
    const { client, restore } = mockFetchClient({});
    try {
      await assert.rejects(
        () => client.queryPoolLiquidity(""),
        (err: Error) => {
          assert.ok(err.message.includes("pairAddress is required"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });

  test("throws on HTTP error", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.queryPoolLiquidity("cosmos1pair"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });

  test("handles CW20 pool assets", async () => {
    const mockResponse = {
      data: {
        assets: [
          { info: { native_token: { denom: "uclaw" } }, amount: "10000000" },
          { info: { token: { contract_addr: "cosmos1cw20token" } }, amount: "7500000" },
        ],
        total_share: "8660254",
      },
    };
    const { client, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.queryPoolLiquidity("cosmos1pair");
      assert.deepEqual(result.assets[1].info, { token: { contract_addr: "cosmos1cw20token" } });
      assert.equal(result.totalShare, "8660254");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Message construction tests (mock executeContract to capture args)
// ---------------------------------------------------------------------------

describe("ClawChainClient DEX – swap message construction", () => {
  test("builds correct execute message with default maxSpread", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      sender: string,
      contract: string,
      msg: Record<string, unknown>,
      funds?: Array<{ denom: string; amount: string }>,
    ) => {
      capturedArgs = { sender, contract, msg, funds };
      return { transactionHash: "AABB", height: 100, gasUsed: 200000, events: [] };
    };

    const result = await client.swap("cosmos1sender", "cosmos1pair", "uclaw", "1000000");

    assert.equal(capturedArgs.sender, "cosmos1sender");
    assert.equal(capturedArgs.contract, "cosmos1pair");
    assert.deepEqual(capturedArgs.msg, {
      swap: {
        offer_asset: {
          info: { native_token: { denom: "uclaw" } },
          amount: "1000000",
        },
        max_spread: "0.005",
      },
    });
    assert.deepEqual(capturedArgs.funds, [{ denom: "uclaw", amount: "1000000" }]);
    assert.equal(result.transactionHash, "AABB");
  });

  test("builds correct execute message with custom maxSpread", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      _sender: string,
      _contract: string,
      msg: Record<string, unknown>,
      _funds?: Array<{ denom: string; amount: string }>,
    ) => {
      capturedArgs = { msg };
      return { transactionHash: "CC", height: 101, gasUsed: 150000, events: [] };
    };

    await client.swap("cosmos1sender", "cosmos1pair", "uclaw", "500000", "0.02");

    assert.equal(capturedArgs.msg.swap.max_spread, "0.02");
    assert.equal(capturedArgs.msg.swap.offer_asset.amount, "500000");
  });
});

describe("ClawChainClient DEX – addLiquidity message construction", () => {
  test("builds correct execute message with default slippage", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      sender: string,
      contract: string,
      msg: Record<string, unknown>,
      funds?: Array<{ denom: string; amount: string }>,
    ) => {
      capturedArgs = { sender, contract, msg, funds };
      return { transactionHash: "DD", height: 102, gasUsed: 250000, events: [] };
    };

    await client.addLiquidity("cosmos1sender", "cosmos1pair", [
      { denom: "uclaw", amount: "1000000" },
      { denom: "uatom", amount: "500000" },
    ]);

    assert.equal(capturedArgs.sender, "cosmos1sender");
    assert.equal(capturedArgs.contract, "cosmos1pair");
    assert.deepEqual(capturedArgs.msg, {
      provide_liquidity: {
        assets: [
          { info: { native_token: { denom: "uclaw" } }, amount: "1000000" },
          { info: { native_token: { denom: "uatom" } }, amount: "500000" },
        ],
        slippage_tolerance: "0.01",
      },
    });
    assert.deepEqual(capturedArgs.funds, [
      { denom: "uclaw", amount: "1000000" },
      { denom: "uatom", amount: "500000" },
    ]);
  });

  test("builds correct execute message with custom slippage", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      _sender: string,
      _contract: string,
      msg: Record<string, unknown>,
    ) => {
      capturedArgs = { msg };
      return { transactionHash: "EE", height: 103, gasUsed: 260000, events: [] };
    };

    await client.addLiquidity(
      "cosmos1sender",
      "cosmos1pair",
      [{ denom: "uclaw", amount: "2000000" }],
      "0.005",
    );

    assert.equal(capturedArgs.msg.provide_liquidity.slippage_tolerance, "0.005");
  });
});

describe("ClawChainClient DEX – removeLiquidity message construction", () => {
  test("builds CW20 send message with withdraw_liquidity hook", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      sender: string,
      contract: string,
      msg: Record<string, unknown>,
      funds?: Array<{ denom: string; amount: string }>,
    ) => {
      capturedArgs = { sender, contract, msg, funds };
      return { transactionHash: "FF", height: 104, gasUsed: 180000, events: [] };
    };

    await client.removeLiquidity(
      "cosmos1sender",
      "cosmos1pair",
      "cosmos1lptoken",
      "750000",
    );

    // Should execute on the LP token contract, not the pair
    assert.equal(capturedArgs.sender, "cosmos1sender");
    assert.equal(capturedArgs.contract, "cosmos1lptoken");

    // Verify CW20 send message structure
    assert.equal(capturedArgs.msg.send.contract, "cosmos1pair");
    assert.equal(capturedArgs.msg.send.amount, "750000");

    // Decode the base64-encoded hook message
    const hookMsg = JSON.parse(atob(capturedArgs.msg.send.msg));
    assert.deepEqual(hookMsg, { withdraw_liquidity: {} });

    // No native funds should be attached for CW20 operations
    assert.equal(capturedArgs.funds, undefined);
  });
});

describe("ClawChainClient DEX – createPool message construction", () => {
  test("builds correct create_pair message with xyk pair type", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      sender: string,
      contract: string,
      msg: Record<string, unknown>,
    ) => {
      capturedArgs = { sender, contract, msg };
      return {
        transactionHash: "GG",
        height: 105,
        gasUsed: 300000,
        events: [
          {
            type: "wasm",
            attributes: [{ key: "pair_contract_addr", value: "cosmos1newpair" }],
          },
        ],
      };
    };

    const result = await client.createPool(
      "cosmos1sender",
      "cosmos1factory",
      [
        { native_token: { denom: "uclaw" } },
        { native_token: { denom: "uatom" } },
      ],
      { xyk: {} },
    );

    assert.equal(capturedArgs.sender, "cosmos1sender");
    assert.equal(capturedArgs.contract, "cosmos1factory");
    assert.deepEqual(capturedArgs.msg, {
      create_pair: {
        pair_type: { xyk: {} },
        asset_infos: [
          { native_token: { denom: "uclaw" } },
          { native_token: { denom: "uatom" } },
        ],
      },
    });
    assert.equal(result.pairAddress, "cosmos1newpair");
    assert.equal(result.transactionHash, "GG");
    assert.equal(result.height, 105);
    assert.equal(result.gasUsed, 300000);
  });

  test("builds correct message with stable pair type and CW20 asset", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      _sender: string,
      _contract: string,
      msg: Record<string, unknown>,
    ) => {
      capturedArgs = { msg };
      return {
        transactionHash: "HH",
        height: 106,
        gasUsed: 310000,
        events: [
          {
            type: "wasm",
            attributes: [{ key: "_contract_address", value: "cosmos1stablepair" }],
          },
        ],
      };
    };

    const result = await client.createPool(
      "cosmos1sender",
      "cosmos1factory",
      [
        { native_token: { denom: "uclaw" } },
        { token: { contract_addr: "cosmos1cw20usdc" } },
      ],
      { stable: {} },
    );

    assert.deepEqual(capturedArgs.msg.create_pair.pair_type, { stable: {} });
    assert.deepEqual(capturedArgs.msg.create_pair.asset_infos[1], {
      token: { contract_addr: "cosmos1cw20usdc" },
    });
    assert.equal(result.pairAddress, "cosmos1stablepair");
  });

  test("returns empty pairAddress when no event found", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });

    (client as any).executeContract = async () => ({
      transactionHash: "II",
      height: 107,
      gasUsed: 280000,
      events: [],
    });

    const result = await client.createPool(
      "cosmos1sender",
      "cosmos1factory",
      [
        { native_token: { denom: "uclaw" } },
        { native_token: { denom: "uatom" } },
      ],
      { xyk: {} },
    );

    assert.equal(result.pairAddress, "");
    assert.equal(result.transactionHash, "II");
  });

  test("supports concentrated pair type", async () => {
    const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
    let capturedArgs: any;

    (client as any).executeContract = async (
      _sender: string,
      _contract: string,
      msg: Record<string, unknown>,
    ) => {
      capturedArgs = { msg };
      return { transactionHash: "JJ", height: 108, gasUsed: 290000, events: [] };
    };

    await client.createPool(
      "cosmos1sender",
      "cosmos1factory",
      [
        { native_token: { denom: "uclaw" } },
        { native_token: { denom: "uatom" } },
      ],
      { concentrated: {} },
    );

    assert.deepEqual(capturedArgs.msg.create_pair.pair_type, { concentrated: {} });
  });
});
