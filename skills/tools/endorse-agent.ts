/**
 * endorse-agent tool -- Submit an endorsement via x/reputation.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

export interface EndorseAgentParams {
  agentAddress: string;
  reason: string;
}

export interface EndorseAgentResult {
  success: boolean;
  endorsementId?: number;
  txHash?: string;
  error?: string;
}

export default async function endorseAgent(
  params: EndorseAgentParams,
): Promise<EndorseAgentResult> {
  if (!params.agentAddress) return { success: false, error: "agentAddress is required." };
  if (!params.reason) return { success: false, error: "reason is required." };

  const client = new ClawChainClient(signingClientOptions());
  try {
    await client.connect();
    const tx = await client.endorseAgent({
      agentAddress: params.agentAddress,
      reason: params.reason,
    });
    if (tx.code !== 0) {
      return {
        success: false,
        txHash: tx.transactionHash,
        error: `Transaction failed (code ${tx.code}): ${tx.rawLog}`,
      };
    }

    let endorsementId: number | undefined;
    for (const event of tx.events) {
      const attr = event.attributes.find((a) => a.key === "endorsement_id");
      if (!attr) continue;
      const parsed = Number.parseInt(attr.value, 10);
      if (Number.isFinite(parsed)) {
        endorsementId = parsed;
      }
    }

    return { success: true, endorsementId, txHash: tx.transactionHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to endorse agent: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
