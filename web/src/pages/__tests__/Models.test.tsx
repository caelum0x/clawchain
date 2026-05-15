import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Models from "../Models";

// Mock chain module
vi.mock("../../lib/chain", () => ({
  getModels: vi.fn().mockResolvedValue([]),
  getModelVersions: vi.fn().mockResolvedValue([]),
  getInferenceJobs: vi.fn().mockResolvedValue([]),
  getInferenceProviders: vi.fn().mockResolvedValue([]),
  formatClaw: vi.fn((v: string) => `${v} CLAW`),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
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

// Helpers
const chainMock = await import("../../lib/chain");

const sampleModels = [
  {
    id: "1",
    owner: "claw1abc123def456ghi789jkl012mno345pqr678stu",
    name: "LlamaChat-7B",
    description: "A 7B parameter chat model",
    framework: "PyTorch",
    architecture: "Transformer",
    parameterCount: "7000000000",
    license: "MIT",
    tags: ["chat", "llm"],
    storageType: "IPFS",
    storageUri: "ipfs://QmTest123",
    checksumSha256: "abc123def456",
    sizeBytes: 14000000000,
    accessType: "free",
    pricePerQueryUclaw: "0",
    priceOneTimeUclaw: "0",
    active: true,
    currentVersion: 2,
    totalDownloads: 150,
    totalRevenue: "0",
    rating: 4,
    ratingCount: 12,
    createdAt: 1000,
    updatedAt: 1100,
  },
  {
    id: "2",
    owner: "claw1xyz789abc123def456ghi012jkl345mno678pqr",
    name: "StableDiffusion-XL",
    description: "An image generation model",
    framework: "TensorFlow",
    architecture: "Diffusion",
    parameterCount: "3500000000",
    license: "Apache-2.0",
    tags: ["image", "diffusion"],
    storageType: "HTTPS",
    storageUri: "https://models.example.com/sdxl.bin",
    checksumSha256: "def456ghi789",
    sizeBytes: 7000000000,
    accessType: "per-query",
    pricePerQueryUclaw: "50000",
    priceOneTimeUclaw: "0",
    active: true,
    currentVersion: 1,
    totalDownloads: 300,
    totalRevenue: "15000000",
    rating: 5,
    ratingCount: 25,
    createdAt: 2000,
    updatedAt: 2100,
  },
  {
    id: "3",
    owner: "claw1owner3addr000000000000000000000000000000",
    name: "ONNX-Classifier",
    description: "Classification model",
    framework: "ONNX",
    architecture: "CNN",
    parameterCount: "50000000",
    license: "MIT",
    tags: ["classification"],
    storageType: "IPFS",
    storageUri: "ipfs://QmClassifier",
    checksumSha256: "ghi789jkl012",
    sizeBytes: 200000000,
    accessType: "one-time",
    pricePerQueryUclaw: "0",
    priceOneTimeUclaw: "10000000",
    active: true,
    currentVersion: 1,
    totalDownloads: 50,
    totalRevenue: "500000000",
    rating: 3,
    ratingCount: 5,
    createdAt: 500,
    updatedAt: 600,
  },
];

function renderModels() {
  return render(
    <MemoryRouter>
      <Models />
    </MemoryRouter>,
  );
}

describe("Models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getInferenceJobs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getInferenceProviders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (chainMock.getModelVersions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("renders search bar and filter chips", async () => {
    renderModels();

    // Search bar
    expect(screen.getByPlaceholderText(/search models/i)).toBeInTheDocument();

    // Filter chips
    expect(screen.getByTestId("filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("filter-free")).toBeInTheDocument();
    expect(screen.getByTestId("filter-per-query")).toBeInTheDocument();
    expect(screen.getByTestId("filter-one-time")).toBeInTheDocument();
    expect(screen.getByTestId("filter-subscription")).toBeInTheDocument();

    // Sort dropdown
    expect(screen.getByLabelText("Sort models")).toBeInTheDocument();
  });

  it("shows model cards when data is loaded", async () => {
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue(sampleModels);

    renderModels();

    await waitFor(() => {
      expect(screen.getByText("LlamaChat-7B")).toBeInTheDocument();
      expect(screen.getByText("StableDiffusion-XL")).toBeInTheDocument();
      expect(screen.getByText("ONNX-Classifier")).toBeInTheDocument();
    });

    // Check framework badges are present
    await waitFor(() => {
      expect(screen.getByText("PyTorch")).toBeInTheDocument();
      expect(screen.getByText("TensorFlow")).toBeInTheDocument();
      expect(screen.getByText("ONNX")).toBeInTheDocument();
    });

    // Check model cards count
    const cards = screen.getAllByTestId("model-card");
    expect(cards).toHaveLength(3);
  });

  it("filter chips filter models by access type", async () => {
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue(sampleModels);

    renderModels();

    await waitFor(() => {
      expect(screen.getAllByTestId("model-card")).toHaveLength(3);
    });

    // Click "Free" filter
    fireEvent.click(screen.getByTestId("filter-free"));

    await waitFor(() => {
      const cards = screen.getAllByTestId("model-card");
      expect(cards).toHaveLength(1);
    });
    expect(screen.getByText("LlamaChat-7B")).toBeInTheDocument();

    // Click "Per-Query" filter
    fireEvent.click(screen.getByTestId("filter-per-query"));

    await waitFor(() => {
      const cards = screen.getAllByTestId("model-card");
      expect(cards).toHaveLength(1);
    });
    expect(screen.getByText("StableDiffusion-XL")).toBeInTheDocument();

    // Click "All" to reset
    fireEvent.click(screen.getByTestId("filter-all"));

    await waitFor(() => {
      expect(screen.getAllByTestId("model-card")).toHaveLength(3);
    });
  });

  it("model detail opens on click", async () => {
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue(sampleModels);
    (chainMock.getModelVersions as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "1",
        modelId: "1",
        version: 1,
        storageUri: "ipfs://v1",
        checksumSha256: "abc",
        sizeBytes: 7000000000,
        changelog: "Initial release",
        createdAt: 900,
      },
      {
        id: "2",
        modelId: "1",
        version: 2,
        storageUri: "ipfs://v2",
        checksumSha256: "def",
        sizeBytes: 7100000000,
        changelog: "Bug fixes",
        createdAt: 1000,
      },
    ]);

    renderModels();

    await waitFor(() => {
      expect(screen.getByText("LlamaChat-7B")).toBeInTheDocument();
    });

    // Cards are sorted by newest first: StableDiffusion-XL (createdAt 2000),
    // LlamaChat-7B (1000), ONNX-Classifier (500). Click second "View Details".
    const viewButtons = screen.getAllByText("View Details");
    fireEvent.click(viewButtons[1]);

    // Detail overlay should appear
    await waitFor(() => {
      expect(screen.getByTestId("model-detail-overlay")).toBeInTheDocument();
    });

    // Check detail content for LlamaChat-7B
    expect(screen.getByText("A 7B parameter chat model")).toBeInTheDocument();
    expect(screen.getByText(/IPFS/)).toBeInTheDocument();

    // Version history should load
    await waitFor(() => {
      expect(screen.getByText("Version History")).toBeInTheDocument();
      expect(screen.getByText(/Initial release/)).toBeInTheDocument();
      expect(screen.getByText(/Bug fixes/)).toBeInTheDocument();
    });

    // Close via X button
    fireEvent.click(screen.getByLabelText("Close detail"));
    await waitFor(() => {
      expect(screen.queryByTestId("model-detail-overlay")).not.toBeInTheDocument();
    });
  });

  it("empty state shows when no models", async () => {
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderModels();

    await waitFor(() => {
      expect(
        screen.getByText(/No models registered yet/i),
      ).toBeInTheDocument();
    });
  });

  it("register form section exists", async () => {
    renderModels();

    await waitFor(() => {
      expect(screen.getByTestId("register-section")).toBeInTheDocument();
    });

    expect(screen.getByText("Register a New Model")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("My AI Model")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/PyTorch, TensorFlow/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Transformer, CNN/)).toBeInTheDocument();
  });

  it("search filters models by name", async () => {
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue(sampleModels);

    renderModels();

    await waitFor(() => {
      expect(screen.getAllByTestId("model-card")).toHaveLength(3);
    });

    const searchInput = screen.getByPlaceholderText(/search models/i);
    await userEvent.type(searchInput, "Llama");

    await waitFor(() => {
      expect(screen.getAllByTestId("model-card")).toHaveLength(1);
      expect(screen.getByText("LlamaChat-7B")).toBeInTheDocument();
    });
  });

  it("search filters by framework", async () => {
    (chainMock.getModels as ReturnType<typeof vi.fn>).mockResolvedValue(sampleModels);

    renderModels();

    await waitFor(() => {
      expect(screen.getAllByTestId("model-card")).toHaveLength(3);
    });

    const searchInput = screen.getByPlaceholderText(/search models/i);
    await userEvent.type(searchInput, "ONNX");

    await waitFor(() => {
      expect(screen.getAllByTestId("model-card")).toHaveLength(1);
      expect(screen.getByText("ONNX-Classifier")).toBeInTheDocument();
    });
  });
});
