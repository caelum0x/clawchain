/**
 * Tests for `clawd model-token` P0 issuance.
 */

import { fromUtf8 } from "@cosmjs/encoding";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSigningClient = {
  signAndBroadcast: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn(async () => ({
      getAccounts: vi.fn(async () => [{ address: "claw1issuer00000000000000000000000000000000000" }]),
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
  buildBurnMsg,
  buildCompleteInferenceJobMsg,
  buildCreatePairExecuteMsg,
  buildMintMsg,
  buildProvideLiquidityExecuteMsg,
  buildRegisterInferenceProviderMsg,
  buildRegisterModelMsg,
  buildSetInferencePricingMsg,
  buildStartInferenceJobMsg,
  buildSubmitInferenceJobMsg,
  findEventAttribute,
  findModelTokenPreset,
  normalizeModelTokenSubdenom,
  runModelTokenCatalog,
  runModelTokenCompleteJob,
  runModelTokenInferenceSetup,
  runModelTokenIssue,
  runModelTokenRedeem,
  runModelTokenServeLoop,
  runModelTokenServeOnce,
  runModelTokenStartJob,
} from "../model-token.js";

let logs: string[];
let errors: string[];
let originalWrite: typeof process.stdout.write;

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
  originalWrite = process.stdout.write;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.stdout.write = originalWrite;
});

describe("model token message builders", () => {
  it("normalizes model slugs into tokenfactory subdenoms", () => {
    expect(normalizeModelTokenSubdenom("Claude Opus 4.6")).toBe("claude_opus_4_6");
    expect(normalizeModelTokenSubdenom("ignored", "OPUS46")).toBe("opus46");
  });

  it("exposes real OpenRouter model-token presets", () => {
    expect(findModelTokenPreset("claude-opus-4.8")).toMatchObject({
      openrouterModel: "anthropic/claude-opus-4.8",
      symbol: "claude_opus_4_8",
    });
    expect(findModelTokenPreset("qwen/qwen3.7-max")).toMatchObject({
      id: "qwen3.7-max",
      openrouterModel: "qwen/qwen3.7-max",
    });
  });

  it("builds current modelregistry and tokenfactory message shapes", () => {
    const register = buildRegisterModelMsg("claw1issuer", {
      model: "opus-4-6",
      supply: "1000",
      tags: "llm, opus",
      storageUri: "openrouter:anthropic/claude-opus-4.6",
    });
    expect(register.typeUrl).toBe("/clawchain.modelregistry.v1.MsgRegisterModel");
    expect(register.value.owner).toBe("claw1issuer");
    expect(register.value.framework).toBe("other");
    expect(register.value.accessType).toBe("per_query");
    expect(register.value.tags).toEqual(["llm", "opus"]);

    const mint = buildMintMsg("claw1issuer", "factory/claw1issuer/opus_4_6", "5000");
    expect(mint.typeUrl).toBe("/osmosis.tokenfactory.v1beta1.MsgMint");
    expect(mint.value.amount).toEqual({ denom: "factory/claw1issuer/opus_4_6", amount: "5000" });
    expect(mint.value.mintToAddress).toBe("claw1issuer");

    const burn = buildBurnMsg("claw1issuer", "factory/claw1issuer/opus_4_6", "25");
    expect(burn.typeUrl).toBe("/osmosis.tokenfactory.v1beta1.MsgBurn");
    expect(burn.value.amount).toEqual({ denom: "factory/claw1issuer/opus_4_6", amount: "25" });
    expect(burn.value.burnFromAddress).toBe("claw1issuer");
  });

  it("builds inference-job redemption messages", () => {
    const job = buildSubmitInferenceJobMsg("claw1issuer", {
      modelId: "7",
      modelVersion: "2",
      input: "Summarize this block.",
      maxTokens: "256",
      temperature: "0.2",
      paymentUclaw: "100",
    });
    expect(job.typeUrl).toBe("/clawchain.modelregistry.v1.MsgSubmitInferenceJob");
    expect(job.value).toEqual({
      requester: "claw1issuer",
      modelId: "7",
      modelVersion: "2",
      input: "Summarize this block.",
      maxTokens: "256",
      temperature: "0.2",
      payment: "100",
    });
  });

  it("builds inference setup pricing and provider messages", () => {
    const pricing = buildSetInferencePricingMsg("claw1issuer", {
      modelId: "7",
      pricePerTokenUclaw: "2",
      pricePerQueryUclaw: "10",
      minPaymentUclaw: "10",
      maxTokens: "2048",
    });
    expect(pricing.typeUrl).toBe("/clawchain.modelregistry.v1.MsgSetInferencePricing");
    expect(pricing.value).toEqual({
      caller: "claw1issuer",
      modelId: "7",
      pricePerToken: "2",
      pricePerQuery: "10",
      minPayment: "10",
      maxTokens: "2048",
    });

    const provider = buildRegisterInferenceProviderMsg("claw1issuer", {
      modelId: "7",
      endpoint: "https://provider.local",
      maxConcurrent: "3",
    });
    expect(provider.typeUrl).toBe("/clawchain.modelregistry.v1.MsgRegisterInferenceProvider");
    expect(provider.value).toEqual({
      address: "claw1issuer",
      modelIds: ["7"],
      maxConcurrent: "3",
      endpoint: "https://provider.local",
    });
  });

  it("builds provider job start and completion messages", () => {
    const start = buildStartInferenceJobMsg("claw1provider", { jobId: "12" });
    expect(start.typeUrl).toBe("/clawchain.modelregistry.v1.MsgStartInferenceJob");
    expect(start.value).toEqual({ provider: "claw1provider", jobId: "12" });

    const complete = buildCompleteInferenceJobMsg("claw1provider", {
      jobId: "12",
      output: '{"text":"done"}',
      tokensUsed: "42",
    });
    expect(complete.typeUrl).toBe("/clawchain.modelregistry.v1.MsgCompleteInferenceJob");
    expect(complete.value).toEqual({
      provider: "claw1provider",
      jobId: "12",
      output: '{"text":"done"}',
      tokensUsed: "42",
    });
  });

  it("builds Astroport create-pair and provide-liquidity execute messages", () => {
    const createPair = buildCreatePairExecuteMsg(
      "claw1issuer",
      "claw1factory",
      "uclaw",
      "factory/claw1issuer/opus_4_6",
    );
    expect(createPair.typeUrl).toBe("/cosmwasm.wasm.v1.MsgExecuteContract");
    expect(createPair.value.contract).toBe("claw1factory");
    expect(JSON.parse(fromUtf8(createPair.value.msg))).toEqual({
      create_pair: {
        pair_type: { xyk: {} },
        asset_infos: [
          { native_token: { denom: "uclaw" } },
          { native_token: { denom: "factory/claw1issuer/opus_4_6" } },
        ],
      },
    });

    const liquidity = buildProvideLiquidityExecuteMsg(
      "claw1issuer",
      "claw1pair",
      { denom: "uclaw", amount: "100" },
      { denom: "factory/claw1issuer/opus_4_6", amount: "200" },
    );
    expect(liquidity.value.funds).toEqual([
      { denom: "factory/claw1issuer/opus_4_6", amount: "200" },
      { denom: "uclaw", amount: "100" },
    ]);
    expect(JSON.parse(fromUtf8(liquidity.value.msg)).provide_liquidity.assets).toHaveLength(2);
  });

  it("extracts string and byte event attributes", () => {
    const events = [
      { type: "wasm", attributes: [{ key: "pair_contract_addr", value: "claw1pair" }] },
      { type: "custom", attributes: [{ key: "id", value: new TextEncoder().encode("42") }] },
    ];
    expect(findEventAttribute(events, "wasm", "pair_contract_addr")).toBe("claw1pair");
    expect(findEventAttribute(events, "custom", "id")).toBe("42");
    expect(findEventAttribute(events, "missing", "id")).toBeUndefined();
  });
});

describe("runModelTokenIssue", () => {
  it("submits issue tx with RegisterModel, CreateDenom, and Mint", async () => {
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "ISSUE_TX",
      events: [],
    });

    await runModelTokenIssue({ model: "opus-4-6", supply: "1000000" });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(1);
    const [, msgs] = mockSigningClient.signAndBroadcast.mock.calls[0];
    expect(msgs.map((msg: any) => msg.typeUrl)).toEqual([
      "/clawchain.modelregistry.v1.MsgRegisterModel",
      "/osmosis.tokenfactory.v1beta1.MsgCreateDenom",
      "/osmosis.tokenfactory.v1beta1.MsgMint",
    ]);
    expect(msgs[1].value.subdenom).toBe("opus_4_6");
    expect(msgs[2].value.amount.denom).toBe(
      "factory/claw1issuer00000000000000000000000000000000000/opus_4_6",
    );
    expect(logs.join("\n")).toContain("Model token issued.");
    expect(mockSigningClient.disconnect).toHaveBeenCalledOnce();
  });

  it("creates and seeds a DEX pair when factory and liquidity amounts are provided", async () => {
    mockSigningClient.signAndBroadcast
      .mockResolvedValueOnce({ code: 0, transactionHash: "ISSUE_TX", events: [] })
      .mockResolvedValueOnce({
        code: 0,
        transactionHash: "PAIR_TX",
        events: [{ type: "wasm", attributes: [{ key: "pair_contract_addr", value: "claw1pair" }] }],
      })
      .mockResolvedValueOnce({ code: 0, transactionHash: "LIQ_TX", events: [] });

    await runModelTokenIssue({
      model: "gpt-5",
      supply: "1000000",
      dexFactory: "claw1factory",
      baseAmount: "1000",
      modelAmount: "5000",
    });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(3);
    const [, pairMsgs] = mockSigningClient.signAndBroadcast.mock.calls[1];
    const [, liquidityMsgs] = mockSigningClient.signAndBroadcast.mock.calls[2];
    expect(JSON.parse(fromUtf8(pairMsgs[0].value.msg)).create_pair.asset_infos[1]).toEqual({
      native_token: { denom: "factory/claw1issuer00000000000000000000000000000000000/gpt_5" },
    });
    expect(liquidityMsgs[0].value.contract).toBe("claw1pair");
    expect(logs.join("\n")).toContain("DEX liquidity seeded.");
  });

  it("prints JSON report when requested", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "ISSUE_TX",
      events: [],
    });

    await runModelTokenIssue({ model: "llama-4", supply: "777", json: true });

    const parsed = JSON.parse(writes.join(""));
    expect(parsed.model).toBe("llama-4");
    expect(parsed.denom).toBe("factory/claw1issuer00000000000000000000000000000000000/llama_4");
    expect(parsed.issue_tx_hash).toBe("ISSUE_TX");
  });

  it("applies real OpenRouter preset metadata when issuing", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "ISSUE_TX",
      events: [],
    });

    await runModelTokenIssue({ preset: "claude-opus-4.8", supply: "1000000", json: true });

    const [, msgs] = mockSigningClient.signAndBroadcast.mock.calls[0];
    expect(msgs[0].value).toMatchObject({
      name: "Claude Opus 4.8",
      storageUri: "openrouter:anthropic/claude-opus-4.8",
      license: "provider-api",
    });
    expect(msgs[0].value.tags).toContain("anthropic");
    expect(msgs[1].value.subdenom).toBe("claude_opus_4_8");
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.openrouter_model).toBe("anthropic/claude-opus-4.8");
  });

  it("exits on invalid supply before signing", async () => {
    await expect(runModelTokenIssue({ model: "opus", supply: "0" })).rejects.toThrow("--supply");
    expect(mockSigningClient.signAndBroadcast).not.toHaveBeenCalled();
  });
});

