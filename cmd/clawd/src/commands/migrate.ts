/**
 * `clawd migrate` subcommands — state migration tooling for chain upgrades.
 *
 * Provides export, validate, diff, readiness-check, and history commands
 * to assist operators with chain state migrations during upgrades.
 */

import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { loadClawdConfig } from "../lib/config.js";
import { table } from "../lib/format.js";
import { CLAWCHAIN_HOME, CLAWD_HOME } from "../lib/paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MigrateExportOptions = {
  height?: string;
  json?: boolean;
};

export type MigrateValidateOptions = {
  file?: string;
  json?: boolean;
};

export type MigrateDiffOptions = {
  old: string;
  new: string;
  json?: boolean;
};

export type MigrateCheckOptions = {
  version?: string;
  json?: boolean;
};

export type MigrateHistoryOptions = {
  json?: boolean;
};

type ValidationResult = {
  name: string;
  pass: boolean;
  detail: string;
};

type ModuleStats = {
  name: string;
  present: boolean;
  counts: Record<string, number>;
};

type DiffEntry = {
  module: string;
  field: string;
  old: number | string;
  new: number | string;
  delta: string;
};

type CheckItem = {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
};

type HistoryEntry = {
  filename: string;
  chainId: string;
  height: string;
  date: string;
  sizeBytes: number;
  sizeHuman: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = join(CLAWD_HOME, "migrations");

const KNOWN_MODULES = [
  "agent",
  "privacy",
  "marketplace",
  "governance",
  "staking",
  "bank",
  "auth",
  "clawchain",
  "reputation",
  "messaging",
  "modelregistry",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureMigrationsDir(): void {
  if (!existsSync(MIGRATIONS_DIR)) {
    mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function loadStateFile(filePath: string): any {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    throw new Error(`file not found: ${resolved}`);
  }
  const raw = readFileSync(resolved, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in ${resolved}: ${String(err)}`);
  }
}

function countArray(obj: any, ...keys: string[]): number {
  let cursor = obj;
  for (const k of keys) {
    if (cursor == null || typeof cursor !== "object") return 0;
    cursor = cursor[k];
  }
  return Array.isArray(cursor) ? cursor.length : 0;
}

function countKeys(obj: any, ...keys: string[]): number {
  let cursor = obj;
  for (const k of keys) {
    if (cursor == null || typeof cursor !== "object") return 0;
    cursor = cursor[k];
  }
  if (cursor != null && typeof cursor === "object" && !Array.isArray(cursor)) {
    return Object.keys(cursor).length;
  }
  return 0;
}

function extractModuleStats(appState: any): ModuleStats[] {
  const results: ModuleStats[] = [];

  // agent
  const agent = appState?.agent;
  results.push({
    name: "agent",
    present: agent != null,
    counts: {
      agents: countArray(agent, "agents") + countArray(agent, "agent_list"),
      tasks: countArray(agent, "tasks") + countArray(agent, "task_list"),
    },
  });

  // privacy
  const privacy = appState?.privacy;
  results.push({
    name: "privacy",
    present: privacy != null,
    counts: {
      nullifiers: countArray(privacy, "nullifiers") + countArray(privacy, "nullifier_list"),
      commitments: countArray(privacy, "commitments") + countArray(privacy, "commitment_list"),
      commitment_tree_root: privacy?.commitment_tree_root ? 1 : 0,
    },
  });

  // marketplace
  const marketplace = appState?.marketplace;
  results.push({
    name: "marketplace",
    present: marketplace != null,
    counts: {
      skills: countArray(marketplace, "skills") + countArray(marketplace, "skill_list"),
      escrows: countArray(marketplace, "escrows") + countArray(marketplace, "escrow_list"),
    },
  });

  // governance
  const gov = appState?.gov ?? appState?.governance;
  results.push({
    name: "governance",
    present: gov != null,
    counts: {
      proposals: countArray(gov, "proposals"),
    },
  });

  // staking
  const staking = appState?.staking;
  results.push({
    name: "staking",
    present: staking != null,
    counts: {
      validators: countArray(staking, "validators"),
      delegations: countArray(staking, "delegations"),
    },
  });

  // bank
  const bank = appState?.bank;
  results.push({
    name: "bank",
    present: bank != null,
    counts: {
      balances: countArray(bank, "balances"),
      supply: countArray(bank, "supply"),
    },
  });

  // auth
  const auth = appState?.auth;
  results.push({
    name: "auth",
    present: auth != null,
    counts: {
      accounts: countArray(auth, "accounts"),
    },
  });

  return results;
}

// ---------------------------------------------------------------------------
// clawd migrate export
// ---------------------------------------------------------------------------

/** Export chain state at a given height. */
export async function runMigrateExport(
  opts: MigrateExportOptions,
): Promise<void> {
  const cfg = loadClawdConfig();
  const binaryPath = cfg.nodeBinaryPath ?? "clawchaind";
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;

  ensureMigrationsDir();

  // Build command
  const heightArg = opts.height ? ` --height ${opts.height}` : "";
  const homeArg = nodeHome ? ` --home ${nodeHome}` : "";
  const cmd = `${binaryPath} export${heightArg}${homeArg} 2>/dev/null`;

  let exportedJson: string;
  try {
    exportedJson = execSync(cmd, {
      encoding: "utf-8",
      maxBuffer: 512 * 1024 * 1024, // 512 MB
      timeout: 300_000, // 5 minutes
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: false, error: `export failed: ${message}` }, null, 2) + "\n",
      );
    } else {
      console.error(`Export failed: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  // Parse and validate
  let genesis: any;
  try {
    genesis = JSON.parse(exportedJson);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: false, error: `invalid JSON from export: ${message}` }, null, 2) + "\n",
      );
    } else {
      console.error(`Exported state is not valid JSON: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  const chainId = genesis.chain_id ?? cfg.chainId ?? "unknown";
  const height =
    opts.height ??
    genesis.initial_height ??
    genesis.app_state?.auth?.params?.max_memo_characters
      ? "latest"
      : "latest";
  const exportHeight = opts.height ?? "latest";

  // Derive filename
  const safeChainId = chainId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${safeChainId}-${exportHeight}.json`;
  const outPath = join(MIGRATIONS_DIR, filename);

  writeFileSync(outPath, exportedJson, "utf-8");
  const stat = statSync(outPath);

  // Gather stats
  const appState = genesis.app_state ?? {};
  const moduleCount = Object.keys(appState).length;
  const accountCount = countArray(appState, "auth", "accounts");
  const blockHeight = genesis.initial_height ?? exportHeight;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          file: outPath,
          sizeBytes: stat.size,
          sizeHuman: formatBytes(stat.size),
          chainId,
          blockHeight,
          moduleCount,
          accountCount,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("clawd migrate export\n");
  console.log(`  File:           ${outPath}`);
  console.log(`  Size:           ${formatBytes(stat.size)}`);
  console.log(`  Chain ID:       ${chainId}`);
  console.log(`  Block height:   ${blockHeight}`);
  console.log(`  Module count:   ${moduleCount}`);
  console.log(`  Account count:  ${accountCount}`);
  console.log();
}

// ---------------------------------------------------------------------------
// clawd migrate validate
// ---------------------------------------------------------------------------

/** Validate a genesis/state file structure and module state. */
export async function runMigrateValidate(
  opts: MigrateValidateOptions,
): Promise<void> {
  const cfg = loadClawdConfig();
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;

  // Resolve file path
  const filePath =
    opts.file ?? join(nodeHome, "config", "genesis.json");

  const results: ValidationResult[] = [];

  // Check file exists
  if (!existsSync(filePath)) {
    results.push({
      name: "File exists",
      pass: false,
      detail: `not found: ${filePath}`,
    });
    outputValidateResults(results, opts.json);
    return;
  }

  results.push({
    name: "File exists",
    pass: true,
    detail: filePath,
  });

  // Parse JSON
  let genesis: any;
  try {
    const raw = readFileSync(filePath, "utf-8");
    genesis = JSON.parse(raw);
  } catch (err) {
    results.push({
      name: "Valid JSON",
      pass: false,
      detail: `parse error: ${String(err)}`,
    });
    outputValidateResults(results, opts.json);
    return;
  }

  results.push({
    name: "Valid JSON",
    pass: true,
    detail: "parsed successfully",
  });

  // Required fields
  if (genesis.chain_id) {
    results.push({
      name: "chain_id present",
      pass: true,
      detail: genesis.chain_id,
    });
  } else {
    results.push({
      name: "chain_id present",
      pass: false,
      detail: "missing chain_id field",
    });
  }

  if (genesis.genesis_time) {
    const parsed = new Date(genesis.genesis_time);
    if (Number.isNaN(parsed.getTime())) {
      results.push({
        name: "genesis_time valid",
        pass: false,
        detail: `invalid timestamp: ${genesis.genesis_time}`,
      });
    } else {
      results.push({
        name: "genesis_time valid",
        pass: true,
        detail: genesis.genesis_time,
      });
    }
  } else {
    results.push({
      name: "genesis_time present",
      pass: false,
      detail: "missing genesis_time field",
    });
  }

  const appState = genesis.app_state;
  if (!appState || typeof appState !== "object") {
    results.push({
      name: "app_state present",
      pass: false,
      detail: "missing or invalid app_state",
    });
    outputValidateResults(results, opts.json);
    return;
  }

  results.push({
    name: "app_state present",
    pass: true,
    detail: `${Object.keys(appState).length} modules`,
  });

  // Module-level validation
  const moduleStats = extractModuleStats(appState);

  // agent
  const agentStats = moduleStats.find((m) => m.name === "agent");
  if (agentStats?.present) {
    results.push({
      name: "agent module",
      pass: true,
      detail: `${agentStats.counts.agents} agent(s), ${agentStats.counts.tasks} task(s)`,
    });
  } else {
    results.push({
      name: "agent module",
      pass: false,
      detail: "agent state not found in app_state",
    });
  }

  // privacy
  const privacyStats = moduleStats.find((m) => m.name === "privacy");
  if (privacyStats?.present) {
    const rootPresent = privacyStats.counts.commitment_tree_root > 0;
    results.push({
      name: "privacy module",
      pass: true,
      detail: `tree_root=${rootPresent ? "present" : "empty"}, ${privacyStats.counts.nullifiers} nullifier(s)`,
    });
  } else {
    results.push({
      name: "privacy module",
      pass: false,
      detail: "privacy state not found in app_state",
    });
  }

  // marketplace
  const marketStats = moduleStats.find((m) => m.name === "marketplace");
  if (marketStats?.present) {
    results.push({
      name: "marketplace module",
      pass: true,
      detail: `${marketStats.counts.skills} skill(s), ${marketStats.counts.escrows} escrow(s)`,
    });
  } else {
    results.push({
      name: "marketplace module",
      pass: false,
      detail: "marketplace state not found in app_state",
    });
  }

  // governance
  const govStats = moduleStats.find((m) => m.name === "governance");
  if (govStats?.present) {
    results.push({
      name: "governance module",
      pass: true,
      detail: `${govStats.counts.proposals} proposal(s)`,
    });
  } else {
    results.push({
      name: "governance module",
      pass: false,
      detail: "governance/gov state not found in app_state",
    });
  }

  // staking
  const stakingStats = moduleStats.find((m) => m.name === "staking");
  if (stakingStats?.present) {
    results.push({
      name: "staking module",
      pass: true,
      detail: `${stakingStats.counts.validators} validator(s), ${stakingStats.counts.delegations} delegation(s)`,
    });
  } else {
    results.push({
      name: "staking module",
      pass: false,
      detail: "staking state not found in app_state",
    });
  }

  outputValidateResults(results, opts.json);
}

function outputValidateResults(
  results: ValidationResult[],
  json?: boolean,
): void {
  const allPassed = results.every((r) => r.pass);

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: allPassed,
          passed: results.filter((r) => r.pass).length,
          failed: results.filter((r) => !r.pass).length,
          checks: results,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    console.log("clawd migrate validate\n");
    for (const r of results) {
      const status = r.pass ? "PASS" : "FAIL";
      console.log(`  [${status}] ${r.name}: ${r.detail}`);
    }
    console.log();
    const passed = results.filter((r) => r.pass).length;
    console.log(
      `  ${passed}/${results.length} checks passed${allPassed ? "" : " (VALIDATION FAILED)"}`,
    );
    console.log();
  }

  if (!allPassed) {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// clawd migrate diff
// ---------------------------------------------------------------------------

/** Diff two state files module-by-module. */
export async function runMigrateDiff(
  opts: MigrateDiffOptions,
): Promise<void> {
  let oldState: any;
  let newState: any;

  try {
    oldState = loadStateFile(opts.old);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: false, error: `old file: ${message}` }, null, 2) + "\n",
      );
    } else {
      console.error(`Error reading old file: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  try {
    newState = loadStateFile(opts.new);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ ok: false, error: `new file: ${message}` }, null, 2) + "\n",
      );
    } else {
      console.error(`Error reading new file: ${message}`);
    }
    process.exitCode = 1;
    return;
  }

  const oldApp = oldState.app_state ?? {};
  const newApp = newState.app_state ?? {};

  const diffs: DiffEntry[] = [];

  // Chain-level diff
  if (oldState.chain_id !== newState.chain_id) {
    diffs.push({
      module: "chain",
      field: "chain_id",
      old: oldState.chain_id ?? "(none)",
      new: newState.chain_id ?? "(none)",
      delta: "changed",
    });
  }

  // Account count
  const oldAccounts = countArray(oldApp, "auth", "accounts");
  const newAccounts = countArray(newApp, "auth", "accounts");
  diffs.push({
    module: "auth",
    field: "accounts",
    old: oldAccounts,
    new: newAccounts,
    delta: formatDelta(oldAccounts, newAccounts),
  });

  // Agent registrations
  const oldAgents =
    countArray(oldApp, "agent", "agents") +
    countArray(oldApp, "agent", "agent_list");
  const newAgents =
    countArray(newApp, "agent", "agents") +
    countArray(newApp, "agent", "agent_list");
  diffs.push({
    module: "agent",
    field: "registrations",
    old: oldAgents,
    new: newAgents,
    delta: formatDelta(oldAgents, newAgents),
  });

  // Agent tasks
  const oldTasks =
    countArray(oldApp, "agent", "tasks") +
    countArray(oldApp, "agent", "task_list");
  const newTasks =
    countArray(newApp, "agent", "tasks") +
    countArray(newApp, "agent", "task_list");
  diffs.push({
    module: "agent",
    field: "tasks",
    old: oldTasks,
    new: newTasks,
    delta: formatDelta(oldTasks, newTasks),
  });

  // Token supply
  const oldSupply = countArray(oldApp, "bank", "supply");
  const newSupply = countArray(newApp, "bank", "supply");
  diffs.push({
    module: "bank",
    field: "supply_entries",
    old: oldSupply,
    new: newSupply,
    delta: formatDelta(oldSupply, newSupply),
  });

  // Bank balances
  const oldBalances = countArray(oldApp, "bank", "balances");
  const newBalances = countArray(newApp, "bank", "balances");
  diffs.push({
    module: "bank",
    field: "balances",
    old: oldBalances,
    new: newBalances,
    delta: formatDelta(oldBalances, newBalances),
  });

  // Validator set
  const oldValidators = countArray(oldApp, "staking", "validators");
  const newValidators = countArray(newApp, "staking", "validators");
  diffs.push({
    module: "staking",
    field: "validators",
    old: oldValidators,
    new: newValidators,
    delta: formatDelta(oldValidators, newValidators),
  });

  // Delegations
  const oldDelegations = countArray(oldApp, "staking", "delegations");
  const newDelegations = countArray(newApp, "staking", "delegations");
  diffs.push({
    module: "staking",
    field: "delegations",
    old: oldDelegations,
    new: newDelegations,
    delta: formatDelta(oldDelegations, newDelegations),
  });

  // Privacy nullifiers
  const oldNullifiers =
    countArray(oldApp, "privacy", "nullifiers") +
    countArray(oldApp, "privacy", "nullifier_list");
  const newNullifiers =
    countArray(newApp, "privacy", "nullifiers") +
    countArray(newApp, "privacy", "nullifier_list");
  diffs.push({
    module: "privacy",
    field: "nullifiers",
    old: oldNullifiers,
    new: newNullifiers,
    delta: formatDelta(oldNullifiers, newNullifiers),
  });

  // Privacy commitments
  const oldCommitments =
    countArray(oldApp, "privacy", "commitments") +
    countArray(oldApp, "privacy", "commitment_list");
  const newCommitments =
    countArray(newApp, "privacy", "commitments") +
    countArray(newApp, "privacy", "commitment_list");
  diffs.push({
    module: "privacy",
    field: "commitments",
    old: oldCommitments,
    new: newCommitments,
    delta: formatDelta(oldCommitments, newCommitments),
  });

  // Governance proposals
  const oldProposals = countArray(
    oldApp.gov ?? oldApp.governance,
    "proposals",
  );
  const newProposals = countArray(
    newApp.gov ?? newApp.governance,
    "proposals",
  );
  diffs.push({
    module: "governance",
    field: "proposals",
    old: oldProposals,
    new: newProposals,
    delta: formatDelta(oldProposals, newProposals),
  });

  // Marketplace skills
  const oldSkills =
    countArray(oldApp, "marketplace", "skills") +
    countArray(oldApp, "marketplace", "skill_list");
  const newSkills =
    countArray(newApp, "marketplace", "skills") +
    countArray(newApp, "marketplace", "skill_list");
  diffs.push({
    module: "marketplace",
    field: "skills",
    old: oldSkills,
    new: newSkills,
    delta: formatDelta(oldSkills, newSkills),
  });

  // Marketplace escrows
  const oldEscrows =
    countArray(oldApp, "marketplace", "escrows") +
    countArray(oldApp, "marketplace", "escrow_list");
  const newEscrows =
    countArray(newApp, "marketplace", "escrows") +
    countArray(newApp, "marketplace", "escrow_list");
  diffs.push({
    module: "marketplace",
    field: "escrows",
    old: oldEscrows,
    new: newEscrows,
    delta: formatDelta(oldEscrows, newEscrows),
  });

  // Output
  const changedCount = diffs.filter(
    (d) => d.delta !== "unchanged",
  ).length;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          oldFile: opts.old,
          newFile: opts.new,
          oldChainId: oldState.chain_id ?? null,
          newChainId: newState.chain_id ?? null,
          totalFields: diffs.length,
          changedFields: changedCount,
          diffs,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("clawd migrate diff\n");
  console.log(`  Old: ${opts.old}`);
  console.log(`  New: ${opts.new}`);
  console.log();

  const rows = diffs.map((d) => [
    d.module,
    d.field,
    String(d.old),
    String(d.new),
    d.delta,
  ]);

  console.log(
    table(["Module", "Field", "Old", "New", "Delta"], rows),
  );
  console.log();
  console.log(`  ${changedCount}/${diffs.length} field(s) changed`);
  console.log();
}

function formatDelta(oldVal: number, newVal: number): string {
  if (oldVal === newVal) return "unchanged";
  const diff = newVal - oldVal;
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff}`;
}

// ---------------------------------------------------------------------------
// clawd migrate check
// ---------------------------------------------------------------------------

/** Pre-migration readiness check. */
export async function runMigrateCheck(
  opts: MigrateCheckOptions,
): Promise<void> {
  const cfg = loadClawdConfig();
  const binaryPath = cfg.nodeBinaryPath ?? "clawchaind";
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;

  const checks: CheckItem[] = [];

  // 1. Verify chain binary version
  try {
    const versionOutput = execSync(`${binaryPath} version 2>&1`, {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    checks.push({
      name: "Chain binary available",
      status: "pass",
      detail: `${binaryPath} version ${versionOutput}`,
    });
  } catch {
    checks.push({
      name: "Chain binary available",
      status: "fail",
      detail: `could not execute ${binaryPath}`,
    });
  }

  // 2. Check if upgrade handler exists for target version
  if (opts.version) {
    // Look for the upgrade handler registration in app/upgrades.go
    const upgradesFile = findProjectFile("app/upgrades.go");
    if (upgradesFile && existsSync(upgradesFile)) {
      try {
        const content = readFileSync(upgradesFile, "utf-8");
        if (content.includes(opts.version)) {
          checks.push({
            name: "Upgrade handler exists",
            status: "pass",
            detail: `handler for "${opts.version}" found in app/upgrades.go`,
          });
        } else {
          checks.push({
            name: "Upgrade handler exists",
            status: "fail",
            detail: `no handler for "${opts.version}" in app/upgrades.go`,
          });
        }
      } catch {
        checks.push({
          name: "Upgrade handler exists",
          status: "warn",
          detail: "could not read app/upgrades.go",
        });
      }
    } else {
      checks.push({
        name: "Upgrade handler exists",
        status: "warn",
        detail: "app/upgrades.go not found in project",
      });
    }
  } else {
    checks.push({
      name: "Upgrade handler exists",
      status: "warn",
      detail: "no --version specified, skipping handler check",
    });
  }

  // 3. Verify disk space for state export
  try {
    const dataDir = join(nodeHome, "data");
    if (existsSync(dataDir)) {
      // Use df to check available space on the partition
      const dfOutput = execSync(`df -k "${MIGRATIONS_DIR}" 2>/dev/null || df -k "${nodeHome}"`, {
        encoding: "utf-8",
        timeout: 10_000,
      });
      const lines = dfOutput.trim().split("\n");
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        // Available space is usually the 4th column in df -k output
        const availableKb = parseInt(parts[3], 10);
        if (!isNaN(availableKb)) {
          const availableBytes = availableKb * 1024;
          // Require at least 2 GB free for state export
          if (availableBytes >= 2 * 1024 * 1024 * 1024) {
            checks.push({
              name: "Disk space for export",
              status: "pass",
              detail: `${formatBytes(availableBytes)} available`,
            });
          } else {
            checks.push({
              name: "Disk space for export",
              status: "fail",
              detail: `only ${formatBytes(availableBytes)} available (need >= 2 GB)`,
            });
          }
        } else {
          checks.push({
            name: "Disk space for export",
            status: "warn",
            detail: "could not parse available disk space",
          });
        }
      } else {
        checks.push({
          name: "Disk space for export",
          status: "warn",
          detail: "could not parse df output",
        });
      }
    } else {
      checks.push({
        name: "Disk space for export",
        status: "warn",
        detail: `data directory not found: ${dataDir}`,
      });
    }
  } catch {
    checks.push({
      name: "Disk space for export",
      status: "warn",
      detail: "could not check disk space",
    });
  }

  // 4. Check if cosmovisor is configured
  const cosmovisorDir = join(nodeHome, "cosmovisor");
  if (existsSync(cosmovisorDir)) {
    const currentLink = join(cosmovisorDir, "current");
    const genesisDir = join(cosmovisorDir, "genesis");
    const hasCurrent = existsSync(currentLink);
    const hasGenesis = existsSync(genesisDir);
    if (hasCurrent && hasGenesis) {
      checks.push({
        name: "Cosmovisor configured",
        status: "pass",
        detail: `found at ${cosmovisorDir} (current + genesis)`,
      });
    } else {
      checks.push({
        name: "Cosmovisor configured",
        status: "warn",
        detail: `directory exists but missing: ${!hasCurrent ? "current" : ""} ${!hasGenesis ? "genesis" : ""}`.trim(),
      });
    }
  } else {
    checks.push({
      name: "Cosmovisor configured",
      status: "warn",
      detail: "cosmovisor directory not found (optional but recommended)",
    });
  }

  // 5. Verify backup exists
  ensureMigrationsDir();
  try {
    const entries = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith(".json"),
    );
    if (entries.length > 0) {
      const latest = entries.sort().pop()!;
      const stat = statSync(join(MIGRATIONS_DIR, latest));
      checks.push({
        name: "State backup exists",
        status: "pass",
        detail: `${entries.length} export(s) found, latest: ${latest} (${formatBytes(stat.size)})`,
      });
    } else {
      checks.push({
        name: "State backup exists",
        status: "fail",
        detail: `no exports found in ${MIGRATIONS_DIR}`,
      });
    }
  } catch {
    checks.push({
      name: "State backup exists",
      status: "fail",
      detail: `could not read ${MIGRATIONS_DIR}`,
    });
  }

  // Output
  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const ready = failed === 0;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ready,
          passed,
          failed,
          warned,
          targetVersion: opts.version ?? null,
          checks,
        },
        null,
        2,
      ) + "\n",
    );
    if (!ready) {
      process.exitCode = 1;
    }
    return;
  }

  console.log("clawd migrate check\n");

  for (const c of checks) {
    const icon =
      c.status === "pass"
        ? "PASS"
        : c.status === "fail"
          ? "FAIL"
          : "WARN";
    console.log(`  [${icon}] ${c.name}: ${c.detail}`);
  }

  console.log();
  console.log(
    `  Ready: ${ready ? "yes" : "no"} (${passed} passed, ${failed} failed, ${warned} warnings)`,
  );

  if (!ready) {
    console.log();
    console.log("  Blockers:");
    for (const c of checks.filter((c) => c.status === "fail")) {
      console.log(`    - ${c.name}: ${c.detail}`);
    }
  }

  console.log();

  if (!ready) {
    process.exitCode = 1;
  }
}

