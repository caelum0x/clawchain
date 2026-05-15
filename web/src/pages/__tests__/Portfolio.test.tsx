import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Portfolio from "../Portfolio";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetBalances = vi.fn();
const mockGetDelegations = vi.fn();
const mockGetTxPageByAddress = vi.fn();
const mockGetComputeResources = vi.fn();
const mockGetComputeJobs = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getBalances: (...args: unknown[]) => mockGetBalances(...args),
  getDelegations: (...args: unknown[]) => mockGetDelegations(...args),
  getTxPageByAddress: (...args: unknown[]) => mockGetTxPageByAddress(...args),
  getComputeResources: (...args: unknown[]) => mockGetComputeResources(...args),
  getComputeJobs: (...args: unknown[]) => mockGetComputeJobs(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
  shortHash: vi.fn((hash: string) =>
    hash.length > 12 ? `${hash.slice(0, 8)}...${hash.slice(-4)}` : hash,
  ),
  timeAgo: vi.fn(() => "2m ago"),
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

const mockFetch = vi.fn();

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TEST_ADDR = "claw1testaddr00000000000000000000000000000000";

function makeBalance(denom: string, amount: string) {
  return { denom, amount };
}

function makeDelegation(overrides: Record<string, unknown> = {}) {
  return {
    validatorAddress: "clawvaloper1abc123def456ghi789jkl012mno345pqr678stu",
    amount: "5000000",
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    hash: "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890",
    height: "1000",
    code: 0,
    timestamp: new Date().toISOString(),
    messages: [
      {
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          from_address: TEST_ADDR,
          to_address: "claw1receiver",
          amount: [{ denom: "uclaw", amount: "1000000" }],
        },
      },
    ],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderPortfolio() {
  return render(
    <MemoryRouter>
      <Portfolio />
    </MemoryRouter>,
  );
}

/**
 * Mock all REST fetch calls that Portfolio makes (rewards, unbonding, escrows, tasks).
 */
function mockFetchResponses(opts: {
  rewards?: unknown;
  unbonding?: unknown;
  escrows?: { buyer?: unknown[]; seller?: unknown[] };
  tasks?: { delegated?: unknown[]; assigned?: unknown[] };
} = {}) {
  const {
    rewards = { rewards: [], total: [] },
    unbonding = { unbonding_responses: [] },
    escrows = { buyer: [], seller: [] },
    tasks = { delegated: [], assigned: [] },
  } = opts;

  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/rewards")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(rewards),
      });
    }
    if (typeof url === "string" && url.includes("/unbonding_delegations")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(unbonding),
      });
    }
    if (typeof url === "string" && url.includes("escrows") && url.includes("buyer=")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ escrows: escrows.buyer }),
      });
    }
    if (typeof url === "string" && url.includes("escrows") && url.includes("seller=")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ escrows: escrows.seller }),
      });
    }
    if (typeof url === "string" && url.includes("tasks_by_delegator")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: tasks.delegated }),
      });
    }
    if (typeof url === "string" && url.includes("tasks_by_assignee")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: tasks.assigned }),
      });
    }
    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({}),
    });
  });
}

function setupMocks(opts: {
  balances?: Array<{ denom: string; amount: string }>;
  delegations?: unknown[];
  txs?: unknown[];
  txTotal?: number;
  rewards?: unknown;
  unbonding?: unknown;
  escrows?: { buyer?: unknown[]; seller?: unknown[] };
  tasks?: { delegated?: unknown[]; assigned?: unknown[] };
} = {}) {
  const {
    balances = [makeBalance("uclaw", "10000000")],
    delegations = [],
    txs = [],
    txTotal = 0,
  } = opts;

  mockGetBalances.mockResolvedValue(balances);
  mockGetDelegations.mockResolvedValue(delegations);
  mockGetTxPageByAddress.mockResolvedValue({ txs, total: txTotal });
  mockFetchResponses(opts);
}

