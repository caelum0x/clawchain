import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  joinModelTokens,
  normalizeModelTokenSubdenom,
  modelTokenDenom,
  formatTokenSupply,
  getDenomSupply,
} from "../model-tokens";
import type { ModelRecord } from "../chain";

vi.mock("../config", () => ({
  chainConfig: {
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
    coinMinimalDenom: "uclaw",
  },
}));

function model(overrides: Partial<ModelRecord>): ModelRecord {
  return {
    id: "1",
    owner: "claw1issuer000000000000000000000000000000000",
    name: "Opus 4.8",
    description: "Anthropic Claude Opus 4.8",
    framework: "openrouter",
    architecture: "Transformer",
    parameterCount: "",
    license: "proprietary",
    tags: ["llm"],
    storageType: "openrouter",
    storageUri: "openrouter:anthropic/claude-opus-4.8",
    checksumSha256: "",
    sizeBytes: 0,
    accessType: "per_query",
    pricePerQueryUclaw: "0",
    priceOneTimeUclaw: "0",
    active: true,
    currentVersion: 1,
    totalDownloads: 0,
    totalRevenue: "0",
    rating: 0,
    ratingCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("normalizeModelTokenSubdenom", () => {
  it("lowercases and replaces unsafe characters with underscores", () => {
    expect(normalizeModelTokenSubdenom("Opus 4.8")).toBe("opus_4_8");
    expect(normalizeModelTokenSubdenom("Qwen3.7 Max")).toBe("qwen3_7_max");
  });

  it("preserves slashes and underscores and trims edges", () => {
    expect(normalizeModelTokenSubdenom("anthropic/claude-opus-4.8")).toBe(
      "anthropic/claude_opus_4_8",
    );
    expect(normalizeModelTokenSubdenom("__weird__")).toBe("weird");
  });
});

describe("modelTokenDenom", () => {
  it("builds factory/<issuer>/<subdenom>", () => {
    expect(modelTokenDenom("claw1abc", "Opus 4.8")).toBe("factory/claw1abc/opus_4_8");
  });
});

describe("formatTokenSupply", () => {
  it("formats base units with 6 decimals", () => {
    expect(formatTokenSupply("1000000")).toBe("1");
    expect(formatTokenSupply("1500000")).toBe("1.5");
    expect(formatTokenSupply("0")).toBe("0");
  });
});

describe("getDenomSupply", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses the bank supply/by_denom response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ amount: { denom: "factory/x/opus_4_8", amount: "1000000" } }),
      }),
    );
    const res = await getDenomSupply("factory/x/opus_4_8");
    expect(res.amount).toBe("1000000");
    expect(res.found).toBe(true);
  });

  it("returns not-found on error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "no" }));
    const res = await getDenomSupply("factory/x/missing");
    expect(res.amount).toBe("0");
    expect(res.found).toBe(false);
  });
});

describe("joinModelTokens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("joins a model with its tokenfactory supply into a model token view", async () => {
    // First call: bank supply/by_denom for the derived denom.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/supply/by_denom")) {
          return {
            ok: true,
            json: async () => ({
              amount: {
                denom: "factory/claw1issuer000000000000000000000000000000000/opus_4_8",
                amount: "5000000",
              },
            }),
          };
        }
        return { ok: false, status: 404, text: async () => "nope" };
      }),
    );

    const tokens = await joinModelTokens([model({})], false);
    expect(tokens).toHaveLength(1);
    const t = tokens[0];
    expect(t.modelId).toBe("1");
    expect(t.issuer).toBe("claw1issuer000000000000000000000000000000000");
    expect(t.subdenom).toBe("opus_4_8");
    expect(t.denom).toBe(
      "factory/claw1issuer000000000000000000000000000000000/opus_4_8",
    );
    expect(t.symbol).toBe("OPUS_4_8");
    expect(t.supply).toBe("5000000");
    expect(t.hasToken).toBe(true);
    expect(t.priceClaw).toBeNull();
    expect(t.poolAddress).toBeNull();
  });

  it("marks models without minted supply as not issued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ amount: { denom: "factory/x/qwen3_7_max", amount: "0" } }),
      }),
    );

    const tokens = await joinModelTokens(
      [model({ id: "2", name: "Qwen3.7 Max", owner: "claw1qwen" })],
      false,
    );
    expect(tokens[0].hasToken).toBe(false);
    expect(tokens[0].supply).toBe("0");
    expect(tokens[0].subdenom).toBe("qwen3_7_max");
  });

  it("derives a CLAW price from a matching DEX pool when withPrice is set", async () => {
    const denom = "factory/claw1issuer000000000000000000000000000000000/opus_4_8";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/supply/by_denom")) {
          return {
            ok: true,
            json: async () => ({ amount: { denom, amount: "10000000" } }),
          };
        }
        if (url.includes("/cosmwasm/wasm/v1/code?")) {
          return { ok: true, json: async () => ({ code_infos: [{ code_id: "1" }] }) };
        }
        if (url.includes("/code/1/contracts")) {
          return { ok: true, json: async () => ({ contracts: ["claw1pool"] }) };
        }
        if (url.includes("/contract/claw1pool/smart/")) {
          return {
            ok: true,
            json: async () => ({
              data: {
                assets: [
                  { info: { native_token: { denom } }, amount: "10000" },
                  { info: { native_token: { denom: "uclaw" } }, amount: "20000" },
                ],
              },
            }),
          };
        }
        return { ok: false, status: 404, text: async () => "nope" };
      }),
    );

    const tokens = await joinModelTokens([model({})], true);
    expect(tokens[0].priceClaw).toBeCloseTo(2, 6); // 20000 claw / 10000 token
    expect(tokens[0].poolAddress).toBe("claw1pool");
  });
});
