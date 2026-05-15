/**
 * Crash-safe task recovery for the clawd agent runtime.
 *
 * Persists in-progress tasks to a local JSON file so that after an unexpected
 * process death the runtime can determine which tasks were active, compare
 * against on-chain state, and decide whether to resume or clean up.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLAWD_HOME } from "./paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Locally-tracked in-progress task. */
export type ActiveTask = {
  /** On-chain task ID. */
  taskId: number;
  /** Last known on-chain status when we started tracking locally. */
  status: "pending" | "accepted";
  /** This agent's address (the assignee). */
  assigneeAddress: string;
  /** ISO timestamp when this task was added to the local tracker. */
  trackedAt: string;
  /** Optional description for debugging. */
  description?: string;
  /** Optional skill ID. */
  skillId?: number;
};

/** On-chain task state returned from the REST API or gRPC query. */
export type OnChainTask = {
  taskId: number;
  status: string;
  assigneeAddress: string;
  description?: string;
  skillId?: number;
  budget?: string;
  createdAt?: number;
  deadlineBlocks?: number;
};

/** Result of reconciling a single orphaned task against on-chain state. */
export type RecoveryAction =
  | { action: "resume"; taskId: number; onChainStatus: string }
  | { action: "cleanup_expired"; taskId: number; onChainStatus: string }
  | { action: "cleanup_reassigned"; taskId: number; onChainStatus: string }
  | { action: "cleanup_completed"; taskId: number; onChainStatus: string }
  | { action: "cleanup_not_found"; taskId: number };

/** Summary of a recovery run. */
export type RecoveryReport = {
  orphanedCount: number;
  actions: RecoveryAction[];
  resumedTaskIds: number[];
  cleanedTaskIds: number[];
};

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

/** Default path for the active tasks persistence file. */
export function activeTasksFilePath(dataDir?: string): string {
  return join(dataDir ?? CLAWD_HOME, "active_tasks.json");
}

// ---------------------------------------------------------------------------
// Persistence: read / write active tasks
// ---------------------------------------------------------------------------

/**
 * Load the active tasks file from disk. Returns an empty array if the file
 * does not exist or is malformed.
 */
export function loadActiveTasks(dataDir?: string): ActiveTask[] {
  const filePath = activeTasksFilePath(dataDir);
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic validation: each entry must have taskId and status.
    return parsed.filter(
      (entry: unknown) =>
        entry != null &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).taskId === "number" &&
        typeof (entry as Record<string, unknown>).status === "string",
    ) as ActiveTask[];
  } catch {
    return [];
  }
}

/**
 * Persist the active tasks list to disk atomically (write-then-rename).
 */
