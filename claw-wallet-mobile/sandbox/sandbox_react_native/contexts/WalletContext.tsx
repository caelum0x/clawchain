import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { walletService, type WalletState, type WalletAccount } from "@/services/wallet";
import { chainApi, type Balance, type Transaction } from "@/services/chain";
import { formatAmount } from "@/constants/chain";

interface WalletContextValue {
  // Wallet state
  account: WalletAccount | null;
  isInitialized: boolean;
  isLoading: boolean;
  network: "mainnet" | "testnet" | "local";

  // Balances
  balance: string; // formatted display balance
  balanceRaw: string; // raw uclaw amount
  shieldedBalance: string;
  shieldedBalanceRaw: string;

  // Transactions
  transactions: Transaction[];

  // Actions
  createWallet: (name: string) => Promise<void>;
  importWallet: (mnemonic: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  setNetwork: (network: "mainnet" | "testnet" | "local") => void;
  refreshBalance: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  sendTokens: (to: string, amount: string, memo: string) => Promise<string>;
  shield: (amount: string) => Promise<string>;
  unshield: (amount: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [walletState, setWalletState] = useState<WalletState>(walletService.getState());
  const [isLoading, setIsLoading] = useState(false);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [shieldedBalanceRaw, setShieldedBalanceRaw] = useState("0");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const unsub = walletService.subscribe(setWalletState);
    walletService.initialize();
    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, []);

  const refreshBalance = useCallback(async () => {
    const addr = walletService.getState().account?.address;
    if (!addr) return;
    try {
      const [bal, shielded] = await Promise.all([
        chainApi.getBalance(addr),
        chainApi.getShieldedBalance(addr),
      ]);
      if (mountedRef.current) {
        setBalances(bal);
        setShieldedBalanceRaw(shielded);
      }
    } catch {
      // Keep existing balances on error
    }
  }, []);

  const refreshTransactions = useCallback(async () => {
    const addr = walletService.getState().account?.address;
    if (!addr) return;
    try {
      const txs = await chainApi.getTransactions(addr);
      if (mountedRef.current) setTransactions(txs);
    } catch {
      // Keep existing transactions on error
    }
  }, []);

  // Auto-refresh when account changes
  useEffect(() => {
    if (walletState.account) {
      refreshBalance();
      refreshTransactions();
    } else {
      setBalances([]);
      setShieldedBalanceRaw("0");
      setTransactions([]);
    }
  }, [walletState.account, refreshBalance, refreshTransactions]);

  const config = walletService.getChainConfig();
  const clawBalance = balances.find((b) => b.denom === config.denom);
  const balanceRaw = clawBalance?.amount ?? "0";

  const value: WalletContextValue = {
    account: walletState.account,
    isInitialized: walletState.isInitialized,
    isLoading,
    network: walletState.network,

    balance: formatAmount(balanceRaw),
    balanceRaw,
    shieldedBalance: formatAmount(shieldedBalanceRaw),
    shieldedBalanceRaw,

    transactions,

    createWallet: async (name: string) => {
      setIsLoading(true);
      try {
        await walletService.createWallet(name);
      } finally {
        setIsLoading(false);
      }
    },

    importWallet: async (mnemonic: string, name: string) => {
      setIsLoading(true);
      try {
        await walletService.importWallet(mnemonic, name);
      } finally {
        setIsLoading(false);
      }
    },

    signOut: async () => {
      await walletService.signOut();
    },

    setNetwork: (network) => {
      walletService.setNetwork(network);
      chainApi.setNetwork(network);
    },

    refreshBalance,
    refreshTransactions,

    sendTokens: async (to, amount, memo) => {
      setIsLoading(true);
      try {
        const addr = walletState.account?.address;
        if (!addr) throw new Error("No wallet");
        const result = await chainApi.sendTokens(addr, to, amount, config.denom, memo);
        await refreshBalance();
        await refreshTransactions();
        return result.txHash;
      } finally {
        setIsLoading(false);
      }
    },

    shield: async (amount) => {
      setIsLoading(true);
      try {
        const addr = walletState.account?.address;
        if (!addr) throw new Error("No wallet");
        const result = await chainApi.shield(addr, amount);
        await refreshBalance();
        return result.txHash;
      } finally {
        setIsLoading(false);
      }
    },

    unshield: async (amount) => {
      setIsLoading(true);
      try {
        const addr = walletState.account?.address;
        if (!addr) throw new Error("No wallet");
        const result = await chainApi.unshield(addr, amount);
        await refreshBalance();
        return result.txHash;
      } finally {
        setIsLoading(false);
      }
    },
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
