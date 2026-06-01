/**
 * Tests for `clawd model-vault` — the bonding-curve market + dividend pool wrapper
 * around the ModelVault CosmWasm contract (contracts/model-vault).
 *
 * The critical correctness property is MESSAGE SHAPE: CosmWasm #[cw_serde] serializes
 * enum variants as snake_case keys, so the JSON these builders emit must match the Rust
 * contract's msg.rs exactly (e.g. claim_rewards, distribute_revenue, stake_info, pool_info).
 * A camelCase key would be silently rejected on-chain, so we decode the encoded msg bytes
 * back to JSON and assert the exact object.
 */

import { fromUtf8 } from "@cosmjs/encoding";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSigningClient = {
  signAndBroadcast: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn(async () => ({
      getAccounts: vi.fn(async () => [
        { address: "claw1staker0000000000000000000000000000000000" },
      ]),
    })),
  },
}));

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-devnet",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test test test test test test test test test test test junk"),
  mnemonicFileExists: vi.fn(() => true),
}));

vi.mock("../../lib/signing.js", () => ({
  connectClawchainSigningClient: vi.fn(async () => mockSigningClient),
}));

import {
  buildBuyMsg,
  buildClaimRewardsMsg,
  buildConfigQuery,
  buildDistributeRevenueMsg,
  buildExecuteMsg,
  buildFundMsg,
  buildPoolInfoQuery,
  buildPoolQuery,
  buildQuoteQuery,
  buildSellMsg,
  buildStakeInfoQuery,
  buildStakeMsg,
  buildUnstakeMsg,
  runModelVaultClaim,
  runModelVaultPoolInfo,
  runModelVaultUnstake,
} from "../model-vault.js";

const SENDER = "claw1staker0000000000000000000000000000000000";
const CONTRACT = "claw1vault00000000000000000000000000000000000";
const EXECUTE_TYPE_URL = "/cosmwasm.wasm.v1.MsgExecuteContract";

/** Decode the `msg` field of an execute message back into its JSON object. */
function decodeMsg(execMsg: { value: { msg: Uint8Array } }): Record<string, unknown> {
  return JSON.parse(fromUtf8(execMsg.value.msg)) as Record<string, unknown>;
}

let logs: string[];
let errors: string[];

