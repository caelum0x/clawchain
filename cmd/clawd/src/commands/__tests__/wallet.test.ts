/**
 * Tests for `clawd wallet` subcommands — history, earnings, contacts, and pure functions.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips balance/send (they require StargateClient / signing client).
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
    recipientAliases: {
      alice: "claw1alice123456789012345678901",
    },
  })),
}));

// Mock mnemonic (imported by module for signing commands)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

import {
  runWalletHistory,
  runWalletEarnings,
  runWalletContacts,
  parseClawAmount,
  formatClaw,
  toChainIdentifier,
} from "../wallet.js";

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
// parseClawAmount()
// ---------------------------------------------------------------------------

describe("parseClawAmount", () => {
  it("converts whole CLAW to uclaw", () => {
    expect(parseClawAmount("1")).toBe("1000000");
    expect(parseClawAmount("100")).toBe("100000000");
  });

  it("converts decimal CLAW to uclaw", () => {
    expect(parseClawAmount("1.5")).toBe("1500000");
    expect(parseClawAmount("0.000001")).toBe("1");
    expect(parseClawAmount("2.123456")).toBe("2123456");
  });

  it("throws on invalid amounts", () => {
    expect(() => parseClawAmount("abc")).toThrow("Invalid amount");
    expect(() => parseClawAmount("-1")).toThrow("Invalid amount");
    expect(() => parseClawAmount("1.1234567")).toThrow("Invalid amount");
  });
});

// ---------------------------------------------------------------------------
// formatClaw()
// ---------------------------------------------------------------------------

describe("formatClaw", () => {
  it("formats whole amounts", () => {
    expect(formatClaw("1000000")).toBe("1 CLAW");
    expect(formatClaw("0")).toBe("0 CLAW");
    expect(formatClaw("5000000")).toBe("5 CLAW");
  });

  it("formats fractional amounts", () => {
    expect(formatClaw("1500000")).toBe("1.5 CLAW");
    expect(formatClaw("1")).toBe("0.000001 CLAW");
    expect(formatClaw("2123456")).toBe("2.123456 CLAW");
  });
});

// ---------------------------------------------------------------------------
// toChainIdentifier()
// ---------------------------------------------------------------------------

describe("toChainIdentifier", () => {
  it("extracts chain identifier from chain ID", () => {
    expect(toChainIdentifier("clawchain-1")).toBe("clawchain");
    expect(toChainIdentifier("clawchain-testnet-1")).toBe("clawchain-testnet");
    expect(toChainIdentifier("cosmoshub-4")).toBe("cosmoshub");
  });

  it("returns full ID when no dash", () => {
    expect(toChainIdentifier("localnet")).toBe("localnet");
  });
});

// ---------------------------------------------------------------------------
// runWalletHistory()
// ---------------------------------------------------------------------------

describe("runWalletHistory", () => {
  it("displays transaction history from backend", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          msgs: [
            {
              msg: {
                txHash: "AABBCCDD11223344556677",
                relation: "sent",
                time: "2026-03-07T10:00:00Z",
                denoms: ["uclaw"],
              },
            },
            {
              msg: {
                txHash: "EEFF00112233445566778899",
                relation: "received",
                time: "2026-03-07T11:00:00Z",
                denoms: ["uclaw"],
              },
            },
          ],
          nextCursor: "cursor-abc",
        }),
    }) as unknown as typeof fetch;

    await runWalletHistory({});

    const output = logs.join("\n");
    expect(output).toContain("AABBCCDD11223");
    expect(output).toContain("sent");
    expect(output).toContain("received");
    expect(output).toContain("uclaw");
    expect(output).toContain("Next cursor: cursor-abc");
  });

  it("shows message when no transactions found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ msgs: [] }),
    }) as unknown as typeof fetch;

    await runWalletHistory({});

    const output = logs.join("\n");
    expect(output).toContain("No transactions found.");
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
          msgs: [{ msg: { txHash: "ABC", relation: "sent" } }],
        }),
    }) as unknown as typeof fetch;

    await runWalletHistory({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.msgs).toHaveLength(1);
    expect(parsed.msgs[0].msg.txHash).toBe("ABC");
  });
});

// ---------------------------------------------------------------------------
// runWalletEarnings()
// ---------------------------------------------------------------------------

describe("runWalletEarnings", () => {
  it("displays earnings summary from backend", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          address: "claw1agent123456789012345678",
          window: "7d",
          since: "2026-03-01T00:00:00Z",
          totals: [{ denom: "uclaw", amount: "10000000" }],
          breakdown: {
            staking_rewards: [{ denom: "uclaw", amount: "5000000" }],
            task_fees: [{ denom: "uclaw", amount: "3000000" }],
            skill_sales: [{ denom: "uclaw", amount: "2000000" }],
            incoming_transfers: [],
          },
        }),
    }) as unknown as typeof fetch;

    await runWalletEarnings({});

    const output = logs.join("\n");
    expect(output).toContain("Address: claw1agent123456789012345678");
    expect(output).toContain("Window:  7d");
    expect(output).toContain("Totals:");
    expect(output).toContain("10 CLAW");
    expect(output).toContain("staking rewards:");
    expect(output).toContain("5 CLAW");
    expect(output).toContain("task fees:");
    expect(output).toContain("3 CLAW");
    expect(output).toContain("skill sales:");
    expect(output).toContain("2 CLAW");
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
          address: "claw1test",
          window: "7d",
          totals: [],
          breakdown: {},
        }),
    }) as unknown as typeof fetch;

    await runWalletEarnings({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.address).toBe("claw1test");
    expect(parsed.window).toBe("7d");
  });
});

// ---------------------------------------------------------------------------
// runWalletContacts()
// ---------------------------------------------------------------------------

describe("runWalletContacts", () => {
  it("displays contacts list including aliases and on-chain agents", async () => {
    // Mock fetch for live agents endpoint
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          agents: [
            { address: "claw1bob99999999999999999999999", name: "bob" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runWalletContacts({});

    const output = logs.join("\n");
    expect(output).toContain("Contacts (2)");
    expect(output).toContain("alice");
    expect(output).toContain("bob");
    expect(output).toContain("alias");
    expect(output).toContain("onchain");
  });

  it("shows message when no contacts found", async () => {
    // Mock fetch returning empty agents (config has alice alias, but we'll search for a non-match)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents: [] }),
    }) as unknown as typeof fetch;

    await runWalletContacts({ query: "nonexistent" });

    const output = logs.join("\n");
    expect(output).toContain("No contacts found for 'nonexistent'.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents: [] }),
    }) as unknown as typeof fetch;

    await runWalletContacts({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.contacts).toBeDefined();
    expect(Array.isArray(parsed.contacts)).toBe(true);
  });
});
