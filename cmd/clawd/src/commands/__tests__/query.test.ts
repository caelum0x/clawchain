/**
 * Tests for `clawd query` subcommands — block, tx, validators.
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

import { runQueryBlock, runQueryTx, runQueryValidators } from "../query.js";

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
// runQueryBlock()
// ---------------------------------------------------------------------------

describe("runQueryBlock", () => {
  it("displays block info from RPC", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            block_id: { hash: "ABC123DEF456" },
            block: {
              header: {
                height: "5000",
                time: "2026-03-07T10:00:00Z",
                proposer_address: "DEADBEEF",
                app_hash: "CAFEBABE",
              },
              data: {
                txs: ["tx1encoded", "tx2encoded"],
              },
            },
          },
        }),
    }) as unknown as typeof fetch;

    await runQueryBlock({});

    const output = logs.join("\n");
    expect(output).toContain("Block Info");
    expect(output).toContain("Height:   5000");
    expect(output).toContain("Hash:     ABC123DEF456");
    expect(output).toContain("Time:     2026-03-07T10:00:00Z");
    expect(output).toContain("Proposer: DEADBEEF");
    expect(output).toContain("Tx Count: 2");
    expect(output).toContain("App Hash: CAFEBABE");
  });

  it("queries specific height when provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            block_id: {},
            block: { header: { height: "100" }, data: { txs: [] } },
          },
        }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runQueryBlock({ height: "100" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("height=100");
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
          result: {
            block_id: { hash: "test" },
            block: { header: { height: "1" }, data: { txs: [] } },
          },
        }),
    }) as unknown as typeof fetch;

    await runQueryBlock({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.block_id).toBeDefined();
    expect(parsed.block).toBeDefined();
  });

  it("handles block with no transactions", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            block_id: { hash: "EMPTY" },
            block: {
              header: { height: "1", time: "2026-01-01T00:00:00Z" },
              data: { txs: [] },
            },
          },
        }),
    }) as unknown as typeof fetch;

    await runQueryBlock({});

    const output = logs.join("\n");
    expect(output).toContain("Tx Count: 0");
  });
});

// ---------------------------------------------------------------------------
// runQueryTx()
// ---------------------------------------------------------------------------

describe("runQueryTx", () => {
  it("displays transaction info from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tx_response: {
            txhash: "AABBCCDD",
            height: "1234",
            code: 0,
            gas_used: "50000",
            gas_wanted: "100000",
            timestamp: "2026-03-07T12:00:00Z",
          },
          tx: {
            body: {
              messages: [
                {
                  "@type": "/cosmos.bank.v1beta1.MsgSend",
                  from_address: "claw1sender12345678901234567",
                  to_address: "claw1receiver1234567890123456",
                  amount: [{ denom: "uclaw", amount: "5000000" }],
                },
              ],
            },
          },
        }),
    }) as unknown as typeof fetch;

    await runQueryTx({ hash: "AABBCCDD" });

    const output = logs.join("\n");
    expect(output).toContain("Transaction Info");
    expect(output).toContain("Hash:      AABBCCDD");
    expect(output).toContain("Height:    1234");
    expect(output).toContain("Status:    Success");
    expect(output).toContain("Gas:       50000 / 100000");
    expect(output).toContain("Timestamp: 2026-03-07T12:00:00Z");
    expect(output).toContain("Messages (1)");
    expect(output).toContain("Send");
    expect(output).toContain("5 CLAW");
  });

  it("displays failed transaction status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tx_response: {
            txhash: "FAILED01",
            height: "500",
            code: 5,
            gas_used: "10000",
            gas_wanted: "50000",
          },
          tx: { body: { messages: [] } },
        }),
    }) as unknown as typeof fetch;

    await runQueryTx({ hash: "FAILED01" });

    const output = logs.join("\n");
    expect(output).toContain("Status:    Failed (code=5)");
  });

  it("decodes MsgDelegate messages", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tx_response: { txhash: "DELEGATE01", height: "100", code: 0 },
          tx: {
            body: {
              messages: [
                {
                  "@type": "/cosmos.staking.v1beta1.MsgDelegate",
                  delegator_address: "claw1delegator12345678901",
                  validator_address: "clawvaloper1validator12345678",
                  amount: { denom: "uclaw", amount: "10000000" },
                },
              ],
            },
          },
        }),
    }) as unknown as typeof fetch;

    await runQueryTx({ hash: "DELEGATE01" });

    const output = logs.join("\n");
    expect(output).toContain("Delegate");
    expect(output).toContain("10 CLAW");
  });

  it("decodes MsgVote messages", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tx_response: { txhash: "VOTE01", height: "200", code: 0 },
          tx: {
            body: {
              messages: [
                {
                  "@type": "/cosmos.gov.v1beta1.MsgVote",
                  voter: "claw1voter123456789012345678",
                  proposal_id: "42",
                  option: 1,
                },
              ],
            },
          },
        }),
    }) as unknown as typeof fetch;

    await runQueryTx({ hash: "VOTE01" });

    const output = logs.join("\n");
    expect(output).toContain("Vote by");
    expect(output).toContain("proposal #42");
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
          tx_response: { txhash: "JSON01", code: 0 },
          tx: { body: { messages: [] } },
        }),
    }) as unknown as typeof fetch;

    await runQueryTx({ hash: "JSON01", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.tx_response.txhash).toBe("JSON01");
  });
});

// ---------------------------------------------------------------------------
// runQueryValidators()
// ---------------------------------------------------------------------------

describe("runQueryValidators", () => {
  it("displays validator table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          validators: [
            {
              description: { moniker: "Validator A" },
              operator_address: "clawvaloper1aaaaaaaaaaaaaaaaaa",
              tokens: "5000000000",
              commission: { commission_rates: { rate: "0.05" } },
              status: "BOND_STATUS_BONDED",
            },
            {
              description: { moniker: "Validator B" },
              operator_address: "clawvaloper1bbbbbbbbbbbbbbbbbbb",
              tokens: "3000000000",
              commission: { commission_rates: { rate: "0.10" } },
              status: "BOND_STATUS_BONDED",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runQueryValidators({});

    const output = logs.join("\n");
    expect(output).toContain("Validators (2)");
    expect(output).toContain("Validator A");
    expect(output).toContain("Validator B");
    expect(output).toContain("5.0%");
    expect(output).toContain("10.0%");
    expect(output).toContain("Bonded");
  });

  it("shows message when no validators found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ validators: [] }),
    }) as unknown as typeof fetch;

    await runQueryValidators({});

    const output = logs.join("\n");
    expect(output).toContain("No bonded validators found.");
  });

  it("sorts validators by token count descending", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          validators: [
            {
              description: { moniker: "Small" },
              operator_address: "clawvaloper1small",
              tokens: "1000000",
              commission: { commission_rates: { rate: "0.05" } },
              status: "BOND_STATUS_BONDED",
            },
            {
              description: { moniker: "Large" },
              operator_address: "clawvaloper1large",
              tokens: "9999999000000",
              commission: { commission_rates: { rate: "0.02" } },
              status: "BOND_STATUS_BONDED",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runQueryValidators({});

    const output = logs.join("\n");
    // Large should appear with rank #1 before Small
    const largeIndex = output.indexOf("Large");
    const smallIndex = output.indexOf("Small");
    expect(largeIndex).toBeLessThan(smallIndex);
  });
});
