import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Explorer from "../Explorer";

// Mock chain API
vi.mock("../../lib/chain.ts", () => ({
  getLatestBlock: vi.fn().mockResolvedValue({
    height: "100",
    time: new Date().toISOString(),
    hash: "ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234",
    proposer: "DEADBEEF",
    txCount: 2,
  }),
  getNetStatus: vi.fn().mockResolvedValue({
    nodeInfo: { network: "clawchain-test", moniker: "test", version: "0.38" },
    syncInfo: {
      latestHeight: "100",
      latestTime: new Date().toISOString(),
      catching_up: false,
    },
    validatorCount: 1,
  }),
  getBlockRange: vi.fn().mockResolvedValue([
    {
      height: "100",
      time: new Date().toISOString(),
      hash: "ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234",
      proposer: "DEADBEEF",
      txCount: 2,
    },
    {
      height: "99",
      time: new Date().toISOString(),
      hash: "EFEF5678EFEF5678EFEF5678EFEF5678EFEF5678EFEF5678EFEF5678EFEF5678",
      proposer: "CAFEBABE",
      txCount: 0,
    },
  ]),
  CHAIN_RPC: "http://localhost:26657",
  timeAgo: vi.fn(() => "1s ago"),
  shortHash: vi.fn((h: string) =>
    h.length > 16 ? `${h.slice(0, 8)}...${h.slice(-8)}` : h,
  ),
}));

// Mock useChainEvents hook to prevent WebSocket connections
vi.mock("../../hooks/useChainEvents.ts", () => ({
  useChainEvents: () => ({ connected: false, lastEvent: null }),
}));

function renderExplorer() {
  return render(
    <MemoryRouter>
      <Explorer />
    </MemoryRouter>,
  );
}

describe("Explorer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the search bar", async () => {
    renderExplorer();

    const searchInput = screen.getByPlaceholderText(
      /search by block height, tx hash, or address/i,
    );
    expect(searchInput).toBeInTheDocument();

    const searchButton = screen.getByRole("button", { name: /search/i });
    expect(searchButton).toBeInTheDocument();
  });

  it("renders the block list section after loading", async () => {
    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("Block Explorer")).toBeInTheDocument();
    });

    // After data loads, the table headers should be visible
    await waitFor(() => {
      expect(screen.getByText("Height")).toBeInTheDocument();
      expect(screen.getByText("Hash")).toBeInTheDocument();
      expect(screen.getByText("Txs")).toBeInTheDocument();
    });
  });

  it("renders the tx type filter dropdown", async () => {
    renderExplorer();

    await waitFor(() => {
      expect(screen.getByText("Tx Type:")).toBeInTheDocument();
    });

    // The filter dropdown should have options
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  it("shows the page title", () => {
    renderExplorer();

    expect(screen.getByText("Block Explorer")).toBeInTheDocument();
  });
});
