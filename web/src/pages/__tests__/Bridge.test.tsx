import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Bridge from "../Bridge";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetBalances = vi.fn();
const mockFetch = vi.fn();

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
  disconnectWallet: vi.fn(),
}));

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

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeChannelsResponse(channels: Array<Record<string, unknown>> = []) {
  return {
    channels: channels.length > 0 ? channels : [
      {
        state: "STATE_OPEN",
        ordering: "ORDER_UNORDERED",
        counterparty: { port_id: "transfer", channel_id: "channel-42" },
        connection_hops: ["connection-0"],
        version: "ics20-1",
        port_id: "transfer",
        channel_id: "channel-0",
      },
      {
        state: "STATE_OPEN",
        ordering: "ORDER_UNORDERED",
        counterparty: { port_id: "transfer", channel_id: "channel-99" },
        connection_hops: ["connection-1"],
        version: "ics20-1",
        port_id: "transfer",
        channel_id: "channel-1",
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setupMocks(channelsResp = makeChannelsResponse()) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("ibc/core/channel/v1/channels")) {
      return Promise.resolve({
        ok: true,
        json: async () => channelsResp,
      });
    }
    return Promise.resolve({
      ok: false,
      json: async () => ({}),
    });
  });
  mockGetBalances.mockResolvedValue([]);
}

function renderBridge() {
  return render(
    <MemoryRouter>
      <Bridge />
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    setupMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Shows loading state initially
  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderBridge();

    expect(screen.getByText("Loading IBC channels...")).toBeInTheDocument();
  });

  // 2. Renders page title and subtitle
  it("renders page title and subtitle", async () => {
    renderBridge();

    await waitFor(() => {
      expect(screen.getByText("Cross-Chain Bridge")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Transfer tokens between ClawChain and connected IBC networks/),
    ).toBeInTheDocument();
  });

  // 3. Shows IBC channel cards after loading
  it("shows IBC channel cards after loading", async () => {
    renderBridge();

    await waitFor(() => {
      expect(screen.getAllByText("channel-0").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText("channel-1").length).toBeGreaterThanOrEqual(1);
  });

  // 4. Shows bridge form after loading
  it("shows bridge form with Bridge Tokens heading", async () => {
    renderBridge();

    await waitFor(() => {
      expect(screen.getByTestId("bridge-form")).toBeInTheDocument();
    });

    expect(screen.getByText("Bridge Tokens")).toBeInTheDocument();
  });

  // 5. Shows address input form
  it("shows address input with Load button", async () => {
    renderBridge();

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Enter your claw... address to load balances"),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
  });

  // 6. Shows channel selector in bridge form
  it("shows IBC Channel selector in bridge form", async () => {
    renderBridge();

    await waitFor(() => {
      // "IBC Channel" appears as a label in the form and in the preview section
      expect(screen.getAllByText("IBC Channel").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 7. Shows empty message when no channels
  it("shows empty channels message when no IBC channels found", async () => {
    setupMocks(makeChannelsResponse([]));
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("ibc/core/channel/v1/channels")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ channels: [] }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    renderBridge();

    await waitFor(() => {
      expect(
        screen.getByText(/No IBC transfer channels found/),
      ).toBeInTheDocument();
    });
  });

  // 8. Shows error when fetch fails
  it("shows error message when IBC channels fail to load", async () => {
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    renderBridge();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load IBC channels. Is the chain running?"),
      ).toBeInTheDocument();
    });
  });

  // 9. Shows transfer history section
  it("shows transfer history section after loading", async () => {
    renderBridge();

    await waitFor(() => {
      expect(screen.getByText("Transfer History")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/No bridge transfers in this session/),
    ).toBeInTheDocument();
  });

  // 10. Token field prompts for wallet address
  it("shows prompt to enter wallet address for tokens", async () => {
    renderBridge();

    await waitFor(() => {
      expect(screen.getByText("Enter wallet address to see tokens.")).toBeInTheDocument();
    });
  });

  // 11. Loading balances when wallet address is entered
  it("calls getBalances when wallet address is entered", async () => {
    mockGetBalances.mockResolvedValue([
      { denom: "uclaw", amount: "125000000000" },
    ]);

    renderBridge();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("Enter your claw... address to load balances"),
      "claw1testaddress_long_enough_to_truncate_test000",
    );
    await user.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(mockGetBalances).toHaveBeenCalledWith(
        "claw1testaddress_long_enough_to_truncate_test000",
      );
    });
  });

  // 12. Shows preview section
  it("shows Transfer Preview section", async () => {
    renderBridge();

    await waitFor(() => {
      expect(screen.getByText("Transfer Preview")).toBeInTheDocument();
    });
  });
});
