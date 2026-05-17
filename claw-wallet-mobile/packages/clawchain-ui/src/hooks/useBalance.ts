/**
 * useBalance — React hook for querying ClawChain balance.
 *
 * Fetches both public (bank module) and shielded (privacy module) balances
 * for the given address. Supports auto-refresh with a configurable interval.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  clawchainApi,
  type CoinBalance,
} from "../services/clawchain-api.js";

export interface UseBalanceOptions {
  /** Wallet address to query. Skips fetching when empty/null. */
  address: string | null;
  /** Denom to extract from bank balances. Default: "uclaw" */
  denom?: string;
  /** Number of decimals for display formatting. Default: 6 */
  decimals?: number;
  /** Auto-refresh interval in ms. 0 = disabled. Default: 15000 */
  refreshInterval?: number;
}

export interface UseBalanceResult {
  /** Raw uclaw balance string */
  balanceRaw: string;
  /** Formatted display balance (e.g. "1,234.56") */
  balance: string;
  /** All coin balances from the bank module */
  allBalances: CoinBalance[];
  /** Raw shielded balance string */
  shieldedBalanceRaw: string;
  /** Formatted shielded display balance */
  shieldedBalance: string;
  /** Whether a fetch is currently in progress */
  isLoading: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
}

function formatDisplayAmount(raw: string, decimals: number): string {
  const num = parseInt(raw, 10);
  if (isNaN(num)) return "0.00";
  const value = num / Math.pow(10, decimals);
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(Math.min(decimals, 2));
}

export function useBalance(options: UseBalanceOptions): UseBalanceResult {
  const {
    address,
    denom = "uclaw",
    decimals = 6,
    refreshInterval = 15000,
  } = options;

  const [allBalances, setAllBalances] = useState<CoinBalance[]>([]);
  const [shieldedBalanceRaw, setShieldedBalanceRaw] = useState("0");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);
    try {
      const [balances, shielded] = await Promise.all([
        clawchainApi.getBalance(address),
        clawchainApi.getShieldedBalance(address),
      ]);
      if (mountedRef.current) {
        setAllBalances(balances);
        setShieldedBalanceRaw(shielded);
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to fetch balance");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [address]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch on mount and when address changes
  useEffect(() => {
    if (address) {
      refresh();
    } else {
      setAllBalances([]);
      setShieldedBalanceRaw("0");
    }
  }, [address, refresh]);

  // Auto-refresh interval
  useEffect(() => {
    if (!address || refreshInterval <= 0) return;
    const timer = setInterval(refresh, refreshInterval);
    return () => clearInterval(timer);
  }, [address, refreshInterval, refresh]);

  const clawBalance = allBalances.find((b) => b.denom === denom);
  const balanceRaw = clawBalance?.amount ?? "0";

  return {
    balanceRaw,
    balance: formatDisplayAmount(balanceRaw, decimals),
    allBalances,
    shieldedBalanceRaw,
    shieldedBalance: formatDisplayAmount(shieldedBalanceRaw, decimals),
    isLoading,
    error,
    refresh,
  };
}