describe("runModelTokenCatalog", () => {
  it("prints JSON preset catalog", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });

    await runModelTokenCatalog({ json: true });

    const parsed = JSON.parse(writes.join(""));
    expect(parsed.presets.map((preset: any) => preset.openrouterModel)).toEqual([
      "anthropic/claude-opus-4.8",
      "qwen/qwen3.7-max",
    ]);
  });
});

describe("runModelTokenRedeem", () => {
  it("burns model tokens and submits an inference job in one tx", async () => {
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "REDEEM_TX",
      events: [{ type: "submit_inference_job", attributes: [{ key: "job_id", value: "99" }] }],
    });

    await runModelTokenRedeem({
      modelId: "7",
      modelVersion: "1",
      model: "opus-4-6",
      amount: "25",
      input: "Explain ClawChain finality.",
      maxTokens: "128",
      temperature: "0.3",
      paymentUclaw: "50",
    });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(1);
    const [, msgs] = mockSigningClient.signAndBroadcast.mock.calls[0];
    expect(msgs.map((msg: any) => msg.typeUrl)).toEqual([
      "/osmosis.tokenfactory.v1beta1.MsgBurn",
      "/clawchain.modelregistry.v1.MsgSubmitInferenceJob",
    ]);
    expect(msgs[0].value.amount).toEqual({
      denom: "factory/claw1issuer00000000000000000000000000000000000/opus_4_6",
      amount: "25",
    });
    expect(msgs[1].value).toMatchObject({
      requester: "claw1issuer00000000000000000000000000000000000",
      modelId: "7",
      modelVersion: "1",
      input: "Explain ClawChain finality.",
      maxTokens: "128",
      temperature: "0.3",
      payment: "50",
    });
    expect(logs.join("\n")).toContain("Model token redemption submitted.");
    expect(mockSigningClient.disconnect).toHaveBeenCalledOnce();
  });

  it("prints redeem JSON report when requested", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "REDEEM_TX",
      events: [{ type: "submit_inference_job", attributes: [{ key: "job_id", value: "12" }] }],
    });

    await runModelTokenRedeem({
      modelId: "3",
      amount: "10",
      input: "run",
      denom: "factory/claw1issuer/custom",
      json: true,
    });

    const parsed = JSON.parse(writes.join(""));
    expect(parsed.redeem_tx_hash).toBe("REDEEM_TX");
    expect(parsed.job_id).toBe("12");
    expect(parsed.burned).toEqual({ denom: "factory/claw1issuer/custom", amount: "10" });
  });

  it("rejects redeem without a denom or derivable model slug before signing", async () => {
    await expect(
      runModelTokenRedeem({ modelId: "1", amount: "1", input: "prompt" }),
    ).rejects.toThrow("process.exit(1)");
    expect(errors.join("\n")).toContain("Provide --denom");
    expect(mockSigningClient.signAndBroadcast).not.toHaveBeenCalled();
  });
});

