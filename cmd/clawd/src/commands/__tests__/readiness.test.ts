/**
 * Tests for `clawd readiness` — integrated product readiness checks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockReadyReport = {
  ready: true,
  chainId: "clawchain-1",
  agentAddress: "claw1agent123456789012345678",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  messagingEndpoint: "http://localhost:7777",
  checks: [
    { name: "chain_rpc", ok: true, required: true, detail: "reachable" },
    { name: "agent_registered", ok: true, required: true, detail: "registered" },
    { name: "messaging", ok: true, required: false, detail: "endpoint active" },
  ],
  blockers: [],
};

const mockNotReadyReport = {
  ready: false,
  chainId: "clawchain-1",
  agentAddress: null,
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  messagingEndpoint: null,
  checks: [
    { name: "chain_rpc", ok: false, required: true, detail: "unreachable" },
    { name: "agent_registered", ok: false, required: true, detail: "not registered" },
  ],
  blockers: [
    { name: "chain_rpc", detail: "unreachable" },
    { name: "agent_registered", detail: "not registered" },
  ],
};

let readinessResult = mockReadyReport;

vi.mock("../../lib/readiness.js", () => ({
  evaluateIntegratedReadiness: () => Promise.resolve(readinessResult),
}));

import { runReadiness } from "../readiness.js";

let logs: string[];

beforeEach(() => {
  logs = [];
  readinessResult = mockReadyReport;
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

// ---------------------------------------------------------------------------
// runReadiness()
// ---------------------------------------------------------------------------

describe("runReadiness", () => {
  it("displays chain and agent info", async () => {
    await runReadiness();

    const output = logs.join("\n");
    expect(output).toContain("clawd readiness");
    expect(output).toContain("Chain ID:         clawchain-1");
    expect(output).toContain("Agent address:    claw1agent123456789012345678");
    expect(output).toContain("RPC URL:          http://localhost:26657");
    expect(output).toContain("REST URL:         http://localhost:1317");
  });

  it("displays READY when all checks pass", async () => {
    await runReadiness();

    const output = logs.join("\n");
    expect(output).toContain("Readiness: READY");
    expect(output).toContain("[OK ]");
  });

  it("displays NOT READY when checks fail", async () => {
    readinessResult = mockNotReadyReport as any;

    await runReadiness();

    const output = logs.join("\n");
    expect(output).toContain("Readiness: NOT READY");
    expect(output).toContain("[FAIL]");
    expect(output).toContain("Blockers:");
    expect(output).toContain("chain_rpc");
  });

  it("displays messaging endpoint when present", async () => {
    await runReadiness();

    const output = logs.join("\n");
    expect(output).toContain("Messaging URL:    http://localhost:7777");
  });

  it("shows missing agent address when not configured", async () => {
    readinessResult = mockNotReadyReport as any;

    await runReadiness();

    const output = logs.join("\n");
    expect(output).toContain("(missing in config)");
  });

  it("sets process.exitCode=1 when not ready", async () => {
    readinessResult = mockNotReadyReport as any;

    await runReadiness();

    expect(process.exitCode).toBe(1);
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runReadiness({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.ready).toBe(true);
    expect(parsed.chainId).toBe("clawchain-1");
    expect(parsed.checks).toBeDefined();
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  it("sets process.exitCode=1 in JSON mode when not ready", async () => {
    readinessResult = mockNotReadyReport as any;

    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runReadiness({ json: true });

    expect(process.exitCode).toBe(1);
    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
  });
});
