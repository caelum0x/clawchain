/**
 * `clawd peers` — show and configure peer discovery settings.
 */

import { readFile } from "node:fs/promises";
import net from "node:net";
import { loadClawdConfig, writeClawdConfig } from "../lib/config.js";
import { configurePeers, getNodeId } from "../lib/peers.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

/**
 * Print the local node's peer address (nodeID@host:port).
 */
export function runPeersShow(host?: string): void {
  const config = loadClawdConfig();
  const nodeHome = config.nodeHome || CLAWCHAIN_HOME;
  const nodeBin = config.nodeBinaryPath ?? process.env.CLAWCHAIND_PATH ?? "clawchaind";

  try {
    const nodeId = getNodeId(nodeBin, nodeHome);
    const displayHost = host ?? "localhost";
    console.log(`${nodeId}@${displayHost}:26656`);
  } catch (err) {
    console.error(`Failed to get node ID: ${String(err)}`);
    process.exit(1);
  }
}

/**
 * Update seed and persistent peer settings.
 */
export function runPeersSet(options: {
  seeds?: string;
  persistentPeers?: string;
}): void {
  const config = loadClawdConfig();
  const nodeHome = config.nodeHome || CLAWCHAIN_HOME;

  try {
    configurePeers({
      seeds: options.seeds,
      persistentPeers: options.persistentPeers,
      nodeHome,
    });

    // Update config
    if (options.seeds !== undefined) {
      config.seeds = options.seeds;
    }
    if (options.persistentPeers !== undefined) {
      config.persistentPeers = options.persistentPeers;
    }
    writeClawdConfig(config);

    console.log("Peer configuration updated.");
    if (options.seeds) console.log(`  Seeds:            ${options.seeds}`);
    if (options.persistentPeers) console.log(`  Persistent peers: ${options.persistentPeers}`);
  } catch (err) {
    console.error(`Failed to configure peers: ${String(err)}`);
    process.exit(1);
  }
}

type NodecardLike = {
  chainId?: string;
  node?: { p2p?: string };
};

type ManifestLike = {
  chainId?: string;
  seeds?: string[];
};

/**
 * Import seed peers from one or more nodecard JSON sources (file paths or URLs).
 */
export async function runPeersImportNodecards(options: {
  sources: string[];
  replace?: boolean;
}): Promise<void> {
  if (!options.sources || options.sources.length === 0) {
    console.error("No nodecard sources provided.");
    process.exit(1);
  }

  const config = loadClawdConfig();
  const nodeHome = config.nodeHome || CLAWCHAIN_HOME;
  const expectedChainId = config.chainId;

  const importedSeeds: string[] = [];
  for (const source of options.sources) {
    const card = await loadNodecard(source);
    if (!card) continue;
    if (card.chainId && expectedChainId && card.chainId !== expectedChainId) {
      console.warn(
        `Skipping nodecard ${source}: chainId mismatch (${card.chainId} != ${expectedChainId})`,
      );
      continue;
    }
    const p2p = card.node?.p2p;
    if (!p2p || !p2p.includes("@")) {
      console.warn(`Skipping nodecard ${source}: missing node.p2p`);
      continue;
    }
    importedSeeds.push(p2p);
  }

  if (importedSeeds.length === 0) {
    console.warn("No valid seeds imported from nodecards.");
    return;
  }

  const existing = (config.seeds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const merged = options.replace ? importedSeeds : [...existing, ...importedSeeds];
  const deduped = [...new Set(merged)];
  const seeds = deduped.join(",");

  try {
    configurePeers({
      seeds,
      persistentPeers: config.persistentPeers,
      nodeHome,
    });
  } catch (err) {
    console.error(`Failed to patch peer config.toml: ${String(err)}`);
    process.exit(1);
  }

  config.seeds = seeds;
  writeClawdConfig(config);

  console.log("Imported seeds from nodecards.");
  console.log(`  Count: ${importedSeeds.length}`);
  console.log(`  Total seeds: ${deduped.length}`);
  console.log(`  Seeds: ${seeds}`);
}

async function loadNodecard(source: string): Promise<NodecardLike | null> {
  try {
    let raw = "";
    if (/^https?:\/\//i.test(source)) {
      const res = await fetch(source, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`Failed to fetch ${source}: HTTP ${res.status}`);
        return null;
      }
      raw = await res.text();
    } else {
      raw = await readFile(source, "utf8");
    }
    return JSON.parse(raw) as NodecardLike;
  } catch (err) {
    console.warn(`Failed to load nodecard ${source}: ${String(err)}`);
    return null;
  }
}