function findProjectFile(relativePath: string): string | null {
  // Walk up from cwd to find project root
  let dir = resolve(process.cwd());
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, relativePath);
    if (existsSync(candidate)) return candidate;
    if (existsSync(join(dir, "go.mod")) || existsSync(join(dir, ".git"))) {
      // We are at project root; check directly
      return existsSync(candidate) ? candidate : null;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// clawd migrate history
// ---------------------------------------------------------------------------

/** Show migration/export history. */
export async function runMigrateHistory(
  opts: MigrateHistoryOptions,
): Promise<void> {
  ensureMigrationsDir();

  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ exports: [] }, null, 2) + "\n");
    } else {
      console.log("clawd migrate history\n");
      console.log("  No migration exports found.");
      console.log();
    }
    return;
  }

  if (files.length === 0) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ exports: [] }, null, 2) + "\n");
    } else {
      console.log("clawd migrate history\n");
      console.log("  No migration exports found.");
      console.log();
    }
    return;
  }

  const entries: HistoryEntry[] = [];

  for (const filename of files.sort()) {
    const fullPath = join(MIGRATIONS_DIR, filename);
    try {
      const stat = statSync(fullPath);

      // Try to extract chain-id and height from filename
      // Format: {chain-id}-{height}.json
      const base = filename.replace(/\.json$/, "");
      const lastDash = base.lastIndexOf("-");
      let chainId = base;
      let height = "unknown";
      if (lastDash > 0) {
        chainId = base.substring(0, lastDash);
        height = base.substring(lastDash + 1);
      }

      entries.push({
        filename,
        chainId,
        height,
        date: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        sizeHuman: formatBytes(stat.size),
      });
    } catch {
      // Skip unreadable files
    }
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ exports: entries }, null, 2) + "\n",
    );
    return;
  }

  console.log("clawd migrate history\n");

  if (entries.length === 0) {
    console.log("  No migration exports found.");
    console.log();
    return;
  }

  const rows = entries.map((e) => [
    e.chainId,
    e.height,
    e.date.replace("T", " ").replace(/\.\d+Z$/, "Z"),
    e.sizeHuman,
    e.filename,
  ]);

  console.log(
    table(["Chain ID", "Height", "Date", "Size", "File"], rows),
  );
  console.log();
  console.log(`  ${entries.length} export(s) in ${MIGRATIONS_DIR}`);
  console.log();
}
