/**
 * complete-escrow tool -- Complete marketplace escrow via x/marketplace.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

export interface CompleteEscrowParams {
  escrowId: number;
}

export interface CompleteEscrowResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export default async function completeEscrow(
  params: CompleteEscrowParams,
): Promise<CompleteEscrowResult> {
  if (params.escrowId == null || params.escrowId < 0) {
    return { success: false, error: "A valid escrowId is required." };
  }

  const client = new ClawChainClient(signingClientOptions());
  try {
    await client.connect();
    const tx = await client.completeEscrow({ escrowId: params.escrowId });
    if (tx.code !== 0) {
      return {
        success: false,
        txHash: tx.transactionHash,
        error: `Transaction failed (code ${tx.code}): ${tx.rawLog}`,
      };
    }
    return { success: true, txHash: tx.transactionHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to complete escrow: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
