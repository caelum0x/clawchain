/**
 * `clawd network` subcommands — list, switch, add, remove, status.
 *
 * Manage preset and custom network profiles, persisted in ~/.clawd/networks.json.
 * Switching a network updates the main clawd config (rpcUrl, restUrl, chainId).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadClawdConfig, writeClawdConfig } from "../lib/config.js";
import { CLAWD_HOME } from "../lib/paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkProfile = {
  name: string;
  rpcUrl: string;
  restUrl: string;
  chainId: string;
  /** Whether this is a built-in preset (cannot be removed). */
  preset?: boolean;
};

export type NetworksFile = {
  /** Currently active network name. */
  active: string;
  /** Custom networks added by the user. */
  custom: NetworkProfile[];
};

// ---------------------------------------------------------------------------
// Preset networks
// ---------------------------------------------------------------------------

const PRESET_NETWORKS: readonly NetworkProfile[] = [
  {
    name: "mainnet",
    rpcUrl: "https://rpc.clawchain.io",
    restUrl: "https://api.clawchain.io",
    chainId: "clawchain-1",
    preset: true,
  },
  {
    name: "testnet",
    rpcUrl: "https://rpc-testnet.clawchain.io",
    restUrl: "https://api-testnet.clawchain.io",
    chainId: "clawchain-testnet-1",
    preset: true,
  },
  {
    name: "local",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    chainId: "clawchain-local",
    preset: true,
  },
  {
    name: "devnet",
    rpcUrl: "https://rpc-devnet.clawchain.io",
    restUrl: "https://api-devnet.clawchain.io",
    chainId: "clawchain-devnet-1",
    preset: true,
  },
];

// ---------------------------------------------------------------------------
// Networks file persistence
// ---------------------------------------------------------------------------

const NETWORKS_PATH = join(CLAWD_HOME, "networks.json");

function loadNetworksFile(): NetworksFile {
  try {
    const raw = readFileSync(NETWORKS_PATH, "utf-8");
    return JSON.parse(raw) as NetworksFile;
  } catch {
    return { active: "", custom: [] };
  }
}

function writeNetworksFile(data: NetworksFile): void {
  mkdirSync(CLAWD_HOME, { recursive: true });
  writeFileSync(NETWORKS_PATH, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Get all available networks (presets + custom).
 */
function getAllNetworks(nf: NetworksFile): NetworkProfile[] {
  return [...PRESET_NETWORKS, ...nf.custom];
}

/**
 * Find a network by name across presets and custom entries.
 */
function findNetwork(name: string, nf: NetworksFile): NetworkProfile | undefined {
  return getAllNetworks(nf).find((n) => n.name === name);
}

// ---------------------------------------------------------------------------
// clawd network list
// ---------------------------------------------------------------------------

export type NetworkListOptions = {
  json?: boolean;
};

export async function runNetworkList(opts: NetworkListOptions): Promise<void> {
  const nf = loadNetworksFile();
  const all = getAllNetworks(nf);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ active: nf.active, networks: all }, null, 2) + "\n",
    );
    return;
  }

  console.log("Available Networks\n");
  for (const net of all) {
    const marker = net.name === nf.active ? " *" : "";
    const tag = net.preset ? " (preset)" : " (custom)";
    console.log(`  ${net.name}${marker}${tag}`);
    console.log(`    RPC:      ${net.rpcUrl}`);
    console.log(`    REST:     ${net.restUrl}`);
    console.log(`    Chain ID: ${net.chainId}`);
  }
  if (nf.active) {
    console.log(`\n  Active: ${nf.active}`);
  } else {
    console.log("\n  Active: (none)");
  }
  console.log();
}

// ---------------------------------------------------------------------------
// clawd network switch
// ---------------------------------------------------------------------------

export type NetworkSwitchOptions = {
  name: string;
  json?: boolean;
};

export async function runNetworkSwitch(opts: NetworkSwitchOptions): Promise<void> {
  const nf = loadNetworksFile();
  const target = findNetwork(opts.name, nf);

  if (!target) {
    console.error(`Unknown network: ${opts.name}`);
    console.error(`Available: ${getAllNetworks(nf).map((n) => n.name).join(", ")}`);
    process.exit(1);
  }

  // Update networks file active marker
  nf.active = target.name;
  writeNetworksFile(nf);

  // Update clawd config
  const cfg = loadClawdConfig();
  writeClawdConfig({
    ...cfg,
    rpcUrl: target.rpcUrl,
    restUrl: target.restUrl,
    chainId: target.chainId,
  });

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        switched: true,
        network: target.name,
        rpcUrl: target.rpcUrl,
        restUrl: target.restUrl,
        chainId: target.chainId,
      }, null, 2) + "\n",
    );
    return;
  }

  console.log(`Switched to network: ${target.name}`);
  console.log(`  RPC:      ${target.rpcUrl}`);
  console.log(`  REST:     ${target.restUrl}`);
  console.log(`  Chain ID: ${target.chainId}`);
}

