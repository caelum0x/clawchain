/**
 * "Redeem a model token for real inference" orchestrator for @clawchain/sdk.
 *
 * This is the SDK mirror of the clawd `model-token redeem` path
 * (`cmd/clawd/src/commands/model-token.ts` -> `runModelTokenRedeem`): in ONE tx
 * it BURNS model tokens (tokenfactory `MsgBurn`) and opens a modelregistry
 * inference job (`MsgSubmitInferenceJob`). A provider then serves the job and the
 * holder reads the completed job's output via {@link InferenceRedeemer.jobStatus}.
 *
 * Like {@link ModelLaunch}, this is PURE ORCHESTRATION — it adds no new tx
 * plumbing. The two msgs are atomic (one tx), so they are taken through a
 * structural {@link InferenceRedeemerBackend} seam (same convention as
 * {@link ModelLaunchTokenBackend} in `model-launch.ts` and the backend interfaces
 * in `model-vault.ts` / `model-vault-deploy.ts`). A real caller wires the seam to
 * a signer that broadcasts the `MsgBurn` + `MsgSubmitInferenceJob` pair in a
 * single tx (mirroring the clawd builders `buildBurnMsg` +
 * `buildSubmitInferenceJobMsg`); tests inject a fake.
 *
 * For reference, the clawd msg shapes this seam is expected to broadcast are:
 *   - tokenfactory burn:
 *       typeUrl `/osmosis.tokenfactory.v1beta1.MsgBurn`
 *       value   `{ sender, amount: { denom, amount }, burnFromAddress: sender }`
 *   - modelregistry submit:
 *       typeUrl `/clawchain.modelregistry.v1.MsgSubmitInferenceJob`
 *       value   `{ requester, modelId, modelVersion, input, maxTokens, temperature, payment }`
 *
 * The denom is derived as `factory/<issuer>/<subdenom>` to match the clawd
 * `model-token issue` path, unless an explicit `denom` is supplied.
 *
 * All inputs are validated at the boundary (fail fast).
 */

// ---------------------------------------------------------------------------
// Defaults mirroring the clawd redeem path
// ---------------------------------------------------------------------------

/** Default max output tokens when {@link InferenceRedeemOptions.maxTokens} is omitted. */
export const DEFAULT_INFERENCE_MAX_TOKENS = "512";
/** Default sampling temperature when {@link InferenceRedeemOptions.temperature} is omitted. */
export const DEFAULT_INFERENCE_TEMPERATURE = "0.7";
/** Default escrowed payment (uclaw) when {@link InferenceRedeemOptions.paymentUclaw} is omitted. */
export const DEFAULT_INFERENCE_PAYMENT = "0";

// ---------------------------------------------------------------------------
// Backend seam (structural — a signer satisfies it)
// ---------------------------------------------------------------------------

/**
 * The model-token + inference-job pair that the backend burns and submits
 * together in ONE tx. Field names mirror the on-chain msg shapes the clawd
 * builders produce, so a backend can pass them through verbatim.
 */
export interface InferenceRedeemRequest {
  /** Burn this many base units of {@link denom} (tokenfactory `MsgBurn.amount`). */
  burn: { denom: string; amount: string };
  /** modelregistry `MsgSubmitInferenceJob` value (requester is the connected signer). */
  job: {
    modelId: string;
    modelVersion: string;
    input: string;
    maxTokens: string;
    temperature: string;
    payment: string;
  };
}

/** Typed status of a submitted inference job (a normalized read view). */
export interface JobStatus {
  /** The job id (decimal string). */
  jobId: string;
  /** The model the job targets. */
  modelId: string;
  /** Address that submitted the job. */
  requester: string;
  /** Provider that (will) serve the job; empty until assigned. */
  provider: string;
  /** Original prompt/input. */
  input: string;
  /** Completed output; empty until the provider completes the job. */
  output: string;
  /** Lifecycle: "pending" | "running" | "completed" | "failed" | "timeout" (lower-cased). */
  status: string;
  /** True once the provider has completed the job and output is readable. */
  completed: boolean;
}

/**
 * The minimal backend the redeemer needs: a connectable signer that can burn +
 * submit a job atomically and read a job back. `ClawChainClient` does not expose
 * tokenfactory burn today, so callers supply this (a thin wrapper over a signer
 * broadcasting the `MsgBurn` + `MsgSubmitInferenceJob` pair, and `getInferenceJob`
 * for the read); tests inject a fake.
 */
