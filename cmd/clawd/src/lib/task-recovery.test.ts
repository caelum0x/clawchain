/**
 * Tests for the crash-safe task recovery module.
 *
 * Run with: npx tsx --test src/lib/task-recovery.test.ts
 * (from the cmd/clawd directory)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync as fsWriteFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadActiveTasks,
  saveActiveTasks,
  trackTask,
  untrackTask,
  clearTrackedTasks,
  determineRecoveryAction,
  recoverOrphanedTasks,
  activeTasksFilePath,
  type ActiveTask,
  type OnChainTask,
} from "./task-recovery.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "task-recovery-test-"));
}

function sampleTask(overrides: Partial<ActiveTask> = {}): ActiveTask {
  return {
    taskId: 1,
    status: "accepted",
    assigneeAddress: "claw1agent",
    trackedAt: new Date().toISOString(),
    ...overrides,
  };
}

function sampleOnChainTask(overrides: Partial<OnChainTask> = {}): OnChainTask {
  return {
    taskId: 1,
    status: "accepted",
    assigneeAddress: "claw1agent",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Persistence (read/write)
// ---------------------------------------------------------------------------

describe("Task persistence", () => {
  let dataDir: string;

  before(() => {
    dataDir = makeTempDir();
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("loadActiveTasks returns empty array when file does not exist", () => {
    const tasks = loadActiveTasks(dataDir);
    assert.deepStrictEqual(tasks, []);
  });

  it("saveActiveTasks writes and loadActiveTasks reads back", () => {
    const tasks = [sampleTask({ taskId: 10 }), sampleTask({ taskId: 20, status: "pending" })];
    saveActiveTasks(tasks, dataDir);

    const loaded = loadActiveTasks(dataDir);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].taskId, 10);
    assert.equal(loaded[0].status, "accepted");
    assert.equal(loaded[1].taskId, 20);
    assert.equal(loaded[1].status, "pending");
  });

  it("saveActiveTasks writes atomically (temp file then rename)", () => {
    const filePath = activeTasksFilePath(dataDir);
    saveActiveTasks([sampleTask({ taskId: 99 })], dataDir);

    // The .tmp file should not remain.
    assert.equal(existsSync(filePath + ".tmp"), false);
    assert.equal(existsSync(filePath), true);

    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].taskId, 99);
  });

  it("loadActiveTasks handles malformed JSON gracefully", () => {
    const filePath = activeTasksFilePath(dataDir);
    fsWriteFileSync(filePath, "not-valid-json{{{");

    const tasks = loadActiveTasks(dataDir);
    assert.deepStrictEqual(tasks, []);
  });

  it("loadActiveTasks filters entries missing required fields", () => {
    const filePath = activeTasksFilePath(dataDir);
    const data = [
      { taskId: 1, status: "accepted", assigneeAddress: "claw1x", trackedAt: "2024-01-01" },
      { status: "accepted" }, // missing taskId
      { taskId: 2 }, // missing status
      null,
      42,
    ];
    fsWriteFileSync(filePath, JSON.stringify(data));

    const tasks = loadActiveTasks(dataDir);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].taskId, 1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Tracking helpers
// ---------------------------------------------------------------------------

describe("Task tracking", () => {
  let dataDir: string;

  before(() => {
    dataDir = makeTempDir();
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("trackTask adds a new task", () => {
    clearTrackedTasks(dataDir);
    trackTask({ taskId: 5, status: "pending", assigneeAddress: "claw1a" }, dataDir);

    const tasks = loadActiveTasks(dataDir);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].taskId, 5);
    assert.equal(tasks[0].status, "pending");
    assert.ok(tasks[0].trackedAt);
  });

  it("trackTask deduplicates and updates status", () => {
    clearTrackedTasks(dataDir);
    trackTask({ taskId: 7, status: "pending", assigneeAddress: "claw1a" }, dataDir);
    trackTask({ taskId: 7, status: "accepted", assigneeAddress: "claw1a" }, dataDir);

    const tasks = loadActiveTasks(dataDir);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].taskId, 7);
    assert.equal(tasks[0].status, "accepted");
  });

  it("untrackTask removes a task by ID", () => {
    clearTrackedTasks(dataDir);
    trackTask({ taskId: 10, status: "accepted", assigneeAddress: "claw1a" }, dataDir);
    trackTask({ taskId: 11, status: "pending", assigneeAddress: "claw1a" }, dataDir);

    untrackTask(10, dataDir);

    const tasks = loadActiveTasks(dataDir);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].taskId, 11);
  });

  it("clearTrackedTasks empties the list", () => {
    trackTask({ taskId: 20, status: "accepted", assigneeAddress: "claw1a" }, dataDir);
    clearTrackedTasks(dataDir);

    const tasks = loadActiveTasks(dataDir);
    assert.equal(tasks.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Recovery logic (determineRecoveryAction)
// ---------------------------------------------------------------------------

describe("determineRecoveryAction", () => {
  it("returns cleanup_not_found when on-chain task is null", () => {
    const local = sampleTask({ taskId: 42 });
    const result = determineRecoveryAction(local, null);
    assert.equal(result.action, "cleanup_not_found");
    assert.equal(result.taskId, 42);
  });

  it("returns resume when task is still assigned and accepted on-chain", () => {
    const local = sampleTask({ taskId: 1, status: "accepted", assigneeAddress: "claw1a" });
    const onChain = sampleOnChainTask({ taskId: 1, status: "accepted", assigneeAddress: "claw1a" });
    const result = determineRecoveryAction(local, onChain);
    assert.equal(result.action, "resume");
    assert.equal(result.taskId, 1);
  });

  it("returns resume when task is still assigned and pending on-chain", () => {
    const local = sampleTask({ taskId: 2, status: "pending", assigneeAddress: "claw1a" });
    const onChain = sampleOnChainTask({ taskId: 2, status: "pending", assigneeAddress: "claw1a" });
    const result = determineRecoveryAction(local, onChain);
    assert.equal(result.action, "resume");
  });

  it("returns cleanup_expired when task expired on-chain", () => {
    const local = sampleTask({ taskId: 3 });
    const onChain = sampleOnChainTask({ taskId: 3, status: "expired" });
    const result = determineRecoveryAction(local, onChain);
    assert.equal(result.action, "cleanup_expired");
  });

  it("returns cleanup_completed when task completed on-chain", () => {
    const local = sampleTask({ taskId: 4 });
    const onChain = sampleOnChainTask({ taskId: 4, status: "completed" });
    const result = determineRecoveryAction(local, onChain);
    assert.equal(result.action, "cleanup_completed");
  });

  it("returns cleanup_reassigned when task was reassigned to another agent", () => {
    const local = sampleTask({ taskId: 5, assigneeAddress: "claw1a" });
    const onChain = sampleOnChainTask({ taskId: 5, status: "accepted", assigneeAddress: "claw1b" });
    const result = determineRecoveryAction(local, onChain);
    assert.equal(result.action, "cleanup_reassigned");
  });

  it("returns cleanup_expired for failed status on-chain", () => {
    const local = sampleTask({ taskId: 6 });
    const onChain = sampleOnChainTask({ taskId: 6, status: "failed" });
    const result = determineRecoveryAction(local, onChain);
    assert.equal(result.action, "cleanup_expired");
  });
});

// ---------------------------------------------------------------------------
// Tests: Full recovery flow (recoverOrphanedTasks)
// ---------------------------------------------------------------------------

describe("recoverOrphanedTasks", () => {
  let dataDir: string;

  before(() => {
    dataDir = makeTempDir();
  });

  after(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("returns empty report when no orphaned tasks exist", async () => {
    clearTrackedTasks(dataDir);
    const report = await recoverOrphanedTasks(async () => null, dataDir);
    assert.equal(report.orphanedCount, 0);
    assert.equal(report.actions.length, 0);
    assert.equal(report.resumedTaskIds.length, 0);
    assert.equal(report.cleanedTaskIds.length, 0);
  });

  it("resumes tasks that are still active on-chain", async () => {
    clearTrackedTasks(dataDir);
    trackTask({ taskId: 100, status: "accepted", assigneeAddress: "claw1a" }, dataDir);
    trackTask({ taskId: 101, status: "pending", assigneeAddress: "claw1a" }, dataDir);

    const mockFetch = async (taskId: number): Promise<OnChainTask | null> => {
      if (taskId === 100) return sampleOnChainTask({ taskId: 100, status: "accepted", assigneeAddress: "claw1a" });
      if (taskId === 101) return sampleOnChainTask({ taskId: 101, status: "pending", assigneeAddress: "claw1a" });
      return null;
    };

    const report = await recoverOrphanedTasks(mockFetch, dataDir);
    assert.equal(report.orphanedCount, 2);
    assert.equal(report.resumedTaskIds.length, 2);
    assert.ok(report.resumedTaskIds.includes(100));
    assert.ok(report.resumedTaskIds.includes(101));
    assert.equal(report.cleanedTaskIds.length, 0);

    // Tasks should still be tracked.
    const remaining = loadActiveTasks(dataDir);
    assert.equal(remaining.length, 2);
  });

  it("cleans up expired and completed tasks", async () => {
    clearTrackedTasks(dataDir);
    trackTask({ taskId: 200, status: "accepted", assigneeAddress: "claw1a" }, dataDir);
    trackTask({ taskId: 201, status: "accepted", assigneeAddress: "claw1a" }, dataDir);

    const mockFetch = async (taskId: number): Promise<OnChainTask | null> => {
      if (taskId === 200) return sampleOnChainTask({ taskId: 200, status: "expired", assigneeAddress: "claw1a" });
      if (taskId === 201) return sampleOnChainTask({ taskId: 201, status: "completed", assigneeAddress: "claw1a" });
      return null;
    };

    const report = await recoverOrphanedTasks(mockFetch, dataDir);
    assert.equal(report.orphanedCount, 2);
    assert.equal(report.cleanedTaskIds.length, 2);
    assert.equal(report.resumedTaskIds.length, 0);

    // Tasks should be removed from tracker.
    const remaining = loadActiveTasks(dataDir);
    assert.equal(remaining.length, 0);
  });

  it("handles mixed resume and cleanup in one recovery pass", async () => {
    clearTrackedTasks(dataDir);
    trackTask({ taskId: 300, status: "accepted", assigneeAddress: "claw1a" }, dataDir);
    trackTask({ taskId: 301, status: "accepted", assigneeAddress: "claw1a" }, dataDir);
    trackTask({ taskId: 302, status: "pending", assigneeAddress: "claw1a" }, dataDir);

    const mockFetch = async (taskId: number): Promise<OnChainTask | null> => {
      if (taskId === 300) return sampleOnChainTask({ taskId: 300, status: "accepted", assigneeAddress: "claw1a" });
      if (taskId === 301) return sampleOnChainTask({ taskId: 301, status: "expired", assigneeAddress: "claw1a" });
      if (taskId === 302) return null; // not found on chain
      return null;
    };

    const report = await recoverOrphanedTasks(mockFetch, dataDir);
    assert.equal(report.orphanedCount, 3);
    assert.deepStrictEqual(report.resumedTaskIds, [300]);
    assert.ok(report.cleanedTaskIds.includes(301));
    assert.ok(report.cleanedTaskIds.includes(302));

    // Only the resumed task should remain tracked.
    const remaining = loadActiveTasks(dataDir);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].taskId, 300);
  });

  it("skips tasks when on-chain fetch throws (keeps them tracked for later)", async () => {
    clearTrackedTasks(dataDir);
    trackTask({ taskId: 400, status: "accepted", assigneeAddress: "claw1a" }, dataDir);
    trackTask({ taskId: 401, status: "accepted", assigneeAddress: "claw1a" }, dataDir);

    const mockFetch = async (taskId: number): Promise<OnChainTask | null> => {
      if (taskId === 400) throw new Error("network timeout");
      if (taskId === 401) return sampleOnChainTask({ taskId: 401, status: "completed", assigneeAddress: "claw1a" });
      return null;
    };

    const report = await recoverOrphanedTasks(mockFetch, dataDir);
    // Task 400 was skipped due to error, task 401 was cleaned up.
    assert.equal(report.orphanedCount, 2);
    assert.equal(report.actions.length, 1); // only 401 produced an action
    assert.equal(report.cleanedTaskIds.length, 1);
    assert.ok(report.cleanedTaskIds.includes(401));

    // Task 400 should still be tracked for next recovery.
    const remaining = loadActiveTasks(dataDir);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].taskId, 400);
  });
});
