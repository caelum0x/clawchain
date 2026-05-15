/**
 * query-agent tool -- Query agent registration status on-chain.
 *
 * Looks up an agent by bech32 address in the ClawChain agent module and
 * returns the registration details (name, pubkey, endpoint, status).
 * Read-only; no mnemonic required.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { readOnlyClientOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueryAgentParams {
  /** Bech32 address of the agent to query. */
  address: string;
}

export interface QueryAgentResult {
  success: boolean;
  /** Whether the agent is registered on-chain. */
  registered: boolean;
  /** On-chain agent name. */
  name: string;
  /** Public key (hex or base64). */
  pubkey: string;
  /** HTTP(S) endpoint registered for the agent. */
  endpoint: string;
  /** The queried address. */
  address: string;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Query the on-chain registration status of a ClawChain agent.
 *
 * @param params - Address of the agent to look up.
 * @returns Registration details or an error result.
 */
export default async function queryAgent(
  params: QueryAgentParams,
): Promise<QueryAgentResult> {
  if (!params.address) {
    return {
      success: false,
      registered: false,
      name: "",
      pubkey: "",
      endpoint: "",
      address: "",
      error: "Address is required.",
    };
  }

  const client = new ClawChainClient(readOnlyClientOptions());

  try {
    await client.connect();

    const info = await client.getAgent(params.address);

    return {
      success: true,
      registered: info.registered,
      name: info.name,
      pubkey: info.pubkey,
      endpoint: info.endpoint,
      address: params.address,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // A 404 from the REST endpoint typically means the agent is not registered.
    if (message.includes("404") || message.includes("not found")) {
      return {
        success: true,
        registered: false,
        name: "",
        pubkey: "",
        endpoint: "",
        address: params.address,
      };
    }

    return {
      success: false,
      registered: false,
      name: "",
      pubkey: "",
      endpoint: "",
      address: params.address,
      error: `Failed to query agent: ${message}`,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}
