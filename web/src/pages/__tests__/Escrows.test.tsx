import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Escrows from "../Escrows";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

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

vi.mock("../../lib/chain.ts", () => ({
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
  disconnectWallet: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeEscrow(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    buyer: "claw1buyer_addr_long_enough_to_truncate_test00000",
    seller: "claw1seller_addr_long_enough_to_truncate_test0000",
    amount: { amount: "10000000", denom: "uclaw" },
    status: "active",
    milestones: [
      { description: "Deliver prototype", amount: "5000000", completed: false },
      { description: "Final delivery", amount: "5000000", completed: false },
    ],
    created_at: "2026-03-01T12:00:00Z",
    completed_at: "",
    ...overrides,
  };
}

function makeDispute(overrides: Record<string, unknown> = {}) {
  return {
    escrow_id: "3",
    reason: "Work not delivered on time",
    resolution: "",
    resolved: false,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderEscrows() {
  return render(
    <MemoryRouter>
      <Escrows />
    </MemoryRouter>,
  );
}

function mockFetchResponses(opts: {
  buyer?: unknown[];
  seller?: unknown[];
  dispute?: unknown | null;
} = {}) {
  const { buyer = [], seller = [], dispute = null } = opts;

  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("escrows") && url.includes("buyer=")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ escrows: buyer }),
      });
    }
    if (typeof url === "string" && url.includes("escrows") && url.includes("seller=")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ escrows: seller }),
      });
    }
    if (typeof url === "string" && url.includes("/dispute/")) {
      return Promise.resolve({
        ok: dispute !== null,
        json: () => Promise.resolve({ dispute }),
      });
    }
    if (typeof url === "string" && url.includes("/escrow/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ escrow: buyer[0] ?? null }),
      });
    }
    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({}),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Escrows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetchResponses();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Renders page title and tab buttons
  it("renders page title and tab buttons", () => {
    renderEscrows();

    expect(screen.getByText("Escrows")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText(/As Buyer/)).toBeInTheDocument();
    expect(screen.getByText(/As Seller/)).toBeInTheDocument();
    expect(screen.getByText(/Disputes/)).toBeInTheDocument();
  });

  // 2. Shows address lookup form
  it("shows address lookup form with input and Lookup button", () => {
    renderEscrows();

    expect(
      screen.getByPlaceholderText("Enter your claw... address to view escrows"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lookup" }),
    ).toBeInTheDocument();
  });

  // 3. Overview tab shows prompt when no address entered
  it("overview tab prompts for address when none entered", () => {
    renderEscrows();

    expect(
      screen.getByText("Enter your address above to view your escrow overview."),
    ).toBeInTheDocument();
  });

  // 4. Overview tab shows stats after address lookup
  it("overview tab shows stats after address lookup", async () => {
    const escrows = [
      makeEscrow({ id: "1", status: "active" }),
      makeEscrow({ id: "2", status: "completed", amount: { amount: "20000000", denom: "uclaw" } }),
    ];
    mockFetchResponses({ buyer: escrows, seller: [] });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await waitFor(() => {
      expect(screen.getByText("Total Escrows")).toBeInTheDocument();
    });

    expect(screen.getByText("Active Value")).toBeInTheDocument();
    expect(screen.getByText("Completed Value")).toBeInTheDocument();
    expect(screen.getByText("Disputes")).toBeInTheDocument();
  });

  // 5. Tab switching works
  it("switches between tabs correctly", async () => {
    renderEscrows();

    const user = userEvent.setup();

    // Overview is default
    expect(
      screen.getByText("Enter your address above to view your escrow overview."),
    ).toBeInTheDocument();

    // Switch to As Buyer tab
    await user.click(screen.getByText(/As Buyer/));
    await waitFor(() => {
      expect(
        screen.getByText("Enter your address above to view escrows where you are the buyer."),
      ).toBeInTheDocument();
    });

    // Switch to As Seller tab
    await user.click(screen.getByText(/As Seller/));
    await waitFor(() => {
      expect(
        screen.getByText("Enter your address above to view escrows where you are the seller."),
      ).toBeInTheDocument();
    });

    // Switch to Disputes tab
    await user.click(screen.getByText(/Disputes/));
    await waitFor(() => {
      expect(
        screen.getByText("Enter your address above to view disputed escrows."),
      ).toBeInTheDocument();
    });
  });

  // 6. Buyer tab shows escrow table
  it("buyer tab shows escrow table with data", async () => {
    const escrows = [
      makeEscrow({ id: "99", status: "active" }),
    ];
    mockFetchResponses({ buyer: escrows, seller: [] });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/As Buyer/));

    await waitFor(() => {
      expect(screen.getByText("99")).toBeInTheDocument();
    });

    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("0/2")).toBeInTheDocument(); // milestones progress
  });

  // 7. Buyer tab shows Create Escrow button and form
  it("buyer tab shows Create Escrow button and toggles form", async () => {
    mockFetchResponses({ buyer: [], seller: [] });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/As Buyer/));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create Escrow" }),
      ).toBeInTheDocument();
    });

    // Click to open form
    await user.click(screen.getByRole("button", { name: "Create Escrow" }));

    await waitFor(() => {
      expect(screen.getByText("Create New Escrow")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("claw1...")).toBeInTheDocument();
    expect(screen.getByText("+ Add Milestone")).toBeInTheDocument();
  });

  // 8. Empty buyer escrows shows empty message
  it("shows empty message when no buyer escrows exist", async () => {
    mockFetchResponses({ buyer: [], seller: [] });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/As Buyer/));

    await waitFor(() => {
      expect(
        screen.getByText("No escrows found where you are the buyer."),
      ).toBeInTheDocument();
    });
  });

  // 9. Active escrows show Complete and Dispute action buttons
  it("active buyer escrows show Complete and Dispute buttons", async () => {
    const escrows = [makeEscrow({ id: "50", status: "active" })];
    mockFetchResponses({ buyer: escrows, seller: [] });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/As Buyer/));

    await waitFor(() => {
      expect(screen.getByText("50")).toBeInTheDocument();
    });

    // Active escrows should have Complete and Dispute buttons
    expect(
      screen.getByRole("button", { name: "Complete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dispute" }),
    ).toBeInTheDocument();
  });

  // 10. Seller tab shows milestone completion buttons
  it("seller tab shows milestone completion buttons for active escrows", async () => {
    const escrows = [
      makeEscrow({
        id: "7",
        status: "active",
        milestones: [
          { description: "Phase 1", amount: "3000000", completed: false },
          { description: "Phase 2", amount: "7000000", completed: false },
        ],
      }),
    ];
    mockFetchResponses({ buyer: [], seller: escrows });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/As Seller/));

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });

    // Should have milestone completion buttons
    expect(screen.getByText("Complete #1")).toBeInTheDocument();
    expect(screen.getByText("Complete #2")).toBeInTheDocument();
  });

  // 11. Disputes tab shows disputed escrows
  it("disputes tab shows disputed escrows with dispute details", async () => {
    const disputedEscrow = makeEscrow({ id: "3", status: "disputed" });
    const dispute = makeDispute({
      escrow_id: "3",
      reason: "Work not delivered on time",
      resolved: false,
    });

    mockFetchResponses({
      buyer: [disputedEscrow],
      seller: [],
      dispute,
    });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    // "Disputes" text appears both in tab button and overview stat card,
    // so target the tab button specifically by its exact label with count.
    await waitFor(() => {
      expect(screen.getByText(/Disputes \(/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Disputes \(/));

    await waitFor(() => {
      expect(screen.getByText("Work not delivered on time")).toBeInTheDocument();
    });

    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  // 12. Create escrow form allows adding milestones
  it("create escrow form allows adding and removing milestones", async () => {
    mockFetchResponses({ buyer: [], seller: [] });

    renderEscrows();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view escrows",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/As Buyer/));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create Escrow" }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Create Escrow" }));

    await waitFor(() => {
      expect(screen.getByText("Create New Escrow")).toBeInTheDocument();
    });

    // Initially 1 milestone row, no Remove button (only shows with >1 milestones)
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();

    // Add another milestone
    await user.click(screen.getByText("+ Add Milestone"));

    await waitFor(() => {
      const removeButtons = screen.getAllByRole("button", { name: "Remove" });
      expect(removeButtons.length).toBe(2);
    });

    // Remove one milestone
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    });
  });
});
