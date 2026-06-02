/**
 * Pure builders for the inference job settlement lifecycle, surfaced on the
 * "Redeem for Inference" page. The browser never signs — it only previews the
 * exact `clawchaind tx modelregistry ...` commands an operator runs from a host
 * with their signer key.
 *
 * Two chain-side autocli tx commands back these builders:
 *   - submit-usage-attestation [job-id] [output-tokens] [attestation-hash]
 *       (provider-gated; records attestation_hash / attested_output_tokens)
 *   - dispute-inference-job [job-id] [reason]
 *       (requester-gated; sets disputed / dispute_reason, slashes the provider)
 *
 * Mirrors the validate-then-shell-quote pattern in launch-command.ts /
 * redeem-command.ts and reuses the same `quote()` helper shape.
 */

/** Standard signer/broadcast flags appended to every previewed tx. */
const TX_FLAGS = "--chain-id clawchain-local --gas auto --gas-adjustment 1.5 --fees 500uclaw -y";

/** Shell-quote a value the same way launch-command.ts / redeem-command.ts do. */
function quote(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function requirePositiveInteger(label: string, value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || !/^\d+$/.test(trimmed) || trimmed === "0") {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return trimmed;
}

export interface AttestCommandInput {
  /** On-chain inference job id. */
  jobId: string;
  /** Output tokens claimed in the usage attestation. */
  outputTokens: string;
  /** Attestation hash (opaque content/usage digest). */
  attestationHash: string;
  /** Provider key name / address passed to --from. */
  provider: string;
}

export interface DisputeCommandInput {
  /** On-chain inference job id. */
  jobId: string;
  /** Free-text dispute reason. */
  reason: string;
  /** Requester key name / address passed to --from. */
  requester: string;
}

/**
 * Build the exact `clawchaind tx modelregistry submit-usage-attestation`
 * command. Validates the job id + output tokens (positive integers) and a
 * non-empty attestation hash, throwing a user-friendly error on bad input.
 */
export function buildAttestCommand(input: AttestCommandInput): string {
  const jobId = requirePositiveInteger("Job id", input.jobId);
  const outputTokens = requirePositiveInteger("Output tokens", input.outputTokens);

  const hash = (input.attestationHash ?? "").trim();
  if (!hash) {
    throw new Error("Enter an attestation hash.");
  }

  const from = (input.provider ?? "").trim();
  if (!from) {
    throw new Error("Enter the provider key (--from).");
  }

  const parts: string[] = [
    "clawchaind tx modelregistry submit-usage-attestation",
    jobId,
    outputTokens,
    quote(hash),
    `--from ${quote(from)}`,
    TX_FLAGS,
  ];

  return parts.join(" ");
}

/**
 * Build the exact `clawchaind tx modelregistry dispute-inference-job` command.
 * Validates the job id and a non-empty reason, throwing on bad input.
 */
export function buildDisputeCommand(input: DisputeCommandInput): string {
  const jobId = requirePositiveInteger("Job id", input.jobId);

  const reason = (input.reason ?? "").trim();
  if (!reason) {
    throw new Error("Enter a dispute reason.");
  }

  const from = (input.requester ?? "").trim();
  if (!from) {
    throw new Error("Enter the requester key (--from).");
  }

  // Reason is always quoted so multi-word reasons stay a single arg.
  const parts: string[] = [
    "clawchaind tx modelregistry dispute-inference-job",
    jobId,
    `"${reason.replace(/"/g, '\\"')}"`,
    `--from ${quote(from)}`,
    TX_FLAGS,
  ];

  return parts.join(" ");
}
