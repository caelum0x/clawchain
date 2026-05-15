import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Leaderboard from "../Leaderboard";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetLiveAgents = vi.fn();
const mockGetTopAgents = vi.fn();
const mockGetValidators = vi.fn();
const mockGetRewardLeaderboard = vi.fn();
const mockGetAgentRewards = vi.fn();
const mockGetReputation = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getLiveAgents: (...args: unknown[]) => mockGetLiveAgents(...args),
  getTopAgents: (...args: unknown[]) => mockGetTopAgents(...args),
  getValidators: (...args: unknown[]) => mockGetValidators(...args),
  getRewardLeaderboard: (...args: unknown[]) => mockGetRewardLeaderboard(...args),
  getAgentRewards: (...args: unknown[]) => mockGetAgentRewards(...args),
  getReputation: (...args: unknown[]) => mockGetReputation(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    address: "claw1agent1_addr_long_enough_to_truncate_test000",
    name: "SentinelBot",
    endpoint: "http://agent.local",
    active: true,
    pubkey: "abc123",
    supported_tools: ["inference"],
    ...overrides,
  };
}

function makeReputation(overrides: Record<string, unknown> = {}) {
  return {
    agentAddress: "claw1agent1_addr_long_enough_to_truncate_test000",
    totalRatings: "8",
    ratingSum: "640",
    avgRatingBps: "8000",
    endorsementCount: "3",
    ...overrides,
  };
}

function makeValidator(overrides: Record<string, unknown> = {}) {
  return {
    moniker: "ClawStake",
    operatorAddress: "clawvaloper1_addr_long_enough_to_truncate_test0000",
    tokens: "15200000000",
    status: "BOND_STATUS_BONDED",
    commission: "0.05",
    jailed: false,
    ...overrides,
  };
}