export interface InferenceRedeemerBackend {
  /** Connect the underlying signer (required before any write). */
  connect(): Promise<void>;
  /** The connected signer's bech32 address (the redeemer / job requester). */
  getAddress(): string;
  /** Broadcast `MsgBurn` + `MsgSubmitInferenceJob` in ONE tx; return the tx hash (+ parsed job id when available). */
  redeem(request: InferenceRedeemRequest): Promise<{ transactionHash: string; jobId?: string }>;
  /** Read a single inference job by id (REST `inference_job/<id>` surface). */
  getInferenceJob(jobId: string): Promise<RawInferenceJob>;
}

/**
 * The subset of fields the redeemer reads off a job. Accepts both snake_case
 * (raw REST) and camelCase (SDK `InferenceJob`) so either backend shape works.
 */
export interface RawInferenceJob {
  job_id?: string | number;
  jobId?: string | number;
  model_id?: string | number;
  modelId?: string | number;
  requester?: string;
  provider?: string;
  input?: string;
  output?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Options + result shapes
// ---------------------------------------------------------------------------

/** Options for {@link InferenceRedeemer.redeem}. */
export interface InferenceRedeemOptions {
  /** REQUIRED — modelregistry model id to run inference against (non-negative integer string). */
  modelId: string;
  /** REQUIRED — the prompt/input for the inference job. */
  input: string;
  /** REQUIRED — model-token base units to burn (positive integer string). */
  amount: string;

  /**
   * Full `factory/<issuer>/<subdenom>` model token denom to burn. Provide this OR
   * {@link subdenom} (the denom is then derived as `factory/<issuer>/<subdenom>`).
   */
  denom?: string;
  /** Bare tokenfactory subdenom; the denom is derived as `factory/<issuer>/<subdenom>`. */
  subdenom?: string;

  /** Model version to target. Defaults to `0`. */
  modelVersion?: string;
  /** Max output tokens. Defaults to {@link DEFAULT_INFERENCE_MAX_TOKENS}. */
  maxTokens?: string;
  /** Sampling temperature. Defaults to {@link DEFAULT_INFERENCE_TEMPERATURE}. */
  temperature?: string;
  /** Escrowed payment in uclaw. Defaults to {@link DEFAULT_INFERENCE_PAYMENT}. */
  paymentUclaw?: string;
}

/** Typed result of an {@link InferenceRedeemer.redeem} run. */
export interface InferenceRedeemResult {
  /** The hash of the burn+submit tx. */
  txHash: string;
  /** The submitted job id, when parseable from the tx events. */
  jobId?: string;
  /** The model token denom that was burned. */
  denom: string;
  /** The burned base-unit amount. */
  amount: string;
}

/** Constructor options for {@link InferenceRedeemer}. */
export interface InferenceRedeemerOptions {
  /** REQUIRED — the burn + submit-job backend. */
  backend: InferenceRedeemerBackend;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Composes a model-token burn with an inference-job submission into one
 * {@link redeem} call, then exposes a {@link jobStatus} read for the holder to
 * poll the completed output. Holds no tx logic of its own — it validates inputs,
 * derives the denom, sequences the backend, and assembles typed results.
 */
export class InferenceRedeemer {
  private readonly backend: InferenceRedeemerBackend;

  constructor(options: InferenceRedeemerOptions) {
    if (!options || !options.backend) {
      throw new Error("InferenceRedeemer: a backend (burn + submit-job) is required");
    }
    this.backend = options.backend;
  }

  /** Connect the underlying backend (required before any write). */
  async connect(): Promise<void> {
    await this.backend.connect();
  }

  /** The connected signer's bech32 address (the redeemer / job requester). */
  getAddress(): string {
    return this.backend.getAddress();
  }

  /**
   * Burn model tokens and open an inference job in ONE tx, mirroring the clawd
   * `model-token redeem` path. Returns the tx hash, the parsed job id (when
   * available), and the burned denom/amount.
   */
  async redeem(options: InferenceRedeemOptions): Promise<InferenceRedeemResult> {
    const modelId = requireUint(options.modelId, "redeem.modelId");
    const input = requireNonEmpty(options.input, "redeem.input");
    const amount = requirePositiveUint(options.amount, "redeem.amount");
    const modelVersion = requireUint(options.modelVersion ?? "0", "redeem.modelVersion");
    const maxTokens = requirePositiveUint(
      options.maxTokens ?? DEFAULT_INFERENCE_MAX_TOKENS,
      "redeem.maxTokens",
    );
    const temperature = requireNonEmpty(
      options.temperature ?? DEFAULT_INFERENCE_TEMPERATURE,
      "redeem.temperature",
    );
    const payment = requireUint(options.paymentUclaw ?? DEFAULT_INFERENCE_PAYMENT, "redeem.paymentUclaw");

    const issuer = this.backend.getAddress();
    const denom = resolveModelDenom(issuer, options);

    const res = await this.backend.redeem({
      burn: { denom, amount },
      job: { modelId, modelVersion, input, maxTokens, temperature, payment },
    });
    requireTxHash(res?.transactionHash, "redeem");

    const result: InferenceRedeemResult = {
      txHash: res.transactionHash,
      denom,
      amount,
    };
    const jobId = normalizeOptionalUint(res.jobId);
    if (jobId !== undefined) result.jobId = jobId;
    return result;
  }

