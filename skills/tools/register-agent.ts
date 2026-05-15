/**
 * register-agent tool -- Register the AI agent on-chain.
 *
 * Broadcasts a MsgRegisterAgent transaction to the ClawChain agent module.
 * The agent's public key, name, and endpoint are derived from the shared
 * config.  Requires a valid mnemonic.
 */

import { ClawChainAgent } from "../../sdk/src/agent.js";
import { agentOptions, AGENT_NAME } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterAgentParams {
  /** Override agent name (default: from config / env). */
  name?: string;
  /** Override agent endpoint (default: from config / env). */
  endpoint?: string;
}

export interface RegisterAgentResult {
  success: boolean;
  /** Agent's on-chain bech32 address. */
  address: string;
  /** Agent name that was registered. */
  name: string;
  /** Transaction hash of the registration tx. */
  txHash: string;
  /** Block height the tx was included in. */
  blockHeight: number;
  /** Whether the agent was already registered before this call. */
  alreadyRegistered: boolean;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Register the agent on the ClawChain agent module.
 *
 * If the agent is already registered, the tool returns success with
 * `alreadyRegistered: true` and skips the transaction.
 *
 * @param params - Optional name/endpoint overrides.
 * @returns Registration result including the tx hash.
 */
export default async function registerAgent(
  params: RegisterAgentParams = {},
): Promise<RegisterAgentResult> {
  const opts = agentOptions();
  const name = params.name ?? opts.name;

  const agent = new ClawChainAgent({
    ...opts,
    name,
    endpoint: params.endpoint ?? opts.endpoint ?? "",
  });

  try {
    await agent.initialize();

    // Check if already registered to avoid duplicate tx.
    const registered = await agent.isRegistered();
    if (registered) {
      return {
        success: true,
        address: agent.getAddress(),
        name,
        txHash: "",
        blockHeight: 0,
        alreadyRegistered: true,
      };
    }

    const result = await agent.register();

    if (result.code !== 0) {
      return {
        success: false,
        address: agent.getAddress(),
        name,
        txHash: result.transactionHash,
        blockHeight: result.height,
        alreadyRegistered: false,
        error: `Registration tx failed with code ${result.code}: ${result.rawLog}`,
      };
    }

    return {
      success: true,
      address: agent.getAddress(),
      name,
      txHash: result.transactionHash,
      blockHeight: result.height,
      alreadyRegistered: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      address: "",
      name,
      txHash: "",
      blockHeight: 0,
      alreadyRegistered: false,
      error: `Failed to register agent: ${message}`,
    };
  } finally {
    await agent.shutdown().catch(() => {});
  }
}
