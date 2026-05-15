import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ValidatorDetail from "../ValidatorDetail";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetValidators = vi.fn();
const mockFetch = vi.fn();

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
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const OPERATOR_ADDRESS = "clawvaloper1abc123def456ghi789jkl012mno345pqr678stu";

function makeValidatorResponse(overrides: Record<string, unknown> = {}) {
  return {
    validator: {
      operator_address: OPERATOR_ADDRESS,
      description: {
        moniker: "TestValidator",
        identity: "DEADBEEF",
        website: "https://testvalidator.io",
        security_contact: "security@testvalidator.io",
        details: "A reliable validator node.",
      },
      tokens: "5000000000",
      status: "BOND_STATUS_BONDED",
      jailed: false,
      commission: {
        commission_rates: {
          rate: "0.100000000000000000",
          max_rate: "0.200000000000000000",
          max_change_rate: "0.010000000000000000",
        },
      },
      min_self_delegation: "1000000",
      unbonding_height: "0",
      unbonding_time: "1970-01-01T00:00:00Z",
      ...overrides,
    },
  };
}

function makeDelegationsResponse(count = 2) {
  const delegations = Array.from({ length: count }, (_, i) => ({
    delegation: {
      delegator_address: `claw1delegator${i}_long_enough_to_truncate`,
      shares: `${(count - i) * 1000000}.000000000000000000`,
    },
    balance: { denom: "uclaw", amount: `${(count - i) * 1000000}` },
  }));
  return {
    delegation_responses: delegations,
    pagination: { next_key: null, total: String(count) },
  };
}

function makeCommissionResponse(amount = "50000000") {
  return {
    commission: {
      commission: [{ denom: "uclaw", amount: `${amount}.000000000000000000` }],
    },
  };
}

function makeOutstandingRewardsResponse(amount = "100000000") {
  return {
    rewards: {
      rewards: [{ denom: "uclaw", amount: `${amount}.000000000000000000` }],
    },
  };
}

function makeSigningInfosResponse() {
  return {
    info: [
      {
        address: "clawvalcons1abc",
        start_height: "1",
        missed_blocks_counter: "42",
        jailed_until: "1970-01-01T00:00:00Z",
        tombstoned: false,
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setupFetchMock(overrides: Record<string, unknown> = {}) {
  const validatorResp = overrides.validator ?? makeValidatorResponse();
  const delegationsResp = overrides.delegations ?? makeDelegationsResponse();
  const commissionResp = overrides.commission ?? makeCommissionResponse();
  const rewardsResp = overrides.rewards ?? makeOutstandingRewardsResponse();
  const signingResp = overrides.signing ?? makeSigningInfosResponse();

  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/delegations")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(delegationsResp),
      });
    }
    if (url.includes("/commission")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(commissionResp),
      });
    }
    if (url.includes("/outstanding_rewards")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(rewardsResp),
      });
    }
    if (url.includes("/signing_infos")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(signingResp),
      });
    }
    if (url.includes("/validators/")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(validatorResp),
      });
    }
    if (url.includes("/node_info")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  mockGetValidators.mockResolvedValue([
    {
      moniker: "TestValidator",
      operatorAddress: OPERATOR_ADDRESS,
      tokens: "5000000000",
      status: "BOND_STATUS_BONDED",
      commission: "0.100000000000000000",
      jailed: false,
    },
  ]);
}

