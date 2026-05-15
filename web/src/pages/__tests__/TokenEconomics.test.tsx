import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TokenEconomics from "../TokenEconomics";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

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
}));

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    chainId: "clawchain-test",
    chainName: "ClawChain Test",
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
  },
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

function makeFetchResponses({
  totalSupply = "100000000000",
  communityPool = "5000000000",
  inflation = "0.13",
  annualProvisions = "13000000000",
  bondedTokens = "60000000000",
  notBondedTokens = "10000000000",
  validators = [
    {
      description: { moniker: "AlphaValidator" },
      tokens: "30000000000",
      operator_address: "clawvaloper1alpha_addr_long_enough_truncate",
    },
    {
      description: { moniker: "BetaValidator" },
      tokens: "20000000000",
      operator_address: "clawvaloper1beta_addr_long_enough_truncate",
    },
    {
      description: { moniker: "GammaValidator" },
      tokens: "10000000000",
      operator_address: "clawvaloper1gamma_addr_long_enough_truncate",
    },
  ],
} = {}) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/cosmos/bank/v1beta1/supply")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            supply: [{ denom: "uclaw", amount: totalSupply }],
          }),
      });
    }

    if (url.includes("/cosmos/distribution/v1beta1/community_pool")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            pool: [{ denom: "uclaw", amount: communityPool }],
          }),
      });
    }

    if (url.includes("/cosmos/mint/v1beta1/inflation")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ inflation }),
      });
    }

    if (url.includes("/cosmos/mint/v1beta1/annual_provisions")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ annual_provisions: annualProvisions }),
      });
    }

    if (url.includes("/cosmos/staking/v1beta1/pool")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            pool: {
              bonded_tokens: bondedTokens,
              not_bonded_tokens: notBondedTokens,
            },
          }),
      });
    }

    if (url.includes("/cosmos/staking/v1beta1/validators")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ validators }),
      });
    }

    // Default fallback
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderTokenEconomics() {
  return render(
    <MemoryRouter>
      <TokenEconomics />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("TokenEconomics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderTokenEconomics();

    expect(screen.getByText("Loading token economics...")).toBeInTheDocument();
  });

  // 2. Renders page heading after data loads
  it("renders the Token Economics heading after data loads", async () => {
    makeFetchResponses();
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("Token Economics")).toBeInTheDocument();
    });
  });

  // 3. Renders staking overview StatCards
  it("renders staking overview stat cards", async () => {
    makeFetchResponses();
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("Staking Overview")).toBeInTheDocument();
    });

    // StatCard components with data-testid="stat-card"
    const statCards = screen.getAllByTestId("stat-card");
    expect(statCards.length).toBe(4);

    expect(screen.getByText("Total Supply")).toBeInTheDocument();
    expect(screen.getByText("Staking Ratio")).toBeInTheDocument();
    expect(screen.getByText("Inflation Rate")).toBeInTheDocument();
    expect(screen.getByText("Community Pool")).toBeInTheDocument();
  });

  // 4. Renders supply distribution DonutChart
  it("renders supply distribution donut chart", async () => {
    makeFetchResponses();
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("Supply Distribution")).toBeInTheDocument();
    });

    // DonutChart renders 3 segments: Bonded, Unbonded, Community Pool
    const segments = screen.getAllByTestId("donut-segment");
    expect(segments.length).toBe(3);

    // Legend items
    const legendItems = screen.getAllByTestId("donut-legend-item");
    expect(legendItems.length).toBe(3);
  });

  // 5. Renders inflation info table
  it("renders inflation info table", async () => {
    makeFetchResponses({ inflation: "0.13" });
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("Inflation Info")).toBeInTheDocument();
    });

    expect(screen.getByText("Current Inflation Rate")).toBeInTheDocument();
    expect(screen.getByText("Annual Provisions")).toBeInTheDocument();
    expect(screen.getByText("Mint Rate per Block")).toBeInTheDocument();
    expect(screen.getByText("Distribution")).toBeInTheDocument();
    expect(
      screen.getByText("Inflation goes to stakers and community pool"),
    ).toBeInTheDocument();

    // Inflation rate displayed as 13.00% in both StatCard and table
    const inflationValues = screen.getAllByText("13.00%");
    expect(inflationValues.length).toBeGreaterThanOrEqual(2);
  });

  // 6. Renders staking pool section with bonded/not-bonded info
  it("renders staking pool section", async () => {
    makeFetchResponses({ bondedTokens: "60000000000", notBondedTokens: "10000000000" });
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("Staking Pool")).toBeInTheDocument();
    });

    expect(screen.getByText("Bonded")).toBeInTheDocument();
    expect(screen.getByText("Not Bonded")).toBeInTheDocument();
  });

  // 7. Renders top validators BarChart
  it("renders top validators bar chart", async () => {
    makeFetchResponses();
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("Top Validators by Tokens")).toBeInTheDocument();
    });

    // BarChart renders bar elements
    const bars = screen.getAllByTestId("bar-chart-bar");
    expect(bars.length).toBe(3);
  });

  // 8. Renders validator table with correct data
  it("renders validator table with moniker and rank", async () => {
    makeFetchResponses();
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("AlphaValidator")).toBeInTheDocument();
    });

    expect(screen.getByText("BetaValidator")).toBeInTheDocument();
    expect(screen.getByText("GammaValidator")).toBeInTheDocument();

    // Table headers
    expect(screen.getByText("Moniker")).toBeInTheDocument();
    expect(screen.getByText("Self-Stake")).toBeInTheDocument();
    expect(screen.getByText("% of Total")).toBeInTheDocument();
    expect(screen.getByText("Operator")).toBeInTheDocument();
  });

  // 9. Shows empty validator message when no validators exist
  it("shows no validator data message when validators array is empty", async () => {
    makeFetchResponses({ validators: [] });
    renderTokenEconomics();

    await waitFor(() => {
      expect(screen.getByText("No validator data available.")).toBeInTheDocument();
    });
  });

  // 10. Shows error state when json parsing throws before supply is set
  it("shows error state when data causes a processing error", async () => {
    // Make the supply endpoint's json() throw, which happens before setSupply
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/cosmos/bank/v1beta1/supply")) {
        return Promise.resolve({
          ok: true,
          json: () => { throw new Error("parse error"); },
        });
      }
      return Promise.resolve({ ok: false });
    });
    renderTokenEconomics();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load token economics data"),
      ).toBeInTheDocument();
    });
  });
});
