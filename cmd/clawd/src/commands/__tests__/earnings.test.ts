/**
 * Tests for `clawd earnings` and profitability filter.
 *
 * Mocks fetch to simulate REST API responses for all revenue streams.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
    agentAddress: "claw1test123456789012345678",
  })),
}));

import { runEarnings, gatherEarnings } from "../earnings.js";
import {
  shouldAcceptTask,
  loadProfitabilityConfig,
} from "../../lib/profitability.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Helper: build mock fetch
// ---------------------------------------------------------------------------

function mockFetchAll(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    rewards: { cumulative_rewards: "5000000", denom: "uclaw" },
    tasks: {
      tasks: [
        {
          task_id: 1,
          status: "completed",
          budget: "2000000",
          completed_at: Math.floor(Date.now() / 1000) - 3600,
        },
        {
          task_id: 2,
          status: "completed",
          budget: "3000000",
          completed_at: Math.floor(Date.now() / 1000) - 86400,
        },
        {
          task_id: 3,
          status: "pending",
          budget: "1000000",
          completed_at: 0,
        },
      ],
    },
    stakingRewards: {
      total: [{ denom: "uclaw", amount: "1500000.000000" }],
    },
    balances: {
      balances: [{ denom: "uclaw", amount: "50000000" }],
    },
    ...overrides,
  };

  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes("/clawchain/agent/v1/rewards/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(defaults.rewards),
      });
    }
    if (url.includes("/clawchain/agent/v1/tasks/assignee/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(defaults.tasks),
      });
    }
    if (url.includes("/cosmos/distribution/v1beta1/delegators/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(defaults.stakingRewards),
      });
    }
    if (url.includes("/cosmos/bank/v1beta1/balances/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(defaults.balances),
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// gatherEarnings
// ---------------------------------------------------------------------------

describe("gatherEarnings", () => {
  it("aggregates all revenue streams correctly", async () => {
    mockFetchAll();

    const summary = await gatherEarnings(
      "http://localhost:1317",
      "claw1test123",
      "all",
    );

    expect(summary.address).toBe("claw1test123");
    expect(summary.period).toBe("all");
    expect(summary.streams.agentMining.cumulative).toBe("5000000");
    expect(summary.streams.taskIncome.completed).toBe(2);
    expect(summary.streams.taskIncome.totalBudget).toBe("5000000");
    expect(summary.streams.stakingRewards.pending).toBe("1500000");
    expect(summary.balance).toBe("50000000");
    // Total: 5000000 + 5000000 + 1500000 + 0 = 11500000
    expect(summary.totalEstimatedUclaw).toBe("11500000");
  });

  it("filters tasks by period (7d)", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockFetchAll({
      tasks: {
        tasks: [
          { task_id: 1, status: "completed", budget: "1000000", completed_at: now - 3600 },
          { task_id: 2, status: "completed", budget: "2000000", completed_at: now - 10 * 86400 },
        ],
      },
    });

    const summary = await gatherEarnings(
      "http://localhost:1317",
      "claw1test123",
      "7d",
    );

    // Only task 1 is within 7 days
    expect(summary.streams.taskIncome.completed).toBe(1);
    expect(summary.streams.taskIncome.totalBudget).toBe("1000000");
  });

  it("filters tasks by period (30d)", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockFetchAll({
      tasks: {
        tasks: [
          { task_id: 1, status: "completed", budget: "1000000", completed_at: now - 3600 },
          { task_id: 2, status: "completed", budget: "2000000", completed_at: now - 15 * 86400 },
          { task_id: 3, status: "completed", budget: "4000000", completed_at: now - 60 * 86400 },
        ],
      },
    });

    const summary = await gatherEarnings(
      "http://localhost:1317",
      "claw1test123",
      "30d",
    );

    // Tasks 1 and 2 are within 30 days
    expect(summary.streams.taskIncome.completed).toBe(2);
    expect(summary.streams.taskIncome.totalBudget).toBe("3000000");
  });

  it("handles missing/unavailable streams gracefully", async () => {
    // All endpoints return failure
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    const summary = await gatherEarnings(
      "http://localhost:1317",
      "claw1test123",
      "all",
    );

    expect(summary.streams.agentMining.cumulative).toBe("0");
    expect(summary.streams.taskIncome.completed).toBe(0);
    expect(summary.streams.taskIncome.totalBudget).toBe("0");
    expect(summary.streams.stakingRewards.pending).toBe("0");
    expect(summary.balance).toBe("0");
    expect(summary.totalEstimatedUclaw).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// runEarnings (JSON output)
// ---------------------------------------------------------------------------

describe("runEarnings", () => {
  it("outputs JSON when --json flag is set", async () => {
    mockFetchAll();

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runEarnings({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.address).toBe("claw1test123456789012345678");
    expect(parsed.streams).toBeDefined();
    expect(parsed.streams.agentMining).toBeDefined();
    expect(parsed.streams.taskIncome).toBeDefined();
    expect(parsed.streams.stakingRewards).toBeDefined();
    expect(parsed.streams.skillSales).toBeDefined();
    expect(parsed.totalEstimatedUclaw).toBeDefined();
    expect(parsed.balance).toBeDefined();
  });

  it("renders table output by default", async () => {
    mockFetchAll();

    await runEarnings({});

    const output = logs.join("\n");
    expect(output).toContain("Earnings Summary");
    expect(output).toContain("Agent Mining");
    expect(output).toContain("Task Income");
    expect(output).toContain("Staking Rewards");
    expect(output).toContain("Skill Sales");
    expect(output).toContain("Total Estimated");
    expect(output).toContain("Current Balance");
  });
});

// ---------------------------------------------------------------------------
// shouldAcceptTask (profitability filter)
// ---------------------------------------------------------------------------

describe("shouldAcceptTask", () => {
  it("accepts task that meets all criteria", () => {
    const result = shouldAcceptTask(
      { budget: "5000000", description: "inference job" },
      {
        minTaskBudgetUclaw: "1000000",
        maxConcurrentTasks: 3,
        capabilityFilter: [],
        autoAccept: true,
        rejectBelowReputation: 0,
      },
    );
    expect(result.accept).toBe(true);
    expect(result.reason).toContain("meets all profitability criteria");
  });

  it("rejects task below minimum budget", () => {
    const result = shouldAcceptTask(
      { budget: "500000", description: "cheap task" },
      {
        minTaskBudgetUclaw: "1000000",
        maxConcurrentTasks: 3,
        capabilityFilter: [],
        autoAccept: true,
        rejectBelowReputation: 0,
      },
    );
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("below minimum");
  });

  it("rejects task when auto-accept is disabled", () => {
    const result = shouldAcceptTask(
      { budget: "5000000", description: "any task" },
      {
        minTaskBudgetUclaw: "0",
        maxConcurrentTasks: 3,
        capabilityFilter: [],
        autoAccept: false,
        rejectBelowReputation: 0,
      },
    );
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("auto-accept is disabled");
  });

  it("rejects task not matching capability filter", () => {
    const result = shouldAcceptTask(
      { budget: "5000000", description: "image generation" },
      {
        minTaskBudgetUclaw: "0",
        maxConcurrentTasks: 3,
        capabilityFilter: ["inference", "translation"],
        autoAccept: true,
        rejectBelowReputation: 0,
      },
    );
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("does not match capability filter");
  });

  it("accepts task matching capability filter via requirements", () => {
    const result = shouldAcceptTask(
      {
        budget: "5000000",
        description: "some task",
        requirements: "needs inference engine",
      },
      {
        minTaskBudgetUclaw: "0",
        maxConcurrentTasks: 3,
        capabilityFilter: ["inference"],
        autoAccept: true,
        rejectBelowReputation: 0,
      },
    );
    expect(result.accept).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadProfitabilityConfig (defaults)
// ---------------------------------------------------------------------------

describe("loadProfitabilityConfig", () => {
  it("returns defaults when no config file exists", () => {
    const config = loadProfitabilityConfig();
    expect(config.minTaskBudgetUclaw).toBe("0");
    expect(config.maxConcurrentTasks).toBe(3);
    expect(config.capabilityFilter).toEqual([]);
    expect(config.autoAccept).toBe(true);
    expect(config.rejectBelowReputation).toBe(0);
  });
});
