import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const loadClawdConfigMock = vi.hoisted(() =>
  vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "/tmp/.clawchain",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
    agentAddress: "claw1testaddr",
    moniker: "test-node",
    messagingEndpoint: "http://localhost:7777",
  })),
);
const writeClawdConfigMock = vi.hoisted(() => vi.fn());

const generateMnemonicMock = vi.hoisted(() =>
  vi.fn(async () => "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"),
);
const saveMnemonicMock = vi.hoisted(() => vi.fn());
const loadMnemonicMock = vi.hoisted(() =>
  vi.fn(() => "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"),
);
const mnemonicFileExistsMock = vi.hoisted(() => vi.fn(() => false));

// Mock fs operations for bootstrap state persistence
const readFileSyncMock = vi.hoisted(() => vi.fn());
const writeFileSyncMock = vi.hoisted(() => vi.fn());
const mkdirSyncMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn(() => false));
const unlinkSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
  existsSync: existsSyncMock,
  unlinkSync: unlinkSyncMock,
}));

vi.mock("./config.js", () => ({
  loadClawdConfig: loadClawdConfigMock,
  writeClawdConfig: writeClawdConfigMock,
}));

vi.mock("./mnemonic.js", () => ({
  generateMnemonic: generateMnemonicMock,
  saveMnemonic: saveMnemonicMock,
  loadMnemonic: loadMnemonicMock,
  mnemonicFileExists: mnemonicFileExistsMock,
}));

// Mock cosmjs modules
const mockGetAccounts = vi.hoisted(() =>
  vi.fn(async () => [
    {
      address: "claw1testaddr",
      pubkey: new Uint8Array([2, 3, 4, 5]),
      algo: "secp256k1" as const,
    },
  ]),
);

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn(async () => ({
      getAccounts: mockGetAccounts,
    })),
  },
}));

const mockSignAndBroadcast = vi.hoisted(() =>
  vi.fn(async () => ({
    code: 0,
    transactionHash: "AABBCC112233",
    rawLog: "",
  })),
);
const mockDisconnect = vi.hoisted(() => vi.fn());

vi.mock("@cosmjs/stargate", () => ({
  GasPrice: {
    fromString: vi.fn(() => ({})),
  },
  SigningStargateClient: {
    connectWithSigner: vi.fn(async () => ({
      signAndBroadcast: mockSignAndBroadcast,
      disconnect: mockDisconnect,
    })),
  },
  StargateClient: {
    connect: vi.fn(async () => ({
      getBalance: vi.fn(async () => ({ amount: "5000000", denom: "uclaw" })),
      disconnect: vi.fn(),
    })),
  },
}));

