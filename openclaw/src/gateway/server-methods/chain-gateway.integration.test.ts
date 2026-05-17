import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listGatewayMethods } from "../server-methods-list.js";
import { handleGatewayRequest } from "../server-methods.js";

const mockGetBlockchainAgent = vi.fn();
const mockGetBlockchainAddress = vi.fn();

vi.mock("../../../extensions/clawchain/index.js", async () => {
  const actual = await vi.importActual<object>("../../../extensions/clawchain/index.js");
  return {
    ...actual,
    getBlockchainAgent: (...args: unknown[]) => mockGetBlockchainAgent(...args),
    getBlockchainAddress: (...args: unknown[]) => mockGetBlockchainAddress(...args),
  };
});

const mockFetch = vi.fn();
let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

describe("chain gateway method integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  const operatorReadClient = {
    connect: {
      minProtocol: 1,
      maxProtocol: 1,
      client: {
        id: "test-client",
        version: "1.0.0",
        platform: "test",
        mode: "ui",
      },
      role: "operator",
      scopes: ["operator.read"],
    },
  } as const;

  it("advertises chain wallet and chain agent methods", () => {
    expect(listGatewayMethods()).toContain("chain.agents.list");
    expect(listGatewayMethods()).toContain("chain.agents.delegate");
    expect(listGatewayMethods()).toContain("chain.wallet.balance");
    expect(listGatewayMethods()).toContain("chain.wallet.transfer");
  });

  it("dispatches chain.wallet.balance through the central gateway handler for read-scoped operators", async () => {
    mockGetBlockchainAddress.mockReturnValue("claw1agent");
    mockGetBlockchainAgent.mockReturnValue({
      client: {
        getBalance: vi.fn().mockResolvedValue({ amount: "42", denom: "uclaw" }),
        getLatestBlockHeight: vi.fn().mockResolvedValue(1234),
      },
    });

    let okValue: boolean | undefined;
    let payload: unknown;
    await handleGatewayRequest({
      req: { type: "req", id: "1", method: "chain.wallet.balance", params: {} },
      client: operatorReadClient,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (ok, response) => {
        okValue = ok;
        payload = response;
      },
    });

    expect(okValue).toBe(true);
    expect(payload).toEqual({
      address: "claw1agent",
      balances: [{ amount: "42", denom: "uclaw" }],
      blockHeight: 1234,
    });
  });

  it("dispatches chain.agents.list through the central gateway handler for read-scoped operators", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        agents: [
          {
            address: "claw1abc",
            name: "Agent Alpha",
            status: "active",
            last_heartbeat: "2026-03-08T00:00:00Z",
            capabilities: ["inference"],
          },
        ],
        pagination: { total: "1" },
      }),
    });

    let okValue: boolean | undefined;
    let payload: unknown;
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "2",
        method: "chain.agents.list",
        params: { limit: 10, offset: 0 },
      },
      client: operatorReadClient,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (ok, response) => {
        okValue = ok;
        payload = response;
      },
    });

    expect(okValue).toBe(true);
    expect(payload).toEqual({
      agents: [
        {
          address: "claw1abc",
          name: "Agent Alpha",
          status: "active",
          lastHeartbeat: "2026-03-08T00:00:00Z",
          capabilities: ["inference"],
        },
      ],
      count: 1,
      total: 1,
    });
  });

  it("rejects chain.wallet.transfer for read-only operators", async () => {
    let okValue: boolean | undefined;
    let errorValue: unknown;
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "3",
        method: "chain.wallet.transfer",
        params: { recipient: "claw1dest", amount: "5" },
      },
      client: operatorReadClient,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (ok, _response, error) => {
        okValue = ok;
        errorValue = error;
      },
    });

    expect(okValue).toBe(false);
    expect(errorValue).toEqual(
      expect.objectContaining({
        message: "missing scope: operator.write",
      }),
    );
  });
});
