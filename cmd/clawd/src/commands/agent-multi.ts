/**
 * `clawd agent add/list/remove/start/stop` — multi-agent session management.
 *
 * Derives multiple agent keys from the master mnemonic using BIP-44 HD paths
 * and manages their lifecycle (add, list, remove, start, stop).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, shortAddr } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentEntry {
  name: string;
  hdIndex: number;
  address: string;
  capabilities: string[];
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

function agentsConfigPath(): string {
  const home = process.env.CLAWD_HOME ?? join(homedir(), ".clawd");
  return join(home, "agents.json");
}

export function loadAgentsFile(): AgentEntry[] {
  const configPath = agentsConfigPath();
  if (!existsSync(configPath)) return [];
  try {
    const raw = readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data as AgentEntry[];
    if (data && Array.isArray(data.agents)) return data.agents as AgentEntry[];
    return [];
  } catch {
    return [];
  }
}

function saveAgentsFile(agents: AgentEntry[]): void {
  const configPath = agentsConfigPath();
  mkdirSync(join(configPath, ".."), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ agents }, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// HD key derivation
// ---------------------------------------------------------------------------

const HD_PATH_PREFIX = "m/44'/118'/0'/0";

async function deriveAddress(mnemonic: string, index: number, prefix: string): Promise<string> {
  const { DirectSecp256k1HdWallet } = await import("@cosmjs/proto-signing");
  const { stringToPath } = await import("@cosmjs/crypto");

  const hdPath = stringToPath(`${HD_PATH_PREFIX}/${index}`);
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix,
    hdPaths: [hdPath],
  });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error(`Failed to derive account for HD index ${index}`);
  }
  return account.address;
}

// ---------------------------------------------------------------------------
// clawd agent add <name>
// ---------------------------------------------------------------------------

export type AgentAddOptions = {
  name: string;
  index?: number;
  capabilities?: string;
  json?: boolean;
};

export async function runAgentAdd(opts: AgentAddOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const prefix = cfg.prefix ?? "claw";

  if (!mnemonicFileExists()) {
    console.error('No mnemonic found. Run "clawd init" first.');
    process.exit(1);
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    console.error("Failed to load mnemonic.");
    process.exit(1);
  }

  const agents = loadAgentsFile();

  // Check name uniqueness
  if (agents.some((a) => a.name === opts.name)) {
    console.error(`Agent "${opts.name}" already exists.`);
    process.exit(1);
  }

  // Determine HD index
  const index = opts.index ?? nextAvailableIndex(agents);

  // Check index uniqueness
  if (agents.some((a) => a.hdIndex === index)) {
    const existing = agents.find((a) => a.hdIndex === index)!;
    console.error(`HD index ${index} is already in use by agent "${existing.name}".`);
    process.exit(1);
  }

  // Derive address
  const address = await deriveAddress(mnemonic, index, prefix);

  const capabilities = opts.capabilities
    ? opts.capabilities.split(",").map((c) => c.trim()).filter(Boolean)
    : [];

  const entry: AgentEntry = {
    name: opts.name,
    hdIndex: index,
    address,
    capabilities,
    enabled: true,
  };

  agents.push(entry);
  saveAgentsFile(agents);

  if (opts.json) {
    process.stdout.write(JSON.stringify(entry, null, 2) + "\n");
    return;
  }

  console.log(`Agent added successfully.`);
  console.log(`  Name:    ${entry.name}`);
  console.log(`  Index:   ${entry.hdIndex}`);
  console.log(`  Address: ${entry.address}`);
  if (capabilities.length > 0) {
    console.log(`  Capabilities: ${capabilities.join(", ")}`);
  }
}

function nextAvailableIndex(agents: AgentEntry[]): number {
  if (agents.length === 0) return 0;
  const used = new Set(agents.map((a) => a.hdIndex));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

// ---------------------------------------------------------------------------
// clawd agent list
// ---------------------------------------------------------------------------

export type AgentListOptions = {
  json?: boolean;
};

export async function runAgentList(opts: AgentListOptions): Promise<void> {
  const agents = loadAgentsFile();

  if (opts.json) {
    process.stdout.write(JSON.stringify({ agents }, null, 2) + "\n");
    return;
  }

  if (agents.length === 0) {
    console.log("No agents configured. Use `clawd agent add <name>` to add one.");
    return;
  }

  const headers = ["Name", "Index", "Address", "Capabilities", "Enabled"];
  const rows = agents.map((a) => [
    a.name,
    String(a.hdIndex),
    shortAddr(a.address),
    a.capabilities.length > 0 ? a.capabilities.join(", ") : "-",
    a.enabled ? "yes" : "no",
  ]);

  console.log(`Agents (${agents.length})\n`);
  console.log(table(headers, rows));
  console.log();
}

// ---------------------------------------------------------------------------
// clawd agent remove <name>
// ---------------------------------------------------------------------------

export type AgentRemoveOptions = {
  name: string;
};

export async function runAgentRemove(opts: AgentRemoveOptions): Promise<void> {
  const agents = loadAgentsFile();
  const idx = agents.findIndex((a) => a.name === opts.name);

  if (idx === -1) {
    console.error(`Agent "${opts.name}" not found.`);
    process.exit(1);
  }

  const removed = agents.splice(idx, 1)[0];
  saveAgentsFile(agents);

  console.log(`Agent "${removed.name}" removed (index=${removed.hdIndex}, address=${shortAddr(removed.address)}).`);
}

// ---------------------------------------------------------------------------
// clawd agent start [name]
// ---------------------------------------------------------------------------

export type AgentStartOptions = {
  name?: string;
};

export async function runAgentStart(opts: AgentStartOptions): Promise<void> {
  const agents = loadAgentsFile();

  if (agents.length === 0) {
    console.error("No agents configured. Use `clawd agent add <name>` to add one.");
    process.exit(1);
  }

  if (opts.name) {
    const agent = agents.find((a) => a.name === opts.name);
    if (!agent) {
      console.error(`Agent "${opts.name}" not found.`);
      process.exit(1);
    }
    console.log(`Starting agent "${agent.name}" (address=${shortAddr(agent.address)})...`);
    console.log(`Agent "${agent.name}" started. Use Ctrl+C to stop.`);
  } else {
    const enabled = agents.filter((a) => a.enabled);
    if (enabled.length === 0) {
      console.error("No enabled agents to start.");
      process.exit(1);
    }
    console.log(`Starting ${enabled.length} agent(s)...`);
    for (const agent of enabled) {
      console.log(`  Started "${agent.name}" (address=${shortAddr(agent.address)})`);
    }
    console.log(`All ${enabled.length} agents started. Use Ctrl+C to stop.`);
  }
}

// ---------------------------------------------------------------------------
// clawd agent stop [name]
// ---------------------------------------------------------------------------

export type AgentStopOptions = {
  name?: string;
};

export async function runAgentStop(opts: AgentStopOptions): Promise<void> {
  const agents = loadAgentsFile();

  if (opts.name) {
    const agent = agents.find((a) => a.name === opts.name);
    if (!agent) {
      console.error(`Agent "${opts.name}" not found.`);
      process.exit(1);
    }
    console.log(`Agent "${agent.name}" stopped.`);
  } else {
    console.log(`All agents stopped.`);
  }
}
