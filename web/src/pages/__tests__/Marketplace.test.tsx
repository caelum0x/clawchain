import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Marketplace from "../Marketplace";

// Mock chain module
vi.mock("../../lib/chain", () => ({
  getSkills: vi.fn().mockResolvedValue([]),
  getLiveAgents: vi.fn().mockResolvedValue([]),
  getTopAgents: vi.fn().mockResolvedValue([]),
  getTreeStats: vi.fn().mockResolvedValue(null),
  getAgentRewards: vi.fn().mockResolvedValue([]),
  getRewardLeaderboard: vi.fn().mockResolvedValue([]),
  getComputeResources: vi.fn().mockResolvedValue([]),
  getComputeLeases: vi.fn().mockResolvedValue([]),
  getModels: vi.fn().mockResolvedValue([]),
  getInferenceJobs: vi.fn().mockResolvedValue([]),
  getInferenceProviders: vi.fn().mockResolvedValue([]),
  getInferenceJob: vi.fn().mockResolvedValue(null),
  buildSubmitInferenceJobMsg: vi.fn(),
  buildLeaseComputeResourceMsg: vi.fn(),
  formatClaw: vi.fn((v: string) => `${v} CLAW`),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

vi.mock("../../lib/wallet", () => ({
  isKeplrAvailable: vi.fn().mockReturnValue(false),
  connectKeplr: vi.fn().mockResolvedValue({ connected: false, address: "", balance: "0" }),
  signAndBroadcast: vi.fn(),
  WalletState: {},
}));

vi.mock("../../lib/inference-stream", () => ({
  useInferenceStream: vi.fn().mockReturnValue({
    status: "idle",
    tokens: "",
    tokensUsed: 0,
    txHash: "",
    error: "",
    start: vi.fn(),
  }),
}));

vi.mock("../../components/LiveGPUStatus", () => ({
  default: () => <div data-testid="live-gpu-status">GPU Status</div>,
}));

vi.mock("../../lib/config", () => ({
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
    faucetEndpoint: "http://localhost:8888",
    walletUrl: "http://localhost:3001",
  },
}));

const chainMock = await import("../../lib/chain");

const sampleSkills = [
  {
    id: "3",
    name: "GPT Fine-Tuning Service",
    description: "Fine-tune LLM models on custom datasets using distributed GPU compute",
    owner: "claw1seller1addr00000000000000000000000000000",
    price: "5000000",
    denom: "uclaw",
    purchaseCount: "25",
  },
  {
    id: "2",
    name: "Data Pipeline Builder",
    description: "Build and deploy ETL data pipelines with automatic scaling",
    owner: "claw1seller2addr00000000000000000000000000000",
    price: "3000000",
    denom: "uclaw",
    purchaseCount: "8",
  },
  {
    id: "1",
    name: "Logo Design Generator",
    description: "Generate creative logo designs and render artwork for brands",
    owner: "claw1seller3addr00000000000000000000000000000",
    price: "1000000",
    denom: "uclaw",
    purchaseCount: "55",
  },
];

function renderMarketplace() {
  return render(
    <MemoryRouter>
      <Marketplace />
    </MemoryRouter>,
  );
}

describe("Marketplace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chainMock.getSkills as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getLiveAgents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getTopAgents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getTreeStats as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (chainMock.getRewardLeaderboard as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getComputeResources as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getComputeLeases as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getInferenceJobs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getInferenceProviders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("renders search bar and category filter chips", async () => {
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByTestId("skill-search")).toBeInTheDocument();
    });

    // Category filter chips
    expect(screen.getByTestId("category-all")).toBeInTheDocument();
    expect(screen.getByTestId("category-ai-ml")).toBeInTheDocument();
    expect(screen.getByTestId("category-data")).toBeInTheDocument();
    expect(screen.getByTestId("category-development")).toBeInTheDocument();
    expect(screen.getByTestId("category-creative")).toBeInTheDocument();
    expect(screen.getByTestId("category-finance")).toBeInTheDocument();
    expect(screen.getByTestId("category-other")).toBeInTheDocument();

    // Sort dropdown
    expect(screen.getByTestId("skill-sort")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort skills")).toBeInTheDocument();
  });

  it("shows skill cards when data is loaded", async () => {
    (chainMock.getSkills as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSkills);

    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("GPT Fine-Tuning Service")).toBeInTheDocument();
      expect(screen.getByText("Data Pipeline Builder")).toBeInTheDocument();
      expect(screen.getByText("Logo Design Generator")).toBeInTheDocument();
    });

    // Check skill cards count
    const cards = screen.getAllByTestId("skill-card");
    expect(cards).toHaveLength(3);

    // Check category badges exist (may appear in filter chips too, so use getAllByText)
    expect(screen.getAllByText("AI/ML").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Data").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Creative").length).toBeGreaterThanOrEqual(2);

    // Check purchase count is shown
    expect(screen.getByText("(25 purchases)")).toBeInTheDocument();
    expect(screen.getByText("(55 purchases)")).toBeInTheDocument();
  });

  it("category filter filters skills", async () => {
    (chainMock.getSkills as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSkills);

    renderMarketplace();

    await waitFor(() => {
      expect(screen.getAllByTestId("skill-card")).toHaveLength(3);
    });

    // Click "AI/ML" filter
    fireEvent.click(screen.getByTestId("category-ai-ml"));

    await waitFor(() => {
      const cards = screen.getAllByTestId("skill-card");
      expect(cards).toHaveLength(1);
    });
    expect(screen.getByText("GPT Fine-Tuning Service")).toBeInTheDocument();

    // Click "Data" filter
    fireEvent.click(screen.getByTestId("category-data"));

    await waitFor(() => {
      const cards = screen.getAllByTestId("skill-card");
      expect(cards).toHaveLength(1);
    });
    expect(screen.getByText("Data Pipeline Builder")).toBeInTheDocument();

    // Click "All" to reset
    fireEvent.click(screen.getByTestId("category-all"));

    await waitFor(() => {
      expect(screen.getAllByTestId("skill-card")).toHaveLength(3);
    });
  });

  it("skill detail opens on click", async () => {
    (chainMock.getSkills as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSkills);

    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("GPT Fine-Tuning Service")).toBeInTheDocument();
    });

    // Click "View Details" on first card
    const viewButtons = screen.getAllByText("View Details");
    fireEvent.click(viewButtons[0]);

    // Detail overlay should appear
    await waitFor(() => {
      expect(screen.getByTestId("skill-detail-overlay")).toBeInTheDocument();
    });

    // Check detail content (description appears in both card and modal)
    const descriptions = screen.getAllByText("Fine-tune LLM models on custom datasets using distributed GPU compute");
    expect(descriptions.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Purchase Skill (connect wallet)")).toBeInTheDocument();

    // Close via X button
    fireEvent.click(screen.getByLabelText("Close detail"));
    await waitFor(() => {
      expect(screen.queryByTestId("skill-detail-overlay")).not.toBeInTheDocument();
    });
  });

  it("create listing form has preview", async () => {
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText(/Skills \(/)).toBeInTheDocument();
    });

    // Switch to Create Listing tab
    fireEvent.click(screen.getByText("Create Listing"));

    await waitFor(() => {
      expect(screen.getByTestId("create-listing-section")).toBeInTheDocument();
    });

    expect(screen.getByText("Create a New Skill Listing")).toBeInTheDocument();
    expect(screen.getByTestId("create-name")).toBeInTheDocument();
    expect(screen.getByTestId("create-description")).toBeInTheDocument();
    expect(screen.getByTestId("create-category")).toBeInTheDocument();
    expect(screen.getByTestId("create-price")).toBeInTheDocument();

    // Type a name to trigger preview
    await userEvent.type(screen.getByTestId("create-name"), "My Test Skill");

    await waitFor(() => {
      expect(screen.getByTestId("create-preview")).toBeInTheDocument();
    });

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("My Test Skill")).toBeInTheDocument();
  });

  it("empty state message when no skills", async () => {
    (chainMock.getSkills as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByTestId("skills-empty")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/No skills listed yet/),
    ).toBeInTheDocument();
  });

  it("search filters skills by name", async () => {
    (chainMock.getSkills as ReturnType<typeof vi.fn>).mockResolvedValue(sampleSkills);

    renderMarketplace();

    await waitFor(() => {
      expect(screen.getAllByTestId("skill-card")).toHaveLength(3);
    });

    const searchInput = screen.getByTestId("skill-search");
    await userEvent.type(searchInput, "Logo");

    await waitFor(() => {
      expect(screen.getAllByTestId("skill-card")).toHaveLength(1);
      expect(screen.getByText("Logo Design Generator")).toBeInTheDocument();
    });
  });
});