import {
  runBootstrap,
  loadBootstrapState,
  saveBootstrapState,
  resetBootstrapState,
  type BootstrapState,
} from "./bootstrap.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bootstrap", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.clearAllMocks();

    // Default: no existing state file
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    // Default fetch mock: agent not found + status endpoint
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/clawchain/agent/v1/agent/")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (urlStr.endsWith("/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: { sync_info: { latest_block_height: "100" } },
            }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${urlStr}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // State persistence
  // -------------------------------------------------------------------------

  describe("loadBootstrapState", () => {
    it("returns null when no state file exists", () => {
      readFileSyncMock.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      expect(loadBootstrapState()).toBeNull();
    });

    it("returns parsed state when file exists", () => {
      const saved: BootstrapState = {
        steps: {
          keyGenerated: true,
          addressDerived: true,
          funded: false,
          registered: false,
          heartbeatSent: false,
          gatewayStarted: false,
        },
        agentAddress: "claw1abc",
        lastUpdated: "2026-03-09T00:00:00Z",
      };
      readFileSyncMock.mockReturnValue(JSON.stringify(saved));
      const result = loadBootstrapState();
      expect(result).toEqual(saved);
    });
  });

  describe("saveBootstrapState", () => {
    it("writes state to disk and updates lastUpdated", () => {
      const state: BootstrapState = {
        steps: {
          keyGenerated: true,
          addressDerived: false,
          funded: false,
          registered: false,
          heartbeatSent: false,
          gatewayStarted: false,
        },
        lastUpdated: "",
      };
      saveBootstrapState(state);
      expect(mkdirSyncMock).toHaveBeenCalled();
      expect(writeFileSyncMock).toHaveBeenCalled();
      expect(state.lastUpdated).not.toBe("");
    });
  });

  describe("resetBootstrapState", () => {
    it("calls unlinkSync without throwing if file is missing", () => {
      unlinkSyncMock.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      expect(() => resetBootstrapState()).not.toThrow();
    });

    it("calls unlinkSync to remove the file", () => {
      unlinkSyncMock.mockImplementation(() => undefined);
      resetBootstrapState();
      expect(unlinkSyncMock).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // runBootstrap — full flow
  // -------------------------------------------------------------------------

  describe("runBootstrap", () => {
    it("runs all 5 steps from scratch and returns completed state", async () => {
      mnemonicFileExistsMock.mockReturnValue(false);

      const result = await runBootstrap({ skipFunding: true });

      expect(result.steps.keyGenerated).toBe(true);
      expect(result.steps.addressDerived).toBe(true);
      expect(result.steps.funded).toBe(true);
      expect(result.steps.registered).toBe(true);
      expect(result.steps.heartbeatSent).toBe(true);
      expect(result.agentAddress).toBe("claw1testaddr");
      expect(result.registerTxHash).toBe("AABBCC112233");
      expect(result.heartbeatTxHash).toBe("AABBCC112233");
      expect(generateMnemonicMock).toHaveBeenCalledOnce();
      expect(saveMnemonicMock).toHaveBeenCalledOnce();
    });

    it("skips key generation when mnemonic already exists", async () => {
      mnemonicFileExistsMock.mockReturnValue(true);

      const result = await runBootstrap({ skipFunding: true });

      expect(result.steps.keyGenerated).toBe(true);
      expect(generateMnemonicMock).not.toHaveBeenCalled();
      expect(saveMnemonicMock).not.toHaveBeenCalled();
    });

    it("resumes from checkpoint when partially completed", async () => {
      // Simulate state where key + address are already done
      const existingState: BootstrapState = {
        steps: {
          keyGenerated: true,
          addressDerived: true,
          funded: false,
          registered: false,
          heartbeatSent: false,
          gatewayStarted: false,
        },
        agentAddress: "claw1testaddr",
        lastUpdated: "2026-03-09T00:00:00Z",
      };
      readFileSyncMock.mockReturnValue(JSON.stringify(existingState));

      const result = await runBootstrap({ skipFunding: true });

      // Should NOT have re-generated keys or re-derived address
      expect(generateMnemonicMock).not.toHaveBeenCalled();
      expect(writeClawdConfigMock).not.toHaveBeenCalled();
      // But should have completed registration + heartbeat
      expect(result.steps.registered).toBe(true);
      expect(result.steps.heartbeatSent).toBe(true);
    });

    it("skips all steps when state is fully completed", async () => {
      const completedState: BootstrapState = {
        steps: {
          keyGenerated: true,
          addressDerived: true,
          funded: true,
          registered: true,
          heartbeatSent: true,
          gatewayStarted: false,
        },
        agentAddress: "claw1testaddr",
        registerTxHash: "EXISTING_TX",
        heartbeatTxHash: "EXISTING_HB",
        lastUpdated: "2026-03-09T00:00:00Z",
      };
      readFileSyncMock.mockReturnValue(JSON.stringify(completedState));

      const result = await runBootstrap({ skipFunding: true });

      expect(generateMnemonicMock).not.toHaveBeenCalled();
      expect(mockSignAndBroadcast).not.toHaveBeenCalled();
      expect(result.registerTxHash).toBe("EXISTING_TX");
      expect(result.heartbeatTxHash).toBe("EXISTING_HB");
    });

    it("skips registration when agent is already registered on-chain", async () => {
      mnemonicFileExistsMock.mockReturnValue(true);

      // Agent already registered on REST
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = String(url);
        if (urlStr.includes("/clawchain/agent/v1/agent/")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ registered: true }),
          });
        }
        if (urlStr.endsWith("/status")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result: { sync_info: { latest_block_height: "100" } },
              }),
          });
        }
        return Promise.reject(new Error(`unexpected fetch: ${urlStr}`));
      }) as unknown as typeof fetch;

      const result = await runBootstrap({ skipFunding: true });

      expect(result.steps.registered).toBe(true);
      // Registration signAndBroadcast should NOT have been called (already registered)
      // Only heartbeat signAndBroadcast should have been called
      expect(mockSignAndBroadcast).toHaveBeenCalledTimes(1);
      expect(result.registerTxHash).toBeUndefined();
      expect(result.heartbeatTxHash).toBe("AABBCC112233");
    });

    it("persists state after each step completion", async () => {
      mnemonicFileExistsMock.mockReturnValue(false);

      await runBootstrap({ skipFunding: true });

      // writeFileSync is called by saveBootstrapState after each step
      // 5 steps = 5 saves (keyGenerated, addressDerived, funded, registered, heartbeatSent)
      const saveCalls = writeFileSyncMock.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === "string" && String(call[0]).includes("bootstrap-state.json"),
      );
      expect(saveCalls.length).toBe(5);
    });

    it("handles registration tx failure", async () => {
      mnemonicFileExistsMock.mockReturnValue(true);

      mockSignAndBroadcast.mockResolvedValueOnce({
        code: 5,
        transactionHash: "FAILED_TX",
        rawLog: "insufficient funds",
      });

      await expect(runBootstrap({ skipFunding: true })).rejects.toThrow(
        "Registration tx failed (code=5): insufficient funds",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Faucet funding
  // -------------------------------------------------------------------------

  describe("runBootstrap — faucet funding", () => {
    it("requests faucet when balance is below threshold", async () => {
      mnemonicFileExistsMock.mockReturnValue(true);

      // Need to import StargateClient to override the mock for this test
      const { StargateClient } = await import("@cosmjs/stargate");
      const mockGetBalance = vi.fn()
        .mockResolvedValueOnce({ amount: "100", denom: "uclaw" })  // initial: low
        .mockResolvedValueOnce({ amount: "5000000", denom: "uclaw" }); // after faucet: enough
      (StargateClient.connect as ReturnType<typeof vi.fn>).mockResolvedValue({
        getBalance: mockGetBalance,
        disconnect: vi.fn(),
      });

      const faucetFetchCalls: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("/credit")) {
          faucetFetchCalls.push(urlStr);
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ txHash: "FAUCET_TX_123" }),
          });
        }
        if (urlStr.includes("/clawchain/agent/v1/agent/")) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (urlStr.endsWith("/status")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                result: { sync_info: { latest_block_height: "100" } },
              }),
          });
        }
        return Promise.reject(new Error(`unexpected fetch: ${urlStr}`));
      }) as unknown as typeof fetch;

      const result = await runBootstrap({ faucetUrl: "http://test-faucet:8888" });

      expect(faucetFetchCalls).toHaveLength(1);
      expect(faucetFetchCalls[0]).toContain("test-faucet:8888/credit");
      expect(result.steps.funded).toBe(true);
      expect(result.fundingTxHash).toBe("FAUCET_TX_123");
    }, 15_000);
  });
});
