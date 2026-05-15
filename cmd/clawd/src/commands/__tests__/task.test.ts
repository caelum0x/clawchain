/**
 * Tests for `clawd task` subcommands — status (read-only).
 *
 * Tests read-only query commands by mocking fetch.
 * Skips delegate/accept/complete (they require signing client).
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

// Mock mnemonic (imported by module for signing commands)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

import { runTaskStatus } from "../task.js";

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
// runTaskStatus()
// ---------------------------------------------------------------------------

describe("runTaskStatus", () => {
  it("displays task detail from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "accepted",
          delegatorAddress: "claw1delegator12345678901234",
          assigneeAddress: "claw1assignee12345678901234",
          description: "Run inference on model X",
          requirements: "GPU required",
          skillId: 5,
          budget: "2000000",
          deadlineBlocks: 100,
          createdAt: 1709856000,
          completedAt: 0,
        }),
    }) as unknown as typeof fetch;

    await runTaskStatus({ taskId: 7 });

    const output = logs.join("\n");
    expect(output).toContain("Task #7");
    expect(output).toContain("Status:       accepted");
    expect(output).toContain("Delegator:    claw1delegator12345678901234");
    expect(output).toContain("Assignee:     claw1assignee12345678901234");
    expect(output).toContain("Description:  Run inference on model X");
    expect(output).toContain("Requirements: GPU required");
    expect(output).toContain("Skill ID:     5");
    expect(output).toContain("2 CLAW");
    expect(output).toContain("100 blocks");
  });

  it("displays completed task with result", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "completed",
          delegatorAddress: "claw1delegator12345678901234",
          assigneeAddress: "claw1assignee12345678901234",
          description: "Analyze data",
          requirements: "",
          skillId: 0,
          budget: "0",
          deadlineBlocks: 50,
          createdAt: 1709856000,
          completedAt: 1709859600,
          result: "Analysis complete: 95% accuracy",
        }),
    }) as unknown as typeof fetch;

    await runTaskStatus({ taskId: 3 });

    const output = logs.join("\n");
    expect(output).toContain("Status:       completed");
    expect(output).toContain("Result:       Analysis complete: 95% accuracy");
    expect(output).toContain("Completed At:");
  });

  it("handles HTTP error for non-existent task", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    // runTaskStatus calls process.exit(1) on error — mock it
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await runTaskStatus({ taskId: 999 });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "pending",
          description: "JSON test task",
          budget: "1000000",
        }),
    }) as unknown as typeof fetch;

    await runTaskStatus({ taskId: 10, json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe("pending");
    expect(parsed.description).toBe("JSON test task");
    expect(parsed.budget).toBe("1000000");
  });

  it("shows separator line after task header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "accepted",
          delegatorAddress: "claw1test",
          assigneeAddress: "claw1test2",
          description: "Test",
        }),
    }) as unknown as typeof fetch;

    await runTaskStatus({ taskId: 1 });

    const output = logs.join("\n");
    expect(output).toContain("Task #1");
    expect(output).toContain("========");
  });

  it("displays dash for zero budget", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "pending",
          delegatorAddress: "claw1test",
          assigneeAddress: "",
          description: "Free task",
          budget: "0",
          deadlineBlocks: 0,
          createdAt: 0,
          completedAt: 0,
        }),
    }) as unknown as typeof fetch;

    await runTaskStatus({ taskId: 20 });

    const output = logs.join("\n");
    expect(output).toContain("Budget:       -");
  });

  it("queries correct REST endpoint with task ID", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "pending",
          description: "test",
        }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runTaskStatus({ taskId: 42 });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/agent/v1/task/42");
  });

  it("shows Created At as dash when timestamp is zero", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "pending",
          description: "test",
          createdAt: 0,
          completedAt: 0,
        }),
    }) as unknown as typeof fetch;

    await runTaskStatus({ taskId: 1 });

    const output = logs.join("\n");
    expect(output).toContain("Created At:   -");
    expect(output).toContain("Completed At: -");
  });
});
