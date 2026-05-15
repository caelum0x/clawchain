/**
 * ProviderManager – high-level provider operations API for ClawChain.
 *
 * Wraps existing low-level ClawChainClient methods into a cohesive interface
 * for providers who register agents, publish skills, host models, and manage
 * GPU compute resources.
 */

import { ClawChainClient } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderInventory = {
  skills: { id: string; name: string; price: string; purchases: number }[];
  gpuResources: { id: string; vram: string; price: string; active: boolean }[];
  hostedModels: { id: string; name: string; accessType: string; queries: number }[];
  activeTasks: { id: string; description: string; budget: string; status: string }[];
};

export type ProviderEarnings = {
  agentMining: { cumulative: string; denom: string };
  taskIncome: { completed: number; totalBudget: string };
  stakingRewards: { pending: string };
  skillSales: { totalRevenue: string; purchaseCount: number };
  totalEstimatedUclaw: string;
};

export type ProviderHealth = {
  registered: boolean;
  heartbeatActive: boolean;
  lastHeartbeatHeight: string | null;
  reputationScore: number;
  activeTaskCount: number;
};

// ---------------------------------------------------------------------------
// ProviderManager
// ---------------------------------------------------------------------------

export class ProviderManager {
  constructor(private client: ClawChainClient) {}

  // -----------------------------------------------------------------------
  // Registration & Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Register as a provider with name, endpoint, and capabilities.
   *
   * Delegates to `client.registerAgent()` and extracts the signer address.
   */
  async register(opts: {
    name: string;
    endpoint: string;
    capabilities: string[];
    deposit?: string;
  }): Promise<{ txHash: string; address: string }> {
    const address = this.client.getAddress();

    const result = await this.client.registerAgent({
      pubkey: address, // Use address as pubkey fallback; real pubkey derived at connect
      endpoint: opts.endpoint,
      name: opts.name,
      supportedTools: opts.capabilities,
    });

    if (result.code !== 0) {
      throw new Error(`ProviderManager.register failed: ${result.rawLog}`);
    }

    return { txHash: result.transactionHash, address };
  }

