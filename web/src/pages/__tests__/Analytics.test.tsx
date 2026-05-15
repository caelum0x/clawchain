import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Analytics from "../Analytics";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetRecentBlocks = vi.fn();
const mockGetValidators = vi.fn();
const mockGetLiveAgents = vi.fn();
const mockGetSkills = vi.fn();
const mockGetComputeJobs = vi.fn();
const mockGetNegotiations = vi.fn();
const mockGetModels = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getRecentBlocks: (...args: unknown[]) => mockGetRecentBlocks(...args),
  getValidators: (...args: unknown[]) => mockGetValidators(...args),
  getLiveAgents: (...args: unknown[]) => mockGetLiveAgents(...args),
  getSkills: (...args: unknown[]) => mockGetSkills(...args),
  getComputeJobs: (...args: unknown[]) => mockGetComputeJobs(...args),
  getNegotiations: (...args: unknown[]) => mockGetNegotiations(...args),
  getModels: (...args: unknown[]) => mockGetModels(...args),
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

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    chainId: "clawchain-test",
    chainName: "ClawChain Test",
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
  },
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const now = Date.now();

function makeBlocks(count: number) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    blocks.push({
      height: String(1000 - i),
      time: new Date(now - i * 5000).toISOString(),
      hash: `HASH${i}`,
      proposer: "proposer1",
      txCount: i % 3 === 0 ? 2 : 0,
    });
  }
  return blocks;
}

function makeValidator(overrides: Record<string, unknown> = {}) {
  return {
    moniker: "ValidatorOne",
    description: { moniker: "ValidatorOne" },
    tokens: "5000000000",
    status: "BOND_STATUS_BONDED",
    operatorAddress: "clawvaloper1abc123def456ghi789jkl012mno345pqr678stu",
    operator_address: "clawvaloper1abc123def456ghi789jkl012mno345pqr678stu",
    ...overrides,
  };
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    address: "claw1agent_addr_01",
    name: "TestAgent",
    active: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderAnalytics() {
  return render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>,
  );
}

function setupMocks({
  blocks = makeBlocks(10),
  validators = [makeValidator()],
  agents = [makeAgent()],
  skills = [{ id: "1", name: "Skill1" }],
  computeJobs = [{ id: "1" }],
} = {}) {
  mockGetRecentBlocks.mockResolvedValue(blocks);
  mockGetValidators.mockResolvedValue(validators);
  mockGetLiveAgents.mockResolvedValue(agents);
  mockGetSkills.mockResolvedValue(skills);
  mockGetComputeJobs.mockResolvedValue(computeJobs);
  mockGetNegotiations.mockResolvedValue([]);
  mockGetModels.mockResolvedValue([]);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockGetRecentBlocks.mockReturnValue(new Promise(() => {}));
    mockGetValidators.mockReturnValue(new Promise(() => {}));
    mockGetLiveAgents.mockReturnValue(new Promise(() => {}));
    mockGetSkills.mockReturnValue(new Promise(() => {}));
    mockGetComputeJobs.mockReturnValue(new Promise(() => {}));
    mockGetNegotiations.mockReturnValue(new Promise(() => {}));
    mockGetModels.mockReturnValue(new Promise(() => {}));

    renderAnalytics();

    expect(screen.getByText("Loading analytics data...")).toBeInTheDocument();
  });

  // 2. Renders page heading after data loads
  it("renders the Analytics heading after data loads", async () => {
    setupMocks();
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });
  });

  // 3. Renders network overview section with stat cards
  it("renders network overview cards", async () => {
    setupMocks();
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("Network Overview")).toBeInTheDocument();
    });

    expect(screen.getByText("Est. Total Transactions")).toBeInTheDocument();
    expect(screen.getByText("Current TPS")).toBeInTheDocument();
    expect(screen.getByText("Active Validators")).toBeInTheDocument();
  });

  // 4. Renders block production section with min/max/avg
  it("renders block production stats", async () => {
    setupMocks();
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("Block Production")).toBeInTheDocument();
    });

    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.getByText("Min")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();
    expect(screen.getByText("With Txs / Empty")).toBeInTheDocument();
  });

  // 5. Renders LineChart for block times
  it("renders LineChart with data points for block times", async () => {
    setupMocks({ blocks: makeBlocks(10) });
    renderAnalytics();

    await waitFor(() => {
      // The LineChart component renders circle elements with data-testid="line-chart-point"
      const points = screen.getAllByTestId("line-chart-point");
      // 10 blocks produce 9 block timings
      expect(points.length).toBe(9);
    });
  });

  // 6. Renders transaction activity section
  it("renders transaction activity section", async () => {
    setupMocks();
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("Transaction Activity")).toBeInTheDocument();
    });

    expect(screen.getByText("Txs in Sample")).toBeInTheDocument();
    expect(screen.getByText("Avg Tx/Block")).toBeInTheDocument();
    expect(screen.getByText("Blocks Sampled")).toBeInTheDocument();
    expect(screen.getByText("Latest Block")).toBeInTheDocument();
  });

  // 7. Renders BarChart for tx count per block
  it("renders BarChart bars for transaction counts", async () => {
    // Create blocks where some have txCount > 0 to produce bars
    const blocks = makeBlocks(5);
    setupMocks({ blocks });
    renderAnalytics();

    await waitFor(() => {
      const bars = screen.getAllByTestId("bar-chart-bar");
      // BarChart shows up to 20 blocks; we have 4 timings from 5 blocks
      expect(bars.length).toBe(4);
    });
  });

  // 8. Renders validator stats section with DonutChart
  it("renders validator stats section with donut chart", async () => {
    setupMocks({
      validators: [
        makeValidator({ moniker: "Val1", tokens: "3000000000" }),
        makeValidator({
          moniker: "Val2",
          tokens: "2000000000",
          operatorAddress: "clawvaloper1xyz",
          operator_address: "clawvaloper1xyz",
        }),
      ],
    });
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("Validator Stats")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Bonded")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();

    // DonutChart renders segments
    const segments = screen.getAllByTestId("donut-segment");
    expect(segments.length).toBe(2);

    // DonutChart renders legend items
    const legendItems = screen.getAllByTestId("donut-legend-item");
    expect(legendItems.length).toBe(2);
  });

  // 9. Renders module activity StatCard components
  it("renders module activity stat cards", async () => {
    setupMocks({ agents: [makeAgent(), makeAgent({ address: "claw1agent2" })], skills: [{ id: "1", name: "S1" }, { id: "2", name: "S2" }, { id: "3", name: "S3" }], computeJobs: [{ id: "1" }] });
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("Module Activity")).toBeInTheDocument();
    });

    // StatCard components with data-testid="stat-card"
    const statCards = screen.getAllByTestId("stat-card");
    expect(statCards.length).toBe(5);

    // Check titles rendered inside StatCards
    expect(screen.getByText("Live Agents")).toBeInTheDocument();
    expect(screen.getByText("Skills Listed")).toBeInTheDocument();
    expect(screen.getByText("Compute Jobs")).toBeInTheDocument();
    expect(screen.getByText("Negotiations")).toBeInTheDocument();
    expect(screen.getByText("AI Models")).toBeInTheDocument();
  });

  // 10. Handles empty blocks gracefully
  it("handles empty blocks gracefully with zero metrics", async () => {
    setupMocks({ blocks: [], validators: [], agents: [], skills: [], computeJobs: [] });
    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText("Analytics")).toBeInTheDocument();
    });

    // With no block timings, avg block time shows 0.00s
    const avgTimeCards = screen.getAllByText("0.00s");
    expect(avgTimeCards.length).toBeGreaterThanOrEqual(1);
  });
});
