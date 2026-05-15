import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Reputation from "../Reputation";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetTopAgents = vi.fn();
const mockGetLiveAgents = vi.fn();
const mockGetReputation = vi.fn();
const mockGetAgentRewards = vi.fn();
const mockGetRewardLeaderboard = vi.fn();
const mockGetAgentLiveness = vi.fn();
const mockGetEndorsements = vi.fn();
const mockGetRatings = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getTopAgents: (...args: unknown[]) => mockGetTopAgents(...args),
  getLiveAgents: (...args: unknown[]) => mockGetLiveAgents(...args),
  getReputation: (...args: unknown[]) => mockGetReputation(...args),
  getAgentRewards: (...args: unknown[]) => mockGetAgentRewards(...args),
  getRewardLeaderboard: (...args: unknown[]) => mockGetRewardLeaderboard(...args),
  getAgentLiveness: (...args: unknown[]) => mockGetAgentLiveness(...args),
  getEndorsements: (...args: unknown[]) => mockGetEndorsements(...args),
  getRatings: (...args: unknown[]) => mockGetRatings(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    rpcEndpoint: "http://localhost:26657",
    restEndpoint: "http://localhost:1317",
    chainId: "clawchain-test",
    denom: "uclaw",
  },
}));

vi.mock("../../hooks/useChainEvents.ts", () => ({
  useChainEvents: () => ({ connected: false, lastEvent: null }),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeReputation(overrides: Record<string, unknown> = {}) {
  return {
    agentAddress: "claw1abc123def456ghi789jkl012mno345pqr678stu",
    totalRatings: "12",
    ratingSum: "4800",
    avgRatingBps: "400",
    endorsementCount: "5",
    ...overrides,
  };
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    address: "claw1abc123def456ghi789jkl012mno345pqr678stu",
    name: "AgentAlpha",
    endpoint: "https://agent.example.com/api",
    active: true,
    pubkey: "",
    supportedTools: ["text-generation"],
    ...overrides,
  };
}

/** Generate N agents with distinct addresses and varied reputation. */
function generateAgents(n: number) {
  const topAgents = [];
  const liveAgents = [];
  for (let i = 0; i < n; i++) {
    const addr = `claw1agent${String(i).padStart(4, "0")}_long_enough_pad`;
    const rating = Math.max(100, 500 - i * 40); // 500, 460, 420, ...
    topAgents.push(
      makeReputation({
        agentAddress: addr,
        avgRatingBps: String(rating),
        totalRatings: String(20 - i),
        endorsementCount: String(Math.max(0, 8 - i)),
      }),
    );
    liveAgents.push(
      makeAgent({
        address: addr,
        name: `Agent-${i + 1}`,
        active: i < n - 1,
      }),
    );
  }
  return { topAgents, liveAgents };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderReputation() {
  return render(
    <MemoryRouter>
      <Reputation />
    </MemoryRouter>,
  );
}

function setupMocks(agentCount = 5) {
  const { topAgents, liveAgents } = generateAgents(agentCount);
  mockGetTopAgents.mockResolvedValue(topAgents);
  mockGetLiveAgents.mockResolvedValue(liveAgents);
  mockGetRewardLeaderboard.mockResolvedValue(
    liveAgents.map((a) => ({
      address: a.address,
      name: a.name,
      cumulativeRewards: "5000000",
    })),
  );
  mockGetReputation.mockResolvedValue(topAgents[0]);
  mockGetAgentRewards.mockResolvedValue({
    address: "",
    cumulativeRewards: "5000000",
    denom: "uclaw",
  });
  mockGetAgentLiveness.mockResolvedValue({ uptimeBlocks: 95, isHealthy: true });
  mockGetEndorsements.mockResolvedValue([]);
  mockGetRatings.mockResolvedValue([]);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Reputation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Renders podium section with top 3
  it("renders podium section with top 3 agents", async () => {
    setupMocks(5);
    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("podium")).toBeInTheDocument();
    });

    expect(screen.getByTestId("podium-gold")).toBeInTheDocument();
    expect(screen.getByTestId("podium-silver")).toBeInTheDocument();
    expect(screen.getByTestId("podium-bronze")).toBeInTheDocument();
  });

  // 2. Rankings table shows agents
  it("renders rankings table with agent rows", async () => {
    setupMocks(5);
    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("rankings-table")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("ranking-row");
    expect(rows.length).toBe(5);
  });

  // 3. BarChart for top 10 renders
  it("renders bar chart for top 10 agents", async () => {
    setupMocks(5);
    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("bar-top10")).toBeInTheDocument();
    });

    // The BarChart component should be rendered inside
    expect(screen.getByText("Top 10 by Reputation Score")).toBeInTheDocument();
  });

  // 4. Agent lookup search exists
  it("renders agent lookup search input on lookup tab", async () => {
    setupMocks(3);
    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("tab-lookup")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-lookup"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-input")).toBeInTheDocument();
      expect(screen.getByTestId("lookup-btn")).toBeInTheDocument();
    });
  });

  // 5. Score breakdown shows components
  it("shows score breakdown with components after lookup", async () => {
    const rep = makeReputation({
      agentAddress: "claw1test_addr_long_enough_to_show_result",
      avgRatingBps: "450",
      totalRatings: "8",
      endorsementCount: "3",
    });
    mockGetTopAgents.mockResolvedValue([]);
    mockGetLiveAgents.mockResolvedValue([]);
    mockGetRewardLeaderboard.mockResolvedValue([]);
    mockGetReputation.mockResolvedValue(rep);
    mockGetAgentRewards.mockResolvedValue({
      address: "claw1test_addr_long_enough_to_show_result",
      cumulativeRewards: "2000000",
      denom: "uclaw",
    });
    mockGetAgentLiveness.mockResolvedValue({ uptimeBlocks: 90, isHealthy: true });
    mockGetEndorsements.mockResolvedValue([]);
    mockGetRatings.mockResolvedValue([]);

    renderReputation();

    // Switch to lookup tab
    await waitFor(() => {
      expect(screen.getByTestId("tab-lookup")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-lookup"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-input")).toBeInTheDocument();
    });

    // Type address and submit
    await user.type(screen.getByTestId("lookup-input"), "claw1test_addr_long_enough_to_show_result");
    await user.click(screen.getByTestId("lookup-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("score-breakdown")).toBeInTheDocument();
    });

    // Check individual components exist
    expect(screen.getByText("Task Completion")).toBeInTheDocument();
    expect(screen.getByText("SLA Adherence")).toBeInTheDocument();
    expect(screen.getByText("Uptime")).toBeInTheDocument();
    expect(screen.getByText("Community Ratings")).toBeInTheDocument();
  });

  // 6. Mining rewards tab exists and shows formula
  it("renders mining rewards tab with reward formula", async () => {
    setupMocks(3);
    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("tab-rewards")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-rewards"));

    await waitFor(() => {
      expect(screen.getByTestId("rewards-tab")).toBeInTheDocument();
      expect(screen.getByTestId("reward-formula")).toBeInTheDocument();
    });

    expect(screen.getByText("Reward Distribution Formula")).toBeInTheDocument();
    expect(screen.getByText("Base Reward")).toBeInTheDocument();
    expect(screen.getByText("Reputation Bonus")).toBeInTheDocument();
  });

  // 7. Empty state when no data
  it("shows empty state when no agents have reputation data", async () => {
    mockGetTopAgents.mockResolvedValue([]);
    mockGetLiveAgents.mockResolvedValue([]);
    mockGetRewardLeaderboard.mockResolvedValue([]);

    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("rankings-table")).toBeInTheDocument();
    });

    expect(screen.getByTestId("empty-leaderboard")).toBeInTheDocument();
    expect(
      screen.getByText(/No rated agents found/),
    ).toBeInTheDocument();
  });

  // 8. Stats overview shows 4 stat cards
  it("renders stats overview cards", async () => {
    setupMocks(4);
    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("stats-overview")).toBeInTheDocument();
    });

    expect(screen.getByText("Rated Agents")).toBeInTheDocument();
    expect(screen.getByText("Avg Reputation")).toBeInTheDocument();
    expect(screen.getByText("Total Endorsements")).toBeInTheDocument();
    expect(screen.getByText("Highest Score")).toBeInTheDocument();
  });

  // 9. DonutChart distribution renders
  it("renders donut chart for score distribution", async () => {
    setupMocks(5);
    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("donut-distribution")).toBeInTheDocument();
    });

    expect(screen.getByText("Score Distribution")).toBeInTheDocument();
  });

  // 10. Score meter shows in lookup result
  it("shows score meter in lookup result", async () => {
    const rep = makeReputation({
      agentAddress: "claw1meter_addr_long_enough_for_testing",
      avgRatingBps: "350",
      totalRatings: "6",
      endorsementCount: "2",
    });
    mockGetTopAgents.mockResolvedValue([]);
    mockGetLiveAgents.mockResolvedValue([]);
    mockGetRewardLeaderboard.mockResolvedValue([]);
    mockGetReputation.mockResolvedValue(rep);
    mockGetAgentRewards.mockResolvedValue({
      address: "claw1meter_addr_long_enough_for_testing",
      cumulativeRewards: "1000000",
      denom: "uclaw",
    });
    mockGetAgentLiveness.mockResolvedValue({ uptimeBlocks: 80, isHealthy: true });
    mockGetEndorsements.mockResolvedValue([]);
    mockGetRatings.mockResolvedValue([]);

    renderReputation();

    await waitFor(() => {
      expect(screen.getByTestId("tab-lookup")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-lookup"));

    await waitFor(() => {
      expect(screen.getByTestId("lookup-input")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("lookup-input"), "claw1meter_addr_long_enough_for_testing");
    await user.click(screen.getByTestId("lookup-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("score-meter")).toBeInTheDocument();
    });
  });

  // 11. Trend indicators appear in the table
  it("renders trend indicators in ranking rows", async () => {
    setupMocks(5);
    renderReputation();

    await waitFor(() => {
      const trends = screen.getAllByTestId("trend-indicator");
      expect(trends.length).toBe(5);
    });
  });

  // 12. Loading state shows initially
  it("shows loading state initially", () => {
    mockGetTopAgents.mockReturnValue(new Promise(() => {}));
    mockGetLiveAgents.mockReturnValue(new Promise(() => {}));
    mockGetRewardLeaderboard.mockReturnValue(new Promise(() => {}));

    renderReputation();

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.getByText("Loading reputation data...")).toBeInTheDocument();
  });
});
