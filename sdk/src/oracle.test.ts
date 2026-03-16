import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ClawChainClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helper: create a ClawChainClient and override global fetch to return
// the given mock response body.  Returns {client, fetchCalls, restore} where
// fetchCalls collects every URL that was fetched.
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
// getOraclePrice
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOraclePrice", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      rate: {
        denom_pair: "CLAW/USD",
        price: "1.250000",
        timestamp: "2026-03-17T00:00:00Z",
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOraclePrice("CLAW/USD");
      assert.deepEqual(result.rate.denom_pair, "CLAW/USD");
      assert.equal(result.rate.price, "1.250000");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1/price/CLAW%2FUSD"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.getOraclePrice("UNKNOWN/PAIR"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          assert.ok(err.message.includes("getOraclePrice"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOraclePrices
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOraclePrices", () => {
  test("parses response with multiple rates", async () => {
    const mockResponse = {
      rates: [
        { denom_pair: "CLAW/USD", price: "1.25", timestamp: "2026-03-17T00:00:00Z" },
        { denom_pair: "CLAW/BTC", price: "0.000015", timestamp: "2026-03-17T00:00:00Z" },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOraclePrices();
      assert.equal(result.rates.length, 2);
      assert.equal(result.rates[0].denom_pair, "CLAW/USD");
      assert.equal(result.rates[1].denom_pair, "CLAW/BTC");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1/prices"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "server error" }, 500);
    try {
      await assert.rejects(
        () => client.getOraclePrices(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          assert.ok(err.message.includes("getOraclePrices"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOraclePriceHistory
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOraclePriceHistory", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      entries: [
        { denom_pair: "CLAW/USD", price: "1.20", timestamp: "2026-03-16T00:00:00Z", block_height: "100" },
        { denom_pair: "CLAW/USD", price: "1.25", timestamp: "2026-03-17T00:00:00Z", block_height: "200" },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOraclePriceHistory("CLAW/USD");
      assert.equal(result.entries.length, 2);
      assert.equal(result.entries[0].price, "1.20");
      assert.equal(result.entries[1].block_height, "200");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1/price_history/CLAW%2FUSD"));
    } finally {
      restore();
    }
  });

  test("includes limit query parameter when provided", async () => {
    const { client, fetchCalls, restore } = mockFetchClient({ entries: [] });
    try {
      await client.getOraclePriceHistory("CLAW/USD", 10);
      assert.ok(fetchCalls[0].includes("limit=10"));
    } finally {
      restore();
    }
  });

  test("omits limit query parameter when not provided", async () => {
    const { client, fetchCalls, restore } = mockFetchClient({ entries: [] });
    try {
      await client.getOraclePriceHistory("CLAW/USD");
      assert.ok(!fetchCalls[0].includes("limit="));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "bad" }, 400);
    try {
      await assert.rejects(
        () => client.getOraclePriceHistory("CLAW/USD"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 400"));
          assert.ok(err.message.includes("getOraclePriceHistory"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleParams
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleParams", () => {
  test("parses response correctly", async () => {
    const mockResponse = {
      params: {
        vote_period: "5",
        vote_threshold: "0.500000",
        reward_band: "0.020000",
        slash_fraction: "0.000100",
        slash_window: "100800",
        min_valid_per_window: "0.050000",
        whitelist: ["CLAW/USD", "CLAW/BTC"],
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleParams();
      assert.equal(result.params.vote_period, "5");
      assert.equal(result.params.vote_threshold, "0.500000");
      assert.deepEqual(result.params.whitelist, ["CLAW/USD", "CLAW/BTC"]);
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1/params"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({}, 503);
    try {
      await assert.rejects(
        () => client.getOracleParams(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 503"));
          assert.ok(err.message.includes("getOracleParams"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleMissCounter
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleMissCounter", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      miss_counter: "42",
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleMissCounter("clawvaloper1abc");
      assert.equal(result.miss_counter, "42");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1/miss/clawvaloper1abc"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.getOracleMissCounter("clawvaloper1unknown"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          assert.ok(err.message.includes("getOracleMissCounter"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleFeederDelegation
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleFeederDelegation", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      feeder: "claw1feeder_address_here",
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleFeederDelegation("clawvaloper1abc");
      assert.equal(result.feeder, "claw1feeder_address_here");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1/feeder/clawvaloper1abc"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.getOracleFeederDelegation("clawvaloper1unknown"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          assert.ok(err.message.includes("getOracleFeederDelegation"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});
