/**
 * `clawd model-token` subcommands — tokenized AI-model assets.
 *
 * P0/P1 compose existing chain primitives:
 *   modelregistry RegisterModel + tokenfactory CreateDenom/Mint + optional DEX pair/liquidity.
 *   tokenfactory Burn + modelregistry SubmitInferenceJob for token redemption.
 */

import { readFileSync } from "node:fs";
import { toUtf8 } from "@cosmjs/encoding";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { calculateFee, GasPrice } from "@cosmjs/stargate";
import { loadClawdConfig } from "../lib/config.js";
import { formatClaw, shortAddr } from "../lib/format.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { connectClawchainSigningClient } from "../lib/signing.js";
import {
  buildFundMsg,
  buildInstantiateMsg,
  buildStoreCodeMsg,
  buildVaultInstantiateMsg,
} from "./model-vault.js";

type Coin = { denom: string; amount: string };
type TxEvent = {
  type: string;
  attributes?: readonly { key: string; value: string | Uint8Array }[];
};

const PROVIDER_JOB_GAS = 200_000;

export type ModelTokenPreset = {
  id: string;
  openrouterModel: string;
  symbol: string;
  name: string;
  description: string;
  tags: string[];
  contextTokens: string;
  inputPriceUsdPerM: string;
  outputPriceUsdPerM: string;
  released: string;
};

export const MODEL_TOKEN_PRESETS: readonly ModelTokenPreset[] = [
  {
    id: "claude-opus-4.8",
    openrouterModel: "anthropic/claude-opus-4.8",
    symbol: "claude_opus_4_8",
    name: "Claude Opus 4.8",
    description: "Anthropic Claude Opus 4.8 on OpenRouter, suited for long-horizon coding and agentic work.",
    tags: ["openrouter", "anthropic", "claude", "opus", "agentic", "coding"],
    contextTokens: "1000000",
    inputPriceUsdPerM: "5",
    outputPriceUsdPerM: "25",
    released: "2026-05",
  },
  {
    id: "qwen3.7-max",
    openrouterModel: "qwen/qwen3.7-max",
    symbol: "qwen3_7_max",
    name: "Qwen3.7 Max",
    description: "Qwen3.7 Max on OpenRouter, a large-context agentic model for coding and productivity tasks.",
    tags: ["openrouter", "qwen", "qwen3.7", "agentic", "coding"],
    contextTokens: "1000000",
    inputPriceUsdPerM: "2.5",
    outputPriceUsdPerM: "7.5",
    released: "2026-05-21",
  },
];

export type ModelTokenIssueOptions = {
  model?: string;
  preset?: string;
  symbol?: string;
  supply: string;
  name?: string;
  description?: string;
  framework?: string;
  architecture?: string;
  parameterCount?: string;
  license?: string;
  tags?: string;
  storageType?: string;
  storageUri?: string;
  checksumSha256?: string;
  sizeBytes?: string;
  accessType?: string;
  pricePerQueryUclaw?: string;
  priceOneTimeUclaw?: string;
  dexFactory?: string;
  baseDenom?: string;
  baseAmount?: string;
  modelAmount?: string;
  json?: boolean;
};

/**
 * `model-token launch` = `model-token issue` (subset) + `model-vault deploy`
 * in one signed flow. The issue half reuses the issue option set (preset,
 * symbol, supply, registry metadata, optional DEX seed); the deploy half adds
 * the vault flags (--wasm/--code-id/--fee-bps/--seed-reserve/--seed-inventory).
 */
export type ModelTokenLaunchOptions = ModelTokenIssueOptions & {
  /** Optimized wasm artifact to store first (parses code_id from store tx). */
  wasm?: string;
  /** Pre-uploaded code id; skips the store step when provided. */
  codeId?: string;
  /** Bonding-curve quote asset; defaults to the issue --base-denom or chain denom. */
  reserveDenom?: string;
  vaultOwner?: string;
  feeBps?: string;
  label?: string;
  admin?: string;
  /** Reserve-denom amount to fund the vault after instantiate (optional). */
  seedReserve?: string;
  /** Model-denom amount to fund the vault after instantiate (optional). */
  seedInventory?: string;
};

export type ModelTokenRedeemOptions = {
  modelId: string;
  modelVersion?: string;
  amount: string;
  input: string;
  denom?: string;
  model?: string;
  symbol?: string;
  maxTokens?: string;
  temperature?: string;
  paymentUclaw?: string;
  json?: boolean;
};

export type ModelTokenInferenceSetupOptions = {
  modelId: string;
  pricePerTokenUclaw?: string;
  pricePerQueryUclaw?: string;
  minPaymentUclaw?: string;
  maxTokens?: string;
  registerProvider?: boolean;
  endpoint?: string;
  maxConcurrent?: string;
  json?: boolean;
};

export type ModelTokenStartJobOptions = {
  jobId: string;
  json?: boolean;
};

export type ModelTokenCompleteJobOptions = {
  jobId: string;
  output: string;
  tokensUsed: string;
  json?: boolean;
};

export type ModelTokenAttestOptions = {
  jobId: string;
  outputTokens: string;
  attestationHash: string;
  json?: boolean;
};

export type ModelTokenDisputeOptions = {
  jobId: string;
  reason: string;
  json?: boolean;
};

export type ModelTokenServeOnceOptions = {
  modelId?: string;
  status?: string;
  maxJobs?: string;
  output?: string;
  openrouterModel?: string;
  dryRun?: boolean;
  json?: boolean;
};

export type ModelTokenServeLoopOptions = ModelTokenServeOnceOptions & {
  intervalMs?: string;
  maxCycles?: string;
};

export type ModelTokenJobStatusOptions = {
  jobId: string;
  watch?: boolean;
  intervalMs?: string;
  maxCycles?: string;
  json?: boolean;
};

export type ModelTokenCatalogOptions = {
  json?: boolean;
};

