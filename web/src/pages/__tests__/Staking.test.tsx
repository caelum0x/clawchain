import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Staking from "../Staking";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetValidators = vi.fn();
const mockGetDelegations = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getValidators: (...args: unknown[]) => mockGetValidators(...args),
  getDelegations: (...args: unknown[]) => mockGetDelegations(...args),
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

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
  disconnectWallet: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeValidator(overrides: Record<string, unknown> = {}) {
  return {
    moniker: "ValidatorOne",
    operatorAddress: "claw1valoper_addr_long_enough_to_truncate_test000",
    tokens: "50000000",
    status: "BOND_STATUS_BONDED",
    commission: "0.1",
    jailed: false,
    ...overrides,
  };
}

function makeDelegation(overrides: Record<string, unknown> = {}) {
  return {
    delegatorAddress: "claw1myaddress_long_enough_to_truncate_test000000",
    validatorAddress: "claw1valoper_addr_long_enough_to_truncate_test000",
    shares: "10000000.000000000000000000",
    amount: "10000000",
    denom: "uclaw",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// Mock global fetch for rewards endpoint
function mockFetchRewards(rewards: { total: string; rewards: Array<{ validatorAddress: string; reward: string }> }) {
  const totalCoins = BigInt(rewards.total) > 0n
    ? [{ denom: "uclaw", amount: rewards.total }]
    : [];
  const perValidator = rewards.rewards.map((r) => ({
    validator_address: r.validatorAddress,
    reward: BigInt(r.reward) > 0n ? [{ denom: "uclaw", amount: r.reward }] : [],
  }));

  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ rewards: perValidator, total: totalCoins }),
  } as Response);
}

function renderStaking() {
  return render(
    <MemoryRouter>
      <Staking />
    </MemoryRouter>,
  );
}

function setupValidatorsMock(validators = [makeValidator()]) {
  mockGetValidators.mockResolvedValue(validators);
  mockGetDelegations.mockResolvedValue([]);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Staking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockGetValidators.mockReturnValue(new Promise(() => {}));
    renderStaking();

    expect(screen.getByText("Loading staking data...")).toBeInTheDocument();
  });

  // 2. Renders page title and subtitle
  it("renders page title and subtitle after loading", async () => {
    setupValidatorsMock();
    renderStaking();

    await waitFor(() => {
      expect(screen.getByText("Staking")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Delegate CLAW tokens to validators and earn staking rewards/),
    ).toBeInTheDocument();
  });

  // 3. Renders all four tab buttons
  it("renders all four tab buttons", async () => {
    setupValidatorsMock();
    renderStaking();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Overview/ })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Delegations/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Validators/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rewards/ })).toBeInTheDocument();
  });

  // 4. Shows staking calculator link
  it("shows staking calculator link", async () => {
    setupValidatorsMock();
    renderStaking();

    await waitFor(() => {
      expect(screen.getByText("Staking Calculator")).toBeInTheDocument();
    });

    const link = screen.getByText("Staking Calculator");
    expect(link.closest("a")).toHaveAttribute("href", "/staking/calculator");
  });

  // 5. Shows address lookup form
  it("shows address lookup form", async () => {
    setupValidatorsMock();
    renderStaking();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Enter your claw... address/),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Lookup" })).toBeInTheDocument();
  });

  // 6. Validators tab shows validator list
  it("shows validator list on validators tab", async () => {
    setupValidatorsMock([
      makeValidator({ moniker: "AlphaValidator", tokens: "80000000" }),
      makeValidator({
        operatorAddress: "claw1valoper_second_long_enough_to_truncate_00000",
        moniker: "BetaValidator",
        tokens: "20000000",
        commission: "0.05",
      }),
    ]);
    renderStaking();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Validators/ })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Validators/ }));

    await waitFor(() => {
      expect(screen.getByText("AlphaValidator")).toBeInTheDocument();
    });

    expect(screen.getByText("BetaValidator")).toBeInTheDocument();
    expect(screen.getByText(/2 active validators/)).toBeInTheDocument();
  });

  // 7. Validators tab shows delegate button for each validator
  it("shows delegate buttons on validators tab", async () => {
    setupValidatorsMock([makeValidator()]);
    renderStaking();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Validators/ })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Validators/ }));

    await waitFor(() => {
      expect(screen.getByText("ValidatorOne")).toBeInTheDocument();
    });

    // Each validator row should have a Delegate button
    const delegateButtons = screen.getAllByRole("button", { name: "Delegate" });
    expect(delegateButtons.length).toBeGreaterThanOrEqual(1);
  });

  // 8. Delegate modal opens when clicking Delegate button
  it("opens delegate modal when clicking Delegate button on a validator", async () => {
    setupValidatorsMock([makeValidator({ moniker: "TestVal" })]);
    renderStaking();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Validators/ })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Validators/ }));

    await waitFor(() => {
      expect(screen.getByText("TestVal")).toBeInTheDocument();
    });

    // Click the Delegate button (there's one per validator row)
    const delegateBtn = screen.getAllByRole("button", { name: "Delegate" })[0];
    await user.click(delegateBtn);

    await waitFor(() => {
      expect(screen.getByText("Delegate to Validator")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  // 9. Overview tab prompts to enter address when none provided
  it("prompts to enter address on overview tab when no address is set", async () => {
    setupValidatorsMock();
    renderStaking();

    await waitFor(() => {
      expect(screen.getByText("Staking")).toBeInTheDocument();
    });

    // Overview is the default tab
    expect(
      screen.getByText("Enter your address above to view your staking overview."),
    ).toBeInTheDocument();
  });

  // 10. Delegations tab prompts to enter address when none provided
  it("prompts to enter address on delegations tab when no address is set", async () => {
    setupValidatorsMock();
    renderStaking();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Delegations/ })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Delegations/ }));

    await waitFor(() => {
      expect(
        screen.getByText("Enter your address above to view your delegations."),
      ).toBeInTheDocument();
    });
  });

  // 11. Rewards tab prompts to enter address when none provided
  it("prompts to enter address on rewards tab when no address is set", async () => {
    setupValidatorsMock();
    renderStaking();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Rewards/ })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Rewards/ }));

    await waitFor(() => {
      expect(
        screen.getByText("Enter your address above to view your staking rewards."),
      ).toBeInTheDocument();
    });
  });

  // 12. Error state when validators fail to load
  it("shows error when validators fail to load", async () => {
    mockGetValidators.mockRejectedValue(new Error("Connection refused"));
    renderStaking();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load validators. Is the chain running?"),
      ).toBeInTheDocument();
    });
  });
});
