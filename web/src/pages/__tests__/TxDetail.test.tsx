import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TxDetail from "../TxDetail";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetTxByHash = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getTxByHash: (...args: unknown[]) => mockGetTxByHash(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
  shortHash: vi.fn((h: string) =>
    h.length > 16 ? `${h.slice(0, 8)}...${h.slice(-8)}` : h,
  ),
  timeAgo: vi.fn((iso: string) => {
    if (!iso) return "unknown";
    return "5 minutes ago";
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

const SAMPLE_HASH = "AABB1122AABB1122AABB1122AABB1122AABB1122AABB1122AABB1122AABB1122";

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    hash: SAMPLE_HASH,
    height: "9876",
    code: 0,
    timestamp: "2026-03-07T12:00:00Z",
    gasUsed: "75000",
    gasWanted: "120000",
    memo: "",
    messages: [
      {
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          from_address: "claw1sender_address_long_enough_to_truncate",
          to_address: "claw1receiver_address_long_enough_to_truncate",
          amount: [{ denom: "uclaw", amount: "5000000" }],
        },
      },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderTxDetail(hash = SAMPLE_HASH) {
  return render(
    <MemoryRouter initialEntries={[`/explorer/tx/${hash}`]}>
      <Routes>
        <Route path="/explorer/tx/:hash" element={<TxDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("TxDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockGetTxByHash.mockReturnValue(new Promise(() => {}));
    renderTxDetail();
    expect(screen.getByText("Loading transaction...")).toBeInTheDocument();
  });

  it("shows not found when transaction is null", async () => {
    mockGetTxByHash.mockResolvedValue(null);
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Transaction not found.")).toBeInTheDocument();
    });
  });

  it("displays the transaction hash", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx());
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText(SAMPLE_HASH)).toBeInTheDocument();
    });
  });

  it("displays success status badge for code 0", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ code: 0 }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Success")).toBeInTheDocument();
    });
  });

  it("displays error status badge for non-zero code", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ code: 5 }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Error 5")).toBeInTheDocument();
    });
  });

  it("displays gas used and gas wanted", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ gasUsed: "85000", gasWanted: "150000" }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("85,000 / 150,000")).toBeInTheDocument();
    });
  });

  it("displays gas efficiency percentage", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ gasUsed: "75000", gasWanted: "120000" }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("62.5% efficiency")).toBeInTheDocument();
    });
  });

  it("displays block height link", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ height: "9876" }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("9,876")).toBeInTheDocument();
    });

    const link = screen.getByText("9,876").closest("a");
    expect(link).toHaveAttribute("href", "/explorer/block/9876");
  });

  it("displays message count", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx());
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("renders messages table with typeUrl", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx());
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("/cosmos.bank.v1beta1.MsgSend")).toBeInTheDocument();
    });
  });

  it("displays memo when present", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ memo: "Test transfer memo" }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Memo")).toBeInTheDocument();
      expect(screen.getByText("Test transfer memo")).toBeInTheDocument();
    });
  });

  it("hides memo section when memo is empty", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ memo: "" }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Transaction")).toBeInTheDocument();
    });

    expect(screen.queryByText("Memo")).not.toBeInTheDocument();
  });

  it("renders decoded message details", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx());
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Message Details")).toBeInTheDocument();
    });

    // MsgSend appears in both message table and decoded section
    const msgSendElements = screen.getAllByText("MsgSend");
    expect(msgSendElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
  });

  it("displays timestamp with time ago", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx());
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Timestamp")).toBeInTheDocument();
    });
    expect(screen.getByText("5 minutes ago")).toBeInTheDocument();
  });

  it("toggles raw JSON data view", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx());
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Show Raw Data")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Show Raw Data"));
    expect(screen.getByText("Hide Raw Data")).toBeInTheDocument();
    // Should show JSON content
    expect(screen.getByText(/"hash"/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hide Raw Data"));
    expect(screen.getByText("Show Raw Data")).toBeInTheDocument();
  });

  it("hides timestamp section when no timestamp", async () => {
    mockGetTxByHash.mockResolvedValue(makeTx({ timestamp: undefined }));
    renderTxDetail();

    await waitFor(() => {
      expect(screen.getByText("Transaction")).toBeInTheDocument();
    });

    expect(screen.queryByText("Timestamp")).not.toBeInTheDocument();
  });
});
