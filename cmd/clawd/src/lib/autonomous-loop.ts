import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMnemonic, mnemonicFileExists } from "./mnemonic.js";

type TaskRecord = {
  taskId: number;
  status: string;
  description?: string;
  requirements?: string;
  delegatorAddress?: string;
  assigneeAddress?: string;
  skillId?: number;
  budget?: string;
  createdAt?: number;
};

type TasksResponse = {
  tasks?: TaskRecord[];
};

type TxResult = {
  transactionHash: string;
  code?: number;
  rawLog?: string;
};

type ClawChainClientLike = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAddress(): string;
  getTasksByAssignee(address: string): Promise<TasksResponse>;
  getReputation?(address: string): Promise<{
    found?: boolean;
    reputation?: {
      avgRatingBps?: number;
      uptimeScoreBps?: number;
      taskSlaOnTimeCount?: number;
      taskSlaLateCount?: number;
    };
  }>;
  getSkillAnalytics?(skillId: number): Promise<{
    analytics?: {
      avgRating?: number;
      purchaseCount?: number;
    };
  }>;
  acceptTask(params: { taskId: number }): Promise<TxResult>;
  completeTask(params: { taskId: number; result: string }): Promise<TxResult>;
};

type ClawChainClientConstructor = new (options: {
  rpcUrl?: string;
  mnemonic?: string;
  prefix?: string;
  gasPrice?: string;
}) => ClawChainClientLike;

type LoopDeps = {
  rpcUrl: string;
  prefix?: string;
  gasPrice?: string;
  intervalSeconds: number;
  autoComplete: boolean;
  skillExecutorCommand?: string;
  skillExecutorMap?: Record<string, string>;
  skillExecutorTimeoutSeconds: number;
  minTaskBudgetUclaw: bigint;
  minProfitUclaw: bigint;
  maxAcceptPerTick: number;
  maxPendingAcceptedTasks: number;
  allowedSkillIds: Set<number> | null;
  defaultExecutionCostUclaw: bigint;
  maxExecutionCostPerTaskUclaw: bigint;
  maxExecutionCostPerTickUclaw: bigint;
  reputationWeightBps: number;
  skillSuccessWeightBps: number;
  skillRatingWeightBps: number;
  qualityDataTtlSeconds: number;
  minQualityScoreBps: number;
};

export type AutonomousLoopHandle = {
  stop: () => Promise<void>;
};

export type AutonomousExplainResult = {
  address: string;
  pendingCount: number;
  acceptedNow: number;
  pendingCapacity: number;
  acceptLimit: number;
  policy: {
    minTaskBudgetUclaw: string;
    minProfitUclaw: string;
    minQualityScoreBps: number;
    maxAcceptPerTick: number;
    maxPendingAcceptedTasks: number;
  };
  candidates: Array<{
    rank: number;
    wouldAcceptNow: boolean;
    taskId: number;
    skillId: number;
    status: string;
    createdAt: number;
    qualityAdjustedProfitUclaw: string;
    qualityBps: number;
    reputationBps: number;
    skillSuccessBps: number;
    skillRatingBps: number;
    budgetUclaw: string;
    costUclaw: string;
    profitUclaw: string;
  }>;
};

