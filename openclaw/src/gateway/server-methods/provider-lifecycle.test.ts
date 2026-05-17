import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the clawchain extension
const mockGetBlockchainRuntimeStatus = vi.fn();
const mockGetBlockchainAddress = vi.fn();
const mockGetBlockchainAgent = vi.fn();

vi.mock("../../../extensions/clawchain/index.js", () => ({
  getBlockchainRuntimeStatus: (...args: unknown[]) => mockGetBlockchainRuntimeStatus(...args),
  getBlockchainAddress: (...args: unknown[]) => mockGetBlockchainAddress(...args),
  getBlockchainAgent: (...args: unknown[]) => mockGetBlockchainAgent(...args),
}));

import { providerLifecycleHandlers } from "./provider-lifecycle.js";

function createMockRespond() {
  return vi.fn();
}

function createHandlerOpts(method: string, params: Record<string, unknown> = {}) {
  const respond = createMockRespond();
  return {
    opts: {
      req: { method, id: "test-1", params },
      params,
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    },
    respond,
  };
}

function createFullRuntime(overrides: Record<string, unknown> = {}) {
  return {
    chain: {
      alive: true,
      rpcUrl: "http://localhost:26657",
      latestBlockHeight: 5000,
      ...(overrides.chain as Record<string, unknown> ?? {}),
    },
    agent: {
      connected: true,
      address: "claw1abc123",
      ...(overrides.agent as Record<string, unknown> ?? {}),
    },
    readiness: {
      ready: true,
      blockers: [],
      checks: {
        agentRegistered: true,
        agentLive: true,
        ...(overrides.checks as Record<string, unknown> ?? {}),
      },
      ...(overrides.readiness as Record<string, unknown> ?? {}),
    },
    peers: {
      connectedPeers: 4,
      ...(overrides.peers as Record<string, unknown> ?? {}),
    },
  };
}

