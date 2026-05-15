import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Messaging from "../Messaging";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetMessages = vi.fn();
const mockGetConversation = vi.fn();

vi.mock("../../lib/chain.ts", () => ({
  getMessages: (...args: unknown[]) => mockGetMessages(...args),
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

const mockConnectKeplr = vi.fn();

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => true),
  connectKeplr: (...args: unknown[]) => mockConnectKeplr(...args),
  signAndBroadcast: vi.fn().mockResolvedValue({ code: 0, txHash: "ABC123" }),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const MY_ADDR = "claw1myaddress1234567890abcdefghijklmnop";
const PEER_A = "claw1peeraddressAAAA1234567890abcdefghijklmnop";
const PEER_B = "claw1peeraddressBBBB1234567890abcdefghijklmnop";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    sender: MY_ADDR,
    recipient: PEER_A,
    ciphertext: "Hello there",
    nonce: "abc-123-def-456",
    blockHeight: 100,
    timestamp: Math.floor(Date.now() / 1000),
    acknowledged: false,
    ...overrides,
  };
}

const walletState = {
  connected: true,
  address: MY_ADDR,
  balance: "1000000",
  name: "TestWallet",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderMessaging() {
  return render(
    <MemoryRouter>
      <Messaging />
    </MemoryRouter>,
  );
}

function setupConnectedWithMessages(msgs = [makeMessage()]) {
  mockConnectKeplr.mockResolvedValue(walletState);
  mockGetMessages.mockResolvedValue(msgs);
  mockGetConversation.mockResolvedValue([]);
}

async function connectWallet() {
  const user = userEvent.setup();
  const btn = screen.getByText("Connect Keplr");
  await user.click(btn);
  await waitFor(() => {
    expect(screen.getByTestId("messaging-layout")).toBeInTheDocument();
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Messaging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub crypto.randomUUID for tests
    if (!globalThis.crypto) {
      (globalThis as any).crypto = {};
    }
    (globalThis.crypto as any).randomUUID = () => "test-uuid-1234";
  });

  // 1. Shows connect wallet prompt when not connected
  it("shows connect wallet prompt when not connected", () => {
    mockGetMessages.mockResolvedValue([]);
    renderMessaging();

    expect(screen.getByTestId("connect-prompt")).toBeInTheDocument();
    expect(screen.getByText("Connect Keplr")).toBeInTheDocument();
  });

  // 2. Renders sidebar with conversation list after connecting
  it("renders sidebar with conversation list after connecting", async () => {
    setupConnectedWithMessages([
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Hey" }),
      makeMessage({ id: "2", sender: MY_ADDR, recipient: PEER_B, ciphertext: "Sup" }),
    ]);
    renderMessaging();
    await connectWallet();

    await waitFor(() => {
      expect(screen.getByTestId("msg-sidebar")).toBeInTheDocument();
      expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
    });

    // Should have conversation items
    await waitFor(() => {
      const items = screen.getAllByTestId("conversation-item");
      expect(items.length).toBe(2);
    });
  });

  // 3. Shows chat view when conversation selected
  it("shows chat view when conversation selected", async () => {
    const msgs = [
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Hey buddy" }),
      makeMessage({ id: "2", sender: MY_ADDR, recipient: PEER_A, ciphertext: "Hello!" }),
    ];
    setupConnectedWithMessages(msgs);
    mockGetConversation.mockResolvedValue(msgs);
    renderMessaging();
    await connectWallet();

    await waitFor(() => {
      expect(screen.getAllByTestId("conversation-item").length).toBe(1);
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("conversation-item"));

    await waitFor(() => {
      expect(screen.getByTestId("chat-header")).toBeInTheDocument();
      expect(screen.getByTestId("message-list")).toBeInTheDocument();
    });
  });

  // 4. Compose area has textarea and send button
  it("compose area has textarea and send button", async () => {
    const msgs = [
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Hello" }),
    ];
    setupConnectedWithMessages(msgs);
    mockGetConversation.mockResolvedValue(msgs);
    renderMessaging();
    await connectWallet();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-item")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("conversation-item"));

    await waitFor(() => {
      expect(screen.getByTestId("compose-area")).toBeInTheDocument();
      expect(screen.getByTestId("compose-textarea")).toBeInTheDocument();
      expect(screen.getByTestId("send-btn")).toBeInTheDocument();
    });
  });

  // 5. New message button exists
  it("new message button exists", async () => {
    setupConnectedWithMessages([]);
    renderMessaging();
    await connectWallet();

    expect(screen.getByTestId("new-message-btn")).toBeInTheDocument();
    expect(screen.getByTestId("new-message-btn")).toHaveTextContent("+ New Message");
  });

  // 6. Empty state when no conversations
  it("shows empty state when no conversations", async () => {
    setupConnectedWithMessages([]);
    renderMessaging();
    await connectWallet();

    await waitFor(() => {
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    expect(screen.getByText("Send your first message!")).toBeInTheDocument();
  });

  // 7. Encryption badge shown in chat header
  it("shows encryption badge in chat header", async () => {
    const msgs = [
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Secret" }),
    ];
    setupConnectedWithMessages(msgs);
    mockGetConversation.mockResolvedValue(msgs);
    renderMessaging();
    await connectWallet();

    await waitFor(() => {
      expect(screen.getByTestId("conversation-item")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("conversation-item"));

    await waitFor(() => {
      expect(screen.getByTestId("encryption-indicator")).toBeInTheDocument();
    });
  });

  // 8. New message modal opens on button click
  it("opens new message modal when New Message is clicked", async () => {
    setupConnectedWithMessages([]);
    renderMessaging();
    await connectWallet();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("new-message-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("new-message-modal")).toBeInTheDocument();
      expect(screen.getByTestId("new-msg-recipient")).toBeInTheDocument();
      expect(screen.getByTestId("new-msg-content")).toBeInTheDocument();
      expect(screen.getByTestId("new-msg-send-btn")).toBeInTheDocument();
    });
  });

  // 9. Search contacts filters conversation list
  it("search contacts filters conversation list", async () => {
    setupConnectedWithMessages([
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Hey" }),
      makeMessage({ id: "2", sender: MY_ADDR, recipient: PEER_B, ciphertext: "Sup" }),
    ]);
    renderMessaging();
    await connectWallet();

    await waitFor(() => {
      expect(screen.getAllByTestId("conversation-item").length).toBe(2);
    });

    const user = userEvent.setup();
    await user.type(screen.getByTestId("search-contacts"), "AAAA");

    await waitFor(() => {
      expect(screen.getAllByTestId("conversation-item").length).toBe(1);
    });
  });

  // 10. Select conversation placeholder shown when none selected
  it("shows placeholder when no conversation is selected", async () => {
    setupConnectedWithMessages([
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Hey" }),
    ]);
    renderMessaging();
    await connectWallet();

    await waitFor(() => {
      expect(screen.getByTestId("no-conversation")).toBeInTheDocument();
    });

    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
  });

  // 11. Encryption toggle in compose area
  it("encryption toggle exists in compose area", async () => {
    const msgs = [
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Hello" }),
    ];
    setupConnectedWithMessages(msgs);
    mockGetConversation.mockResolvedValue(msgs);
    renderMessaging();
    await connectWallet();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("conversation-item"));

    await waitFor(() => {
      expect(screen.getByTestId("encryption-toggle")).toBeInTheDocument();
    });
  });

  // 12. Character count displayed
  it("shows character count in compose area", async () => {
    const msgs = [
      makeMessage({ id: "1", sender: PEER_A, recipient: MY_ADDR, ciphertext: "Hello" }),
    ];
    setupConnectedWithMessages(msgs);
    mockGetConversation.mockResolvedValue(msgs);
    renderMessaging();
    await connectWallet();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("conversation-item"));

    await waitFor(() => {
      expect(screen.getByTestId("char-count")).toBeInTheDocument();
      expect(screen.getByTestId("char-count")).toHaveTextContent("0");
    });
  });
});
