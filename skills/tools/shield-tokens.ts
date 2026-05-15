/**
 * shield-tokens tool -- Shield (deposit) tokens into the private pool.
 *
 * Moves transparent tokens from the agent's on-chain balance into the ZK
 * UTXO shielded pool.  A commitment is generated locally and stored in
 * the agent's in-memory state.  Requires a valid mnemonic and the
 * clawproof binary for commitment generation.
 */

import { ClawChainAgent } from "../../sdk/src/agent.js";
import { agentOptions, DENOM } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShieldTokensParams {
  /** Amount to shield in base denomination units (e.g. 1000000 for 1 CLAW). */
  amount: number | string;
  /** Token denomination (default: "uclaw"). */
  denom?: string;
}

export interface ShieldTokensResult {
  success: boolean;
  /** Amount that was shielded. */
  amount: string;
  /** Denomination. */
  denom: string;
  /** Transaction hash. */
  txHash: string;
  /** Block height the tx was included in. */
  blockHeight: number;
  /** Agent's shielded balance after the operation. */
  shieldedBalance: string;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Shield tokens into the ClawChain privacy pool.
 *
 * @param params - Amount and optional denomination.
 * @returns Result including the tx hash and updated shielded balance.
 */
export default async function shieldTokens(
  params: ShieldTokensParams,
): Promise<ShieldTokensResult> {
  const denom = params.denom ?? DENOM;
  const amount = typeof params.amount === "string"
    ? BigInt(params.amount)
    : BigInt(params.amount);

  if (amount <= 0n) {
    return {
      success: false,
      amount: amount.toString(),
      denom,
      txHash: "",
      blockHeight: 0,
      shieldedBalance: "0",
      error: "Amount must be greater than zero.",
    };
  }

  const agent = new ClawChainAgent(agentOptions());

  try {
    await agent.initialize();

    // Verify the agent has sufficient transparent balance.
    const balance = await agent.checkBalance(denom);
    if (BigInt(balance) < amount) {
      return {
        success: false,
        amount: amount.toString(),
        denom,
        txHash: "",
        blockHeight: 0,
        shieldedBalance: agent.getShieldedBalance().toString(),
        error: `Insufficient transparent balance. Have ${balance} ${denom}, need ${amount} ${denom}.`,
      };
    }

    const result = await agent.shieldTokens(amount, denom);

    if (result.code !== 0) {
      return {
        success: false,
        amount: amount.toString(),
        denom,
        txHash: result.transactionHash,
        blockHeight: result.height,
        shieldedBalance: agent.getShieldedBalance().toString(),
        error: `Shield tx failed with code ${result.code}: ${result.rawLog}`,
      };
    }

    return {
      success: true,
      amount: amount.toString(),
      denom,
      txHash: result.transactionHash,
      blockHeight: result.height,
      shieldedBalance: agent.getShieldedBalance().toString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      amount: amount.toString(),
      denom,
      txHash: "",
      blockHeight: 0,
      shieldedBalance: "0",
      error: `Failed to shield tokens: ${message}`,
    };
  } finally {
    await agent.shutdown().catch(() => {});
  }
}
