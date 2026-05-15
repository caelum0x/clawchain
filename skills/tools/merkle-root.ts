/**
 * merkle-root tool -- Get the current Merkle root of the shielded pool.
 *
 * The Merkle root is the top-level hash of the commitment tree in the
 * ClawChain privacy module.  Every private transfer proof must reference
 * a valid Merkle root to prove that the input commitments exist in the
 * tree.  Read-only; no mnemonic required.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { readOnlyClientOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MerkleRootParams {
  /** No parameters required.  This interface exists for tool signature consistency. */
}

export interface MerkleRootResult {
  success: boolean;
  /** Hex-encoded Merkle root hash. */
  root: string;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Query the current Merkle root of the ClawChain shielded commitment pool.
 *
 * The Merkle root changes every time a new commitment is added (shield or
 * private transfer).  It is used as a public input in ZK proofs to
 * demonstrate that the input commitment exists in the tree.
 *
 * @param _params - Unused; present for tool signature consistency.
 * @returns The current Merkle root or an error.
 */
export default async function merkleRoot(
  _params: MerkleRootParams = {},
): Promise<MerkleRootResult> {
  const client = new ClawChainClient(readOnlyClientOptions());

  try {
    await client.connect();
    const root = await client.getMerkleRoot();

    return {
      success: true,
      root,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      root: "",
      error: `Failed to query Merkle root: ${message}`,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
