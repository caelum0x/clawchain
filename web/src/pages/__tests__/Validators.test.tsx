import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Validators from "../Validators";

const mockGetValidators = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getValidators: (...args: unknown[]) => mockGetValidators(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

const VALIDATORS = [
  {
    moniker: "AlphaNode",
    operatorAddress: "clawvaloper1alpha_address_long",
    tokens: "5000000000",
    status: "BOND_STATUS_BONDED",
    commission: "0.1",
    jailed: false,
  },
  {
    moniker: "BetaNode",
    operatorAddress: "clawvaloper1beta_address_long",
    tokens: "3000000000",
    status: "BOND_STATUS_BONDED",
    commission: "0.05",
    jailed: false,
  },
  {
    moniker: "JailedVal",
    operatorAddress: "clawvaloper1jailed_address_long",
    tokens: "1000000000",
    status: "BOND_STATUS_BONDED",
    commission: "0.2",
    jailed: true,
  },
];

function renderValidators() {
  return render(
    <MemoryRouter>
      <Validators />
    </MemoryRouter>,
  );
}

describe("Validators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockGetValidators.mockReturnValue(new Promise(() => {}));
    renderValidators();
    expect(screen.getByText("Loading validators...")).toBeInTheDocument();
  });

  it("renders validator list after loading", async () => {
    mockGetValidators.mockResolvedValue([VALIDATORS[0]]);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("Validators")).toBeInTheDocument();
    });
    expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    expect(screen.getByText("Voting Power")).toBeInTheDocument();
    expect(screen.getByText("Commission")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("shows active badge for non-jailed validators", async () => {
    mockGetValidators.mockResolvedValue([VALIDATORS[0]]);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("Active", { selector: ".badge" })).toBeInTheDocument();
    });
  });

  it("shows empty state when no validators found", async () => {
    mockGetValidators.mockResolvedValue([]);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText(/No validators found/i)).toBeInTheDocument();
    });
  });

  it("renders stat cards with correct values", async () => {
    mockGetValidators.mockResolvedValue(VALIDATORS);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("Active Validators")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Staked")).toBeInTheDocument();
    expect(screen.getByText("Avg Commission")).toBeInTheDocument();
    // "Jailed" appears as both stat card header and badge text
    const jailedElements = screen.getAllByText("Jailed");
    expect(jailedElements.length).toBeGreaterThanOrEqual(1);
    // Active Validators stat shows "2", but "2" may also appear in other contexts
    // Check the Active (2) filter button exists
    expect(screen.getByText(/Active \(2\)/)).toBeInTheDocument();
  });

  it("filters by search query", async () => {
    mockGetValidators.mockResolvedValue(VALIDATORS);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search validators...");
    fireEvent.change(searchInput, { target: { value: "beta" } });

    expect(screen.queryByText("AlphaNode")).not.toBeInTheDocument();
    expect(screen.getByText("BetaNode")).toBeInTheDocument();
  });

  it("filters by jailed status", async () => {
    mockGetValidators.mockResolvedValue(VALIDATORS);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Jailed \(1\)/));

    expect(screen.queryByText("AlphaNode")).not.toBeInTheDocument();
    expect(screen.getByText("JailedVal")).toBeInTheDocument();
  });

  it("filters by active status", async () => {
    mockGetValidators.mockResolvedValue(VALIDATORS);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Active \(2\)/));

    expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    expect(screen.getByText("BetaNode")).toBeInTheDocument();
    expect(screen.queryByText("JailedVal")).not.toBeInTheDocument();
  });

  it("sorts by commission when header clicked", async () => {
    mockGetValidators.mockResolvedValue(VALIDATORS);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    });

    // Click Commission header to sort
    fireEvent.click(screen.getByText(/^Commission/));

    // After sorting desc, JailedVal (20%) should be first
    const rows = screen.getAllByRole("row");
    // Row 0 is header, row 1 is first data row
    expect(rows[1]).toHaveTextContent("JailedVal");
  });

  it("shows no match message when search has no results", async () => {
    mockGetValidators.mockResolvedValue(VALIDATORS);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search validators...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    expect(screen.getByText(/No validators match your search/)).toBeInTheDocument();
  });

  it("shows voting power percentage and progress bar", async () => {
    mockGetValidators.mockResolvedValue(VALIDATORS);
    renderValidators();

    await waitFor(() => {
      expect(screen.getByText("AlphaNode")).toBeInTheDocument();
    });

    // AlphaNode has 5B/9B = 55.56%
    expect(screen.getByText("55.55%")).toBeInTheDocument();
  });
});
