/**
 * Tests for `clawd dashboard` — rich terminal status overview.
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
  })),
}));

const queryGatewayRuntimeStatusMock = vi.hoisted(() =>
  vi.fn<() => Promise<any | null>>(async () => null),
);
const queryGatewayMethodMock = vi.hoisted(() =>
  vi.fn<(method: string, params?: unknown, timeoutMs?: number) => Promise<any | null>>(async () => null),
);

vi.mock("../../lib/openclaw-gateway.js", () => ({
  queryGatewayRuntimeStatus: queryGatewayRuntimeStatusMock,
  queryGatewayMethod: queryGatewayMethodMock,
}));

const evaluateProviderLifecycleMock = vi.hoisted(() =>
  vi.fn<() => Promise<any>>(async () => makeProviderLifecycle()),
);

vi.mock("../../lib/provider-lifecycle.js", () => ({
  evaluateProviderLifecycle: evaluateProviderLifecycleMock,
}));

import { runDashboard } from "../dashboard.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

function makeProviderLifecycle(overrides: Record<string, unknown> = {}): any {
  return {
    ready: true,
    blockers: [],
    gateway: {
      source: "gateway",
      currentPhase: "earn",
      ready: true,
      blockHeight: 123,
      connectedPeers: 4,
      evidence: ["provider.status available", "provider.dashboard available"],
    },
    registration: { ok: true, detail: "registered via gateway", source: "gateway" },
    heartbeat: { ok: true, detail: "live via gateway", source: "gateway" },
    recovery: {
      ok: true,
      detail: "no locally tracked tasks",
      source: "local",
      trackedTaskCount: 0,
      actions: [],
      resumableTaskIds: [],
      cleanupTaskIds: [],
    },
    rewards: {
      ok: true,
      detail: "agent=0 staking=none",
      source: "gateway",
      agentRewardsUclaw: "0",
      stakingRewards: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  logs = [];
  queryGatewayRuntimeStatusMock.mockReset();
  queryGatewayMethodMock.mockReset();
  evaluateProviderLifecycleMock.mockReset();
  queryGatewayRuntimeStatusMock.mockResolvedValue(null);
  queryGatewayMethodMock.mockResolvedValue(null);
  evaluateProviderLifecycleMock.mockResolvedValue(makeProviderLifecycle());
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

function mockAllEndpoints() {
  globalThis.fetch = vi.fn().mockImplementation((url: string) => {
    const urlStr = String(url);
    if (urlStr.includes("/status")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            result: {
              node_info: { moniker: "test-node", network: "clawchain-1", version: "0.38.0" },
              sync_info: {
                latest_block_height: "12345",
                latest_block_time: "2026-03-07T00:00:00Z",
                catching_up: false,
              },
            },
          }),
      });
    }
    if (urlStr.includes("/cosmos/bank/v1beta1/supply")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            supply: [{ denom: "uclaw", amount: "1000000000000" }],
          }),
      });
    }
    if (urlStr.includes("/cosmos/staking/v1beta1/pool")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            pool: { bonded_tokens: "500000000000", not_bonded_tokens: "100000000000" },
          }),
      });
    }
    if (urlStr.includes("/cosmos/mint/v1beta1/inflation")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ inflation: "0.13" }),
      });
    }
    if (urlStr.includes("/cosmos/distribution/v1beta1/community_pool")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            pool: [{ denom: "uclaw", amount: "50000000" }],
          }),
      });
    }
    if (urlStr.includes("/cosmos/staking/v1beta1/validators")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            validators: [
              {
                description: { moniker: "Validator A" },
                tokens: "300000000000",
                status: "BOND_STATUS_BONDED",
              },
              {
                description: { moniker: "Validator B" },
                tokens: "200000000000",
                status: "BOND_STATUS_BONDED",
              },
            ],
          }),
      });
    }
    if (urlStr.includes("/clawchain/agent/v1/live_agents")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ agents: [{}, {}], pagination: { total: "2" } }),
      });
    }
    if (urlStr.includes("/clawchain/agent/v1/recent_activity")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ activity: [{}], pagination: { total: "1" } }),
      });
    }
    if (urlStr.includes("/clawchain/privacy/v1/tree_stats")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ leaf_count: "42", depth: "10" }),
      });
    }
    if (urlStr.includes("/clawchain/marketplace/v1/skills")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ skills: [{}], pagination: { total: "5" } }),
      });
    }
    if (urlStr.includes("/clawchain/marketplace/v1/compute_resources")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ compute_resources: [{}], pagination: { total: "3" } }),
      });
    }
    if (urlStr.includes("/ibc/core/channel/v1/channels")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ channels: [{}], pagination: { total: "2" } }),
      });
    }
    if (urlStr.includes("/ibc/core/connection/v1/connections")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ connections: [{}], pagination: { total: "1" } }),
      });
    }
    return Promise.resolve({ ok: false, status: 404 });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// runDashboard()
// ---------------------------------------------------------------------------

describe("runDashboard", () => {
  it("displays chain status section", async () => {
    mockAllEndpoints();
    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("ClawChain Dashboard");
    expect(output).toContain("Chain Status");
    expect(output).toContain("clawchain-1");
    expect(output).toContain("12,345");
    expect(output).toContain("test-node");
  });

  it("displays network economics section", async () => {
    mockAllEndpoints();
    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Network Economics");
    expect(output).toContain("Supply");
    expect(output).toContain("Bonded");
    expect(output).toContain("13.00%");
  });

  it("displays validators section", async () => {
    mockAllEndpoints();
    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Validators");
    expect(output).toContain("Active: 2");
    expect(output).toContain("Validator A");
    expect(output).toContain("Validator B");
  });

  it("displays agent network section", async () => {
    queryGatewayMethodMock.mockImplementation(async (method: string) => {
      if (method === "chain.agents.list") {
        return { agents: [{}, {}], count: 2, total: 2 };
      }
      return null;
    });
    mockAllEndpoints();
    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Agent Network");
    expect(output).toContain("Active agents");
    expect(output).toContain("2");
  });

  it("uses runtime.status when RPC status is unavailable", async () => {
    queryGatewayRuntimeStatusMock.mockResolvedValue({
      chain: { alive: true, latestBlockHeight: 54321, catchingUp: false },
    });
    queryGatewayMethodMock.mockResolvedValue(null);
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.reject(new Error("rpc unavailable"));
      }
      if (urlStr.includes("/cosmos/bank/v1beta1/supply")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Chain Status");
    expect(output).toContain("54,321");
  });

  it("displays privacy pool section", async () => {
    mockAllEndpoints();
    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Privacy Pool");
    expect(output).toContain("Merkle leaves");
    expect(output).toContain("42");
  });

  it("displays local provider section", async () => {
    mockAllEndpoints();
    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Local Provider");
    expect(output).toContain("Source");
    expect(output).toContain("gateway");
    expect(output).toContain("Phase");
    expect(output).toContain("registered via gateway");
    expect(output).toContain("live via gateway");
    expect(output).toContain("agent=0 staking=none");
  });

  it("displays marketplace section", async () => {
    mockAllEndpoints();
    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Marketplace");
    expect(output).toContain("Skills");
    expect(output).toContain("5");
  });

  it("shows not reachable when node is down", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("Connection refused"));
    }) as unknown as typeof fetch;

    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("not reachable");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    mockAllEndpoints();
    await runDashboard({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.chain).toBeDefined();
    expect(parsed.chain.chainId).toBe("clawchain-1");
    expect(parsed.economics).toBeDefined();
    expect(parsed.validators).toBeDefined();
    expect(parsed.agents).toBeDefined();
    expect(parsed.provider).toBeDefined();
    expect(parsed.provider.source).toBe("gateway");
    expect(parsed.provider.currentPhase).toBe("earn");
    expect(parsed.provider.evidence).toContain("provider.status available");
    expect(parsed.provider.registration).toBe("registered via gateway");
    expect(parsed.provider.ready).toBe(true);
    expect(parsed.privacy).toBeDefined();
    expect(parsed.marketplace).toBeDefined();
    expect(parsed.ibc).toBeDefined();
  });

  it("includes provider blockers in pretty output", async () => {
    evaluateProviderLifecycleMock.mockResolvedValue(makeProviderLifecycle({
      ready: false,
      blockers: ["heartbeat: not live", "rewards: unavailable"],
      registration: { ok: true, detail: "registered via gateway", source: "gateway" },
      heartbeat: { ok: false, detail: "not live via runtime.status", source: "gateway" },
      recovery: {
        ok: true,
        detail: "tracked=1 resumable=1 cleanup=0",
        source: "local",
        trackedTaskCount: 1,
        actions: [],
        resumableTaskIds: [7],
        cleanupTaskIds: [],
      },
      rewards: {
        ok: false,
        detail: "wallet rewards unavailable",
        source: "unavailable",
        agentRewardsUclaw: null,
        stakingRewards: [],
      },
    }));
    mockAllEndpoints();

    await runDashboard({});

    const output = logs.join("\n");
    expect(output).toContain("Ready            : no");
    expect(output).toContain("Blockers         : heartbeat: not live");
    expect(output).toContain("rewards: un");
  });
});
