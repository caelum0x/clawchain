/**
 * Tests for React hooks — useBalance, usePrivacyShield, useGovernanceProposals.
 *
 * These are unit tests for the hook logic; they do NOT render React components.
 * Instead we verify the underlying service interactions that the hooks depend on.
 * Full rendering tests would require @testing-library/react-native.
 */

import {
  ClawChainMobileApi,
  LOCAL_CONFIG,
} from "../services/clawchain-api";

// Mock fetch globally
const originalFetch = globalThis.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  mockFetch = jest.fn();
  globalThis.fetch = mockFetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("Hook backing logic — balance", () => {
  let api: ClawChainMobileApi;

  beforeEach(() => {
    api = new ClawChainMobileApi(LOCAL_CONFIG);
  });

  it("should fetch both public and shielded balance", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balances: [{ denom: "uclaw", amount: "2000000" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ balance: "500000" }),
      });

    const [balances, shielded] = await Promise.all([
      api.getBalance("claw1test"),
      api.getShieldedBalance("claw1test"),
    ]);

    expect(balances).toHaveLength(1);
    expect(balances[0].amount).toBe("2000000");
    expect(shielded).toBe("500000");
  });

  it("should handle concurrent fetch errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network down"));

    const [balances, shielded] = await Promise.all([
      api.getBalance("claw1test"),
      api.getShieldedBalance("claw1test"),
    ]);

    expect(balances).toEqual([]);
    expect(shielded).toBe("0");
  });
});

describe("Hook backing logic — privacy shield", () => {
  let api: ClawChainMobileApi;

  beforeEach(() => {
    api = new ClawChainMobileApi(LOCAL_CONFIG);
  });

  it("should return distinct tx hashes for shield and unshield", async () => {
    const shieldResult = await api.shield("claw1user", "1000000");
    const unshieldResult = await api.unshield("claw1user", "500000");

    expect(shieldResult.txHash).not.toBe(unshieldResult.txHash);
    expect(shieldResult.simulated).toBe(true);
    expect(unshieldResult.simulated).toBe(true);
  });

  it("should include operation type in tx hash", async () => {
    const shieldResult = await api.shield("claw1user", "1000000");
    const unshieldResult = await api.unshield("claw1user", "500000");

    expect(shieldResult.txHash).toContain("shield");
    expect(unshieldResult.txHash).toContain("unshield");
  });
});

describe("Hook backing logic — governance proposals", () => {
  let api: ClawChainMobileApi;

  beforeEach(() => {
    api = new ClawChainMobileApi(LOCAL_CONFIG);
  });

  it("should parse proposal with all fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        proposals: [
          {
            id: "1",
            title: "Upgrade Module",
            summary: "Upgrade the agent module to v2",
            status: "voting",
            proposer: "claw1proposer",
            submit_time: "2026-03-01T00:00:00Z",
            voting_end_time: "2026-03-08T00:00:00Z",
            yes_votes: "500",
            no_votes: "100",
            abstain_votes: "50",
            veto_votes: "10",
            total_deposit: [{ denom: "uclaw", amount: "10000000" }],
          },
        ],
      }),
    });

    const proposals = await api.getProposals();
    expect(proposals).toHaveLength(1);

    const p = proposals[0];
    expect(p.id).toBe("1");
    expect(p.title).toBe("Upgrade Module");
    expect(p.status).toBe("voting");
    expect(p.yesVotes).toBe("500");
    expect(p.noVotes).toBe("100");
    expect(p.abstainVotes).toBe("50");
    expect(p.vetoVotes).toBe("10");
    expect(p.totalDeposit).toHaveLength(1);
  });

  it("should handle proposal with missing optional fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        proposals: [{ id: "2" }],
      }),
    });

    const proposals = await api.getProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].title).toBe("");
    expect(proposals[0].yesVotes).toBe("0");
    expect(proposals[0].totalDeposit).toEqual([]);
  });

  it("should fetch votes for a proposal", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        votes: [
          { voter: "claw1a", option: "yes", proposalId: "1" },
          { voter: "claw1b", option: "no", proposalId: "1" },
        ],
      }),
    });

    const votes = await api.getProposalVotes("1");
    expect(votes).toHaveLength(2);
    expect(votes[0].option).toBe("yes");
    expect(votes[1].option).toBe("no");
  });

  it("should simulate voting", async () => {
    const result = await api.voteOnProposal("1", "yes", "claw1voter");
    expect(result.simulated).toBe(true);
    expect(result.txHash).toContain("SIMULATED-vote-");
  });
});

describe("Hook backing logic — agents", () => {
  let api: ClawChainMobileApi;

  beforeEach(() => {
    api = new ClawChainMobileApi(LOCAL_CONFIG);
  });

  it("should parse agent with string capabilities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: [
          {
            address: "claw1agent1",
            name: "Test Agent",
            status: "active",
            capabilities: "compute,inference",
            rewards_earned: "1000000",
            tasks_completed: 5,
          },
        ],
      }),
    });

    const agents = await api.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].capabilities).toEqual(["compute", "inference"]);
  });

  it("should parse agent with array capabilities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: [
          {
            address: "claw1agent2",
            name: "Agent 2",
            status: "active",
            capabilities: ["storage", "network"],
          },
        ],
      }),
    });

    const agents = await api.getAgents();
    expect(agents[0].capabilities).toEqual(["storage", "network"]);
  });

  it("should handle agent with no capabilities", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: [{ address: "claw1agent3" }],
      }),
    });

    const agents = await api.getAgents();
    expect(agents[0].capabilities).toEqual([]);
  });
});
