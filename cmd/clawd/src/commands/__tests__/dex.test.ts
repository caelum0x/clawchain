/**
 * Tests for `clawd dex` subcommands — pairs, pool, simulate, config.
 *
 * Mocks fetch for CosmWasm smart-query REST calls (base64-encoded JSON)
 * and config helpers for persistent DEX configuration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockWriteClawdConfig = vi.fn();
let mockConfigState: Record<string, unknown> = {};

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
    ...mockConfigState,
  })),
  writeClawdConfig: (...args: unknown[]) => mockWriteClawdConfig(...args),
}));

import {
  runDexPairs,
  runDexPool,
  runDexSimulate,
  runDexConfig,
} from "../dex.js";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let logs: string[];
let errors: string[];
let originalFetch: typeof globalThis.fetch;
let exitSpy: ReturnType<typeof vi.spyOn>;

/**
 * Build a mock fetch response for a CosmWasm smart-query endpoint.
 * The real chain wraps the contract response in `{ data: <response> }`.
 */
function smartQueryResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve({ data }),
  };
}

beforeEach(() => {
  logs = [];
  errors = [];
  mockConfigState = {};
  mockWriteClawdConfig.mockClear();

  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });

  originalFetch = globalThis.fetch;

  // Mock process.exit to prevent killing the test runner.
  // Throw a sentinel error so execution stops at the exit call.
  exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((_code?: string | number | null | undefined) => {
      throw new Error(`process.exit(${_code})`);
    }) as unknown as ReturnType<typeof vi.spyOn>;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runDexPairs()
// ---------------------------------------------------------------------------

describe("runDexPairs", () => {
  it("displays pairs table from factory smart query", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        pairs: [
          {
            contract_addr: "claw1paircontract1234567890abcdef",
            asset_infos: [
              { native_token: { denom: "uclaw" } },
              { native_token: { denom: "uatom" } },
            ],
            liquidity_token: "claw1lptoken1234567890abcdefghij",
          },
          {
            contract_addr: "claw1paircontract9876543210fedcba",
            asset_infos: [
              { native_token: { denom: "uclaw" } },
              { token: { contract_addr: "claw1cw20token1234567890abcdef" } },
            ],
            liquidity_token: "claw1lptoken9876543210fedcbazyxw",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    await runDexPairs({ factory: "claw1factory123" });

    const output = logs.join("\n");
    expect(output).toContain("DEX Trading Pools");
    expect(output).toContain("uclaw");
    expect(output).toContain("uatom");
    // CW20 token address should be shortened via shortAddr
    expect(output).toContain("claw1cw20t...bcdef");
  });

  it("shows message when no pairs found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({ pairs: [] }),
    ) as unknown as typeof fetch;

    await runDexPairs({ factory: "claw1factory123" });

    const output = logs.join("\n");
    expect(output).toContain("No trading pools found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        pairs: [
          {
            contract_addr: "claw1pair",
            asset_infos: [
              { native_token: { denom: "uclaw" } },
              { native_token: { denom: "uatom" } },
            ],
            liquidity_token: "claw1lp",
          },
        ],
      }),
    ) as unknown as typeof fetch;

    await runDexPairs({ factory: "claw1factory123", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.pools).toHaveLength(1);
    expect(parsed.pools[0].contract_addr).toBe("claw1pair");
  });

  it("errors when --factory is missing", async () => {
    await expect(
      runDexPairs({ factory: "" }),
    ).rejects.toThrow("process.exit(1)");

    const errOutput = errors.join("\n");
    expect(errOutput).toContain("--factory <address> is required");
  });

  it("sends correct smart query with limit parameter", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      smartQueryResponse({ pairs: [] }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runDexPairs({ factory: "claw1factory123", limit: "5" });

    // Verify the base64-encoded query contains limit
    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/cosmwasm/wasm/v1/contract/");
    expect(calledUrl).toContain("claw1factory123");

    // Decode the base64 query from the URL
    const base64Part = calledUrl.split("/smart/")[1];
    const decoded = JSON.parse(Buffer.from(base64Part, "base64").toString());
    expect(decoded.pairs.limit).toBe(5);
  });

  it("exits on HTTP error from factory query", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal error"),
    }) as unknown as typeof fetch;

    await expect(
      runDexPairs({ factory: "claw1factory123" }),
    ).rejects.toThrow("process.exit(1)");

    const errOutput = errors.join("\n");
    expect(errOutput).toContain("Failed to query DEX pools");
  });
});

