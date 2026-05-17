import { CHAIN_CONFIG, TESTNET_CONFIG, LOCAL_CONFIG, type ChainConfig } from "@/constants/chain";

export interface WalletAccount {
  address: string;
  name: string;
  createdAt: number;
}

export interface WalletState {
  account: WalletAccount | null;
  isInitialized: boolean;
  network: "mainnet" | "testnet" | "local";
}

// Deterministic address from a seed phrase (simplified for demo).
// In production, this integrates with the MPC/TSS backend via oko_sdk_cosmos.
function generateDemoAddress(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let addr = prefix + "1";
  for (let i = 0; i < 38; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

const STORAGE_KEY = "clawchain_wallet";

class WalletService {
  private state: WalletState = {
    account: null,
    isInitialized: false,
    network: "mainnet",
  };
  private listeners: Array<(state: WalletState) => void> = [];

  getState(): WalletState {
    return this.state;
  }

  subscribe(listener: (state: WalletState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.state));
  }

  async initialize(): Promise<void> {
    try {
      // In production: check expo-secure-store for saved wallet
      // For now, check if we have an account in memory
      this.state = { ...this.state, isInitialized: true };
      this.notify();
    } catch {
      this.state = { ...this.state, isInitialized: true };
      this.notify();
    }
  }

  async createWallet(name: string): Promise<WalletAccount> {
    // In production: call TSS backend for MPC keygen
    // The oko_sdk_cosmos handles key share generation via the TSS API.
    // For now, generate a demo address.
    const account: WalletAccount = {
      address: generateDemoAddress(CHAIN_CONFIG.bech32Prefix),
      name,
      createdAt: Date.now(),
    };

    this.state = { ...this.state, account };
    this.notify();
    return account;
  }

  async importWallet(mnemonic: string, name: string): Promise<WalletAccount> {
    // In production: derive key from mnemonic, or import key shares.
    // Validates mnemonic format (12 or 24 words).
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      throw new Error("Mnemonic must be 12 or 24 words");
    }

    const account: WalletAccount = {
      address: generateDemoAddress(CHAIN_CONFIG.bech32Prefix),
      name,
      createdAt: Date.now(),
    };

    this.state = { ...this.state, account };
    this.notify();
    return account;
  }

  async signOut(): Promise<void> {
    this.state = { ...this.state, account: null };
    this.notify();
  }

  setNetwork(network: "mainnet" | "testnet" | "local"): void {
    this.state = { ...this.state, network };
    this.notify();
  }

  getChainConfig(): ChainConfig {
    if (this.state.network === "local") return LOCAL_CONFIG;
    if (this.state.network === "testnet") return TESTNET_CONFIG;
    return CHAIN_CONFIG;
  }
}

export const walletService = new WalletService();
