import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import IBC from "../IBC";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
  disconnectWallet: vi.fn(),
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

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    state: "STATE_OPEN",
    ordering: "ORDER_UNORDERED",
    counterparty: { port_id: "transfer", channel_id: "channel-0" },
    connection_hops: ["connection-0"],
    version: "ics20-1",
    port_id: "transfer",
    channel_id: "channel-0",
    ...overrides,
  };
}

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "connection-0",
    client_id: "07-tendermint-0",
    state: "STATE_OPEN",
    counterparty: {
      client_id: "07-tendermint-1",
      connection_id: "connection-0",
      prefix: { key_prefix: "aWJj" },
    },
    delay_period: "0",
    ...overrides,
  };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    client_id: "07-tendermint-0",
    client_state: {
      "@type": "/ibc.lightclients.tendermint.v1.ClientState",
      chain_id: "cosmoshub-4",
      latest_height: { revision_number: "4", revision_height: "12345678" },
    },
    ...overrides,
  };
}

function makeDenomTrace(overrides: Record<string, unknown> = {}) {
  return {
    denom_trace: {
      path: "transfer/channel-0",
      base_denom: "uatom",
      ...overrides,
    },
  };
}

function makeRemoteAgent(overrides: Record<string, unknown> = {}) {
  return {
    address: "cosmos1agent_addr_long_enough_to_truncate_test00",
    name: "RemoteBot",
    source_chain: "cosmoshub-4",
    channel: "channel-0",
    capabilities: ["text-generation", "code-review"],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderIBC() {
  return render(
    <MemoryRouter>
      <IBC />
    </MemoryRouter>,
  );
}

function mockFetchResponses(opts: {
  channels?: unknown[];
  connections?: unknown[];
  clients?: unknown[];
  denomTraces?: unknown[];
  remoteAgents?: unknown[];
  allReject?: boolean;
  txResponses?: unknown[];
} = {}) {
  const {
    channels = [],
    connections = [],
    clients = [],
    denomTraces = [],
    remoteAgents = [],
    allReject = false,
    txResponses = [],
  } = opts;

  mockFetch.mockImplementation((url: string) => {
    if (allReject) {
      return Promise.reject(new Error("Network error"));
    }

    if (typeof url === "string" && url.includes("/ibc/core/channel/v1/channels")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ channels }),
      });
    }
    if (typeof url === "string" && url.includes("/ibc/core/connection/v1/connections")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ connections }),
      });
    }
    if (typeof url === "string" && url.includes("/ibc/core/client/v1/client_states")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ client_states: clients }),
      });
    }
    if (typeof url === "string" && url.includes("/ibc/apps/transfer/v1/denom_traces")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ denom_traces: denomTraces }),
      });
    }
    if (typeof url === "string" && url.includes("/clawchain/agent/v1/remote_agents")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ agents: remoteAgents }),
      });
    }
    if (typeof url === "string" && url.includes("/cosmos/tx/v1beta1/txs")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tx_responses: txResponses }),
      });
    }
    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({}),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("IBC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", mockFetch);
    mockFetchResponses();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // 1. Renders page title and all tab buttons
  it("renders page title and all tab buttons", async () => {
    mockFetchResponses({
      channels: [makeChannel()],
      connections: [makeConnection()],
    });
    renderIBC();

    expect(screen.getByText("IBC Explorer")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clients" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Denom Traces" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remote Agents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeInTheDocument();
  });

  // 2. Shows loading state
  it("shows loading state initially", () => {
    // Make fetch never resolve
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderIBC();

    expect(screen.getByText("Loading IBC data...")).toBeInTheDocument();
  });

  // 3. Overview tab shows connected status with open channels
  it("overview tab shows connected status when channels exist", async () => {
    mockFetchResponses({
      channels: [makeChannel()],
      connections: [makeConnection()],
      clients: [makeClient()],
    });

    renderIBC();

    await waitFor(() => {
      expect(screen.getByText(/IBC Relaying Active/)).toBeInTheDocument();
    });

    expect(screen.getByText("Total Channels")).toBeInTheDocument();
    expect(screen.getByText("Total Connections")).toBeInTheDocument();
    expect(screen.getByText("Light Clients")).toBeInTheDocument();
    // "Denom Traces" appears both as a tab button and as a summary card heading
    expect(screen.getAllByText("Denom Traces").length).toBeGreaterThanOrEqual(2);
  });

  // 4. Overview tab shows disconnected status when no IBC data
  it("overview tab shows disconnected when no IBC activity", async () => {
    mockFetchResponses({
      channels: [],
      connections: [],
      clients: [],
    });

    renderIBC();

    await waitFor(() => {
      expect(screen.getByText(/No IBC Activity Detected/)).toBeInTheDocument();
    });
  });

  // 5. Channels tab shows channel table
  it("channels tab shows channel data in table", async () => {
    const channels = [
      makeChannel({ channel_id: "channel-0", port_id: "transfer" }),
      makeChannel({ channel_id: "channel-1", port_id: "icahost", state: "STATE_INIT" }),
    ];
    mockFetchResponses({ channels, connections: [makeConnection()] });

    renderIBC();

    await waitFor(() => {
      expect(screen.queryByText("Loading IBC data...")).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("Channels"));

    await waitFor(() => {
      // channel-0 appears as both channel_id and counterparty channel_id
      expect(screen.getAllByText("channel-0").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("channel-1")).toBeInTheDocument();
    });

    expect(screen.getByText(/IBC Channels \(2\)/)).toBeInTheDocument();
  });

  // 6. Channels tab shows empty state
  it("channels tab shows empty state when no channels", async () => {
    mockFetchResponses({ channels: [], connections: [] });

    renderIBC();

    await waitFor(() => {
      expect(screen.queryByText("Loading IBC data...")).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("Channels"));

    await waitFor(() => {
      expect(
        screen.getByText(/No IBC channels found/),
      ).toBeInTheDocument();
    });
  });

  // 7. Connections tab shows connection data
  it("connections tab shows connection data", async () => {
    const connections = [
      makeConnection({ id: "connection-0", client_id: "07-tendermint-0" }),
    ];
    mockFetchResponses({ channels: [], connections });

    renderIBC();

    await waitFor(() => {
      expect(screen.queryByText("Loading IBC data...")).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("Connections"));

    await waitFor(() => {
      // connection-0 appears as both the connection ID and counterparty connection_id
      expect(screen.getAllByText("connection-0").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("07-tendermint-0").length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/IBC Connections \(1\)/)).toBeInTheDocument();
  });

  // 8. Clients tab shows light client data
  it("clients tab shows light client data", async () => {
    const clients = [
      makeClient({
        client_id: "07-tendermint-0",
        client_state: {
          "@type": "/ibc.lightclients.tendermint.v1.ClientState",
          chain_id: "cosmoshub-4",
          latest_height: { revision_number: "4", revision_height: "12345678" },
        },
      }),
    ];
    mockFetchResponses({ channels: [], connections: [], clients });

    renderIBC();

    await waitFor(() => {
      expect(screen.queryByText("Loading IBC data...")).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("Clients"));

    await waitFor(() => {
      expect(screen.getAllByText("07-tendermint-0").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("cosmoshub-4")).toBeInTheDocument();
      expect(screen.getByText("4-12345678")).toBeInTheDocument();
    });

    expect(screen.getByText(/IBC Light Clients \(1\)/)).toBeInTheDocument();
  });

  // 9. Denom Traces tab shows traces
  it("denom traces tab shows denom trace data", async () => {
    const denomTraces = [makeDenomTrace()];
    mockFetchResponses({ channels: [], connections: [], denomTraces });

    renderIBC();

    await waitFor(() => {
      expect(screen.queryByText("Loading IBC data...")).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // "Denom Traces" appears as both a tab button and overview card <h3>, use role
    await user.click(screen.getByRole("button", { name: "Denom Traces" }));

    await waitFor(() => {
      expect(screen.getByText("transfer/channel-0")).toBeInTheDocument();
      expect(screen.getByText("uatom")).toBeInTheDocument();
    });

    expect(screen.getByText(/IBC Denom Traces \(1\)/)).toBeInTheDocument();
  });

  // 10. Remote Agents tab shows agents
  it("remote agents tab shows discovered agents", async () => {
    const agents = [makeRemoteAgent()];
    mockFetchResponses({ channels: [], connections: [], remoteAgents: agents });

    renderIBC();

    await waitFor(() => {
      expect(screen.queryByText("Loading IBC data...")).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("Remote Agents"));

    await waitFor(() => {
      expect(screen.getByText("RemoteBot")).toBeInTheDocument();
      expect(screen.getByText("cosmoshub-4")).toBeInTheDocument();
    });

    expect(screen.getByText("text-generation")).toBeInTheDocument();
    expect(screen.getByText("code-review")).toBeInTheDocument();
    expect(screen.getByText(/Remote Agents \(1\)/)).toBeInTheDocument();
  });

  // 11. Transfer tab shows form
  it("transfer tab shows IBC transfer form", async () => {
    const channels = [makeChannel()];
    mockFetchResponses({ channels, connections: [makeConnection()] });

    renderIBC();

    await waitFor(() => {
      expect(screen.queryByText("Loading IBC data...")).not.toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("Transfer"));

    await waitFor(() => {
      expect(screen.getByText("IBC Transfer")).toBeInTheDocument();
    });

    expect(screen.getByText("Source Channel *")).toBeInTheDocument();
    expect(screen.getByText("Recipient Address *")).toBeInTheDocument();
    expect(screen.getByText("Token Amount *")).toBeInTheDocument();
    expect(screen.getByText("What is IBC Transfer?")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview Transfer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send Transfer" }),
    ).toBeInTheDocument();
  });

  // 12. Overview shows remote agents summary when agents exist
  it("overview shows remote agents summary when agents are discovered", async () => {
    const agents = [makeRemoteAgent()];
    mockFetchResponses({
      channels: [makeChannel()],
      connections: [makeConnection()],
      remoteAgents: agents,
    });

    renderIBC();

    await waitFor(() => {
      expect(screen.getByText("Remote Agents via IBC")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/1 remote agent discovered across chains/),
    ).toBeInTheDocument();
  });
});