// ---------------------------------------------------------------------------
// runDexPool()
// ---------------------------------------------------------------------------

describe("runDexPool", () => {
  it("displays pool state with native assets", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        assets: [
          { info: { native_token: { denom: "uclaw" } }, amount: "5000000000" },
          { info: { native_token: { denom: "uatom" } }, amount: "1200000000" },
        ],
        total_share: "2400000000",
      }),
    ) as unknown as typeof fetch;

    await runDexPool({ pairAddr: "claw1pair123" });

    const output = logs.join("\n");
    expect(output).toContain("Pool Details: claw1pair123");
    expect(output).toContain("uclaw");
    expect(output).toContain("5000000000");
    expect(output).toContain("uatom");
    expect(output).toContain("1200000000");
    expect(output).toContain("LP Token Supply: 2400000000");
  });

  it("displays pool state with CW20 token asset", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        assets: [
          { info: { native_token: { denom: "uclaw" } }, amount: "100" },
          {
            info: { token: { contract_addr: "claw1cw20contract1234567890" } },
            amount: "200",
          },
        ],
        total_share: "150",
      }),
    ) as unknown as typeof fetch;

    await runDexPool({ pairAddr: "claw1pair123" });

    const output = logs.join("\n");
    expect(output).toContain("uclaw");
    // CW20 contract addr should be shortened
    expect(output).toContain("claw1cw20c...67890");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    const poolData = {
      assets: [
        { info: { native_token: { denom: "uclaw" } }, amount: "100" },
      ],
      total_share: "50",
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse(poolData),
    ) as unknown as typeof fetch;

    await runDexPool({ pairAddr: "claw1pair123", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.total_share).toBe("50");
  });

  it("handles empty assets array gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({ assets: [], total_share: "0" }),
    ) as unknown as typeof fetch;

    await runDexPool({ pairAddr: "claw1pair123" });

    const output = logs.join("\n");
    expect(output).toContain("Pool Details: claw1pair123");
    expect(output).toContain("LP Token Supply: 0");
    // No asset lines should be present
    // With empty assets, no individual asset lines should appear
    expect(output).not.toContain("Asset 1");
  });

  it("exits on HTTP error from pool query", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("not found"),
    }) as unknown as typeof fetch;

    await expect(
      runDexPool({ pairAddr: "claw1pair123" }),
    ).rejects.toThrow("process.exit(1)");

    const errOutput = errors.join("\n");
    expect(errOutput).toContain("Failed to query pool state");
  });
});

// ---------------------------------------------------------------------------
// runDexSimulate()
// ---------------------------------------------------------------------------