/**
 * Sync seed peers from a public manifest (file path or URL).
 */
export async function runPeersSyncManifest(options: {
  fromManifest: string;
  replace?: boolean;
}): Promise<void> {
  const manifest = await loadManifest(options.fromManifest);
  if (!manifest) {
    console.error(`Failed to load manifest: ${options.fromManifest}`);
    process.exit(1);
  }

  const config = loadClawdConfig();
  const nodeHome = config.nodeHome || CLAWCHAIN_HOME;

  if (manifest.chainId && config.chainId && manifest.chainId !== config.chainId) {
    console.error(
      `Manifest chainId mismatch: manifest=${manifest.chainId} local=${config.chainId}`,
    );
    process.exit(1);
  }

  const imported = (manifest.seeds ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  if (imported.length === 0) {
    console.warn("Manifest has no seeds; no changes applied.");
    return;
  }

  const existing = (config.seeds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const merged = options.replace ? imported : [...existing, ...imported];
  const deduped = [...new Set(merged)];
  const seeds = deduped.join(",");

  try {
    configurePeers({
      seeds,
      persistentPeers: config.persistentPeers,
      nodeHome,
    });
  } catch (err) {
    console.error(`Failed to patch peer config.toml: ${String(err)}`);
    process.exit(1);
  }

  config.seeds = seeds;
  config.networkManifest = options.fromManifest;
  writeClawdConfig(config);

  console.log("Synced seeds from manifest.");
  console.log(`  Manifest: ${options.fromManifest}`);
  console.log(`  Imported: ${imported.length}`);
  console.log(`  Total seeds: ${deduped.length}`);
}

async function loadManifest(source: string): Promise<ManifestLike | null> {
  try {
    let raw = "";
    if (/^https?:\/\//i.test(source)) {
      const res = await fetch(source, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.warn(`Failed to fetch manifest ${source}: HTTP ${res.status}`);
        return null;
      }
      raw = await res.text();
    } else {
      raw = await readFile(source, "utf8");
    }
    return JSON.parse(raw) as ManifestLike;
  } catch (err) {
    console.warn(`Failed to parse manifest ${source}: ${String(err)}`);
    return null;
  }
}

/**
 * Verify configured seed peers are reachable over TCP.
 */
export async function runPeersVerify(options: {
  seeds?: string;
  timeoutMs?: number;
}): Promise<void> {
  const config = loadClawdConfig();
  const timeoutMs = options.timeoutMs ?? 2500;
  const seedCsv = options.seeds ?? config.seeds ?? "";
  const entries = seedCsv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (entries.length === 0) {
    console.log("No seeds configured.");
    return;
  }

  let okCount = 0;
  let failCount = 0;

  console.log(`Verifying ${entries.length} seed peer(s) with timeout ${timeoutMs}ms...\n`);
  for (const raw of entries) {
    const parsed = parsePeer(raw);
    if (!parsed) {
      failCount += 1;
      console.log(`[FAIL] ${raw} (invalid format)`);
      continue;
    }

    const reachable = await canDial(parsed.host, parsed.port, timeoutMs);
    if (reachable) {
      okCount += 1;
      console.log(`[OK ] ${raw}`);
    } else {
      failCount += 1;
      console.log(`[FAIL] ${raw} (unreachable)`);
    }
  }

  console.log("");
  console.log(`Peer verify summary: ok=${okCount} fail=${failCount} total=${entries.length}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

type ParsedPeer = {
 nodeId: string;
 host: string;
 port: number;
};

function parsePeer(value: string): ParsedPeer | null {
  const at = value.indexOf("@");
  if (at <= 0) return null;
  const nodeId = value.slice(0, at).trim();
  const hostPort = value.slice(at + 1).trim();
  const colon = hostPort.lastIndexOf(":");
  if (colon <= 0) return null;
  const host = hostPort.slice(0, colon).trim();
  const portRaw = hostPort.slice(colon + 1).trim();
  const port = Number.parseInt(portRaw, 10);
  if (!host || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
  return { nodeId, host, port };
}

function canDial(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Print a local summary of configured seeds.
 */
export function runPeersSummary(options: { out?: string }): void {
  const config = loadClawdConfig();
  const entries = (config.seeds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const seen = new Set<string>();
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const byHost: Record<string, number> = {};

  for (const entry of entries) {
    if (seen.has(entry)) {
      duplicates.push(entry);
      continue;
    }
    seen.add(entry);

    const parsed = parsePeer(entry);
    if (!parsed) {
      invalid.push(entry);
      continue;
    }
    byHost[parsed.host] = (byHost[parsed.host] ?? 0) + 1;
  }

  const summary = {
    chainId: config.chainId,
    total: entries.length,
    unique: seen.size,
    duplicateCount: duplicates.length,
    invalidCount: invalid.length,
    hosts: byHost,
    duplicates,
    invalid,
  };

  const out = options.out === "json" ? "json" : "pretty";
  if (out === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Peer summary");
  console.log(`  Chain ID:      ${summary.chainId}`);
  console.log(`  Total seeds:   ${summary.total}`);
  console.log(`  Unique seeds:  ${summary.unique}`);
  console.log(`  Duplicates:    ${summary.duplicateCount}`);
  console.log(`  Invalid:       ${summary.invalidCount}`);
  const hostEntries = Object.entries(byHost);
  if (hostEntries.length > 0) {
    console.log("  Hosts:");
    for (const [host, count] of hostEntries) {
      console.log(`    - ${host}: ${count}`);
    }
  }
}

/**
 * Prune unreachable seeds from config.seeds.
 */
export async function runPeersPruneUnreachable(options: {
  timeoutMs?: number;
  dryRun?: boolean;
}): Promise<void> {
  const config = loadClawdConfig();
  const nodeHome = config.nodeHome || CLAWCHAIN_HOME;
  const timeoutMs = options.timeoutMs ?? 2500;

  const currentSeeds = (config.seeds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (currentSeeds.length === 0) {
    console.log("No seeds configured.");
    return;
  }

  const reachable: string[] = [];
  const unreachable: string[] = [];

  console.log(`Checking ${currentSeeds.length} seed peer(s), timeout ${timeoutMs}ms...\n`);
  for (const seed of currentSeeds) {
    const parsed = parsePeer(seed);
    if (!parsed) {
      unreachable.push(seed);
      console.log(`[FAIL] ${seed} (invalid format)`);
      continue;
    }

    const ok = await canDial(parsed.host, parsed.port, timeoutMs);
    if (ok) {
      reachable.push(seed);
      console.log(`[OK ] ${seed}`);
    } else {
      unreachable.push(seed);
      console.log(`[FAIL] ${seed} (unreachable)`);
    }
  }

  console.log("");
  console.log(
    `Prune summary: total=${currentSeeds.length} reachable=${reachable.length} unreachable=${unreachable.length}`,
  );

  if (unreachable.length === 0) {
    console.log("No changes needed.");
    return;
  }

  if (options.dryRun) {
    console.log("Dry run enabled; not writing changes.");
    return;
  }

  const nextSeeds = reachable.join(",");
  try {
    configurePeers({
      seeds: nextSeeds,
      persistentPeers: config.persistentPeers,
      nodeHome,
    });
  } catch (err) {
    console.error(`Failed to patch peer config.toml: ${String(err)}`);
    process.exit(1);
  }

  config.seeds = nextSeeds;
  writeClawdConfig(config);
  console.log("Updated seeds in config + config.toml.");
}

/**
 * Run full peer maintenance cycle:
 * 1) optional manifest sync
 * 2) verify seeds
 * 3) prune unreachable seeds
 */
export async function runPeersAutoMaintain(options: {
  fromManifest?: string;
  replaceOnSync?: boolean;
  timeoutMs?: number;
  dryRun?: boolean;
}): Promise<void> {
  if (options.fromManifest) {
    await runPeersSyncManifest({
      fromManifest: options.fromManifest,
      replace: options.replaceOnSync,
    });
    console.log("");
  }

  await runPeersVerify({
    timeoutMs: options.timeoutMs,
  });

  console.log("");
  await runPeersPruneUnreachable({
    timeoutMs: options.timeoutMs,
    dryRun: options.dryRun,
  });
}
