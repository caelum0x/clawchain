/**
 * Tests for `clawd reputation` subcommands — query, leaderboard, rate, endorse.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips rate/endorse (they require signing client).
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

import { runReputationQuery, runReputationLeaderboard } from "../reputation.js";

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
// runReputationQuery()
// ---------------------------------------------------------------------------

describe("runReputationQuery", () => {
  it("displays reputation details from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          reputation: {
            avg_rating_bps: "450",
            total_ratings: "12",
            endorsement_count: "3",
          },
        }),
    }) as unknown as typeof fetch;

    await runReputationQuery({ address: "claw1agent123456789012345678" });

    const output = logs.join("\n");
    expect(output).toContain("Reputation for");
    expect(output).toContain("Average Rating: 4.5/5.0");
    expect(output).toContain("Total Ratings:  12");
    expect(output).toContain("Endorsements:   3");
  });

  it("handles 404 when no reputation data exists", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await runReputationQuery({ address: "claw1unknown000000000000000" });

    const output = logs.join("\n");
    expect(output).toContain("No reputation data found");
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
          reputation: {
            avg_rating_bps: "300",
            total_ratings: "5",
            endorsement_count: "1",
          },
        }),
    }) as unknown as typeof fetch;

    await runReputationQuery({ address: "claw1agent123456789012345678", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.avg_rating_bps).toBe("300");
    expect(parsed.total_ratings).toBe("5");
  });

  it("calls correct REST endpoint with encoded address", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          reputation: { avg_rating_bps: "0", total_ratings: "0", endorsement_count: "0" },
        }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runReputationQuery({ address: "claw1testaddr" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/reputation/v1/reputation/");
    expect(calledUrl).toContain("claw1testaddr");
  });

  it("displays zero rating correctly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          reputation: {
            avg_rating_bps: "0",
            total_ratings: "0",
            endorsement_count: "0",
          },
        }),
    }) as unknown as typeof fetch;

    await runReputationQuery({ address: "claw1agent123456789012345678" });

    const output = logs.join("\n");
    expect(output).toContain("Average Rating: 0.0/5.0");
    expect(output).toContain("Total Ratings:  0");
    expect(output).toContain("Endorsements:   0");
  });
});

// ---------------------------------------------------------------------------
// runReputationLeaderboard()
// ---------------------------------------------------------------------------

describe("runReputationLeaderboard", () => {
  it("displays leaderboard table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          agents: [
            {
              agent_address: "claw1top1234567890123456789",
              avg_rating_bps: "480",
              total_ratings: "50",
              endorsement_count: "10",
            },
            {
              agent_address: "claw1second789012345678901234",
              avg_rating_bps: "420",
              total_ratings: "30",
              endorsement_count: "5",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runReputationLeaderboard({});

    const output = logs.join("\n");
    expect(output).toContain("Reputation Leaderboard");
    expect(output).toContain("4.8/5.0");
    expect(output).toContain("4.2/5.0");
    expect(output).toContain("50");
    expect(output).toContain("30");
  });

  it("shows message when no rated agents found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents: [] }),
    }) as unknown as typeof fetch;

    await runReputationLeaderboard({});

    const output = logs.join("\n");
    expect(output).toContain("No rated agents found.");
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
          agents: [{ agent_address: "claw1top", avg_rating_bps: "500" }],
        }),
    }) as unknown as typeof fetch;

    await runReputationLeaderboard({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.agents).toBeDefined();
    expect(Array.isArray(parsed.agents)).toBe(true);
    expect(parsed.agents).toHaveLength(1);
  });
});