type InferenceJob = {
  job_id?: string;
  jobId?: string;
  model_id?: string;
  modelId?: string;
  requester?: string;
  provider?: string;
  input?: string;
  output?: string;
  status?: string;
  max_tokens?: string;
  maxTokens?: string;
  temperature?: string;
  payment?: string;
  model_version?: string | number;
  modelVersion?: string | number;
  gas_used?: string | number;
  gasUsed?: string | number;
  tokens_used?: string | number;
  tokensUsed?: string | number;
  created_at?: string | number;
  createdAt?: string | number;
  started_at?: string | number;
  startedAt?: string | number;
  completed_at?: string | number;
  completedAt?: string | number;
  error_msg?: string;
  errorMsg?: string;
  attestation_hash?: string;
  attestationHash?: string;
  attested_output_tokens?: string | number;
  attestedOutputTokens?: string | number;
  attested_at?: string | number;
  attestedAt?: string | number;
  disputed?: boolean;
  dispute_reason?: string;
  disputeReason?: string;
  disputed_at?: string | number;
  disputedAt?: string | number;
};

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSigner() {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

  if (!mnemonicFileExists()) {
    throw new Error('No mnemonic found. Run "clawd init" first.');
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("Failed to load mnemonic.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error("Failed to derive wallet account.");
  }

  const signingClient = await connectClawchainSigningClient(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return {
    cfg,
    rpcUrl,
    restUrl: (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, ""),
    denom,
    gasPrice,
    account,
    signingClient,
  };
}

export function normalizeModelTokenSubdenom(model: string, symbol?: string): string {
  const raw = (symbol ?? model).trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9/_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_/]+|[_/]+$/g, "");
  if (!normalized) {
    throw new Error("Model token symbol/subdenom cannot be empty.");
  }
  if (normalized.length > 128) {
    throw new Error("Model token subdenom must be 128 characters or fewer.");
  }
  return normalized;
}

function parseTags(tags?: string): string[] {
  return (tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function findModelTokenPreset(id: string | undefined): ModelTokenPreset | undefined {
  if (!id?.trim()) return undefined;
  const normalized = id.trim().toLowerCase();
  return MODEL_TOKEN_PRESETS.find(
    (preset) => preset.id === normalized || preset.openrouterModel.toLowerCase() === normalized,
  );
}

function applyIssuePreset(opts: ModelTokenIssueOptions): ModelTokenIssueOptions {
  const preset = findModelTokenPreset(opts.preset);
  if (!opts.preset) return opts;
  if (!preset) {
    throw new Error(`Unknown model-token preset "${opts.preset}". Run "clawd model-token catalog".`);
  }

  return {
    ...opts,
    model: opts.model ?? preset.openrouterModel,
    symbol: opts.symbol ?? preset.symbol,
    name: opts.name ?? preset.name,
    description: opts.description ?? preset.description,
    framework: opts.framework ?? "other",
    architecture: opts.architecture ?? preset.name,
    parameterCount: opts.parameterCount ?? "",
    license: opts.license ?? "provider-api",
    tags: opts.tags ?? preset.tags.join(","),
    storageType: opts.storageType ?? "remote",
    storageUri: opts.storageUri ?? `openrouter:${preset.openrouterModel}`,
    sizeBytes: opts.sizeBytes ?? "0",
    accessType: opts.accessType ?? "per_query",
  };
}

export function buildRegisterModelMsg(owner: string, opts: ModelTokenIssueOptions) {
  const model = requireNonEmpty("--model", opts.model);
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgRegisterModel",
    value: {
      owner,
      name: opts.name ?? model,
      description: opts.description ?? `Tokenized inference capacity for ${model}`,
      framework: opts.framework ?? "other",
      architecture: opts.architecture ?? "",
      parameterCount: opts.parameterCount ?? "",
      license: opts.license ?? "",
      tags: parseTags(opts.tags),
      storageType: opts.storageType ?? "remote",
      storageUri: opts.storageUri ?? `clawchain:model-token:${model}`,
      checksumSha256: opts.checksumSha256 ?? "",
      sizeBytes: opts.sizeBytes ?? "0",
      accessType: opts.accessType ?? "per_query",
      pricePerQueryUclaw: opts.pricePerQueryUclaw ?? "0",
      priceOneTimeUclaw: opts.priceOneTimeUclaw ?? "0",
    },
  };
}

export function buildCreateDenomMsg(sender: string, subdenom: string) {
  return {
    typeUrl: "/osmosis.tokenfactory.v1beta1.MsgCreateDenom",
    value: { sender, subdenom },
  };
}

export function buildMintMsg(sender: string, denom: string, amount: string, mintToAddress = sender) {
  return {
    typeUrl: "/osmosis.tokenfactory.v1beta1.MsgMint",
    value: {
      sender,
      amount: { denom, amount },
      mintToAddress,
    },
  };
}

export function buildBurnMsg(sender: string, denom: string, amount: string, burnFromAddress = sender) {
  return {
    typeUrl: "/osmosis.tokenfactory.v1beta1.MsgBurn",
    value: {
      sender,
      amount: { denom, amount },
      burnFromAddress,
    },
  };
}

export function buildSubmitInferenceJobMsg(
  requester: string,
  opts: Pick<ModelTokenRedeemOptions, "modelId" | "modelVersion" | "input" | "maxTokens" | "temperature" | "paymentUclaw">,
) {
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgSubmitInferenceJob",
    value: {
      requester,
      modelId: requireNonNegativeInteger("--model-id", opts.modelId),
      modelVersion: requireNonNegativeInteger("--model-version", opts.modelVersion ?? "0"),
      input: requireNonEmpty("--input", opts.input),
      maxTokens: requirePositiveAmount("--max-tokens", opts.maxTokens ?? "512"),
      temperature: opts.temperature ?? "0.7",
      payment: requireNonNegativeInteger("--payment-uclaw", opts.paymentUclaw ?? "0"),
    },
  };
}

export function buildSetInferencePricingMsg(
  caller: string,
  opts: Pick<
    ModelTokenInferenceSetupOptions,
    "modelId" | "pricePerTokenUclaw" | "pricePerQueryUclaw" | "minPaymentUclaw" | "maxTokens"
  >,
) {
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgSetInferencePricing",
    value: {
      caller,
      modelId: requireNonNegativeInteger("--model-id", opts.modelId),
      pricePerToken: requireNonNegativeInteger("--price-per-token-uclaw", opts.pricePerTokenUclaw ?? "0"),
      pricePerQuery: requireNonNegativeInteger("--price-per-query-uclaw", opts.pricePerQueryUclaw ?? "0"),
      minPayment: requireNonNegativeInteger("--min-payment-uclaw", opts.minPaymentUclaw ?? "0"),
      maxTokens: requirePositiveAmount("--max-tokens", opts.maxTokens ?? "512"),
    },
  };
}

export function buildRegisterInferenceProviderMsg(
  address: string,
  opts: Pick<ModelTokenInferenceSetupOptions, "modelId" | "endpoint" | "maxConcurrent">,
) {
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgRegisterInferenceProvider",
    value: {
      address,
      modelIds: [requireNonNegativeInteger("--model-id", opts.modelId)],
      maxConcurrent: requirePositiveAmount("--max-concurrent", opts.maxConcurrent ?? "1"),
      endpoint: opts.endpoint ?? "clawchain://local-provider",
    },
  };
}

