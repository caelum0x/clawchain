import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Privacy from "../Privacy";

// Mock chain module
vi.mock("../../lib/chain", () => ({
  getTreeStats: vi.fn().mockResolvedValue({
    leafCount: "42",
    root: "ab12cd34ef56789000112233445566778899aabbccddeeff0011223344556677",
    depth: "32",
  }),
  getRootHistory: vi.fn().mockResolvedValue({
    roots: [
      "ab12cd34ef56789000112233445566778899aabbccddeeff0011223344556677",
      "1122334455667788990011223344556677889900aabbccddeeff001122334455",
    ],
    heights: ["1000", "999"],
  }),
  getViewKey: vi.fn().mockResolvedValue(null),
  getNullifierExists: vi.fn().mockResolvedValue(false),
  getCommitmentIndex: vi.fn().mockResolvedValue({ index: 0, found: false }),
  getMerkleProof: vi.fn().mockResolvedValue({ siblings: [], pathIndices: [] }),
  formatClaw: vi.fn((v: string) => `${Number(v) / 1_000_000} CLAW`),
}));

vi.mock("../../lib/config", () => ({
  chainConfig: {
    chainId: "clawchain-testnet-1",
    chainName: "ClawChain Testnet",
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

vi.mock("../../lib/wallet", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
  disconnectWallet: vi.fn(() => ({ connected: false, address: "", balance: "0", name: "" })),
  generateBlinding: vi.fn(() => "aabbccdd00112233445566778899aabbccddeeff00112233445566778899aabb"),
}));

function renderPrivacy() {
  return render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>,
  );
}

describe("Privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all tab buttons", () => {
    renderPrivacy();

    expect(screen.getByRole("button", { name: "Shield" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unshield" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Private Transfer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tree Stats" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify Proof" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Keys" })).toBeInTheDocument();
  });

  it("shows shield tab by default with proof generation button", () => {
    renderPrivacy();

    expect(screen.getByText("Shield Tokens")).toBeInTheDocument();
    expect(screen.getByText(/Move CLAW from your public balance/)).toBeInTheDocument();
    // Keplr not available so connect buttons are shown (wallet bar + in-tab prompt)
    const keplrButtons = screen.getAllByRole("button", { name: "Keplr Not Found" });
    expect(keplrButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows privacy warning in unshield tab", async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole("button", { name: "Unshield" }));

    expect(screen.getByTestId("privacy-warning")).toBeInTheDocument();
    expect(screen.getByText(/This will reveal the unshielded amount on-chain/)).toBeInTheDocument();
  });

  it("shows private transfer tab with commitment-based info", async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole("button", { name: "Private Transfer" }));

    // The h3 heading and tab button both have "Private Transfer" text
    expect(screen.getAllByText("Private Transfer").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/commitment-based addressing/)).toBeInTheDocument();
  });

  it("shows tree stats tab with merkle root", async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole("button", { name: "Tree Stats" }));

    await waitFor(() => {
      expect(screen.getByTestId("merkle-root")).toBeInTheDocument();
    });

    // Check leaf count is displayed
    expect(screen.getByText("42")).toBeInTheDocument();

    // Check tree visualization renders
    await waitFor(() => {
      expect(screen.getByTestId("tree-viz")).toBeInTheDocument();
    });
  });

  it("shows tree depth as 32", async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole("button", { name: "Tree Stats" }));

    await waitFor(() => {
      expect(screen.getByText("32")).toBeInTheDocument();
    });
  });

  it("shows verify proof tab with textarea", async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole("button", { name: "Verify Proof" }));

    // Both the tab button and h3 contain "Verify Proof"
    expect(screen.getAllByText("Verify Proof").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Paste a ZK proof JSON/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/hex-encoded-proof-data/)).toBeInTheDocument();
  });

  it("shows view keys tab with explanation", async () => {
    const user = userEvent.setup();
    renderPrivacy();

    await user.click(screen.getByRole("button", { name: "View Keys" }));

    expect(screen.getByText(/What are view keys/)).toBeInTheDocument();
    expect(screen.getByText(/selective disclosure/)).toBeInTheDocument();
  });

  it("shows page title and subtitle", () => {
    renderPrivacy();

    expect(screen.getByText("Privacy Pool")).toBeInTheDocument();
    expect(screen.getByText(/Shield and unshield CLAW tokens/)).toBeInTheDocument();
  });

  it("renders wallet connect bar", () => {
    renderPrivacy();

    expect(screen.getByTestId("wallet-bar")).toBeInTheDocument();
  });

  it("does not show tx status banner initially", () => {
    renderPrivacy();

    expect(screen.queryByTestId("tx-status-banner")).not.toBeInTheDocument();
  });
});