function lookupAddress(addr: string = TEST_ADDR) {
  const input = screen.getByPlaceholderText(
    "Enter your claw... address to view portfolio",
  );
  fireEvent.change(input, { target: { value: addr } });
  fireEvent.submit(input.closest("form")!);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    setupMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Renders page title and subtitle
  it("renders page title and subtitle", () => {
    renderPortfolio();

    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(
      screen.getByText(/Consolidated view of all your holdings/),
    ).toBeInTheDocument();
  });

  // 2. Shows address lookup form
  it("shows address lookup form with input and Lookup button", () => {
    renderPortfolio();

    expect(
      screen.getByPlaceholderText("Enter your claw... address to view portfolio"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lookup" }),
    ).toBeInTheDocument();
  });

  // 3. Shows prompt when no address entered
  it("shows prompt when no address is entered", () => {
    renderPortfolio();

    expect(screen.getByText("View Your Portfolio")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter your address above/),
    ).toBeInTheDocument();
  });

  // 4. Shows loading state while fetching
  it("shows loading state after address lookup", async () => {
    // Make all data fetches never resolve to keep the loading spinner visible
    mockGetBalances.mockReturnValue(new Promise(() => {}));
    mockGetDelegations.mockReturnValue(new Promise(() => {}));
    mockGetTxPageByAddress.mockReturnValue(new Promise(() => {}));
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("Loading portfolio...")).toBeInTheDocument();
    });
  });

  // 5. Shows summary cards after data loads
  it("renders summary cards after data loads", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "50000000")],
      delegations: [makeDelegation({ amount: "20000000" })],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("Total Portfolio Value")).toBeInTheDocument();
    });

    expect(screen.getByText("Available Balance")).toBeInTheDocument();
    expect(screen.getByText("Staked + Rewards")).toBeInTheDocument();
    expect(screen.getByText("Escrowed")).toBeInTheDocument();
    // "Unbonding" appears in both summary cards and the holdings table
    expect(screen.getAllByText("Unbonding").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pending Task Earnings")).toBeInTheDocument();
  });

  // 6. All five tabs render
  it("renders all five tab buttons", async () => {
    setupMocks();

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("Holdings")).toBeInTheDocument();
    });

    expect(screen.getByText(/Staking/)).toBeInTheDocument();
    expect(screen.getByText(/Escrows/)).toBeInTheDocument();
    expect(screen.getByText(/Tasks/)).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  // 7. Holdings tab shows CLAW Tokens table
  it("holdings tab shows CLAW Tokens table with categories", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("CLAW Tokens")).toBeInTheDocument();
    });

    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Staked")).toBeInTheDocument();
    expect(screen.getByText("Pending Rewards")).toBeInTheDocument();
    expect(screen.getByText("In Escrow")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  // 8. Tab switching works
  it("switches between tabs correctly", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
    });

    renderPortfolio();
    lookupAddress();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText("Holdings")).toBeInTheDocument();
    });

    // Default: Holdings tab shows CLAW Tokens
    expect(screen.getByText("CLAW Tokens")).toBeInTheDocument();

    // Switch to Staking
    fireEvent.click(screen.getByText(/Staking/));
    await waitFor(() => {
      expect(screen.getByText("Total Staked")).toBeInTheDocument();
    });

    // Switch to History
    fireEvent.click(screen.getByText("History"));
    await waitFor(() => {
      expect(screen.getByText("Recent Transactions")).toBeInTheDocument();
    });
  });

  // 9. Staking tab shows delegation details
  it("staking tab shows delegation stats and table", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
      delegations: [
        makeDelegation({
          validatorAddress: "clawvaloper1val1",
          amount: "5000000",
        }),
        makeDelegation({
          validatorAddress: "clawvaloper1val2",
          amount: "3000000",
        }),
      ],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText(/Staking/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Staking/));

    await waitFor(() => {
      expect(screen.getByText("Total Staked")).toBeInTheDocument();
    });

    // "Pending Rewards" and "Unbonding" appear in both summary cards and staking stat cards
    expect(screen.getAllByText("Pending Rewards").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Validators")).toBeInTheDocument();

    // Table headers
    expect(screen.getByText("Validator")).toBeInTheDocument();
    expect(screen.getByText("% of Stake")).toBeInTheDocument();
  });

  // 10. Staking tab shows empty state with link
  it("staking tab shows empty state when no delegations", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
      delegations: [],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText(/Staking/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Staking/));

    await waitFor(() => {
      expect(screen.getByText(/No active delegations/)).toBeInTheDocument();
    });

    expect(screen.getByText("Stake now")).toBeInTheDocument();
  });

  // 11. Escrows tab shows escrow stats and empty state
  it("escrows tab shows stats and empty state when no escrows", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText(/Escrows/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Escrows/));

    await waitFor(() => {
      expect(screen.getByText("Total Escrows")).toBeInTheDocument();
    });

    expect(screen.getByText("Active Value Locked")).toBeInTheDocument();
    expect(screen.getByText("As Buyer")).toBeInTheDocument();
    expect(screen.getByText("As Seller")).toBeInTheDocument();
    expect(screen.getByText(/No escrows found/)).toBeInTheDocument();
    expect(screen.getByText("View escrow marketplace")).toBeInTheDocument();
  });

  // 12. Tasks tab shows task stats and empty state
  it("tasks tab shows stats and empty state when no tasks", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText(/Tasks/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Tasks/));

    await waitFor(() => {
      expect(screen.getByText("Total Tasks")).toBeInTheDocument();
    });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Delegated by You")).toBeInTheDocument();
    expect(screen.getByText("Assigned to You")).toBeInTheDocument();
    expect(screen.getByText(/No tasks found/)).toBeInTheDocument();
    expect(screen.getByText("View task board")).toBeInTheDocument();
  });

  // 13. History tab shows transactions table
  it("history tab renders transaction table when data is available", async () => {
    const txs = [
      makeTx({ hash: "TX_HASH_01_LONG_ENOUGH_FOR_SHORT_HASH_01234567890", height: "999" }),
    ];
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
      txs,
      txTotal: 1,
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("History"));

    await waitFor(() => {
      expect(screen.getByText("Recent Transactions")).toBeInTheDocument();
    });

    expect(screen.getByText(/1 total/)).toBeInTheDocument();
    expect(screen.getByText("Tx Hash")).toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Height")).toBeInTheDocument();
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  // 14. History tab shows empty state
  it("history tab shows empty state when no transactions", async () => {
    setupMocks({
      balances: [makeBalance("uclaw", "10000000")],
      txs: [],
      txTotal: 0,
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("History"));

    await waitFor(() => {
      expect(screen.getByText("No transactions found.")).toBeInTheDocument();
    });
  });

  // 15. Holdings tab shows IBC tokens when present
  it("holdings tab shows IBC tokens section when IBC balances exist", async () => {
    setupMocks({
      balances: [
        makeBalance("uclaw", "10000000"),
        makeBalance("ibc/ABC123DEF456GHI789JKL012", "5000000"),
      ],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("IBC Tokens")).toBeInTheDocument();
    });
  });

  // 16. Holdings tab shows Other Tokens when LP tokens present
  it("holdings tab shows Other Tokens section for non-IBC non-uclaw tokens", async () => {
    setupMocks({
      balances: [
        makeBalance("uclaw", "10000000"),
        makeBalance("factory/claw1pool/lp-token", "2000000"),
      ],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(screen.getByText("Other Tokens")).toBeInTheDocument();
    });
  });

  // 17. Shows error state when data fetch fails
  it("shows error message when data fetch fails", async () => {
    mockGetBalances.mockRejectedValue(new Error("network error"));

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load portfolio data. Is the chain running?"),
      ).toBeInTheDocument();
    });
  });

  // 18. Shows no token balances message when empty
  it("holdings tab shows empty message when no balances", async () => {
    setupMocks({
      balances: [],
    });

    renderPortfolio();
    lookupAddress();

    await waitFor(() => {
      expect(
        screen.getByText("No token balances found for this address."),
      ).toBeInTheDocument();
    });
  });
});