  /**
   * Read a submitted inference job by id and normalize it to a typed
   * {@link JobStatus}. Once `status === "completed"` (or `completed` is true), the
   * holder can read `output` — the result of the inference the burn paid for.
   */
  async jobStatus(jobId: string): Promise<JobStatus> {
    const id = requirePositiveUint(jobId, "jobStatus.jobId");
    const raw = await this.backend.getInferenceJob(id);
    return normalizeJobStatus(raw, id);
  }
}

/** Factory mirroring `createModelLaunch` — returns an {@link InferenceRedeemer}. */
export function createInferenceRedeemer(options: InferenceRedeemerOptions): InferenceRedeemer {
  return new InferenceRedeemer(options);
}

// ---------------------------------------------------------------------------
// Normalization + validation helpers (fail fast at the boundary)
// ---------------------------------------------------------------------------

/** Normalize a raw job (snake_case REST or camelCase SDK) into a typed {@link JobStatus}. */
function normalizeJobStatus(raw: RawInferenceJob | undefined, fallbackId: string): JobStatus {
  const status = String(raw?.status ?? "").toLowerCase();
  return {
    jobId: String(raw?.job_id ?? raw?.jobId ?? fallbackId),
    modelId: String(raw?.model_id ?? raw?.modelId ?? ""),
    requester: String(raw?.requester ?? ""),
    provider: String(raw?.provider ?? ""),
    input: String(raw?.input ?? ""),
    output: String(raw?.output ?? ""),
    status,
    completed: status === "completed",
  };
}

/**
 * Resolve the model token denom to burn: an explicit `denom`, or the
 * `factory/<issuer>/<subdenom>` derivation from a bare `subdenom`.
 */
function resolveModelDenom(issuer: string, options: InferenceRedeemOptions): string {
  const explicit = (options.denom ?? "").trim();
  if (explicit !== "") return explicit;

  const subdenom = (options.subdenom ?? "").trim();
  if (subdenom === "") {
    throw new Error(
      "InferenceRedeemer: provide redeem.denom (a full factory/ denom) or redeem.subdenom (the bare subdenom)",
    );
  }
  if (subdenom.startsWith("factory/")) {
    throw new Error("InferenceRedeemer: redeem.subdenom must be a bare subdenom, not a full factory/ denom");
  }
  if (!issuer || issuer.trim() === "") {
    throw new Error("InferenceRedeemer: backend.getAddress() returned no issuer to derive the factory denom");
  }
  return `factory/${issuer}/${subdenom}`;
}

/** Coerce a Uint128 amount to a canonical non-negative integer string. */
function requireUint(value: string | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`InferenceRedeemer: ${field} is required`);
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`InferenceRedeemer: ${field} must be a non-negative integer string (base units)`);
  }
  return BigInt(trimmed).toString();
}

/** Like {@link requireUint} but rejects zero. */
function requirePositiveUint(value: string | undefined, field: string): string {
  const normalized = requireUint(value, field);
  if (normalized === "0") {
    throw new Error(`InferenceRedeemer: ${field} must be a positive integer string (base units)`);
  }
  return normalized;
}

/** Normalize an optional job id (string or number) to a canonical uint string, or undefined. */
function normalizeOptionalUint(value: string | number | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (trimmed === "" || !/^[0-9]+$/.test(trimmed)) return undefined;
  return BigInt(trimmed).toString();
}

/** Require a non-empty trimmed string. */
function requireNonEmpty(value: string | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`InferenceRedeemer: ${field} is required`);
  return value as string;
}

/** Guard that a write step returned a usable tx hash. */
function requireTxHash(hash: string | undefined, step: string): void {
  if (!hash || hash.trim() === "") {
    throw new Error(`InferenceRedeemer: ${step} did not return a transaction hash`);
  }
}
