import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetBlockchainAgent = vi.fn();
const mockGetBlockchainAddress = vi.fn();
const mockGetBlockchainRuntimeStatus = vi.fn();
const mockGetBlockchainShieldedBalance = vi.fn();

vi.mock("../../../extensions/clawchain/index.js", () => ({
  getBlockchainAgent: (...args: unknown[]) => mockGetBlockchainAgent(...args),
  getBlockchainAddress: (...args: unknown[]) => mockGetBlockchainAddress(...args),
  getBlockchainRuntimeStatus: (...args: unknown[]) => mockGetBlockchainRuntimeStatus(...args),
  getBlockchainShieldedBalance: (...args: unknown[]) => mockGetBlockchainShieldedBalance(...args),
}));

import { providerDashboardHandlers } from "./provider-dashboard.js";

function createHandlerOpts() {
  const respond = vi.fn();
  return {
    opts: {
      req: { method: "provider.dashboard", id: "test-1", params: {} },
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    },
    respond,
  };
}

function createFullRuntime() {
  return {
    chain: {
      rpcUrl: "http://localhost:26657",
      alive: true,
      latestBlockHeight: 12000,
      catchingUp: false,
      error: null,
    },
    node: { managed: true, external: false, running: true },
    agent: {
      connected: true,
      address: "claw1abc123",
      heartbeatEnabled: true,
      heartbeatInFlight: false,
    },
    messaging: { enabled: true, endpoint: "http://agent:7777", reachable: true, error: null },
    faucet: { enabled: true, url: "http://localhost:4500", available: true, error: null },
    peers: { rpcReachable: true, connectedPeers: 8, sampleNodeIds: ["a", "b"], error: null },
    contracts: {
      msgAgentHeartbeatTypeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
      restAgentLivenessPath: "/clawchain/agent/v1/liveness",
      restLiveAgentsPath: "/clawchain/agent/v1/live_agents",
    },
    readiness: {
      ready: true,
      checks: {
        chainReachable: true,
        agentConnected: true,
        agentRegistered: true,
        agentLive: true,
        messagingConfigured: true,
        messagingReachable: true,
        peersHealthy: true,
      },
      blockers: [],
    },
  };
}

