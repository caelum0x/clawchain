import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GPUCompute from "../GPUCompute";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetComputeResources = vi.fn();
const mockGetComputeLeases = vi.fn();
const mockGetComputeJobs = vi.fn();
const mockGetLatestBlock = vi.fn();
const mockBuildLeaseMsg = vi.fn();
const mockBuildSubmitJobMsg = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getComputeResources: (...args: unknown[]) => mockGetComputeResources(...args),
  getComputeLeases: (...args: unknown[]) => mockGetComputeLeases(...args),
  getComputeJobs: (...args: unknown[]) => mockGetComputeJobs(...args),
  getLatestBlock: (...args: unknown[]) => mockGetLatestBlock(...args),
  buildLeaseComputeResourceMsg: (...args: unknown[]) => mockBuildLeaseMsg(...args),
  buildSubmitComputeJobMsg: (...args: unknown[]) => mockBuildSubmitJobMsg(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => true),
  connectKeplr: vi.fn().mockResolvedValue({ connected: true, address: "claw1testwalletaddress1234567890abcdef" }),
  signAndBroadcast: vi.fn().mockResolvedValue({ code: 0, txHash: "ABCDEF1234567890" }),
}));

vi.mock("../../components/LiveGPUStatus.tsx", () => ({
  default: () => <div data-testid="live-gpu-status">LiveGPUStatus</div>,
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
    tags: ["ml-training", "inference"],
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
    lessee: "claw1lessee_address_long_enough_to_truncate",
    provider: "claw1provider_address_long_enough_truncate",
    startBlock: 1000,
    endBlock: 2000,
    totalCostUclaw: "10000000",
    status: "active",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setupMocks(
  resources = [makeResource()],
  jobs = [makeJob()],
  leases = [makeLease()],
) {
  mockGetComputeResources.mockResolvedValue(resources);
  mockGetComputeJobs.mockResolvedValue(jobs);
  mockGetComputeLeases.mockResolvedValue(leases);
  mockGetLatestBlock.mockResolvedValue({ height: "1500", time: "", hash: "", proposer: "", txCount: 0 });
}

function renderGPU() {
  return render(
    <MemoryRouter>
      <GPUCompute />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("GPUCompute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Renders resource cards with key info
  it("renders resource cards with GPU name, specs, and status", async () => {
    setupMocks();
    renderGPU();

    await waitFor(() => {
      const cards = screen.getAllByTestId("resource-card");
      expect(cards.length).toBe(1);
    });

    expect(screen.getByText("NVIDIA A100 80GB")).toBeInTheDocument();
    expect(screen.getByText("GPU Server Alpha")).toBeInTheDocument();
    expect(screen.getByText("80 GB")).toBeInTheDocument(); // VRAM
    expect(screen.getByTestId("resource-status")).toHaveTextContent("Available");
    expect(screen.getByTestId("rent-button")).toBeInTheDocument();
  });

  // 2. Wizard step 1 shows available resources
  it("wizard step 1 shows available resources for selection", async () => {
    setupMocks([
      makeResource({ id: "1", name: "Server A" }),
      makeResource({ id: "2", name: "Server B", currentLessee: "claw1someone_address_occupying_resource" }),
    ]);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-submit")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-submit"));

    // Connect wallet first
    const { connectKeplr } = await import("../../lib/wallet.ts");
    await user.click(screen.getByText("Connect Keplr"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard-step1")).toBeInTheDocument();
    });

    // Only the available resource (Server A) should appear in wizard
    const wizardCards = screen.getAllByTestId("wizard-resource-card");
    expect(wizardCards.length).toBe(1);
    expect(screen.getByText("Server A")).toBeInTheDocument();
  });

  // 3. Wizard step navigation works (next/back)
  it("navigates wizard steps with next and back buttons", async () => {
    setupMocks();
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-submit")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-submit"));
    await user.click(screen.getByText("Connect Keplr"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard-step1")).toBeInTheDocument();
    });

    // Select the resource
    await user.click(screen.getByTestId("wizard-resource-card"));

    // Click next
    await user.click(screen.getByTestId("wizard-next"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard-step2")).toBeInTheDocument();
    });

    // Fill required fields
    await user.type(screen.getByTestId("input-docker-image"), "nvidia/cuda:12.0");
    await user.clear(screen.getByTestId("input-budget"));
    await user.type(screen.getByTestId("input-budget"), "50");

    // Click next to review
    await user.click(screen.getByTestId("wizard-next"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard-step3")).toBeInTheDocument();
    });

    // Go back
    await user.click(screen.getByTestId("wizard-back"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard-step2")).toBeInTheDocument();
    });
  });

  // 4. Job cards show status badges
  it("renders job cards with correct status badges", async () => {
    setupMocks(
      [makeResource()],
      [
        makeJob({ id: "1", status: "pending" }),
        makeJob({ id: "2", status: "running" }),
        makeJob({ id: "3", status: "completed" }),
        makeJob({ id: "4", status: "failed" }),
      ],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-jobs")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-jobs"));

    await waitFor(() => {
      const cards = screen.getAllByTestId("job-card");
      expect(cards.length).toBe(4);
    });

    const badges = screen.getAllByTestId("job-status-badge");
    expect(badges.length).toBe(4);

    // Check the status classes
    expect(badges[0]).toHaveClass("pending");
    expect(badges[1]).toHaveClass("running");
    expect(badges[2]).toHaveClass("completed");
    expect(badges[3]).toHaveClass("failed");
  });

  // 5. Wizard submit produces confirmation
  it("shows confirmation after wizard submission", async () => {
    setupMocks();
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-submit")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-submit"));
    await user.click(screen.getByText("Connect Keplr"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard-step1")).toBeInTheDocument();
    });

    // Step 1: select resource
    await user.click(screen.getByTestId("wizard-resource-card"));
    await user.click(screen.getByTestId("wizard-next"));

    // Step 2: fill form
    await waitFor(() => {
      expect(screen.getByTestId("wizard-step2")).toBeInTheDocument();
    });
    await user.type(screen.getByTestId("input-docker-image"), "nvidia/cuda:12.0");
    await user.clear(screen.getByTestId("input-budget"));
    await user.type(screen.getByTestId("input-budget"), "100");
    await user.click(screen.getByTestId("wizard-next"));

    // Step 3: review and submit
    await waitFor(() => {
      expect(screen.getByTestId("wizard-step3")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("wizard-submit"));

    // Step 4: confirmation
    await waitFor(() => {
      expect(screen.getByTestId("wizard-step4")).toBeInTheDocument();
    });

    expect(screen.getByTestId("confirmation-job-id")).toBeInTheDocument();
    expect(screen.getByText("Job Submitted Successfully")).toBeInTheDocument();
    expect(screen.getByTestId("track-job-link")).toBeInTheDocument();
    expect(screen.getByTestId("submit-another")).toBeInTheDocument();
  });

  // 6. Empty states for no resources/jobs
  it("shows empty state when there are no resources", async () => {
    setupMocks([], [], []);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("empty-resources")).toBeInTheDocument();
    });

    expect(screen.getByText(/No GPU compute resources listed yet/)).toBeInTheDocument();
  });

  it("shows empty state when there are no jobs", async () => {
    setupMocks([makeResource()], [], []);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-jobs")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-jobs"));

    await waitFor(() => {
      expect(screen.getByTestId("empty-jobs")).toBeInTheDocument();
    });

    expect(screen.getByText(/No compute jobs found/)).toBeInTheDocument();
  });

  it("shows empty state when there are no leases", async () => {
    setupMocks([makeResource()], [], []);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-leases")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-leases"));

    await waitFor(() => {
      expect(screen.getByTestId("empty-leases")).toBeInTheDocument();
    });

    expect(screen.getByText(/No active leases/)).toBeInTheDocument();
  });

  // 7. Loading state
  it("shows loading state initially", () => {
    mockGetComputeResources.mockReturnValue(new Promise(() => {}));
    mockGetComputeLeases.mockReturnValue(new Promise(() => {}));
    mockGetComputeJobs.mockReturnValue(new Promise(() => {}));
    mockGetLatestBlock.mockReturnValue(new Promise(() => {}));

    renderGPU();

    expect(screen.getByTestId("loading")).toBeInTheDocument();
    expect(screen.getByText("Loading GPU compute data...")).toBeInTheDocument();
  });

  // 8. Resource card shows busy status when leased
  it("shows busy status when resource has a current lessee", async () => {
    setupMocks([
      makeResource({ currentLessee: "claw1someone_address_occupying_resource" }),
    ]);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("resource-status")).toHaveTextContent("Busy");
    });

    // Should NOT show Rent button for busy resources
    expect(screen.queryByTestId("rent-button")).not.toBeInTheDocument();
  });

  // 9. Job detail expands on View Details click
  it("expands job details when View Details is clicked", async () => {
    setupMocks([makeResource()], [makeJob()]);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-jobs")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-jobs"));

    await waitFor(() => {
      expect(screen.getByTestId("view-details-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("view-details-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("job-detail")).toBeInTheDocument();
    });
  });

  // 10. Wizard step indicators show active state
  it("wizard step indicators mark current step as active", async () => {
    setupMocks();
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-submit")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-submit"));
    await user.click(screen.getByText("Connect Keplr"));

    await waitFor(() => {
      expect(screen.getByTestId("wizard-step-1")).toHaveClass("active");
    });

    expect(screen.getByTestId("wizard-step-2")).not.toHaveClass("active");
    expect(screen.getByTestId("wizard-step-3")).not.toHaveClass("active");
    expect(screen.getByTestId("wizard-step-4")).not.toHaveClass("active");
  });

  // 11. Leases tab shows active leases with remaining blocks
  it("shows lease cards with remaining block count", async () => {
    setupMocks([makeResource()], [], [makeLease({ id: "10", startBlock: 1000, endBlock: 2000, status: "active" })]);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-leases")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-leases"));

    await waitFor(() => {
      expect(screen.getByTestId("lease-card")).toBeInTheDocument();
    });

    // currentHeight is 1500, endBlock is 2000, so remaining = 500
    expect(screen.getByText("500 blocks")).toBeInTheDocument();
    expect(screen.getByTestId("renew-lease-btn")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-lease-btn")).toBeInTheDocument();
  });

  // 12. Multiple resources render in grid
  it("renders multiple resource cards in a grid", async () => {
    setupMocks([
      makeResource({ id: "1", gpuModel: "NVIDIA A100 80GB", name: "Server Alpha" }),
      makeResource({ id: "2", gpuModel: "NVIDIA H100 80GB", name: "Server Beta" }),
      makeResource({ id: "3", gpuModel: "NVIDIA RTX 4090", name: "Server Gamma" }),
    ]);
    renderGPU();

    await waitFor(() => {
      const cards = screen.getAllByTestId("resource-card");
      expect(cards.length).toBe(3);
    });

    expect(screen.getByText("NVIDIA A100 80GB")).toBeInTheDocument();
    expect(screen.getByText("NVIDIA H100 80GB")).toBeInTheDocument();
    expect(screen.getByText("NVIDIA RTX 4090")).toBeInTheDocument();
    expect(screen.getByTestId("resource-grid")).toHaveClass("gpu-grid");
  });

  /* ------------------------------------------------------------------ */
  /* Job Monitor Tab Tests                                               */
  /* ------------------------------------------------------------------ */

  // 13. Job Monitor tab renders with job selection buttons
  it("renders Job Monitor tab with job selection buttons", async () => {
    setupMocks(
      [makeResource()],
      [
        makeJob({ id: "1", status: "running" }),
        makeJob({ id: "2", status: "completed", completedAt: Math.floor(Date.now() / 1000) }),
      ],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));

    await waitFor(() => {
      expect(screen.getByTestId("monitor-tab")).toBeInTheDocument();
    });

    const selectBtns = screen.getAllByTestId("monitor-job-select");
    expect(selectBtns.length).toBe(2);
    expect(selectBtns[0]).toHaveTextContent("Job #1 (running)");
    expect(selectBtns[1]).toHaveTextContent("Job #2 (completed)");
  });

  // 14. Job Monitor shows empty state when no jobs
  it("shows empty monitor state when no jobs exist", async () => {
    setupMocks([makeResource()], [], []);
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));

    await waitFor(() => {
      expect(screen.getByTestId("monitor-empty")).toBeInTheDocument();
    });

    expect(screen.getByText("No jobs available to monitor.")).toBeInTheDocument();
  });

  // 15. Selecting a job shows the monitor detail panels
  it("displays status timeline, utilization, cost breakdown, and logs toggle when a job is selected", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({ id: "10", status: "running" })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));

    await waitFor(() => {
      expect(screen.getByTestId("monitor-tab")).toBeInTheDocument();
    });

    // Select the job
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("monitor-detail")).toBeInTheDocument();
    });

    // All four sections should be present
    expect(screen.getByTestId("status-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("resource-utilization")).toBeInTheDocument();
    expect(screen.getByTestId("cost-breakdown")).toBeInTheDocument();
    expect(screen.getByTestId("logs-toggle")).toBeInTheDocument();
  });

  // 16. Status timeline shows correct step states for a running job
  it("shows timeline with submitted=done, running=active, completed=pending for running job", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({ id: "5", status: "running" })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("status-timeline")).toBeInTheDocument();
    });

    // Check timeline steps exist
    expect(screen.getByTestId("timeline-step-submitted")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-step-running")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-step-completed")).toBeInTheDocument();

    // Submitted step should show checkmark (done)
    expect(screen.getByTestId("timeline-step-submitted")).toHaveTextContent("\u2713");
  });

  // 17. Status timeline shows failed state correctly
  it("shows timeline with failed indicator for failed job", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({
        id: "7",
        status: "failed",
        errorMessage: "CUDA out of memory",
        startedAt: Math.floor(Date.now() / 1000) - 600,
      })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("status-timeline")).toBeInTheDocument();
    });

    // The completed step should show "Failed" label
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  // 18. Resource utilization shows values for running job
  it("shows GPU and memory utilization for a running job", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({ id: "8", status: "running", gpuType: "NVIDIA A100 80GB" })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("resource-utilization")).toBeInTheDocument();
    });

    // GPU and memory utilization values should contain a percentage
    expect(screen.getByTestId("gpu-util-value")).toHaveTextContent(/%/);
    expect(screen.getByTestId("memory-util-value")).toHaveTextContent(/%/);

    // Utilization bars should exist
    expect(screen.getByTestId("gpu-util-bar")).toBeInTheDocument();
    expect(screen.getByTestId("memory-util-bar")).toBeInTheDocument();
  });

  // 19. Resource utilization shows "Waiting..." for pending job
  it("shows waiting state for utilization of a pending job", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({ id: "9", status: "pending", startedAt: 0 })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("resource-utilization")).toBeInTheDocument();
    });

    expect(screen.getByTestId("gpu-util-value")).toHaveTextContent("Waiting...");
    expect(screen.getByTestId("memory-util-value")).toHaveTextContent("Waiting...");
  });

  // 20. Cost breakdown shows three cost components
  it("shows compute cost, network fee, and total cost", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({ id: "11", status: "running" })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("cost-breakdown")).toBeInTheDocument();
    });

    expect(screen.getByTestId("cost-compute")).toBeInTheDocument();
    expect(screen.getByTestId("cost-network")).toBeInTheDocument();
    expect(screen.getByTestId("cost-total")).toBeInTheDocument();

    // All cost cells should contain "CLAW"
    expect(screen.getByTestId("cost-compute")).toHaveTextContent("CLAW");
    expect(screen.getByTestId("cost-network")).toHaveTextContent("CLAW");
    expect(screen.getByTestId("cost-total")).toHaveTextContent("CLAW");

    // Running jobs show accumulation message
    expect(screen.getByText(/Cost is accumulating/)).toBeInTheDocument();
  });

  // 21. Logs viewer expands and collapses
  it("toggles logs viewer expanded/collapsed", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({ id: "12", status: "running" })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("logs-toggle")).toBeInTheDocument();
    });

    // Initially collapsed
    expect(screen.queryByTestId("logs-content")).not.toBeInTheDocument();

    // Expand logs
    await user.click(screen.getByTestId("logs-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("logs-content")).toBeInTheDocument();
    });

    // Should contain JSON log output
    expect(screen.getByTestId("logs-content")).toHaveTextContent("running");
    expect(screen.getByTestId("logs-content")).toHaveTextContent("Initializing GPU context");

    // Collapse logs
    await user.click(screen.getByTestId("logs-toggle"));

    await waitFor(() => {
      expect(screen.queryByTestId("logs-content")).not.toBeInTheDocument();
    });
  });

  // 22. Logs viewer shows error info for failed jobs
  it("shows error output in logs for a failed job", async () => {
    setupMocks(
      [makeResource()],
      [makeJob({
        id: "13",
        status: "failed",
        errorMessage: "CUDA out of memory",
        startedAt: Math.floor(Date.now() / 1000) - 300,
      })],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));
    await user.click(screen.getByTestId("monitor-job-select"));

    await waitFor(() => {
      expect(screen.getByTestId("logs-toggle")).toBeInTheDocument();
    });

    // Expand logs
    await user.click(screen.getByTestId("logs-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("logs-content")).toBeInTheDocument();
    });

    expect(screen.getByTestId("logs-content")).toHaveTextContent("CUDA out of memory");
    expect(screen.getByTestId("logs-content")).toHaveTextContent("failed");
  });

  // 23. Monitor tab shows running job count in tab label
  it("shows running/pending job count in monitor tab label", async () => {
    setupMocks(
      [makeResource()],
      [
        makeJob({ id: "1", status: "running" }),
        makeJob({ id: "2", status: "pending" }),
        makeJob({ id: "3", status: "completed", completedAt: Math.floor(Date.now() / 1000) }),
      ],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    // 2 running/pending jobs should be shown in the tab label
    expect(screen.getByTestId("tab-monitor")).toHaveTextContent("Job Monitor (2)");
  });

  // 24. Switching between monitored jobs updates the detail panels
  it("updates monitor detail when switching between jobs", async () => {
    setupMocks(
      [makeResource()],
      [
        makeJob({ id: "20", status: "running", gpuType: "NVIDIA A100 80GB" }),
        makeJob({ id: "21", status: "completed", completedAt: Math.floor(Date.now() / 1000), gpuType: "NVIDIA H100" }),
      ],
    );
    renderGPU();

    await waitFor(() => {
      expect(screen.getByTestId("tab-monitor")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-monitor"));

    const selectBtns = await waitFor(() => {
      const btns = screen.getAllByTestId("monitor-job-select");
      expect(btns.length).toBe(2);
      return btns;
    });

    // Select first job (running)
    await user.click(selectBtns[0]);

    await waitFor(() => {
      expect(screen.getByTestId("monitor-detail")).toBeInTheDocument();
    });

    // GPU util for running job should show a percentage
    expect(screen.getByTestId("gpu-util-value")).toHaveTextContent(/%/);

    // Select second job (completed)
    await user.click(selectBtns[1]);

    await waitFor(() => {
      // Completed job shows 0% utilization
      expect(screen.getByTestId("gpu-util-value")).toHaveTextContent("0%");
    });
  });
});
