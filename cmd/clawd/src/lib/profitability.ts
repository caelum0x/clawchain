/**
 * Profitability controls for the autonomous agent loop.
 *
 * Manages a `~/.clawd/profitability.json` config that determines
 * which tasks are worth accepting based on budget, capability, and
 * auto-accept preferences.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfitabilityConfig = {
  /** Minimum task budget in uclaw to accept. Default "0". */
  minTaskBudgetUclaw: string;
  /** Maximum concurrent tasks to run. Default 3. */
  maxConcurrentTasks: number;
  /** Capability filter — only accept tasks matching these keywords. Empty means accept all. */
  capabilityFilter: string[];
  /** Whether to auto-accept tasks that pass all filters. Default true. */
  autoAccept: boolean;
  /** Reject tasks from delegators below this reputation score. Default 0 (no filter). */
  rejectBelowReputation: number;
};

export type TaskCandidate = {
  budget: string;
  description: string;
  requirements?: string;
  skillId?: string;
};

export type AcceptDecision = {
  accept: boolean;
  reason: string;
};

// ---------------------------------------------------------------------------
// Config path
// ---------------------------------------------------------------------------

const CLAWD_HOME = process.env.CLAWD_HOME ?? join(homedir(), ".clawd");
const PROFITABILITY_CONFIG_PATH = join(CLAWD_HOME, "profitability.json");

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ProfitabilityConfig = {
  minTaskBudgetUclaw: "0",
  maxConcurrentTasks: 3,
  capabilityFilter: [],
  autoAccept: true,
  rejectBelowReputation: 0,
};

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

/**
 * Load the profitability config from disk. Returns defaults if the file
 * does not exist or is unparseable.
 */
export function loadProfitabilityConfig(): ProfitabilityConfig {
  try {
    if (!existsSync(PROFITABILITY_CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = readFileSync(PROFITABILITY_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ProfitabilityConfig>;
    return {
      minTaskBudgetUclaw:
        typeof parsed.minTaskBudgetUclaw === "string"
          ? parsed.minTaskBudgetUclaw
          : DEFAULT_CONFIG.minTaskBudgetUclaw,
      maxConcurrentTasks:
        typeof parsed.maxConcurrentTasks === "number"
          ? parsed.maxConcurrentTasks
          : DEFAULT_CONFIG.maxConcurrentTasks,
      capabilityFilter: Array.isArray(parsed.capabilityFilter)
        ? parsed.capabilityFilter
        : DEFAULT_CONFIG.capabilityFilter,
      autoAccept:
        typeof parsed.autoAccept === "boolean"
          ? parsed.autoAccept
          : DEFAULT_CONFIG.autoAccept,
      rejectBelowReputation:
        typeof parsed.rejectBelowReputation === "number"
          ? parsed.rejectBelowReputation
          : DEFAULT_CONFIG.rejectBelowReputation,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save profitability config to disk, creating the directory if needed.
 */
export function saveProfitabilityConfig(config: ProfitabilityConfig): void {
  mkdirSync(dirname(PROFITABILITY_CONFIG_PATH), { recursive: true });
  writeFileSync(
    PROFITABILITY_CONFIG_PATH,
    JSON.stringify(config, null, 2) + "\n",
  );
}

// ---------------------------------------------------------------------------
// Task acceptance filter
// ---------------------------------------------------------------------------

/**
 * Determine whether a task should be accepted based on profitability controls.
 *
 * Checks (in order):
 * 1. autoAccept must be enabled
 * 2. budget must meet minimum threshold
 * 3. capability filter (if set) must match task description or requirements
 *
 * Returns `{ accept, reason }` explaining the decision.
 */
export function shouldAcceptTask(
  task: TaskCandidate,
  config: ProfitabilityConfig,
): AcceptDecision {
  // 1. Auto-accept disabled
  if (!config.autoAccept) {
    return { accept: false, reason: "auto-accept is disabled" };
  }

  // 2. Budget check
  const minBudget = BigInt(config.minTaskBudgetUclaw || "0");
  const taskBudget = BigInt(task.budget || "0");
  if (taskBudget < minBudget) {
    return {
      accept: false,
      reason: `budget ${task.budget} uclaw is below minimum ${config.minTaskBudgetUclaw} uclaw`,
    };
  }

  // 3. Capability filter
  if (config.capabilityFilter.length > 0) {
    const searchText = [
      task.description ?? "",
      task.requirements ?? "",
      task.skillId ?? "",
    ]
      .join(" ")
      .toLowerCase();

    const matched = config.capabilityFilter.some((cap) =>
      searchText.includes(cap.toLowerCase()),
    );

    if (!matched) {
      return {
        accept: false,
        reason: `task does not match capability filter [${config.capabilityFilter.join(", ")}]`,
      };
    }
  }

  // All checks passed
  return { accept: true, reason: "task meets all profitability criteria" };
}
