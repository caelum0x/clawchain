import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WalletConnectButton from "../WalletConnectButton";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetWalletConnect = vi.fn();
const mockGetActiveSessions = vi.fn();
const mockGetConnectedAddress = vi.fn();
const mockIsConnected = vi.fn();
const mockDisconnectAll = vi.fn();

vi.mock("../../lib/walletconnect.ts", () => ({
  getWalletConnect: (...a: unknown[]) => mockGetWalletConnect(...a),
  getActiveSessions: () => mockGetActiveSessions(),
  getConnectedAddress: () => mockGetConnectedAddress(),
  isConnected: () => mockIsConnected(),
  disconnectAll: () => mockDisconnectAll(),
}));

vi.mock("../../lib/chain.ts", () => ({
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
  },
}));

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("WalletConnectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(false);
    mockGetConnectedAddress.mockReturnValue(null);
    mockGetActiveSessions.mockReturnValue([]);
  });

  it("shows Connect Wallet button when disconnected", () => {
    render(<WalletConnectButton />);
    expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
  });

  it("shows shortened address when connected", () => {
    mockIsConnected.mockReturnValue(true);
    mockGetConnectedAddress.mockReturnValue(
      "claw1abcdefghij1234567890klmnopqrstuv",
    );
    mockGetActiveSessions.mockReturnValue([]);

    render(<WalletConnectButton />);

    expect(
      screen.getByText("claw1abcde...qrstuv"),
    ).toBeInTheDocument();
  });

  it("shows Disconnect option in dropdown when connected", async () => {
    mockIsConnected.mockReturnValue(true);
    mockGetConnectedAddress.mockReturnValue(
      "claw1abcdefghij1234567890klmnopqrstuv",
    );
    mockGetActiveSessions.mockReturnValue([]);

    render(<WalletConnectButton />);

    const user = userEvent.setup();
    await user.click(screen.getByText("claw1abcde...qrstuv"));

    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("calls disconnectAll when Disconnect clicked", async () => {
    mockIsConnected.mockReturnValue(true);
    mockGetConnectedAddress.mockReturnValue(
      "claw1abcdefghij1234567890klmnopqrstuv",
    );
    mockGetActiveSessions.mockReturnValue([]);
    mockDisconnectAll.mockResolvedValue(undefined);

    render(<WalletConnectButton />);

    const user = userEvent.setup();
    await user.click(screen.getByText("claw1abcde...qrstuv"));
    await user.click(screen.getByText("Disconnect"));

    expect(mockDisconnectAll).toHaveBeenCalledOnce();
  });

  it("shows session info in dropdown", async () => {
    mockIsConnected.mockReturnValue(true);
    mockGetConnectedAddress.mockReturnValue(
      "claw1abcdefghij1234567890klmnopqrstuv",
    );
    mockGetActiveSessions.mockReturnValue([
      {
        topic: "topic-123",
        peerMeta: { name: "Claw Mobile" },
        chainId: "clawchain-1",
      },
    ]);

    render(<WalletConnectButton />);

    const user = userEvent.setup();
    await user.click(screen.getByText("claw1abcde...qrstuv"));

    expect(screen.getByText(/Claw Mobile/)).toBeInTheDocument();
    expect(screen.getByText(/clawchain-1/)).toBeInTheDocument();
  });

  it("shows Connecting... text during connection", async () => {
    // Make getWalletConnect hang
    mockGetWalletConnect.mockReturnValue(new Promise(() => {}));

    render(<WalletConnectButton />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Connect Wallet"));

    await waitFor(() => {
      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });
  });
});
