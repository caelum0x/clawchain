/**
 * Tests for ClawChainMobileApi service.
 */

import {
  ClawChainMobileApi,
  DEFAULT_CONFIG,
  TESTNET_CONFIG,
  LOCAL_CONFIG,
} from "../services/clawchain-api";

// Mock global fetch
const originalFetch = globalThis.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  globalThis.fetch = mockFetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("ClawChainMobileApi", () => {
  let api: ClawChainMobileApi;

  beforeEach(() => {
    api = new ClawChainMobileApi(LOCAL_CONFIG);
  });

  describe("constructor and config", () => {
    it("should use default config when none provided", () => {
      const defaultApi = new ClawChainMobileApi();
      expect(defaultApi.getConfig().chainId).toBe(DEFAULT_CONFIG.chainId);
    });

    it("should accept custom config", () => {
      expect(api.getConfig().chainId).toBe("clawchain-local");
    });

    it("should allow updating config", () => {
      api.setConfig(TESTNET_CONFIG);
      expect(api.getConfig().chainId).toBe("clawchain-testnet-1");
    });
  });

  describe("getBalance", () => {
    it("should return balances from REST endpoint", async () => {
      const mockBalances = [
        { denom: "uclaw", amount: "1000000" },
        { denom: "uatom", amount: "500000" },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: mockBalances }),
      });

      const result = await api.getBalance("claw1abc123");
      expect(result).toEqual(mockBalances);
      expect(mockFetch).toHaveBeenCalledWith(
        `${LOCAL_CONFIG.rest}/cosmos/bank/v1beta1/balances/claw1abc123`
      );
    });

    it("should return empty array on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await api.getBalance("claw1abc123");
      expect(result).toEqual([]);
    });

    it("should return empty array on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await api.getBalance("claw1abc123");
      expect(result).toEqual([]);
    });

    it("should handle missing balances field", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });
      const result = await api.getBalance("claw1abc123");
      expect(result).toEqual([]);
    });
  });

  describe("getShieldedBalance", () => {
    it("should return shielded balance", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balance: "5000000" }),
      });

      const result = await api.getShieldedBalance("claw1abc123");
      expect(result).toBe("5000000");
    });

    it("should return '0' on error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      const result = await api.getShieldedBalance("claw1abc123");
      expect(result).toBe("0");
    });
  });

  describe("shield / unshield", () => {
    it("should return simulated shield result", async () => {
      const result = await api.shield("claw1abc123", "1000000");
      expect(result.simulated).toBe(true);
      expect(result.txHash).toContain("SIMULATED-shield-");
    });

    it("should return simulated unshield result", async () => {
      const result = await api.unshield("claw1abc123", "500000");
      expect(result.simulated).toBe(true);
      expect(result.txHash).toContain("SIMULATED-unshield-");
    });
  });

  describe("getProposals", () => {
    it("should fetch all proposals", async () => {
      const mockProposals = [
        {
          id: "1",
          title: "Test Proposal",
          summary: "A test",
          status: "voting",
          proposer: "claw1proposer",
          submit_time: "2026-03-01T00:00:00Z",
          voting_end_time: "2026-03-08T00:00:00Z",
          yes_votes: "100",
          no_votes: "50",
          abstain_votes: "10",
          veto_votes: "5",
          total_deposit: [{ denom: "uclaw", amount: "10000000" }],
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ proposals: mockProposals }),
      });

      const result = await api.getProposals();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      expect(result[0].title).toBe("Test Proposal");
      expect(result[0].yesVotes).toBe("100");
      expect(result[0].vetoVotes).toBe("5");
    });

    it("should pass status filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ proposals: [] }),
      });

      await api.getProposals("voting");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("?status=voting")
      );
    });

    it("should return empty array on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fail"));
      const result = await api.getProposals();
      expect(result).toEqual([]);
    });
  });

  describe("getProposal", () => {
    it("should fetch a single proposal", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          proposal: { id: "5", title: "Prop 5", status: "passed" },
        }),
      });

      const result = await api.getProposal("5");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("5");
      expect(result!.status).toBe("passed");
    });

    it("should return null on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await api.getProposal("999");
      expect(result).toBeNull();
    });
  });

  describe("getProposalVotes", () => {
    it("should fetch votes", async () => {
      const mockVotes = [
        { voter: "claw1voter1", option: "yes", proposalId: "1" },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ votes: mockVotes }),
      });

      const result = await api.getProposalVotes("1");
      expect(result).toHaveLength(1);
      expect(result[0].voter).toBe("claw1voter1");
    });
  });

  describe("voteOnProposal", () => {
    it("should return simulated vote result", async () => {
      const result = await api.voteOnProposal("1", "yes", "claw1voter");
      expect(result.simulated).toBe(true);
      expect(result.txHash).toContain("SIMULATED-vote-");
    });
  });

  describe("getAgents", () => {
    it("should fetch agent list", async () => {
      const mockAgents = [
        {
          address: "claw1agent1",
          name: "Agent-1",
          status: "active",
          endpoint: "http://localhost:8080",
          capabilities: ["compute", "inference"],
          rewards_earned: "5000000",
          tasks_completed: 10,
          created_at: "2026-01-01T00:00:00Z",
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: mockAgents }),
      });

      const result = await api.getAgents();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Agent-1");
      expect(result[0].capabilities).toEqual(["compute", "inference"]);
      expect(result[0].tasksCompleted).toBe(10);
    });

    it("should return empty array on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fail"));
      const result = await api.getAgents();
      expect(result).toEqual([]);
    });
  });

  describe("getAgent", () => {
    it("should fetch a single agent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agent: { address: "claw1x", name: "X", status: "active" },
        }),
      });

      const result = await api.getAgent("claw1x");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("X");
    });

    it("should return null on error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });
      const result = await api.getAgent("claw1missing");
      expect(result).toBeNull();
    });
  });
});
