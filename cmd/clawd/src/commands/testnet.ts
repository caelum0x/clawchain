/**
 * `clawd testnet` subcommands — create, start, stop, status, reset, list.
 *
 * Full lifecycle management for local multi-validator testnets.
 * Testnet data lives under ~/.clawd/testnets/{chain-id}/.
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { loadClawdConfig } from "../lib/config.js";
import { table, shortAddr } from "../lib/format.js";
import { CLAWD_HOME } from "../lib/paths.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TESTNETS_DIR = join(CLAWD_HOME, "testnets");
const DEFAULT_VALIDATORS = 4;
const DEFAULT_CHAIN_ID = "clawchain-local-1";
const DEFAULT_DENOM = "uclaw";
const DEFAULT_INITIAL_TOKENS = "1000000000000"; // 1,000,000 CLAW
const DEFAULT_VALIDATOR_STAKE = "100000000"; // 100 CLAW
const BINARY = "clawchaind";
const KEYRING_BACKEND = "test";

// Port layout: each validator gets a block of 10 ports starting at base.
const BASE_PORT = 26600;
const PORT_P2P = 0;
const PORT_RPC = 1;
const PORT_GRPC = 2;
const PORT_REST = 3;
const PORT_PPROF = 4;
const PORT_PROMETHEUS = 5;
const PORTS_PER_VALIDATOR = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestnetCreateOptions = {
  validators?: string;
  chainId?: string;
  denom?: string;
  json?: boolean;
};

export type TestnetStartOptions = {
  chainId?: string;
  json?: boolean;
};

export type TestnetStopOptions = {
  chainId?: string;
  json?: boolean;
};

export type TestnetStatusOptions = {
  chainId?: string;
  json?: boolean;
};

export type TestnetResetOptions = {
  chainId?: string;
  destroy?: boolean;
  json?: boolean;
};

export type TestnetListOptions = {
  json?: boolean;
};

type TestnetMeta = {
  chainId: string;
  denom: string;
  validators: number;
  basePort: number;
  createdAt: string;
  nodeIds: string[];
  addresses: string[];
};

type PidsFile = {
  pids: { index: number; pid: number }[];
  startedAt: string;
};

// ---------------------------------------------------------------------------
// Helpers — paths
// ---------------------------------------------------------------------------

function tnDir(chainId: string): string {
  return join(TESTNETS_DIR, chainId);
}

function nodeHome(chainId: string, index: number): string {
  return join(tnDir(chainId), `node${index}`);
}

function metaPath(chainId: string): string {
  return join(tnDir(chainId), "testnet-meta.json");
}

function pidsPath(chainId: string): string {
  return join(tnDir(chainId), "pids.json");
}

// ---------------------------------------------------------------------------
// Helpers — port layout
// ---------------------------------------------------------------------------

function vPorts(basePort: number, index: number) {
  const base = basePort + index * PORTS_PER_VALIDATOR;
  return {
    p2p: base + PORT_P2P,
    rpc: base + PORT_RPC,
    grpc: base + PORT_GRPC,
    rest: base + PORT_REST,
    pprof: base + PORT_PPROF,
    prometheus: base + PORT_PROMETHEUS,
  };
}

// ---------------------------------------------------------------------------
// Helpers — meta / pids persistence
// ---------------------------------------------------------------------------

function readJ<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJ(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function loadMeta(chainId: string): TestnetMeta | null {
  const p = metaPath(chainId);
  if (!existsSync(p)) return null;
  try {
    return readJ<TestnetMeta>(p);
  } catch {
    return null;
  }
}

function saveMeta(chainId: string, meta: TestnetMeta): void {
  writeJ(metaPath(chainId), meta);
}

function loadPids(chainId: string): PidsFile | null {
  const p = pidsPath(chainId);
  if (!existsSync(p)) return null;
  try {
    return readJ<PidsFile>(p);
  } catch {
    return null;
  }
}

function savePids(chainId: string, pidsFile: PidsFile): void {
  writeJ(pidsPath(chainId), pidsFile);
}

function removePids(chainId: string): void {
  const p = pidsPath(chainId);
  if (existsSync(p)) rmSync(p);
}

// ---------------------------------------------------------------------------
// Helpers — process management
// ---------------------------------------------------------------------------

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killAll(chainId: string, meta: TestnetMeta): number {
  const pf = loadPids(chainId);
  if (!pf) return 0;
  let killed = 0;
  for (const entry of pf.pids) {
    if (isAlive(entry.pid)) {
      try {
        process.kill(entry.pid, "SIGTERM");
        killed++;
      } catch {
        // ignore
      }
    }
  }
  removePids(chainId);
  // Also clean stray per-node .pid files
  for (let i = 0; i < meta.validators; i++) {
    const pidFile = join(tnDir(chainId), `node${i}.pid`);
    if (existsSync(pidFile)) rmSync(pidFile);
  }
  return killed;
}

// ---------------------------------------------------------------------------
// Helpers — exec with fallback (some SDK versions differ in sub-command paths)
// ---------------------------------------------------------------------------

function tryExec(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function exec2(a: string, b: string): boolean {
  return tryExec(a) || tryExec(b);
}

function execOut(cmd: string): string {
  return execSync(cmd, { stdio: "pipe", encoding: "utf-8" }).trim();
}

// ---------------------------------------------------------------------------
// Helpers — config generation
// ---------------------------------------------------------------------------

function configToml(
  moniker: string,
  ports: ReturnType<typeof vPorts>,
  persistentPeers: string,
): string {
  return `# CometBFT config — generated by clawd testnet create
proxy_app = "tcp://127.0.0.1:${ports.p2p + 100}"
moniker = "${moniker}"

[rpc]
laddr = "tcp://0.0.0.0:${ports.rpc}"
cors_allowed_origins = ["*"]

[p2p]
laddr = "tcp://0.0.0.0:${ports.p2p}"
persistent_peers = "${persistentPeers}"
addr_book_strict = false
allow_duplicate_ip = true

[mempool]
size = 5000
max_txs_bytes = 1073741824

[consensus]
timeout_propose = "1s"
timeout_propose_delta = "500ms"
timeout_prevote = "1s"
timeout_prevote_delta = "500ms"
timeout_precommit = "1s"
timeout_precommit_delta = "500ms"
timeout_commit = "1s"

[instrumentation]
prometheus = true
prometheus_listen_addr = ":${ports.prometheus}"

[statesync]
enable = false
`;
}

function appToml(
  ports: ReturnType<typeof vPorts>,
  denom: string,
): string {
  return `# App config — generated by clawd testnet create
minimum-gas-prices = "0.025${denom}"
pruning = "nothing"
halt-height = 0
halt-time = 0

[api]
enable = true
swagger = true
address = "tcp://0.0.0.0:${ports.rest}"
max-open-connections = 1000

[grpc]
enable = true
address = "0.0.0.0:${ports.grpc}"
max-recv-msg-size = 10485760
max-send-msg-size = 10485760

[grpc-web]
enable = true

[telemetry]
enabled = true
service-name = "clawchain-testnet"
enable-hostname = true
`;
}

// ---------------------------------------------------------------------------
// clawd testnet create
// ---------------------------------------------------------------------------

export async function runTestnetCreate(opts: TestnetCreateOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const chainId = opts.chainId ?? DEFAULT_CHAIN_ID;
  const denom = opts.denom ?? cfg.denom ?? DEFAULT_DENOM;
  const N = Math.max(1, Math.min(20, parseInt(opts.validators ?? String(DEFAULT_VALIDATORS), 10)));
  const basePort = BASE_PORT;
  const tokens = DEFAULT_INITIAL_TOKENS;
  const stake = DEFAULT_VALIDATOR_STAKE;

  // Verify binary
  try {
    execSync(`which ${BINARY}`, { stdio: "pipe" });
  } catch {
    console.error(`"${BINARY}" not found in PATH. Run "make install" first.`);
    process.exitCode = 1;
    return;
  }

  const dir = tnDir(chainId);
  if (existsSync(dir) && existsSync(metaPath(chainId))) {
    console.error(`Testnet "${chainId}" already exists at ${dir}.`);
    console.error(`Use "clawd testnet reset --chain-id ${chainId} --destroy" to remove it first.`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(dir, { recursive: true });

  console.log("Creating local testnet...");
  console.log(`  Chain ID:     ${chainId}`);
  console.log(`  Validators:   ${N}`);
  console.log(`  Denom:        ${denom}`);
  console.log(`  Directory:    ${dir}`);
  console.log();

  // --- Step 1: init + keygen per validator ---
  const nodeIds: string[] = [];
  const addresses: string[] = [];
  const gentxPaths: string[] = [];

  for (let i = 0; i < N; i++) {
    const home = nodeHome(chainId, i);
    const moniker = `validator-${i}`;
    const key = `val${i}`;
    mkdirSync(home, { recursive: true });

    console.log(`  [${i + 1}/${N}] Initializing ${moniker}...`);

    // Init
    exec2(
      `${BINARY} init "${moniker}" --chain-id "${chainId}" --home "${home}" --default-denom "${denom}" --overwrite 2>/dev/null`,
      `${BINARY} init "${moniker}" --chain-id "${chainId}" --home "${home}" --overwrite 2>/dev/null`,
    );

    // Create key
    tryExec(`${BINARY} keys add "${key}" --keyring-backend ${KEYRING_BACKEND} --home "${home}" --output json 2>/dev/null`);

    // Get address
    let address = "";
    try {
      const raw = execOut(`${BINARY} keys show "${key}" --keyring-backend ${KEYRING_BACKEND} --home "${home}" --output json 2>/dev/null`);
      const parsed = JSON.parse(raw) as { address?: string };
      address = parsed.address ?? "";
    } catch (err) {
      console.error(`Failed to get address for ${key}: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
    addresses.push(address);

    // Get node ID
    let nodeId = "";
    try {
      nodeId = execOut(`${BINARY} comet show-node-id --home "${home}" 2>/dev/null`);
    } catch {
      try {
        nodeId = execOut(`${BINARY} tendermint show-node-id --home "${home}" 2>/dev/null`);
      } catch {
        // Fallback: read from node_key.json
        const nkPath = join(home, "config", "node_key.json");
        if (existsSync(nkPath)) {
          const nk = readJ<{ id?: string }>(nkPath);
          nodeId = nk.id ?? `node${i}`;
        }
      }
    }
    nodeIds.push(nodeId);

    // Add genesis account
    exec2(
      `${BINARY} genesis add-genesis-account "${address}" "${tokens}${denom}" --keyring-backend ${KEYRING_BACKEND} --home "${home}" 2>/dev/null`,
      `${BINARY} add-genesis-account "${address}" "${tokens}${denom}" --keyring-backend ${KEYRING_BACKEND} --home "${home}" 2>/dev/null`,
    );

    // Gentx
    exec2(
      `${BINARY} genesis gentx "${key}" "${stake}${denom}" --chain-id "${chainId}" --keyring-backend ${KEYRING_BACKEND} --home "${home}" --moniker "${moniker}" 2>/dev/null`,
      `${BINARY} gentx "${key}" "${stake}${denom}" --chain-id "${chainId}" --keyring-backend ${KEYRING_BACKEND} --home "${home}" --moniker "${moniker}" 2>/dev/null`,
    );

    // Collect gentx paths
    const gtDir = join(home, "config", "gentx");
    if (existsSync(gtDir)) {
      gentxPaths.push(
        ...readdirSync(gtDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => join(gtDir, f)),
      );
    }
  }

  // --- Step 2: Assemble shared genesis on node0 ---
  console.log("\n  Assembling shared genesis...");
  const home0 = nodeHome(chainId, 0);

  for (let i = 1; i < N; i++) {
    exec2(
      `${BINARY} genesis add-genesis-account "${addresses[i]}" "${tokens}${denom}" --keyring-backend ${KEYRING_BACKEND} --home "${home0}" 2>/dev/null`,
      `${BINARY} add-genesis-account "${addresses[i]}" "${tokens}${denom}" --keyring-backend ${KEYRING_BACKEND} --home "${home0}" 2>/dev/null`,
    );
  }

  // Copy all gentxs to node0
  const gtDir0 = join(home0, "config", "gentx");
  mkdirSync(gtDir0, { recursive: true });
  for (const gp of gentxPaths) {
    const dest = join(gtDir0, gp.split("/").pop()!);
    if (gp !== dest) writeFileSync(dest, readFileSync(gp));
  }

  // Collect gentxs into genesis
  if (
    !exec2(
      `${BINARY} genesis collect-gentxs --home "${home0}" 2>/dev/null`,
      `${BINARY} collect-gentxs --home "${home0}" 2>/dev/null`,
    )
  ) {
    console.error("Failed to collect gentxs.");
    process.exitCode = 1;
    return;
  }

  // Validate genesis
  exec2(
    `${BINARY} genesis validate-genesis --home "${home0}" 2>/dev/null`,
    `${BINARY} genesis validate --home "${home0}" 2>/dev/null`,
  );

  // --- Step 3: Build persistent_peers and distribute configs ---
  console.log("  Distributing configs...");
  const genesisContent = readFileSync(join(home0, "config", "genesis.json"), "utf-8");

  for (let i = 0; i < N; i++) {
    const home = nodeHome(chainId, i);
    const ports = vPorts(basePort, i);

    // Write shared genesis
    writeFileSync(join(home, "config", "genesis.json"), genesisContent);

    // Peers (exclude self)
    const peers = nodeIds
      .map((id, j) => (j === i ? null : `${id}@127.0.0.1:${vPorts(basePort, j).p2p}`))
      .filter(Boolean)
      .join(",");

    writeFileSync(join(home, "config", "config.toml"), configToml(`validator-${i}`, ports, peers));
    writeFileSync(join(home, "config", "app.toml"), appToml(ports, denom));
  }

  // --- Step 4: Save metadata ---
  const meta: TestnetMeta = {
    chainId,
    denom,
    validators: N,
    basePort,
    createdAt: new Date().toISOString(),
    nodeIds,
    addresses,
  };
  saveMeta(chainId, meta);

  // Build full peers string for display
  const allPeers = nodeIds
    .map((id, i) => `${id}@127.0.0.1:${vPorts(basePort, i).p2p}`)
    .join(",");

  // --- Output ---
  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          chainId,
          denom,
          validators: N,
          basePort,
          directory: dir,
          peers: allPeers,
          createdAt: meta.createdAt,
          nodes: Array.from({ length: N }, (_, i) => ({
            name: `node${i}`,
            nodeId: nodeIds[i],
            address: addresses[i],
            ports: vPorts(basePort, i),
          })),
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("\nTestnet created successfully.\n");

  const headers = ["Node", "Address", "Node ID", "RPC", "P2P", "gRPC", "REST"];
  const rows = Array.from({ length: N }, (_, i) => {
    const ports = vPorts(basePort, i);
    return [
      `node${i}`,
      shortAddr(addresses[i]),
      nodeIds[i].slice(0, 12) + "...",
      String(ports.rpc),
      String(ports.p2p),
      String(ports.grpc),
      String(ports.rest),
    ];
  });
  console.log(table(headers, rows));

  console.log(`\nSeed peers:\n  ${allPeers}\n`);
  console.log("Next: clawd testnet start" + (chainId !== DEFAULT_CHAIN_ID ? ` --chain-id ${chainId}` : ""));
  console.log();
}

// ---------------------------------------------------------------------------
// clawd testnet start
// ---------------------------------------------------------------------------

export async function runTestnetStart(opts: TestnetStartOptions): Promise<void> {
  const chainId = opts.chainId ?? DEFAULT_CHAIN_ID;
  const meta = loadMeta(chainId);

  if (!meta) {
    console.error(`Testnet "${chainId}" not found. Run "clawd testnet create" first.`);
    process.exitCode = 1;
    return;
  }

  // Check if already running
  const existing = loadPids(chainId);
  if (existing && existing.pids.some((p) => isAlive(p.pid))) {
    console.error(`Testnet "${chainId}" is already running. Stop it first with "clawd testnet stop".`);
    process.exitCode = 1;
    return;
  }
  if (existing) removePids(chainId);

  console.log(`Starting testnet "${chainId}" (${meta.validators} validators)...\n`);

  const pids: { index: number; pid: number }[] = [];

  for (let i = 0; i < meta.validators; i++) {
    const home = nodeHome(chainId, i);
    const ports = vPorts(meta.basePort, i);

    const child: ChildProcess = spawn(
      BINARY,
      [
        "start",
        "--home", home,
        "--rpc.laddr", `tcp://0.0.0.0:${ports.rpc}`,
        "--p2p.laddr", `tcp://0.0.0.0:${ports.p2p}`,
      ],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();

    if (child.pid) {
      pids.push({ index: i, pid: child.pid });
      console.log(`  node${i}: started (PID ${child.pid})`);
    } else {
      console.error(`  node${i}: failed to start`);
    }
  }

  // Persist PIDs
  const pidsFile: PidsFile = { pids, startedAt: new Date().toISOString() };
  savePids(chainId, pidsFile);

  // Wait for first block
  console.log("\nWaiting for first block...");
  const rpcUrl = `http://127.0.0.1:${vPorts(meta.basePort, 0).rpc}`;
  let blockHeight: string | null = null;

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`${rpcUrl}/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = (await res.json()) as {
          result?: { sync_info?: { latest_block_height?: string } };
        };
        const h = data.result?.sync_info?.latest_block_height;
        if (h && parseInt(h, 10) > 0) {
          blockHeight = h;
          break;
        }
      }
    } catch {
      // not ready
    }
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          chainId,
          status: blockHeight ? "running" : "starting",
          blockHeight: blockHeight ?? null,
          startedAt: pidsFile.startedAt,
          validators: meta.validators,
          nodes: Array.from({ length: meta.validators }, (_, i) => ({
            index: i,
            pid: pids.find((p) => p.index === i)?.pid ?? null,
            rpcUrl: `http://127.0.0.1:${vPorts(meta.basePort, i).rpc}`,
            restUrl: `http://127.0.0.1:${vPorts(meta.basePort, i).rest}`,
          })),
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  if (blockHeight) {
    console.log(`  Block height: ${blockHeight}\n`);
  } else {
    console.log("  Timed out waiting for blocks. The testnet may still be starting.\n");
  }

  console.log("RPC Endpoints:");
  for (let i = 0; i < meta.validators; i++) {
    console.log(`  node${i}: http://127.0.0.1:${vPorts(meta.basePort, i).rpc}`);
  }

  console.log("\nREST Endpoints:");
  for (let i = 0; i < meta.validators; i++) {
    console.log(`  node${i}: http://127.0.0.1:${vPorts(meta.basePort, i).rest}`);
  }

  console.log();
}

// ---------------------------------------------------------------------------
// clawd testnet stop
// ---------------------------------------------------------------------------

export async function runTestnetStop(opts: TestnetStopOptions): Promise<void> {
  const chainId = opts.chainId ?? DEFAULT_CHAIN_ID;
  const meta = loadMeta(chainId);

  if (!meta) {
    console.error(`Testnet "${chainId}" not found.`);
    process.exitCode = 1;
    return;
  }

  const pf = loadPids(chainId);
  if (!pf || pf.pids.length === 0) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ chainId, stopped: 0, total: 0 }, null, 2) + "\n");
      return;
    }
    console.error(`Testnet "${chainId}" is not running (no PID file found).`);
    process.exitCode = 1;
    return;
  }

  let stopped = 0;
  for (const entry of pf.pids) {
    if (isAlive(entry.pid)) {
      try {
        process.kill(entry.pid, "SIGTERM");
        stopped++;
        if (!opts.json) console.log(`  node${entry.index}: stopped (PID ${entry.pid})`);
      } catch (err) {
        if (!opts.json) console.error(`  node${entry.index}: failed to stop (PID ${entry.pid}): ${String(err)}`);
      }
    } else {
      if (!opts.json) console.log(`  node${entry.index}: already stopped (PID ${entry.pid})`);
    }
  }

  removePids(chainId);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ chainId, stopped, total: pf.pids.length }, null, 2) + "\n");
    return;
  }

  console.log(`\nStopped ${stopped}/${pf.pids.length} validator(s).`);
  console.log();
}

// ---------------------------------------------------------------------------
// clawd testnet status
// ---------------------------------------------------------------------------

export async function runTestnetStatus(opts: TestnetStatusOptions): Promise<void> {
  const chainId = opts.chainId ?? DEFAULT_CHAIN_ID;
  const meta = loadMeta(chainId);

  if (!meta) {
    console.error(`Testnet "${chainId}" not found.`);
    process.exitCode = 1;
    return;
  }

  const pf = loadPids(chainId);

  type NS = {
    name: string;
    address: string;
    rpc: number;
    pid: number | null;
    online: boolean;
    syncing: boolean;
    height: string;
    blockTime: string;
    peers: number;
    validators: number;
  };

  const nodes: NS[] = [];

  for (let i = 0; i < meta.validators; i++) {
    const ports = vPorts(meta.basePort, i);
    const pidEntry = pf?.pids.find((p) => p.index === i);
    const running = pidEntry ? isAlive(pidEntry.pid) : false;

    const ns: NS = {
      name: `node${i}`,
      address: meta.addresses[i] ?? "",
      rpc: ports.rpc,
      pid: pidEntry?.pid ?? null,
      online: false,
      syncing: false,
      height: "0",
      blockTime: "-",
      peers: 0,
      validators: 0,
    };

    if (running) {
      // Query RPC /status
      try {
        const res = await fetch(`http://127.0.0.1:${ports.rpc}/status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            result?: {
              sync_info?: {
                latest_block_height?: string;
                latest_block_time?: string;
                catching_up?: boolean;
              };
            };
          };
          ns.online = true;
          const si = data.result?.sync_info;
          if (si) {
            ns.height = si.latest_block_height ?? "0";
            ns.blockTime = si.latest_block_time ?? "-";
            ns.syncing = si.catching_up ?? false;
          }
        }
      } catch {
        // offline
      }

      // Query net_info for peer count
      try {
        const res = await fetch(`http://127.0.0.1:${ports.rpc}/net_info`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            result?: { n_peers?: string; peers?: unknown[] };
          };
          ns.peers =
            parseInt(data.result?.n_peers ?? "0", 10) ||
            (data.result?.peers?.length ?? 0);
        }
      } catch {
        // skip
      }

      // Query validator count
      try {
        const res = await fetch(`http://127.0.0.1:${ports.rpc}/validators`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            result?: { total?: string; validators?: unknown[] };
          };
          ns.validators =
            parseInt(data.result?.total ?? "0", 10) ||
            (data.result?.validators?.length ?? 0);
        }
      } catch {
        // skip
      }
    }

    nodes.push(ns);
  }

  const anyOnline = nodes.some((n) => n.online);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          chainId: meta.chainId,
          denom: meta.denom,
          validators: meta.validators,
          basePort: meta.basePort,
          status: anyOnline ? "running" : "stopped",
          createdAt: meta.createdAt,
          startedAt: pf?.startedAt ?? null,
          nodes,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  const up = nodes.filter((n) => n.online).length;
  console.log(`Testnet Status: ${meta.chainId}\n`);
  console.log(`  Status:       ${anyOnline ? "running" : "stopped"}`);
  console.log(`  Online:       ${up}/${meta.validators}`);
  console.log(`  Denom:        ${meta.denom}`);
  console.log(`  Created:      ${meta.createdAt}`);
  if (pf?.startedAt) {
    console.log(`  Started:      ${pf.startedAt}`);
  }
  console.log();

  const headers = ["Node", "PID", "Status", "Height", "Peers", "Vals", "Block Time", "Address"];
  const rows = nodes.map((n) => [
    n.name,
    String(n.pid ?? "-"),
    n.online ? (n.syncing ? "SYNCING" : "OK") : "OFFLINE",
    n.height,
    String(n.peers),
    String(n.validators),
    n.blockTime,
    shortAddr(n.address),
  ]);

  console.log(table(headers, rows));
  console.log();
}

// ---------------------------------------------------------------------------
// clawd testnet reset
// ---------------------------------------------------------------------------

export async function runTestnetReset(opts: TestnetResetOptions): Promise<void> {
  const chainId = opts.chainId ?? DEFAULT_CHAIN_ID;
  const dir = tnDir(chainId);

  if (!existsSync(dir)) {
    console.error(`Testnet "${chainId}" not found at ${dir}.`);
    process.exitCode = 1;
    return;
  }

  const meta = loadMeta(chainId);

  // Stop if running
  if (meta) {
    killAll(chainId, meta);
    // Brief pause to let processes exit
    await new Promise((r) => setTimeout(r, 1000));
  }

  // --destroy: remove everything
  if (opts.destroy) {
    rmSync(dir, { recursive: true, force: true });

    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ chainId, action: "destroyed", directory: dir }, null, 2) + "\n",
      );
      return;
    }

    console.log(`Testnet "${chainId}" destroyed (all data removed).`);
    console.log();
    return;
  }

  // Reset: clear chain data but keep keys and genesis
  if (!meta) {
    console.error(`Testnet "${chainId}" metadata not found. Use --destroy to remove everything.`);
    process.exitCode = 1;
    return;
  }

  const cleared: string[] = [];
  for (let i = 0; i < meta.validators; i++) {
    const dataDir = join(nodeHome(chainId, i), "data");
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true });
      mkdirSync(dataDir, { recursive: true });
      // Write minimal priv_validator_state.json so the node can restart
      writeJ(join(dataDir, "priv_validator_state.json"), {
        height: "0",
        round: 0,
        step: 0,
      });
      cleared.push(`node${i}`);
    }
    // Clean log files
    const logFile = join(dir, `node${i}.log`);
    if (existsSync(logFile)) rmSync(logFile, { force: true });
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ chainId, action: "reset", cleared }, null, 2) + "\n",
    );
    return;
  }

  console.log(`Testnet "${chainId}" reset (keys and genesis preserved).`);
  console.log(`  Cleared: ${cleared.join(", ") || "none"}`);
  console.log("\nRestart: clawd testnet start" + (chainId !== DEFAULT_CHAIN_ID ? ` --chain-id ${chainId}` : ""));
  console.log();
}

// ---------------------------------------------------------------------------
// clawd testnet list
// ---------------------------------------------------------------------------

export async function runTestnetList(opts: TestnetListOptions): Promise<void> {
  if (!existsSync(TESTNETS_DIR)) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ testnets: [] }, null, 2) + "\n");
      return;
    }
    console.log("No testnets found.");
    console.log();
    return;
  }

  const entries = readdirSync(TESTNETS_DIR, { withFileTypes: true }).filter(
    (d) => d.isDirectory(),
  );

  type Summary = {
    chainId: string;
    validators: number;
    status: "running" | "stopped";
    createdAt: string;
  };

  const testnets: Summary[] = [];

  for (const entry of entries) {
    const id = entry.name;
    const meta = loadMeta(id);
    if (!meta) continue;

    const pf = loadPids(id);
    let status: "running" | "stopped" = "stopped";
    if (pf && pf.pids.some((p) => isAlive(p.pid))) {
      status = "running";
    }

    testnets.push({
      chainId: id,
      validators: meta.validators,
      status,
      createdAt: meta.createdAt,
    });
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ testnets }, null, 2) + "\n");
    return;
  }

  if (testnets.length === 0) {
    console.log("No testnets found.");
    console.log();
    return;
  }

  console.log(`Local Testnets (${testnets.length})\n`);

  const headers = ["Chain ID", "Validators", "Status", "Created"];
  const rows = testnets.map((t) => [
    t.chainId,
    String(t.validators),
    t.status,
    t.createdAt,
  ]);

  console.log(table(headers, rows));
  console.log();
}
