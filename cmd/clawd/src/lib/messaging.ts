/**
 * Agent-to-agent messaging types and send helper.
 */

import { eciesEncrypt, signMessage } from "./crypto.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wire format for encrypted agent messages. */
export type AgentMessage = {
  /** Sender's bech32 address. */
  from: string;
  /** Recipient's bech32 address. */
  to: string;
  /** Base64-encoded ECIES ciphertext. */
  ciphertext: string;
  /** Hex-encoded secp256k1 signature over the ciphertext. */
  signature: string;
  /** Unix timestamp (ms). */
  timestamp: number;
};

/** Decrypted message after processing. */
export type DecryptedMessage = {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  verified: boolean;
};

// ---------------------------------------------------------------------------
// Send helper
// ---------------------------------------------------------------------------

export type SendAgentMessageOptions = {
  /** Recipient bech32 address. */
  to: string;
  /** Plaintext message body. */
  body: string;
  /** Sender's secp256k1 private key (hex). */
  senderPrivKey: string;
  /** Sender's bech32 address. */
  senderAddress: string;
  /** Recipient's compressed secp256k1 public key (hex). */
  recipientPubkey: string;
  /** Recipient's messaging HTTP endpoint. */
  recipientEndpoint: string;
};

/**
 * Encrypt, sign, and POST a message to another agent's messaging endpoint.
 */
export async function sendAgentMessage(options: SendAgentMessageOptions): Promise<{
  received: boolean;
  id?: string;
}> {
  // Encrypt the message body
  const ciphertext = await eciesEncrypt(options.body, options.recipientPubkey);

  // Sign the ciphertext
  const signature = await signMessage(ciphertext, options.senderPrivKey);

  const message: AgentMessage = {
    from: options.senderAddress,
    to: options.to,
    ciphertext,
    signature,
    timestamp: Date.now(),
  };

  // POST to recipient's endpoint
  const url = `${options.recipientEndpoint.replace(/\/?$/, "")}/agent/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Message delivery failed: HTTP ${res.status} – ${body}`);
  }

  return (await res.json()) as { received: boolean; id?: string };
}
