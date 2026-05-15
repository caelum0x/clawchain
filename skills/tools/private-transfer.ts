/**
 * private-transfer tool -- Transfer tokens within the shielded pool.
 *
 * Performs a fully private transfer using ZK proofs.  Both sender and
 * recipient addresses/amounts are hidden on-chain.  The tool generates
 * a Groth16 proof locally via the clawproof binary, selects unspent
 * commitments, and broadcasts a MsgPrivateTransfer.
 *
 * Requires:
 * - A valid mnemonic (CLAWCHAIN_MNEMONIC)
 * - The clawproof binary installed and accessible
 * - Sufficient shielded balance (previously shielded tokens)
 */

import { ClawChainAgent } from "../../sdk/src/agent.js";
import { ClawChainClient } from "../../sdk/src/client.js";
import {
  agentOptions,
  signingClientOptions,
  requireMnemonic,
} from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrivateTransferParams {
  /** Recipient's bech32 address on ClawChain. */
  recipientAddress: string;
  /** Recipient's BIP-39 mnemonic (required to build their commitment). */
  recipientMnemonic: string;
  /** Recipient's agent name (for ClawChainAgent construction). */
  recipientName?: string;
  /** Amount to transfer in base denomination units. */
  amount: number | string;
}

export interface PrivateTransferResult {
  success: boolean;
  /** Amount transferred. */
  amount: string;
  /** Transaction hash. */
  txHash: string;
  /** Block height the tx was included in. */
  blockHeight: number;
  /** Sender's remaining shielded balance. */
  senderShieldedBalance: string;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Perform a private transfer within the ClawChain shielded pool.
 *
 * This is the core privacy operation.  On-chain observers see only the
 * ZK proof, nullifiers (to prevent double-spend), and new commitments.
 * The sender, recipient, and amount remain hidden.
 *
 * @param params - Recipient details and amount.
 * @returns Transfer result including tx hash and updated balance.
 */
export default async function privateTransfer(
  params: PrivateTransferParams,
): Promise<PrivateTransferResult> {
  const amount = typeof params.amount === "string"
    ? BigInt(params.amount)
    : BigInt(params.amount);

  if (amount <= 0n) {
    return {
      success: false,
      amount: amount.toString(),
      txHash: "",
      blockHeight: 0,
      senderShieldedBalance: "0",
      error: "Amount must be greater than zero.",
    };
  }

  if (!params.recipientAddress && !params.recipientMnemonic) {
    return {
      success: false,
      amount: amount.toString(),
      txHash: "",
      blockHeight: 0,
      senderShieldedBalance: "0",
      error: "Recipient address or mnemonic is required.",
    };
  }

  const senderOpts = agentOptions();
  const sender = new ClawChainAgent(senderOpts);

  const recipientOpts = {
    ...senderOpts,
    name: params.recipientName ?? "recipient",
    mnemonic: params.recipientMnemonic,
  };
  const recipient = new ClawChainAgent(recipientOpts);

  try {
    await sender.initialize();
    await recipient.initialize();

    // Verify sufficient shielded balance.
    const shieldedBalance = sender.getShieldedBalance();
    if (shieldedBalance < amount) {
      return {
        success: false,
        amount: amount.toString(),
        txHash: "",
        blockHeight: 0,
        senderShieldedBalance: shieldedBalance.toString(),
        error: `Insufficient shielded balance. Have ${shieldedBalance}, need ${amount}. Shield tokens first.`,
      };
    }

    const result = await sender.privateTransfer(recipient, amount);

    if (result.code !== 0) {
      return {
        success: false,
        amount: amount.toString(),
        txHash: result.transactionHash,
        blockHeight: result.height,
        senderShieldedBalance: sender.getShieldedBalance().toString(),
        error: `Private transfer tx failed with code ${result.code}: ${result.rawLog}`,
      };
    }

    return {
      success: true,
      amount: amount.toString(),
      txHash: result.transactionHash,
      blockHeight: result.height,
      senderShieldedBalance: sender.getShieldedBalance().toString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      amount: amount.toString(),
      txHash: "",
      blockHeight: 0,
      senderShieldedBalance: "0",
      error: `Failed to execute private transfer: ${message}`,
    };
  } finally {
    await sender.shutdown().catch(() => {});
    await recipient.shutdown().catch(() => {});
  }
}
