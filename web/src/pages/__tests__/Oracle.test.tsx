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
    // Default mock: prices API returns empty list
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ prices: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  it("renders loading state initially", () => {
    // Return a pending promise so the component stays in loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderOracle();

    expect(screen.getByText("Loading prices...")).toBeInTheDocument();
  });

  it("renders page title and subtitle", async () => {
    renderOracle();

    expect(screen.getByText("Oracle")).toBeInTheDocument();
    expect(
      screen.getByText(/Real-time price feeds from the on-chain oracle module/),
    ).toBeInTheDocument();
  });

  it("shows 'no prices' when API returns empty list", async () => {
    renderOracle();

    await waitFor(() => {
      expect(
        screen.getByText("No oracle price feeds available yet."),
      ).toBeInTheDocument();
    });
  });

  it("renders price table when API returns data", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        prices: [
          {
            denom_pair: "CLAW/USD",
            price: "1.250000",
            updated_at: "2026-03-17T00:00:00Z",
          },
          {
            denom_pair: "CLAW/BTC",
            price: "0.000015",
            updated_at: "2026-03-17T00:00:00Z",
          },
        ],
      }),
    });

    renderOracle();

    await waitFor(() => {
      expect(screen.getByText("CLAW/USD")).toBeInTheDocument();
    });

    expect(screen.getByText("CLAW/BTC")).toBeInTheDocument();
    // Table headers
    expect(screen.getByText("Denom Pair")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Last Updated")).toBeInTheDocument();
  });

  it("clicking a price row loads history", async () => {
    // First call returns prices, second call returns history
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          prices: [
            {
              denom_pair: "CLAW/USD",
              price: "1.250000",
              updated_at: "2026-03-17T00:00:00Z",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          history: [
            {
              price: "1.200000",
              timestamp: "2026-03-16T00:00:00Z",
              block_height: "100",
            },
            {
              price: "1.250000",
              timestamp: "2026-03-17T00:00:00Z",
              block_height: "200",
            },
          ],
        }),
      });

    renderOracle();

    await waitFor(() => {
      expect(screen.getByText("CLAW/USD")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("CLAW/USD"));

    await waitFor(() => {
      expect(screen.getByText("Price History: CLAW/USD")).toBeInTheDocument();
    });

    // History table should show block height
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("toggles params section expand/collapse", async () => {
    // First call: prices, second call: params
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prices: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          params: {
            admin: "claw1admin_address",
            max_age_seconds: "300",
            allowed_denoms: ["CLAW/USD", "CLAW/BTC"],
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
      expect(screen.getByText("claw1admin_address")).toBeInTheDocument();
    });
    expect(screen.getByText("300")).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByText("Oracle Parameters"));

    await waitFor(() => {
      expect(screen.getByText("Expand")).toBeInTheDocument();
    });
  });
});
