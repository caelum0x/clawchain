import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryGatewayRuntimeStatusMock = vi.hoisted(() =>
  vi.fn<() => Promise<any | null>>(async () => null),
);
const queryGatewayMethodMock = vi.hoisted(() =>
  vi.fn<(method: string, params?: unknown, timeoutMs?: number) => Promise<any | null>>(async () => null),
);

vi.mock("./config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    agentAddress: "claw1agent123",
    messagingEndpoint: "http://localhost:7777",
  })),
}));

vi.mock("./manifest-security.js", () => ({
  shouldRequireSignedManifest: vi.fn(() => false),
}));

vi.mock("./openclaw-gateway.js", () => ({
  queryGatewayRuntimeStatus: queryGatewayRuntimeStatusMock,
  queryGatewayMethod: queryGatewayMethodMock,
}));

import { evaluateIntegratedReadiness } from "./readiness.js";

describe("evaluateIntegratedReadiness", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    queryGatewayRuntimeStatusMock.mockReset();
    queryGatewayMethodMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("prefers gateway runtime and chain agent contracts when available", async () => {
    queryGatewayRuntimeStatusMock.mockResolvedValue({
      messaging: {
        enabled: true,
        endpoint: "http://localhost:7777",
        reachable: true,
      },
      peers: {
        rpcReachable: true,
        connectedPeers: 4,
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
    });
    queryGatewayMethodMock.mockImplementation(async (method: string) => {
      if (method === "chain.agents.info") {
        return {
          agent: {
            address: "claw1agent123",
            name: "provider-1",
            registered: true,
            lastHeartbeat: "2026-03-08T10:00:00Z",
          },
        };
      }
      return null;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { network: "clawchain-1" },
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
      return Promise.reject(new Error(`unexpected fetch: ${urlStr}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const report = await evaluateIntegratedReadiness();

    expect(report.ready).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.checks.find((check) => check.name === "OpenClaw gateway")?.detail).toContain(
      "runtime.status available",
    );
    expect(
      report.checks.find((check) => check.name === "On-chain agent identity")?.detail,
    ).toContain("chain.agents.info");
    expect(
      report.checks.find((check) => check.name === "Agent heartbeat/liveness")?.detail,
    ).toContain("chain.agents.info");
    expect(report.checks.find((check) => check.name === "Peer connectivity")?.detail).toContain(
      "runtime.status",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to direct probes when gateway contracts are unavailable", async () => {
    queryGatewayRuntimeStatusMock.mockResolvedValue(null);
    queryGatewayMethodMock.mockResolvedValue(null);

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.endsWith("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                node_info: { network: "clawchain-1" },
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
      if (urlStr.endsWith(":18789/health")) {
        return Promise.resolve({ ok: true });
      }
      if (urlStr.includes("/agent/v1/agent/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ registered: true }),
        });
      }
      if (urlStr.includes("/agent/v1/liveness/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              found: true,
              liveness: { heartbeatCount: 3 },
            }),
        });
      }
      if (urlStr.endsWith("/agent/health")) {
        return Promise.resolve({ ok: true });
      }
      if (urlStr.endsWith("/net_info")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: { n_peers: "2" } }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${urlStr}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const report = await evaluateIntegratedReadiness();

    expect(report.ready).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.checks.find((check) => check.name === "OpenClaw gateway")?.detail).toContain(
      "reachable at http://localhost:18789",
    );
    expect(
      report.checks.find((check) => check.name === "On-chain agent identity")?.detail,
    ).toBe("registered=true");
    expect(
      report.checks.find((check) => check.name === "Agent heartbeat/liveness")?.detail,
    ).toBe("heartbeatCount=3");
    expect(fetchMock).toHaveBeenCalled();
  });
});
