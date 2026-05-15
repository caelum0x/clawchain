/**
 * Tests for `clawd status` command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config before importing the module under test
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "/home/test/.clawchain",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
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

import { runStatus } from "../status.js";
import { loadClawdConfig } from "../../lib/config.js";

const mockedConfig = vi.mocked(loadClawdConfig);

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
// Successful node status
// ---------------------------------------------------------------------------

describe("runStatus", () => {
  it("displays node info when chain is reachable", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { moniker: "test-node", network: "clawchain-1" },
                sync_info: {
                  latest_block_height: "12345",
                  latest_block_time: "2026-03-07T00:00:00Z",
                  catching_up: false,
                },
              },
            }),
        });
      }
      if (urlStr.includes("/net_info")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                n_peers: "3",
                peers: [
                  { node_info: { id: "abcdef1234567890", moniker: "peer-1" }, remote_ip: "10.0.0.1" },
                  { node_info: { id: "1234567890abcdef", moniker: "peer-2" }, remote_ip: "10.0.0.2" },
                ],
              },
            }),
        });
      }
      if (urlStr.includes("/health")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("Status:  UP");
    expect(output).toContain("Moniker: test-node");
    expect(output).toContain("Network: clawchain-1");
    expect(output).toContain("Height:  12345");
    expect(output).toContain("Syncing: false");
    expect(output).toContain("Connected peers: 3");
    expect(output).toContain("peer-1");
    expect(output).toContain("Chain ID:   clawchain-1");
  });

  it("shows DOWN when node is unreachable", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("Connection refused"));
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("Status:  DOWN");
    expect(output).toContain("Connection refused");
  });

  it("shows DOWN with HTTP status on non-ok response", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/status")) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      if (urlStr.includes("/net_info")) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      return Promise.reject(new Error("not reachable"));
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("DOWN (HTTP 503)");
  });

  it("displays config summary section", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("not reachable"));
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("Config:");
    expect(output).toContain("Chain ID:   clawchain-1");
    expect(output).toContain("Auto-start: true");
    expect(output).toContain("Incident:   inactive");
  });

  it("shows incident mode when active", async () => {
    mockedConfig.mockReturnValue({
      chainId: "clawchain-1",
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      nodeAutoStart: true,
      nodeHome: "",
      denom: "uclaw",
      prefix: "claw",
      gasPrice: "0.025uclaw",
      incidentMode: { active: true, reason: "network-partition" },
    });

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("not reachable"));
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("Incident:   ACTIVE (network-partition)");
  });

  it("displays agent address if configured", async () => {
    mockedConfig.mockReturnValue({
      chainId: "clawchain-1",
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      nodeAutoStart: true,
      nodeHome: "",
      denom: "uclaw",
      prefix: "claw",
      gasPrice: "0.025uclaw",
      agentAddress: "claw1myagent",
    });

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("not reachable"));
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("Agent:      claw1myagent");
  });

  it("prefers gateway runtime.status when available", async () => {
    queryGatewayRuntimeStatusMock.mockResolvedValue({
      chain: { alive: true, latestBlockHeight: 12345 },
      agent: { connected: true, address: "claw1runtime" },
      peers: { connectedPeers: 4 },
      messaging: { endpoint: "http://localhost:7777", reachable: true },
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
                node_info: { moniker: "test-node", network: "clawchain-1" },
                sync_info: {
                  latest_block_height: "12345",
                  latest_block_time: "2026-03-07T00:00:00Z",
                  catching_up: false,
                },
              },
            }),
        });
      }
      if (urlStr.includes("/net_info")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: { n_peers: "4", peers: [] } }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("Gateway:");
    expect(output).toContain("Ready:   true");
    expect(output).toContain("Agent:   claw1runtime");
    expect(output).toContain("Peers:   4");
    expect(output).toContain("Msg URL: http://localhost:7777");
  });

  it("displays provider lifecycle summary", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("not reachable"));
    }) as unknown as typeof fetch;

    await runStatus();

    const output = logs.join("\n");
    expect(output).toContain("Provider Lifecycle:");
    expect(output).toContain("Registration: true (registered via gateway)");
    expect(output).toContain("Heartbeat:    true (live via gateway)");
    expect(output).toContain("Rewards:      true (agent=0 staking=none)");
  });
});