describe("runModelTokenInferenceSetup", () => {
  it("sets inference pricing without provider registration by default", async () => {
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "SETUP_TX",
      events: [],
    });

    await runModelTokenInferenceSetup({
      modelId: "7",
      pricePerTokenUclaw: "1",
      pricePerQueryUclaw: "5",
      minPaymentUclaw: "5",
      maxTokens: "512",
    });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(1);
    const [, msgs] = mockSigningClient.signAndBroadcast.mock.calls[0];
    expect(msgs.map((msg: any) => msg.typeUrl)).toEqual([
      "/clawchain.modelregistry.v1.MsgSetInferencePricing",
    ]);
    expect(msgs[0].value).toMatchObject({
      caller: "claw1issuer00000000000000000000000000000000000",
      modelId: "7",
      minPayment: "5",
      maxTokens: "512",
    });
    expect(logs.join("\n")).toContain("Model-token inference configured.");
    expect(mockSigningClient.disconnect).toHaveBeenCalledOnce();
  });

  it("can set pricing and register the owner as an inference provider", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "SETUP_TX",
      events: [],
    });

    await runModelTokenInferenceSetup({
      modelId: "9",
      registerProvider: true,
      endpoint: "https://provider.example",
      maxConcurrent: "4",
      json: true,
    });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(1);
    const [, msgs] = mockSigningClient.signAndBroadcast.mock.calls[0];
    expect(msgs.map((msg: any) => msg.typeUrl)).toEqual([
      "/clawchain.modelregistry.v1.MsgSetInferencePricing",
      "/clawchain.modelregistry.v1.MsgRegisterInferenceProvider",
    ]);
    expect(msgs[1].value).toMatchObject({
      address: "claw1issuer00000000000000000000000000000000000",
      modelIds: ["9"],
      maxConcurrent: "4",
      endpoint: "https://provider.example",
    });
    expect(JSON.parse(writes.join("")).setup_tx_hash).toBe("SETUP_TX");
  });
});

