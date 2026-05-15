import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { ProviderManager } from "./provider.js";
import type { ClawChainClient } from "./client.js";

// ---------------------------------------------------------------------------
// Helper: create a mock ClawChainClient with sensible defaults
// ---------------------------------------------------------------------------

function createMockClient(overrides: Partial<Record<string, unknown>> = {}) {
  const defaultTxResult = {
    transactionHash: "AABBCC",
    height: 100,
    code: 0,
    rawLog: "",
    gasUsed: 50000,
    events: [],
  };

  const mock: Record<string, unknown> = {
    getAddress: () => "cosmos1provider",

    registerAgent: async () => ({ ...defaultTxResult }),

    agentHeartbeat: async () => ({ ...defaultTxResult }),

    getAgent: async () => ({
      name: "test-provider",
      pubkey: "deadbeef",
      endpoint: "https://provider.example",
      registered: true,
    }),

    getAgentLiveness: async () => ({
      found: true,
      liveness: {
        agentAddress: "cosmos1provider",
        lastHeartbeatHeight: 500,
        lastHeartbeatTime: Date.now(),
        reportedNodeHeight: 500,
        endpoint: "https://provider.example",
        metadata: "{}",
        heartbeatCount: 42,
      },
    }),

    getReputation: async () => ({
      found: true,
      reputation: {
        agentAddress: "cosmos1provider",
        avgRatingBps: 4200,
        totalRatings: 10,
        ratingSum: 42,
      },
    }),

    getTasksByAssignee: async () => ({
      tasks: [
        {
          taskId: 1,
          description: "Run inference",
          budget: "5000",
          status: "accepted",
          delegatorAddress: "cosmos1del",
          assigneeAddress: "cosmos1provider",
          requirements: "",
          skillId: 0,
          deadlineBlocks: 100,
          found: true,
        },
        {
          taskId: 2,
          description: "Done task",
          budget: "3000",
          status: "completed",
          delegatorAddress: "cosmos1del",
          assigneeAddress: "cosmos1provider",
          requirements: "",
          skillId: 0,
          deadlineBlocks: 100,
          found: true,
        },
      ],
    }),

    getSkillsByOwner: async () => ({
      skills: [
        { id: 1, owner: "cosmos1provider", name: "Summarize", price: "100", denom: "uclaw", active: true, purchaseCount: 5 },
        { id: 2, owner: "cosmos1provider", name: "Translate", price: "200", denom: "uclaw", active: true, purchaseCount: 3 },
      ],
    }),

    getComputeResources: async () => ({
      resources: [
        {
          id: 10,
          owner: "cosmos1provider",
          name: "A100",
          description: "GPU",
          gpuModel: "A100",
          gpuCount: 1,
          vramGb: 80,
          cpuCores: 8,
          ramGb: 64,
          storageGb: 500,
          pricePerHourUclaw: "1000",
          available: true,
        },
        {
          id: 11,
          owner: "cosmos1other",
          name: "T4",
          description: "GPU",
          gpuModel: "T4",
          gpuCount: 1,
          vramGb: 16,
          cpuCores: 4,
          ramGb: 32,
          storageGb: 200,
          pricePerHourUclaw: "200",
          available: true,
        },
      ],
    }),

    getModels: async () => [
      { id: 5, owner: "cosmos1provider", name: "llama-3", accessType: "per_query", framework: "pytorch" },
      { id: 6, owner: "cosmos1other", name: "gpt-mini", accessType: "free", framework: "onnx" },
    ],

    getAgentRewards: async () => ({
      address: "cosmos1provider",
      cumulativeRewards: "10000",
      denom: "uclaw",
    }),

    getStakingRewards: async () => ({
      rewards: [],
      total: [{ denom: "uclaw", amount: "500" }],
    }),

    listSkill: async () => ({
      ...defaultTxResult,
      events: [{ type: "skill_listed", attributes: [{ key: "skill_id", value: "42" }] }],
    }),

    delistSkill: async () => ({ ...defaultTxResult }),

    updateSkill: async () => ({ ...defaultTxResult }),

    registerModel: async () => ({ txHash: "MODELHASH", modelId: 99 }),

    getSkillAnalytics: async () => ({
      analytics: { skillId: 1, totalRevenue: "500", purchaseCount: 5, avgRating: 450, versionCount: 2 },
    }),

    ...overrides,
  };

  return mock as unknown as ClawChainClient;
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("ProviderManager.register", () => {
  test("delegates to client.registerAgent and returns txHash + address", async () => {
    let calledWith: unknown;
    const client = createMockClient({
      registerAgent: async (params: unknown) => {
        calledWith = params;
        return { transactionHash: "REG123", height: 10, code: 0, rawLog: "", gasUsed: 1000, events: [] };
      },
    });
    const pm = new ProviderManager(client);
    const result = await pm.register({
      name: "my-provider",
      endpoint: "https://prov.example",
      capabilities: ["inference", "training"],
    });

    assert.equal(result.txHash, "REG123");
    assert.equal(result.address, "cosmos1provider");
    assert.ok(calledWith);
    const p = calledWith as Record<string, unknown>;
    assert.equal(p.name, "my-provider");
    assert.equal(p.endpoint, "https://prov.example");
    assert.deepEqual(p.supportedTools, ["inference", "training"]);
  });

  test("throws on non-zero code", async () => {
    const client = createMockClient({
      registerAgent: async () => ({
        transactionHash: "", height: 0, code: 5, rawLog: "agent exists", gasUsed: 0, events: [],
      }),
    });
    const pm = new ProviderManager(client);
    await assert.rejects(
      () => pm.register({ name: "x", endpoint: "http://x", capabilities: [] }),
      (err: Error) => {
        assert.ok(err.message.includes("register failed"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// heartbeat
// ---------------------------------------------------------------------------

describe("ProviderManager.heartbeat", () => {
  test("delegates to client.agentHeartbeat", async () => {
    let calledWith: unknown;
    const client = createMockClient({
      agentHeartbeat: async (params: unknown) => {
        calledWith = params;
        return { transactionHash: "HB456", height: 20, code: 0, rawLog: "", gasUsed: 500, events: [] };
      },
    });
    const pm = new ProviderManager(client);
    const result = await pm.heartbeat({ version: "1.0" });

    assert.equal(result.txHash, "HB456");
    const p = calledWith as Record<string, unknown>;
    assert.equal(p.metadata, '{"version":"1.0"}');
  });

  test("sends heartbeat without metadata", async () => {
    const client = createMockClient();
    const pm = new ProviderManager(client);
    const result = await pm.heartbeat();
    assert.equal(result.txHash, "AABBCC");
  });
});

// ---------------------------------------------------------------------------
// getHealth
// ---------------------------------------------------------------------------

describe("ProviderManager.getHealth", () => {
  test("queries agent info, liveness, reputation, and tasks", async () => {
    const client = createMockClient();
    const pm = new ProviderManager(client);
    const health = await pm.getHealth();

    assert.equal(health.registered, true);
    assert.equal(health.heartbeatActive, true);
    assert.equal(health.lastHeartbeatHeight, "500");
    assert.equal(health.reputationScore, 4200);
    assert.equal(health.activeTaskCount, 1); // only 1 task with "accepted" status
  });

  test("returns defaults when queries fail", async () => {
    const client = createMockClient({
      getAgent: async () => { throw new Error("not found"); },
      getAgentLiveness: async () => { throw new Error("not found"); },
      getReputation: async () => { throw new Error("not found"); },
      getTasksByAssignee: async () => { throw new Error("not found"); },
    });
    const pm = new ProviderManager(client);
    const health = await pm.getHealth();

    assert.equal(health.registered, false);
    assert.equal(health.heartbeatActive, false);
    assert.equal(health.lastHeartbeatHeight, null);
    assert.equal(health.reputationScore, 0);
    assert.equal(health.activeTaskCount, 0);
  });
});

// ---------------------------------------------------------------------------
// getInventory
// ---------------------------------------------------------------------------

describe("ProviderManager.getInventory", () => {
  test("fetches all surfaces in parallel", async () => {
    const client = createMockClient();
    const pm = new ProviderManager(client);
    const inv = await pm.getInventory();

    // Skills
    assert.equal(inv.skills.length, 2);
    assert.equal(inv.skills[0].name, "Summarize");
    assert.equal(inv.skills[0].purchases, 5);

    // GPU – only provider-owned resources
    assert.equal(inv.gpuResources.length, 1);
    assert.equal(inv.gpuResources[0].vram, "80GB");

    // Models – only provider-owned
    assert.equal(inv.hostedModels.length, 1);
    assert.equal(inv.hostedModels[0].name, "llama-3");

    // Active tasks – only accepted/in_progress
    assert.equal(inv.activeTasks.length, 1);
    assert.equal(inv.activeTasks[0].description, "Run inference");
  });

  test("returns empty arrays when queries fail", async () => {
    const client = createMockClient({
      getSkillsByOwner: async () => { throw new Error("fail"); },
      getComputeResources: async () => { throw new Error("fail"); },
      getModels: async () => { throw new Error("fail"); },
      getTasksByAssignee: async () => { throw new Error("fail"); },
    });
    const pm = new ProviderManager(client);
    const inv = await pm.getInventory();

    assert.equal(inv.skills.length, 0);
    assert.equal(inv.gpuResources.length, 0);
    assert.equal(inv.hostedModels.length, 0);
    assert.equal(inv.activeTasks.length, 0);
  });
});

// ---------------------------------------------------------------------------
// getEarnings
// ---------------------------------------------------------------------------

describe("ProviderManager.getEarnings", () => {
  test("aggregates all revenue streams", async () => {
    const client = createMockClient();
    const pm = new ProviderManager(client);
    const earnings = await pm.getEarnings();

    // Agent mining
    assert.equal(earnings.agentMining.cumulative, "10000");
    assert.equal(earnings.agentMining.denom, "uclaw");

    // Task income – 1 completed task with budget 3000
    assert.equal(earnings.taskIncome.completed, 1);
    assert.equal(earnings.taskIncome.totalBudget, "3000");

    // Staking rewards
    assert.equal(earnings.stakingRewards.pending, "500");

    // Skill sales: skill1: 100 * 5 = 500, skill2: 200 * 3 = 600 => 1100
    assert.equal(earnings.skillSales.totalRevenue, "1100");
    assert.equal(earnings.skillSales.purchaseCount, 8);

    // Total: 10000 + 3000 + 500 + 1100 = 14600
    assert.equal(earnings.totalEstimatedUclaw, "14600");
  });

  test("returns zeros when queries fail", async () => {
    const client = createMockClient({
      getAgentRewards: async () => { throw new Error("fail"); },
      getTasksByAssignee: async () => { throw new Error("fail"); },
      getStakingRewards: async () => { throw new Error("fail"); },
      getSkillsByOwner: async () => { throw new Error("fail"); },
    });
    const pm = new ProviderManager(client);
    const earnings = await pm.getEarnings();

    assert.equal(earnings.agentMining.cumulative, "0");
    assert.equal(earnings.taskIncome.completed, 0);
    assert.equal(earnings.stakingRewards.pending, "0");
    assert.equal(earnings.skillSales.totalRevenue, "0");
    assert.equal(earnings.totalEstimatedUclaw, "0");
  });
});

// ---------------------------------------------------------------------------
// publishSkill
// ---------------------------------------------------------------------------

describe("ProviderManager.publishSkill", () => {
  test("delegates to client.listSkill and extracts skillId", async () => {
    let calledWith: unknown;
    const client = createMockClient({
      listSkill: async (params: unknown) => {
        calledWith = params;
        return {
          transactionHash: "SKILL1",
          height: 30,
          code: 0,
          rawLog: "",
          gasUsed: 800,
          events: [
            { type: "skill_listed", attributes: [{ key: "skill_id", value: "7" }] },
          ],
        };
      },
    });
    const pm = new ProviderManager(client);
    const result = await pm.publishSkill({
      name: "Summarizer",
      description: "Summarizes text",
      price: "500",
      category: "nlp",
    });

    assert.equal(result.txHash, "SKILL1");
    assert.equal(result.skillId, "7");
    const p = calledWith as Record<string, unknown>;
    assert.equal(p.name, "Summarizer");
    assert.equal(p.price, "500");
  });

  test("returns skillId 0 when event is missing", async () => {
    const client = createMockClient({
      listSkill: async () => ({
        transactionHash: "SKILL2",
        height: 30,
        code: 0,
        rawLog: "",
        gasUsed: 800,
        events: [],
      }),
    });
    const pm = new ProviderManager(client);
    const result = await pm.publishSkill({
      name: "Test",
      description: "desc",
      price: "100",
    });
    assert.equal(result.skillId, "0");
  });
});

// ---------------------------------------------------------------------------
// updateSkillPrice
// ---------------------------------------------------------------------------

describe("ProviderManager.updateSkillPrice", () => {
  test("delegates to client.updateSkill with price", async () => {
    let calledWith: unknown;
    const client = createMockClient({
      updateSkill: async (params: unknown) => {
        calledWith = params;
        return { transactionHash: "UPD1", height: 40, code: 0, rawLog: "", gasUsed: 600, events: [] };
      },
    });
    const pm = new ProviderManager(client);
    const result = await pm.updateSkillPrice(7, "750");

    assert.equal(result.txHash, "UPD1");
    const p = calledWith as Record<string, unknown>;
    assert.equal(p.skillId, 7);
    assert.equal(p.price, "750");
  });
});

// ---------------------------------------------------------------------------
// delistSkill
// ---------------------------------------------------------------------------

describe("ProviderManager.delistSkill", () => {
  test("delegates to client.delistSkill", async () => {
    let calledWith: unknown;
    const client = createMockClient({
      delistSkill: async (params: unknown) => {
        calledWith = params;
        return { transactionHash: "DEL1", height: 50, code: 0, rawLog: "", gasUsed: 400, events: [] };
      },
    });
    const pm = new ProviderManager(client);
    const result = await pm.delistSkill(7);

    assert.equal(result.txHash, "DEL1");
    const p = calledWith as Record<string, unknown>;
    assert.equal(p.skillId, 7);
  });
});

// ---------------------------------------------------------------------------
// hostModel
// ---------------------------------------------------------------------------

describe("ProviderManager.hostModel", () => {
  test("delegates to client.registerModel", async () => {
    let calledWith: unknown;
    const client = createMockClient({
      registerModel: async (params: unknown) => {
        calledWith = params;
        return { txHash: "MODEL1", modelId: 55 };
      },
    });
    const pm = new ProviderManager(client);
    const result = await pm.hostModel({
      name: "llama-3-8b",
      framework: "pytorch",
      storageUri: "ipfs://Qm1234",
      accessType: "per_query",
      price: "10",
    });

    assert.equal(result.txHash, "MODEL1");
    assert.equal(result.modelId, "55");
    const p = calledWith as Record<string, unknown>;
    assert.equal(p.name, "llama-3-8b");
    assert.equal(p.framework, "pytorch");
    assert.equal(p.storageUri, "ipfs://Qm1234");
    assert.equal(p.accessType, "per_query");
    assert.equal(p.pricePerQueryUclaw, "10");
    assert.equal(p.priceOneTimeUclaw, "0");
  });

  test("sets one_time price correctly", async () => {
    let calledWith: unknown;
    const client = createMockClient({
      registerModel: async (params: unknown) => {
        calledWith = params;
        return { txHash: "MODEL2", modelId: 56 };
      },
    });
    const pm = new ProviderManager(client);
    await pm.hostModel({
      name: "model-x",
      framework: "onnx",
      storageUri: "s3://bucket/model",
      accessType: "one_time",
      price: "50000",
    });

    const p = calledWith as Record<string, unknown>;
    assert.equal(p.pricePerQueryUclaw, "0");
    assert.equal(p.priceOneTimeUclaw, "50000");
  });

  test("returns modelId 0 when not provided", async () => {
    const client = createMockClient({
      registerModel: async () => ({ txHash: "MODEL3", modelId: undefined }),
    });
    const pm = new ProviderManager(client);
    const result = await pm.hostModel({
      name: "test",
      framework: "tf",
      storageUri: "uri",
      accessType: "free",
    });
    assert.equal(result.modelId, "0");
  });
});

// ---------------------------------------------------------------------------
// Error handling – client not connected
// ---------------------------------------------------------------------------

describe("ProviderManager error handling", () => {
  test("register throws when client.getAddress fails", async () => {
    const client = createMockClient({
      getAddress: () => { throw new Error("not connected"); },
    });
    const pm = new ProviderManager(client);
    await assert.rejects(
      () => pm.register({ name: "x", endpoint: "http://x", capabilities: [] }),
      (err: Error) => {
        assert.ok(err.message.includes("not connected"));
        return true;
      },
    );
  });

  test("getHealth handles partial failures gracefully", async () => {
    const client = createMockClient({
      getAgent: async () => ({ registered: true, name: "x", pubkey: "", endpoint: "" }),
      getAgentLiveness: async () => { throw new Error("timeout"); },
      getReputation: async () => { throw new Error("timeout"); },
      getTasksByAssignee: async () => { throw new Error("timeout"); },
    });
    const pm = new ProviderManager(client);
    const health = await pm.getHealth();

    assert.equal(health.registered, true);
    assert.equal(health.heartbeatActive, false);
    assert.equal(health.reputationScore, 0);
    assert.equal(health.activeTaskCount, 0);
  });
});
