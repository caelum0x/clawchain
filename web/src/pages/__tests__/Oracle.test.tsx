import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Oracle from "../Oracle";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Default mock responses for the three initial fetches */
function mockDefaultFetches() {
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exchange_rates: [] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ actives: [] }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vote_targets: [] }),
    });
}

function renderOracle() {
  return render(
    <MemoryRouter>
      <Oracle />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Oracle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("renders loading state initially", () => {
    // Return pending promises so the component stays in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderOracle();

    expect(screen.getByText("Loading prices...")).toBeInTheDocument();
  });

  it("renders page title and subtitle", async () => {
    mockDefaultFetches();
    renderOracle();

    expect(screen.getByText("Oracle")).toBeInTheDocument();
    expect(
      screen.getByText(/Real-time price feeds from the on-chain oracle module/),
    ).toBeInTheDocument();
  });

  it("shows 'no prices' when API returns empty list", async () => {
    mockDefaultFetches();
    renderOracle();

    await waitFor(() => {
      expect(
        screen.getByText("No oracle price feeds available yet."),
      ).toBeInTheDocument();
    });
  });

  it("renders exchange rate table when API returns data", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          exchange_rates: [
            { denom: "uusd", exchange_rate: "1.250000" },
            { denom: "ukrw", exchange_rate: "1450.000000" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ actives: ["uusd", "ukrw"] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vote_targets: ["uusd"] }),
      });

    renderOracle();

    await waitFor(() => {
      expect(screen.getAllByText("uusd").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText("ukrw").length).toBeGreaterThanOrEqual(1);
    // Table headers
    expect(screen.getByText("Denom")).toBeInTheDocument();
    expect(screen.getByText("Exchange Rate")).toBeInTheDocument();
  });

  it("clicking a rate row loads single denom detail", async () => {
    // Initial fetches: exchange_rates, actives, vote_targets
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          exchange_rates: [
            { denom: "uusd", exchange_rate: "1.250000" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ actives: ["uusd"] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vote_targets: ["uusd"] }),
      })
      // Single denom fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exchange_rate: "1.250000" }),
      });

    renderOracle();

    // Wait for exchange rates table to render, then click the row's strong text
    await waitFor(() => {
      expect(screen.getAllByText("uusd").length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup();
    // Click the Details button to avoid ambiguity
    await user.click(screen.getByText("Details"));

    await waitFor(() => {
      expect(screen.getByText("Exchange Rate: uusd")).toBeInTheDocument();
    });
  });

  it("shows active denoms and vote targets", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exchange_rates: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ actives: ["uusd", "ukrw", "usdr"] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vote_targets: ["uusd", "ukrw"] }),
      });

    renderOracle();

    // Wait for active denoms to render (usdr is unique to actives, no ambiguity)
    await waitFor(() => {
      expect(screen.getByText("usdr")).toBeInTheDocument();
    });

    expect(screen.getByText("Active Denoms")).toBeInTheDocument();
    expect(screen.getByText("Vote Targets")).toBeInTheDocument();
    // uusd appears in both active denoms and vote targets
    expect(screen.getAllByText("uusd").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("ukrw").length).toBeGreaterThanOrEqual(2);
  });

  it("toggles params section expand/collapse", async () => {
    // Initial fetches
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exchange_rates: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ actives: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vote_targets: [] }),
      })
      // Params fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          params: {
            vote_period: "5",
            vote_threshold: "0.500000",
            reward_band: "0.070000",
            reward_distribution_window: "5256000",
            whitelist: [
              { name: "uusd", tobin_tax: "0.002500" },
              { name: "ukrw", tobin_tax: "0.002500" },
            ],
            slash_fraction: "0.000100",
            slash_window: "100800",
            min_valid_per_window: "0.050000",
          },
        }),
      });

    renderOracle();

    await waitFor(() => {
      expect(screen.getByText("Oracle Parameters")).toBeInTheDocument();
    });

    // Initially collapsed - Expand button visible
    expect(screen.getByText("Expand")).toBeInTheDocument();

    const user = userEvent.setup();

    // Click to expand
    await user.click(screen.getByText("Oracle Parameters"));

    await waitFor(() => {
      expect(screen.getByText("Collapse")).toBeInTheDocument();
    });

    // Params should now be visible
    await waitFor(() => {
      expect(screen.getByText("Vote Period")).toBeInTheDocument();
    });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("0.500000")).toBeInTheDocument();
    expect(screen.getByText("0.070000")).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByText("Oracle Parameters"));

    await waitFor(() => {
      expect(screen.getByText("Expand")).toBeInTheDocument();
    });
  });
});
