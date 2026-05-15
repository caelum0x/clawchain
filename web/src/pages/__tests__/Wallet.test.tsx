import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Wallet from "../Wallet";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetBalances = vi.fn();
const mockGetTxPageByAddress = vi.fn();
const mockGetDelegations = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getBalances: (...args: unknown[]) => mockGetBalances(...args),
  getTxPageByAddress: (...args: unknown[]) => mockGetTxPageByAddress(...args),
  getDelegations: (...args: unknown[]) => mockGetDelegations(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
  shortHash: vi.fn((hash: string) =>
    hash.length > 16 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash,
  ),
  timeAgo: vi.fn(() => "5m ago"),
}));

const mockIsKeplrAvailable = vi.fn();
const mockConnectKeplr = vi.fn();
const mockDisconnectWallet = vi.fn();
const mockSignAndBroadcast = vi.fn();

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: (...args: unknown[]) => mockIsKeplrAvailable(...args),
  connectKeplr: (...args: unknown[]) => mockConnectKeplr(...args),
  disconnectWallet: (...args: unknown[]) => mockDisconnectWallet(...args),
  signAndBroadcast: (...args: unknown[]) => mockSignAndBroadcast(...args),
}));

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

const mockAddToast = vi.fn();

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    toasts: [],
    addToast: mockAddToast,
    removeToast: vi.fn(),
    updateToast: vi.fn(),
  }),
}));

const mockSearchContacts = vi.fn().mockReturnValue([]);

vi.mock("../../hooks/useAddressBook", () => ({
  default: () => ({
    contacts: [],
    addContact: vi.fn(),
    removeContact: vi.fn(),
    updateContact: vi.fn(),
    getContact: vi.fn(),
    searchContacts: mockSearchContacts,
  }),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeBalance(denom = "uclaw", amount = "5000000") {
  return { denom, amount };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    hash: "ABCD1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB",
    height: "100",
    code: 0,
    timestamp: "2026-03-07T12:00:00Z",
    gasUsed: "50000",
    gasWanted: "200000",
    memo: "",
    messages: [
      {
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          from_address: "claw1sender_addr_long_enough_to_truncate_test00",
          to_address: "claw1receiver_addr_long_enough_to_truncate_tes00",
          amount: [{ denom: "uclaw", amount: "1000000" }],
        },
      },
    ],
    ...overrides,
  };
}

function makeDelegation(overrides: Record<string, unknown> = {}) {
  return {
    delegatorAddress: "claw1myaddress_long_enough_to_truncate_test000000",
    validatorAddress: "claw1valoper_addr_long_enough_to_truncate_test000",
    shares: "5000000.000000000000000000",
    amount: "5000000",
    denom: "uclaw",
    ...overrides,
  };
}

function makeWalletState() {
  return {
    connected: true,
    address: "claw1myaddress_long_enough_to_truncate_test000000",
    balance: "5000000",
    name: "TestWallet",
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderWallet() {
  return render(
    <MemoryRouter>
      <Wallet />
    </MemoryRouter>,
  );
}

function setupConnectedMock(
  balances = [makeBalance()],
  txs = [makeTx()],
  delegations = [makeDelegation()],
) {
  mockIsKeplrAvailable.mockReturnValue(true);
  mockConnectKeplr.mockResolvedValue(makeWalletState());
  mockGetBalances.mockResolvedValue(balances);
  mockGetTxPageByAddress.mockResolvedValue({ txs, total: txs.length });
  mockGetDelegations.mockResolvedValue(delegations);
  mockDisconnectWallet.mockReturnValue({
    connected: false,
    address: "",
    balance: "0",
    name: "",
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Wallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKeplrAvailable.mockReturnValue(true);
  });

  // 1. Shows connect prompt when wallet is not connected
  it("shows connect prompt when wallet is not connected", () => {
    mockIsKeplrAvailable.mockReturnValue(true);
    renderWallet();

    expect(screen.getByText("Wallet")).toBeInTheDocument();
    expect(
      screen.getByText(/Connect your Keplr wallet to manage CLAW tokens/),
    ).toBeInTheDocument();
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Keplr" }),
    ).toBeInTheDocument();
  });

  // 2. Shows "Keplr Extension Not Found" when keplr is not available
  it("shows keplr not found message when extension is missing", () => {
    mockIsKeplrAvailable.mockReturnValue(false);
    renderWallet();

    expect(
      screen.getByRole("button", { name: "Keplr Extension Not Found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keplr Extension Not Found" }),
    ).toBeDisabled();
    expect(screen.getByText(/Keplr extension/)).toBeInTheDocument();
  });

  // 3. Shows balances after connecting
  it("shows balances after connecting wallet", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByText("Available Balance")).toBeInTheDocument();
    });

    // "5 CLAW" appears in multiple cards (Available Balance, Staked, and balance table)
    const clawTexts = screen.getAllByText("5 CLAW");
    expect(clawTexts.length).toBeGreaterThanOrEqual(2);

    expect(screen.getByText("Staked")).toBeInTheDocument();
    expect(screen.getByText("Total Assets")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText(/TestWallet/)).toBeInTheDocument();
  });

  // 4. Shows tab navigation after connecting
  it("renders tab navigation after connecting", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Staking" })).toBeInTheDocument();
  });

  // 5. Shows recent transactions on overview tab
  it("shows recent transactions on overview tab", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByText("Token Balances")).toBeInTheDocument();
    });

    expect(screen.getByText("Recent Transactions")).toBeInTheDocument();
    expect(screen.getByText("View All Transactions")).toBeInTheDocument();
  });

  // 6. Shows empty state when no transactions
  it("shows empty state when no transactions", async () => {
    setupConnectedMock([makeBalance()], [], []);
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    });
  });

  // 7. Send tab shows form with recipient, amount, and memo fields
  it("shows send form when send tab is clicked", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Send CLAW")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("claw1...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("10.0")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Optional memo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send Tokens" }),
    ).toBeInTheDocument();
  });

  // 8. Address book picker button is present in send tab
  it("shows address book picker button in send tab", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText("Send CLAW")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Address Book" }),
    ).toBeInTheDocument();
  });

  // 9. History tab shows transaction list with filters
  it("shows history tab with filters", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "History" }));

    await waitFor(() => {
      expect(screen.getByText("Transaction History")).toBeInTheDocument();
    });

    expect(screen.getByText("Export CSV")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter by memo...")).toBeInTheDocument();
  });

  // 10. Staking tab shows delegations
  it("shows delegations on staking tab", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Staking" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Staking" }));

    await waitFor(() => {
      expect(screen.getByText("Delegations")).toBeInTheDocument();
    });

    expect(screen.getByText(/Total staked/)).toBeInTheDocument();
  });

  // 11. Shows "No active delegations" when there are none
  it("shows empty delegations message on staking tab", async () => {
    setupConnectedMock([makeBalance()], [makeTx()], []);
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Staking" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Staking" }));

    await waitFor(() => {
      expect(screen.getByText("No active delegations.")).toBeInTheDocument();
    });
  });

  // 12. Disconnect clears wallet state
  it("returns to connect prompt after disconnect", async () => {
    setupConnectedMock();
    renderWallet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Connect Keplr" }));

    await waitFor(() => {
      expect(screen.getByText(/TestWallet/)).toBeInTheDocument();
    });

    await user.click(screen.getByText("Disconnect"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Connect Keplr" }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });
});