describe("provider job commands", () => {
  it("starts an inference job as provider", async () => {
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "START_TX",
      events: [],
    });

    await runModelTokenStartJob({ jobId: "12" });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(1);
    const [, msgs, fee] = mockSigningClient.signAndBroadcast.mock.calls[0];
    expect(msgs.map((msg: any) => msg.typeUrl)).toEqual([
      "/clawchain.modelregistry.v1.MsgStartInferenceJob",
    ]);
    expect(msgs[0].value).toEqual({
      provider: "claw1issuer00000000000000000000000000000000000",
      jobId: "12",
    });
    expect(fee).toEqual({ amount: [{ amount: "5000", denom: "uclaw" }], gas: "200000" });
    expect(logs.join("\n")).toContain("Inference job started.");
  });

  it("completes an inference job as provider and prints JSON", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    mockSigningClient.signAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "COMPLETE_TX",
      events: [],
    });

    await runModelTokenCompleteJob({
      jobId: "12",
      output: '{"text":"done"}',
      tokensUsed: "42",
      json: true,
    });

    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(1);
    const [, msgs, fee] = mockSigningClient.signAndBroadcast.mock.calls[0];
    expect(msgs.map((msg: any) => msg.typeUrl)).toEqual([
      "/clawchain.modelregistry.v1.MsgCompleteInferenceJob",
    ]);
    expect(msgs[0].value).toMatchObject({
      provider: "claw1issuer00000000000000000000000000000000000",
      jobId: "12",
      tokensUsed: "42",
    });
    expect(fee).toEqual({ amount: [{ amount: "5000", denom: "uclaw" }], gas: "200000" });
    expect(JSON.parse(writes.join("")).complete_tx_hash).toBe("COMPLETE_TX");
  });
});