// ---------------------------------------------------------------------------
// clawd network add
// ---------------------------------------------------------------------------

export type NetworkAddOptions = {
  name: string;
  rpc: string;
  rest: string;
  chainId: string;
  json?: boolean;
};

export async function runNetworkAdd(opts: NetworkAddOptions): Promise<void> {
  const nf = loadNetworksFile();

  // Check for duplicate name
  const existing = findNetwork(opts.name, nf);
  if (existing) {
    if (existing.preset) {
      console.error(`Cannot overwrite preset network: ${opts.name}`);
    } else {
      console.error(`Custom network already exists: ${opts.name}. Remove it first.`);
    }
    process.exit(1);
  }

  // Validate URLs
  for (const [label, url] of [["rpc", opts.rpc], ["rest", opts.rest]] as const) {
    try {
      new URL(url);
    } catch {
      console.error(`Invalid ${label} URL: ${url}`);
      process.exit(1);
    }
  }

  const profile: NetworkProfile = {
    name: opts.name,
    rpcUrl: opts.rpc,
    restUrl: opts.rest,
    chainId: opts.chainId,
  };

  nf.custom.push(profile);
  writeNetworksFile(nf);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ added: true, network: profile }, null, 2) + "\n");
    return;
  }

  console.log(`Added custom network: ${opts.name}`);
  console.log(`  RPC:      ${profile.rpcUrl}`);
  console.log(`  REST:     ${profile.restUrl}`);
  console.log(`  Chain ID: ${profile.chainId}`);
}

// ---------------------------------------------------------------------------
// clawd network remove
// ---------------------------------------------------------------------------

export type NetworkRemoveOptions = {
  name: string;
  json?: boolean;
};

export async function runNetworkRemove(opts: NetworkRemoveOptions): Promise<void> {
  const nf = loadNetworksFile();

  // Check if it's a preset
  const preset = PRESET_NETWORKS.find((n) => n.name === opts.name);
  if (preset) {
    console.error(`Cannot remove preset network: ${opts.name}`);
    process.exit(1);
  }

  const idx = nf.custom.findIndex((n) => n.name === opts.name);
  if (idx === -1) {
    console.error(`Custom network not found: ${opts.name}`);
    process.exit(1);
  }

  nf.custom.splice(idx, 1);

  // If removing the active network, clear active
  if (nf.active === opts.name) {
    nf.active = "";
  }

  writeNetworksFile(nf);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ removed: true, name: opts.name }, null, 2) + "\n");
    return;
  }

  console.log(`Removed custom network: ${opts.name}`);
}

// ---------------------------------------------------------------------------
// clawd network status
// ---------------------------------------------------------------------------

export type NetworkStatusOptions = {
  json?: boolean;
};

export async function runNetworkStatus(opts: NetworkStatusOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const nf = loadNetworksFile();
  const rpcUrl = (cfg.rpcUrl ?? "http://localhost:26657").replace(/\/+$/, "");

  let blockHeight = "unknown";
  let peerCount = "unknown";
  let syncing = "unknown";
  let reachable = false;

  try {
    const res = await fetch(`${rpcUrl}/status`, { signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      reachable = true;
      const data = (await res.json()) as {
        result?: {
          sync_info?: {
            latest_block_height?: string;
            catching_up?: boolean;
          };
          node_info?: {
            network?: string;
          };
        };
      };
      const syncInfo = data.result?.sync_info;
      blockHeight = syncInfo?.latest_block_height ?? "unknown";
      syncing = syncInfo?.catching_up ? "catching up" : "synced";
    }
  } catch {
    // not reachable
  }

  // Try to get peer count via /net_info
  if (reachable) {
    try {
      const netRes = await fetch(`${rpcUrl}/net_info`, { signal: AbortSignal.timeout(5_000) });
      if (netRes.ok) {
        const netData = (await netRes.json()) as {
          result?: { n_peers?: string };
        };
        peerCount = netData.result?.n_peers ?? "unknown";
      }
    } catch {
      // ignore
    }
  }

  const status = {
    network: nf.active || "(none)",
    rpcUrl,
    restUrl: cfg.restUrl ?? "unknown",
    chainId: cfg.chainId,
    reachable,
    blockHeight,
    peerCount,
    syncStatus: syncing,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    return;
  }

  console.log("Network Status\n");
  console.log(`  Network:     ${status.network}`);
  console.log(`  Chain ID:    ${status.chainId}`);
  console.log(`  RPC:         ${status.rpcUrl}`);
  console.log(`  REST:        ${status.restUrl}`);
  console.log(`  Reachable:   ${status.reachable ? "yes" : "no"}`);
  console.log(`  Block Height:${blockHeight !== "unknown" ? " " + blockHeight : " unknown"}`);
  console.log(`  Peers:       ${peerCount}`);
  console.log(`  Sync Status: ${syncing}`);
  console.log();
}
