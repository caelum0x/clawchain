/**
 * unshield-tokens tool -- Withdraw tokens from the shielded pool.
 *
 * Moves tokens from the ZK UTXO shielded pool back to a transparent
 * on-chain balance.  Generates a Groth16 proof locally, nullifies the
 * spent commitment, and broadcasts MsgUnshield.
 *
 * Requires:
 * - A valid mnemonic (CLAWCHAIN_MNEMONIC)
 * - The clawproof binary
 * - At least one unspent commitment with sufficient value
 */

import { ClawChainAgent } from "../../sdk/src/agent.js";
import { agentOptions } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnshieldTokensParams {
  /** Amount to unshield in base denomination units. */
  amount: number | string;
  /** Recipient bech32 address.  Defaults to the agent's own address. */
  recipient?: string;
}

export interface UnshieldTokensResult {
  success: boolean;
  /** Amount unshielded. */
  amount: string;
  /** Recipient address that received the tokens. */
  recipient: string;
  /** Transaction hash. */
  txHash: string;
  /** Block height the tx was included in. */
  blockHeight: number;
  /** Agent's remaining shielded balance. */
  shieldedBalance: string;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Unshield tokens from the ClawChain shielded pool back to a transparent
 * address.
 *
 * @param params - Amount and optional recipient address.
 * @returns Result including the tx hash and updated shielded balance.
 */
export default async function unshieldTokens(
  params: UnshieldTokensParams,
): Promise<UnshieldTokensResult> {
  const amount = typeof params.amount === "string"
    ? BigInt(params.amount)
    : BigInt(params.amount);

  if (amount <= 0n) {
    return {
      success: false,
      amount: amount.toString(),
      recipient: params.recipient ?? "",
      txHash: "",
      blockHeight: 0,
      shieldedBalance: "0",
      error: "Amount must be greater than zero.",
    };
  }

  const agent = new ClawChainAgent(agentOptions());

  try {
    await agent.initialize();

    const recipientAddr = params.recipient ?? agent.getAddress();

    // Verify sufficient shielded balance.
    const shieldedBalance = agent.getShieldedBalance();
    if (shieldedBalance < amount) {
      return {
        success: false,
        amount: amount.toString(),
        recipient: recipientAddr,
        txHash: "",
        blockHeight: 0,
        shieldedBalance: shieldedBalance.toString(),
        error: `Insufficient shielded balance. Have ${shieldedBalance}, need ${amount}.`,
      };
    }

    const result = await agent.unshieldTokens(amount, recipientAddr);

    if (result.code !== 0) {
      return {
        success: false,
        amount: amount.toString(),
        recipient: recipientAddr,
        txHash: result.transactionHash,
        blockHeight: result.height,
        shieldedBalance: agent.getShieldedBalance().toString(),
        error: `Unshield tx failed with code ${result.code}: ${result.rawLog}`,
      };
    }

    return {
      success: true,
      amount: amount.toString(),
      recipient: recipientAddr,
      txHash: result.transactionHash,
      blockHeight: result.height,
      shieldedBalance: agent.getShieldedBalance().toString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      amount: amount.toString(),
      recipient: params.recipient ?? "",
      txHash: "",
      blockHeight: 0,
      shieldedBalance: "0",
      error: `Failed to unshield tokens: ${message}`,
    };
  } finally {
    await agent.shutdown().catch(() => {});
  }
}
