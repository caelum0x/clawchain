import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";
import { ChainStatusResultSchema, RuntimeStatusResultSchema } from "../protocol/schema.js";
import { chainStatusHandlers } from "./chain-status.js";

const mockGetBlockchainAgent = vi.fn();
const mockGetBlockchainAddress = vi.fn();
const mockGetBlockchainShieldedBalance = vi.fn();
const mockGetBlockchainContracts = vi.fn();
const mockGetBlockchainRuntimeStatus = vi.fn();
const contractFixture = {
  msgAgentHeartbeatTypeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
  restAgentLivenessPath: "/clawchain/agent/v1/liveness",
  restLiveAgentsPath: "/clawchain/agent/v1/live",
};

vi.mock("../../../extensions/clawchain/index.js", () => ({
  getBlockchainAgent: (...args: unknown[]) => mockGetBlockchainAgent(...args),
  getBlockchainAddress: (...args: unknown[]) => mockGetBlockchainAddress(...args),
  getBlockchainShieldedBalance: (...args: unknown[]) => mockGetBlockchainShieldedBalance(...args),
  getBlockchainContracts: (...args: unknown[]) => mockGetBlockchainContracts(...args),
  getBlockchainRuntimeStatus: (...args: unknown[]) => mockGetBlockchainRuntimeStatus(...args),
}));

function makeReq(method: string) {
  return { type: "req", id: "1", method } as const;
}

describe("chain.status handler", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateChainStatusResult = ajv.compile(ChainStatusResultSchema);
  const validateRuntimeStatusResult = ajv.compile(RuntimeStatusResultSchema);

  it("returns schema-valid disconnected status with SDK contract constants", async () => {
    mockGetBlockchainAgent.mockReturnValue(null);
    mockGetBlockchainAddress.mockReturnValue(null);
    mockGetBlockchainShieldedBalance.mockReturnValue(null);
    mockGetBlockchainContracts.mockReturnValue(contractFixture);

    let payload: unknown;
    await chainStatusHandlers["chain.status"]({
      req: makeReq("chain.status"),
      params: {},
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, response) => {
        payload = response;
      },
    });

    expect(validateChainStatusResult(payload)).toBe(true);
    expect(payload).toMatchObject({
      connected: false,
      contracts: contractFixture,
    });
  });

  it("returns schema-valid connected status with live balance and height", async () => {
    mockGetBlockchainAddress.mockReturnValue("claw1agent");
    mockGetBlockchainShieldedBalance.mockReturnValue("77");
    mockGetBlockchainContracts.mockReturnValue(contractFixture);
    mockGetBlockchainAgent.mockReturnValue({
      client: {
        getBalance: vi.fn().mockResolvedValue({ amount: "42" }),
        getLatestBlockHeight: vi.fn().mockResolvedValue(1234),
      },
    });

    let payload: unknown;
    await chainStatusHandlers["chain.status"]({
      req: makeReq("chain.status"),
      params: {},
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, response) => {
        payload = response;
      },
    });

    expect(validateChainStatusResult(payload)).toBe(true);
    expect(payload).toMatchObject({
      connected: true,
      address: "claw1agent",
      balance: "42",
      shieldedBalance: "77",
      blockHeight: 1234,
      contracts: contractFixture,
    });
  });

  it("returns schema-valid unified runtime status", async () => {
    mockGetBlockchainRuntimeStatus.mockResolvedValue({
      chain: {
        rpcUrl: "http://localhost:26657",
        alive: true,
        latestBlockHeight: 1234,
        catchingUp: false,
        error: null,
      },
      node: {
        managed: true,
        external: false,
        running: true,
      },
      agent: {
        connected: true,
        address: "claw1agent",
        heartbeatEnabled: true,
        heartbeatInFlight: false,
      },
      messaging: {
        enabled: true,
        endpoint: "http://127.0.0.1:7777",
        reachable: true,
        error: null,
      },
      faucet: {
        enabled: true,
        url: "http://127.0.0.1:8888",
        available: true,
        error: null,
      },
      peers: {
        rpcReachable: true,
        connectedPeers: 3,
        sampleNodeIds: ["node-a", "node-b"],
        error: null,
      },
      contracts: contractFixture,
      readiness: {
        ready: true,
        checks: {
          chainReachable: true,
          agentConnected: true,
          agentRegistered: true,
          agentLive: true,
          messagingConfigured: true,
          messagingReachable: true,
          peersHealthy: true,
        },
        blockers: [],
      },
    });

    let payload: unknown;
    await chainStatusHandlers["runtime.status"]({
      req: makeReq("runtime.status"),
      params: {},
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, response) => {
        payload = response;
      },
    });

    expect(validateRuntimeStatusResult(payload)).toBe(true);
    expect(payload).toMatchObject({
      chain: { alive: true },
      agent: { connected: true },
      peers: { connectedPeers: 3 },
      contracts: contractFixture,
    });
  });
});