export function buildStartInferenceJobMsg(provider: string, opts: Pick<ModelTokenStartJobOptions, "jobId">) {
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgStartInferenceJob",
    value: {
      provider,
      jobId: requirePositiveAmount("--job-id", opts.jobId),
    },
  };
}

export function buildCompleteInferenceJobMsg(
  provider: string,
  opts: Pick<ModelTokenCompleteJobOptions, "jobId" | "output" | "tokensUsed">,
) {
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgCompleteInferenceJob",
    value: {
      provider,
      jobId: requirePositiveAmount("--job-id", opts.jobId),
      output: requireNonEmpty("--output", opts.output),
      tokensUsed: requireNonNegativeInteger("--tokens-used", opts.tokensUsed),
    },
  };
}

export function buildSubmitUsageAttestationMsg(
  creator: string,
  opts: Pick<ModelTokenAttestOptions, "jobId" | "outputTokens" | "attestationHash">,
) {
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgSubmitUsageAttestation",
    value: {
      creator,
      jobId: requirePositiveAmount("--job-id", opts.jobId),
      outputTokens: requireNonNegativeInteger("--output-tokens", opts.outputTokens),
      attestationHash: requireNonEmpty("--attestation-hash", opts.attestationHash),
    },
  };
}

export function buildDisputeInferenceJobMsg(
  creator: string,
  opts: Pick<ModelTokenDisputeOptions, "jobId" | "reason">,
) {
  return {
    typeUrl: "/clawchain.modelregistry.v1.MsgDisputeInferenceJob",
    value: {
      creator,
      jobId: requirePositiveAmount("--job-id", opts.jobId),
      reason: requireNonEmpty("--reason", opts.reason),
    },
  };
}

export function buildCreatePairExecuteMsg(sender: string, factory: string, baseDenom: string, modelDenom: string) {
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: {
      sender,
      contract: factory,
      msg: toUtf8(
        JSON.stringify({
          create_pair: {
            pair_type: { xyk: {} },
            asset_infos: [
              { native_token: { denom: baseDenom } },
              { native_token: { denom: modelDenom } },
            ],
          },
        }),
      ),
      funds: [],
    },
  };
}

export function buildProvideLiquidityExecuteMsg(
  sender: string,
  pair: string,
  base: Coin,
  model: Coin,
) {
  const funds = [base, model].sort((a, b) => a.denom.localeCompare(b.denom));
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: {
      sender,
      contract: pair,
      msg: toUtf8(
        JSON.stringify({
          provide_liquidity: {
            assets: [
              { info: { native_token: { denom: base.denom } }, amount: base.amount },
              { info: { native_token: { denom: model.denom } }, amount: model.amount },
            ],
            slippage_tolerance: "0.01",
          },
        }),
      ),
      funds,
    },
  };
}

function attrValue(value: string | Uint8Array): string {
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

export function findEventAttribute(events: readonly TxEvent[] | undefined, type: string, key: string): string | undefined {
  for (const event of events ?? []) {
    if (event.type !== type) continue;
    const attr = event.attributes?.find((candidate) => candidate.key === key);
    if (attr) return attrValue(attr.value);
  }
  return undefined;
}

function requirePositiveAmount(label: string, amount: string | undefined): string {
  if (!amount || !/^[0-9]+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error(`${label} must be a positive integer amount.`);
  }
  return amount;
}

function requireNonNegativeInteger(label: string, value: string | undefined): string {
  if (value === undefined || !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireNonEmpty(label: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`${label} cannot be empty.`);
  }
  return value;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return (await res.json()) as T;
}

function resolveModelDenom(issuer: string, opts: { denom?: string; model?: string; symbol?: string }): string {
  if (opts.denom?.trim()) return opts.denom.trim();
  if (!opts.model?.trim()) {
    throw new Error("Provide --denom, or provide --model/--symbol so the factory denom can be derived.");
  }
  return `factory/${issuer}/${normalizeModelTokenSubdenom(opts.model, opts.symbol)}`;
}

function jobId(job: InferenceJob): string {
  return String(job.job_id ?? job.jobId ?? "");
}

function jobModelId(job: InferenceJob): string {
  return String(job.model_id ?? job.modelId ?? "");
}

function jobStatus(job: InferenceJob): string {
  return String(job.status ?? "").toLowerCase();
}

function renderOutputTemplate(template: string, job: InferenceJob): string {
  return template
    .replaceAll("{job_id}", jobId(job))
    .replaceAll("{model_id}", jobModelId(job))
    .replaceAll("{requester}", String(job.requester ?? ""))
    .replaceAll("{input}", String(job.input ?? ""));
}

function estimateTokensUsed(output: string): string {
  return String(Math.max(1, Math.ceil(output.length / 4)));
}

function defaultProviderOutput(job: InferenceJob): string {
  return JSON.stringify({
    response: `Completed model-token inference job ${jobId(job)}.`,
    model_id: jobModelId(job),
    input: job.input ?? "",
  });
}

async function runOpenRouterCompletion(model: string, job: InferenceJob): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required when --openrouter-model is set.");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "https://clawchain.local",
      "x-title": "ClawChain model-token provider",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: job.input ?? "" }],
      temperature: Number(job.temperature ?? "0.7"),
      max_tokens: Number(job.max_tokens ?? job.maxTokens ?? "512"),
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("OpenRouter response did not include message content.");
  }
  return content;
}

