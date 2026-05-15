/**
 * Tests for `clawd doctor` — operator diagnostics.
 *
 * Tests runDoctor by mocking fetch and readiness functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "/test/.clawchain",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
    agentAddress: "claw1agent123456789012345678",
    faucetUrl: undefined,
    messagingEndpoint: undefined,
  })),
}));

const queryGatewayRuntimeStatusMock = vi.hoisted(() =>
  vi.fn<() => Promise<any | null>>(async () => null),
);
const evaluateProviderLifecycleMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ready: true,
    blockers: [],
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
  })),
);

vi.mock("../../lib/openclaw-gateway.js", () => ({
  queryGatewayRuntimeStatus: queryGatewayRuntimeStatusMock,
}));

vi.mock("../../lib/provider-lifecycle.js", () => ({
  evaluateProviderLifecycle: evaluateProviderLifecycleMock,
}));

// Mock paths
vi.mock("../../lib/paths.js", () => ({
  CLAWCHAIN_HOME: "/test/.clawchain",
  CLAWD_HOME: "/test/.clawd",
}));

// Mock readiness — use plain functions (not vi.fn()) so restoreAllMocks does not clear them
vi.mock("../../lib/readiness.js", () => {
  const lifecycleResult = {
    completed: true,
    currentStage: "messaging",
    blocker: null,
    readiness: {
      chainId: "clawchain-1",
      agentAddress: "claw1agent123456789012345678",
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      messagingEndpoint: null,
      checks: [],
      blockers: [],
      ready: true,
    },
    stages: [
      { stage: "identity_init", ok: true, detail: "ok" },
      { stage: "chain_connect", ok: true, detail: "ok" },
      { stage: "register", ok: true, detail: "ok" },
      { stage: "heartbeat", ok: true, detail: "ok" },
      { stage: "messaging", ok: true, detail: "ok" },
    ],
  };

  return {
    evaluateIntegratedReadiness: () =>
      Promise.resolve({ ready: true, blockers: [] }),
    evaluateStartupLifecycle: () =>
      Promise.resolve(lifecycleResult),
  };
});

// Mock fs for genesis check — use plain functions so restoreAllMocks does not clear them
vi.mock("node:fs", () => ({
  existsSync: () => false,
}));

vi.mock("node:fs/promises", () => ({
  readFile: () => Promise.reject(new Error("not found")),
}));

import { runDoctor } from "../doctor.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  queryGatewayRuntimeStatusMock.mockReset();
  queryGatewayRuntimeStatusMock.mockResolvedValue(null);
  evaluateProviderLifecycleMock.mockReset();
  evaluateProviderLifecycleMock.mockResolvedValue({
    ready: true,
    blockers: [],
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
  });
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
// runDoctor()
// ---------------------------------------------------------------------------

describe("runDoctor", () => {
  it("displays doctor header with chain info", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { network: "clawchain-1" },
                sync_info: { latest_block_height: "100", catching_up: false },
              },
            }),
        });
      }
      if (urlStr.includes("/syncing")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ syncing: false }),
        });
      }
      if (urlStr.includes("/net_info")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: { n_peers: "3" } }),
        });
      }
      if (urlStr.includes("/health")) {
        return Promise.resolve({ ok: true });
      }
      if (urlStr.includes("/agent/v1/agent/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              registered: true,
              supportedTools: ["compute", "search"],
              pricingHint: "0.01uclaw",
              version: "1.0.0",
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor();

    const output = logs.join("\n");
    expect(output).toContain("clawd doctor");
    expect(output).toContain("Chain ID: clawchain-1");
    expect(output).toContain("RPC URL:  http://localhost:26657");
    expect(output).toContain("REST URL: http://localhost:1317");
  });

  it("shows Chain RPC check result", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { network: "clawchain-1" },
                sync_info: { latest_block_height: "500", catching_up: false },
              },
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor();

    const output = logs.join("\n");
    expect(output).toContain("Chain RPC");
    expect(output).toContain("height=500");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { network: "clawchain-1" },
                sync_info: { latest_block_height: "100" },
              },
            }),
        });
      }
      if (urlStr.includes("/syncing")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ syncing: false }),
        });
      }
      if (urlStr.includes("/net_info")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: { n_peers: "2" } }),
        });
      }
      if (urlStr.includes("/agent/v1/agent/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              registered: true,
              supportedTools: ["search"],
              pricingHint: "0.01uclaw",
              version: "1.0.0",
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.chainId).toBe("clawchain-1");
    expect(parsed.rpcUrl).toBe("http://localhost:26657");
    expect(parsed.restUrl).toBe("http://localhost:1317");
    expect(parsed.checks).toBeDefined();
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.lifecycle).toBeDefined();
    expect(parsed.providerLifecycle).toBeDefined();
  });

  it("reports FAIL for unreachable RPC", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.reject(new Error("Connection refused"));
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor();

    const output = logs.join("\n");
    expect(output).toContain("FAIL");
    expect(output).toContain("Chain RPC");
  });

  it("shows Startup lifecycle section", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor();

    const output = logs.join("\n");
    expect(output).toContain("Startup lifecycle");
  });

  it("reports chain_id mismatch when expected differs from actual", async () => {
    const { loadClawdConfig } = await import("../../lib/config.js");
    (loadClawdConfig as any).mockReturnValueOnce({
      chainId: "clawchain-2",
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      nodeHome: "/test/.clawchain",
      agentAddress: "claw1agent123456789012345678",
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { network: "clawchain-1" },
                sync_info: { latest_block_height: "100" },
              },
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor();

    const output = logs.join("\n");
    expect(output).toContain("FAIL");
    expect(output).toContain("Chain RPC");
    expect(output).toContain("mismatch");
  });

  it("includes lifecycle stages in JSON output", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.lifecycle).toBeDefined();
    expect(parsed.lifecycle.stages).toBeDefined();
    expect(Array.isArray(parsed.lifecycle.stages)).toBe(true);
    expect(parsed.lifecycle.stages.length).toBeGreaterThan(0);
  });

  it("uses gateway runtime.status when available", async () => {
    queryGatewayRuntimeStatusMock.mockResolvedValue({
      agent: { connected: true },
      peers: { connectedPeers: 3 },
      readiness: { ready: true, blockers: [] },
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { network: "clawchain-1" },
                sync_info: { latest_block_height: "100", catching_up: false },
              },
            }),
        });
      }
      if (urlStr.includes("/syncing")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ syncing: false }),
        });
      }
      if (urlStr.includes("/net_info")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: { n_peers: "3" } }),
        });
      }
      if (urlStr.includes("/agent/v1/agent/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              registered: true,
              supportedTools: ["compute", "search"],
              pricingHint: "0.01uclaw",
              version: "1.0.0",
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor();

    const output = logs.join("\n");
    expect(output).toContain("Gateway: ready=true agentConnected=true peers=3");
  });

  it("shows Provider lifecycle section", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runDoctor();

    const output = logs.join("\n");
    expect(output).toContain("Provider lifecycle");
    expect(output).toContain("registration: registered via gateway");
    expect(output).toContain("heartbeat: live via gateway");
    expect(output).toContain("rewards: agent=0 staking=none");
  });
});
