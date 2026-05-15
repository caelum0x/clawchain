import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StakingCalculator from "../StakingCalculator";

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

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
    coinMinimalDenom: "uclaw",
    coinDenom: "CLAW",
    coinDecimals: 6,
    chainId: "clawchain",
    chainName: "ClawChain",
    bech32Prefix: "claw",
    gasPrice: "0.025uclaw",
    faucetEndpoint: "http://localhost:8000",
    walletUrl: "http://localhost:3001",
  },
}));

const sampleValidators = [
  {
    moniker: "AlphaValidator",
    operatorAddress: "clawvaloper1alpha000000000000000000",
    tokens: "5000000000000",
    status: "BOND_STATUS_BONDED",
    commission: "0.05",
    jailed: false,
  },
  {
    moniker: "BetaValidator",
    operatorAddress: "clawvaloper1beta0000000000000000000",
    tokens: "3000000000000",
    status: "BOND_STATUS_BONDED",
    commission: "0.10",
    jailed: false,
  },
];

function mockFetchSuccess() {
  const originalFetch = global.fetch;
  global.fetch = vi.fn((url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("/cosmos/mint/v1beta1/inflation")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ inflation: "0.130000000000000000" }),
      } as Response);
    }
    if (urlStr.includes("/cosmos/mint/v1beta1/annual_provisions")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            annual_provisions: "13000000000000.000000000000000000",
          }),
      } as Response);
    }
    if (urlStr.includes("/cosmos/staking/v1beta1/pool")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            pool: {
              bonded_tokens: "80000000000000",
              not_bonded_tokens: "20000000000000",
            },
          }),
      } as Response);
    }
    return originalFetch(url as any);
  }) as any;
}

function renderCalculator() {
  return render(
    <MemoryRouter>
      <StakingCalculator />
    </MemoryRouter>,
  );
}

describe("StakingCalculator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSuccess();
  });

  it("shows loading state initially", () => {
    mockGetValidators.mockReturnValue(new Promise(() => {}));
    renderCalculator();
    expect(screen.getByText("Loading staking calculator...")).toBeInTheDocument();
  });

  it("renders input fields after data loads", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(screen.getByText("Staking Calculator")).toBeInTheDocument();
    });

    // Amount input
    expect(screen.getByLabelText("Amount to stake")).toBeInTheDocument();

    // Slider
    expect(screen.getByLabelText("Stake amount slider")).toBeInTheDocument();

    // Validator dropdown
    const dropdown = screen.getByLabelText("Select validator");
    expect(dropdown).toBeInTheDocument();

    // Period toggle buttons
    expect(screen.getByText("1 Month")).toBeInTheDocument();
    expect(screen.getByText("3 Months")).toBeInTheDocument();
    expect(screen.getByText("6 Months")).toBeInTheDocument();
    expect(screen.getByText("1 Year")).toBeInTheDocument();

    // Auto-compound toggle
    expect(screen.getByLabelText("Auto-compound yes")).toBeInTheDocument();
    expect(screen.getByLabelText("Auto-compound no")).toBeInTheDocument();
  });

  it("shows validator options in the dropdown", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(screen.getByText("Staking Calculator")).toBeInTheDocument();
    });

    expect(
      screen.getByText("AlphaValidator (5.0% commission)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("BetaValidator (10.0% commission)"),
    ).toBeInTheDocument();
  });

  it("shows reward estimates after data loads", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(screen.getByText("Estimated Rewards")).toBeInTheDocument();
    });

    // StatCard titles
    expect(screen.getByText("Daily Reward")).toBeInTheDocument();
    expect(screen.getByText("Monthly Reward")).toBeInTheDocument();
    expect(screen.getByText("Annual Reward")).toBeInTheDocument();
    expect(screen.getByText("APR")).toBeInTheDocument();
    expect(screen.getByText("APY")).toBeInTheDocument();
  });

  it("auto-compound toggle changes APY display", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(screen.getByText("Estimated Rewards")).toBeInTheDocument();
    });

    // Default: auto-compound is off
    expect(screen.getByText(/No compounding/)).toBeInTheDocument();

    // Click Yes for auto-compound
    fireEvent.click(screen.getByLabelText("Auto-compound yes"));

    await waitFor(() => {
      expect(screen.getByText(/Compounding active/)).toBeInTheDocument();
    });
  });

  it("handles zero amount gracefully", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(screen.getByText("Staking Calculator")).toBeInTheDocument();
    });

    const amountInput = screen.getByLabelText("Amount to stake");
    fireEvent.change(amountInput, { target: { value: "0" } });

    await waitFor(() => {
      // With zero stake, all reward values should show 0.0000
      expect(screen.getByText("Daily Reward")).toBeInTheDocument();
      const zeroValues = screen.getAllByText(/^0\.0000 CLAW$/);
      expect(zeroValues.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("updates estimates when staking period changes", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(screen.getByText("Estimated Rewards")).toBeInTheDocument();
    });

    // Default period is 1 Year - total after label should say "1 Year"
    expect(screen.getByText("Total After 1 Year")).toBeInTheDocument();

    // Switch to 3 months
    fireEvent.click(screen.getByText("3 Months"));

    await waitFor(() => {
      expect(screen.getByText("Total After 3 Months")).toBeInTheDocument();
    });
  });

  it("shows disclaimer text", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(
        screen.getByText(/Estimates are based on current network parameters/),
      ).toBeInTheDocument();
    });
  });

  it("shows network parameters section", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(screen.getByText("Inflation Rate")).toBeInTheDocument();
    });

    expect(screen.getByText("Annual Provisions")).toBeInTheDocument();
    expect(screen.getByText("Total Bonded")).toBeInTheDocument();
    expect(screen.getByText("Staking Ratio")).toBeInTheDocument();
  });

  it("renders the projected growth chart", async () => {
    mockGetValidators.mockResolvedValue(sampleValidators);
    renderCalculator();

    await waitFor(() => {
      expect(
        screen.getByText(/Projected Growth Over/),
      ).toBeInTheDocument();
    });
  });
});
