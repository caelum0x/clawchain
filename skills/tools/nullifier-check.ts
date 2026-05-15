/**
 * nullifier-check tool -- Check if a nullifier has been spent on-chain.
 *
 * Nullifiers are the double-spend prevention mechanism in the ZK UTXO
 * model.  When a shielded commitment is spent, its nullifier is recorded
 * on-chain.  This tool queries the nullifier set to determine whether a
 * given nullifier has already been used.  Read-only; no mnemonic required.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { readOnlyClientOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NullifierCheckParams {
  /** Hex-encoded nullifier hash to check. */
  nullifier: string;
}

export interface NullifierCheckResult {
  success: boolean;
  /** The queried nullifier. */
  nullifier: string;
  /** Whether the nullifier has already been recorded (i.e. the commitment is spent). */
  spent: boolean;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Check whether a nullifier has been recorded on the ClawChain shielded pool.
 *
 * If `spent` is true, the commitment associated with this nullifier has
 * already been consumed and cannot be used again.
 *
 * @param params - The nullifier hash to check.
 * @returns Whether the nullifier is spent, or an error.
 */
export default async function nullifierCheck(
  params: NullifierCheckParams,
): Promise<NullifierCheckResult> {
  if (!params.nullifier) {
    return {
      success: false,
      nullifier: "",
      spent: false,
      error: "Nullifier hash is required. Provide a hex-encoded nullifier.",
    };
  }

  const client = new ClawChainClient(readOnlyClientOptions());

  try {
    await client.connect();
    const exists = await client.nullifierExists(params.nullifier);

    return {
      success: true,
      nullifier: params.nullifier,
      spent: exists,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      nullifier: params.nullifier,
      spent: false,
      error: `Failed to check nullifier: ${message}`,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
