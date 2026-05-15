import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProviderOnboarding from "../ProviderOnboarding";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetBalances = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getBalances: (...args: unknown[]) => mockGetBalances(...args),
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

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
  disconnectWallet: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderPage() {
  return render(
    <MemoryRouter>
      <ProviderOnboarding />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("ProviderOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBalances.mockResolvedValue([{ denom: "uclaw", amount: "5000000" }]);
  });

  // 1. Renders all 5 step titles
  it("renders all 5 step titles in the step indicator", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /Welcome/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Identity/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Registration/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Configuration/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Activate/ })).toBeInTheDocument();
  });

  // 2. Welcome step is shown by default
  it("shows welcome step content by default", () => {
    renderPage();

    expect(
      screen.getByText("Welcome to ClawChain Provider Network"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mining")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("GPU Compute")).toBeInTheDocument();
    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get Started" })).toBeInTheDocument();
  });

  // 3. Can navigate forward from Welcome to Identity
  it("navigates from Welcome to Identity step on Get Started click", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() => {
      expect(screen.getByText("Verify Your Identity")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("claw1...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check Balance" })).toBeInTheDocument();
  });

  // 4. Shows wallet address input and balance in step 2
  it("shows wallet balance after entering address and checking", async () => {
    renderPage();
    const user = userEvent.setup();

    // Navigate to Identity step
    await user.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("claw1...")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("claw1...");
    await user.type(input, "claw1testaddr000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Check Balance" }));

    await waitFor(() => {
      expect(screen.getByText("CLAW Balance")).toBeInTheDocument();
    });

    expect(screen.getByText("5 CLAW")).toBeInTheDocument();
  });

  // 5. Can navigate between steps using Back button
  it("navigates back from Identity to Welcome using Back button", async () => {
    renderPage();
    const user = userEvent.setup();

    // Go to step 2
    await user.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() => {
      expect(screen.getByText("Verify Your Identity")).toBeInTheDocument();
    });

    // Go back
    await user.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => {
      expect(
        screen.getByText("Welcome to ClawChain Provider Network"),
      ).toBeInTheDocument();
    });
  });

  // 6. Can navigate to Registration step (step 3)
  it("shows Registration step with agent form fields", async () => {
    renderPage();
    const user = userEvent.setup();

    // Click directly on the Registration step button
    await user.click(screen.getByRole("button", { name: /Registration/ }));

    await waitFor(() => {
      expect(screen.getByText("Register Your Agent")).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("My GPU Provider")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://my-provider.example.com:8080"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Register Agent" }),
    ).toBeInTheDocument();
  });

  // 7. Can navigate to Configuration step (step 4)
  it("shows Configuration step with profitability controls", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Configuration/ }));

    await waitFor(() => {
      expect(
        screen.getByText("Configure Profitability Controls"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Configuration Summary")).toBeInTheDocument();
    expect(screen.getByText("Min Budget")).toBeInTheDocument();
    expect(screen.getByText("Max Tasks")).toBeInTheDocument();
  });

  // 8. Displays completion message and dashboard link in step 5
  it("shows activation panel and dashboard link after activating", async () => {
    renderPage();
    const user = userEvent.setup();

    // Navigate to Activate step
    await user.click(screen.getByRole("button", { name: /Activate/ }));

    await waitFor(() => {
      expect(screen.getByText("Activate Your Provider")).toBeInTheDocument();
    });

    // Click Activate Provider
    await user.click(screen.getByRole("button", { name: "Activate Provider" }));

    await waitFor(() => {
      expect(screen.getByText("Provider Active")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Your provider is now live on the ClawChain network/),
    ).toBeInTheDocument();

    const dashboardLink = screen.getByText("Go to Provider Dashboard");
    expect(dashboardLink.closest("a")).toHaveAttribute("href", "/provider");
  });

  // 9. Shows balance error when fetch fails
  it("shows error when balance fetch fails", async () => {
    mockGetBalances.mockRejectedValue(new Error("Connection refused"));

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Get Started" }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("claw1...")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("claw1...");
    await user.type(input, "claw1testaddr000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Check Balance" }));

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch balance. Is the chain running?"),
      ).toBeInTheDocument();
    });
  });

  // 10. Page title and subtitle render
  it("renders page title and subtitle", () => {
    renderPage();

    expect(screen.getByText("Provider Onboarding")).toBeInTheDocument();
    expect(
      screen.getByText(/Set up your provider node in 5 simple steps/),
    ).toBeInTheDocument();
  });
});