function renderValidatorDetail(address = OPERATOR_ADDRESS) {
  return render(
    <MemoryRouter initialEntries={[`/validators/${address}`]}>
      <Routes>
        <Route path="/validators/:address" element={<ValidatorDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ValidatorDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    mockGetValidators.mockReturnValue(new Promise(() => {}));

    renderValidatorDetail();

    expect(screen.getByText("Loading validator...")).toBeInTheDocument();
  });

  // 2. Shows validator moniker and status after loading
  it("shows validator moniker and status after loading", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getAllByText("TestValidator").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText("Bonded")).toBeInTheDocument();
    expect(screen.getByText(OPERATOR_ADDRESS)).toBeInTheDocument();
  });

  // 3. Shows voting power and commission cards
  it("shows voting power and commission stat cards", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getByText("Voting Power")).toBeInTheDocument();
    });

    expect(screen.getByText("Commission Rate")).toBeInTheDocument();
    // "10.00%" appears in both the stat card and the details commission table
    const pctElements = screen.getAllByText("10.00%");
    expect(pctElements.length).toBeGreaterThanOrEqual(1);
    // "Min Self-Delegation" appears in both the stat card and the details staking table
    const msdElements = screen.getAllByText("Min Self-Delegation");
    expect(msdElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Total Delegators")).toBeInTheDocument();
  });

  // 4. Displays details tab by default with commission table
  it("displays details tab by default with commission and staking info", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getAllByText("TestValidator").length).toBeGreaterThanOrEqual(1);
    });

    // Description section
    expect(screen.getByText("A reliable validator node.")).toBeInTheDocument();

    // Commission table in details tab
    expect(screen.getByText("Commission")).toBeInTheDocument();
    expect(screen.getByText("Current Rate")).toBeInTheDocument();
    expect(screen.getByText("Max Rate")).toBeInTheDocument();
    expect(screen.getByText("Max Change Rate")).toBeInTheDocument();

    // Staking info
    expect(screen.getByText("Staking Info")).toBeInTheDocument();
  });

  // 5. Switching to delegators tab shows delegator table
  it("switching to delegators tab shows delegator table", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getAllByText("TestValidator").length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /delegators/i }));

    await waitFor(() => {
      expect(screen.getByText("Delegator Address")).toBeInTheDocument();
    });

    expect(screen.getByText("Shares")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
  });

  // 6. Switching to rewards tab shows commission and outstanding rewards
  it("switching to rewards tab shows commission and outstanding rewards", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getAllByText("TestValidator").length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /rewards/i }));

    await waitFor(() => {
      expect(screen.getByText("Accumulated Commission")).toBeInTheDocument();
    });

    expect(screen.getByText("Outstanding Rewards")).toBeInTheDocument();
    // 50000000 uclaw = 50 CLAW, 100000000 uclaw = 100 CLAW
    expect(screen.getByText("50 CLAW")).toBeInTheDocument();
    expect(screen.getByText("100 CLAW")).toBeInTheDocument();
  });

  // 7. Switching to signing tab shows signing info
  it("switching to signing tab shows signing info", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getAllByText("TestValidator").length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /signing/i }));

    await waitFor(() => {
      expect(screen.getByText("Signing Info")).toBeInTheDocument();
    });

    expect(screen.getByText("Missed Blocks")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Tombstoned")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Start Height")).toBeInTheDocument();
  });

  // 8. Shows jailed status for jailed validator
  it("shows jailed status for jailed validator", async () => {
    setupFetchMock({
      validator: makeValidatorResponse({
        jailed: true,
        status: "BOND_STATUS_UNBONDING",
      }),
    });
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getByText("Jailed")).toBeInTheDocument();
    });
  });

  // 9. Shows breadcrumb with validators link
  it("shows breadcrumb with validators link", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getAllByText("TestValidator").length).toBeGreaterThanOrEqual(1);
    });

    const breadcrumbNav = screen.getByLabelText("Breadcrumb");
    expect(breadcrumbNav).toBeInTheDocument();
    const validatorsLink = screen.getByText("Validators");
    expect(validatorsLink.closest("a")).toHaveAttribute("href", "/validators");
  });

  // 10. Shows website link when provided
  it("shows website link when provided", async () => {
    setupFetchMock();
    renderValidatorDetail();

    await waitFor(() => {
      expect(screen.getAllByText("TestValidator").length).toBeGreaterThanOrEqual(1);
    });

    const websiteLink = screen.getByText("https://testvalidator.io");
    expect(websiteLink).toBeInTheDocument();
    expect(websiteLink.closest("a")).toHaveAttribute("href", "https://testvalidator.io");
  });
});
