/**
 * Tests for `clawd agent` subcommands — info, tasks, rewards.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips register/heartbeat (they require signing client).
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
    agentAddress: "claw1agent123456789012345678",
  })),
}));

// Mock mnemonic (needed because module imports it)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

const queryGatewayMethodMock = vi.hoisted(() =>
  vi.fn<(method: string, params?: unknown, timeoutMs?: number) => Promise<any | null>>(async () => null),
);

vi.mock("../../lib/openclaw-gateway.js", () => ({
  queryGatewayMethod: queryGatewayMethodMock,
}));

import { runAgentInfo, runAgentTasks, runAgentRewards } from "../agent.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  queryGatewayMethodMock.mockReset();
  queryGatewayMethodMock.mockResolvedValue(null);
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
// runAgentInfo()
// ---------------------------------------------------------------------------

describe("runAgentInfo", () => {
  it("displays agent details from REST API", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/agent/v1/agent/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              registered: true,
              name: "my-agent",
              endpoint: "http://agent:7777",
              pubkey: "abcdef1234567890abcdef1234567890",
              version: "clawd/0.1.0",
              supportedTools: ["search", "compute"],
              pricingHint: "0.01uclaw/query",
              depositAmount: "5000000",
            }),
        });
      }
      if (urlStr.includes("/agent/v1/stats/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              stats: {
                totalActions: 42,
                intentsCreated: 10,
                intentsFinalized: 8,
              },
            }),
        });
      }
      if (urlStr.includes("/agent/v1/liveness/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              liveness: {
                lastHeartbeatHeight: 1000,
                heartbeatCount: 50,
                endpoint: "http://agent:7777",
              },
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runAgentInfo({ address: "claw1agent123456789012345678" });

    const output = logs.join("\n");
    expect(output).toContain("Agent Info");
    expect(output).toContain("Address:      claw1agent123456789012345678");
    expect(output).toContain("Registered:   true");
    expect(output).toContain("Name:         my-agent");
    expect(output).toContain("Endpoint:     http://agent:7777");
    expect(output).toContain("Version:      clawd/0.1.0");
    expect(output).toContain("Tools:        search, compute");
    expect(output).toContain("Deposit:      5 CLAW");
    expect(output).toContain("Total Actions:    42");
    expect(output).toContain("Intents Created:  10");
    expect(output).toContain("Last Heartbeat Height: 1000");
    expect(output).toContain("Heartbeat Count:       50");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/agent/v1/agent/")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ name: "test-agent" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runAgentInfo({ address: "claw1agent123456789012345678", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.agent).toBeDefined();
    expect(parsed.agent.name).toBe("test-agent");
  });
});

// ---------------------------------------------------------------------------
// runAgentTasks()
// ---------------------------------------------------------------------------

describe("runAgentTasks", () => {
  it("prefers gateway chain.agents.tasks when available", async () => {
    queryGatewayMethodMock.mockImplementation(async (method: string) => {
      if (method === "chain.agents.tasks") {
        return {
          tasks: [
            {
              id: "1",
              status: "accepted",
              delegator: "claw1delegator12345678901",
              assignee: "claw1agent123456789012345678",
              description: "Run inference on model X",
            },
            {
              id: "2",
              status: "pending",
              delegator: "claw1agent123456789012345678",
              assignee: "",
              description: "Delegated task",
            },
          ],
        };
      }
      return null;
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await runAgentTasks({ address: "claw1agent123456789012345678" });

    const output = logs.join("\n");
    expect(output).toContain("Tasks (2)");
    expect(output).toContain("accepted");
    expect(output).toContain("pending");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("displays task table from REST API", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("tasks_by_assignee")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tasks: [
                {
                  taskId: 1,
                  status: "accepted",
                  delegatorAddress: "claw1delegator12345678901",
                  assigneeAddress: "claw1agent123456789012345678",
                  budget: "1000000",
                  description: "Run inference on model X",
                },
              ],
            }),
        });
      }
      if (urlStr.includes("tasks_by_delegator")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tasks: [
                {
                  taskId: 2,
                  status: "pending",
                  delegatorAddress: "claw1agent123456789012345678",
                  assigneeAddress: "",
                  budget: "2000000",
                  description: "Delegated task",
                },
              ],
            }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runAgentTasks({ address: "claw1agent123456789012345678" });

    const output = logs.join("\n");
    expect(output).toContain("Tasks (2)");
    expect(output).toContain("accepted");
    expect(output).toContain("pending");
    expect(output).toContain("1 CLAW");
    expect(output).toContain("2 CLAW");
    expect(output).toContain("Run inference on model X");
  });

  it("shows message when no tasks found", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: [] }),
      });
    }) as unknown as typeof fetch;

    await runAgentTasks({ address: "claw1agent123456789012345678" });

    const output = logs.join("\n");
    expect(output).toContain("No tasks found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            tasks: [{ taskId: 1, status: "accepted" }],
          }),
      });
    }) as unknown as typeof fetch;

    await runAgentTasks({ address: "claw1agent123456789012345678", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.tasks).toBeDefined();
    expect(Array.isArray(parsed.tasks)).toBe(true);
  });

  it("filters by role=assigned", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: [] }),
      });
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runAgentTasks({ address: "claw1agent123456789012345678", role: "assigned" });

    // Should only call tasks_by_assignee, not tasks_by_delegator
    const calls = (fetchSpy as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u: string) => u.includes("tasks_by_assignee"))).toBe(true);
    expect(calls.some((u: string) => u.includes("tasks_by_delegator"))).toBe(false);
  });

  it("maps role=assigned to gateway assignee filter", async () => {
    queryGatewayMethodMock.mockResolvedValue({ tasks: [] });

    await runAgentTasks({ address: "claw1agent123456789012345678", role: "assigned" });

    expect(queryGatewayMethodMock).toHaveBeenCalledWith(
      "chain.agents.tasks",
      {
        address: "claw1agent123456789012345678",
        role: "assignee",
      },
    );
  });
});

// ---------------------------------------------------------------------------
// runAgentRewards()
// ---------------------------------------------------------------------------

describe("runAgentRewards", () => {
  it("displays cumulative rewards", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            cumulative_rewards: "10000000",
            denom: "uclaw",
          }),
      });
    }) as unknown as typeof fetch;

    await runAgentRewards({ address: "claw1agent123456789012345678" });

    const output = logs.join("\n");
    expect(output).toContain("Agent Rewards");
    expect(output).toContain("Cumulative:  10 CLAW");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            cumulative_rewards: "5000000",
            denom: "uclaw",
          }),
      });
    }) as unknown as typeof fetch;

    await runAgentRewards({ address: "claw1agent123456789012345678", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.cumulativeRewards).toBe("5000000");
    expect(parsed.denom).toBe("uclaw");
  });
});
