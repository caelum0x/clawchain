/**
 * Tests for `clawd intent` subcommands — list, query.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips submit/respond/finalize (they require signing client).
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

// Mock mnemonic (imported by module for signing commands)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

import { runIntentList, runIntentQuery } from "../intent.js";

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
// runIntentList()
// ---------------------------------------------------------------------------

describe("runIntentList", () => {
  it("displays intents table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          intents: [
            {
              id: "1",
              creator_address: "claw1creator1234567890123456",
              description: "Run distributed inference",
              response_count: "3",
              max_budget: "5000uclaw",
              status: "open",
            },
            {
              id: "2",
              creator_address: "claw1creator9876543210987654",
              description: "Train model collaboratively",
              response_count: "1",
              max_budget: "10000uclaw",
              status: "finalized",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIntentList({});

    const output = logs.join("\n");
    expect(output).toContain("Coordination Intents");
    expect(output).toContain("Run distributed inference");
    expect(output).toContain("Train model collaboratively");
    expect(output).toContain("open");
    expect(output).toContain("finalized");
  });

  it("shows message when no intents found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ intents: [] }),
    }) as unknown as typeof fetch;

    await runIntentList({});

    const output = logs.join("\n");
    expect(output).toContain("No intents found.");
  });

  it("handles 404 with no intents found message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await runIntentList({});

    const output = logs.join("\n");
    expect(output).toContain("No intents found.");
  });

  it("passes creator address as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ intents: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runIntentList({ address: "claw1myaddr" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("creator=claw1myaddr");
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
          intents: [{ id: "1", description: "Test intent" }],
        }),
    }) as unknown as typeof fetch;

    await runIntentList({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.intents).toBeDefined();
    expect(Array.isArray(parsed.intents)).toBe(true);
    expect(parsed.intents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// runIntentQuery()
// ---------------------------------------------------------------------------

describe("runIntentQuery", () => {
  it("displays single intent detail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "42",
          creator_address: "claw1creator1234567890123456",
          description: "Multi-agent inference pipeline",
          intent_type: "collaboration",
          status: "open",
          min_responses: "2",
          responses: [
            {
              responder_addr: "claw1responder12345678901234",
              accepted: false,
              payload: "I can help with GPU compute",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIntentQuery({ intentId: 42 });

    const output = logs.join("\n");
    expect(output).toContain("Intent #42");
    expect(output).toContain("Status:        open");
    expect(output).toContain("Type:          collaboration");
    expect(output).toContain("Description:   Multi-agent inference pipeline");
    expect(output).toContain("Min Responses: 2");
    expect(output).toContain("Responses (1)");
  });

  it("handles 404 for non-existent intent", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await runIntentQuery({ intentId: 999 });

    const output = logs.join("\n");
    expect(output).toContain("Intent #999 not found.");
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
          id: "42",
          description: "Test Intent",
          status: "open",
        }),
    }) as unknown as typeof fetch;

    await runIntentQuery({ intentId: 42, json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe("42");
    expect(parsed.description).toBe("Test Intent");
  });

  it("displays intent without responses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "10",
          creator_address: "claw1creator1234567890123456",
          description: "Simple task",
          status: "open",
          min_responses: "1",
          responses: [],
        }),
    }) as unknown as typeof fetch;

    await runIntentQuery({ intentId: 10 });

    const output = logs.join("\n");
    expect(output).toContain("Intent #10");
    expect(output).toContain("Simple task");
    expect(output).not.toContain("Responses (");
  });
});
