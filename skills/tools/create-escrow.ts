/**
 * create-escrow tool -- Create marketplace escrow via x/marketplace.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

export interface CreateEscrowParams {
  skillId: number;
  description: string;
  deadlineBlocks: number;
  milestones?: number;
}

export interface CreateEscrowResult {
  success: boolean;
  escrowId?: number;
  txHash?: string;
  error?: string;
}

export default async function createEscrow(params: CreateEscrowParams): Promise<CreateEscrowResult> {
  if (params.skillId == null || params.skillId < 0) return { success: false, error: "A valid skillId is required." };
  if (!params.description) return { success: false, error: "Description is required." };
  if (!params.deadlineBlocks || params.deadlineBlocks <= 0) {
    return { success: false, error: "deadlineBlocks must be > 0." };
  }

  const client = new ClawChainClient(signingClientOptions());
  try {
    await client.connect();
    const tx = await client.createEscrow({
      skillId: params.skillId,
      description: params.description,
      deadlineBlocks: params.deadlineBlocks,
      milestones: params.milestones ?? 1,
    });
    if (tx.code !== 0) {
      return {
        success: false,
        txHash: tx.transactionHash,
        error: `Transaction failed (code ${tx.code}): ${tx.rawLog}`,
      };
    }

    let escrowId: number | undefined;
    for (const event of tx.events) {
      const attr = event.attributes.find((a) => a.key === "escrow_id");
      if (!attr) continue;
      const parsed = Number.parseInt(attr.value, 10);
      if (Number.isFinite(parsed)) {
        escrowId = parsed;
      }
    }

    return { success: true, escrowId, txHash: tx.transactionHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to create escrow: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
