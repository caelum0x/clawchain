import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildStakeMsg,
  buildUnstakeMsg,
  buildClaimRewardsMsg,
  toBaseUnits,
  formatBaseUnits,
  formatRewardIndex,
  getVaultPoolInfo,
  getVaultStakeInfo,
} from "../model-vault.ts";

vi.mock("../chain.ts", () => ({
  queryWasmContract: vi.fn(),
}));

const chainMod = await import("../chain.ts");
const queryWasmContract = chainMod.queryWasmContract as ReturnType<typeof vi.fn>;

const VAULT = "claw1vault00000000000000000000000000000000000";
const MODEL_DENOM = "factory/claw1issuer/opus_4_8";

describe("model-vault message builders", () => {
  it("builds a snake_case stake{} msg with model_denom funds in base units", () => {
    const ex = buildStakeMsg(VAULT, MODEL_DENOM, "2.5");
    expect(ex.msg).toEqual({ stake: {} });
    expect(ex.contract).toBe(VAULT);
    expect(ex.funds).toEqual([{ denom: MODEL_DENOM, amount: "2500000" }]);
  });

  it("builds a snake_case unstake{amount} msg with no funds", () => {
    const ex = buildUnstakeMsg(VAULT, "1");
    expect(ex.msg).toEqual({ unstake: { amount: "1000000" } });
    expect(ex.funds).toEqual([]);
  });

  it("builds a snake_case claim_rewards{} msg with no funds", () => {
    const ex = buildClaimRewardsMsg(VAULT);
    expect(ex.msg).toEqual({ claim_rewards: {} });
    expect(ex.funds).toEqual([]);
  });

  it("rejects non-positive and invalid amounts", () => {
    expect(() => toBaseUnits("0")).toThrow(/greater than zero/);
    expect(() => toBaseUnits("-1")).toThrow();
    expect(() => toBaseUnits("")).toThrow(/required/);
    expect(() => toBaseUnits("abc")).toThrow(/number/);
    expect(() => buildStakeMsg(VAULT, MODEL_DENOM, "0")).toThrow(/greater than zero/);
    expect(() => buildUnstakeMsg(VAULT, "-5")).toThrow();
  });

  it("converts fractional amounts to 6-decimal base units", () => {
    expect(toBaseUnits("1")).toBe("1000000");
    expect(toBaseUnits("0.000001")).toBe("1");
    expect(toBaseUnits("123.456789")).toBe("123456789");
  });
});

describe("model-vault formatters", () => {
  it("formats base units back into a display amount", () => {
    expect(formatBaseUnits("2500000")).toBe("2.5");
    expect(formatBaseUnits("1000000")).toBe("1");
    expect(formatBaseUnits("0")).toBe("0");
    expect(formatBaseUnits("1")).toBe("0.000001");
  });

  it("formats the 1e18-scaled reward index into a human ratio", () => {
    // 0.5 * 1e18 -> "0.5"
    expect(formatRewardIndex("500000000000000000")).toBe("0.5");
    // 2 * 1e18 -> "2"
    expect(formatRewardIndex("2000000000000000000")).toBe("2");
    expect(formatRewardIndex("0")).toBe("0");
  });
});

describe("model-vault queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes pool_info response", async () => {
    queryWasmContract.mockResolvedValue({
      total_staked: "5000000",
      reward_per_token_stored: "1000000000000000000",
    });
    const info = await getVaultPoolInfo(VAULT);
    expect(queryWasmContract).toHaveBeenCalledWith(VAULT, { pool_info: {} });
    expect(info).toEqual({
      total_staked: "5000000",
      reward_per_token_stored: "1000000000000000000",
    });
  });

  it("normalizes stake_info response and passes the address", async () => {
    queryWasmContract.mockResolvedValue({ staked: "2000000", claimable: "750000" });
    const info = await getVaultStakeInfo(VAULT, "claw1user");
    expect(queryWasmContract).toHaveBeenCalledWith(VAULT, {
      stake_info: { address: "claw1user" },
    });
    expect(info).toEqual({ staked: "2000000", claimable: "750000" });
  });

  it("defaults missing fields to '0'", async () => {
    queryWasmContract.mockResolvedValue({});
    const info = await getVaultPoolInfo(VAULT);
    expect(info).toEqual({ total_staked: "0", reward_per_token_stored: "0" });
  });
});
