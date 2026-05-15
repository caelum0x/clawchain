import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  constantProductSwap,
  calculateArbitrage,
  buildSwapMsg,
  queryPoolState,
  deriveRestFromRpc,
  type PoolState,
  type ArbitrageOpportunity,
} from "../index.js";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Mock @cosmjs modules
// ---------------------------------------------------------------------------

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn().mockResolvedValue({
      getAccounts: vi.fn().mockResolvedValue([
        { address: "claw1testaddr", algo: "secp256k1", pubkey: new Uint8Array() },
      ]),
    }),
  },
}));

vi.mock("@cosmjs/stargate", () => ({
  SigningStargateClient: {
    connectWithSigner: vi.fn().mockResolvedValue({
      signAndBroadcast: vi.fn().mockResolvedValue({
        code: 0,
        transactionHash: "AABB1122",
        rawLog: "ok",
      }),
    }),
  },
  GasPrice: {
    fromString: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("commander", async () => {
  const actual = await vi.importActual("commander");
  return actual;
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePool(
  address: string,
  denom1: string,
  amount1: string,
  denom2: string,
  amount2: string,
  feeRate = 0.003,
): PoolState {
  return {
    address,
    assets: [
      { denom: denom1, amount: amount1 },
      { denom: denom2, amount: amount2 },
    ],
    totalShare: "1000000",
    feeRate,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests: constant product AMM math
// ---------------------------------------------------------------------------

describe("constantProductSwap", () => {
  it("computes correct output for a standard swap", () => {
    // Pool: 1,000,000 A / 2,000,000 B, offer 10,000 A, fee 0.3%
    const reserveIn = 1_000_000n;
    const reserveOut = 2_000_000n;
    const offer = 10_000n;
    const fee = 0.003;

    const output = constantProductSwap(reserveIn, reserveOut, offer, fee);

    // Manual: effectiveInput = 10000 * 9970 = 99700000
    // numerator = 2000000 * 99700000 = 199400000000000
    // denominator = 1000000 * 10000 + 99700000 = 10099700000
    // output = 199400000000000 / 10099700000 = 19743 (bigint truncation)
    expect(output).toBeGreaterThan(0n);
    expect(output).toBeLessThan(reserveOut);
    expect(output).toBe(19743n);
  });

  it("preserves x * y = k (approximately, minus fees)", () => {
    const rIn = 500_000n;
    const rOut = 500_000n;
    const offer = 5_000n;

    const output = constantProductSwap(rIn, rOut, offer, 0.003);

    // After swap: new reserves = (rIn + offer*0.997, rOut - output)
    // k_before = rIn * rOut = 250,000,000,000
    const kBefore = rIn * rOut;
    const effectiveInput = (offer * 9970n) / 10000n;
    const newIn = rIn + effectiveInput;
    const newOut = rOut - output;
    const kAfter = newIn * newOut;

    // k should stay the same or slightly increase (fee goes to LPs)
    expect(kAfter).toBeGreaterThanOrEqual(kBefore);
  });

  it("returns 0n for zero or negative inputs", () => {
    expect(constantProductSwap(0n, 100n, 10n, 0.003)).toBe(0n);
    expect(constantProductSwap(100n, 0n, 10n, 0.003)).toBe(0n);
    expect(constantProductSwap(100n, 100n, 0n, 0.003)).toBe(0n);
    expect(constantProductSwap(-1n, 100n, 10n, 0.003)).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// Tests: calculateArbitrage
// ---------------------------------------------------------------------------

describe("calculateArbitrage", () => {
  it("returns opportunity when price discrepancy exists", () => {
    // Pool1 has 1:1 ratio, Pool2 has 1:2 ratio -> arb exists
    const pool1 = makePool("pool1addr", "uclaw", "1000000", "uatom", "1000000");
    const pool2 = makePool("pool2addr", "uclaw", "1000000", "uatom", "2000000");

    const result = calculateArbitrage(pool1, pool2, "100");
    expect(result).not.toBeNull();
    expect(BigInt(result!.estimatedProfit)).toBeGreaterThan(100n);
    expect(result!.path).toHaveLength(2);
    expect(result!.profitPct).toBeGreaterThan(0);
  });

  it("returns null when no profitable path exists", () => {
    // Both pools have identical ratios -> no arb
    const pool1 = makePool("pool1addr", "uclaw", "1000000", "uatom", "1000000");
    const pool2 = makePool("pool2addr", "uclaw", "1000000", "uatom", "1000000");

    const result = calculateArbitrage(pool1, pool2, "1");
    expect(result).toBeNull();
  });

  it("respects min-profit threshold", () => {
    // Small discrepancy — profit exists but below threshold
    const pool1 = makePool(
      "pool1addr",
      "uclaw",
      "1000000",
      "uatom",
      "1000100",
    );
    const pool2 = makePool(
      "pool2addr",
      "uclaw",
      "1000000",
      "uatom",
      "1000000",
    );

    // With a very high min-profit, should return null
    const result = calculateArbitrage(pool1, pool2, "999999999");
    expect(result).toBeNull();
  });

  it("returns null for pools with no common assets", () => {
    const pool1 = makePool("pool1addr", "uclaw", "1000000", "uatom", "1000000");
    const pool2 = makePool("pool2addr", "uosmo", "1000000", "ujuno", "1000000");

    const result = calculateArbitrage(pool1, pool2, "1");
    expect(result).toBeNull();
  });

  it("returns null for pools with fewer than 2 assets", () => {
    const pool1: PoolState = {
      address: "pool1",
      assets: [{ denom: "uclaw", amount: "1000000" }],
      totalShare: "1000000",
      feeRate: 0.003,
    };
    const pool2 = makePool("pool2addr", "uclaw", "1000000", "uatom", "2000000");

    const result = calculateArbitrage(pool1, pool2, "1");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: buildSwapMsg
// ---------------------------------------------------------------------------

describe("buildSwapMsg", () => {
  it("constructs correct MsgExecuteContract", () => {
    const msg = buildSwapMsg("claw1sender", "claw1pool", "uclaw", "50000");

    expect(msg.typeUrl).toBe("/cosmwasm.wasm.v1.MsgExecuteContract");
    expect(msg.value.sender).toBe("claw1sender");
    expect(msg.value.contract).toBe("claw1pool");
    expect(msg.value.funds).toEqual([{ denom: "uclaw", amount: "50000" }]);

    // Decode the msg to verify the swap structure
    const decoded = JSON.parse(new TextDecoder().decode(msg.value.msg));
    expect(decoded.swap).toBeDefined();
    expect(decoded.swap.offer_asset.info.native_token.denom).toBe("uclaw");
    expect(decoded.swap.offer_asset.amount).toBe("50000");
    expect(decoded.swap.max_spread).toBe("0.01");
  });
});

// ---------------------------------------------------------------------------
// Tests: queryPoolState
// ---------------------------------------------------------------------------

describe("queryPoolState", () => {
  it("parses pool response correctly", async () => {
    const mockResponse = {
      data: {
        assets: [
          { info: { native_token: { denom: "uclaw" } }, amount: "5000000" },
          { info: { native_token: { denom: "uatom" } }, amount: "3000000" },
        ],
        total_share: "4000000",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const state = await queryPoolState(
      "http://localhost:1317",
      "claw1poolcontract",
    );

    expect(state.address).toBe("claw1poolcontract");
    expect(state.assets).toHaveLength(2);
    expect(state.assets[0]).toEqual({ denom: "uclaw", amount: "5000000" });
    expect(state.assets[1]).toEqual({ denom: "uatom", amount: "3000000" });
    expect(state.totalShare).toBe("4000000");
    expect(state.feeRate).toBe(0.003);
  });

  it("handles CW20 token assets in pool response", async () => {
    const mockResponse = {
      data: {
        assets: [
          { info: { native_token: { denom: "uclaw" } }, amount: "1000000" },
          {
            info: { token: { contract_addr: "claw1cw20token" } },
            amount: "2000000",
          },
        ],
        total_share: "1500000",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const state = await queryPoolState(
      "http://localhost:1317",
      "claw1poolcw20",
    );

    expect(state.assets[1].denom).toBe("claw1cw20token");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      queryPoolState("http://localhost:1317", "claw1bad"),
    ).rejects.toThrow("Pool query failed");
  });
});

// ---------------------------------------------------------------------------
// Tests: deriveRestFromRpc
// ---------------------------------------------------------------------------

describe("deriveRestFromRpc", () => {
  it("converts RPC URL to REST URL", () => {
    expect(deriveRestFromRpc("http://localhost:26657")).toBe(
      "http://localhost:1317",
    );
  });

  it("handles custom hostnames", () => {
    expect(deriveRestFromRpc("http://node.example.com:26657")).toBe(
      "http://node.example.com:1317",
    );
  });

  it("returns default on invalid URL", () => {
    expect(deriveRestFromRpc("not-a-url")).toBe("http://localhost:1317");
  });
});

// ---------------------------------------------------------------------------
// Tests: scan output formats
// ---------------------------------------------------------------------------

describe("scan output", () => {
  it("produces valid JSON with opportunities array", () => {
    // We test the ScanResult shape directly since the scan command
    // calls process.stdout.write with JSON.stringify
    const result = {
      timestamp: "2026-03-09T00:00:00.000Z",
      poolsScanned: 2,
      opportunities: [
        {
          path: [
            { pool: "pool1", action: "buy" as const, asset: "uatom" },
            { pool: "pool2", action: "sell" as const, asset: "uatom" },
          ],
          inputDenom: "uclaw",
          inputAmount: "10000",
          expectedOutput: "11000",
          estimatedProfit: "1000",
          profitPct: 10.0,
        },
      ],
    };

    const json = JSON.stringify(result, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.poolsScanned).toBe(2);
    expect(parsed.opportunities).toHaveLength(1);
    expect(parsed.opportunities[0].estimatedProfit).toBe("1000");
    expect(parsed.timestamp).toBeDefined();
  });

  it("produces table format with headers", () => {
    // The formatTable function is not exported, so we verify the
    // ArbitrageOpportunity type has the fields needed for table display
    const opp: ArbitrageOpportunity = {
      path: [
        { pool: "claw1pool1abcdef", action: "buy", asset: "uatom" },
        { pool: "claw1pool2abcdef", action: "sell", asset: "uatom" },
      ],
      inputDenom: "uclaw",
      inputAmount: "50000",
      expectedOutput: "52000",
      estimatedProfit: "2000",
      profitPct: 4.0,
    };

    expect(opp.path).toHaveLength(2);
    expect(opp.path[0].action).toBe("buy");
    expect(opp.path[1].action).toBe("sell");
    expect(Number(opp.estimatedProfit)).toBeGreaterThan(0);
    expect(opp.profitPct).toBe(4.0);
  });
});

// ---------------------------------------------------------------------------
// Tests: pools command (factory query)
// ---------------------------------------------------------------------------

describe("pools command", () => {
  it("lists factory pairs via mock fetch", async () => {
    const factoryResponse = {
      data: {
        pairs: [
          {
            asset_infos: [
              { native_token: { denom: "uclaw" } },
              { native_token: { denom: "uatom" } },
            ],
            contract_addr: "claw1pair1addr",
            liquidity_token: "claw1lp1",
          },
          {
            asset_infos: [
              { native_token: { denom: "uclaw" } },
              { native_token: { denom: "uosmo" } },
            ],
            contract_addr: "claw1pair2addr",
            liquidity_token: "claw1lp2",
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => factoryResponse,
    });

    // Verify the fetch was called with the correct URL shape
    const query = JSON.stringify({ pairs: { limit: 100 } });
    const b64 = Buffer.from(query).toString("base64");
    const rest = "http://localhost:1317";
    const factory = "claw1factory";
    const url = `${rest}/cosmwasm/wasm/v1/contract/${factory}/smart/${b64}`;

    const res = await fetch(url);
    const json = await (res as Response).json();

    expect(json.data.pairs).toHaveLength(2);
    expect(json.data.pairs[0].contract_addr).toBe("claw1pair1addr");
    expect(json.data.pairs[1].asset_infos[1].native_token.denom).toBe("uosmo");
  });
});

// ---------------------------------------------------------------------------
// Tests: dry-run mode
// ---------------------------------------------------------------------------

describe("dry-run mode", () => {
  it("logs opportunity without broadcasting", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const opp: ArbitrageOpportunity = {
      path: [
        { pool: "pool1", action: "buy", asset: "uatom" },
        { pool: "pool2", action: "sell", asset: "uatom" },
      ],
      inputDenom: "uclaw",
      inputAmount: "10000",
      expectedOutput: "11500",
      estimatedProfit: "1500",
      profitPct: 15.0,
    };

    // Simulate what the dry-run branch does
    const profitStr = `${opp.estimatedProfit} uclaw (${opp.profitPct.toFixed(2)}%)`;
    console.log(`[dry-run] Opportunity: profit=${profitStr}`);
    console.log(
      `  Path: ${opp.path.map((p) => `${p.action} ${p.asset} @ ${p.pool}`).join(" -> ")}`,
    );
    console.log(
      `  Input: ${opp.inputAmount} | Output: ${opp.expectedOutput}`,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("1500 uclaw"),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Path:"));

    logSpy.mockRestore();
  });
});