describe("runDexSimulate", () => {
  it("displays forward simulation result for native token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        return_amount: "4900000",
        spread_amount: "50000",
        commission_amount: "50000",
      }),
    ) as unknown as typeof fetch;

    await runDexSimulate({
      pairAddr: "claw1pair123",
      offerDenom: "uclaw",
      offerAmount: "5000000",
    });

    const output = logs.join("\n");
    expect(output).toContain("Swap Simulation (forward)");
    expect(output).toContain("Pair:       claw1pair123");
    expect(output).toContain("Offer:      5000000 uclaw");
    expect(output).toContain("Return Amount:         4900000");
    expect(output).toContain("Spread Amount:         50000");
    expect(output).toContain("Commission Amount:     50000");
  });

  it("sends correct forward simulation smart query", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      smartQueryResponse({
        return_amount: "100",
        spread_amount: "1",
        commission_amount: "1",
      }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runDexSimulate({
      pairAddr: "claw1pair123",
      offerDenom: "uclaw",
      offerAmount: "1000",
    });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    const base64Part = calledUrl.split("/smart/")[1];
    const decoded = JSON.parse(Buffer.from(base64Part, "base64").toString());
    expect(decoded.simulation).toBeDefined();
    expect(decoded.simulation.offer_asset.info.native_token.denom).toBe("uclaw");
    expect(decoded.simulation.offer_asset.amount).toBe("1000");
  });

  it("displays reverse simulation result", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        offer_amount: "5100000",
        spread_amount: "50000",
        commission_amount: "50000",
      }),
    ) as unknown as typeof fetch;

    await runDexSimulate({
      pairAddr: "claw1pair123",
      offerDenom: "uclaw",
      offerAmount: "5000000",
      reverse: true,
    });

    const output = logs.join("\n");
    expect(output).toContain("Swap Simulation (reverse)");
    expect(output).toContain("Required Offer Amount: 5100000");
    expect(output).toContain("Spread Amount:         50000");
    expect(output).toContain("Commission Amount:     50000");
  });

  it("sends correct reverse simulation smart query", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      smartQueryResponse({
        offer_amount: "100",
        spread_amount: "1",
        commission_amount: "1",
      }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runDexSimulate({
      pairAddr: "claw1pair123",
      offerDenom: "uatom",
      offerAmount: "500",
      reverse: true,
    });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    const base64Part = calledUrl.split("/smart/")[1];
    const decoded = JSON.parse(Buffer.from(base64Part, "base64").toString());
    expect(decoded.reverse_simulation).toBeDefined();
    expect(decoded.reverse_simulation.ask_asset.info.native_token.denom).toBe("uatom");
    expect(decoded.reverse_simulation.ask_asset.amount).toBe("500");
  });

  it("uses CW20 token info when --offer-contract is provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      smartQueryResponse({
        return_amount: "9900",
        spread_amount: "50",
        commission_amount: "50",
      }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runDexSimulate({
      pairAddr: "claw1pair123",
      offerDenom: "ignored-when-contract-set",
      offerAmount: "10000",
      offerContract: "claw1cw20token1234567890abcdef",
    });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    const base64Part = calledUrl.split("/smart/")[1];
    const decoded = JSON.parse(Buffer.from(base64Part, "base64").toString());
    expect(decoded.simulation.offer_asset.info.token.contract_addr).toBe(
      "claw1cw20token1234567890abcdef",
    );

    const output = logs.join("\n");
    // CW20 contract addr in offer display should be shortened
    expect(output).toContain("claw1cw20t...bcdef");
  });

  it("outputs JSON when --json flag is set (forward)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        return_amount: "4900000",
        spread_amount: "50000",
        commission_amount: "50000",
      }),
    ) as unknown as typeof fetch;

    await runDexSimulate({
      pairAddr: "claw1pair123",
      offerDenom: "uclaw",
      offerAmount: "5000000",
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.return_amount).toBe("4900000");
    expect(parsed.spread_amount).toBe("50000");
    expect(parsed.commission_amount).toBe("50000");
  });

  it("outputs JSON when --json flag is set (reverse)", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        offer_amount: "5100000",
        spread_amount: "50000",
        commission_amount: "50000",
      }),
    ) as unknown as typeof fetch;

    await runDexSimulate({
      pairAddr: "claw1pair123",
      offerDenom: "uclaw",
      offerAmount: "5000000",
      reverse: true,
      json: true,
    });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.offer_amount).toBe("5100000");
  });

  it("exits on HTTP error from simulate query", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("contract error"),
    }) as unknown as typeof fetch;

    await expect(
      runDexSimulate({
        pairAddr: "claw1pair123",
        offerDenom: "uclaw",
        offerAmount: "1000",
      }),
    ).rejects.toThrow("process.exit(1)");

    const errOutput = errors.join("\n");
    expect(errOutput).toContain("Failed to simulate swap");
  });
});

// ---------------------------------------------------------------------------
// runDexConfig()
// ---------------------------------------------------------------------------