describe("runModelTokenServeOnce", () => {
  it("starts and completes one assigned pending job", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          jobs: [
            {
              job_id: "21",
              model_id: "7",
              requester: "claw1requester",
              provider: "claw1issuer00000000000000000000000000000000000",
              input: "summarize finality",
              status: "pending",
            },
            {
              job_id: "22",
              model_id: "7",
              requester: "claw1requester",
              provider: "claw1other",
              input: "ignore",
              status: "pending",
            },
          ],
        }),
      })),
    );
    mockSigningClient.signAndBroadcast
      .mockResolvedValueOnce({ code: 0, transactionHash: "START_TX", events: [] })
      .mockResolvedValueOnce({ code: 0, transactionHash: "COMPLETE_TX", events: [] });

    await runModelTokenServeOnce({
      modelId: "7",
      output: "served {job_id}: {input}",
      json: true,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:1317/clawchain/modelregistry/v1/inference/jobs?model_id=7",
      expect.any(Object),
    );
    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(2);
    expect(mockSigningClient.signAndBroadcast.mock.calls[0][1][0].typeUrl).toBe(
      "/clawchain.modelregistry.v1.MsgStartInferenceJob",
    );
    expect(mockSigningClient.signAndBroadcast.mock.calls[1][1][0].typeUrl).toBe(
      "/clawchain.modelregistry.v1.MsgCompleteInferenceJob",
    );
    expect(mockSigningClient.signAndBroadcast.mock.calls[1][1][0].value).toMatchObject({
      jobId: "21",
      output: "served 21: summarize finality",
    });
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.jobs).toEqual([
      {
        job_id: "21",
        model_id: "7",
        status_before: "pending",
        start_tx_hash: "START_TX",
        complete_tx_hash: "COMPLETE_TX",
        tokens_used: "8",
        output_source: "template",
      },
    ]);
  });

  it("dry-runs assigned active jobs without signing", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          jobs: [
            {
              jobId: "31",
              modelId: "8",
              provider: "claw1issuer00000000000000000000000000000000000",
              status: "running",
            },
          ],
        }),
      })),
    );

    await runModelTokenServeOnce({ dryRun: true, json: true });

    expect(mockSigningClient.signAndBroadcast).not.toHaveBeenCalled();
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.jobs[0]).toMatchObject({
      job_id: "31",
      model_id: "8",
      status_before: "running",
      action: "would_complete",
    });
  });
});

describe("runModelTokenServeLoop", () => {
  it("runs bounded cycles and reuses serve-once filtering", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobs: [
              {
                job_id: "41",
                model_id: "9",
                provider: "claw1issuer00000000000000000000000000000000000",
                input: "first",
                status: "pending",
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jobs: [
              {
                job_id: "42",
                model_id: "9",
                provider: "claw1issuer00000000000000000000000000000000000",
                input: "second",
                status: "pending",
              },
            ],
          }),
        }),
    );
    mockSigningClient.signAndBroadcast
      .mockResolvedValueOnce({ code: 0, transactionHash: "START_41", events: [] })
      .mockResolvedValueOnce({ code: 0, transactionHash: "COMPLETE_41", events: [] })
      .mockResolvedValueOnce({ code: 0, transactionHash: "START_42", events: [] })
      .mockResolvedValueOnce({ code: 0, transactionHash: "COMPLETE_42", events: [] });

    await runModelTokenServeLoop({
      modelId: "9",
      maxCycles: "2",
      intervalMs: "0",
      output: "loop {job_id}",
      json: true,
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(mockSigningClient.signAndBroadcast).toHaveBeenCalledTimes(4);
    const reports = writes.join("").trim().split(/\n(?=\{)/).map((chunk) => JSON.parse(chunk));
    expect(reports.map((report) => report.jobs[0].job_id)).toEqual(["41", "42"]);
  });

  it("rejects invalid loop controls before querying", async () => {
    await expect(runModelTokenServeLoop({ maxCycles: "-1", json: true })).rejects.toThrow("--max-cycles");
    expect(mockSigningClient.signAndBroadcast).not.toHaveBeenCalled();
  });
});
