import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ClawChainClient } from "./client.js";
import {
  REST_STAKING_DELEGATIONS,
  REST_STAKING_REWARDS,
  REST_ESCROWS,
  REST_TASKS_BY_DELEGATOR,
  REST_TASKS_BY_ASSIGNEE,
  REST_SKILLS_BY_OWNER,
  REST_PROVIDER_STATS,
  REST_TOP_AGENTS,
  REST_AGENT_REWARDS,
} from "./constants.js";

// ---------------------------------------------------------------------------
// Mock fetch helper — routes responses by URL patterns
// ---------------------------------------------------------------------------

type RouteMap = Record<string, unknown>;

function mockFetchClientMulti(routes: RouteMap) {
  const client = new ClawChainClient({ rpcUrl: "http://localhost:26657" });
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: any, _init?: any) => {
    const url = String(input);
    fetchCalls.push(url);

    for (const [pattern, body] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }
    }

    // Default: 404
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "not found",
    } as Response;
  }) as typeof globalThis.fetch;

  const restore = () => {
    globalThis.fetch = originalFetch;
  };

  return { client, fetchCalls, restore };
}

// Simple single-response mock
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
// getPortfolioSummary tests
// ---------------------------------------------------------------------------

describe("ClawChainClient.getPortfolioSummary", () => {
  test("aggregates all portfolio components correctly", async () => {
    const address = "cosmos1user";
    const { client, fetchCalls, restore } = mockFetchClientMulti({
      "by_denom": { balance: { amount: "5000000" } },
      "staking/v1beta1/delegations/cosmos1user": {
        delegation_responses: [
          { delegation: { validator_address: "v1" }, balance: { denom: "uclaw", amount: "2000000" } },
          { delegation: { validator_address: "v2" }, balance: { denom: "uclaw", amount: "1000000" } },
        ],
      },
      "distribution/v1beta1/delegators/cosmos1user/rewards": {
        total: [{ denom: "uclaw", amount: "250000.500000" }],
      },
      "marketplace/v1/escrows/cosmos1user": {
        escrows: [
          { buyer: address, status: "active", amount: "500000" },
          { buyer: address, status: "completed", amount: "100000" }, // not counted
          { buyer: "cosmos1other", status: "active", amount: "200000" }, // not counted
        ],
      },
      "tasks/delegator/cosmos1user": {
        tasks: [
          { status: "accepted", budget: "300000uclaw" },
          { status: "completed", budget: "200000uclaw" }, // not counted
          { status: "pending", budget: "100000" },
        ],
      },
    });

    try {
      const summary = await client.getPortfolioSummary(address);

      assert.equal(summary.address, address);
      assert.equal(summary.available, "5000000");
      assert.equal(summary.staked, "3000000");  // 2M + 1M
      assert.equal(summary.rewards, "250000");  // truncated from 250000.5
      assert.equal(summary.escrowLocked, "500000"); // only active buyer escrows
      assert.equal(summary.taskBudgets, "400000"); // 300000 + 100000 (accepted + pending)
      assert.equal(
        summary.totalValue,
        String(5000000n + 3000000n + 250000n + 500000n + 400000n),
      );

      // Verify all 5 parallel fetches were made
      assert.ok(fetchCalls.length >= 5);
    } finally {
      restore();
    }
  });

  test("handles partial failures gracefully (defaults to 0)", async () => {
    const { client, restore } = mockFetchClientMulti({
      "by_denom": { balance: { amount: "1000" } },
      // All other endpoints return 404 -> "0"
    });

    try {
      const summary = await client.getPortfolioSummary("cosmos1fail");

      assert.equal(summary.available, "1000");
      assert.equal(summary.staked, "0");
      assert.equal(summary.rewards, "0");
      assert.equal(summary.escrowLocked, "0");
      assert.equal(summary.taskBudgets, "0");
      assert.equal(summary.totalValue, "1000");
    } finally {
      restore();
    }
  });

  test("handles all endpoints failing", async () => {
    const { client, restore } = mockFetchClient({}, 500);

    try {
      const summary = await client.getPortfolioSummary("cosmos1dead");

      assert.equal(summary.available, "0");
      assert.equal(summary.staked, "0");
      assert.equal(summary.rewards, "0");
      assert.equal(summary.escrowLocked, "0");
      assert.equal(summary.taskBudgets, "0");
      assert.equal(summary.totalValue, "0");
    } finally {
      restore();
    }
  });

  test("handles empty delegation responses", async () => {
    const { client, restore } = mockFetchClientMulti({
      "by_denom": { balance: { amount: "100" } },
      "staking/v1beta1/delegations": { delegation_responses: [] },
      "distribution/v1beta1/delegators": { total: [] },
      "marketplace/v1/escrows": { escrows: [] },
      "tasks/delegator": { tasks: [] },
    });

    try {
      const summary = await client.getPortfolioSummary("cosmos1empty");
      assert.equal(summary.available, "100");
      assert.equal(summary.staked, "0");
      assert.equal(summary.rewards, "0");
      assert.equal(summary.totalValue, "100");
    } finally {
      restore();
    }
  });

  test("task budgets strip non-numeric characters (denom suffix)", async () => {
    const { client, restore } = mockFetchClientMulti({
      "by_denom": { balance: { amount: "0" } },
      "staking/v1beta1/delegations": { delegation_responses: [] },
      "distribution/v1beta1/delegators": { total: [] },
      "marketplace/v1/escrows": { escrows: [] },
      "tasks/delegator": {
        tasks: [
          { status: "in_progress", budget: "500uclaw" },
          { status: "accepted", budget: "1000uclaw" },
        ],
      },
    });

    try {
      const summary = await client.getPortfolioSummary("cosmos1x");
      assert.equal(summary.taskBudgets, "1500");
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getAgentEarnings tests
// ---------------------------------------------------------------------------

describe("ClawChainClient.getAgentEarnings", () => {
  test("aggregates all earnings sources", async () => {
    const address = "cosmos1agent";
    const { client, restore } = mockFetchClientMulti({
      "tasks/assignee/cosmos1agent": {
        tasks: [
          { status: "completed", budget: "1000000uclaw" },
          { status: "completed", budget: "500000uclaw" },
          { status: "pending", budget: "200000uclaw" }, // not counted
        ],
      },
      "skills/owner/cosmos1agent": {
        skills: [
          { price: "100000", purchaseCount: 5 },
          { price: "50000", purchase_count: 10 },
        ],
      },
      "distribution/v1beta1/delegators/cosmos1agent/rewards": {
        total: [{ denom: "uclaw", amount: "75000" }],
      },
      "provider_stats/cosmos1agent": {
        stats: { totalRevenue: "250000" },
      },
    });

    try {
      const earnings = await client.getAgentEarnings(address);

      assert.equal(earnings.address, address);
      assert.equal(earnings.taskRewards, "1500000");    // 1M + 500K
      assert.equal(earnings.skillSales, "1000000");     // 100K*5 + 50K*10
      assert.equal(earnings.stakingRewards, "75000");
      assert.equal(earnings.computeFees, "250000");
      assert.equal(
        earnings.total,
        String(1500000n + 1000000n + 75000n + 250000n),
      );
    } finally {
      restore();
    }
  });

  test("handles missing provider stats gracefully", async () => {
    const { client, restore } = mockFetchClientMulti({
      "tasks/assignee": { tasks: [] },
      "skills/owner": { skills: [] },
      "distribution/v1beta1/delegators": { total: [] },
      // provider_stats -> 404
    });

    try {
      const earnings = await client.getAgentEarnings("cosmos1nocompute");
      assert.equal(earnings.taskRewards, "0");
      assert.equal(earnings.skillSales, "0");
      assert.equal(earnings.stakingRewards, "0");
      assert.equal(earnings.computeFees, "0");
      assert.equal(earnings.total, "0");
    } finally {
      restore();
    }
  });

  test("only counts completed tasks for earnings", async () => {
    const { client, restore } = mockFetchClientMulti({
      "tasks/assignee": {
        tasks: [
          { status: "completed", budget: "1000" },
          { status: "accepted", budget: "2000" },
          { status: "failed", budget: "3000" },
        ],
      },
      "skills/owner": { skills: [] },
      "distribution/v1beta1/delegators": { total: [] },
      "provider_stats": { stats: { totalRevenue: "0" } },
    });

    try {
      const earnings = await client.getAgentEarnings("cosmos1worker");
      assert.equal(earnings.taskRewards, "1000");
    } finally {
      restore();
    }
  });

  test("skill sales multiply price by purchase count", async () => {
    const { client, restore } = mockFetchClientMulti({
      "tasks/assignee": { tasks: [] },
      "skills/owner": {
        skills: [
          { price: "200", purchaseCount: 3 },
          { price: "0", purchaseCount: 100 },  // zero price
        ],
      },
      "distribution/v1beta1/delegators": { total: [] },
      "provider_stats": { stats: { totalRevenue: "0" } },
    });

    try {
      const earnings = await client.getAgentEarnings("cosmos1seller");
      assert.equal(earnings.skillSales, "600"); // 200*3 + 0*100
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// getLeaderboard tests
// ---------------------------------------------------------------------------

describe("ClawChainClient.getLeaderboard", () => {
  test("reputation leaderboard parses top agents", async () => {
    const { client, fetchCalls, restore } = mockFetchClient({
      agents: [
        { agentAddress: "cosmos1a", name: "Agent A", avgRatingBps: 4500 },
        { agentAddress: "cosmos1b", name: "Agent B", avgRatingBps: 4200 },
        { agentAddress: "cosmos1c", name: "Agent C", avgRatingBps: 3800 },
      ],
    });

    try {
      const entries = await client.getLeaderboard("reputation", 3);

      assert.equal(entries.length, 3);
      assert.equal(entries[0].rank, 1);
      assert.equal(entries[0].address, "cosmos1a");
      assert.equal(entries[0].name, "Agent A");
      assert.equal(entries[0].score, "4500");
      assert.equal(entries[0].metric, "reputation");
      assert.equal(entries[2].rank, 3);
      assert.ok(fetchCalls[0].includes("limit=3"));
    } finally {
      restore();
    }
  });

  test("earnings leaderboard parses reward entries", async () => {
    const { client, fetchCalls, restore } = mockFetchClient({
      entries: [
        { address: "cosmos1top", name: "TopEarner", cumulativeRewards: "10000000" },
        { address: "cosmos1mid", name: "MidEarner", cumulativeRewards: "5000000" },
      ],
    });

    try {
      const entries = await client.getLeaderboard("earnings", 5);

      assert.equal(entries.length, 2);
      assert.equal(entries[0].address, "cosmos1top");
      assert.equal(entries[0].score, "10000000");
      assert.equal(entries[0].metric, "earnings");
      assert.equal(entries[1].rank, 2);
      assert.ok(fetchCalls[0].includes("limit=5"));
    } finally {
      restore();
    }
  });

  test("tasks leaderboard computes score from intents", async () => {
    const { client, restore } = mockFetchClient({
      agents: [
        {
          agentAddress: "cosmos1busy",
          name: "BusyAgent",
          intentsCreated: 50,
          intentsCompleted: 45,
        },
        {
          agentAddress: "cosmos1lazy",
          name: "LazyAgent",
          intentsCreated: 2,
          intentsCompleted: 1,
        },
      ],
    });

    try {
      const entries = await client.getLeaderboard("tasks", 10);

      assert.equal(entries.length, 2);
      assert.equal(entries[0].score, "95");  // 50 + 45
      assert.equal(entries[1].score, "3");   // 2 + 1
      assert.equal(entries[0].metric, "tasks");
    } finally {
      restore();
    }
  });

  test("leaderboard defaults to limit=10 when not specified", async () => {
    const { client, fetchCalls, restore } = mockFetchClient({ agents: [] });

    try {
      await client.getLeaderboard("reputation");
      assert.ok(fetchCalls[0].includes("limit=10"));
    } finally {
      restore();
    }
  });

  test("leaderboard handles HTTP error gracefully", async () => {
    const { client, restore } = mockFetchClient({}, 500);

    try {
      const entries = await client.getLeaderboard("reputation");
      assert.equal(entries.length, 0);
    } finally {
      restore();
    }
  });

  test("earnings leaderboard handles snake_case fields", async () => {
    const { client, restore } = mockFetchClient({
      entries: [
        { address: "cosmos1a", name: "A", cumulative_rewards: "999" },
      ],
    });

    try {
      const entries = await client.getLeaderboard("earnings");
      assert.equal(entries[0].score, "999");
    } finally {
      restore();
    }
  });

  test("tasks leaderboard handles snake_case fields", async () => {
    const { client, restore } = mockFetchClient({
      agents: [
        {
          agent_address: "cosmos1x",
          name: "X",
          intents_created: 10,
          intents_completed: 8,
        },
      ],
    });

    try {
      const entries = await client.getLeaderboard("tasks");
      assert.equal(entries[0].address, "cosmos1x");
      assert.equal(entries[0].score, "18");
    } finally {
      restore();
    }
  });

  test("reputation leaderboard limits results to requested count", async () => {
    const { client, restore } = mockFetchClient({
      agents: [
        { agentAddress: "cosmos1a", name: "A", avgRatingBps: 5000 },
        { agentAddress: "cosmos1b", name: "B", avgRatingBps: 4000 },
        { agentAddress: "cosmos1c", name: "C", avgRatingBps: 3000 },
        { agentAddress: "cosmos1d", name: "D", avgRatingBps: 2000 },
      ],
    });

    try {
      const entries = await client.getLeaderboard("reputation", 2);
      assert.equal(entries.length, 2);
      assert.equal(entries[0].rank, 1);
      assert.equal(entries[1].rank, 2);
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Portfolio math edge cases
// ---------------------------------------------------------------------------

describe("Portfolio math edge cases", () => {
  test("large values do not overflow with BigInt", async () => {
    const { client, restore } = mockFetchClientMulti({
      "by_denom": { balance: { amount: "999999999999999999" } },
      "staking/v1beta1/delegations": {
        delegation_responses: [
          { balance: { amount: "888888888888888888" } },
        ],
      },
      "distribution/v1beta1/delegators": { total: [{ denom: "uclaw", amount: "777777777777777777" }] },
      "marketplace/v1/escrows": { escrows: [] },
      "tasks/delegator": { tasks: [] },
    });

    try {
      const summary = await client.getPortfolioSummary("cosmos1whale");
      assert.equal(summary.available, "999999999999999999");
      assert.equal(summary.staked, "888888888888888888");
      assert.equal(summary.rewards, "777777777777777777");
      const expected = (
        999999999999999999n + 888888888888888888n + 777777777777777777n
      ).toString();
      assert.equal(summary.totalValue, expected);
    } finally {
      restore();
    }
  });

  test("missing balance field defaults to 0", async () => {
    const { client, restore } = mockFetchClientMulti({
      "by_denom": { balance: {} },
      "staking/v1beta1/delegations": { delegation_responses: [] },
      "distribution/v1beta1/delegators": { total: [] },
      "marketplace/v1/escrows": { escrows: [] },
      "tasks/delegator": { tasks: [] },
    });

    try {
      const summary = await client.getPortfolioSummary("cosmos1nobalance");
      assert.equal(summary.available, "0");
      assert.equal(summary.totalValue, "0");
    } finally {
      restore();
    }
  });
});
