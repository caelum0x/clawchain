/**
 * Tests for package exports and types.
 *
 * React Native is mocked via __mocks__/react-native.ts since the
 * node test environment doesn't have the RN runtime.
 */

import {
  // Hooks
  useBalance,
  usePrivacyShield,
  useGovernanceProposals,
  // Screens
  GovernanceScreen,
  AgentDashboard,
  PrivacyShield,
  DexSwap,
  TaskManager,
  Faucet,
  // Services
  ClawChainMobileApi,
  clawchainApi,
  DEFAULT_CONFIG,
  TESTNET_CONFIG,
  LOCAL_CONFIG,
  pushNotificationService,
  getStubService,
} from "../index";

describe("Package exports", () => {
  describe("hooks", () => {
    it("should export useBalance", () => {
      expect(useBalance).toBeDefined();
      expect(typeof useBalance).toBe("function");
    });

    it("should export usePrivacyShield", () => {
      expect(usePrivacyShield).toBeDefined();
      expect(typeof usePrivacyShield).toBe("function");
    });

    it("should export useGovernanceProposals", () => {
      expect(useGovernanceProposals).toBeDefined();
      expect(typeof useGovernanceProposals).toBe("function");
    });
  });

  describe("screens", () => {
    it("should export GovernanceScreen", () => {
      expect(GovernanceScreen).toBeDefined();
    });

    it("should export AgentDashboard", () => {
      expect(AgentDashboard).toBeDefined();
    });

    it("should export PrivacyShield", () => {
      expect(PrivacyShield).toBeDefined();
    });

    it("should export DexSwap", () => {
      expect(DexSwap).toBeDefined();
    });

    it("should export TaskManager", () => {
      expect(TaskManager).toBeDefined();
    });

    it("should export Faucet", () => {
      expect(Faucet).toBeDefined();
    });
  });

  describe("services", () => {
    it("should export ClawChainMobileApi class", () => {
      expect(ClawChainMobileApi).toBeDefined();
      const api = new ClawChainMobileApi();
      expect(api.getConfig()).toBeDefined();
    });

    it("should export singleton clawchainApi", () => {
      expect(clawchainApi).toBeDefined();
      expect(clawchainApi).toBeInstanceOf(ClawChainMobileApi);
    });

    it("should export pushNotificationService", () => {
      expect(pushNotificationService).toBeDefined();
      expect(typeof pushNotificationService.registerForPushNotifications).toBe(
        "function"
      );
      expect(typeof pushNotificationService.getNotifications).toBe("function");
    });

    it("should export getStubService", () => {
      expect(getStubService).toBeDefined();
      const stub = getStubService();
      expect(typeof stub.simulateNotification).toBe("function");
    });
  });

  describe("configs", () => {
    it("should have correct DEFAULT_CONFIG", () => {
      expect(DEFAULT_CONFIG.chainId).toBe("clawchain-1");
      expect(DEFAULT_CONFIG.bech32Prefix).toBe("claw");
      expect(DEFAULT_CONFIG.denom).toBe("uclaw");
      expect(DEFAULT_CONFIG.displayDenom).toBe("CLAW");
      expect(DEFAULT_CONFIG.decimals).toBe(6);
    });

    it("should have correct TESTNET_CONFIG", () => {
      expect(TESTNET_CONFIG.chainId).toBe("clawchain-testnet-1");
      expect(TESTNET_CONFIG.rest).toContain("testnet");
    });

    it("should have correct LOCAL_CONFIG", () => {
      expect(LOCAL_CONFIG.chainId).toBe("clawchain-local");
      expect(LOCAL_CONFIG.rest).toBe("http://localhost:1317");
      expect(LOCAL_CONFIG.rpc).toBe("http://localhost:26657");
    });
  });
});
