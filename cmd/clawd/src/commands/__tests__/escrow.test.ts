/**
 * Tests for `clawd escrow` subcommands -- list, status.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips create/complete/dispute (they require signing client).
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

// Mock mnemonic (imported by module for signing commands and default address)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: () =>
      Promise.resolve({
        getAccounts: () =>
          Promise.resolve([{ address: "claw1myaddress1234567890123" }]),
      }),
  },
}));

vi.mock("@cosmjs/stargate", () => ({
  GasPrice: { fromString: () => ({}) },
  SigningStargateClient: {
    connectWithSigner: () =>
      Promise.resolve({
        signAndBroadcast: vi.fn(),
        disconnect: vi.fn(),
      }),
  },
}));

import { runEscrowList, runEscrowStatus } from "../escrow.js";

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
// runEscrowList()
// ---------------------------------------------------------------------------

describe("runEscrowList", () => {
  it("displays escrows table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          escrows: [
            {
              id: "1",
              buyer: "claw1buyer12345678901234567",
              seller: "claw1seller1234567890123456",
              amount: { denom: "uclaw", amount: "10000000" },
              milestones: [{ description: "Phase 1", amount: "5000000" }],
              status: "active",
            },
            {
              id: "2",
              buyer: "claw1buyer12345678901234567",
              seller: "claw1seller9876543210987654",
              amount: { denom: "uclaw", amount: "25000000" },
              milestones: [],
              status: "completed",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runEscrowList({ buyer: "claw1buyer12345678901234567" });

    const output = logs.join("\n");
    expect(output).toContain("Escrows (2)");
    expect(output).toContain("10 CLAW");
    expect(output).toContain("25 CLAW");
    expect(output).toContain("active");
    expect(output).toContain("completed");
  });

  it("shows message when no escrows found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ escrows: [] }),
    }) as unknown as typeof fetch;

    await runEscrowList({ buyer: "claw1buyer12345678901234567" });

    const output = logs.join("\n");
    expect(output).toContain("No escrows found.");
  });

  it("passes buyer filter as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ escrows: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runEscrowList({ buyer: "claw1buyer12345678901234567" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("buyer=claw1buyer12345678901234567");
  });

  it("passes seller filter as query parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ escrows: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runEscrowList({ seller: "claw1seller1234567890123456" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("seller=claw1seller1234567890123456");
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
          escrows: [
            {
              id: "1",
              buyer: "claw1buyer12345678901234567",
              seller: "claw1seller1234567890123456",
              amount: { denom: "uclaw", amount: "5000000" },
              status: "active",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runEscrowList({ buyer: "claw1buyer12345678901234567", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.escrows).toBeDefined();
    expect(parsed.escrows).toHaveLength(1);
    expect(parsed.escrows[0].id).toBe("1");
  });

  it("displays milestone count in table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          escrows: [
            {
              id: "1",
              buyer: "claw1buyer12345678901234567",
              seller: "claw1seller1234567890123456",
              amount: { denom: "uclaw", amount: "1000000" },
              milestones: [
                { description: "Phase 1" },
                { description: "Phase 2" },
                { description: "Phase 3" },
              ],
              status: "active",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runEscrowList({ buyer: "claw1buyer12345678901234567" });

    const output = logs.join("\n");
    expect(output).toContain("3");
  });
});

// ---------------------------------------------------------------------------
// runEscrowStatus()
// ---------------------------------------------------------------------------

describe("runEscrowStatus", () => {
  it("displays single escrow detail", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/dispute/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            escrow: {
              id: "42",
              buyer: "claw1buyer12345678901234567",
              seller: "claw1seller1234567890123456",
              amount: { denom: "uclaw", amount: "15000000" },
              status: "active",
              created_at: "2026-03-01T00:00:00Z",
              milestones: [
                { description: "Design", amount: "5000000", completed: true },
                { description: "Build", amount: "10000000", completed: false },
              ],
            },
          }),
      });
    }) as unknown as typeof fetch;

    await runEscrowStatus({ escrowId: "42" });

    const output = logs.join("\n");
    expect(output).toContain("Escrow #42");
    expect(output).toContain("Buyer:");
    expect(output).toContain("Seller:");
    expect(output).toContain("15 CLAW");
    expect(output).toContain("active");
    expect(output).toContain("Milestones:");
    expect(output).toContain("[x]");
    expect(output).toContain("[ ]");
    expect(output).toContain("Design");
    expect(output).toContain("Build");
  });

  it("displays dispute info when available", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/dispute/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              dispute: {
                escrow_id: "42",
                initiator: "claw1buyer12345678901234567",
                reason: "Work not delivered",
                status: "open",
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            escrow: {
              id: "42",
              buyer: "claw1buyer12345678901234567",
              seller: "claw1seller1234567890123456",
              amount: { denom: "uclaw", amount: "5000000" },
              status: "disputed",
            },
          }),
      });
    }) as unknown as typeof fetch;

    await runEscrowStatus({ escrowId: "42" });

    const output = logs.join("\n");
    expect(output).toContain("Dispute:");
    expect(output).toContain("Work not delivered");
    expect(output).toContain("open");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/dispute/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            escrow: {
              id: "42",
              buyer: "claw1test",
              status: "active",
            },
          }),
      });
    }) as unknown as typeof fetch;

    await runEscrowStatus({ escrowId: "42", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.escrow).toBeDefined();
    expect(parsed.escrow.id).toBe("42");
    expect(parsed.escrow.status).toBe("active");
  });
});