describe("provider.status handler", () => {
  const handler = providerLifecycleHandlers["provider.status"];

  beforeEach(() => {
    mockGetBlockchainRuntimeStatus.mockReset();
    mockGetBlockchainAddress.mockReset();
    mockGetBlockchainAgent.mockReset();
  });

  it("returns all phases ok when fully ready", async () => {
    const runtime = createFullRuntime();
    mockGetBlockchainRuntimeStatus.mockResolvedValue(runtime);
    mockGetBlockchainAddress.mockReturnValue("claw1abc123");

    const { opts, respond } = createHandlerOpts("provider.status");
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({
      ready: true,
      currentPhase: "earn",
      address: "claw1abc123",
      blockHeight: 5000,
      connectedPeers: 4,
    }));
    const payload = respond.mock.calls[0][1];
    expect(payload.phases.install.ok).toBe(true);
    expect(payload.phases.run.ok).toBe(true);
    expect(payload.phases.earn.ok).toBe(true);
  });

  it("returns install phase when runtime unavailable", async () => {
    mockGetBlockchainRuntimeStatus.mockRejectedValue(new Error("not initialized"));
    mockGetBlockchainAddress.mockReturnValue(null);

    const { opts, respond } = createHandlerOpts("provider.status");
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({
      ready: false,
      currentPhase: "install",
    }));
    const payload = respond.mock.calls[0][1];
    expect(payload.phases.install.ok).toBe(false);
    expect(payload.phases.install.detail).toContain("not initialized");
  });

  it("returns install phase when chain not alive", async () => {
    const runtime = createFullRuntime({ chain: { alive: false, rpcUrl: "http://dead:26657" } });
    mockGetBlockchainRuntimeStatus.mockResolvedValue(runtime);
    mockGetBlockchainAddress.mockReturnValue(null);

    const { opts, respond } = createHandlerOpts("provider.status");
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.phases.install.ok).toBe(false);
    expect(payload.phases.install.detail).toContain("unreachable");
    expect(payload.phases.install.action).toContain("clawchaind");
  });

  it("returns install phase when agent not connected", async () => {
    const runtime = createFullRuntime({ agent: { connected: false } });
    mockGetBlockchainRuntimeStatus.mockResolvedValue(runtime);
    mockGetBlockchainAddress.mockReturnValue(null);

    const { opts, respond } = createHandlerOpts("provider.status");
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.phases.install.ok).toBe(false);
    expect(payload.phases.install.detail).toContain("keypair not configured");
  });

  it("returns run phase when agent not registered", async () => {
    const runtime = createFullRuntime({
      checks: { agentRegistered: false, agentLive: false },
    });
    mockGetBlockchainRuntimeStatus.mockResolvedValue(runtime);
    mockGetBlockchainAddress.mockReturnValue("claw1abc");

    const { opts, respond } = createHandlerOpts("provider.status");
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.currentPhase).toBe("run");
    expect(payload.phases.install.ok).toBe(true);
    expect(payload.phases.run.ok).toBe(false);
    expect(payload.phases.run.detail).toContain("not registered");
  });

  it("returns run phase when agent registered but no heartbeat", async () => {
    const runtime = createFullRuntime({
      checks: { agentRegistered: true, agentLive: false },
    });
    mockGetBlockchainRuntimeStatus.mockResolvedValue(runtime);
    mockGetBlockchainAddress.mockReturnValue("claw1abc");

    const { opts, respond } = createHandlerOpts("provider.status");
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.phases.run.ok).toBe(false);
    expect(payload.phases.run.detail).toContain("heartbeat");
    expect(payload.phases.run.action).toContain("heartbeat");
  });

  it("returns earn phase with blockers when not ready", async () => {
    const runtime = createFullRuntime({
      readiness: {
        ready: false,
        blockers: ["low stake", "no skills listed"],
        checks: { agentRegistered: true, agentLive: true },
      },
    });
    mockGetBlockchainRuntimeStatus.mockResolvedValue(runtime);
    mockGetBlockchainAddress.mockReturnValue("claw1abc");

    const { opts, respond } = createHandlerOpts("provider.status");
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.ready).toBe(false);
    expect(payload.currentPhase).toBe("earn");
    expect(payload.phases.earn.ok).toBe(false);
    expect(payload.phases.earn.detail).toContain("low stake");
    expect(payload.phases.earn.detail).toContain("no skills listed");
  });
});

describe("provider.help handler", () => {
  const handler = providerLifecycleHandlers["provider.help"];

  it("returns full help when no phase specified", async () => {
    const { opts, respond } = createHandlerOpts("provider.help");
    await handler(opts);

    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({
      overview: expect.stringContaining("ClawChain"),
      phases: expect.arrayContaining([
        expect.objectContaining({ phase: "install" }),
        expect.objectContaining({ phase: "run" }),
        expect.objectContaining({ phase: "earn" }),
      ]),
      commands: expect.objectContaining({
        status: expect.any(String),
        dashboard: expect.any(String),
      }),
    }));
  });

  it("returns install phase help", async () => {
    const { opts, respond } = createHandlerOpts("provider.help", { phase: "install" });
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.phase.phase).toBe("install");
    expect(payload.phase.title).toBe("Install");
    expect(payload.phase.steps.length).toBeGreaterThan(0);
    expect(payload.commands).toBeDefined();
  });

  it("returns run phase help", async () => {
    const { opts, respond } = createHandlerOpts("provider.help", { phase: "run" });
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.phase.phase).toBe("run");
    expect(payload.phase.title).toBe("Run");
  });

  it("returns earn phase help", async () => {
    const { opts, respond } = createHandlerOpts("provider.help", { phase: "earn" });
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.phase.phase).toBe("earn");
    expect(payload.phase.title).toBe("Earn");
    expect(payload.phase.steps.some((s: string) => s.includes("autonomous"))).toBe(true);
  });

  it("returns full help for unknown phase", async () => {
    const { opts, respond } = createHandlerOpts("provider.help", { phase: "unknown" });
    await handler(opts);

    const payload = respond.mock.calls[0][1];
    expect(payload.overview).toBeDefined();
    expect(payload.phases).toHaveLength(3);
  });
});
