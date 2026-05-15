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
// getOracleExchangeRate
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleExchangeRate", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      exchange_rate: "1.250000",
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleExchangeRate("uusd");
      assert.equal(result.exchange_rate, "1.250000");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/denoms/uusd/exchange_rate"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.getOracleExchangeRate("unknown"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          assert.ok(err.message.includes("getOracleExchangeRate"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleExchangeRates
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleExchangeRates", () => {
  test("parses response with multiple exchange rates", async () => {
    const mockResponse = {
      exchange_rates: [
        { denom: "uusd", exchange_rate: "1.25" },
        { denom: "ukrw", exchange_rate: "1500.00" },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleExchangeRates();
      assert.equal(result.exchange_rates.length, 2);
      assert.equal(result.exchange_rates[0].denom, "uusd");
      assert.equal(result.exchange_rates[1].exchange_rate, "1500.00");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/denoms/exchange_rates"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "server error" }, 500);
    try {
      await assert.rejects(
        () => client.getOracleExchangeRates(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          assert.ok(err.message.includes("getOracleExchangeRates"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleTobinTax
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleTobinTax", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      tobin_tax: "0.002500",
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleTobinTax("uusd");
      assert.equal(result.tobin_tax, "0.002500");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/denoms/uusd/tobin_tax"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.getOracleTobinTax("unknown"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          assert.ok(err.message.includes("getOracleTobinTax"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleActives
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleActives", () => {
  test("parses response with active denoms", async () => {
    const mockResponse = {
      actives: ["uusd", "ukrw", "usdr"],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleActives();
      assert.deepEqual(result.actives, ["uusd", "ukrw", "usdr"]);
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/denoms/actives"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({}, 503);
    try {
      await assert.rejects(
        () => client.getOracleActives(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 503"));
          assert.ok(err.message.includes("getOracleActives"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleVoteTargets
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleVoteTargets", () => {
  test("parses response with vote target denoms", async () => {
    const mockResponse = {
      vote_targets: ["uusd", "ukrw"],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleVoteTargets();
      assert.deepEqual(result.vote_targets, ["uusd", "ukrw"]);
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/denoms/vote_targets"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({}, 500);
    try {
      await assert.rejects(
        () => client.getOracleVoteTargets(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          assert.ok(err.message.includes("getOracleVoteTargets"));
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
        reward_distribution_window: "5256000",
        whitelist: [
          { name: "uusd", tobin_tax: "0.002500" },
          { name: "ukrw", tobin_tax: "0.002500" },
        ],
        slash_fraction: "0.000100",
        slash_window: "100800",
        min_valid_per_window: "0.050000",
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleParams();
      assert.equal(result.params.vote_period, "5");
      assert.equal(result.params.vote_threshold, "0.500000");
      assert.equal(result.params.reward_distribution_window, "5256000");
      assert.equal(result.params.whitelist.length, 2);
      assert.equal(result.params.whitelist[0].name, "uusd");
      assert.equal(result.params.whitelist[0].tobin_tax, "0.002500");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/params"));
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
// getOracleFeederDelegation
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleFeederDelegation", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      feeder_addr: "claw1feeder_address_here",
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleFeederDelegation("clawvaloper1abc");
      assert.equal(result.feeder_addr, "claw1feeder_address_here");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/validators/clawvaloper1abc/feeder"));
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
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/validators/clawvaloper1abc/miss"));
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
// getOracleAggregatePrevote
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleAggregatePrevote", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      aggregate_prevote: {
        hash: "abc123",
        voter: "clawvaloper1abc",
        submit_block: "1000",
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleAggregatePrevote("clawvaloper1abc");
      assert.equal(result.aggregate_prevote.hash, "abc123");
      assert.equal(result.aggregate_prevote.voter, "clawvaloper1abc");
      assert.equal(result.aggregate_prevote.submit_block, "1000");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/validators/clawvaloper1abc/aggregate_prevote"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.getOracleAggregatePrevote("clawvaloper1unknown"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          assert.ok(err.message.includes("getOracleAggregatePrevote"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleAggregatePrevotes
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleAggregatePrevotes", () => {
  test("parses response with multiple prevotes", async () => {
    const mockResponse = {
      aggregate_prevotes: [
        { hash: "abc123", voter: "clawvaloper1abc", submit_block: "1000" },
        { hash: "def456", voter: "clawvaloper1def", submit_block: "1001" },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleAggregatePrevotes();
      assert.equal(result.aggregate_prevotes.length, 2);
      assert.equal(result.aggregate_prevotes[0].hash, "abc123");
      assert.equal(result.aggregate_prevotes[1].voter, "clawvaloper1def");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/validators/aggregate_prevotes"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({}, 500);
    try {
      await assert.rejects(
        () => client.getOracleAggregatePrevotes(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          assert.ok(err.message.includes("getOracleAggregatePrevotes"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleAggregateVote
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleAggregateVote", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      aggregate_vote: {
        exchange_rate_tuples: [
          { denom: "uusd", exchange_rate: "1.25" },
          { denom: "ukrw", exchange_rate: "1500.00" },
        ],
        voter: "clawvaloper1abc",
      },
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleAggregateVote("clawvaloper1abc");
      assert.equal(result.aggregate_vote.voter, "clawvaloper1abc");
      assert.equal(result.aggregate_vote.exchange_rate_tuples.length, 2);
      assert.equal(result.aggregate_vote.exchange_rate_tuples[0].denom, "uusd");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/validators/clawvaloper1abc/aggregate_vote"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({ error: "not found" }, 404);
    try {
      await assert.rejects(
        () => client.getOracleAggregateVote("clawvaloper1unknown"),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 404"));
          assert.ok(err.message.includes("getOracleAggregateVote"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleAggregateVotes
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleAggregateVotes", () => {
  test("parses response with multiple votes", async () => {
    const mockResponse = {
      aggregate_votes: [
        {
          exchange_rate_tuples: [{ denom: "uusd", exchange_rate: "1.25" }],
          voter: "clawvaloper1abc",
        },
        {
          exchange_rate_tuples: [{ denom: "uusd", exchange_rate: "1.26" }],
          voter: "clawvaloper1def",
        },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleAggregateVotes();
      assert.equal(result.aggregate_votes.length, 2);
      assert.equal(result.aggregate_votes[0].voter, "clawvaloper1abc");
      assert.equal(result.aggregate_votes[1].voter, "clawvaloper1def");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/validators/aggregate_votes"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({}, 500);
    try {
      await assert.rejects(
        () => client.getOracleAggregateVotes(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          assert.ok(err.message.includes("getOracleAggregateVotes"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getOracleTobinTaxes
// ---------------------------------------------------------------------------

describe("ClawChainClient oracle – getOracleTobinTaxes", () => {
  test("parses response and constructs correct URL", async () => {
    const mockResponse = {
      exchange_rates: [
        { denom: "uusd", exchange_rate: "0.002500" },
        { denom: "ukrw", exchange_rate: "0.002500" },
      ],
    };
    const { client, fetchCalls, restore } = mockFetchClient(mockResponse);
    try {
      const result = await client.getOracleTobinTaxes();
      assert.equal(result.exchange_rates.length, 2);
      assert.equal(result.exchange_rates[0].denom, "uusd");
      assert.ok(fetchCalls[0].includes("/clawchain/oracle/v1beta1/denoms/tobin_taxes"));
    } finally {
      restore();
    }
  });

  test("throws on non-ok response", async () => {
    const { client, restore } = mockFetchClient({}, 500);
    try {
      await assert.rejects(
        () => client.getOracleTobinTaxes(),
        (err: Error) => {
          assert.ok(err.message.includes("HTTP 500"));
          assert.ok(err.message.includes("getOracleTobinTaxes"));
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});