export async function startAutonomousLoop(deps: LoopDeps): Promise<AutonomousLoopHandle | null> {
  if (!mnemonicFileExists()) {
    console.warn(`[AUTO] disabled: mnemonic missing`);
    return null;
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    console.warn(`[AUTO] disabled: failed to load mnemonic`);
    return null;
  }

  const sdk = await loadSdkModule();
  if (!sdk) {
    console.warn(`[AUTO] disabled: sdk unavailable (build sdk or set CLAWCHAIN_SDK_ENTRY)`);
    return null;
  }

  const client = new sdk.ClawChainClient({
    rpcUrl: deps.rpcUrl,
    mnemonic,
    prefix: deps.prefix,
    gasPrice: deps.gasPrice,
  });
  await client.connect();
  const address = client.getAddress();

  let closed = false;
  let running = false;
  const acceptedTaskIds = new Set<number>();
  const completedTaskIds = new Set<number>();
  const qualityCache = {
    reputation: {
      expiresAt: 0,
      value: 5000,
    },
    skillRatingBps: new Map<number, { expiresAt: number; value: number }>(),
  };

  const tick = async () => {
    if (closed || running) return;
    running = true;
    try {
      const tasks = await client.getTasksByAssignee(address);
      const list = Array.isArray(tasks.tasks) ? tasks.tasks : [];
      const quality = await buildQualityContext({
        client,
        assigneeAddress: address,
        tasks: list,
        deps,
        cache: qualityCache,
      });
      const acceptedNow = list.filter((task) => task.status === "accepted").length;
      const pendingCapacity = Math.max(0, deps.maxPendingAcceptedTasks - acceptedNow);
      const candidates = rankPendingTaskCandidates(list, acceptedTaskIds, deps, quality);
      const acceptLimit = Math.max(0, Math.min(deps.maxAcceptPerTick, pendingCapacity));
      for (const candidate of candidates.slice(0, acceptLimit)) {
        const task = candidate.task;
        const summary = candidate.economics;
        if (task.status === "pending" && !acceptedTaskIds.has(task.taskId)) {
          const tx = await client.acceptTask({ taskId: task.taskId });
          if (Number(tx.code ?? 0) === 0) {
            acceptedTaskIds.add(task.taskId);
            console.log(
              `[AUTO] accepted task=${task.taskId} score=${candidate.qualityAdjustedProfitUclaw.toString()} quality=${candidate.qualityBps} profit=${summary.profitUclaw.toString()} budget=${summary.budgetUclaw.toString()} cost=${summary.costUclaw.toString()} rep=${candidate.reputationBps} success=${candidate.skillSuccessBps} rating=${candidate.skillRatingBps} tx=${tx.transactionHash}`,
            );
          } else {
            console.warn(`[AUTO] accept failed task=${task.taskId} code=${tx.code} log=${tx.rawLog ?? ""}`);
          }
        }
      }

      let tickExecutionBudgetRemaining = deps.maxExecutionCostPerTickUclaw;
      for (const task of list) {
        if (deps.autoComplete && task.status === "accepted" && !completedTaskIds.has(task.taskId)) {
          const economics = describeTaskEconomics(task, deps);
          if (economics.costUclaw > deps.maxExecutionCostPerTaskUclaw) {
            console.log(
              `[AUTO] skip complete task=${task.taskId}: execution_cost=${economics.costUclaw.toString()} > per_task_limit=${deps.maxExecutionCostPerTaskUclaw.toString()}`,
            );
            continue;
          }
          if (economics.costUclaw > tickExecutionBudgetRemaining) {
            console.log(
              `[AUTO] skip complete task=${task.taskId}: execution_cost=${economics.costUclaw.toString()} > tick_remaining=${tickExecutionBudgetRemaining.toString()}`,
            );
            continue;
          }
          const result = await runSkillExecutorForTask(task, address, deps);
          if (!result) {
            console.warn(`[AUTO] skip complete task=${task.taskId}: no skill executor output`);
            continue;
          }
          const tx = await client.completeTask({ taskId: task.taskId, result });
          if (Number(tx.code ?? 0) === 0) {
            completedTaskIds.add(task.taskId);
            tickExecutionBudgetRemaining -= economics.costUclaw;
            console.log(`[AUTO] completed task=${task.taskId} tx=${tx.transactionHash}`);
          } else {
            console.warn(`[AUTO] complete failed task=${task.taskId} code=${tx.code} log=${tx.rawLog ?? ""}`);
          }
        }
      }
    } catch (err) {
      console.warn(`[AUTO] tick failed: ${String(err)}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, Math.max(5, deps.intervalSeconds) * 1000);
  timer.unref();
  void tick();

  console.log(`[AUTO] started for ${address} interval=${Math.max(5, deps.intervalSeconds)}s autoComplete=${deps.autoComplete}`);
  const allowedSkillsSummary = deps.allowedSkillIds ? Array.from(deps.allowedSkillIds).sort((a, b) => a - b).join(",") : "all";
  console.log(
    `[AUTO] policy minBudget=${deps.minTaskBudgetUclaw.toString()} minProfit=${deps.minProfitUclaw.toString()} maxAcceptPerTick=${deps.maxAcceptPerTick} maxPendingAccepted=${deps.maxPendingAcceptedTasks} allowedSkills=${allowedSkillsSummary}`,
  );
  console.log(
    `[AUTO] execution budget defaultCost=${deps.defaultExecutionCostUclaw.toString()} maxCostPerTask=${deps.maxExecutionCostPerTaskUclaw.toString()} maxCostPerTick=${deps.maxExecutionCostPerTickUclaw.toString()}`,
  );
  console.log(
    `[AUTO] quality weights reputation=${deps.reputationWeightBps} skillSuccess=${deps.skillSuccessWeightBps} skillRating=${deps.skillRatingWeightBps} cacheTtl=${deps.qualityDataTtlSeconds}s`,
  );
  console.log(`[AUTO] quality gate minQualityScore=${deps.minQualityScoreBps}bps`);
  if (deps.autoComplete) {
    const mappedCount = Object.keys(deps.skillExecutorMap ?? {}).length;
    if (deps.skillExecutorCommand || mappedCount > 0) {
      console.log(`[AUTO] skill executor enabled (timeout=${deps.skillExecutorTimeoutSeconds}s)`);
      if (mappedCount > 0) {
        console.log(`[AUTO] skill executor map entries=${mappedCount}`);
      }
    } else {
      console.log(`[AUTO] skill executor not configured; accepted tasks will not be auto-completed`);
    }
  }

  return {
    stop: async () => {
      closed = true;
      clearInterval(timer);
      await client.disconnect().catch(() => {});
    },
  };
}

export async function explainAutonomousCandidates(
  deps: LoopDeps & { limit?: number },
): Promise<AutonomousExplainResult> {
  if (!mnemonicFileExists()) {
    throw new Error("mnemonic missing");
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("failed to load mnemonic");
  }
  const sdk = await loadSdkModule();
  if (!sdk) {
    throw new Error("sdk unavailable (build sdk or set CLAWCHAIN_SDK_ENTRY)");
  }

  const client = new sdk.ClawChainClient({
    rpcUrl: deps.rpcUrl,
    mnemonic,
    prefix: deps.prefix,
    gasPrice: deps.gasPrice,
  });

  await client.connect();
  try {
    const address = client.getAddress();
    const tasks = await client.getTasksByAssignee(address);
    const list = Array.isArray(tasks.tasks) ? tasks.tasks : [];
    const quality = await buildQualityContext({
      client,
      assigneeAddress: address,
      tasks: list,
      deps,
      cache: {
        reputation: { expiresAt: 0, value: 5000 },
        skillRatingBps: new Map<number, { expiresAt: number; value: number }>(),
      },
    });

    const acceptedNow = list.filter((task) => task.status === "accepted").length;
    const pendingCapacity = Math.max(0, deps.maxPendingAcceptedTasks - acceptedNow);
    const ranked = rankPendingTaskCandidates(list, new Set<number>(), deps, quality);
    const acceptLimit = Math.max(0, Math.min(deps.maxAcceptPerTick, pendingCapacity));
    const limit = Math.max(1, Math.min(200, Math.floor(deps.limit ?? 20)));

    const candidates = ranked.slice(0, limit).map((c, idx) => ({
      rank: idx + 1,
      wouldAcceptNow: idx < acceptLimit,
      taskId: c.task.taskId,
      skillId: Number(c.task.skillId ?? 0),
      status: String(c.task.status ?? ""),
      createdAt: Number(c.task.createdAt ?? 0),
      qualityAdjustedProfitUclaw: c.qualityAdjustedProfitUclaw.toString(),
      qualityBps: c.qualityBps,
      reputationBps: c.reputationBps,
      skillSuccessBps: c.skillSuccessBps,
      skillRatingBps: c.skillRatingBps,
      budgetUclaw: c.economics.budgetUclaw.toString(),
      costUclaw: c.economics.costUclaw.toString(),
      profitUclaw: c.economics.profitUclaw.toString(),
    }));

    return {
      address,
      pendingCount: list.filter((x) => x.status === "pending").length,
      acceptedNow,
      pendingCapacity,
      acceptLimit,
      policy: {
        minTaskBudgetUclaw: deps.minTaskBudgetUclaw.toString(),
        minProfitUclaw: deps.minProfitUclaw.toString(),
        minQualityScoreBps: deps.minQualityScoreBps,
        maxAcceptPerTick: deps.maxAcceptPerTick,
        maxPendingAcceptedTasks: deps.maxPendingAcceptedTasks,
      },
      candidates,
    };
  } finally {
    await client.disconnect().catch(() => {});
  }
}

async function runSkillExecutorForTask(task: TaskRecord, assignee: string, deps: LoopDeps): Promise<string | null> {
  const req = parseRequirements(task.requirements);
  const reqCmd = String((req as any)?.executor?.command ?? "").trim();
  const mappedCmd = task.skillId != null ? String((deps.skillExecutorMap ?? {})[String(task.skillId)] ?? "").trim() : "";
  const cmd = reqCmd || mappedCmd || deps.skillExecutorCommand?.trim() || "";
  if (!cmd) return null;

  const payload = {
    taskId: task.taskId,
    skillId: task.skillId ?? 0,
    description: task.description ?? "",
    requirements: req,
    rawRequirements: task.requirements ?? "",
    assignee,
    timestamp: new Date().toISOString(),
  };

  const stdout = await runCommandWithJSONInput(cmd, payload, deps.skillExecutorTimeoutSeconds);
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  // If command returns JSON with a result field, use that.
  try {
    const parsed = JSON.parse(trimmed) as { result?: string };
    if (parsed?.result && typeof parsed.result === "string") {
      return parsed.result;
    }
  } catch {
    // plain text output is acceptable
  }
  return trimmed;
}

function parseRequirements(raw: string | undefined): unknown {
  const text = String(raw ?? "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function rankPendingTaskCandidates(
  tasks: TaskRecord[],
  acceptedTaskIds: Set<number>,
  deps: LoopDeps,
  quality: QualityContext,
): RankedTaskCandidate[] {
  return tasks
    .filter((task) => task.status === "pending")
    .filter((task) => !acceptedTaskIds.has(task.taskId))
    .filter((task) => isSkillAllowed(task, deps.allowedSkillIds))
    .map((task) => {
      const economics = describeTaskEconomics(task, deps);
      const reputationBps = quality.reputationBps;
      const skillSuccessBps = quality.skillSuccessBpsBySkill.get(Number(task.skillId ?? 0))
        ?? quality.globalSkillSuccessBps
        ?? 5000;
      const skillRatingBps = quality.skillRatingBpsBySkill.get(Number(task.skillId ?? 0)) ?? 5000;
      const qualityBps = weightedAverageBps(
        [
          { value: reputationBps, weight: deps.reputationWeightBps },
          { value: skillSuccessBps, weight: deps.skillSuccessWeightBps },
          { value: skillRatingBps, weight: deps.skillRatingWeightBps },
        ],
        5000,
      );
      const qualityAdjustedProfitUclaw = (economics.profitUclaw * BigInt(qualityBps)) / 10_000n;
      return {
        task,
        economics,
        qualityAdjustedProfitUclaw,
        qualityBps,
        reputationBps,
        skillSuccessBps,
        skillRatingBps,
      };
    })
    .filter((x) => x.economics.budgetUclaw >= deps.minTaskBudgetUclaw)
    .filter((x) => x.economics.profitUclaw >= deps.minProfitUclaw)
    .filter((x) => x.qualityBps >= deps.minQualityScoreBps)
    .sort((a, b) => {
      if (a.qualityAdjustedProfitUclaw > b.qualityAdjustedProfitUclaw) return -1;
      if (a.qualityAdjustedProfitUclaw < b.qualityAdjustedProfitUclaw) return 1;
      if (a.economics.profitUclaw > b.economics.profitUclaw) return -1;
      if (a.economics.profitUclaw < b.economics.profitUclaw) return 1;
      if (a.economics.budgetUclaw > b.economics.budgetUclaw) return -1;
      if (a.economics.budgetUclaw < b.economics.budgetUclaw) return 1;
      return Number(a.task.createdAt ?? 0) - Number(b.task.createdAt ?? 0);
    });
}

function isSkillAllowed(task: TaskRecord, allowedSkillIds: Set<number> | null): boolean {
  if (!allowedSkillIds || allowedSkillIds.size === 0) return true;
  const skillId = Number(task.skillId ?? 0);
  return allowedSkillIds.has(skillId);
}

function describeTaskEconomics(
  task: TaskRecord,
  deps: Pick<LoopDeps, "defaultExecutionCostUclaw">,
): { budgetUclaw: bigint; costUclaw: bigint; profitUclaw: bigint } {
  const req = parseRequirements(task.requirements) as Record<string, unknown>;
  const budgetUclaw = parseUclawAmount(task.budget ?? "0");
  const reqCost = extractExecutionCostUclaw(req);
  const costUclaw = reqCost ?? deps.defaultExecutionCostUclaw;
  const profitUclaw = budgetUclaw - costUclaw;
  return { budgetUclaw, costUclaw, profitUclaw };
}

function extractExecutionCostUclaw(requirements: Record<string, unknown> | null | undefined): bigint | null {
  if (!requirements || typeof requirements !== "object") return null;
  const keys = [
    "estimated_cost_uclaw",
    "estimatedCostUclaw",
    "execution_cost_uclaw",
    "executionCostUclaw",
  ];
  for (const key of keys) {
    const value = requirements[key];
    const n = toBigIntValue(value);
    if (n != null) return n;
  }
  const executor = requirements.executor;
  if (executor && typeof executor === "object") {
    const nested = extractExecutionCostUclaw(executor as Record<string, unknown>);
    if (nested != null) return nested;
  }
  return null;
}

function toBigIntValue(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return null;
    if (/^\d+$/.test(v)) return BigInt(v);
    if (/^\d+uclaw$/i.test(v)) return BigInt(v.slice(0, -5));
  }
  return null;
}

function parseUclawAmount(value: string): bigint {
  const v = String(value ?? "").trim();
  if (!v) return 0n;
  if (/^\d+$/.test(v)) return BigInt(v);
  const m = v.match(/^(\d+)uclaw$/i);
  if (m) return BigInt(m[1]);
  return 0n;
}

type RankedTaskCandidate = {
  task: TaskRecord;
  economics: {
    budgetUclaw: bigint;
    costUclaw: bigint;
    profitUclaw: bigint;
  };
  qualityAdjustedProfitUclaw: bigint;
  qualityBps: number;
  reputationBps: number;
  skillSuccessBps: number;
  skillRatingBps: number;
};

type QualityContext = {
  reputationBps: number;
  skillSuccessBpsBySkill: Map<number, number>;
  skillRatingBpsBySkill: Map<number, number>;
  globalSkillSuccessBps: number;
};

async function buildQualityContext(options: {
  client: ClawChainClientLike;
  assigneeAddress: string;
  tasks: TaskRecord[];
  deps: LoopDeps;
  cache: {
    reputation: { expiresAt: number; value: number };
    skillRatingBps: Map<number, { expiresAt: number; value: number }>;
  };
}): Promise<QualityContext> {
  const { client, assigneeAddress, tasks, deps, cache } = options;
  const now = Date.now();
  const ttlMs = Math.max(5, deps.qualityDataTtlSeconds) * 1000;

  let reputationBps = cache.reputation.value;
  if (now >= cache.reputation.expiresAt) {
    const fetched = await fetchReputationQualityBps(client, assigneeAddress).catch(() => null);
    if (fetched != null) {
      reputationBps = fetched;
      cache.reputation = { expiresAt: now + ttlMs, value: fetched };
    }
  }

  const { bySkill, global } = computeSkillSuccessFromTasks(tasks);
  const skillIds = new Set<number>();
  for (const task of tasks) {
    const skillId = Number(task.skillId ?? 0);
    if (skillId > 0) skillIds.add(skillId);
  }

  const skillRatingBpsBySkill = new Map<number, number>();
  for (const skillId of skillIds) {
    const cached = cache.skillRatingBps.get(skillId);
    if (cached && cached.expiresAt > now) {
      skillRatingBpsBySkill.set(skillId, cached.value);
      continue;
    }
    const fetched = await fetchSkillRatingBps(client, skillId).catch(() => null);
    if (fetched != null) {
      cache.skillRatingBps.set(skillId, { expiresAt: now + ttlMs, value: fetched });
      skillRatingBpsBySkill.set(skillId, fetched);
    } else if (cached) {
      skillRatingBpsBySkill.set(skillId, cached.value);
    }
  }

  return {
    reputationBps,
    skillSuccessBpsBySkill: bySkill,
    skillRatingBpsBySkill,
    globalSkillSuccessBps: global,
  };
}

async function fetchReputationQualityBps(client: ClawChainClientLike, assigneeAddress: string): Promise<number | null> {
  if (!client.getReputation) return null;
  const res = await client.getReputation(assigneeAddress);
  if (!res?.found || !res.reputation) return null;
  const uptimeBps = clampBps(res.reputation.uptimeScoreBps ?? 0);
  const ratingBps = clampBps(res.reputation.avgRatingBps ?? 0);
  const onTime = Number(res.reputation.taskSlaOnTimeCount ?? 0);
  const late = Number(res.reputation.taskSlaLateCount ?? 0);
  const total = onTime + late;
  const slaBps = total > 0 ? clampBps(Math.round((onTime * 10_000) / total)) : 5000;
  return weightedAverageBps(
    [
      { value: uptimeBps, weight: 5000 },
      { value: ratingBps, weight: 3000 },
      { value: slaBps, weight: 2000 },
    ],
    5000,
  );
}

async function fetchSkillRatingBps(client: ClawChainClientLike, skillId: number): Promise<number | null> {
  if (!client.getSkillAnalytics || skillId <= 0) return null;
  const res = await client.getSkillAnalytics(skillId);
  const avg = Number(res?.analytics?.avgRating ?? 0);
  if (!Number.isFinite(avg) || avg <= 0) return 5000;
  // avgRating may arrive as 0..5 stars or already bps-like.
  if (avg > 5) {
    return clampBps(Math.round(avg));
  }
  return clampBps(Math.round((avg / 5) * 10_000));
}

function computeSkillSuccessFromTasks(tasks: TaskRecord[]): { bySkill: Map<number, number>; global: number } {
  const perSkill = new Map<number, { success: number; terminal: number }>();
  let globalSuccess = 0;
  let globalTerminal = 0;
  for (const task of tasks) {
    const status = String(task.status ?? "").trim().toLowerCase();
    if (!status) continue;
    const success = isSuccessfulTaskStatus(status);
    const terminal = success || isTerminalFailureTaskStatus(status);
    if (!terminal) continue;
    const skillId = Number(task.skillId ?? 0);
    const entry = perSkill.get(skillId) ?? { success: 0, terminal: 0 };
    entry.terminal += 1;
    if (success) entry.success += 1;
    perSkill.set(skillId, entry);
    globalTerminal += 1;
    if (success) globalSuccess += 1;
  }

  const bySkill = new Map<number, number>();
  for (const [skillId, stats] of perSkill.entries()) {
    if (stats.terminal <= 0) continue;
    bySkill.set(skillId, clampBps(Math.round((stats.success * 10_000) / stats.terminal)));
  }

  const global = globalTerminal > 0
    ? clampBps(Math.round((globalSuccess * 10_000) / globalTerminal))
    : 5000;
  return { bySkill, global };
}

function isSuccessfulTaskStatus(status: string): boolean {
  return status === "completed" || status === "complete" || status === "done" || status === "success";
}

function isTerminalFailureTaskStatus(status: string): boolean {
  return (
    status === "failed" ||
    status === "rejected" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "expired" ||
    status === "timeout" ||
    status === "timed_out" ||
    status === "aborted" ||
    status === "disputed"
  );
}

function weightedAverageBps(items: Array<{ value: number; weight: number }>, fallback: number): number {
  let num = 0;
  let den = 0;
  for (const item of items) {
    const value = clampBps(item.value);
    const weight = Math.max(0, Math.trunc(item.weight));
    if (weight <= 0) continue;
    num += value * weight;
    den += weight;
  }
  if (den <= 0) return clampBps(fallback);
  return clampBps(Math.round(num / den));
}

function clampBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const n = Math.round(value);
  if (n < 0) return 0;
  if (n > 10_000) return 10_000;
  return n;
}

function runCommandWithJSONInput(command: string, payload: unknown, timeoutSeconds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL?.trim() || "zsh";
    const child = spawn(shell, ["-lc", command], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = Math.max(5, timeoutSeconds) * 1000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`skill executor timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`skill executor exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function loadSdkModule(): Promise<{ ClawChainClient: ClawChainClientConstructor } | null> {
  const explicit = process.env.CLAWCHAIN_SDK_ENTRY?.trim();
  if (explicit) {
    try {
      return (await import(pathToFileURL(explicit).href)) as { ClawChainClient: ClawChainClientConstructor };
    } catch {
      return null;
    }
  }

  try {
    const pkgName = "@clawchain/sdk";
    const pkg = (await import(pkgName)) as { ClawChainClient: ClawChainClientConstructor };
    if (pkg?.ClawChainClient) return pkg;
  } catch {
    // fallback below
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..", "..", "..", "..");
  const candidates = [join(root, "sdk", "dist", "index.js"), join(root, "sdk", "src", "index.ts")];
  for (const candidate of candidates) {
    try {
      const mod = (await import(pathToFileURL(candidate).href)) as { ClawChainClient: ClawChainClientConstructor };
      if (mod?.ClawChainClient) return mod;
    } catch {
      // try next
    }
  }
  return null;
}
