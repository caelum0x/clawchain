import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Agents from "../Agents";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetLiveAgents = vi.fn();
const mockGetTopAgents = vi.fn();
const mockGetReputation = vi.fn();
const mockGetAgentRewards = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getLiveAgents: (...args: unknown[]) => mockGetLiveAgents(...args),
  getTopAgents: (...args: unknown[]) => mockGetTopAgents(...args),
  getAgentInfo: vi.fn().mockResolvedValue(null),
  getReputation: (...args: unknown[]) => mockGetReputation(...args),
  getAgentRewards: (...args: unknown[]) => mockGetAgentRewards(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    address: "claw1abc123def456ghi789jkl012mno345pqr678stu",
    name: "TestAgent",
    endpoint: "https://agent.example.com/api",
    active: true,
    pubkey: "",
    supportedTools: ["text-generation", "code-review"],
    ...overrides,
  };
}

function makeReputation(overrides: Record<string, unknown> = {}) {
  return {
    agentAddress: "claw1abc123def456ghi789jkl012mno345pqr678stu",
    totalRatings: "10",
    ratingSum: "8500",
    avgRatingBps: "8500",
    endorsementCount: "3",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderAgents() {
  return render(
    <MemoryRouter>
      <Agents />
    </MemoryRouter>,
  );
}

/** Set up mocks so agents load successfully. */
function setupAgentsMock(agents = [makeAgent()]) {
  mockGetLiveAgents.mockResolvedValue(agents);
  mockGetTopAgents.mockResolvedValue([]);
  mockGetReputation.mockResolvedValue(makeReputation());
  mockGetAgentRewards.mockResolvedValue({ address: "", cumulativeRewards: "5000000", denom: "uclaw" });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Renders search bar and filter chips
  it("renders search bar and filter chips", async () => {
    setupAgentsMock();
    renderAgents();

    await waitFor(() => {
      expect(screen.getByTestId("agent-search")).toBeInTheDocument();
    });

    expect(screen.getByTestId("filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("filter-active")).toBeInTheDocument();
    expect(screen.getByTestId("filter-inactive")).toBeInTheDocument();
  });

  // 2. Shows agent cards when data loaded
  it("shows agent cards when data loaded", async () => {
    setupAgentsMock([makeAgent(), makeAgent({ address: "claw1second_addr_long_enough_to_truncate", name: "Agent2" })]);
    renderAgents();

    await waitFor(() => {
      const cards = screen.getAllByTestId("agent-card");
      expect(cards.length).toBe(2);
    });

    expect(screen.getByText("TestAgent")).toBeInTheDocument();
    expect(screen.getByText("Agent2")).toBeInTheDocument();
  });

  // 3. Status filter works (Active/Inactive)
  it("filters agents by active status", async () => {
    setupAgentsMock([
      makeAgent({ name: "ActiveBot", active: true }),
      makeAgent({
        address: "claw1inactive_addr_long_enough_to_truncate",
        name: "InactiveBot",
        active: false,
      }),
    ]);

    renderAgents();

    // Wait for agents to load
    await waitFor(() => {
      expect(screen.getAllByTestId("agent-card").length).toBe(2);
    });

    // Click "Active" filter
    const user = userEvent.setup();
    await user.click(screen.getByTestId("filter-active"));

    await waitFor(() => {
      // Only the active agent should remain (inactive is filtered out)
      const cards = screen.getAllByTestId("agent-card");
      expect(cards.length).toBe(1);
    });

    expect(screen.getByText("ActiveBot")).toBeInTheDocument();
    expect(screen.queryByText("InactiveBot")).not.toBeInTheDocument();
  });

  // 4. Card view / table view toggle
  it("toggles between card view and table view", async () => {
    setupAgentsMock();
    renderAgents();

    await waitFor(() => {
      expect(screen.getByTestId("agent-grid")).toBeInTheDocument();
    });

    const user = userEvent.setup();

    // Switch to table view
    await user.click(screen.getByTestId("view-table"));

    await waitFor(() => {
      expect(screen.queryByTestId("agent-grid")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("agent-table-row").length).toBeGreaterThan(0);
    });

    // Switch back to card view
    await user.click(screen.getByTestId("view-card"));

    await waitFor(() => {
      expect(screen.getByTestId("agent-grid")).toBeInTheDocument();
    });
  });

  // 5. Agent detail opens on click
  it("opens agent detail panel when View Detail is clicked", async () => {
    setupAgentsMock();
    renderAgents();

    await waitFor(() => {
      expect(screen.getByTestId("agent-card")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    const viewDetailBtn = screen.getByText("View Detail");
    await user.click(viewDetailBtn);

    await waitFor(() => {
      expect(screen.getByTestId("agent-detail")).toBeInTheDocument();
    });

    // Modal should contain detail heading
    expect(screen.getByText("Agent Detail")).toBeInTheDocument();
    // Agent name appears in both the card and the modal
    expect(screen.getAllByText("TestAgent").length).toBeGreaterThanOrEqual(2);
  });

  // 6. Register agent section exists
  it("renders the register agent section", async () => {
    setupAgentsMock();
    renderAgents();

    await waitFor(() => {
      expect(screen.getByTestId("register-section")).toBeInTheDocument();
    });

    expect(screen.getByText("Register New Agent")).toBeInTheDocument();
  });

  // 7. Empty state message
  it("shows empty state when no agents are registered", async () => {
    mockGetLiveAgents.mockResolvedValue([]);
    mockGetTopAgents.mockResolvedValue([]);
    renderAgents();

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/No agents registered yet/i),
    ).toBeInTheDocument();
  });

  // 8. Shows loading state
  it("shows loading state initially", () => {
    mockGetLiveAgents.mockReturnValue(new Promise(() => {}));
    mockGetTopAgents.mockReturnValue(new Promise(() => {}));

    renderAgents();

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.getByText("Loading agents...")).toBeInTheDocument();
  });

  // 9. Agent count badge updates
  it("shows agent count badge", async () => {
    setupAgentsMock([
      makeAgent(),
      makeAgent({ address: "claw1addr2_long_enough_to_truncate_test", name: "Bot2" }),
      makeAgent({ address: "claw1addr3_long_enough_to_truncate_test", name: "Bot3" }),
    ]);

    renderAgents();

    await waitFor(() => {
      expect(screen.getByTestId("agent-count-badge")).toHaveTextContent("3 agents");
    });
  });

  // 10. Search filters by name
  it("search filters agents by name", async () => {
    setupAgentsMock([
      makeAgent({ name: "AlphaBot" }),
      makeAgent({ address: "claw1beta_addr_long_enough_to_truncate", name: "BetaBot" }),
    ]);

    renderAgents();

    await waitFor(() => {
      expect(screen.getAllByTestId("agent-card").length).toBe(2);
    });

    const user = userEvent.setup();
    await user.type(screen.getByTestId("agent-search"), "Alpha");

    await waitFor(() => {
      expect(screen.getAllByTestId("agent-card").length).toBe(1);
    });

    expect(screen.getByText("AlphaBot")).toBeInTheDocument();
    expect(screen.queryByText("BetaBot")).not.toBeInTheDocument();
  });

  // 11. Capability badges render
  it("renders capability badges for agents", async () => {
    setupAgentsMock([makeAgent({ supportedTools: ["text-generation", "image-classification", "code-review"] })]);
    renderAgents();

    await waitFor(() => {
      expect(screen.getByText("text-generation")).toBeInTheDocument();
      expect(screen.getByText("image-classification")).toBeInTheDocument();
      expect(screen.getByText("code-review")).toBeInTheDocument();
    });
  });

  // 12. View toggle buttons show correct active state
  it("view toggle buttons show correct active state", async () => {
    setupAgentsMock();
    renderAgents();

    await waitFor(() => {
      expect(screen.getByTestId("view-card")).toBeInTheDocument();
    });

    // Card view should be active by default
    expect(screen.getByTestId("view-card")).toHaveClass("active");
    expect(screen.getByTestId("view-table")).not.toHaveClass("active");
  });
});
