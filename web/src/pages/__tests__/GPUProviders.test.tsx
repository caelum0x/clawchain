import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GPUProviders from "../GPUProviders";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetComputeResources = vi.fn();
const mockGetComputeJobs = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getComputeResources: (...args: unknown[]) => mockGetComputeResources(...args),
  getComputeJobs: (...args: unknown[]) => mockGetComputeJobs(...args),
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

function makeResource(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    owner: "claw1provider_address_long_enough_truncate",
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
    id: "1",
    resourceId: "1",
    leaseId: "10",
    submitter: "claw1submitter_address_long_enough_truncate",
    provider: "claw1provider_address_long_enough_truncate",
    name: "Training Job",
    jobType: "docker",
    executionType: "docker",
    dockerImage: "nvidia/cuda:12.0",
    scriptContent: "",
    inputDataUri: "",
    outputDataUri: "",
    gpuType: "NVIDIA A100 80GB",
    gpuCount: 1,
    status: "completed",
    result: "",
    errorMessage: "",
    submittedAt: Math.floor(Date.now() / 1000) - 3600,
    startedAt: Math.floor(Date.now() / 1000) - 3500,
    completedAt: Math.floor(Date.now() / 1000) - 100,
    params: "",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setupMocks(resources = [makeResource()], jobs = [makeJob()]) {
  mockGetComputeResources.mockResolvedValue(resources);
  mockGetComputeJobs.mockResolvedValue(jobs);
}

function renderGPUProviders() {
  return render(
    <MemoryRouter>
      <GPUProviders />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("GPUProviders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockGetComputeResources.mockReturnValue(new Promise(() => {}));
    mockGetComputeJobs.mockReturnValue(new Promise(() => {}));

    renderGPUProviders();

    expect(screen.getByText("Loading GPU provider data...")).toBeInTheDocument();
  });

  // 2. Renders page title and subtitle
  it("renders page title and subtitle", async () => {
    setupMocks();
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByText("GPU Providers")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Browse GPU compute providers, hardware models, and performance metrics/),
    ).toBeInTheDocument();
  });

  // 3. Shows summary stat cards after loading
  it("renders summary stat cards after loading", async () => {
    setupMocks();
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByText("Total Providers")).toBeInTheDocument();
    });

    expect(screen.getByText("Total VRAM")).toBeInTheDocument();
    expect(screen.getByText("Total Leases")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
  });

  // 4. Renders three tab buttons
  it("renders three tab buttons", async () => {
    setupMocks();
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("tab-providers")).toBeInTheDocument();
    });

    expect(screen.getByTestId("tab-models")).toBeInTheDocument();
    expect(screen.getByTestId("tab-performance")).toBeInTheDocument();
  });

  // 5. Default tab shows providers table with provider rows
  it("shows providers table by default with provider rows", async () => {
    setupMocks([
      makeResource({ id: "1", owner: "claw1owner_a_long_enough_to_truncate_test" }),
      makeResource({ id: "2", owner: "claw1owner_b_long_enough_to_truncate_test" }),
    ]);
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("providers-tab")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("provider-row");
    expect(rows.length).toBe(2);
  });

  // 6. Provider table has correct column headers
  it("shows correct column headers on providers tab", async () => {
    setupMocks();
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("providers-tab")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Provider/).length).toBeGreaterThanOrEqual(1);
    // "GPU Model" appears in the <th> header and in the filter dropdown option "All GPU Models"
    expect(screen.getAllByText(/GPU Model/).length).toBeGreaterThanOrEqual(1);
    // "VRAM" appears in the summary card "Total VRAM" and in the <th> header
    expect(screen.getAllByText(/VRAM/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Status/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Rate\/hr/)).toBeInTheDocument();
    // "Leases" appears in the summary card "Total Leases" and in the <th> header
    expect(screen.getAllByText(/Leases/).length).toBeGreaterThanOrEqual(1);
  });

  // 7. Switching to GPU Models tab
  it("switches to GPU Models tab and shows model rows", async () => {
    setupMocks([
      makeResource({ id: "1", gpuModel: "NVIDIA A100 80GB" }),
      makeResource({ id: "2", owner: "claw1other_owner_long_enough_to_truncate", gpuModel: "NVIDIA H100" }),
    ]);
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("tab-models")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-models"));

    expect(screen.getByTestId("models-tab")).toBeInTheDocument();
    const rows = screen.getAllByTestId("model-row");
    expect(rows.length).toBe(2);
  });

  // 8. Switching to Performance tab
  it("switches to Performance tab and shows performance rows", async () => {
    setupMocks();
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("tab-performance")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-performance"));

    expect(screen.getByTestId("performance-tab")).toBeInTheDocument();
    const rows = screen.getAllByTestId("performance-row");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  // 9. Shows error when data fails to load
  it("shows error message when data fails to load", async () => {
    mockGetComputeResources.mockRejectedValue(new Error("Connection refused"));
    mockGetComputeJobs.mockRejectedValue(new Error("Connection refused"));

    renderGPUProviders();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load GPU provider data. Is the chain running?"),
      ).toBeInTheDocument();
    });
  });

  // 10. Empty state when no providers
  it("shows empty providers table when no resources exist", async () => {
    setupMocks([], []);
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("providers-tab")).toBeInTheDocument();
    });

    expect(
      screen.getByText("No GPU providers registered on chain yet."),
    ).toBeInTheDocument();
  });

  // 11. Search filter works on providers tab
  it("filters providers by search input", async () => {
    setupMocks([
      makeResource({ id: "1", owner: "claw1owner_a_long_enough_to_truncate_test", gpuModel: "NVIDIA A100 80GB" }),
      makeResource({ id: "2", owner: "claw1owner_b_long_enough_to_truncate_test", gpuModel: "NVIDIA H100" }),
    ]);
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("providers-tab")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.type(screen.getByTestId("search-input"), "H100");

    const rows = screen.getAllByTestId("provider-row");
    expect(rows.length).toBe(1);
  });

  // 12. Status filter shows on providers tab
  it("shows status filter on providers tab", async () => {
    setupMocks();
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByTestId("status-filter")).toBeInTheDocument();
    });
  });

  // 13. VRAM is shown correctly in summary
  it("shows total VRAM in summary cards", async () => {
    setupMocks([
      makeResource({ id: "1", vramGb: 80 }),
      makeResource({ id: "2", owner: "claw1other_owner_long_enough_to_truncate", vramGb: 24 }),
    ]);
    renderGPUProviders();

    await waitFor(() => {
      expect(screen.getByText("104 GB")).toBeInTheDocument();
    });
  });
});
