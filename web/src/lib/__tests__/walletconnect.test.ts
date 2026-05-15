import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @clawchain/sdk's ClawWalletConnect before importing the module under test.
// ---------------------------------------------------------------------------

const mockInit = vi.fn();
const mockDestroy = vi.fn();
const mockGetSessions = vi.fn();
const mockDisconnect = vi.fn();
const mockPair = vi.fn();

vi.mock("@clawchain/sdk", () => ({
  ClawWalletConnect: vi.fn().mockImplementation(() => ({
    init: mockInit,
    destroy: mockDestroy,
    getSessions: mockGetSessions,
    disconnect: mockDisconnect,
    pair: mockPair,
    client: null,
  })),
}));

// Mock config to avoid import.meta.env issues.
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

// Dynamic import after mocks are set up — must re-import for each test to
// reset the singleton state.
let mod: typeof import("../walletconnect");

beforeEach(async () => {
  vi.resetModules();

  // Reset mock implementations fresh for every test.
  mockInit.mockReset().mockResolvedValue(undefined);
  mockDestroy.mockReset().mockResolvedValue(undefined);
  mockGetSessions.mockReset().mockReturnValue([]);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockPair.mockReset().mockResolvedValue(undefined);

  mod = await import("../walletconnect");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getActiveSessions", () => {
  it("returns empty array when WalletConnect is not initialised", () => {
    const sessions = mod.getActiveSessions();
    expect(sessions).toEqual([]);
  });
});

describe("getConnectedAddress", () => {
  it("returns null when no sessions exist", () => {
    expect(mod.getConnectedAddress()).toBeNull();
  });
});

describe("isConnected", () => {
  it("returns false when no sessions exist", () => {
    expect(mod.isConnected()).toBe(false);
  });
});

describe("getWalletConnect", () => {
  it("creates and initialises a singleton instance", async () => {
    const wc = await mod.getWalletConnect();
    expect(wc).toBeDefined();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it("returns the same instance on subsequent calls", async () => {
    const wc1 = await mod.getWalletConnect();
    const wc2 = await mod.getWalletConnect();
    expect(wc1).toBe(wc2);
    // init should only have been called once
    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});

describe("destroyWalletConnect", () => {
  it("is a no-op when not initialised", async () => {
    await mod.destroyWalletConnect();
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it("calls destroy on the singleton and clears it", async () => {
    await mod.getWalletConnect();
    await mod.destroyWalletConnect();
    expect(mockDestroy).toHaveBeenCalledTimes(1);

    // After destroy, getActiveSessions should return []
    expect(mod.getActiveSessions()).toEqual([]);
  });
});

describe("disconnectAll", () => {
  it("is a no-op when not initialised", async () => {
    await mod.disconnectAll();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it("disconnects all active sessions", async () => {
    await mod.getWalletConnect();

    mockGetSessions.mockReturnValue([
      { topic: "session-1", accounts: ["claw1a"] },
      { topic: "session-2", accounts: ["claw1b"] },
    ]);

    await mod.disconnectAll();

    expect(mockDisconnect).toHaveBeenCalledTimes(2);
    expect(mockDisconnect).toHaveBeenCalledWith("session-1");
    expect(mockDisconnect).toHaveBeenCalledWith("session-2");
  });
});

describe("getActiveSessions after init", () => {
  it("returns sessions from the WalletConnect instance", async () => {
    await mod.getWalletConnect();

    const mockSessions = [
      { topic: "t1", accounts: ["claw1abc"] },
    ];
    mockGetSessions.mockReturnValue(mockSessions);

    const sessions = mod.getActiveSessions();
    expect(sessions).toEqual(mockSessions);
  });
});

describe("getConnectedAddress after init", () => {
  it("returns the first account from the first session", async () => {
    await mod.getWalletConnect();

    mockGetSessions.mockReturnValue([
      { topic: "t1", accounts: ["claw1firstaddr", "claw1second"] },
    ]);

    expect(mod.getConnectedAddress()).toBe("claw1firstaddr");
  });
});

describe("isConnected after init", () => {
  it("returns true when sessions exist", async () => {
    await mod.getWalletConnect();

    mockGetSessions.mockReturnValue([
      { topic: "t1", accounts: ["claw1a"] },
    ]);

    expect(mod.isConnected()).toBe(true);
  });
});
