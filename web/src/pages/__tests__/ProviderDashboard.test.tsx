import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProviderDashboard from "../ProviderDashboard";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetComputeResources = vi.fn();
const mockGetComputeJobs = vi.fn();
const mockGetComputeLeases = vi.fn();
const mockGetProviderStats = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getComputeResources: (...args: unknown[]) => mockGetComputeResources(...args),
  getComputeJobs: (...args: unknown[]) => mockGetComputeJobs(...args),
  getComputeLeases: (...args: unknown[]) => mockGetComputeLeases(...args),
  getProviderStats: (...args: unknown[]) => mockGetProviderStats(...args),
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

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
  disconnectWallet: vi.fn(),
}));

vi.mock("../../components/CopyButton.tsx", () => ({
  default: ({ text }: { text: string }) => (
    <button data-testid="copy-button" title={`Copy ${text}`}>Copy</button>
  ),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const PROVIDER_ADDRESS = "claw1provider_addr_long_enough_to_truncate_test";

function makeResource(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    owner: PROVIDER_ADDRESS,
    name: "GPU Server Alpha",
    description: "High-end compute node",
    gpuModel: "NVIDIA A100 80GB",
    gpuCount: 4,
    vramGb: 80,
    cpuCores: 32,
    ramGb: 256,
    storageGb: 2000,
    pricePerHourUclaw: "5000000",
    minLeaseHours: 1,
    maxLeaseHours: 720,
    active: true,
    currentLessee: "",
    leaseExpiresAt: 0,
    region: "US-East",
    endpoint: "https://gpu1.example.com",
    tags: ["ml-training"],
    totalLeases: 15,
    totalRevenue: "50000000",
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "42",
    resourceId: "1",
    leaseId: "10",
    submitter: "claw1submitter_addr_long_enough_to_truncate_test",
    provider: PROVIDER_ADDRESS,
    name: "Training Job",
    jobType: "docker",
    executionType: "docker",
    dockerImage: "nvidia/cuda:12.0",
    scriptContent: "",
    inputDataUri: "",
    outputDataUri: "",
    gpuType: "NVIDIA A100 80GB",
    gpuCount: 1,
    status: "running",
    result: "",
    errorMessage: "",
    submittedAt: Math.floor(Date.now() / 1000) - 3600,
    startedAt: Math.floor(Date.now() / 1000) - 3500,
    completedAt: 0,
    params: "",
    ...overrides,
  };
}

function makeLease(overrides: Record<string, unknown> = {}) {
  return {
    id: "10",
    resourceId: "1",
    lessee: "claw1lessee_addr_long_enough_to_truncate_test000",
    provider: PROVIDER_ADDRESS,
    startBlock: 1000,
    endBlock: 2000,
    totalCostUclaw: "10000000",
    status: "active",
    ...overrides,
  };
}

function makeProviderStats(overrides: Record<string, unknown> = {}) {
  return {
    totalRevenue: "50000000",
    totalJobs: 20,
    completedJobs: 18,
    failedJobs: 2,
    activeLeases: 3,
    avgRating: 450,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// Mock the heartbeat fetch (called internally via fetch)
const mockFetch = vi.fn();

function setupMocks(
  resources = [makeResource()],
  jobs = [makeJob()],
  leases = [makeLease()],
  stats = makeProviderStats(),
) {
  mockGetComputeResources.mockResolvedValue(resources);
  mockGetComputeJobs.mockResolvedValue(jobs);
  mockGetComputeLeases.mockResolvedValue(leases);
  mockGetProviderStats.mockResolvedValue(stats);
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      last_heartbeat: 50000,
      uptime_blocks: 48000,
      is_healthy: true,
    }),
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <ProviderDashboard />
    </MemoryRouter>,
  );
}

async function lookupProvider() {
  const user = userEvent.setup();
  await user.type(
    screen.getByPlaceholderText("Enter your provider claw... address"),
    PROVIDER_ADDRESS,
  );
  await user.click(screen.getByRole("button", { name: "Lookup" }));
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ProviderDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    setupMocks();
  });

  // 1. Renders page title and subtitle
  it("renders page title and subtitle", () => {
    renderDashboard();

    expect(screen.getByText("Provider Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText(/GPU provider operator dashboard/),
    ).toBeInTheDocument();
  });

  // 2. Shows address lookup form
  it("shows address lookup form with input and Lookup button", () => {
    renderDashboard();

    expect(
      screen.getByPlaceholderText("Enter your provider claw... address"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lookup" })).toBeInTheDocument();
  });

  // 3. Shows welcome message when no address entered
  it("shows welcome message when no provider address is entered", () => {
    renderDashboard();

    expect(screen.getByText("GPU Provider Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter your provider address above/),
    ).toBeInTheDocument();
  });

  // 4. Shows loading state during data fetch
  it("shows loading state during data fetch", async () => {
    mockGetComputeResources.mockReturnValue(new Promise(() => {}));
    mockGetComputeJobs.mockReturnValue(new Promise(() => {}));
    mockGetComputeLeases.mockReturnValue(new Promise(() => {}));
    mockGetProviderStats.mockReturnValue(new Promise(() => {}));
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderDashboard();
    await lookupProvider();

    expect(screen.getByText("Loading provider data...")).toBeInTheDocument();
  });

  // 5. Shows status header cards after lookup
  it("shows status header cards after looking up provider", async () => {
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("Health Status")).toBeInTheDocument();
    });

    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Utilization")).toBeInTheDocument();
    expect(screen.getByText("Total Revenue")).toBeInTheDocument();
    expect(screen.getByText("Success Rate")).toBeInTheDocument();
    expect(screen.getByText("Uptime")).toBeInTheDocument();
  });

  // 6. Shows healthy status when heartbeat is healthy
  it("shows healthy status when heartbeat returns healthy", async () => {
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });
  });

  // 7. Resources tab shows resource table
  it("shows resource table on resources tab", async () => {
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("GPU Server Alpha")).toBeInTheDocument();
    });

    expect(screen.getByText("NVIDIA A100 80GB x4")).toBeInTheDocument();
    expect(screen.getByText("80 GB")).toBeInTheDocument();
  });

  // 8. Empty resources shows message
  it("shows empty message when provider has no resources", async () => {
    setupMocks([], [], [], makeProviderStats());
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(
        screen.getByText(/No GPU resources registered for this address/),
      ).toBeInTheDocument();
    });
  });

  // 9. Tab buttons render with correct labels
  it("shows tab buttons with correct labels after lookup", async () => {
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("Resources (1)")).toBeInTheDocument();
    });

    expect(screen.getByText("Earnings")).toBeInTheDocument();
    expect(screen.getByText("Jobs (1)")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  // 10. Switching to Earnings tab
  it("switches to Earnings tab and shows revenue info", async () => {
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("Earnings")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Earnings"));

    await waitFor(() => {
      expect(screen.getByText("Weekly Revenue (Estimated)")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Leases")).toBeInTheDocument();
    expect(screen.getByText("Avg Revenue/Resource")).toBeInTheDocument();
  });

  // 11. Switching to Jobs tab
  it("switches to Jobs tab and shows job table", async () => {
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("Jobs (1)")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Jobs (1)"));

    await waitFor(() => {
      expect(screen.getByText("Running")).toBeInTheDocument();
    });

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Training Job")).toBeInTheDocument();
  });

  // 12. Jobs tab shows empty state when no jobs
  it("shows empty message on jobs tab when no jobs exist", async () => {
    setupMocks([makeResource()], [], [], makeProviderStats({ totalJobs: 0, completedJobs: 0, failedJobs: 0 }));
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("Jobs (0)")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Jobs (0)"));

    await waitFor(() => {
      expect(screen.getByText("No jobs found for this provider.")).toBeInTheDocument();
    });
  });

  // 13. Switching to Settings tab
  it("switches to Settings tab and shows Manage Resources section", async () => {
    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Settings"));

    await waitFor(() => {
      expect(screen.getByText("Manage Resources")).toBeInTheDocument();
    });

    expect(screen.getByText("Provider Info")).toBeInTheDocument();
  });

  // 14. Error state when data fails to load
  it("shows error message when data fails to load", async () => {
    mockGetComputeResources.mockRejectedValue(new Error("Connection refused"));
    mockGetComputeJobs.mockRejectedValue(new Error("Connection refused"));
    mockGetComputeLeases.mockRejectedValue(new Error("Connection refused"));
    mockGetProviderStats.mockRejectedValue(new Error("Connection refused"));
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    renderDashboard();
    await lookupProvider();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load provider data. Is the chain running?"),
      ).toBeInTheDocument();
    });
  });
});