  /**
   * Send a heartbeat to maintain active status.
   *
   * Delegates to `client.agentHeartbeat()`.
   */
  async heartbeat(metadata?: Record<string, string>): Promise<{ txHash: string }> {
    const result = await this.client.agentHeartbeat({
      nodeHeight: 0, // Will be filled by the chain
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });

    if (result.code !== 0) {
      throw new Error(`ProviderManager.heartbeat failed: ${result.rawLog}`);
    }

    return { txHash: result.transactionHash };
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  /**
   * Get comprehensive provider health status.
   *
   * Fetches agent info, liveness, reputation, and active task count
   * in parallel.
   */
  async getHealth(): Promise<ProviderHealth> {
    const address = this.client.getAddress();

    const [agentInfo, liveness, reputation, tasks] = await Promise.all([
      this.client.getAgent(address).catch(() => null),
      this.client.getAgentLiveness(address).catch(() => null),
      this.client.getReputation(address).catch(() => null),
      this.client.getTasksByAssignee(address).catch(() => null),
    ]);

    const registered = agentInfo?.registered ?? false;

    const heartbeatActive = liveness?.found ?? false;
    const lastHeartbeatHeight = liveness?.found
      ? String(liveness.liveness.lastHeartbeatHeight)
      : null;

    const reputationScore = reputation?.found
      ? reputation.reputation.avgRatingBps
      : 0;

    const activeTaskCount = tasks?.tasks
      ? tasks.tasks.filter((t) => t.status === "accepted" || t.status === "in_progress").length
      : 0;

    return {
      registered,
      heartbeatActive,
      lastHeartbeatHeight,
      reputationScore,
      activeTaskCount,
    };
  }

  // -----------------------------------------------------------------------
  // Inventory
  // -----------------------------------------------------------------------

  /**
   * Get all provider inventory across all surfaces.
   *
   * Fetches skills, GPU resources, models, and active tasks in parallel.
   */
  async getInventory(): Promise<ProviderInventory> {
    const address = this.client.getAddress();

    const [skillsRes, computeRes, models, tasksRes] = await Promise.all([
      this.client.getSkillsByOwner(address).catch(() => ({ skills: [] })),
      this.client.getComputeResources(false).catch(() => ({ resources: [] })),
      this.client.getModels().catch(() => []),
      this.client.getTasksByAssignee(address).catch(() => ({ tasks: [] })),
    ]);

    const skills = (skillsRes.skills ?? []).map((s) => ({
      id: String(s.id),
      name: s.name,
      price: s.price,
      purchases: s.purchaseCount,
    }));

    // Filter compute resources to those owned by this provider
    const gpuResources = (computeRes.resources ?? [])
      .filter((r) => r.owner === address)
      .map((r) => ({
        id: String(r.id),
        vram: `${r.vramGb}GB`,
        price: r.pricePerHourUclaw,
        active: r.active,
      }));

    // Filter models to those owned by this provider
    const hostedModels = (models ?? [])
      .filter((m) => m.owner === address)
      .map((m) => ({
        id: String(m.id),
        name: m.name,
        accessType: m.accessType,
        queries: 0, // Query count not exposed in ModelRecord; default to 0
      }));

    const activeTasks = (tasksRes.tasks ?? [])
      .filter((t) => t.status === "accepted" || t.status === "in_progress")
      .map((t) => ({
        id: String(t.taskId),
        description: t.description,
        budget: t.budget,
        status: t.status,
      }));

    return { skills, gpuResources, hostedModels, activeTasks };
  }

  // -----------------------------------------------------------------------
  // Earnings
  // -----------------------------------------------------------------------

  /**
   * Get earnings breakdown across all revenue streams.
   *
   * Fetches agent rewards, task income, staking rewards, and skill analytics
   * in parallel, then aggregates into a single summary.
   */
  async getEarnings(): Promise<ProviderEarnings> {
    const address = this.client.getAddress();

    const [agentRewards, tasks, stakingRewards, skills] = await Promise.all([
      this.client.getAgentRewards(address).catch(() => ({
        address,
        cumulativeRewards: "0",
        denom: "uclaw",
      })),
      this.client.getTasksByAssignee(address).catch(() => ({ tasks: [] })),
      this.client.getStakingRewards(address).catch(() => ({ rewards: [], total: [] })),
      this.client.getSkillsByOwner(address).catch(() => ({ skills: [] })),
    ]);

    // Agent mining rewards
    const agentMining = {
      cumulative: agentRewards.cumulativeRewards,
      denom: agentRewards.denom,
    };

    // Task income – sum budgets for completed tasks
    const completedTasks = (tasks.tasks ?? []).filter((t) => t.status === "completed");
    const totalBudget = completedTasks.reduce(
      (sum, t) => sum + BigInt(t.budget || "0"),
      0n,
    );
    const taskIncome = {
      completed: completedTasks.length,
      totalBudget: totalBudget.toString(),
    };

    // Staking rewards – sum all pending
    const pendingStaking = (stakingRewards.total ?? [])
      .filter((c) => c.denom === "uclaw")
      .reduce((sum, c) => sum + BigInt(c.amount.split(".")[0] || "0"), 0n);
    const stakingRewardsResult = { pending: pendingStaking.toString() };

    // Skill sales – sum purchase counts and estimate revenue from price * count
    const allSkills = skills.skills ?? [];
    const totalPurchaseCount = allSkills.reduce((sum, s) => sum + s.purchaseCount, 0);
    const totalSkillRevenue = allSkills.reduce(
      (sum, s) => sum + BigInt(s.price || "0") * BigInt(s.purchaseCount),
      0n,
    );
    const skillSales = {
      totalRevenue: totalSkillRevenue.toString(),
      purchaseCount: totalPurchaseCount,
    };

    // Total estimated uclaw
    const totalEstimated =
      BigInt(agentMining.cumulative) +
      totalBudget +
      pendingStaking +
      totalSkillRevenue;

    return {
      agentMining,
      taskIncome,
      stakingRewards: stakingRewardsResult,
      skillSales,
      totalEstimatedUclaw: totalEstimated.toString(),
    };
  }

  // -----------------------------------------------------------------------
  // Skills
  // -----------------------------------------------------------------------

  /**
   * Publish a skill to the marketplace.
   *
   * Delegates to `client.listSkill()` and extracts the skill ID from events.
   */
  async publishSkill(opts: {
    name: string;
    description: string;
    price: string;
    category?: string;
  }): Promise<{ txHash: string; skillId: string }> {
    const result = await this.client.listSkill({
      name: opts.name,
      description: opts.description,
      price: opts.price,
    });

    if (result.code !== 0) {
      throw new Error(`ProviderManager.publishSkill failed: ${result.rawLog}`);
    }

    // Extract skill_id from tx events
    let skillId = "0";
    for (const event of result.events) {
      if (event.type === "skill_listed") {
        const attr = event.attributes.find((a) => a.key === "skill_id");
        if (attr) {
          skillId = attr.value;
          break;
        }
      }
    }

    return { txHash: result.transactionHash, skillId };
  }

  /**
   * Update skill pricing.
   *
   * Delegates to `client.updateSkill()`.
   */
  async updateSkillPrice(skillId: number, newPrice: string): Promise<{ txHash: string }> {
    const result = await this.client.updateSkill({
      skillId,
      price: newPrice,
    });

    if (result.code !== 0) {
      throw new Error(`ProviderManager.updateSkillPrice failed: ${result.rawLog}`);
    }

    return { txHash: result.transactionHash };
  }

  /**
   * Remove a skill from the marketplace.
   *
   * Delegates to `client.delistSkill()`.
   */
  async delistSkill(skillId: number): Promise<{ txHash: string }> {
    const result = await this.client.delistSkill({ skillId });

    if (result.code !== 0) {
      throw new Error(`ProviderManager.delistSkill failed: ${result.rawLog}`);
    }

    return { txHash: result.transactionHash };
  }

  // -----------------------------------------------------------------------
  // Model Hosting
  // -----------------------------------------------------------------------

  /**
   * Host a model on the registry.
   *
   * Delegates to `client.registerModel()`.
   */
  async hostModel(opts: {
    name: string;
    framework: string;
    storageUri: string;
    accessType: "free" | "per_query" | "one_time";
    price?: string;
  }): Promise<{ txHash: string; modelId: string }> {
    const result = await this.client.registerModel({
      name: opts.name,
      description: `Model hosted by provider`,
      framework: opts.framework,
      architecture: "transformer",
      parameterCount: "0",
      license: "proprietary",
      storageType: "uri",
      storageUri: opts.storageUri,
      checksumSha256: "",
      sizeBytes: 0,
      accessType: opts.accessType,
      pricePerQueryUclaw: opts.accessType === "per_query" ? (opts.price ?? "0") : "0",
      priceOneTimeUclaw: opts.accessType === "one_time" ? (opts.price ?? "0") : "0",
    });

    return {
      txHash: result.txHash,
      modelId: result.modelId !== undefined ? String(result.modelId) : "0",
    };
  }
}
