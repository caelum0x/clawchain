/**
 * Tests for `clawd agent-flow` — validation logic and type exports.
 *
 * The full flow requires SDK + live chain, so we test validation paths
 * and the exported type/function shapes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => null),
  mnemonicFileExists: vi.fn(() => false),
}));

import { runAgentFlow, runAgentBootstrap } from "../agent-flow.js";
import type { AgentFlowOptions, AgentFlowResult, AgentBootstrapOptions } from "../agent-flow.js";

let logs: string[];
let errors: string[];

beforeEach(() => {
  logs = [];
  errors = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  // Prevent process.exit from actually exiting
  vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Validation: runAgentFlow()
// ---------------------------------------------------------------------------

describe("runAgentFlow", () => {
  it("exports runAgentFlow as a function", () => {
    expect(typeof runAgentFlow).toBe("function");
  });

  it("exports runAgentBootstrap as a function", () => {
    expect(typeof runAgentBootstrap).toBe("function");
  });

  it("fails validation when assignee is missing (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runAgentFlow({
      assignee: "",
      description: "test",
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as AgentFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("assignee");
  });

  it("fails validation when description is missing (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runAgentFlow({
      assignee: "claw1someone",
      description: "",
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as AgentFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("description");
  });

  it("fails when autoComplete is set without completionResult (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runAgentFlow({
      assignee: "claw1someone",
      description: "test task",
      autoComplete: true,
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as AgentFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("completion-result");
  });

  it("fails when mnemonic is missing (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runAgentFlow({
      assignee: "claw1someone",
      description: "test task",
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as AgentFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("mnemonic");
  });

  it("calls process.exit(1) on failure in non-json mode", async () => {
    await runAgentFlow({
      assignee: "",
      description: "test",
    });

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("sets process.exitCode on failure in json mode", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runAgentFlow({
      assignee: "",
      description: "test",
      json: true,
    });

    expect(process.exitCode).toBe(1);
    // Clean up
    process.exitCode = undefined;
  });
});

// ---------------------------------------------------------------------------
// Type checks
// ---------------------------------------------------------------------------

describe("AgentFlow types", () => {
  it("AgentFlowOptions has expected fields", () => {
    const opts: AgentFlowOptions = {
      assignee: "claw1test",
      description: "task",
    };
    expect(opts.assignee).toBe("claw1test");
  });

  it("AgentFlowResult has expected structure", () => {
    const result: AgentFlowResult = {
      ok: false,
      stage: "validate",
      error: "test",
    };
    expect(result.ok).toBe(false);
    expect(result.stage).toBe("validate");
  });
});