describe("provider.dashboard handler", () => {
  const handler = providerDashboardHandlers["provider.dashboard"];

  beforeEach(() => {
    mockGetBlockchainAgent.mockReset();
    mockGetBlockchainAddress.mockReset();
    mockGetBlockchainRuntimeStatus.mockReset();
    mockGetBlockchainShieldedBalance.mockReset();
  });

  it("returns disconnected state when agent not available", async () => {
    mockGetBlockchainAgent.mockReturnValue(null);
    mockGetBlockchainAddress.mockReturnValue(null);
    mockGetBlockchainShieldedBalance.mockReturnValue(null);

    const { opts, respond } = createHandlerOpts();
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        connected: false,
        address: null,
        balance: null,
        rewards: null,
        stats: null,
      }),
    );
  });

  it("returns full dashboard when all data available", async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue({ amount: "5000000" }),
      getLatestBlockHeight: vi.fn().mockResolvedValue(12000),
      queryAgentRewards: vi.fn().mockResolvedValue({
        totalRewards: "1200000",
        pendingRewards: "50000",
      }),
      queryAgentStats: vi.fn().mockResolvedValue({
        tasksCompleted: 42,
        tasksFailed: 3,
        tasksAccepted: 50,
        reputationScore: 95,
      }),
      queryLiveAgents: vi.fn().mockResolvedValue({
        agents: [{ address: "a" }, { address: "b" }, { address: "c" }],
      }),
    };
    mockGetBlockchainAgent.mockReturnValue({ client });
    mockGetBlockchainAddress.mockReturnValue("claw1provider");
    mockGetBlockchainShieldedBalance.mockReturnValue("100000");
    mockGetBlockchainRuntimeStatus.mockResolvedValue(createFullRuntime());

    const { opts, respond } = createHandlerOpts();
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.connected).toBe(true);
    expect(payload.address).toBe("claw1provider");
    expect(payload.balance).toBe("5000000");
    expect(payload.shieldedBalance).toBe("100000");
    expect(payload.blockHeight).toBe(12000);
    expect(payload.rewards).toEqual({ total: "1200000", pending: "50000" });
    expect(payload.stats.tasksCompleted).toBe(42);
    expect(payload.stats.tasksFailed).toBe(3);
    expect(payload.stats.successRate).toBe(93); // 42/(42+3) = 93%
    expect(payload.stats.reputationScore).toBe(95);
    expect(payload.network.connectedPeers).toBe(8);
    expect(payload.network.liveAgents).toBe(3);
    expect(payload.network.chainAlive).toBe(true);
    expect(payload.readiness.ready).toBe(true);
    expect(payload.heartbeat.enabled).toBe(true);
    expect(payload.messaging.enabled).toBe(true);
    expect(payload.faucet.enabled).toBe(true);
  });

  it("handles partial data gracefully (no rewards/stats methods)", async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue({ amount: "1000" }),
      getLatestBlockHeight: vi.fn().mockResolvedValue(500),
      // No queryAgentRewards or queryAgentStats
    };
    mockGetBlockchainAgent.mockReturnValue({ client });
    mockGetBlockchainAddress.mockReturnValue("claw1partial");
    mockGetBlockchainShieldedBalance.mockReturnValue(null);
    mockGetBlockchainRuntimeStatus.mockResolvedValue(createFullRuntime());

    const { opts, respond } = createHandlerOpts();
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.connected).toBe(true);
    expect(payload.balance).toBe("1000");
    expect(payload.rewards).toBeNull();
    expect(payload.stats).toBeNull();
    expect(payload.network.liveAgents).toBeNull();
  });

  it("handles runtime status failure gracefully", async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue({ amount: "2000" }),
      getLatestBlockHeight: vi.fn().mockResolvedValue(100),
    };
    mockGetBlockchainAgent.mockReturnValue({ client });
    mockGetBlockchainAddress.mockReturnValue("claw1fail");
    mockGetBlockchainShieldedBalance.mockReturnValue(null);
    mockGetBlockchainRuntimeStatus.mockRejectedValue(new Error("connection refused"));

    const { opts, respond } = createHandlerOpts();
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.connected).toBe(true);
    expect(payload.blockHeight).toBeNull();
    expect(payload.network.chainAlive).toBe(false);
    expect(payload.readiness).toBeNull();
  });

  it("computes success rate correctly with zero tasks", async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue({ amount: "0" }),
      getLatestBlockHeight: vi.fn().mockResolvedValue(1),
      queryAgentStats: vi.fn().mockResolvedValue({
        tasksCompleted: 0,
        tasksFailed: 0,
        tasksAccepted: 0,
        reputationScore: 0,
      }),
    };
    mockGetBlockchainAgent.mockReturnValue({ client });
    mockGetBlockchainAddress.mockReturnValue("claw1new");
    mockGetBlockchainShieldedBalance.mockReturnValue(null);
    mockGetBlockchainRuntimeStatus.mockResolvedValue(createFullRuntime());

    const { opts, respond } = createHandlerOpts();
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.stats.successRate).toBeNull();
    expect(payload.stats.tasksCompleted).toBe(0);
  });

  it("handles balance fetch failure gracefully", async () => {
    const client = {
      getBalance: vi.fn().mockRejectedValue(new Error("timeout")),
      getLatestBlockHeight: vi.fn().mockResolvedValue(1000),
    };
    mockGetBlockchainAgent.mockReturnValue({ client });
    mockGetBlockchainAddress.mockReturnValue("claw1timeout");
    mockGetBlockchainShieldedBalance.mockReturnValue("5000");
    mockGetBlockchainRuntimeStatus.mockResolvedValue(createFullRuntime());

    const { opts, respond } = createHandlerOpts();
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.connected).toBe(true);
    expect(payload.balance).toBeNull();
    expect(payload.shieldedBalance).toBe("5000");
  });
});