describe("runDexConfig", () => {
  it("saves factory and router addresses to config", async () => {
    // No router configured so the on-chain query won't fire
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("should not be called"),
    ) as unknown as typeof fetch;

    await runDexConfig({
      factory: "claw1factory_new",
      router: "claw1router_new",
    });

    expect(mockWriteClawdConfig).toHaveBeenCalledTimes(1);

    const savedConfig = mockWriteClawdConfig.mock.calls[0][0];
    expect(savedConfig.dex.factoryAddr).toBe("claw1factory_new");
    expect(savedConfig.dex.routerAddr).toBe("claw1router_new");

    const output = logs.join("\n");
    expect(output).toContain("DEX config saved.");
    expect(output).toContain("Factory: claw1factory_new");
    expect(output).toContain("Router:  claw1router_new");
  });

  it("shows current config when no flags provided", async () => {
    mockConfigState = {
      dex: {
        factoryAddr: "claw1existing_factory",
        routerAddr: "",
      },
    };

    await runDexConfig({});

    // Should not write config when nothing changed
    expect(mockWriteClawdConfig).not.toHaveBeenCalled();

    const output = logs.join("\n");
    expect(output).toContain("DEX Configuration");
    expect(output).toContain("Factory: claw1existing_factory");
    expect(output).toContain("Router:  (not set)");
  });

  it("shows (not set) when no dex config exists", async () => {
    await runDexConfig({});

    const output = logs.join("\n");
    expect(output).toContain("Factory: (not set)");
    expect(output).toContain("Router:  (not set)");
  });

  it("fetches router on-chain config when router is configured", async () => {
    mockConfigState = {
      dex: {
        factoryAddr: "claw1factory",
        routerAddr: "claw1router_configured",
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({
        astroport_factory: "claw1factory",
        max_hops: 3,
      }),
    ) as unknown as typeof fetch;

    await runDexConfig({});

    const output = logs.join("\n");
    expect(output).toContain("Router On-Chain Config:");
    expect(output).toContain("astroport_factory: claw1factory");
    expect(output).toContain("max_hops: 3");
  });

  it("gracefully handles router config query failure", async () => {
    mockConfigState = {
      dex: {
        factoryAddr: "claw1factory",
        routerAddr: "claw1router_broken",
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("internal error"),
    }) as unknown as typeof fetch;

    // Should not throw — router config is best-effort
    await runDexConfig({});

    const output = logs.join("\n");
    expect(output).toContain("DEX Configuration");
    expect(output).toContain("Router:  claw1router_broken");
    // On-chain config section should NOT appear on failure
    expect(output).not.toContain("Router On-Chain Config:");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    mockConfigState = {
      dex: {
        factoryAddr: "claw1factory",
        routerAddr: "claw1router",
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({ max_hops: 5 }),
    ) as unknown as typeof fetch;

    await runDexConfig({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.factory).toBe("claw1factory");
    expect(parsed.router).toBe("claw1router");
    expect(parsed.router_config).toEqual({ max_hops: 5 });
  });

  it("outputs JSON with null router_config when router query fails", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    mockConfigState = {
      dex: {
        factoryAddr: "claw1factory",
        routerAddr: "claw1router_broken",
      },
    };

    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("network error"),
    ) as unknown as typeof fetch;

    await runDexConfig({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.router_config).toBeNull();
  });

  it("outputs JSON with null factory/router when not configured", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runDexConfig({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.factory).toBeNull();
    expect(parsed.router).toBeNull();
    expect(parsed.router_config).toBeNull();
  });

  it("saves only factory when only --factory is provided", async () => {
    await runDexConfig({ factory: "claw1factory_only" });

    expect(mockWriteClawdConfig).toHaveBeenCalledTimes(1);
    const savedConfig = mockWriteClawdConfig.mock.calls[0][0];
    expect(savedConfig.dex.factoryAddr).toBe("claw1factory_only");

    const output = logs.join("\n");
    expect(output).toContain("DEX config saved.");
  });

  it("fetches router config after saving new router address", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      smartQueryResponse({ max_hops: 2 }),
    ) as unknown as typeof fetch;

    await runDexConfig({ router: "claw1new_router" });

    expect(mockWriteClawdConfig).toHaveBeenCalledTimes(1);
    const savedConfig = mockWriteClawdConfig.mock.calls[0][0];
    expect(savedConfig.dex.routerAddr).toBe("claw1new_router");

    const output = logs.join("\n");
    expect(output).toContain("DEX config saved.");
    expect(output).toContain("Router On-Chain Config:");
    expect(output).toContain("max_hops: 2");
  });
});
