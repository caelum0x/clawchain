/**
 * usePrivacyShield — React hook for shield/unshield operations.
 *
 * Wraps the ClawChain privacy module's shield and unshield transactions.
 * In sandbox mode these return simulated tx hashes since real signing
 * requires the MPC/TSS backend (see AGENTS.md).
 */

import { useState, useCallback } from "react";
import { clawchainApi, type ShieldResult } from "../services/clawchain-api.js";

export interface UsePrivacyShieldOptions {
  /** Wallet address. Operations are disabled when null. */
  address: string | null;
  /** Callback fired after a successful shield or unshield. */
  onSuccess?: (result: ShieldResult, operation: "shield" | "unshield") => void;
  /** Callback fired on error. */
  onError?: (error: Error, operation: "shield" | "unshield") => void;
}

export interface UsePrivacyShieldResult {
  /** Shield public CLAW into the privacy pool. Amount is in uclaw. */
  shield: (amount: string) => Promise<ShieldResult>;
  /** Unshield private CLAW back to the public ledger. Amount is in uclaw. */
  unshield: (amount: string) => Promise<ShieldResult>;
  /** Whether a shield/unshield operation is in progress. */
  isLoading: boolean;
  /** The most recent operation result. */
  lastResult: ShieldResult | null;
  /** The most recent error message. */
  error: string | null;
}

export function usePrivacyShield(
  options: UsePrivacyShieldOptions
): UsePrivacyShieldResult {
  const { address, onSuccess, onError } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<ShieldResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shield = useCallback(
    async (amount: string): Promise<ShieldResult> => {
      if (!address) throw new Error("No wallet address");
      setIsLoading(true);
      setError(null);
      try {
        const result = await clawchainApi.shield(address, amount);
        setLastResult(result);
        onSuccess?.(result, "shield");
        return result;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error("Shield failed");
        setError(err.message);
        onError?.(err, "shield");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [address, onSuccess, onError]
  );

  const unshield = useCallback(
    async (amount: string): Promise<ShieldResult> => {
      if (!address) throw new Error("No wallet address");
      setIsLoading(true);
      setError(null);
      try {
        const result = await clawchainApi.unshield(address, amount);
        setLastResult(result);
        onSuccess?.(result, "unshield");
        return result;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error("Unshield failed");
        setError(err.message);
        onError?.(err, "unshield");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [address, onSuccess, onError]
  );

  return {
    shield,
    unshield,
    isLoading,
    lastResult,
    error,
  };
}
