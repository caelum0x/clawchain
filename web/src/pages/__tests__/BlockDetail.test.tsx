import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BlockDetail from "../BlockDetail";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetBlock = vi.fn();
const mockGetTxsByHeight = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getBlock: (...args: unknown[]) => mockGetBlock(...args),
  getTxsByHeight: (...args: unknown[]) => mockGetTxsByHeight(...args),
  shortHash: vi.fn((h: string) =>
    h.length > 16 ? `${h.slice(0, 8)}...${h.slice(-8)}` : h,
  ),
  timeAgo: vi.fn((iso: string) => {
    if (!iso) return "unknown";
    return "2 minutes ago";
  }),
}));

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeBlock(overrides: Record<string, unknown> = {}) {
  return {
    height: "12345",
    time: "2026-03-07T12:00:00Z",
    hash: "ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234",
    proposer: "DEADBEEFDEADBEEFDEADBEEFDEADBEEF",
    txCount: 3,
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    hash: "TX11223344556677889900AABBCCDDEEFF11223344556677889900AABBCCDDEEFF",
    height: "12345",
    code: 0,
    gasUsed: "85000",
    gasWanted: "100000",
    memo: "",
    messages: [
      { typeUrl: "/cosmos.bank.v1beta1.MsgSend" },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderBlockDetail(height = "12345") {
  return render(
    <MemoryRouter initialEntries={[`/explorer/block/${height}`]}>
      <Routes>
        <Route path="/explorer/block/:height" element={<BlockDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("BlockDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockGetBlock.mockReturnValue(new Promise(() => {}));
    mockGetTxsByHeight.mockReturnValue(new Promise(() => {}));
    renderBlockDetail();
    expect(screen.getByText("Loading block...")).toBeInTheDocument();
  });

  it("shows block not found when block is null", async () => {
    mockGetBlock.mockResolvedValue(null);
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail();

    await waitFor(() => {
      expect(screen.getByText("Block not found.")).toBeInTheDocument();
    });
  });

  it("displays block height", async () => {
    mockGetBlock.mockResolvedValue(makeBlock());
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail();

    await waitFor(() => {
      const matches = screen.getAllByText(/Block #12,345/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays block hash", async () => {
    const block = makeBlock();
    mockGetBlock.mockResolvedValue(block);
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail();

    await waitFor(() => {
      expect(screen.getByText(block.hash as string)).toBeInTheDocument();
    });
  });

  it("displays proposer address", async () => {
    const block = makeBlock({ proposer: "CAFEBABECAFEBABECAFEBABECAFEBABE" });
    mockGetBlock.mockResolvedValue(block);
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail();

    await waitFor(() => {
      expect(screen.getByText("CAFEBABECAFEBABECAFEBABECAFEBABE")).toBeInTheDocument();
    });
  });

  it("displays transaction count in card", async () => {
    mockGetBlock.mockResolvedValue(makeBlock({ txCount: 7 }));
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail();

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  it("renders transactions table when txs exist", async () => {
    const tx1 = makeTx();
    const tx2 = makeTx({
      hash: "FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00",
      code: 1,
    });
    mockGetBlock.mockResolvedValue(makeBlock());
    mockGetTxsByHeight.mockResolvedValue([tx1, tx2]);
    renderBlockDetail();

    await waitFor(() => {
      expect(screen.getByText("Transactions (2)")).toBeInTheDocument();
    });

    expect(screen.getByText("Hash")).toBeInTheDocument();
    // "Gas Used" appears in both stat card and table column
    const gasElements = screen.getAllByText("Gas Used");
    expect(gasElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByText("Error 1")).toBeInTheDocument();
  });

  it("shows no transactions message when empty", async () => {
    mockGetBlock.mockResolvedValue(makeBlock());
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail();

    await waitFor(() => {
      const matches = screen.getAllByText(/Block #12,345/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText("No transactions in this block.")).toBeInTheDocument();
  });

  it("shows prev and next navigation buttons", async () => {
    mockGetBlock.mockResolvedValue(makeBlock({ height: "500" }));
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail("500");

    await waitFor(() => {
      const matches = screen.getAllByText(/Block #500/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByRole("button", { name: /Prev/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/ })).toBeInTheDocument();
  });

  it("hides prev button for block height 1", async () => {
    mockGetBlock.mockResolvedValue(makeBlock({ height: "1" }));
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail("1");

    await waitFor(() => {
      const matches = screen.getAllByText(/Block #1\b/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByRole("button", { name: /Prev/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/ })).toBeInTheDocument();
  });

  it("displays time ago for block time", async () => {
    mockGetBlock.mockResolvedValue(makeBlock());
    mockGetTxsByHeight.mockResolvedValue([]);
    renderBlockDetail();

    await waitFor(() => {
      expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
    });
  });

  it("shows gas used card", async () => {
    const tx1 = makeTx({ gasUsed: "50000" });
    const tx2 = makeTx({
      hash: "AABBCCDD",
      gasUsed: "30000",
    });
    mockGetBlock.mockResolvedValue(makeBlock());
    mockGetTxsByHeight.mockResolvedValue([tx1, tx2]);
    renderBlockDetail();

    await waitFor(() => {
      const gasElements = screen.getAllByText("Gas Used");
      expect(gasElements.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText("80,000")).toBeInTheDocument();
  });

  it("shows tx success/fail breakdown", async () => {
    const tx1 = makeTx({ gasUsed: "10000" });
    const tx2 = makeTx({ hash: "AABB", code: 1, gasUsed: "5000" });
    mockGetBlock.mockResolvedValue(makeBlock());
    mockGetTxsByHeight.mockResolvedValue([tx1, tx2]);
    renderBlockDetail();

    await waitFor(() => {
      expect(screen.getByText("1 success")).toBeInTheDocument();
    });
    expect(screen.getByText("1 failed")).toBeInTheDocument();
  });
});