function makeRewardEntry(overrides: Record<string, unknown> = {}) {
  return {
    address: "claw1agent1_addr_long_enough_to_truncate_test000",
    name: "SentinelBot",
    cumulativeRewards: "4820000000",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setupMocks(
  agents = [makeAgent()],
  reputations = [makeReputation()],
  validators = [makeValidator()],
  rewards = [makeRewardEntry()],
) {
  mockGetLiveAgents.mockResolvedValue(agents);
  mockGetTopAgents.mockResolvedValue(reputations);
  mockGetValidators.mockResolvedValue(validators);
  mockGetRewardLeaderboard.mockResolvedValue(rewards);
  mockGetReputation.mockResolvedValue(null);
}

function renderLeaderboard() {
  return render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockGetLiveAgents.mockReturnValue(new Promise(() => {}));
    mockGetTopAgents.mockReturnValue(new Promise(() => {}));
    mockGetValidators.mockReturnValue(new Promise(() => {}));
    mockGetRewardLeaderboard.mockReturnValue(new Promise(() => {}));

    renderLeaderboard();

    expect(screen.getByText("Loading leaderboard data...")).toBeInTheDocument();
  });

  // 2. Renders page title and subtitle
  it("renders page title and subtitle after loading", async () => {
    setupMocks();
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText("Leaderboard")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Top agents, validators, and contributors across the ClawChain network/),
    ).toBeInTheDocument();
  });

  // 3. Shows summary stat cards after loading
  it("renders summary stat cards after loading", async () => {
    setupMocks();
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText("Ranked Agents")).toBeInTheDocument();
    });

    expect(screen.getByText("Avg Reputation")).toBeInTheDocument();
    expect(screen.getByText("Total Ratings")).toBeInTheDocument();
    expect(screen.getByText("Total Earnings")).toBeInTheDocument();
  });

  // 4. Renders three tab buttons
  it("renders three tab buttons", async () => {
    setupMocks();
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId("tab-agents")).toBeInTheDocument();
    });

    expect(screen.getByTestId("tab-validators")).toBeInTheDocument();
    expect(screen.getByTestId("tab-earners")).toBeInTheDocument();
  });

  // 5. Default tab shows Top Agents table
  it("shows Top Agents table by default with agent rows", async () => {
    setupMocks();
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId("agents-tab")).toBeInTheDocument();
    });

    // "Top Agents" appears as the tab button label and as the h3 heading inside the tab
    expect(screen.getByRole("heading", { level: 3, name: "Top Agents" })).toBeInTheDocument();
    const rows = screen.getAllByTestId("agent-row");
    expect(rows.length).toBe(1);
    expect(screen.getByText("SentinelBot")).toBeInTheDocument();
  });

  // 6. Agents table shows correct column headers
  it("shows correct column headers on agents tab", async () => {
    setupMocks();
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId("agents-tab")).toBeInTheDocument();
    });

    expect(screen.getByText("Reputation")).toBeInTheDocument();
    expect(screen.getByText("Ratings")).toBeInTheDocument();
    expect(screen.getByText("Endorsements")).toBeInTheDocument();
    expect(screen.getByText("Earnings")).toBeInTheDocument();
  });

  // 7. Switching to Validators tab
  it("switches to Top Validators tab and shows validator rows", async () => {
    setupMocks(
      [makeAgent()],
      [makeReputation()],
      [
        makeValidator({ moniker: "ClawStake" }),
        makeValidator({
          operatorAddress: "clawvaloper2_addr_long_enough_to_truncate_test0000",
          moniker: "AIValidators",
        }),
      ],
    );
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId("tab-validators")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-validators"));

    expect(screen.getByTestId("validators-tab")).toBeInTheDocument();
    const rows = screen.getAllByTestId("validator-row");
    expect(rows.length).toBe(2);
    expect(screen.getByText("ClawStake")).toBeInTheDocument();
    expect(screen.getByText("AIValidators")).toBeInTheDocument();
  });

  // 8. Switching to Earners tab
  it("switches to Top Earners tab and shows earner rows", async () => {
    setupMocks();
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId("tab-earners")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-earners"));

    expect(screen.getByTestId("earners-tab")).toBeInTheDocument();
    const rows = screen.getAllByTestId("earner-row");
    expect(rows.length).toBe(1);
  });

  // 9. Empty state when no agents
  it("shows empty message when no agents are registered", async () => {
    setupMocks([], [], [makeValidator()], []);
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByText("No agents registered on chain yet.")).toBeInTheDocument();
    });
  });

  // 10. Search filter works on agents tab
  it("filters agents by search input", async () => {
    setupMocks(
      [
        makeAgent({ address: "claw1agent1_addr_long_enough_to_truncate_test000", name: "SentinelBot" }),
        makeAgent({ address: "claw1agent2_addr_long_enough_to_truncate_test000", name: "DataWeaver" }),
      ],
      [
        makeReputation({ agentAddress: "claw1agent1_addr_long_enough_to_truncate_test000", avgRatingBps: "9000" }),
        makeReputation({ agentAddress: "claw1agent2_addr_long_enough_to_truncate_test000", avgRatingBps: "8000" }),
      ],
    );
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId("agents-tab")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.type(screen.getByTestId("search-input"), "Sentinel");

    const rows = screen.getAllByTestId("agent-row");
    expect(rows.length).toBe(1);
    expect(screen.getByText("SentinelBot")).toBeInTheDocument();
  });

  // 11. Validators tab shows correct column headers
  it("shows correct column headers on validators tab", async () => {
    setupMocks();
    renderLeaderboard();

    await waitFor(() => {
      expect(screen.getByTestId("tab-validators")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-validators"));

    expect(screen.getByText("Moniker")).toBeInTheDocument();
    expect(screen.getByText("Voting Power")).toBeInTheDocument();
    expect(screen.getByText("Commission")).toBeInTheDocument();
  });

  // 12. Shows error when data fails to load
  it("shows error message when data fails to load", async () => {
    mockGetLiveAgents.mockRejectedValue(new Error("Connection refused"));
    mockGetTopAgents.mockRejectedValue(new Error("Connection refused"));
    mockGetValidators.mockRejectedValue(new Error("Connection refused"));
    mockGetRewardLeaderboard.mockRejectedValue(new Error("Connection refused"));

    renderLeaderboard();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load leaderboard data. Is the chain running?"),
      ).toBeInTheDocument();
    });
  });
});