export async function runModelTokenIssue(opts: ModelTokenIssueOptions): Promise<void> {
  opts = applyIssuePreset(opts);
  const model = requireNonEmpty("--model", opts.model);
  const supply = requirePositiveAmount("--supply", opts.supply);
  const subdenom = normalizeModelTokenSubdenom(model, opts.symbol);
  const { account, signingClient, denom: defaultDenom } = await ensureSigner();
  const modelDenom = `factory/${account.address}/${subdenom}`;
  const baseDenom = opts.baseDenom ?? defaultDenom;

  const report: Record<string, unknown> = {
    model,
    preset: opts.preset ?? null,
    openrouter_model: findModelTokenPreset(opts.preset)?.openrouterModel ?? (model.includes("/") ? model : null),
    subdenom,
    denom: modelDenom,
    issuer: account.address,
  };

  if (!opts.json) {
    console.log(`Issuing model token for ${model}...`);
    console.log(`  Issuer:  ${shortAddr(account.address)}`);
    console.log(`  Denom:   ${modelDenom}`);
    console.log(`  Supply:  ${supply}`);
    console.log();
  }

  try {
    const issueMsgs = [
      buildRegisterModelMsg(account.address, opts),
      buildCreateDenomMsg(account.address, subdenom),
      buildMintMsg(account.address, modelDenom, supply),
    ];
    const issueRes = await signingClient.signAndBroadcast(account.address, issueMsgs, "auto");
    if (issueRes.code !== 0) {
      throw new Error(`issue tx failed (code=${issueRes.code}): ${issueRes.rawLog}`);
    }

    report.issue_tx_hash = issueRes.transactionHash;
    report.model_id = findEventAttribute(issueRes.events, "register_model", "model_id") ?? null;

    if (!opts.json) {
      console.log("Model token issued.");
      console.log(`  TxHash: ${issueRes.transactionHash}`);
      console.log();
    }

    if (opts.dexFactory) {
      const createPairMsg = buildCreatePairExecuteMsg(account.address, opts.dexFactory, baseDenom, modelDenom);
      const pairRes = await signingClient.signAndBroadcast(account.address, [createPairMsg], "auto");
      if (pairRes.code !== 0) {
        throw new Error(`DEX pair creation failed (code=${pairRes.code}): ${pairRes.rawLog}`);
      }

      const pairAddress =
        findEventAttribute(pairRes.events, "wasm", "pair_contract_addr") ??
        findEventAttribute(pairRes.events, "wasm", "contract_addr") ??
        null;
      report.dex_pair_tx_hash = pairRes.transactionHash;
      report.dex_pair = pairAddress;

      if (!opts.json) {
        console.log("DEX pair creation submitted.");
        console.log(`  Factory: ${shortAddr(opts.dexFactory)}`);
        console.log(`  TxHash:  ${pairRes.transactionHash}`);
        if (pairAddress) console.log(`  Pair:    ${pairAddress}`);
        console.log();
      }

      const baseAmount = opts.baseAmount;
      const modelAmount = opts.modelAmount;
      if (baseAmount || modelAmount) {
        if (!pairAddress) {
          throw new Error("Cannot seed liquidity because the DEX pair address was not found in tx events.");
        }
        const liquidityMsg = buildProvideLiquidityExecuteMsg(
          account.address,
          pairAddress,
          { denom: baseDenom, amount: requirePositiveAmount("--base-amount", baseAmount) },
          { denom: modelDenom, amount: requirePositiveAmount("--model-amount", modelAmount) },
        );
        const liquidityRes = await signingClient.signAndBroadcast(account.address, [liquidityMsg], "auto");
        if (liquidityRes.code !== 0) {
          throw new Error(`DEX liquidity seeding failed (code=${liquidityRes.code}): ${liquidityRes.rawLog}`);
        }
        report.dex_liquidity_tx_hash = liquidityRes.transactionHash;
        report.dex_liquidity = {
          base: { denom: baseDenom, amount: baseAmount },
          model: { denom: modelDenom, amount: modelAmount },
        };

        if (!opts.json) {
          console.log("DEX liquidity seeded.");
          console.log(`  ${formatClaw(baseAmount ?? "0")} (${baseDenom})`);
          console.log(`  ${modelAmount} ${subdenom}`);
          console.log(`  TxHash: ${liquidityRes.transactionHash}`);
          console.log();
        }
      }
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    }
  } catch (err) {
    console.error(`Model token issue failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

/** fee_bps must be an integer in [0, 10000] (0%..100%); mirrors model-vault deploy. */
function requireFeeBps(label: string, value: string | undefined): number {
  if (value === undefined || !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const bps = Number(value);
  if (bps > 10_000) {
    throw new Error(`${label} must be between 0 and 10000 basis points.`);
  }
  return bps;
}

function loadWasmBytes(path: string): Uint8Array {
  try {
    return new Uint8Array(readFileSync(path));
  } catch (err) {
    throw new Error(`Failed to read wasm artifact "${path}": ${String(err)}`);
  }
}

/**
 * `clawd model-token launch` — issue a model token AND deploy its ModelVault in
 * a single signed flow, reusing one signing-client connection end to end:
 *   1. RegisterModel + CreateDenom + Mint (the issue half; honors --preset).
 *   2. [optional] Astroport create_pair (+ provide_liquidity) when --dex-factory.
 *   3. Store the wasm (or reuse --code-id) -> instantiate the vault for the
 *      freshly minted model_denom -> [optional] fund {} with seed reserve/inventory.
 * Prints a consolidated summary: model_denom, code_id, vault address, and every
 * tx hash. Supports --json. Reuses the issue message builders here plus the
 * deploy helpers imported from model-vault.ts (no duplicated logic).
 */
export async function runModelTokenLaunch(opts: ModelTokenLaunchOptions): Promise<void> {
  opts = applyIssuePreset(opts);
  const model = requireNonEmpty("--model", opts.model);
  const supply = requirePositiveAmount("--supply", opts.supply);
  const subdenom = normalizeModelTokenSubdenom(model, opts.symbol);

  // Validate the deploy half up front so we fail before broadcasting anything.
  if (!opts.wasm && !opts.codeId) {
    throw new Error("Provide --wasm <path> to store, or --code-id <n> to reuse an uploaded code.");
  }
  if (opts.codeId !== undefined && !/^[0-9]+$/.test(opts.codeId)) {
    throw new Error("--code-id must be a non-negative integer.");
  }
  const feeBps = requireFeeBps("--fee-bps", opts.feeBps ?? "30");
  const label = opts.label?.trim() || "model-vault";
  const seedReserve = opts.seedReserve?.trim()
    ? requirePositiveAmount("--seed-reserve", opts.seedReserve)
    : undefined;
  const seedInventory = opts.seedInventory?.trim()
    ? requirePositiveAmount("--seed-inventory", opts.seedInventory)
    : undefined;

  const { account, signingClient, denom: defaultDenom } = await ensureSigner();
  const modelDenom = `factory/${account.address}/${subdenom}`;
  const baseDenom = opts.baseDenom ?? defaultDenom;
  const reserveDenom = opts.reserveDenom?.trim() || baseDenom;
  const admin = opts.admin?.trim() || account.address;
  const vaultOwner = opts.vaultOwner?.trim() || undefined;

  const report: Record<string, unknown> = {
    action: "ModelTokenLaunch",
    model,
    preset: opts.preset ?? null,
    openrouter_model: findModelTokenPreset(opts.preset)?.openrouterModel ?? (model.includes("/") ? model : null),
    subdenom,
    model_denom: modelDenom,
    reserve_denom: reserveDenom,
    fee_bps: feeBps,
    issuer: account.address,
    vault_owner: vaultOwner ?? account.address,
    admin,
    label,
  };

  if (!opts.json) {
    console.log(`Launching model token + vault for ${model}...`);
    console.log(`  Issuer:      ${shortAddr(account.address)}`);
    console.log(`  Model Denom: ${modelDenom}`);
    console.log(`  Reserve:     ${reserveDenom}`);
    console.log(`  Supply:      ${supply}`);
    console.log(`  Fee:         ${feeBps} bps`);
    console.log();
  }

  try {
    // --- 1. Issue the model token: register + create-denom + mint. ---
    const issueMsgs = [
      buildRegisterModelMsg(account.address, opts),
      buildCreateDenomMsg(account.address, subdenom),
      buildMintMsg(account.address, modelDenom, supply),
    ];
    const issueRes = await signingClient.signAndBroadcast(account.address, issueMsgs, "auto");
    if (issueRes.code !== 0) {
      throw new Error(`issue tx failed (code=${issueRes.code}): ${issueRes.rawLog}`);
    }
    report.issue_tx_hash = issueRes.transactionHash;
    report.model_id = findEventAttribute(issueRes.events, "register_model", "model_id") ?? null;

    if (!opts.json) {
      console.log("Model token issued.");
      console.log(`  TxHash:  ${issueRes.transactionHash}`);
      if (report.model_id) console.log(`  ModelID: ${String(report.model_id)}`);
      console.log();
    }

    // --- 2. Optional Astroport pair + liquidity (same path as `issue`). ---
    if (opts.dexFactory) {
      const createPairMsg = buildCreatePairExecuteMsg(account.address, opts.dexFactory, baseDenom, modelDenom);
      const pairRes = await signingClient.signAndBroadcast(account.address, [createPairMsg], "auto");
      if (pairRes.code !== 0) {
        throw new Error(`DEX pair creation failed (code=${pairRes.code}): ${pairRes.rawLog}`);
      }
      const pairAddress =
        findEventAttribute(pairRes.events, "wasm", "pair_contract_addr") ??
        findEventAttribute(pairRes.events, "wasm", "contract_addr") ??
        null;
      report.dex_pair_tx_hash = pairRes.transactionHash;
      report.dex_pair = pairAddress;

      if (!opts.json) {
        console.log("DEX pair creation submitted.");
        console.log(`  TxHash:  ${pairRes.transactionHash}`);
        if (pairAddress) console.log(`  Pair:    ${pairAddress}`);
        console.log();
      }

      if (opts.baseAmount || opts.modelAmount) {
        if (!pairAddress) {
          throw new Error("Cannot seed liquidity because the DEX pair address was not found in tx events.");
        }
        const liquidityMsg = buildProvideLiquidityExecuteMsg(
          account.address,
          pairAddress,
          { denom: baseDenom, amount: requirePositiveAmount("--base-amount", opts.baseAmount) },
          { denom: modelDenom, amount: requirePositiveAmount("--model-amount", opts.modelAmount) },
        );
        const liquidityRes = await signingClient.signAndBroadcast(account.address, [liquidityMsg], "auto");
        if (liquidityRes.code !== 0) {
          throw new Error(`DEX liquidity seeding failed (code=${liquidityRes.code}): ${liquidityRes.rawLog}`);
        }
        report.dex_liquidity_tx_hash = liquidityRes.transactionHash;

        if (!opts.json) {
          console.log("DEX liquidity seeded.");
          console.log(`  TxHash:  ${liquidityRes.transactionHash}`);
          console.log();
        }
      }
    }

    // --- 3. Store the wasm (optional; skipped when --code-id is supplied). ---
    let codeId = opts.codeId;
    if (opts.wasm) {
      const wasmBytes = loadWasmBytes(opts.wasm);
      const storeMsg = buildStoreCodeMsg(account.address, wasmBytes);
      const storeRes = await signingClient.signAndBroadcast(account.address, [storeMsg], "auto");
      if (storeRes.code !== 0) {
        throw new Error(`store tx failed (code=${storeRes.code}): ${storeRes.rawLog}`);
      }
      const parsedCodeId = findEventAttribute(storeRes.events, "store_code", "code_id");
      if (!parsedCodeId) {
        throw new Error("Could not parse code_id from the store_code event.");
      }
      codeId = parsedCodeId;
      report.store_tx_hash = storeRes.transactionHash;

      if (!opts.json) {
        console.log("Wasm stored.");
        console.log(`  TxHash:  ${storeRes.transactionHash}`);
        console.log(`  CodeID:  ${codeId}`);
        console.log();
      }
    }
    if (!codeId) {
      throw new Error("No code_id available to instantiate (store failed?).");
    }
    report.code_id = codeId;

    // --- 4. Instantiate the vault for the freshly minted model_denom. ---
    const initMsg = buildVaultInstantiateMsg({ modelDenom, reserveDenom, owner: vaultOwner, feeBps });
    const instantiateMsg = buildInstantiateMsg(account.address, codeId, initMsg, label, admin);
    const instRes = await signingClient.signAndBroadcast(account.address, [instantiateMsg], "auto");
    if (instRes.code !== 0) {
      throw new Error(`instantiate tx failed (code=${instRes.code}): ${instRes.rawLog}`);
    }
    const vault = findEventAttribute(instRes.events, "instantiate", "_contract_address");
    if (!vault) {
      throw new Error("Could not parse _contract_address from the instantiate event.");
    }
    report.instantiate_tx_hash = instRes.transactionHash;
    report.vault = vault;

    if (!opts.json) {
      console.log("Vault instantiated.");
      console.log(`  TxHash:  ${instRes.transactionHash}`);
      console.log(`  Vault:   ${vault}`);
      console.log();
    }

    // --- 5. Optionally fund the vault with reserve and/or model tokens. ---
    if (seedReserve || seedInventory) {
      const funds: Coin[] = [];
      if (seedReserve) funds.push({ denom: reserveDenom, amount: seedReserve });
      if (seedInventory) funds.push({ denom: modelDenom, amount: seedInventory });
      // CosmWasm requires funds sorted by denom.
      funds.sort((a, b) => a.denom.localeCompare(b.denom));

      const fundMsg = buildFundMsg(account.address, vault, funds);
      const fundRes = await signingClient.signAndBroadcast(account.address, [fundMsg], "auto");
      if (fundRes.code !== 0) {
        throw new Error(`fund tx failed (code=${fundRes.code}): ${fundRes.rawLog}`);
      }
      report.fund_tx_hash = fundRes.transactionHash;
      report.funds = funds;

      if (!opts.json) {
        console.log("Vault funded.");
        for (const f of funds) console.log(`  ${f.amount} ${f.denom}`);
        console.log(`  TxHash:  ${fundRes.transactionHash}`);
        console.log();
      }
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log("Launch complete.");
    console.log(`  Model Denom: ${modelDenom}`);
    console.log(`  Code ID:     ${codeId}`);
    console.log(`  Vault:       ${vault}`);
  } catch (err) {
    console.error(`Model token launch failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelTokenRedeem(opts: ModelTokenRedeemOptions): Promise<void> {
  const amount = requirePositiveAmount("--amount", opts.amount);
  const { account, signingClient } = await ensureSigner();

  try {
    const modelDenom = resolveModelDenom(account.address, opts);
    const report: Record<string, unknown> = {
      model_id: opts.modelId,
      model_version: opts.modelVersion ?? "0",
      denom: modelDenom,
      redeemer: account.address,
      burned: { denom: modelDenom, amount },
      max_tokens: opts.maxTokens ?? "512",
      temperature: opts.temperature ?? "0.7",
      payment_uclaw: opts.paymentUclaw ?? "0",
    };

    if (!opts.json) {
      console.log("Redeeming model tokens for inference...");
      console.log(`  Redeemer: ${shortAddr(account.address)}`);
      console.log(`  Burn:     ${amount} ${modelDenom}`);
      console.log(`  Model:    #${opts.modelId} v${opts.modelVersion ?? "0"}`);
      console.log();
    }

    const burnMsg = buildBurnMsg(account.address, modelDenom, amount);
    const jobMsg = buildSubmitInferenceJobMsg(account.address, opts);
    const redeemRes = await signingClient.signAndBroadcast(account.address, [burnMsg, jobMsg], "auto");
    if (redeemRes.code !== 0) {
      throw new Error(`redeem tx failed (code=${redeemRes.code}): ${redeemRes.rawLog}`);
    }

    report.redeem_tx_hash = redeemRes.transactionHash;
    report.job_id = findEventAttribute(redeemRes.events, "submit_inference_job", "job_id") ?? null;

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log("Model token redemption submitted.");
    console.log(`  TxHash: ${redeemRes.transactionHash}`);
    if (report.job_id) console.log(`  JobID:  ${String(report.job_id)}`);
  } catch (err) {
    console.error(`Model token redeem failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelTokenInferenceSetup(opts: ModelTokenInferenceSetupOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  const report: Record<string, unknown> = {
    model_id: opts.modelId,
    owner: account.address,
    pricing: {
      price_per_token_uclaw: opts.pricePerTokenUclaw ?? "0",
      price_per_query_uclaw: opts.pricePerQueryUclaw ?? "0",
      min_payment_uclaw: opts.minPaymentUclaw ?? "0",
      max_tokens: opts.maxTokens ?? "512",
    },
  };

  if (opts.registerProvider) {
    report.provider = {
      address: account.address,
      endpoint: opts.endpoint ?? "clawchain://local-provider",
      max_concurrent: opts.maxConcurrent ?? "1",
    };
  }

  if (!opts.json) {
    console.log("Configuring model-token inference...");
    console.log(`  Owner:   ${shortAddr(account.address)}`);
    console.log(`  Model:   #${opts.modelId}`);
    console.log(`  Pricing: min ${opts.minPaymentUclaw ?? "0"}uclaw, max ${opts.maxTokens ?? "512"} tokens`);
    if (opts.registerProvider) console.log(`  Provider endpoint: ${opts.endpoint ?? "clawchain://local-provider"}`);
    console.log();
  }

  try {
    const msgs = [
      buildSetInferencePricingMsg(account.address, opts),
      ...(opts.registerProvider ? [buildRegisterInferenceProviderMsg(account.address, opts)] : []),
    ];
    const setupRes = await signingClient.signAndBroadcast(account.address, msgs, "auto");
    if (setupRes.code !== 0) {
      throw new Error(`inference setup tx failed (code=${setupRes.code}): ${setupRes.rawLog}`);
    }

    report.setup_tx_hash = setupRes.transactionHash;

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log("Model-token inference configured.");
    console.log(`  TxHash: ${setupRes.transactionHash}`);
  } catch (err) {
    console.error(`Model token inference setup failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelTokenStartJob(opts: ModelTokenStartJobOptions): Promise<void> {
  const { account, signingClient, gasPrice } = await ensureSigner();

  try {
    const msg = buildStartInferenceJobMsg(account.address, opts);
    const res = await signingClient.signAndBroadcast(
      account.address,
      [msg],
      calculateFee(PROVIDER_JOB_GAS, GasPrice.fromString(gasPrice)),
    );
    if (res.code !== 0) {
      throw new Error(`start job tx failed (code=${res.code}): ${res.rawLog}`);
    }

    const report = {
      job_id: opts.jobId,
      provider: account.address,
      start_tx_hash: res.transactionHash,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log("Inference job started.");
    console.log(`  JobID:  ${opts.jobId}`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Model token start job failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelTokenCompleteJob(opts: ModelTokenCompleteJobOptions): Promise<void> {
  const { account, signingClient, gasPrice } = await ensureSigner();

  try {
    const msg = buildCompleteInferenceJobMsg(account.address, opts);
    const res = await signingClient.signAndBroadcast(
      account.address,
      [msg],
      calculateFee(PROVIDER_JOB_GAS, GasPrice.fromString(gasPrice)),
    );
    if (res.code !== 0) {
      throw new Error(`complete job tx failed (code=${res.code}): ${res.rawLog}`);
    }

    const report = {
      job_id: opts.jobId,
      provider: account.address,
      tokens_used: opts.tokensUsed,
      complete_tx_hash: res.transactionHash,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log("Inference job completed.");
    console.log(`  JobID:  ${opts.jobId}`);
    console.log(`  Tokens: ${opts.tokensUsed}`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Model token complete job failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

/**
 * `clawd model-token attest` — provider records a usage attestation on a
 * completed inference job (MsgSubmitUsageAttestation). Provider-gated on chain;
 * sets attestation_hash/attested_output_tokens/attested_at on the job.
 */
export async function runModelTokenAttest(opts: ModelTokenAttestOptions): Promise<void> {
  const { account, signingClient, gasPrice } = await ensureSigner();

  try {
    const msg = buildSubmitUsageAttestationMsg(account.address, opts);
    const res = await signingClient.signAndBroadcast(
      account.address,
      [msg],
      calculateFee(PROVIDER_JOB_GAS, GasPrice.fromString(gasPrice)),
    );
    if (res.code !== 0) {
      throw new Error(`attest tx failed (code=${res.code}): ${res.rawLog}`);
    }

    const report = {
      job_id: opts.jobId,
      provider: account.address,
      output_tokens: opts.outputTokens,
      attestation_hash: opts.attestationHash,
      attest_tx_hash: res.transactionHash,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log("Usage attestation submitted.");
    console.log(`  JobID:   ${opts.jobId}`);
    console.log(`  Tokens:  ${opts.outputTokens}`);
    console.log(`  Hash:    ${opts.attestationHash}`);
    console.log(`  TxHash:  ${res.transactionHash}`);
  } catch (err) {
    console.error(`Model token attest failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

/**
 * `clawd model-token dispute` — original requester disputes a completed
 * inference job (MsgDisputeInferenceJob). Requester-gated on chain; sets
 * disputed/dispute_reason/disputed_at and slashes the provider's reputation.
 */
export async function runModelTokenDispute(opts: ModelTokenDisputeOptions): Promise<void> {
  const { account, signingClient, gasPrice } = await ensureSigner();

  try {
    const msg = buildDisputeInferenceJobMsg(account.address, opts);
    const res = await signingClient.signAndBroadcast(
      account.address,
      [msg],
      calculateFee(PROVIDER_JOB_GAS, GasPrice.fromString(gasPrice)),
    );
    if (res.code !== 0) {
      throw new Error(`dispute tx failed (code=${res.code}): ${res.rawLog}`);
    }

    const report = {
      job_id: opts.jobId,
      requester: account.address,
      reason: opts.reason,
      dispute_tx_hash: res.transactionHash,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log("Inference job dispute submitted.");
    console.log(`  JobID:   ${opts.jobId}`);
    console.log(`  Reason:  ${opts.reason}`);
    console.log(`  TxHash:  ${res.transactionHash}`);
  } catch (err) {
    console.error(`Model token dispute failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelTokenServeOnce(opts: ModelTokenServeOnceOptions): Promise<void> {
  const maxJobs = Number(requirePositiveAmount("--max-jobs", opts.maxJobs ?? "1"));
  const requestedStatus = (opts.status ?? "active").toLowerCase();
  const { account, signingClient, gasPrice, restUrl } = await ensureSigner();
  const fee = calculateFee(PROVIDER_JOB_GAS, GasPrice.fromString(gasPrice));

  const params = new URLSearchParams();
  if (opts.modelId) params.set("model_id", requireNonNegativeInteger("--model-id", opts.modelId));
  if (requestedStatus !== "active" && requestedStatus !== "all") params.set("status", requestedStatus);
  const query = params.toString();
  const url = `${restUrl}/clawchain/modelregistry/v1/inference/jobs${query ? `?${query}` : ""}`;

  try {
    const data = await fetchJson<{ jobs?: InferenceJob[] }>(url);
    const jobs = (data.jobs ?? [])
      .filter((job) => job.provider === account.address)
      .filter((job) => {
        const status = jobStatus(job);
        if (requestedStatus === "all") return true;
        if (requestedStatus === "active") return status === "pending" || status === "running";
        return status === requestedStatus;
      })
      .slice(0, maxJobs);

    const results: Record<string, unknown>[] = [];

    if (!opts.json) {
      console.log("Serving assigned model-token inference jobs once...");
      console.log(`  Provider: ${shortAddr(account.address)}`);
      console.log(`  Matched:  ${jobs.length}`);
      console.log();
    }

    for (const job of jobs) {
      const id = requirePositiveAmount("job_id", jobId(job));
      const before = jobStatus(job);
      const result: Record<string, unknown> = {
        job_id: id,
        model_id: jobModelId(job),
        status_before: before,
      };

      if (opts.dryRun) {
        result.action = before === "pending" ? "would_start_and_complete" : "would_complete";
        results.push(result);
        continue;
      }

      if (before === "pending") {
        const startRes = await signingClient.signAndBroadcast(
          account.address,
          [buildStartInferenceJobMsg(account.address, { jobId: id })],
          fee,
        );
        if (startRes.code !== 0) {
          throw new Error(`start job ${id} failed (code=${startRes.code}): ${startRes.rawLog}`);
        }
        result.start_tx_hash = startRes.transactionHash;
      }

      const output = opts.openrouterModel
        ? await runOpenRouterCompletion(opts.openrouterModel, job)
        : opts.output
        ? renderOutputTemplate(opts.output, job)
        : defaultProviderOutput(job);
      const tokensUsed = estimateTokensUsed(output);
      const completeRes = await signingClient.signAndBroadcast(
        account.address,
        [buildCompleteInferenceJobMsg(account.address, { jobId: id, output, tokensUsed })],
        fee,
      );
      if (completeRes.code !== 0) {
        throw new Error(`complete job ${id} failed (code=${completeRes.code}): ${completeRes.rawLog}`);
      }

      result.complete_tx_hash = completeRes.transactionHash;
      result.tokens_used = tokensUsed;
      result.output_source = opts.openrouterModel ? "openrouter" : opts.output ? "template" : "default";
      results.push(result);

      if (!opts.json) {
        console.log(`Completed job ${id}.`);
        if (result.start_tx_hash) console.log(`  StartTx:    ${String(result.start_tx_hash)}`);
        console.log(`  CompleteTx: ${completeRes.transactionHash}`);
      }
    }

    const report = {
      provider: account.address,
      queried_status: requestedStatus,
      dry_run: Boolean(opts.dryRun),
      jobs: results,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else if (jobs.length === 0) {
      console.log("No assigned jobs to serve.");
    }
  } catch (err) {
    console.error(`Model token serve-once failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelTokenServeLoop(opts: ModelTokenServeLoopOptions): Promise<void> {
  const intervalMs = Number(requireNonNegativeInteger("--interval-ms", opts.intervalMs ?? "5000"));
  const maxCycles = Number(requireNonNegativeInteger("--max-cycles", opts.maxCycles ?? "0"));
  let cycle = 0;

  if (!opts.json) {
    console.log("Starting model-token provider serve loop...");
    console.log(`  Interval: ${intervalMs}ms`);
    console.log(`  Cycles:   ${maxCycles === 0 ? "until stopped" : String(maxCycles)}`);
    console.log();
  }

  while (maxCycles === 0 || cycle < maxCycles) {
    cycle += 1;
    if (!opts.json) {
      console.log(`Serve cycle ${cycle}${maxCycles > 0 ? `/${maxCycles}` : ""}`);
    }

    await runModelTokenServeOnce(opts);

    if (maxCycles > 0 && cycle >= maxCycles) break;
    if (intervalMs > 0) await sleep(intervalMs);
  }
}

export async function runModelTokenCatalog(opts: ModelTokenCatalogOptions): Promise<void> {
  if (opts.json) {
    process.stdout.write(JSON.stringify({ presets: MODEL_TOKEN_PRESETS }, null, 2) + "\n");
    return;
  }

  console.log("Model-token presets:");
  for (const preset of MODEL_TOKEN_PRESETS) {
    console.log(`  ${preset.id}`);
    console.log(`    OpenRouter: ${preset.openrouterModel}`);
    console.log(`    Symbol:     ${preset.symbol}`);
    console.log(`    Context:    ${preset.contextTokens} tokens`);
    console.log(`    Price:      $${preset.inputPriceUsdPerM}/M input, $${preset.outputPriceUsdPerM}/M output`);
  }
}

/** Terminal statuses for a redeemed inference job — stop watching once reached. */
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed"]);

function isTerminalJobStatus(status: string): boolean {
  return TERMINAL_JOB_STATUSES.has(status.toLowerCase());
}

/** Tokens-used field: chain records it as gas_used; tolerate tokens_used too. */
function jobTokensUsed(job: InferenceJob): string {
  const raw = job.gas_used ?? job.gasUsed ?? job.tokens_used ?? job.tokensUsed;
  return raw === undefined || raw === null ? "" : String(raw);
}

/** Unix-seconds timestamp -> ISO string; "-" when unset/0/unparseable. */
function formatJobTimestamp(value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "-";
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  return new Date(seconds * 1000).toISOString();
}

function printJobStatus(job: InferenceJob): void {
  const status = jobStatus(job) || "-";
  console.log(`Inference job #${jobId(job) || "-"}`);
  console.log(`  Status:      ${status}`);
  console.log(`  Model:       #${jobModelId(job) || "-"} v${String(job.model_version ?? job.modelVersion ?? "0")}`);
  console.log(`  Requester:   ${job.requester ? shortAddr(job.requester) : "-"}`);
  console.log(`  Provider:    ${job.provider ? shortAddr(job.provider) : "(unassigned)"}`);
  console.log(`  Input:       ${job.input ?? "-"}`);
  console.log(`  Output:      ${job.output?.trim() ? job.output : "(pending)"}`);
  console.log(`  Tokens Used: ${jobTokensUsed(job) || "-"}`);
  console.log(`  Payment:     ${job.payment ?? "-"}`);
  console.log(`  Created:     ${formatJobTimestamp(job.created_at ?? job.createdAt)}`);
  console.log(`  Started:     ${formatJobTimestamp(job.started_at ?? job.startedAt)}`);
  console.log(`  Completed:   ${formatJobTimestamp(job.completed_at ?? job.completedAt)}`);
  const errorMsg = job.error_msg ?? job.errorMsg;
  if (errorMsg?.trim()) console.log(`  Error:       ${errorMsg}`);

  // Usage attestation (MsgSubmitUsageAttestation, provider-gated).
  const attestationHash = job.attestation_hash ?? job.attestationHash;
  const attestedOutputTokens = jobAttestedOutputTokens(job);
  console.log(`  Attest Hash: ${attestationHash?.trim() ? attestationHash : "(none)"}`);
  console.log(`  Attest Tok:  ${attestedOutputTokens || "-"}`);
  console.log(`  Attested:    ${formatJobTimestamp(job.attested_at ?? job.attestedAt)}`);

  // Dispute (MsgDisputeInferenceJob, requester-gated).
  const disputed = Boolean(job.disputed);
  console.log(`  Disputed:    ${disputed ? "yes" : "no"}`);
  const disputeReason = job.dispute_reason ?? job.disputeReason;
  console.log(`  Dispute Why: ${disputeReason?.trim() ? disputeReason : "(none)"}`);
  console.log(`  Disputed At: ${formatJobTimestamp(job.disputed_at ?? job.disputedAt)}`);
}

/** Attested output tokens (0/unset rendered as "-" by the caller). */
function jobAttestedOutputTokens(job: InferenceJob): string {
  const raw = job.attested_output_tokens ?? job.attestedOutputTokens;
  if (raw === undefined || raw === null || raw === "" || Number(raw) === 0) return "";
  return String(raw);
}

/**
 * `clawd model-token job-status` — read-only tracker for a redeemed inference
 * job. Queries the modelregistry single-job REST endpoint and prints status,
 * assigned provider, input/output, tokens used, and timestamps (snake/camel
 * tolerant). With --watch it polls until the job reaches a terminal status
 * (completed/failed), mirroring the serve-loop cadence; per-cycle errors are
 * logged and the loop continues. No signing is performed.
 */
export async function runModelTokenJobStatus(opts: ModelTokenJobStatusOptions): Promise<void> {
  const id = requirePositiveAmount("--job-id", opts.jobId);
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
  const url = `${restUrl}/clawchain/modelregistry/v1/inference/job/${encodeURIComponent(id)}`;

  const fetchJob = async (): Promise<InferenceJob> => {
    const data = await fetchJson<{ job?: InferenceJob }>(url);
    const job = data.job ?? (data as InferenceJob);
    if (!job || jobId(job) === "") {
      throw new Error(`inference job ${id} not found.`);
    }
    return job;
  };

  // Single-shot read.
  if (!opts.watch) {
    try {
      const job = await fetchJob();
      if (opts.json) {
        process.stdout.write(JSON.stringify(job, null, 2) + "\n");
        return;
      }
      printJobStatus(job);
    } catch (err) {
      console.error(`Model token job-status failed: ${String(err)}`);
      process.exit(1);
    }
    return;
  }

  // Watch mode: poll until terminal status (mirrors serve-loop cadence).
  const intervalMs = Number(requireNonNegativeInteger("--interval-ms", opts.intervalMs ?? "4000"));
  const maxCycles = Number(requireNonNegativeInteger("--max-cycles", opts.maxCycles ?? "0"));
  let cycle = 0;

  if (!opts.json) {
    console.log(`Watching inference job #${id} until completed/failed...`);
    console.log(`  Interval: ${intervalMs}ms`);
    console.log(`  Cycles:   ${maxCycles === 0 ? "until terminal" : String(maxCycles)}`);
    console.log();
  }

  while (maxCycles === 0 || cycle < maxCycles) {
    cycle += 1;
    try {
      const job = await fetchJob();
      const status = jobStatus(job);
      if (opts.json) {
        process.stdout.write(JSON.stringify({ cycle, job }, null, 2) + "\n");
      } else {
        console.log(`Cycle ${cycle}${maxCycles > 0 ? `/${maxCycles}` : ""}`);
        printJobStatus(job);
        console.log();
      }
      if (isTerminalJobStatus(status)) {
        if (!opts.json) console.log(`Job #${id} reached terminal status "${status}".`);
        return;
      }
    } catch (err) {
      // Per-cycle errors are logged but do not abort the watch loop.
      console.error(`Cycle ${cycle} query failed: ${String(err)}`);
    }

    if (maxCycles > 0 && cycle >= maxCycles) break;
    if (intervalMs > 0) await sleep(intervalMs);
  }

  if (!opts.json) console.log(`Stopped watching job #${id} (max cycles reached without terminal status).`);
}
