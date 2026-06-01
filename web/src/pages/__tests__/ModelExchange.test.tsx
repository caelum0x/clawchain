import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ModelExchange from "../ModelExchange";
import type { ModelToken } from "../../lib/model-tokens";

vi.mock("../../lib/model-tokens", async () => {
  const actual = await vi.importActual<typeof import("../../lib/model-tokens")>(
    "../../lib/model-tokens",
  );
  return {
    ...actual,
    getModelTokens: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("../../lib/chain", () => ({
  shortAddr: (addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
}));

const tokensMod = await import("../../lib/model-tokens");

const sampleTokens: ModelToken[] = [
  {
    modelId: "1",
    issuer: "claw1issuer000000000000000000000000000000000",
    name: "Opus 4.8",
    description: "Anthropic Claude Opus 4.8",
    framework: "openrouter",
    subdenom: "opus_4_8",
    denom: "factory/claw1issuer000000000000000000000000000000000/opus_4_8",
    symbol: "OPUS_4_8",
    supply: "5000000",
    hasToken: true,
    priceClaw: 2.5,
    poolAddress: "claw1pool",
    tags: ["llm"],
    storageUri: "openrouter:anthropic/claude-opus-4.8",
    active: true,
  },
  {
    modelId: "2",
    issuer: "claw1other0000000000000000000000000000000000",
    name: "Qwen3.7 Max",
    description: "Qwen 3.7 Max model",
    framework: "openrouter",
    subdenom: "qwen3_7_max",
    denom: "factory/claw1other0000000000000000000000000000000000/qwen3_7_max",
    symbol: "QWEN3_7_MAX",
    supply: "0",
    hasToken: false,
    priceClaw: null,
    poolAddress: null,
    tags: [],
    storageUri: "openrouter:qwen/qwen3.7-max",
    active: true,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ModelExchange />
    </MemoryRouter>,
  );
}

describe("ModelExchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (tokensMod.getModelTokens as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("renders the page title", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("AI Model Exchange")).toBeInTheDocument();
    });
  });

  it("renders rows from model token data", async () => {
    (tokensMod.getModelTokens as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTokens);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Opus 4.8")).toBeInTheDocument();
      expect(screen.getByText("Qwen3.7 Max")).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId("model-token-row");
    expect(rows).toHaveLength(2);

    // Issued token shows symbol and price. Scope to the row: the symbol now also
    // appears in the Fundamentals panel for the selected model, so a global getByText
    // would match multiple nodes.
    expect(within(rows[0]).getByText("OPUS_4_8")).toBeInTheDocument();
    expect(screen.getByText("2.500000")).toBeInTheDocument();

    // Non-minted token shows "Not minted" and N/A price.
    expect(screen.getByText("Not minted")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("shows the empty state when no models are registered", async () => {
    (tokensMod.getModelTokens as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("model-exchange-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(/No AI models registered yet/i)).toBeInTheDocument();
  });

  it("filters to minted-only when the checkbox is checked", async () => {
    (tokensMod.getModelTokens as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTokens);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId("model-token-row")).toHaveLength(2);
    });

    fireEvent.click(screen.getByTestId("filter-minted"));

    await waitFor(() => {
      expect(screen.getAllByTestId("model-token-row")).toHaveLength(1);
    });
    expect(screen.getByText("Opus 4.8")).toBeInTheDocument();
    expect(screen.queryByText("Qwen3.7 Max")).not.toBeInTheDocument();
  });

  it("searches by symbol", async () => {
    (tokensMod.getModelTokens as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTokens);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId("model-token-row")).toHaveLength(2);
    });

    await userEvent.type(screen.getByTestId("model-token-search"), "qwen");

    await waitFor(() => {
      expect(screen.getAllByTestId("model-token-row")).toHaveLength(1);
      expect(screen.getByText("Qwen3.7 Max")).toBeInTheDocument();
    });
  });

  it("shows an error state when loading fails", async () => {
    (tokensMod.getModelTokens as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network down"),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("model-exchange-error")).toBeInTheDocument();
    });
    expect(screen.getByText(/network down/)).toBeInTheDocument();
  });
});
