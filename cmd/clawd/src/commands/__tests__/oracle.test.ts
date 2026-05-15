/**
 * Tests for `clawd oracle` subcommands -- Terra-forked oracle REST queries.
 *
 * Tests read-only query commands by mocking fetch against v1beta1 endpoints.
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

import {
  runOraclePrice,
  runOraclePrices,
  runOracleActives,
  runOracleVoteTargets,
  runOracleParams,
  runOracleFeeder,
  runOracleMiss,
  runOraclePrevote,
  runOraclePrevotes,
  runOracleVote,
  runOracleVotes,
  runOracleTobinTax,
  runOracleTobinTaxes,
} from "../oracle.js";

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
// runOraclePrice()
// ---------------------------------------------------------------------------

describe("runOraclePrice", () => {
  it("displays exchange rate for a given denom", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          exchange_rate: "1.250000",
        }),
    }) as unknown as typeof fetch;

    await runOraclePrice({ denom: "uusd" });

    const output = logs.join("\n");
    expect(output).toContain("Exchange Rate");
    expect(output).toContain("uusd");
    expect(output).toContain("1.250000");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          exchange_rate: "1.0",
        }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOraclePrice({ denom: "uusd" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/denoms/uusd/exchange_rate");
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOraclePrice({ denom: "unknown" });

    const output = logs.join("\n");
    expect(output).toContain('No exchange rate found for denom "unknown"');
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
          exchange_rate: "1.250000",
        }),
    }) as unknown as typeof fetch;

    await runOraclePrice({ denom: "uusd", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.exchange_rate).toBe("1.250000");
  });
});

// ---------------------------------------------------------------------------
// runOraclePrices()
// ---------------------------------------------------------------------------

describe("runOraclePrices", () => {
  it("displays exchange rates table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          exchange_rates: [
            { denom: "uusd", exchange_rate: "1.25" },
            { denom: "ukrw", exchange_rate: "1350.00" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOraclePrices({});

    const output = logs.join("\n");
    expect(output).toContain("Exchange Rates");
    expect(output).toContain("uusd");
    expect(output).toContain("ukrw");
    expect(output).toContain("1.25");
  });

  it("shows message when no exchange rates found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ exchange_rates: [] }),
    }) as unknown as typeof fetch;

    await runOraclePrices({});

    const output = logs.join("\n");
    expect(output).toContain("No exchange rates found.");
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
          exchange_rates: [
            { denom: "uusd", exchange_rate: "1.25" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOraclePrices({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.exchange_rates).toBeDefined();
    expect(parsed.exchange_rates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// runOracleActives()
// ---------------------------------------------------------------------------

describe("runOracleActives", () => {
  it("displays active denom list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          actives: ["uusd", "ukrw", "usdr"],
        }),
    }) as unknown as typeof fetch;

    await runOracleActives({});

    const output = logs.join("\n");
    expect(output).toContain("Active Denoms");
    expect(output).toContain("uusd");
    expect(output).toContain("ukrw");
  });

  it("shows message when no active denoms", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actives: [] }),
    }) as unknown as typeof fetch;

    await runOracleActives({});

    const output = logs.join("\n");
    expect(output).toContain("No active denoms.");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ actives: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleActives({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/denoms/actives");
  });
});

// ---------------------------------------------------------------------------
// runOracleVoteTargets()
// ---------------------------------------------------------------------------

describe("runOracleVoteTargets", () => {
  it("displays vote target list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          vote_targets: ["uusd", "ukrw"],
        }),
    }) as unknown as typeof fetch;

    await runOracleVoteTargets({});

    const output = logs.join("\n");
    expect(output).toContain("Vote Targets");
    expect(output).toContain("uusd");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vote_targets: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleVoteTargets({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/denoms/vote_targets");
  });
});

// ---------------------------------------------------------------------------
// runOracleParams()
// ---------------------------------------------------------------------------

describe("runOracleParams", () => {
  it("displays oracle parameters", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          params: {
            vote_period: "5",
            vote_threshold: "0.500000",
            reward_band: "0.020000",
            whitelist: [{ name: "uusd", tobin_tax: "0.0025" }],
          },
        }),
    }) as unknown as typeof fetch;

    await runOracleParams({});

    const output = logs.join("\n");
    expect(output).toContain("Oracle Parameters");
    expect(output).toContain("vote_period");
    expect(output).toContain("vote_threshold");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ params: {} }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleParams({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/params");
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
          params: {
            vote_period: "5",
            vote_threshold: "0.500000",
          },
        }),
    }) as unknown as typeof fetch;

    await runOracleParams({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.vote_period).toBe("5");
  });
});

// ---------------------------------------------------------------------------
// runOracleFeeder()
// ---------------------------------------------------------------------------

describe("runOracleFeeder", () => {
  it("displays feeder delegation for a validator", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          feeder_addr: "claw1feeder_address",
        }),
    }) as unknown as typeof fetch;

    await runOracleFeeder({ validator: "clawvaloper1abc" });

    const output = logs.join("\n");
    expect(output).toContain("Feeder Delegation");
    expect(output).toContain("clawvaloper1abc");
    expect(output).toContain("claw1feeder_address");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feeder_addr: "claw1test" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleFeeder({ validator: "clawvaloper1abc" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/validators/clawvaloper1abc/feeder");
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOracleFeeder({ validator: "clawvaloper1unknown" });

    const output = logs.join("\n");
    expect(output).toContain('No feeder delegation found for validator "clawvaloper1unknown"');
  });
});

// ---------------------------------------------------------------------------
// runOracleMiss()
// ---------------------------------------------------------------------------

describe("runOracleMiss", () => {
  it("displays miss counter for a validator", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          miss_counter: "42",
        }),
    }) as unknown as typeof fetch;

    await runOracleMiss({ validator: "clawvaloper1abc" });

    const output = logs.join("\n");
    expect(output).toContain("Oracle Miss Counter");
    expect(output).toContain("clawvaloper1abc");
    expect(output).toContain("42");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ miss_counter: "0" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleMiss({ validator: "clawvaloper1abc" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/validators/clawvaloper1abc/miss");
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOracleMiss({ validator: "clawvaloper1unknown" });

    const output = logs.join("\n");
    expect(output).toContain('No miss counter found for validator "clawvaloper1unknown"');
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
          miss_counter: "42",
        }),
    }) as unknown as typeof fetch;

    await runOracleMiss({ validator: "clawvaloper1abc", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.miss_counter).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// runOraclePrevote()
// ---------------------------------------------------------------------------

describe("runOraclePrevote", () => {
  it("displays aggregate prevote for a validator", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aggregate_prevote: {
            hash: "abc123",
            voter: "clawvaloper1abc",
            submit_block: "1000",
          },
        }),
    }) as unknown as typeof fetch;

    await runOraclePrevote({ validator: "clawvaloper1abc" });

    const output = logs.join("\n");
    expect(output).toContain("Aggregate Prevote");
    expect(output).toContain("abc123");
    expect(output).toContain("clawvaloper1abc");
    expect(output).toContain("1000");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aggregate_prevote: { hash: "abc", voter: "v1", submit_block: "1" },
        }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOraclePrevote({ validator: "clawvaloper1abc" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain(
      "/clawchain/oracle/v1beta1/validators/clawvaloper1abc/aggregate_prevote",
    );
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOraclePrevote({ validator: "clawvaloper1unknown" });

    const output = logs.join("\n");
    expect(output).toContain('No aggregate prevote found for validator "clawvaloper1unknown"');
  });
});

// ---------------------------------------------------------------------------
// runOraclePrevotes()
// ---------------------------------------------------------------------------

describe("runOraclePrevotes", () => {
  it("displays all aggregate prevotes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aggregate_prevotes: [
            { hash: "abc", voter: "clawvaloper1a", submit_block: "100" },
            { hash: "def", voter: "clawvaloper1b", submit_block: "101" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOraclePrevotes({});

    const output = logs.join("\n");
    expect(output).toContain("Aggregate Prevotes");
    expect(output).toContain("clawvaloper1a");
    expect(output).toContain("clawvaloper1b");
  });

  it("shows message when no prevotes found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ aggregate_prevotes: [] }),
    }) as unknown as typeof fetch;

    await runOraclePrevotes({});

    const output = logs.join("\n");
    expect(output).toContain("No aggregate prevotes found.");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ aggregate_prevotes: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOraclePrevotes({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/validators/aggregate_prevotes");
  });
});

// ---------------------------------------------------------------------------
// runOracleVote()
// ---------------------------------------------------------------------------

describe("runOracleVote", () => {
  it("displays aggregate vote for a validator", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aggregate_vote: {
            exchange_rate_tuples: [
              { denom: "uusd", exchange_rate: "1.25" },
            ],
            voter: "clawvaloper1abc",
          },
        }),
    }) as unknown as typeof fetch;

    await runOracleVote({ validator: "clawvaloper1abc" });

    const output = logs.join("\n");
    expect(output).toContain("Aggregate Vote");
    expect(output).toContain("clawvaloper1abc");
    expect(output).toContain("uusd");
    expect(output).toContain("1.25");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aggregate_vote: { exchange_rate_tuples: [], voter: "v1" },
        }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleVote({ validator: "clawvaloper1abc" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain(
      "/clawchain/oracle/v1beta1/validators/clawvaloper1abc/aggregate_vote",
    );
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOracleVote({ validator: "clawvaloper1unknown" });

    const output = logs.join("\n");
    expect(output).toContain('No aggregate vote found for validator "clawvaloper1unknown"');
  });
});

// ---------------------------------------------------------------------------
// runOracleVotes()
// ---------------------------------------------------------------------------

describe("runOracleVotes", () => {
  it("displays all aggregate votes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          aggregate_votes: [
            {
              exchange_rate_tuples: [{ denom: "uusd", exchange_rate: "1.25" }],
              voter: "clawvaloper1a",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOracleVotes({});

    const output = logs.join("\n");
    expect(output).toContain("clawvaloper1a");
    expect(output).toContain("uusd");
  });

  it("shows message when no votes found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ aggregate_votes: [] }),
    }) as unknown as typeof fetch;

    await runOracleVotes({});

    const output = logs.join("\n");
    expect(output).toContain("No aggregate votes found.");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ aggregate_votes: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleVotes({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/validators/aggregate_votes");
  });
});

// ---------------------------------------------------------------------------
// runOracleTobinTax()
// ---------------------------------------------------------------------------

describe("runOracleTobinTax", () => {
  it("displays tobin tax for a denom", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tobin_tax: "0.002500",
        }),
    }) as unknown as typeof fetch;

    await runOracleTobinTax({ denom: "uusd" });

    const output = logs.join("\n");
    expect(output).toContain("Tobin Tax");
    expect(output).toContain("uusd");
    expect(output).toContain("0.002500");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tobin_tax: "0.0025" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleTobinTax({ denom: "uusd" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/denoms/uusd/tobin_tax");
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOracleTobinTax({ denom: "unknown" });

    const output = logs.join("\n");
    expect(output).toContain('No tobin tax found for denom "unknown"');
  });
});

// ---------------------------------------------------------------------------
// runOracleTobinTaxes()
// ---------------------------------------------------------------------------

describe("runOracleTobinTaxes", () => {
  it("displays all tobin taxes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          tobin_taxes: [
            { denom: "uusd", tobin_tax: "0.0025" },
            { denom: "ukrw", tobin_tax: "0.0050" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOracleTobinTaxes({});

    const output = logs.join("\n");
    expect(output).toContain("Tobin Taxes");
    expect(output).toContain("uusd");
    expect(output).toContain("ukrw");
  });

  it("shows message when no tobin taxes found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tobin_taxes: [] }),
    }) as unknown as typeof fetch;

    await runOracleTobinTaxes({});

    const output = logs.join("\n");
    expect(output).toContain("No tobin taxes found.");
  });

  it("calls correct v1beta1 endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tobin_taxes: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleTobinTaxes({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1beta1/denoms/tobin_taxes");
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
          tobin_taxes: [
            { denom: "uusd", tobin_tax: "0.0025" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOracleTobinTaxes({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.tobin_taxes).toBeDefined();
    expect(parsed.tobin_taxes).toHaveLength(1);
  });
});
