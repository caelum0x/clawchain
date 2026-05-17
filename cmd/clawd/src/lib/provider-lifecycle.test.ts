import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryGatewayRuntimeStatusMock = vi.hoisted(() =>
  vi.fn<() => Promise<any | null>>(async () => null),
);
const queryGatewayMethodMock = vi.hoisted(() =>
  vi.fn<(method: string, params?: unknown, timeoutMs?: number) => Promise<any | null>>(async () => null),
);
const queryGatewayProviderStatusMock = vi.hoisted(() =>
  vi.fn<() => Promise<any | null>>(async () => null),
);
const queryGatewayProviderDashboardMock = vi.hoisted(() =>
  vi.fn<() => Promise<any | null>>(async () => null),
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
  queryGatewayProviderStatus: queryGatewayProviderStatusMock,
  queryGatewayProviderDashboard: queryGatewayProviderDashboardMock,
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
    queryGatewayProviderStatusMock.mockReset();
    queryGatewayProviderDashboardMock.mockReset();
    queryGatewayRuntimeStatusMock.mockResolvedValue(null);
    queryGatewayMethodMock.mockResolvedValue(null);
    queryGatewayProviderStatusMock.mockResolvedValue(null);
    queryGatewayProviderDashboardMock.mockResolvedValue(null);
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
    queryGatewayProviderStatusMock.mockResolvedValue({
      ready: true,
      currentPhase: "earn",
      phases: {
        install: { phase: "install", ok: true, detail: "installed" },
        run: { phase: "run", ok: true, detail: "Agent registered at claw1agent123, heartbeat active" },
        earn: { phase: "earn", ok: true, detail: "ready to earn" },
      },
      address: "claw1agent123",
      blockHeight: 55,
      connectedPeers: 4,
    });
    queryGatewayProviderDashboardMock.mockResolvedValue({
      connected: true,
      address: "claw1agent123",
      blockHeight: 55,
      rewards: { total: "1000", pending: "25" },
      heartbeat: { enabled: true, inFlight: false },
    });
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
    expect(report.gateway.currentPhase).toBe("earn");
    expect(report.registration.detail).toContain("provider.status");
    expect(report.registration.evidence?.[0]).toContain("heartbeat active");
    expect(report.heartbeat.detail).toContain("provider.status");
    expect(report.recovery.trackedTaskCount).toBe(1);
    expect(report.rewards.detail).toContain("providerRewards=1000");
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
