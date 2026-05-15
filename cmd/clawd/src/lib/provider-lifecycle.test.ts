import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryGatewayRuntimeStatusMock = vi.hoisted(() =>
  vi.fn<() => Promise<any | null>>(async () => null),
);
const queryGatewayMethodMock = vi.hoisted(() =>
  vi.fn<(method: string, params?: unknown, timeoutMs?: number) => Promise<any | null>>(async () => null),
);
const loadActiveTasksMock = vi.hoisted(() => vi.fn<() => any[]>(() => []));
const createRestTaskFetcherMock = vi.hoisted(() =>
  vi.fn<(restUrl: string) => (taskId: number) => Promise<any | null>>(() => vi.fn(async () => null)),
);
const determineRecoveryActionMock = vi.hoisted(() =>
  vi.fn<(task: unknown, onChainTask: unknown) => any>(
    (_task, _onChainTask) => ({ action: "resume", taskId: 1, onChainStatus: "accepted" }),
  ),
);

vi.mock("./config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    agentAddress: "claw1agent123",
  })),
}));

vi.mock("./openclaw-gateway.js", () => ({
  queryGatewayRuntimeStatus: queryGatewayRuntimeStatusMock,
  queryGatewayMethod: queryGatewayMethodMock,
}));

vi.mock("./task-recovery.js", () => ({
  loadActiveTasks: loadActiveTasksMock,
  createRestTaskFetcher: createRestTaskFetcherMock,
  determineRecoveryAction: determineRecoveryActionMock,
}));

import { evaluateProviderLifecycle } from "./provider-lifecycle.js";

describe("evaluateProviderLifecycle", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    queryGatewayRuntimeStatusMock.mockReset();
    queryGatewayMethodMock.mockReset();
    loadActiveTasksMock.mockReset();
    createRestTaskFetcherMock.mockReset();
    determineRecoveryActionMock.mockReset();
    loadActiveTasksMock.mockReturnValue([]);
    determineRecoveryActionMock.mockImplementation((_task, _onChainTask) => ({
      action: "resume",
      taskId: 1,
      onChainStatus: "accepted",
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("builds the lifecycle report from gateway registration, heartbeat, recovery, and rewards", async () => {
    queryGatewayRuntimeStatusMock.mockResolvedValue({
      readiness: {
        checks: {
          agentRegistered: true,
          agentLive: true,
        },
      },
    });
    queryGatewayMethodMock.mockImplementation(async (method: string) => {
      if (method === "chain.agents.info") {
        return {
          agent: {
            registered: true,
            name: "provider-1",
            lastHeartbeat: "2026-03-08T12:00:00Z",
          },
        };
      }
      if (method === "chain.wallet.staking.rewards") {
        return {
          total: [{ denom: "uclaw", amount: "25" }],
        };
      }
      return null;
    });
    loadActiveTasksMock.mockReturnValue([
      { taskId: 1, status: "accepted", assigneeAddress: "claw1agent123", trackedAt: "2026-03-08T11:00:00Z" },
    ]);
    createRestTaskFetcherMock.mockReturnValue(vi.fn(async () => ({
      taskId: 1,
      status: "accepted",
      assigneeAddress: "claw1agent123",
    })));
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/clawchain/agent/v1/rewards/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ cumulative_rewards: "1000" }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${String(url)}`));
    }) as unknown as typeof fetch;

    const report = await evaluateProviderLifecycle();

    expect(report.ready).toBe(true);
    expect(report.registration.detail).toContain("chain.agents.info");
    expect(report.heartbeat.detail).toContain("chain.agents.info");
    expect(report.recovery.trackedTaskCount).toBe(1);
    expect(report.rewards.detail).toContain("agent=1000");
    expect(report.rewards.detail).toContain("staking=25uclaw");
  });

  it("reports blockers when the provider contract is not healthy", async () => {
    queryGatewayRuntimeStatusMock.mockResolvedValue(null);
    queryGatewayMethodMock.mockResolvedValue(null);
    loadActiveTasksMock.mockReturnValue([]);
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/agent/v1/agent/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (urlStr.includes("/agent/v1/liveness/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (urlStr.includes("/agent/v1/rewards/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.reject(new Error(`unexpected fetch ${urlStr}`));
    }) as unknown as typeof fetch;

    const report = await evaluateProviderLifecycle();

    expect(report.ready).toBe(false);
    expect(report.blockers.some((blocker) => blocker.startsWith("registration:"))).toBe(true);
    expect(report.blockers.some((blocker) => blocker.startsWith("heartbeat:"))).toBe(true);
    expect(report.blockers.some((blocker) => blocker.startsWith("rewards:"))).toBe(true);
  });
});
