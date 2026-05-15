import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Faucet from "../Faucet";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockRequestFaucet = vi.fn();
const mockGetBalances = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  requestFaucet: (...args: unknown[]) => mockRequestFaucet(...args),
  getBalances: (...args: unknown[]) => mockGetBalances(...args),
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
}));

const mockIsKeplrAvailable = vi.fn();
const mockConnectKeplr = vi.fn();

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: (...args: unknown[]) => mockIsKeplrAvailable(...args),
  connectKeplr: (...args: unknown[]) => mockConnectKeplr(...args),
  signAndBroadcast: vi.fn(),
}));

const mockAddToast = vi.fn().mockReturnValue("toast-1");
const mockUpdateToast = vi.fn();
const mockRemoveToast = vi.fn();

vi.mock("../../hooks/useToast.tsx", () => ({
  useToast: () => ({
    toasts: [],
    addToast: mockAddToast,
    removeToast: mockRemoveToast,
    updateToast: mockUpdateToast,
  }),
}));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderFaucet() {
  return render(
    <MemoryRouter>
      <Faucet />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Faucet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsKeplrAvailable.mockReturnValue(false);
    mockGetBalances.mockResolvedValue([]);
  });

  it("renders the faucet page title and subtitle", () => {
    renderFaucet();

    expect(screen.getByText("Testnet Faucet")).toBeInTheDocument();
    expect(
      screen.getByText(/Get free CLAW tokens for testing on the ClawChain testnet/),
    ).toBeInTheDocument();
  });

  it("shows the request form with address input and submit button", () => {
    renderFaucet();

    expect(screen.getByText("Request Tokens")).toBeInTheDocument();
    expect(screen.getByText("Wallet Address")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("claw1...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send Me Tokens" }),
    ).toBeInTheDocument();
  });

  it("disables submit button when address is empty", () => {
    renderFaucet();
    const submitBtn = screen.getByRole("button", { name: "Send Me Tokens" });
    expect(submitBtn).toBeDisabled();
  });

  it("enables submit button when address is provided", async () => {
    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1abc123");

    const submitBtn = screen.getByRole("button", { name: "Send Me Tokens" });
    expect(submitBtn).toBeEnabled();
  });

  it("shows error for address that does not start with claw1", async () => {
    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "cosmos1abc");
    await user.click(screen.getByRole("button", { name: "Send Me Tokens" }));

    await waitFor(() => {
      expect(
        screen.getByText("Address must start with 'claw1'"),
      ).toBeInTheDocument();
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Invalid Address",
      }),
    );
  });

  it("calls requestFaucet with valid address", async () => {
    mockRequestFaucet.mockResolvedValue({
      ok: true,
      message: "Sent 10 CLAW to your address!",
      txHash: "TX_HASH_ABC123",
    });

    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1testaddr");
    await user.click(screen.getByRole("button", { name: "Send Me Tokens" }));

    await waitFor(() => {
      expect(mockRequestFaucet).toHaveBeenCalledWith("claw1testaddr");
    });
  });

  it("shows success result after successful faucet request", async () => {
    mockRequestFaucet.mockResolvedValue({
      ok: true,
      message: "Sent 10 CLAW to your address!",
      txHash: "TX_HASH_ABC123",
    });

    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1validaddress");
    await user.click(screen.getByRole("button", { name: "Send Me Tokens" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Sent 10 CLAW to your address!/),
      ).toBeInTheDocument();
    });

    expect(mockUpdateToast).toHaveBeenCalledWith(
      "toast-1",
      expect.objectContaining({
        type: "success",
        title: "Tokens Sent",
      }),
    );

    expect(screen.getByText("View Transaction")).toBeInTheDocument();
  });

  it("shows loading state while requesting tokens", async () => {
    mockRequestFaucet.mockReturnValue(new Promise(() => {}));

    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1validaddress");
    await user.click(screen.getByRole("button", { name: "Send Me Tokens" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Requesting..." }),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Requesting..." })).toBeDisabled();
  });

  it("shows rate limit warning from faucet response", async () => {
    mockRequestFaucet.mockResolvedValue({
      ok: false,
      message: "Rate limit exceeded. Try again in 1 hour.",
    });

    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1validaddress");
    await user.click(screen.getByRole("button", { name: "Send Me Tokens" }));

    await waitFor(() => {
      expect(
        screen.getByText("Rate limit exceeded. Try again in 1 hour."),
      ).toBeInTheDocument();
    });

    expect(mockUpdateToast).toHaveBeenCalledWith(
      "toast-1",
      expect.objectContaining({
        type: "warning",
        title: "Rate Limited",
      }),
    );
  });

  it("shows error message on faucet failure", async () => {
    mockRequestFaucet.mockResolvedValue({
      ok: false,
      message: "Faucet is temporarily unavailable",
    });

    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1validaddress");
    await user.click(screen.getByRole("button", { name: "Send Me Tokens" }));

    await waitFor(() => {
      expect(
        screen.getByText("Faucet is temporarily unavailable"),
      ).toBeInTheDocument();
    });

    expect(mockUpdateToast).toHaveBeenCalledWith(
      "toast-1",
      expect.objectContaining({
        type: "error",
        title: "Faucet Error",
      }),
    );
  });

  it("shows error message on network exception", async () => {
    mockRequestFaucet.mockRejectedValue(new Error("Network error"));

    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1validaddress");
    await user.click(screen.getByRole("button", { name: "Send Me Tokens" }));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    expect(mockUpdateToast).toHaveBeenCalledWith(
      "toast-1",
      expect.objectContaining({
        type: "error",
        title: "Faucet Error",
        message: "Network error",
      }),
    );
  });

  it("shows wallet creation help section", () => {
    renderFaucet();

    expect(screen.getByText("Don't have a wallet?")).toBeInTheDocument();
    expect(screen.getByText("Create one here")).toBeInTheDocument();
    expect(screen.getByText("clawchaind keys add my-wallet")).toBeInTheDocument();
    expect(
      screen.getByText(/Rate limited to 1 request per address per hour/),
    ).toBeInTheDocument();
  });

  it("shows 'Need more tokens?' help card", () => {
    renderFaucet();

    expect(screen.getByText("Need more tokens?")).toBeInTheDocument();
    expect(screen.getByText("clawd faucet request claw1...")).toBeInTheDocument();
  });

  it("shows Keplr button when Keplr is available", () => {
    mockIsKeplrAvailable.mockReturnValue(true);
    renderFaucet();

    expect(screen.getByRole("button", { name: "Use Keplr" })).toBeInTheDocument();
  });

  it("hides Keplr button when Keplr is not available", () => {
    mockIsKeplrAvailable.mockReturnValue(false);
    renderFaucet();

    expect(screen.queryByRole("button", { name: "Use Keplr" })).not.toBeInTheDocument();
  });

  it("autofills address from Keplr", async () => {
    mockIsKeplrAvailable.mockReturnValue(true);
    mockConnectKeplr.mockResolvedValue({
      connected: true,
      address: "claw1keplrwalletaddress12345",
      balance: "5000000",
      name: "TestWallet",
    });

    renderFaucet();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Use Keplr" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("claw1...")).toHaveValue("claw1keplrwalletaddress12345");
    });
  });

  it("shows balance when valid address is entered", async () => {
    mockGetBalances.mockResolvedValue([{ denom: "uclaw", amount: "50000000" }]);

    renderFaucet();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("claw1..."), "claw1validaddresslong1234");

    await waitFor(() => {
      expect(screen.getByText(/Current balance:/)).toBeInTheDocument();
    });
  });
});
