import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the config module before importing wallet.
vi.mock("../config.ts", () => ({
  chainConfig: {
    chainId: "clawchain",
    chainName: "ClawChain",
    bech32Prefix: "claw",
    coinDenom: "CLAW",
    coinMinimalDenom: "uclaw",
    coinDecimals: 6,
    gasPrice: "0.025uclaw",
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
    faucetEndpoint: "http://localhost:4500",
    walletUrl: "http://localhost:3001",
  },
}));

import {
  isKeplrAvailable,
  connectKeplr,
  disconnectWallet,
  generateBlinding,
} from "../wallet";

// Helper to install a mock Keplr on window.
function installMockKeplr(overrides: Record<string, any> = {}) {
  const keplr = {
    enable: vi.fn().mockResolvedValue(undefined),
    experimentalSuggestChain: vi.fn().mockResolvedValue(undefined),
    getKey: vi.fn().mockResolvedValue({
      bech32Address: "claw1testaddr000000000000000000000000000",
      name: "Test Wallet",
    }),
    getOfflineSigner: vi.fn(),
    signAmino: vi.fn(),
    ...overrides,
  };
  (window as any).keplr = keplr;
  return keplr;
}

function removeKeplr() {
  delete (window as any).keplr;
}

beforeEach(() => {
  removeKeplr();
  vi.restoreAllMocks();
});

afterEach(() => {
  removeKeplr();
});

// ---------------------------------------------------------------------------
// isKeplrAvailable
// ---------------------------------------------------------------------------

describe("isKeplrAvailable", () => {
  it("returns false when window.keplr is undefined", () => {
    expect(isKeplrAvailable()).toBe(false);
  });

  it("returns true when window.keplr exists", () => {
    installMockKeplr();
    expect(isKeplrAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// connectKeplr
// ---------------------------------------------------------------------------

describe("connectKeplr", () => {
  it("throws when Keplr is not available", async () => {
    await expect(connectKeplr()).rejects.toThrow("Keplr extension not found");
  });

  it("enables chain and returns wallet state on success", async () => {
    const keplr = installMockKeplr();

    // Mock fetchBalance via global fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        balances: [{ denom: "uclaw", amount: "1000000" }],
      }),
    });

    const state = await connectKeplr();

    expect(keplr.experimentalSuggestChain).toHaveBeenCalled();
    expect(keplr.enable).toHaveBeenCalledWith("clawchain");
    expect(keplr.getKey).toHaveBeenCalledWith("clawchain");

    expect(state.connected).toBe(true);
    expect(state.address).toBe("claw1testaddr000000000000000000000000000");
    expect(state.name).toBe("Test Wallet");
    expect(state.balance).toBe("1000000");
  });

  it("returns balance 0 when fetch fails", async () => {
    installMockKeplr();

    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network"));

    const state = await connectKeplr();
    expect(state.balance).toBe("0");
  });

  it("returns balance 0 when coin not found in balances", async () => {
    installMockKeplr();

    globalThis.fetch = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        balances: [{ denom: "uatom", amount: "500" }],
      }),
    });

    const state = await connectKeplr();
    expect(state.balance).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// disconnectWallet
// ---------------------------------------------------------------------------

describe("disconnectWallet", () => {
  it("returns a disconnected WalletState", () => {
    const state = disconnectWallet();

    expect(state.connected).toBe(false);
    expect(state.address).toBe("");
    expect(state.balance).toBe("0");
    expect(state.name).toBe("");
  });
});

// ---------------------------------------------------------------------------
// generateBlinding
// ---------------------------------------------------------------------------

describe("generateBlinding", () => {
  it("returns a 64-character hex string", () => {
    const blinding = generateBlinding();

    expect(blinding).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(blinding)).toBe(true);
  });

  it("produces different values on successive calls", () => {
    const a = generateBlinding();
    const b = generateBlinding();

    // Extremely unlikely to collide
    expect(a).not.toBe(b);
  });
});
