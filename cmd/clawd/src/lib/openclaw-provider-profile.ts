import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ClawdConfig } from "./config.js";

export type OpenClawProviderProfileOptions = {
  profile: string;
  stateDir: string;
  rpcUrl: string;
  restUrl?: string;
  messagingEndpoint?: string;
  nodeBinary?: string;
};

type JsonObject = Record<string, unknown>;

export function resolveOpenClawProviderConfigPath(stateDir: string): string {
  return join(stateDir, "openclaw.json");
}

export function ensureOpenClawProviderProfile(
  cfg: ClawdConfig,
  options: OpenClawProviderProfileOptions,
): { path: string; changed: boolean; config: JsonObject } {
  const path = resolveOpenClawProviderConfigPath(options.stateDir);
  const existing = readExistingConfig(path);
  const next = buildOpenClawProviderProfile(existing, cfg, options);

  // Compare ignoring meta.lastTouchedAt to achieve idempotency
  const prevRaw = existsSync(path) ? safeRead(path) : null;
  const compareNext = { ...next, meta: { ...(next.meta as JsonObject), lastTouchedAt: undefined } };
  let comparePrev: JsonObject | null = null;
  if (prevRaw) {
    try {
      const parsed = JSON.parse(prevRaw) as JsonObject;
      const prevMeta = asObject(parsed.meta);
      comparePrev = { ...parsed, meta: { ...prevMeta, lastTouchedAt: undefined } };
    } catch {
      comparePrev = null;
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  if (comparePrev && JSON.stringify(comparePrev) === JSON.stringify(compareNext)) {
    return { path, changed: false, config: next };
  }

  const nextRaw = JSON.stringify(next, null, 2) + "\n";
  writeFileSync(path, nextRaw);
  return { path, changed: true, config: next };
}

export function buildOpenClawProviderProfile(
  existing: JsonObject,
  cfg: ClawdConfig,
  options: OpenClawProviderProfileOptions,
): JsonObject {
  const existingMeta = asObject(existing.meta);
  const existingGateway = asObject(existing.gateway);
  const existingGatewayReload = asObject(existingGateway.reload);
  const existingBlockchain = asObject(existing.blockchain);
  const existingNode = asObject(existingBlockchain.node);
  const existingFaucet = asObject(existingBlockchain.faucet);
  const existingPeers = asObject(existingBlockchain.peers);
  const existingHeartbeat = asObject(existingBlockchain.heartbeat);
  const existingAutonomousLoop = asObject(existingBlockchain.autonomousLoop);

  return {
    ...existing,
    meta: {
      ...existingMeta,
      lastTouchedAt: new Date().toISOString(),
      lastTouchedVersion: "clawd-provider",
    },
    gateway: {
      ...existingGateway,
      mode: "local",
      bind: "loopback",
      reload: {
        ...existingGatewayReload,
        mode: "hybrid",
      },
    },
    blockchain: {
      ...existingBlockchain,
      enabled: true,
      rpcUrl: options.rpcUrl,
      ...(options.restUrl ? { restUrl: options.restUrl } : {}),
      denom: cfg.denom ?? "uclaw",
      prefix: cfg.prefix ?? "claw",
      gasPrice: cfg.gasPrice ?? "0.025uclaw",
      autoRegister: true,
      ...(options.messagingEndpoint ? { messagingEndpoint: options.messagingEndpoint } : {}),
      node: {
        ...existingNode,
        autoStart: cfg.nodeAutoStart,
        ...(options.nodeBinary ?? cfg.nodeBinaryPath
          ? { binaryPath: options.nodeBinary ?? cfg.nodeBinaryPath }
          : {}),
        ...(cfg.nodeHome ? { home: cfg.nodeHome } : {}),
      },
      faucet: {
        ...existingFaucet,
        enabled: cfg.faucetEnabled === true,
        ...(cfg.faucetPort ? { port: cfg.faucetPort } : {}),
        ...(cfg.faucetUrl ? { url: cfg.faucetUrl } : {}),
      },
      peers: {
        ...existingPeers,
        ...(cfg.seeds ? { seeds: cfg.seeds } : {}),
        ...(cfg.persistentPeers ? { persistentPeers: cfg.persistentPeers } : {}),
      },
      heartbeat: {
        ...existingHeartbeat,
        enabled: true,
        includeNodeStatus: true,
      },
      autonomousLoop: {
        ...existingAutonomousLoop,
        enabled: cfg.autonomousLoopEnabled === true,
        autoAcceptTasks: true,
        ...(cfg.autonomousLoopIntervalSeconds
          ? { pollIntervalMs: cfg.autonomousLoopIntervalSeconds * 1000 }
          : {}),
        ...(cfg.autonomousMaxPendingAcceptedTasks
          ? { maxConcurrentTasks: cfg.autonomousMaxPendingAcceptedTasks }
          : {}),
      },
    },
  };
}

function readExistingConfig(path: string): JsonObject {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return asObject(parsed);
  } catch {
    return {};
  }
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
