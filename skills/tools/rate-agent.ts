/**
 * rate-agent tool -- Submit a rating via x/reputation.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

export interface RateAgentParams {
  agentAddress: string;
  skillId: number;
  score: number;
  comment?: string;
}

export interface RateAgentResult {
  success: boolean;
  ratingId?: number;
  txHash?: string;
  error?: string;
}

export default async function rateAgent(params: RateAgentParams): Promise<RateAgentResult> {
  if (!params.agentAddress) return { success: false, error: "agentAddress is required." };
  if (params.skillId == null || params.skillId < 0) return { success: false, error: "A valid skillId is required." };
  if (!Number.isInteger(params.score) || params.score < 1 || params.score > 5) {
    return { success: false, error: "score must be an integer in [1, 5]." };
  }

  const client = new ClawChainClient(signingClientOptions());
  try {
    await client.connect();
    const tx = await client.rateAgent({
      agentAddress: params.agentAddress,
      skillId: params.skillId,
      score: params.score,
      comment: params.comment ?? "",
    });
    if (tx.code !== 0) {
      return {
        success: false,
        txHash: tx.transactionHash,
        error: `Transaction failed (code ${tx.code}): ${tx.rawLog}`,
      };
    }

    let ratingId: number | undefined;
    for (const event of tx.events) {
      const attr = event.attributes.find((a) => a.key === "rating_id");
      if (!attr) continue;
      const parsed = Number.parseInt(attr.value, 10);
      if (Number.isFinite(parsed)) {
        ratingId = parsed;
      }
    }

    return { success: true, ratingId, txHash: tx.transactionHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to rate agent: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
