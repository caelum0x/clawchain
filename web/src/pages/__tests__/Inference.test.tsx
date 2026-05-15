import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Inference from "../Inference";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetModels = vi.fn();
const mockGetInferenceJobs = vi.fn();
const mockGetInferenceProviders = vi.fn();
const mockGetInferencePricing = vi.fn();
const mockGetInferenceJob = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getModels: (...args: unknown[]) => mockGetModels(...args),
  getInferenceJobs: (...args: unknown[]) => mockGetInferenceJobs(...args),
  getInferenceProviders: (...args: unknown[]) => mockGetInferenceProviders(...args),
  getInferencePricing: (...args: unknown[]) => mockGetInferencePricing(...args),
  getInferenceJob: (...args: unknown[]) => mockGetInferenceJob(...args),
  buildSubmitInferenceJobMsg: vi.fn(() => ({ typeUrl: "/test", value: {} })),
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

vi.mock("../../lib/inference-stream.ts", () => ({
  useInferenceStream: vi.fn(() => ({
    tokens: "",
    status: "idle",
    txHash: "",
    tokensUsed: 0,
    error: "",
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeModel(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    name: "TestModel",
    description: "A test AI model",
    framework: "pytorch",
    architecture: "transformer",
    owner: "claw1owner",
    accessType: "free",
    rating: 45,
    ratingCount: 9,
    totalDownloads: 42,
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "1",
    modelId: "1",
    requester: "claw1requester_addr_test",
    provider: "claw1provider_addr_test",
    input: "Hello world",
    output: "Hi there!",
    status: "completed",
    maxTokens: 512,
    payment: "100000",
    gasUsed: 50,
    ...overrides,
  };
}

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    address: "claw1provider_addr_test",
    modelIds: [1, 2],
    maxConcurrent: 10,
    activeJobs: 2,
    totalJobs: 100,
    totalEarnings: "50000000",
    avgLatencyMs: 250,
    endpoint: "https://inference.test.io",
    isOnline: true,
    lastHeartbeat: Date.now(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderInference() {
  return render(
    <MemoryRouter>
      <Inference />
    </MemoryRouter>,
  );
}

function setupMocks({
  models = [makeModel()],
  jobs = [makeJob()],
  providers = [makeProvider()],
} = {}) {
  mockGetModels.mockResolvedValue(models);
  mockGetInferenceJobs.mockResolvedValue(jobs);
  mockGetInferenceProviders.mockResolvedValue(providers);
  mockGetInferencePricing.mockResolvedValue(null);
  mockGetInferenceJob.mockResolvedValue(null);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Inference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockGetModels.mockReturnValue(new Promise(() => {}));
    mockGetInferenceJobs.mockReturnValue(new Promise(() => {}));
    mockGetInferenceProviders.mockReturnValue(new Promise(() => {}));

    renderInference();
    expect(screen.getByText("Loading inference data...")).toBeInTheDocument();
  });

  it("renders the page title after data loads", async () => {
    setupMocks();
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("AI Inference")).toBeInTheDocument();
    });
  });

  it("renders stat cards with correct data", async () => {
    setupMocks({
      models: [makeModel(), makeModel({ id: "2", name: "Model2" })],
      jobs: [makeJob(), makeJob({ jobId: "2", status: "pending" })],
      providers: [makeProvider()],
    });
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Models Available")).toBeInTheDocument();
    });

    const statCards = screen.getAllByTestId("stat-card");
    expect(statCards.length).toBe(4);

    expect(screen.getByText("Providers Online")).toBeInTheDocument();
    expect(screen.getByText("Total Jobs")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders three tabs", async () => {
    setupMocks();
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Playground")).toBeInTheDocument();
    });

    expect(screen.getByText("Job History")).toBeInTheDocument();
    expect(screen.getByText("Providers")).toBeInTheDocument();
  });

  it("shows Keplr connect prompt on Playground tab", async () => {
    setupMocks();
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Submit Inference")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/connect your wallet to submit inference jobs/i),
    ).toBeInTheDocument();
  });

  it("renders available models table on Playground tab", async () => {
    setupMocks({
      models: [
        makeModel({ id: "1", name: "AlphaModel", framework: "pytorch" }),
        makeModel({ id: "2", name: "BetaModel", framework: "tensorflow" }),
      ],
    });
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Available Models")).toBeInTheDocument();
    });

    expect(screen.getByText("AlphaModel")).toBeInTheDocument();
    expect(screen.getByText("BetaModel")).toBeInTheDocument();
  });

  it("switches to Job History tab and shows jobs", async () => {
    setupMocks({
      jobs: [
        makeJob({ jobId: "10", status: "completed" }),
        makeJob({ jobId: "11", status: "pending" }),
      ],
    });
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Job History")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Job History"));

    await waitFor(() => {
      expect(screen.getByText(/Inference Jobs/)).toBeInTheDocument();
    });

    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
  });

  it("switches to Providers tab and shows provider data", async () => {
    setupMocks({
      providers: [makeProvider({ address: "claw1prov_test_address_xyz" })],
    });
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Providers")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Providers"));

    await waitFor(() => {
      expect(screen.getByText(/Inference Providers/)).toBeInTheDocument();
    });

    expect(screen.getByText("Become a Provider")).toBeInTheDocument();
  });

  it("shows empty state for jobs when none exist", async () => {
    setupMocks({ jobs: [] });
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Job History")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Job History"));

    await waitFor(() => {
      expect(
        screen.getByText(/No inference jobs yet/),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state for providers when none exist", async () => {
    setupMocks({ providers: [] });
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Providers")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Providers"));

    await waitFor(() => {
      expect(
        screen.getByText(/No inference providers registered/),
      ).toBeInTheDocument();
    });
  });

  it("renders status filter on Job History tab", async () => {
    setupMocks();
    renderInference();

    await waitFor(() => {
      expect(screen.getByText("Job History")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Job History"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("All Statuses")).toBeInTheDocument();
    });
  });
});
