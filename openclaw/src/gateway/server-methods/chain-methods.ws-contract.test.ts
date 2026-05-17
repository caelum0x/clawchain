import Ajv from "ajv";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChainAgentsDelegateResultSchema,
  ChainAgentsInfoResultSchema,
  ChainAgentsListResultSchema,
  ChainAgentsReputationResultSchema,
  ChainAgentsTasksResultSchema,
  ChainWalletBalanceResultSchema,
  ChainWalletHistoryResultSchema,
  ChainWalletStakingDelegationsResultSchema,
  ChainWalletStakingRewardsResultSchema,
  ChainWalletTransferResultSchema,
} from "../protocol/schema.js";
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

describe("chain gateway WS contract coherence", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateAgentsList = ajv.compile(ChainAgentsListResultSchema);
  const validateAgentsInfo = ajv.compile(ChainAgentsInfoResultSchema);
  const validateAgentsTasks = ajv.compile(ChainAgentsTasksResultSchema);
  const validateAgentsDelegate = ajv.compile(ChainAgentsDelegateResultSchema);
  const validateAgentsReputation = ajv.compile(ChainAgentsReputationResultSchema);
  const validateWalletBalance = ajv.compile(ChainWalletBalanceResultSchema);
  const validateWalletTransfer = ajv.compile(ChainWalletTransferResultSchema);
  const validateWalletDelegations = ajv.compile(ChainWalletStakingDelegationsResultSchema);
  const validateWalletRewards = ajv.compile(ChainWalletStakingRewardsResultSchema);
  const validateWalletHistory = ajv.compile(ChainWalletHistoryResultSchema);

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("advertises all chain agent and wallet gateway methods", () => {
    expect(listGatewayMethods()).toContain("chain.agents.list");
    expect(listGatewayMethods()).toContain("chain.agents.info");
    expect(listGatewayMethods()).toContain("chain.agents.tasks");
    expect(listGatewayMethods()).toContain("chain.agents.delegate");
    expect(listGatewayMethods()).toContain("chain.agents.reputation");
    expect(listGatewayMethods()).toContain("chain.wallet.balance");
    expect(listGatewayMethods()).toContain("chain.wallet.transfer");
    expect(listGatewayMethods()).toContain("chain.wallet.staking.delegations");
    expect(listGatewayMethods()).toContain("chain.wallet.staking.rewards");
    expect(listGatewayMethods()).toContain("chain.wallet.history");
  });

  it("returns schema-valid payloads for representative chain agent methods", async () => {
    mockGetBlockchainAddress.mockReturnValue("claw1self");
    mockGetBlockchainAgent.mockReturnValue({
      client: {
        getAgent: vi.fn().mockResolvedValue({
          registered: true,
          agent: {
            name: "Alpha",
            reputation: 99,
            skills: ["inference"],
            task_count: 3,
          },
        }),
        getAgentLiveness: vi.fn().mockResolvedValue({
          found: true,
          liveness: { lastHeartbeat: "2026-03-08T10:00:00Z" },
        }),
        delegateTask: vi.fn().mockResolvedValue({
          transactionHash: "ABC123",
          height: 88,
          code: 0,
          taskId: "task-9",
        }),
      },
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          agents: [
            {
              address: "claw1alpha",
              name: "Alpha",
              status: "active",
              last_heartbeat: "2026-03-08T00:00:00Z",
              capabilities: ["inference"],
            },
          ],
          pagination: { total: "1" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          tasks: [
            {
              id: "task-1",
              description: "Run inference",
              assignee: "claw1self",
              delegator: "claw1boss",
              status: "pending",
              created_at: "2026-03-08T08:00:00Z",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          reputation: {
            score: 91,
            total_ratings: 10,
            avg_rating: 4.5,
            endorsements: 7,
          },
        }),
      });

    const responses: unknown[] = [];

    await handleGatewayRequest({
      req: { type: "req", id: "1", method: "chain.agents.list", params: {} },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: { type: "req", id: "2", method: "chain.agents.info", params: { address: "claw1alpha" } },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: { type: "req", id: "3", method: "chain.agents.tasks", params: { role: "assignee" } },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "4",
        method: "chain.agents.delegate",
        params: { assignee: "claw1worker", description: "Process job" },
      },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "5",
        method: "chain.agents.reputation",
        params: { address: "claw1alpha" },
      },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });

    expect(validateAgentsList(responses[0])).toBe(true);
    expect(validateAgentsInfo(responses[1])).toBe(true);
    expect(validateAgentsTasks(responses[2])).toBe(true);
    expect(validateAgentsDelegate(responses[3])).toBe(true);
    expect(validateAgentsReputation(responses[4])).toBe(true);
  });

  it("returns schema-valid payloads for representative chain wallet methods", async () => {
    mockGetBlockchainAddress.mockReturnValue("claw1self");
    mockGetBlockchainAgent.mockReturnValue({
      client: {
        getBalance: vi.fn().mockResolvedValue({ amount: "42", denom: "uclaw" }),
        getLatestBlockHeight: vi.fn().mockResolvedValue(1234),
        transfer: vi.fn().mockResolvedValue({
          transactionHash: "TX123",
          height: 55,
          code: 0,
        }),
      },
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          delegation_responses: [
            {
              delegation: { validator_address: "clawvaloper1xyz", shares: "10.0" },
              balance: { denom: "uclaw", amount: "10" },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          rewards: [
            {
              validator_address: "clawvaloper1xyz",
              reward: [{ denom: "uclaw", amount: "2" }],
            },
          ],
          total: [{ denom: "uclaw", amount: "2" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          tx_responses: [
            {
              txhash: "TX123",
              height: "77",
              timestamp: "2026-03-08T11:00:00Z",
              code: 0,
              tx: { body: { messages: [{ "@type": "/cosmos.bank.v1beta1.MsgSend" }] } },
            },
          ],
        }),
      });

    const responses: unknown[] = [];

    await handleGatewayRequest({
      req: { type: "req", id: "6", method: "chain.wallet.balance", params: {} },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: {
        type: "req",
        id: "7",
        method: "chain.wallet.transfer",
        params: { recipient: "claw1dest", amount: "5" },
      },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: { type: "req", id: "8", method: "chain.wallet.staking.delegations", params: {} },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: { type: "req", id: "9", method: "chain.wallet.staking.rewards", params: {} },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });
    await handleGatewayRequest({
      req: { type: "req", id: "10", method: "chain.wallet.history", params: { limit: 5 } },
      client: null,
      isWebchatConnect: () => false,
      context: {} as never,
      respond: (_ok, payload) => responses.push(payload),
    });

    expect(validateWalletBalance(responses[0])).toBe(true);
    expect(validateWalletTransfer(responses[1])).toBe(true);
    expect(validateWalletDelegations(responses[2])).toBe(true);
    expect(validateWalletRewards(responses[3])).toBe(true);
    expect(validateWalletHistory(responses[4])).toBe(true);
  });
});
