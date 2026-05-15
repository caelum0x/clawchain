/**
 * Tests for `clawd product-flow` — validation logic and type exports.
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

import { runProductFlow } from "../product-flow.js";
import type { ProductFlowOptions, ProductFlowResult } from "../product-flow.js";

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
  vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Validation: runProductFlow()
// ---------------------------------------------------------------------------

describe("runProductFlow", () => {
  it("exports runProductFlow as a function", () => {
    expect(typeof runProductFlow).toBe("function");
  });

  it("fails validation when assignee is missing (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runProductFlow({
      assignee: "",
      taskDescription: "test",
      messageCiphertext: "encrypted",
      skillId: 1,
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as ProductFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("assignee");
  });

  it("fails validation when task-description is missing (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runProductFlow({
      assignee: "claw1someone",
      taskDescription: "",
      messageCiphertext: "encrypted",
      skillId: 1,
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as ProductFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("task-description");
  });

  it("fails validation when message-ciphertext is missing (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runProductFlow({
      assignee: "claw1someone",
      taskDescription: "test",
      messageCiphertext: "",
      skillId: 1,
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as ProductFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("message-ciphertext");
  });

  it("fails validation when skill-id is negative (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runProductFlow({
      assignee: "claw1someone",
      taskDescription: "test",
      messageCiphertext: "encrypted",
      skillId: -1,
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as ProductFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("skill-id");
  });

  it("fails when mnemonic is missing (json mode)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runProductFlow({
      assignee: "claw1someone",
      taskDescription: "test",
      messageCiphertext: "encrypted",
      skillId: 1,
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output) as ProductFlowResult;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe("validate");
    expect(parsed.error).toContain("mnemonic");
  });

  it("calls process.exit(1) on failure in non-json mode", async () => {
    await runProductFlow({
      assignee: "",
      taskDescription: "test",
      messageCiphertext: "encrypted",
      skillId: 1,
    });

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Type checks
// ---------------------------------------------------------------------------

describe("ProductFlow types", () => {
  it("ProductFlowOptions has expected fields", () => {
    const opts: ProductFlowOptions = {
      assignee: "claw1test",
      taskDescription: "do something",
      messageCiphertext: "encrypted-data",
      skillId: 1,
    };
    expect(opts.assignee).toBe("claw1test");
    expect(opts.skillId).toBe(1);
  });

  it("ProductFlowResult has expected structure", () => {
    const result: ProductFlowResult = {
      ok: false,
      stage: "validate",
      error: "test error",
    };
    expect(result.ok).toBe(false);
    expect(result.stage).toBe("validate");
  });
});
