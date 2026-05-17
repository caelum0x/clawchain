import Ajv from "ajv";
import { describe, expect, it, vi } from "vitest";
import { ChainStatusResultSchema, RuntimeStatusResultSchema } from "../protocol/schema.js";
import { listGatewayMethods } from "../server-methods-list.js";
import { handleGatewayRequest } from "../server-methods.js";

const mockGetBlockchainAgent = vi.fn();
const mockGetBlockchainAddress = vi.fn();
const mockGetBlockchainShieldedBalance = vi.fn();
const mockGetBlockchainContracts = vi.fn();
const mockGetBlockchainRuntimeStatus = vi.fn();

vi.mock("../../../extensions/clawchain/index.js", () => ({
  getBlockchainAgent: (...args: unknown[]) => mockGetBlockchainAgent(...args),
  getBlockchainAddress: (...args: unknown[]) => mockGetBlockchainAddress(...args),
  getBlockchainShieldedBalance: (...args: unknown[]) => mockGetBlockchainShieldedBalance(...args),
  getBlockchainContracts: (...args: unknown[]) => mockGetBlockchainContracts(...args),
  getBlockchainRuntimeStatus: (...args: unknown[]) => mockGetBlockchainRuntimeStatus(...args),
}));

describe("chain.status WS contract coherence", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateChainStatusResult = ajv.compile(ChainStatusResultSchema);
  const validateRuntimeStatusResult = ajv.compile(RuntimeStatusResultSchema);

  it("is advertised by gateway method list and returns schema-valid payload", async () => {
    expect(listGatewayMethods()).toContain("chain.status");
    expect(listGatewayMethods()).toContain("runtime.status");

    mockGetBlockchainAgent.mockReturnValue(null);
    mockGetBlockchainAddress.mockReturnValue(null);
    mockGetBlockchainShieldedBalance.mockReturnValue(null);
    mockGetBlockchainContracts.mockReturnValue({
      msgAgentHeartbeatTypeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
      restAgentLivenessPath: "/clawchain/agent/v1/liveness",
      restLiveAgentsPath: "/clawchain/agent/v1/live",
    });

    let okValue: boolean | undefined;
    let payload: unknown;
    await handleGatewayRequest({
      req: { type: "req", id: "1", method: "chain.status", params: {} },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (ok, response) => {
        okValue = ok;
        payload = response;
      },
    });

    expect(okValue).toBe(true);
    expect(validateChainStatusResult(payload)).toBe(true);
  });

  it("handles runtime.status and returns schema-valid runtime payload", async () => {
    mockGetBlockchainRuntimeStatus.mockResolvedValue({
      chain: {
        rpcUrl: "http://localhost:26657",
        alive: true,
        latestBlockHeight: 99,
        catchingUp: false,
        error: null,
      },
      node: {
        managed: false,
        external: false,
        running: false,
      },
      agent: {
        connected: false,
        address: null,
        heartbeatEnabled: true,
        heartbeatInFlight: false,
      },
      messaging: {
        enabled: false,
        endpoint: null,
        reachable: null,
        error: null,
      },
      faucet: {
        enabled: false,
        url: null,
        available: null,
        error: null,
      },
      peers: {
        rpcReachable: true,
        connectedPeers: 0,
        sampleNodeIds: [],
        error: null,
      },
      contracts: {
        msgAgentHeartbeatTypeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
        restAgentLivenessPath: "/clawchain/agent/v1/liveness",
        restLiveAgentsPath: "/clawchain/agent/v1/live",
      },
      readiness: {
        ready: false,
        checks: {
          chainReachable: true,
          agentConnected: false,
          agentRegistered: false,
          agentLive: false,
          messagingConfigured: false,
          messagingReachable: false,
          peersHealthy: false,
        },
        blockers: [
          "agent is not connected",
          "agent is not registered on-chain",
          "agent heartbeat/liveness is not visible on-chain",
          "messaging endpoint is not configured",
          "messaging endpoint is not reachable",
          "peer connectivity is unhealthy (0 peers)",
        ],
      },
    });

    let okValue: boolean | undefined;
    let payload: unknown;
    await handleGatewayRequest({
      req: { type: "req", id: "2", method: "runtime.status", params: {} },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (ok, response) => {
        okValue = ok;
        payload = response;
      },
    });

    expect(okValue).toBe(true);
    expect(validateRuntimeStatusResult(payload)).toBe(true);
  });
});
