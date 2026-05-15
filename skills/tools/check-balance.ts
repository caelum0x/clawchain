/**
 * check-balance tool -- Query the transparent balance of an address.
 *
 * Uses the ClawChainClient to query the on-chain bank module balance for
 * any bech32 address and denomination.  Read-only; no mnemonic required.
 */

import { ClawChainClient } from "../../sdk/src/client.js";
import { readOnlyClientOptions, DENOM } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckBalanceParams {
  /** Bech32 address to query. If omitted, queries the configured agent's address (requires mnemonic). */
  address: string;
  /** Token denomination (default: "uclaw"). */
  denom?: string;
}

export interface CheckBalanceResult {
  success: boolean;
  /** Queried address. */
  address: string;
  /** Balance as a raw string (e.g. "1000000"). */
  balance: string;
  /** Token denomination. */
  denom: string;
  /** Human-readable balance (divides by 1e6 for uclaw). */
  displayBalance: string;
  /** Display denomination label. */
  displayDenom: string;
  /** Error message when success is false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Query the transparent (bank module) balance of a ClawChain address.
 *
 * @param params - Address and optional denomination to query.
 * @returns Structured balance information.
 */
export default async function checkBalance(
  params: CheckBalanceParams,
): Promise<CheckBalanceResult> {
  const denom = params.denom ?? DENOM;
  const address = params.address;

  if (!address) {
    return {
      success: false,
      address: "",
      balance: "0",
      denom,
      displayBalance: "0",
      displayDenom: denomLabel(denom),
      error: "Address is required. Provide a bech32 address to query.",
    };
  }

  const client = new ClawChainClient(readOnlyClientOptions());

  try {
    await client.connect();
    const balance = await client.getBalance(address, denom);

    return {
      success: true,
      address,
      balance,
      denom,
      displayBalance: toDisplay(balance, denom),
      displayDenom: denomLabel(denom),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      address,
      balance: "0",
      denom,
      displayBalance: "0",
      displayDenom: denomLabel(denom),
      error: `Failed to query balance: ${message}`,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert base-denomination amount to a human-readable string. */
function toDisplay(amount: string, denom: string): string {
  if (denom.startsWith("u")) {
    const raw = BigInt(amount);
    const whole = raw / 1_000_000n;
    const frac = raw % 1_000_000n;
    if (frac === 0n) return whole.toString();
    return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
  }
  return amount;
}

/** Return a display-friendly denomination label (e.g. "uclaw" -> "CLAW"). */
function denomLabel(denom: string): string {
  if (denom.startsWith("u")) {
    return denom.slice(1).toUpperCase();
  }
  return denom.toUpperCase();
}
