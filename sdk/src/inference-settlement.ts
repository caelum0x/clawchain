/**
 * Provider-attestation + requester-dispute settlement for @clawchain/sdk.
 *
 * This is the SDK mirror of the chain-side modelregistry settlement txs that
 * close out a completed inference job (`clawchaind tx modelregistry
 * submit-usage-attestation ...` / `... dispute-inference-job ...`):
 *
 *   - The PROVIDER attests to the work it served via {@link InferenceSettlement.submitUsageAttestation}
 *     (broadcasts `MsgSubmitUsageAttestation`), which records
 *     `attestation_hash` / `attested_output_tokens` / `attested_at` on the job.
 *   - The original REQUESTER disputes a job it is unhappy with via
 *     {@link InferenceSettlement.disputeInferenceJob} (broadcasts
 *     `MsgDisputeInferenceJob`), which records `disputed` / `dispute_reason` /
 *     `disputed_at` and slashes the provider's reputation.
 *
 * Like {@link InferenceRedeemer} in `inference-redeem.ts`, this is PURE
 * ORCHESTRATION — it adds no new tx plumbing. Each msg is taken through the
 * structural {@link InferenceSettlementBackend} seam (same convention as
 * `InferenceRedeemerBackend`): a real caller wires the seam to a signer that
 * broadcasts the msg, and tests inject a fake.
 *
 * The on-chain msg shapes this seam is expected to broadcast (field names mirror
 * the proto so a backend can pass them through verbatim) are:
 *   - usage attestation:
 *       typeUrl `/clawchain.modelregistry.v1.MsgSubmitUsageAttestation`
 *       value   `{ creator, jobId, outputTokens, attestationHash }`
 *         (creator is the connected provider signer)
 *   - dispute:
 *       typeUrl `/clawchain.modelregistry.v1.MsgDisputeInferenceJob`
 *       value   `{ creator, jobId, reason }`
 *         (creator is the connected requester signer)
 *
 * All inputs are validated at the boundary (fail fast).
 */

// ---------------------------------------------------------------------------
// Type URLs (mirroring the modelregistry settlement msgs)
// ---------------------------------------------------------------------------

/** Type URL for `MsgSubmitUsageAttestation` (modelregistry module). */
export const MSG_SUBMIT_USAGE_ATTESTATION_TYPE_URL =
  "/clawchain.modelregistry.v1.MsgSubmitUsageAttestation";
/** Type URL for `MsgDisputeInferenceJob` (modelregistry module). */
export const MSG_DISPUTE_INFERENCE_JOB_TYPE_URL =
  "/clawchain.modelregistry.v1.MsgDisputeInferenceJob";

// ---------------------------------------------------------------------------
// Backend seam (structural — a signer satisfies it)
// ---------------------------------------------------------------------------

/**
 * The `MsgSubmitUsageAttestation` value the backend broadcasts. Field names
 * mirror the on-chain msg shape (the `creator` signer is the connected provider,
 * filled in by the backend from {@link InferenceSettlementBackend.getAddress}).
 */
export interface UsageAttestationRequest {
  /** The completed inference job to attest (decimal string). */
  jobId: string;
  /** Output tokens the provider served for the job (non-negative integer string). */
  outputTokens: string;
  /** Opaque hash committing to the served output. */
  attestationHash: string;
}

/**
 * The `MsgDisputeInferenceJob` value the backend broadcasts. Field names mirror
 * the on-chain msg shape (the `creator` signer is the connected requester).
 */
export interface DisputeRequest {
  /** The inference job to dispute (decimal string). */
  jobId: string;
  /** Human-readable reason for the dispute. */
  reason: string;
}

/**
 * The minimal backend the settlement needs: a connectable signer that can
 * broadcast each settlement msg. `ClawChainClient` does not expose these
 * modelregistry settlement msgs today, so callers supply this (a thin wrapper
 * over a signer broadcasting `MsgSubmitUsageAttestation` / `MsgDisputeInferenceJob`);
 * tests inject a fake. Same connect/getAddress/broadcast convention as
 * `InferenceRedeemerBackend`.
 */
export interface InferenceSettlementBackend {
  /** Connect the underlying signer (required before any write). */
  connect(): Promise<void>;
  /** The connected signer's bech32 address (provider or requester, per call). */
  getAddress(): string;
  /** Broadcast `MsgSubmitUsageAttestation`; return the tx hash. */
  submitUsageAttestation(request: UsageAttestationRequest): Promise<{ transactionHash: string }>;
  /** Broadcast `MsgDisputeInferenceJob`; return the tx hash. */
  disputeInferenceJob(request: DisputeRequest): Promise<{ transactionHash: string }>;
}

// ---------------------------------------------------------------------------
// Options + result shapes
// ---------------------------------------------------------------------------

