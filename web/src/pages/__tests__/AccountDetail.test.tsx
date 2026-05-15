import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AccountDetail from "../AccountDetail";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetBalances = vi.fn();
const mockGetAccount = vi.fn();
const mockGetDelegations = vi.fn();
const mockGetTxsBySender = vi.fn();
const mockGetAgentInfo = vi.fn();
const mockGetReputation = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getBalances: (...args: unknown[]) => mockGetBalances(...args),
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
  getDelegations: (...args: unknown[]) => mockGetDelegations(...args),
  getTxsBySender: (...args: unknown[]) => mockGetTxsBySender(...args),
  getAgentInfo: (...args: unknown[]) => mockGetAgentInfo(...args),
  getReputation: (...args: unknown[]) => mockGetReputation(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortHash: vi.fn((h: string) =>
    h.length > 16 ? `${h.slice(0, 8)}...${h.slice(-8)}` : h,
  ),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

vi.mock("../../lib/decodeTxMessage.ts", () => ({
  txTypeCategory: vi.fn((typeUrl: string) => {
    if (typeUrl.endsWith("MsgSend")) return "Transfers";
    if (typeUrl.endsWith("MsgDelegate")) return "Staking";
    return "Other";
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

const SAMPLE_ADDRESS = "claw1abc123def456ghi789jkl012mno345pqr678stu";

function makeBalances(overrides: { denom: string; amount: string }[] = []) {
  return overrides.length > 0
    ? overrides
    : [{ denom: "uclaw", amount: "5000000" }];
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    accountNumber: "42",
    sequence: "7",
    ...overrides,
  };
}

function makeDelegation(overrides: Record<string, unknown> = {}) {
  return {
    delegatorAddress: SAMPLE_ADDRESS,
    validatorAddress: "clawvaloper1val_addr_long_enough_to_truncate_here",
    shares: "1000000",
    amount: "1000000",
    denom: "uclaw",
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    hash: "AABB1122AABB1122AABB1122AABB1122AABB1122AABB1122AABB1122AABB1122",
    height: "500",
    code: 0,
    gasUsed: "70000",
    gasWanted: "100000",
    memo: "",
    messages: [
      { typeUrl: "/cosmos.bank.v1beta1.MsgSend" },
    ],
    ...overrides,
  };
}

function makeAgent(overrides: Record<string, unknown> = {}) {
  return {
    address: SAMPLE_ADDRESS,
    name: "TestAgent",
    endpoint: "https://agent.example.com/api",
    active: true,
    pubkey: "",
    supportedTools: ["text-generation", "code-review"],
    ...overrides,
  };
}

function makeReputation(overrides: Record<string, unknown> = {}) {
  return {
    agentAddress: SAMPLE_ADDRESS,
    totalRatings: "10",
    ratingSum: "8500",
    avgRatingBps: "8500",
    endorsementCount: "3",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderAccountDetail(address = SAMPLE_ADDRESS) {
  return render(
    <MemoryRouter initialEntries={[`/explorer/account/${address}`]}>
      <Routes>
        <Route path="/explorer/account/:address" element={<AccountDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Set up all mocks for a successful account load. */
function setupAccountMocks(opts: {
  balances?: { denom: string; amount: string }[];
  account?: Record<string, unknown> | null;
  delegations?: Record<string, unknown>[];
  txs?: Record<string, unknown>[];
  agent?: Record<string, unknown> | null;
  reputation?: Record<string, unknown> | null;
} = {}) {
  mockGetBalances.mockResolvedValue(opts.balances ?? makeBalances());
  mockGetAccount.mockResolvedValue(opts.account !== undefined ? opts.account : makeAccount());
  mockGetDelegations.mockResolvedValue(opts.delegations ?? []);
  mockGetTxsBySender.mockResolvedValue(opts.txs ?? []);
  mockGetAgentInfo.mockResolvedValue(opts.agent !== undefined ? opts.agent : null);
  mockGetReputation.mockResolvedValue(opts.reputation !== undefined ? opts.reputation : null);
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("AccountDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockGetBalances.mockReturnValue(new Promise(() => {}));
    mockGetAccount.mockReturnValue(new Promise(() => {}));
    mockGetDelegations.mockReturnValue(new Promise(() => {}));
    mockGetTxsBySender.mockReturnValue(new Promise(() => {}));
    mockGetAgentInfo.mockReturnValue(new Promise(() => {}));
    mockGetReputation.mockReturnValue(new Promise(() => {}));

    renderAccountDetail();

    expect(screen.getByText("Loading account...")).toBeInTheDocument();
  });

  // 2. Displays account address
  it("displays the account address", async () => {
    setupAccountMocks();

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText(SAMPLE_ADDRESS)).toBeInTheDocument();
    });
  });

  // 3. Displays CLAW balance
  it("displays CLAW balance", async () => {
    setupAccountMocks({ balances: [{ denom: "uclaw", amount: "10000000" }] });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("10 CLAW")).toBeInTheDocument();
    });
  });

  // 4. Displays account number and sequence
  it("displays account number and sequence", async () => {
    setupAccountMocks({ account: { accountNumber: "42", sequence: "7" } });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  // 5. Shows "None" when no agent is registered
  it("shows None when no agent is registered", async () => {
    setupAccountMocks({ agent: null });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("None")).toBeInTheDocument();
    });
  });

  // 6. Shows delegations table when delegations exist
  it("renders delegations table when delegations exist", async () => {
    setupAccountMocks({ delegations: [makeDelegation()] });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("Delegations (1)")).toBeInTheDocument();
    });

    // Table headers
    expect(screen.getByText("Validator")).toBeInTheDocument();
    expect(screen.getByText("Shares")).toBeInTheDocument();
  });

  // 7. Hides delegations table when no delegations
  it("does not render delegations table when no delegations", async () => {
    setupAccountMocks({ delegations: [] });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("Account")).toBeInTheDocument();
    });

    expect(screen.queryByText(/^Delegations \(/)).not.toBeInTheDocument();
  });

  // 8. Shows recent transactions table
  it("renders recent transactions table when txs exist", async () => {
    setupAccountMocks({ txs: [makeTx(), makeTx({ hash: "CC00CC00CC00CC00CC00CC00CC00CC00CC00CC00CC00CC00CC00CC00CC00CC00", height: "501" })] });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("Recent Transactions (2)")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Success").length).toBe(2);
  });

  // 9. Shows agent profile when agent is registered
  it("renders agent profile when agent exists", async () => {
    setupAccountMocks({ agent: makeAgent() });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("Agent Profile")).toBeInTheDocument();
    });

    expect(screen.getByText("Registered")).toBeInTheDocument();
    expect(screen.getByText("TestAgent")).toBeInTheDocument();
    expect(screen.getByText("https://agent.example.com/api")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("text-generation, code-review")).toBeInTheDocument();
  });

  // 10. Shows reputation card when reputation data exists
  it("renders reputation card when reputation data exists", async () => {
    setupAccountMocks({ reputation: makeReputation() });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("Reputation")).toBeInTheDocument();
    });

    expect(screen.getByText("85.0%")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  // 11. Shows tx type breakdown when txs exist
  it("renders transaction type breakdown", async () => {
    const txs = [
      makeTx({ messages: [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend" }] }),
      makeTx({
        hash: "DD00DD00DD00DD00DD00DD00DD00DD00DD00DD00DD00DD00DD00DD00DD00DD00",
        messages: [{ typeUrl: "/cosmos.staking.v1beta1.MsgDelegate" }],
      }),
    ];
    setupAccountMocks({ txs });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("Transaction Type Breakdown")).toBeInTheDocument();
    });

    expect(screen.getByText("Transfers")).toBeInTheDocument();
    expect(screen.getByText("Staking")).toBeInTheDocument();
  });

  // 12. All balances table shows when more than one denom
  it("renders all balances table when multiple denoms exist", async () => {
    setupAccountMocks({
      balances: [
        { denom: "uclaw", amount: "5000000" },
        { denom: "ibc/ABC123", amount: "2000" },
      ],
    });

    renderAccountDetail();

    await waitFor(() => {
      expect(screen.getByText("All Balances")).toBeInTheDocument();
    });

    expect(screen.getByText("uclaw")).toBeInTheDocument();
    expect(screen.getByText("ibc/ABC123")).toBeInTheDocument();
  });
});
