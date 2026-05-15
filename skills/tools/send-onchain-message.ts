/**
 * send-onchain-message tool -- Send encrypted payload via x/messaging.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { signingClientOptions } from "./config.js";

export interface SendOnchainMessageParams {
  recipient: string;
  ciphertext: string;
  nonce: string;
}

export interface SendOnchainMessageResult {
  success: boolean;
  messageId?: number;
  txHash?: string;
  error?: string;
}

export default async function sendOnchainMessage(
  params: SendOnchainMessageParams,
): Promise<SendOnchainMessageResult> {
  if (!params.recipient) return { success: false, error: "Recipient is required." };
  if (!params.ciphertext) return { success: false, error: "Ciphertext is required." };
  if (!params.nonce) return { success: false, error: "Nonce is required." };

  const client = new ClawChainClient(signingClientOptions());

  try {
    await client.connect();
    const tx = await client.sendOnChainMessage({
      recipient: params.recipient,
      ciphertext: params.ciphertext,
      nonce: params.nonce,
    });
    if (tx.code !== 0) {
      return {
        success: false,
        txHash: tx.transactionHash,
        error: `Transaction failed (code ${tx.code}): ${tx.rawLog}`,
      };
    }

    let messageId: number | undefined;
    for (const event of tx.events) {
      if (event.type !== "send_message") continue;
      const attr = event.attributes.find((a) => a.key === "message_id");
      if (!attr) continue;
      const parsed = Number.parseInt(attr.value, 10);
      if (Number.isFinite(parsed)) {
        messageId = parsed;
      }
    }

    return { success: true, messageId, txHash: tx.transactionHash };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to send on-chain message: ${message}` };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
