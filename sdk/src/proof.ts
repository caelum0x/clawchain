/**
 * ProofGenerator – wraps the `clawproof` Go binary for ZK proof operations.
 *
 * All methods spawn the binary via `child_process.execFile`, parse the JSON
 * output, and return typed results.  The binary must be installed and
 * accessible on `$PATH` or at the configured absolute path.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type {
  ProofGeneratorOptions,
  CommitmentOutput,
  NullifierOutput,
  ShieldDataOutput,
  UnshieldProofParams,
  TransferProofParams,
  ProofOutput,
} from "./types.js";
import { DEFAULT_PROOF_BINARY, DEFAULT_PROOF_TIMEOUT_MS } from "./constants.js";

const execFile = promisify(execFileCb);

export class ProofGenerator {
  private readonly binaryPath: string;
  private readonly workDir: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: ProofGeneratorOptions = {}) {
    this.binaryPath = options.binaryPath ?? DEFAULT_PROOF_BINARY;
    this.workDir = options.workDir;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_PROOF_TIMEOUT_MS;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Run the one-time trusted setup for the ZK circuits.
   *
   * Equivalent to: `clawproof setup`
   */
  async setup(): Promise<void> {
    await this.exec(["setup"]);
  }

  /**
   * Generate a Pedersen-style commitment: `commitment = MiMC(amount, blinding)`.
   *
   * Equivalent to: `clawproof commitment --amount <amount> --blinding <blinding>`
   *
   * @param amount   - Amount value (decimal string).
   * @param blinding - Blinding factor (hex string).
   * @returns Commitment data including the commitment hash.
   */
  async generateCommitment(amount: string, blinding: string): Promise<CommitmentOutput> {
    const result = await this.exec([
      "commitment",
      "--amount",
      amount,
      "--blinding",
      blinding,
    ]);
    return this.parseJson<CommitmentOutput>(result);
  }

  /**
   * Generate a nullifier for a commitment.
   *
   * Equivalent to: `clawproof nullifier --secret <secret> --commitment <commitment>`
   *
   * @param secret     - Secret known only to the owner (hex string).
   * @param commitment - The commitment hash to nullify (hex string).
   * @returns Nullifier data.
   */
  async generateNullifier(secret: string, commitment: string): Promise<NullifierOutput> {
    const result = await this.exec([
      "nullifier",
      "--secret",
      secret,
      "--commitment",
      commitment,
    ]);
    return this.parseJson<NullifierOutput>(result);
  }

  /**
   * Generate all data needed to shield tokens (commitment + blinding + secret).
   *
   * Equivalent to: `clawproof shield --amount <amount> --blinding <blinding>`
   *
   * @param amount   - Amount to shield (decimal string).
   * @param blinding - Blinding factor (hex string).  If empty, the binary
   *                   generates a random one.
   * @returns Shield data including commitment, blinding, and secret.
   */
  async generateShieldData(amount: string, blinding?: string): Promise<ShieldDataOutput> {
    const args = ["shield", "--amount", amount];
    if (blinding) {
      args.push("--blinding", blinding);
    }
    const result = await this.exec(args);
    return this.parseJson<ShieldDataOutput>(result);
  }

  /**
   * Generate a Groth16 proof for an unshield operation.
   *
   * Equivalent to: `clawproof unshield-proof --params <json>`
   *
   * @param params - All private and public inputs for the unshield circuit.
   * @returns The serialised proof and public inputs.
   */
  async generateUnshieldProof(params: UnshieldProofParams): Promise<ProofOutput> {
    const result = await this.exec([
      "unshield-proof",
      "--params",
      JSON.stringify(params),
    ]);
    return this.parseJson<ProofOutput>(result);
  }

  /**
   * Generate a Groth16 proof for a private transfer.
   *
   * Equivalent to: `clawproof transfer-proof --params <json>`
   *
   * @param params - All private and public inputs for the transfer circuit.
   * @returns The serialised proof and public inputs.
   */
  async generateTransferProof(params: TransferProofParams): Promise<ProofOutput> {
    const result = await this.exec([
      "transfer-proof",
      "--params",
      JSON.stringify(params),
    ]);
    return this.parseJson<ProofOutput>(result);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Execute the clawproof binary with the given arguments.
   *
   * @returns stdout as a string.
   * @throws On non-zero exit code or timeout.
   */
  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout, stderr } = await execFile(this.binaryPath, args, {
        cwd: this.workDir,
        timeout: this.timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
        env: { ...process.env },
      });

      if (stderr && stderr.trim().length > 0) {
        // The binary may write logs to stderr; we only throw if stdout is empty.
        if (!stdout || stdout.trim().length === 0) {
          throw new Error(
            `ProofGenerator: clawproof ${args[0]} produced no output. stderr: ${stderr.trim()}`,
          );
        }
      }

      return stdout;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `ProofGenerator: failed to execute "clawproof ${args.join(" ")}": ${errMsg}`,
      );
    }
  }

  /**
   * Parse a JSON string into the expected type.
   *
   * @throws On invalid JSON with a descriptive message.
   */
  private parseJson<T>(raw: string): T {
    try {
      return JSON.parse(raw.trim()) as T;
    } catch {
      throw new Error(
        `ProofGenerator: failed to parse JSON output from clawproof. Raw output: ${raw.slice(0, 500)}`,
      );
    }
  }
}
