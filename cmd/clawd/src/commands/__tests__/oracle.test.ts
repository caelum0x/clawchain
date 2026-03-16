/**
 * Tests for `clawd oracle` subcommands -- prices, history, params, feeder, miss.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips prevote/vote (they require signing client).
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
  runOracleHistory,
  runOracleParams,
  runOracleFeeder,
  runOracleMiss,
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
  it("displays price for a given pair", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          price: {
            denom_pair: "CLAW/USD",
            price: "1.250000",
            timestamp: "2026-03-17T00:00:00Z",
          },
        }),
    }) as unknown as typeof fetch;

    await runOraclePrice({ pair: "CLAW/USD" });

    const output = logs.join("\n");
    expect(output).toContain("Oracle Price: CLAW/USD");
    expect(output).toContain("1.250000");
  });

  it("calls correct endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          price: { denom_pair: "CLAW/USD", price: "1.0" },
        }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOraclePrice({ pair: "CLAW/USD" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1/price/CLAW%2FUSD");
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOraclePrice({ pair: "UNKNOWN/PAIR" });

    const output = logs.join("\n");
    expect(output).toContain('No price found for pair "UNKNOWN/PAIR"');
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
          price: {
            denom_pair: "CLAW/USD",
            price: "1.250000",
          },
        }),
    }) as unknown as typeof fetch;

    await runOraclePrice({ pair: "CLAW/USD", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.denom_pair).toBe("CLAW/USD");
    expect(parsed.price).toBe("1.250000");
  });
});

// ---------------------------------------------------------------------------
// runOraclePrices()
// ---------------------------------------------------------------------------

describe("runOraclePrices", () => {
  it("displays oracle prices table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          prices: [
            { denom_pair: "CLAW/USD", price: "1.25", timestamp: "2026-03-17T00:00:00Z" },
            { denom_pair: "CLAW/BTC", price: "0.000015", timestamp: "2026-03-17T00:00:00Z" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOraclePrices({});

    const output = logs.join("\n");
    expect(output).toContain("Oracle Prices");
    expect(output).toContain("CLAW/USD");
    expect(output).toContain("CLAW/BTC");
    expect(output).toContain("1.25");
  });

  it("shows message when no prices found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ prices: [] }),
    }) as unknown as typeof fetch;

    await runOraclePrices({});

    const output = logs.join("\n");
    expect(output).toContain("No oracle prices found.");
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
          prices: [
            { denom_pair: "CLAW/USD", price: "1.25" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOraclePrices({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.prices).toBeDefined();
    expect(parsed.prices).toHaveLength(1);
    expect(parsed.prices[0].denom_pair).toBe("CLAW/USD");
  });
});

// ---------------------------------------------------------------------------
// runOracleHistory()
// ---------------------------------------------------------------------------

describe("runOracleHistory", () => {
  it("displays price history table for a given pair", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          history: [
            { price: "1.20", timestamp: "2026-03-16T00:00:00Z", block_height: "100" },
            { price: "1.25", timestamp: "2026-03-17T00:00:00Z", block_height: "200" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runOracleHistory({ pair: "CLAW/USD" });

    const output = logs.join("\n");
    expect(output).toContain("Price History: CLAW/USD");
    expect(output).toContain("1.20");
    expect(output).toContain("1.25");
  });

  it("uses limit parameter in URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ history: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleHistory({ pair: "CLAW/USD", limit: 5 });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("limit=5");
  });

  it("defaults limit to 20 when not provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ history: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleHistory({ pair: "CLAW/USD" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("limit=20");
  });

  it("shows not found message on 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await runOracleHistory({ pair: "UNKNOWN/PAIR" });

    const output = logs.join("\n");
    expect(output).toContain('No price history found for pair "UNKNOWN/PAIR"');
  });

  it("shows empty history message when response has no entries", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ history: [] }),
    }) as unknown as typeof fetch;

    await runOracleHistory({ pair: "CLAW/USD" });

    const output = logs.join("\n");
    expect(output).toContain('No price history for "CLAW/USD"');
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
            admin: "claw1admin_address",
            max_age_seconds: "300",
            allowed_denoms: ["CLAW/USD", "CLAW/BTC"],
          },
        }),
    }) as unknown as typeof fetch;

    await runOracleParams({});

    const output = logs.join("\n");
    expect(output).toContain("Oracle Parameters");
    expect(output).toContain("admin");
    expect(output).toContain("claw1admin_address");
    expect(output).toContain("max_age_seconds");
  });

  it("calls correct endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ params: {} }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleParams({});

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1/params");
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
            admin: "claw1admin",
            max_age_seconds: "300",
          },
        }),
    }) as unknown as typeof fetch;

    await runOracleParams({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.admin).toBe("claw1admin");
    expect(parsed.max_age_seconds).toBe("300");
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
          feeder_address: "claw1feeder_address",
        }),
    }) as unknown as typeof fetch;

    await runOracleFeeder({ validator: "clawvaloper1abc" });

    const output = logs.join("\n");
    expect(output).toContain("Feeder Delegation");
    expect(output).toContain("clawvaloper1abc");
    expect(output).toContain("claw1feeder_address");
  });

  it("calls correct endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feeder_address: "claw1test" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleFeeder({ validator: "clawvaloper1abc" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1/feeder/clawvaloper1abc");
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

  it("calls correct endpoint URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ miss_counter: "0" }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runOracleMiss({ validator: "clawvaloper1abc" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/clawchain/oracle/v1/miss/clawvaloper1abc");
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