/** Options for {@link InferenceSettlement.submitUsageAttestation}. */
export interface SubmitUsageAttestationOptions {
  /** REQUIRED — the completed inference job to attest (positive integer string). */
  jobId: string;
  /** REQUIRED — output tokens served (positive integer string). */
  outputTokens: string;
  /** REQUIRED — opaque hash committing to the served output (non-empty). */
  attestationHash: string;
}

/** Options for {@link InferenceSettlement.disputeInferenceJob}. */
export interface DisputeInferenceJobOptions {
  /** REQUIRED — the inference job to dispute (positive integer string). */
  jobId: string;
  /** REQUIRED — human-readable reason for the dispute (non-empty). */
  reason: string;
}

/** Typed result of a settlement broadcast (attestation or dispute). */
export interface InferenceSettlementResult {
  /** The hash of the broadcast settlement tx. */
  txHash: string;
}

/** Constructor options for {@link InferenceSettlement}. */
export interface InferenceSettlementOptions {
  /** REQUIRED — the attestation + dispute backend. */
  backend: InferenceSettlementBackend;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Drives the two modelregistry settlement msgs that close out a completed
 * inference job: a provider's usage attestation and a requester's dispute.
 * Holds no tx logic of its own — it validates inputs, sequences the backend,
 * and assembles typed results.
 */
export class InferenceSettlement {
  private readonly backend: InferenceSettlementBackend;

  constructor(options: InferenceSettlementOptions) {
    if (!options || !options.backend) {
      throw new Error("InferenceSettlement: a backend (attestation + dispute) is required");
    }
    this.backend = options.backend;
  }

  /** Connect the underlying backend (required before any write). */
  async connect(): Promise<void> {
    await this.backend.connect();
  }

  /** The connected signer's bech32 address (provider or requester, per call). */
  getAddress(): string {
    return this.backend.getAddress();
  }

  /**
   * Broadcast `MsgSubmitUsageAttestation` (provider-gated) to record the
   * served output's hash and token count on a completed job. Returns the tx hash.
   */
  async submitUsageAttestation(
    options: SubmitUsageAttestationOptions,
  ): Promise<InferenceSettlementResult> {
    const jobId = requirePositiveUint(options?.jobId, "submitUsageAttestation.jobId");
    const outputTokens = requirePositiveUint(
      options?.outputTokens,
      "submitUsageAttestation.outputTokens",
    );
    const attestationHash = requireNonEmpty(
      options?.attestationHash,
      "submitUsageAttestation.attestationHash",
    );

    const res = await this.backend.submitUsageAttestation({
      jobId,
      outputTokens,
      attestationHash,
    });
    requireTxHash(res?.transactionHash, "submitUsageAttestation");

    return { txHash: res.transactionHash };
  }

  /**
   * Broadcast `MsgDisputeInferenceJob` (requester-gated) to flag a job as
   * disputed (which slashes the provider's reputation). Returns the tx hash.
   */
  async disputeInferenceJob(
    options: DisputeInferenceJobOptions,
  ): Promise<InferenceSettlementResult> {
    const jobId = requirePositiveUint(options?.jobId, "disputeInferenceJob.jobId");
    const reason = requireNonEmpty(options?.reason, "disputeInferenceJob.reason");

    const res = await this.backend.disputeInferenceJob({ jobId, reason });
    requireTxHash(res?.transactionHash, "disputeInferenceJob");

    return { txHash: res.transactionHash };
  }
}

/** Factory mirroring `createInferenceRedeemer` — returns an {@link InferenceSettlement}. */
export function createInferenceSettlement(
  options: InferenceSettlementOptions,
): InferenceSettlement {
  return new InferenceSettlement(options);
}

// ---------------------------------------------------------------------------
// Validation helpers (fail fast at the boundary)
// ---------------------------------------------------------------------------

/** Coerce a Uint to a canonical non-negative integer string. */
function requireUint(value: string | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`InferenceSettlement: ${field} is required`);
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`InferenceSettlement: ${field} must be a non-negative integer string`);
  }
  return BigInt(trimmed).toString();
}

/** Like {@link requireUint} but rejects zero. */
function requirePositiveUint(value: string | undefined, field: string): string {
  const normalized = requireUint(value, field);
  if (normalized === "0") {
    throw new Error(`InferenceSettlement: ${field} must be a positive integer string`);
  }
  return normalized;
}

/** Require a non-empty trimmed string. */
function requireNonEmpty(value: string | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") throw new Error(`InferenceSettlement: ${field} is required`);
  return value as string;
}

/** Guard that a write step returned a usable tx hash. */
function requireTxHash(hash: string | undefined, step: string): void {
  if (!hash || hash.trim() === "") {
    throw new Error(`InferenceSettlement: ${step} did not return a transaction hash`);
  }
}
