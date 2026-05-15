/**
 * Tests for `clawd negotiate` subcommands — list.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips propose/counter/accept/reject (they require signing client).
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

import { runNegotiateList } from "../negotiate.js";

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
// runNegotiateList()
// ---------------------------------------------------------------------------

describe("runNegotiateList", () => {
  it("displays negotiations table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          negotiations: [
            {
              id: "1",
              initiator: "claw1initiator12345678901234",
              counterparty: "claw1counter123456789012345",
              proposed_budget: "5000uclaw",
              status: "proposed",
              round: "1",
            },
            {
              id: "2",
              initiator: "claw1initiator98765432109876",
              counterparty: "claw1counter987654321098765",
              proposed_budget: "10000uclaw",
              status: "accepted",
              round: "3",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runNegotiateList({});

    const output = logs.join("\n");
    expect(output).toContain("Active Negotiations");
    expect(output).toContain("proposed");
    expect(output).toContain("accepted");
    expect(output).toContain("5000uclaw");
    expect(output).toContain("10000uclaw");
  });

  it("shows message when no negotiations found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ negotiations: [] }),
    }) as unknown as typeof fetch;

    await runNegotiateList({});

    const output = logs.join("\n");
    expect(output).toContain("No negotiations found.");
  });

  it("handles 404 with no negotiations found message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await runNegotiateList({});

    const output = logs.join("\n");
    expect(output).toContain("No negotiations found.");
  });

  it("filters by address when provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ negotiations: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runNegotiateList({ address: "claw1myaddr" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/agent/v1/negotiations/claw1myaddr");
  });

  it("uses base negotiations endpoint when no address provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ negotiations: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runNegotiateList({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/agent/v1/negotiations");
    expect(calledUrl).not.toContain("/negotiations/claw1");
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
          negotiations: [
            {
              id: "1",
              initiator: "claw1init",
              counterparty: "claw1counter",
              status: "proposed",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runNegotiateList({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.negotiations).toBeDefined();
    expect(Array.isArray(parsed.negotiations)).toBe(true);
    expect(parsed.negotiations).toHaveLength(1);
  });

  it("displays address-specific title when filtering", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          negotiations: [
            {
              id: "1",
              initiator: "claw1myaddress1234567890123",
              counterparty: "claw1other12345678901234567",
              proposed_budget: "1000uclaw",
              status: "proposed",
              round: "1",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runNegotiateList({ address: "claw1myaddress1234567890123" });

    const output = logs.join("\n");
    expect(output).toContain("Active Negotiations for");
  });

  it("displays round counts from API data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          negotiations: [
            {
              id: "5",
              initiator: "claw1init12345678901234567890",
              counterparty: "claw1counter12345678901234567",
              proposed_budget: "2000uclaw",
              status: "countered",
              round: "4",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runNegotiateList({});

    const output = logs.join("\n");
    expect(output).toContain("4");
    expect(output).toContain("countered");
  });
});