export function saveActiveTasks(tasks: ActiveTask[], dataDir?: string): void {
  const filePath = activeTasksFilePath(dataDir);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = filePath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(tasks, null, 2) + "\n");
  renameSync(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Tracking helpers (used by the autonomous loop)
// ---------------------------------------------------------------------------

/**
 * Add a task to the local tracker. Deduplicates by taskId.
 */
export function trackTask(task: Omit<ActiveTask, "trackedAt">, dataDir?: string): void {
  const existing = loadActiveTasks(dataDir);
  const alreadyTracked = existing.some((t) => t.taskId === task.taskId);
  if (alreadyTracked) {
    // Update status if it changed.
    const updated = existing.map((t) =>
      t.taskId === task.taskId ? { ...t, status: task.status } : t,
    );
    saveActiveTasks(updated, dataDir);
    return;
  }
  existing.push({
    ...task,
    trackedAt: new Date().toISOString(),
  });
  saveActiveTasks(existing, dataDir);
}

/**
 * Remove a task from the local tracker (e.g. after completion or cleanup).
 */
export function untrackTask(taskId: number, dataDir?: string): void {
  const existing = loadActiveTasks(dataDir);
  const filtered = existing.filter((t) => t.taskId !== taskId);
  saveActiveTasks(filtered, dataDir);
}

/**
 * Remove all tasks from the local tracker.
 */
export function clearTrackedTasks(dataDir?: string): void {
  saveActiveTasks([], dataDir);
}

// ---------------------------------------------------------------------------
// Recovery logic
// ---------------------------------------------------------------------------

/**
 * Determine the recovery action for a single orphaned local task given the
 * on-chain state of that task (or null if the task was not found on-chain).
 */
export function determineRecoveryAction(
  localTask: ActiveTask,
  onChainTask: OnChainTask | null,
): RecoveryAction {
  if (!onChainTask) {
    return { action: "cleanup_not_found", taskId: localTask.taskId };
  }

  const chainStatus = onChainTask.status.toLowerCase();

  // Task was completed or cancelled on-chain while we were down.
  if (chainStatus === "completed" || chainStatus === "cancelled" || chainStatus === "canceled") {
    return { action: "cleanup_completed", taskId: localTask.taskId, onChainStatus: chainStatus };
  }

  // Task expired on-chain.
  if (chainStatus === "expired" || chainStatus === "failed" || chainStatus === "timeout" || chainStatus === "timed_out") {
    return { action: "cleanup_expired", taskId: localTask.taskId, onChainStatus: chainStatus };
  }

  // Task is still assigned to us — resume.
  if (onChainTask.assigneeAddress === localTask.assigneeAddress) {
    if (chainStatus === "pending" || chainStatus === "accepted") {
      return { action: "resume", taskId: localTask.taskId, onChainStatus: chainStatus };
    }
  }

  // Task was reassigned to someone else, or in an unknown state — clean up.
  if (onChainTask.assigneeAddress !== localTask.assigneeAddress) {
    return { action: "cleanup_reassigned", taskId: localTask.taskId, onChainStatus: chainStatus };
  }

  // Fallback: unknown status on-chain that's not active — clean up as expired.
  return { action: "cleanup_expired", taskId: localTask.taskId, onChainStatus: chainStatus };
}

/**
 * Perform crash recovery on startup. This is the main entry point.
 *
 * 1. Load local active_tasks.json.
 * 2. For each orphaned task, query on-chain state.
 * 3. Decide: resume, or clean up.
 * 4. Update the local tracker to reflect the recovery decisions.
 *
 * @param fetchOnChainTask - Callback to query a single task from the chain.
 *   Should return null if the task is not found.
 * @param dataDir - Override the data directory (defaults to CLAWD_HOME).
 * @returns A RecoveryReport summarising what was done.
 */
export async function recoverOrphanedTasks(
  fetchOnChainTask: (taskId: number) => Promise<OnChainTask | null>,
  dataDir?: string,
): Promise<RecoveryReport> {
  const orphaned = loadActiveTasks(dataDir);
  if (orphaned.length === 0) {
    return { orphanedCount: 0, actions: [], resumedTaskIds: [], cleanedTaskIds: [] };
  }

  const actions: RecoveryAction[] = [];
  const resumedTaskIds: number[] = [];
  const cleanedTaskIds: number[] = [];

  for (const localTask of orphaned) {
    let onChainTask: OnChainTask | null = null;
    try {
      onChainTask = await fetchOnChainTask(localTask.taskId);
    } catch {
      // If we can't reach the chain, skip this task — it stays tracked for
      // the next recovery attempt.
      continue;
    }

    const decision = determineRecoveryAction(localTask, onChainTask);
    actions.push(decision);

    if (decision.action === "resume") {
      // Update the tracked status to match on-chain.
      trackTask(
        {
          taskId: localTask.taskId,
          status: decision.onChainStatus as "pending" | "accepted",
          assigneeAddress: localTask.assigneeAddress,
          description: localTask.description,
          skillId: localTask.skillId,
        },
        dataDir,
      );
      resumedTaskIds.push(localTask.taskId);
    } else {
      // Remove from tracker.
      untrackTask(localTask.taskId, dataDir);
      cleanedTaskIds.push(localTask.taskId);
    }
  }

  return {
    orphanedCount: orphaned.length,
    actions,
    resumedTaskIds,
    cleanedTaskIds,
  };
}

// ---------------------------------------------------------------------------
// REST helper: fetch task from chain via LCD endpoint
// ---------------------------------------------------------------------------

/**
 * Create a fetchOnChainTask function that queries the chain REST API.
 */
export function createRestTaskFetcher(
  restUrl: string,
): (taskId: number) => Promise<OnChainTask | null> {
  const base = restUrl.replace(/\/+$/, "");
  return async (taskId: number): Promise<OnChainTask | null> => {
    const url = `${base}/clawchain/agent/v1/task/${taskId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    if (data.found === false) return null;

    return {
      taskId: Number(data.taskId ?? data.task_id ?? taskId),
      status: String(data.status ?? "unknown"),
      assigneeAddress: String(data.assigneeAddress ?? data.assignee_address ?? ""),
      description: data.description != null ? String(data.description) : undefined,
      skillId: data.skillId != null || data.skill_id != null
        ? Number(data.skillId ?? data.skill_id ?? 0)
        : undefined,
      budget: data.budget != null ? String(data.budget) : undefined,
      createdAt: data.createdAt != null || data.created_at != null
        ? Number(data.createdAt ?? data.created_at ?? 0)
        : undefined,
      deadlineBlocks: data.deadlineBlocks != null || data.deadline_blocks != null
        ? Number(data.deadlineBlocks ?? data.deadline_blocks ?? 0)
        : undefined,
    };
  };
}