beforeEach(() => {
  logs = [];
  errors = [];
  mockSigningClient.signAndBroadcast.mockReset();
  mockSigningClient.disconnect.mockReset();
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("model-vault execute message builders", () => {
  it("wraps payloads in MsgExecuteContract with utf8-encoded snake_case JSON", () => {
    const msg = buildExecuteMsg(SENDER, CONTRACT, { fund: {} }, [{ denom: "uclaw", amount: "10" }]);
    expect(msg.typeUrl).toBe(EXECUTE_TYPE_URL);
    expect(msg.value.sender).toBe(SENDER);
    expect(msg.value.contract).toBe(CONTRACT);
    expect(msg.value.funds).toEqual([{ denom: "uclaw", amount: "10" }]);
    expect(decodeMsg(msg)).toEqual({ fund: {} });
  });

  it("builds fund/buy/sell/stake with the attached funds and bare variant keys", () => {
    const reserve = [{ denom: "uclaw", amount: "1000" }];
    const model = [{ denom: "factory/claw1issuer/opus", amount: "500" }];

    expect(decodeMsg(buildFundMsg(SENDER, CONTRACT, reserve))).toEqual({ fund: {} });
    expect(buildFundMsg(SENDER, CONTRACT, reserve).value.funds).toEqual(reserve);

    expect(decodeMsg(buildBuyMsg(SENDER, CONTRACT, reserve))).toEqual({ buy: {} });
    expect(buildBuyMsg(SENDER, CONTRACT, reserve).value.funds).toEqual(reserve);

    expect(decodeMsg(buildSellMsg(SENDER, CONTRACT, model))).toEqual({ sell: {} });
    expect(buildSellMsg(SENDER, CONTRACT, model).value.funds).toEqual(model);

    expect(decodeMsg(buildStakeMsg(SENDER, CONTRACT, model))).toEqual({ stake: {} });
    expect(buildStakeMsg(SENDER, CONTRACT, model).value.funds).toEqual(model);
  });

  it("builds unstake with a stringified Uint128 amount and no funds", () => {
    const msg = buildUnstakeMsg(SENDER, CONTRACT, "250");
    expect(decodeMsg(msg)).toEqual({ unstake: { amount: "250" } });
    expect(msg.value.funds).toEqual([]);
  });

  it("builds claim_rewards with the snake_case variant key", () => {
    const msg = buildClaimRewardsMsg(SENDER, CONTRACT);
    // Guards against the common camelCase regression (claimRewards) that the chain rejects.
    expect(decodeMsg(msg)).toEqual({ claim_rewards: {} });
    expect(msg.value.funds).toEqual([]);
  });

  it("builds distribute_revenue with attached reserve funds and snake_case key", () => {
    const reserve = [{ denom: "uclaw", amount: "777" }];
    const msg = buildDistributeRevenueMsg(SENDER, CONTRACT, reserve);
    expect(decodeMsg(msg)).toEqual({ distribute_revenue: {} });
    expect(msg.value.funds).toEqual(reserve);
  });
});

describe("model-vault query builders", () => {
  it("emits snake_case query objects matching msg.rs QueryMsg", () => {
    expect(buildConfigQuery()).toEqual({ config: {} });
    expect(buildPoolQuery()).toEqual({ pool: {} });
    expect(buildQuoteQuery("buy", "100")).toEqual({ quote: { side: "buy", amount: "100" } });
    expect(buildQuoteQuery("sell", "42")).toEqual({ quote: { side: "sell", amount: "42" } });
    expect(buildStakeInfoQuery("claw1abc")).toEqual({ stake_info: { address: "claw1abc" } });
    expect(buildPoolInfoQuery()).toEqual({ pool_info: {} });
  });
});

describe("model-vault execute runners", () => {
  it("runUnstake signs and broadcasts the unstake message", async () => {
    mockSigningClient.signAndBroadcast.mockResolvedValue({
      code: 0,
      transactionHash: "ABC123",
      rawLog: "",
    });

    await runModelVaultUnstake({ contract: CONTRACT, amount: "250", json: true });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(1);
    const [, msgs] = mockSigningClient.signAndBroadcast.mock.calls[0] as [
      string,
      Array<{ value: { msg: Uint8Array } }>,
    ];
    expect(decodeMsg(msgs[0])).toEqual({ unstake: { amount: "250" } });
    expect(mockSigningClient.disconnect).toHaveBeenCalled();
  });

  it("runClaim broadcasts claim_rewards and reports the tx hash", async () => {
    mockSigningClient.signAndBroadcast.mockResolvedValue({
      code: 0,
      transactionHash: "CLAIMTX",
      rawLog: "",
    });

    // json:false exercises the human-readable reporter, which logs the tx hash via console.log.
    await runModelVaultClaim({ contract: CONTRACT, json: false });

    const [, msgs] = mockSigningClient.signAndBroadcast.mock.calls[0] as [
      string,
      Array<{ value: { msg: Uint8Array } }>,
    ];
    expect(decodeMsg(msgs[0])).toEqual({ claim_rewards: {} });
    expect(logs.join("\n")).toContain("CLAIMTX");
  });

  it("exits non-zero when a tx is rejected by the chain", async () => {
    mockSigningClient.signAndBroadcast.mockResolvedValue({
      code: 5,
      transactionHash: "",
      rawLog: "insufficient stake",
    });

    await expect(runModelVaultUnstake({ contract: CONTRACT, amount: "1", json: true })).rejects.toThrow(
      "process.exit(1)",
    );
    expect(errors.join("\n")).toContain("Unstake");
  });

  it("rejects a non-positive amount before signing", async () => {
    await expect(runModelVaultUnstake({ contract: CONTRACT, amount: "0", json: true })).rejects.toThrow(
      /positive integer/,
    );
    expect(mockSigningClient.signAndBroadcast).not.toHaveBeenCalled();
  });
});

describe("model-vault query runners", () => {
  it("runPoolInfo issues a base64 smart query for {pool_info:{}}", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { total_staked: "1000", reward_per_token_stored: "0" } }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await runModelVaultPoolInfo({ contract: CONTRACT, json: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain(`/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/`);
    const base64 = url.split("/smart/")[1];
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    expect(decoded).toEqual({ pool_info: {} });
    // No signing happens for a query.
    expect(mockSigningClient.signAndBroadcast).not.toHaveBeenCalled();
  });
});
