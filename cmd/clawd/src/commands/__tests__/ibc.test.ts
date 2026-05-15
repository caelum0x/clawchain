/**
 * Tests for `clawd ibc` subcommands — channels, connections, clients, denoms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

import { runIBCChannels, runIBCConnections, runIBCClients, runIBCDenoms } from "../ibc.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runIBCChannels()
// ---------------------------------------------------------------------------

describe("runIBCChannels", () => {
  it("displays channels table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          channels: [
            {
              channel_id: "channel-0",
              port_id: "transfer",
              state: "STATE_OPEN",
              counterparty: {
                channel_id: "channel-5",
                port_id: "transfer",
              },
              connection_hops: ["connection-0"],
            },
            {
              channel_id: "channel-1",
              port_id: "agent",
              state: "STATE_OPEN",
              counterparty: {
                channel_id: "channel-10",
                port_id: "agent",
              },
              connection_hops: ["connection-1"],
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIBCChannels({});

    const output = logs.join("\n");
    expect(output).toContain("IBC Channels (2)");
    expect(output).toContain("channel-0");
    expect(output).toContain("channel-1");
    expect(output).toContain("transfer");
    expect(output).toContain("STATE_OPEN");
    expect(output).toContain("channel-5");
    expect(output).toContain("connection-0");
  });

  it("shows message when no channels found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ channels: [] }),
    }) as unknown as typeof fetch;

    await runIBCChannels({});

    const output = logs.join("\n");
    expect(output).toContain("No IBC channels found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          channels: [{ channel_id: "channel-0", state: "STATE_OPEN" }],
        }),
    }) as unknown as typeof fetch;

    await runIBCChannels({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.channels).toHaveLength(1);
    expect(parsed.channels[0].channel_id).toBe("channel-0");
  });
});

// ---------------------------------------------------------------------------
// runIBCConnections()
// ---------------------------------------------------------------------------

describe("runIBCConnections", () => {
  it("displays connections table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          connections: [
            {
              id: "connection-0",
              client_id: "07-tendermint-0",
              state: "STATE_OPEN",
              counterparty: {
                connection_id: "connection-3",
                client_id: "07-tendermint-5",
              },
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIBCConnections({});

    const output = logs.join("\n");
    expect(output).toContain("IBC Connections (1)");
    expect(output).toContain("connection-0");
    expect(output).toContain("07-tendermint-0");
    expect(output).toContain("STATE_OPEN");
    expect(output).toContain("connection-3");
    expect(output).toContain("07-tendermint-5");
  });

  it("shows message when no connections found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ connections: [] }),
    }) as unknown as typeof fetch;

    await runIBCConnections({});

    const output = logs.join("\n");
    expect(output).toContain("No IBC connections found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          connections: [
            { id: "connection-0", state: "STATE_OPEN" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIBCConnections({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.connections).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// runIBCClients()
// ---------------------------------------------------------------------------

describe("runIBCClients", () => {
  it("displays client table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          client_states: [
            {
              client_id: "07-tendermint-0",
              client_state: {
                "@type": "/ibc.lightclients.tendermint.v1.ClientState",
                chain_id: "cosmoshub-4",
              },
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIBCClients({});

    const output = logs.join("\n");
    expect(output).toContain("IBC Clients (1)");
    expect(output).toContain("07-tendermint-0");
    expect(output).toContain("ClientState");
    expect(output).toContain("cosmoshub-4");
  });

  it("shows message when no clients found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ client_states: [] }),
    }) as unknown as typeof fetch;

    await runIBCClients({});

    const output = logs.join("\n");
    expect(output).toContain("No IBC clients found.");
  });
});

// ---------------------------------------------------------------------------
// runIBCDenoms()
// ---------------------------------------------------------------------------

describe("runIBCDenoms", () => {
  it("displays denom traces table", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          denom_traces: [
            { path: "transfer/channel-0", base_denom: "uatom" },
            { path: "transfer/channel-1", base_denom: "uosmo" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIBCDenoms({});

    const output = logs.join("\n");
    expect(output).toContain("IBC Denom Traces (2)");
    expect(output).toContain("transfer/channel-0");
    expect(output).toContain("uatom");
    expect(output).toContain("transfer/channel-1");
    expect(output).toContain("uosmo");
  });

  it("shows message when no denom traces found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ denom_traces: [] }),
    }) as unknown as typeof fetch;

    await runIBCDenoms({});

    const output = logs.join("\n");
    expect(output).toContain("No IBC denom traces found.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          denom_traces: [
            { path: "transfer/channel-0", base_denom: "uatom" },
          ],
        }),
    }) as unknown as typeof fetch;

    await runIBCDenoms({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.denom_traces).toHaveLength(1);
    expect(parsed.denom_traces[0].base_denom).toBe("uatom");
  });
});
