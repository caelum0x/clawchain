import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadModelCatalog } from "../agents/model-catalog.js";
import {
  getModelRefStatus,
  resolveConfiguredModelRef,
  resolveHooksGmailModel,
} from "../agents/model-selection.js";
import { resolveAgentSessionDirs } from "../agents/session-dirs.js";
import { cleanStaleLockFiles } from "../agents/session-write-lock.js";
import type { CliDeps } from "../cli/deps.js";
import type { loadConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { startGmailWatcher } from "../hooks/gmail-watcher.js";
import {
  clearInternalHooks,
  createInternalHookEvent,
  triggerInternalHook,
} from "../hooks/internal-hooks.js";
import { loadInternalHooks } from "../hooks/loader.js";
import { isTruthyEnvValue } from "../infra/env.js";
import type { loadOpenClawPlugins } from "../plugins/loader.js";
import { type PluginServicesHandle, startPluginServices } from "../plugins/services.js";
import { startBrowserControlServerIfEnabled } from "./server-browser.js";
import {
  scheduleRestartSentinelWake,
  shouldWakeFromRestartSentinel,
} from "./server-restart-sentinel.js";
import { startGatewayMemoryBackend } from "./server-startup-memory.js";
import {
  initializeBlockchain,
  shutdownBlockchain,
} from "../../extensions/clawchain/index.js";

const SESSION_LOCK_STALE_MS = 30 * 60 * 1000;

type ClawdConfigFallback = {
  rpcUrl?: string;
  restUrl?: string;
  nodeAutoStart?: boolean;
  nodeBinaryPath?: string;
  nodeHome?: string;
  seeds?: string;
  persistentPeers?: string;
  faucetUrl?: string;
  faucetEnabled?: boolean;
  faucetPort?: number;
  messagingEndpoint?: string;
  denom?: string;
  prefix?: string;
  gasPrice?: string;
};

export async function startGatewaySidecars(params: {
  cfg: ReturnType<typeof loadConfig>;
  pluginRegistry: ReturnType<typeof loadOpenClawPlugins>;
  defaultWorkspaceDir: string;
  deps: CliDeps;
  startChannels: () => Promise<void>;
  log: { warn: (msg: string) => void };
  logHooks: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  logChannels: { info: (msg: string) => void; error: (msg: string) => void };
  logBrowser: { error: (msg: string) => void };
}) {
  try {
    const stateDir = resolveStateDir(process.env);
    const sessionDirs = await resolveAgentSessionDirs(stateDir);
    for (const sessionsDir of sessionDirs) {
      await cleanStaleLockFiles({
        sessionsDir,
        staleMs: SESSION_LOCK_STALE_MS,
        removeStale: true,
        log: { warn: (message) => params.log.warn(message) },
      });
    }
  } catch (err) {
    params.log.warn(`session lock cleanup failed on startup: ${String(err)}`);
  }

  // Start OpenClaw browser control server (unless disabled via config).
  let browserControl: Awaited<ReturnType<typeof startBrowserControlServerIfEnabled>> = null;
  try {
    browserControl = await startBrowserControlServerIfEnabled();
  } catch (err) {
    params.logBrowser.error(`server failed to start: ${String(err)}`);
  }

  // Start Gmail watcher if configured (hooks.gmail.account).
  if (!isTruthyEnvValue(process.env.OPENCLAW_SKIP_GMAIL_WATCHER)) {
    try {
      const gmailResult = await startGmailWatcher(params.cfg);
      if (gmailResult.started) {
        params.logHooks.info("gmail watcher started");
      } else if (
        gmailResult.reason &&
        gmailResult.reason !== "hooks not enabled" &&
        gmailResult.reason !== "no gmail account configured"
      ) {
        params.logHooks.warn(`gmail watcher not started: ${gmailResult.reason}`);
      }
    } catch (err) {
      params.logHooks.error(`gmail watcher failed to start: ${String(err)}`);
    }
  }

  // Validate hooks.gmail.model if configured.
  if (params.cfg.hooks?.gmail?.model) {
    const hooksModelRef = resolveHooksGmailModel({
      cfg: params.cfg,
      defaultProvider: DEFAULT_PROVIDER,
    });
    if (hooksModelRef) {
      const { provider: defaultProvider, model: defaultModel } = resolveConfiguredModelRef({
        cfg: params.cfg,
        defaultProvider: DEFAULT_PROVIDER,
        defaultModel: DEFAULT_MODEL,
      });
      const catalog = await loadModelCatalog({ config: params.cfg });
      const status = getModelRefStatus({
        cfg: params.cfg,
        catalog,
        ref: hooksModelRef,
        defaultProvider,
        defaultModel,
      });
      if (!status.allowed) {
        params.logHooks.warn(
          `hooks.gmail.model "${status.key}" not in agents.defaults.models allowlist (will use primary instead)`,
        );
      }
      if (!status.inCatalog) {
        params.logHooks.warn(
          `hooks.gmail.model "${status.key}" not in the model catalog (may fail at runtime)`,
        );
      }
    }
  }

  // Load internal hook handlers from configuration and directory discovery.
  try {
    // Clear any previously registered hooks to ensure fresh loading
    clearInternalHooks();
    const loadedCount = await loadInternalHooks(params.cfg, params.defaultWorkspaceDir);
    if (loadedCount > 0) {
      params.logHooks.info(
        `loaded ${loadedCount} internal hook handler${loadedCount > 1 ? "s" : ""}`,
      );
    }
  } catch (err) {
    params.logHooks.error(`failed to load hooks: ${String(err)}`);
  }

  // Launch configured channels so gateway replies via the surface the message came from.
  // Tests can opt out via OPENCLAW_SKIP_CHANNELS (or legacy OPENCLAW_SKIP_PROVIDERS).
  const skipChannels =
    isTruthyEnvValue(process.env.OPENCLAW_SKIP_CHANNELS) ||
    isTruthyEnvValue(process.env.OPENCLAW_SKIP_PROVIDERS);
  if (!skipChannels) {
    try {
      await params.startChannels();
    } catch (err) {
      params.logChannels.error(`channel startup failed: ${String(err)}`);
    }
  } else {
    params.logChannels.info(
      "skipping channel start (OPENCLAW_SKIP_CHANNELS=1 or OPENCLAW_SKIP_PROVIDERS=1)",
    );
  }

  if (params.cfg.hooks?.internal?.enabled) {
    setTimeout(() => {
      const hookEvent = createInternalHookEvent("gateway", "startup", "gateway:startup", {
        cfg: params.cfg,
        deps: params.deps,
        workspaceDir: params.defaultWorkspaceDir,
      });
      void triggerInternalHook(hookEvent);
    }, 250);
  }

  let pluginServices: PluginServicesHandle | null = null;
  try {
    pluginServices = await startPluginServices({
      registry: params.pluginRegistry,
      config: params.cfg,
      workspaceDir: params.defaultWorkspaceDir,
    });
  } catch (err) {
    params.log.warn(`plugin services failed to start: ${String(err)}`);
  }

  // Apply BLOCKCHAIN_* env-var overrides (set by `clawd start`).
  const parsePositiveIntEnv = (v: string | undefined): number | undefined => {
    if (!v) {return undefined;}
    const parsed = Number.parseInt(v, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {return undefined;}
    return parsed;
  };

  // If OpenClaw is launched directly, fall back to clawd operator config.
  const clawdFallback = loadClawdConfigFallback();
  if (clawdFallback) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.enabled ??= true;
    params.cfg.blockchain.rpcUrl ??= clawdFallback.rpcUrl;
    params.cfg.blockchain.restUrl ??= clawdFallback.restUrl;
    params.cfg.blockchain.messagingEndpoint ??= clawdFallback.messagingEndpoint;
    params.cfg.blockchain.denom ??= clawdFallback.denom;
    params.cfg.blockchain.prefix ??= clawdFallback.prefix;
    params.cfg.blockchain.gasPrice ??= clawdFallback.gasPrice;
    params.cfg.blockchain.node ??= {};
    params.cfg.blockchain.node.autoStart ??= clawdFallback.nodeAutoStart;
    params.cfg.blockchain.node.binaryPath ??= clawdFallback.nodeBinaryPath;
    params.cfg.blockchain.node.home ??= clawdFallback.nodeHome;
    params.cfg.blockchain.peers ??= {};
    params.cfg.blockchain.peers.seeds ??= clawdFallback.seeds;
    params.cfg.blockchain.peers.persistentPeers ??= clawdFallback.persistentPeers;
    params.cfg.blockchain.faucet ??= {};
    params.cfg.blockchain.faucet.enabled ??= clawdFallback.faucetEnabled;
    params.cfg.blockchain.faucet.url ??= clawdFallback.faucetUrl;
    params.cfg.blockchain.faucet.port ??= clawdFallback.faucetPort;
    params.log.warn("[blockchain] loaded clawd runtime defaults from ~/.clawd/clawd.json");
  }

  if (isTruthyEnvValue(process.env.BLOCKCHAIN_ENABLED)) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.enabled = true;
  }
  if (process.env.BLOCKCHAIN_RPC_URL) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
  }
  if (process.env.BLOCKCHAIN_REST_URL) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.restUrl = process.env.BLOCKCHAIN_REST_URL;
  }
  if (process.env.BLOCKCHAIN_MNEMONIC) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.mnemonic = process.env.BLOCKCHAIN_MNEMONIC;
  }
  if (process.env.BLOCKCHAIN_DENOM) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.denom = process.env.BLOCKCHAIN_DENOM;
  }
  if (process.env.BLOCKCHAIN_PREFIX) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.prefix = process.env.BLOCKCHAIN_PREFIX;
  }
  if (process.env.BLOCKCHAIN_GAS_PRICE) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.gasPrice = process.env.BLOCKCHAIN_GAS_PRICE;
  }
  if (process.env.BLOCKCHAIN_MESSAGING_ENDPOINT) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.messagingEndpoint = process.env.BLOCKCHAIN_MESSAGING_ENDPOINT;
  }
  if (isTruthyEnvValue(process.env.BLOCKCHAIN_AUTO_REGISTER)) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.autoRegister = true;
  }
  if (isTruthyEnvValue(process.env.BLOCKCHAIN_NODE_AUTOSTART)) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.node ??= {};
    params.cfg.blockchain.node.autoStart = true;
  }
  if (process.env.BLOCKCHAIN_NODE_BINARY_PATH) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.node ??= {};
    params.cfg.blockchain.node.binaryPath = process.env.BLOCKCHAIN_NODE_BINARY_PATH;
  }
  if (process.env.BLOCKCHAIN_NODE_HOME) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.node ??= {};
    params.cfg.blockchain.node.home = process.env.BLOCKCHAIN_NODE_HOME;
  }
  if (process.env.BLOCKCHAIN_PEER_SEEDS) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.peers ??= {};
    params.cfg.blockchain.peers.seeds = process.env.BLOCKCHAIN_PEER_SEEDS;
  }
  if (process.env.BLOCKCHAIN_PERSISTENT_PEERS) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.peers ??= {};
    params.cfg.blockchain.peers.persistentPeers = process.env.BLOCKCHAIN_PERSISTENT_PEERS;
  }
  if (isTruthyEnvValue(process.env.BLOCKCHAIN_FAUCET_ENABLED)) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.faucet ??= {};
    params.cfg.blockchain.faucet.enabled = true;
  }
  if (process.env.BLOCKCHAIN_FAUCET_URL) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.faucet ??= {};
    params.cfg.blockchain.faucet.url = process.env.BLOCKCHAIN_FAUCET_URL;
  }
  if (process.env.BLOCKCHAIN_FAUCET_DRIP_AMOUNT) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.faucet ??= {};
    params.cfg.blockchain.faucet.dripAmount = process.env.BLOCKCHAIN_FAUCET_DRIP_AMOUNT;
  }
  {
    const faucetPort = parsePositiveIntEnv(process.env.BLOCKCHAIN_FAUCET_PORT);
    if (faucetPort !== undefined) {
      params.cfg.blockchain ??= {};
      params.cfg.blockchain.faucet ??= {};
      params.cfg.blockchain.faucet.port = faucetPort;
    }
  }
  if (isTruthyEnvValue(process.env.BLOCKCHAIN_HEARTBEAT_ENABLED)) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.heartbeat ??= {};
    params.cfg.blockchain.heartbeat.enabled = true;
  }
  if (isTruthyEnvValue(process.env.BLOCKCHAIN_HEARTBEAT_INCLUDE_NODE_STATUS)) {
    params.cfg.blockchain ??= {};
    params.cfg.blockchain.heartbeat ??= {};
    params.cfg.blockchain.heartbeat.includeNodeStatus = true;
  }
  {
    const heartbeatInterval = parsePositiveIntEnv(process.env.BLOCKCHAIN_HEARTBEAT_INTERVAL_SECONDS);
    if (heartbeatInterval !== undefined) {
      params.cfg.blockchain ??= {};
      params.cfg.blockchain.heartbeat ??= {};
      params.cfg.blockchain.heartbeat.intervalSeconds = heartbeatInterval;
    }
  }

  // Initialize ClawChain blockchain subsystem if enabled.
  let blockchainInfo: { address: string | null; registered: boolean } | null = null;
  if (params.cfg.blockchain?.enabled) {
    try {
      blockchainInfo = await initializeBlockchain(params.cfg.blockchain, {
        info: (msg) => params.log.warn(`[blockchain] ${msg}`),
        warn: (msg) => params.log.warn(`[blockchain] ${msg}`),
        error: (msg) => params.log.warn(`[blockchain] ${msg}`),
      });
      if (blockchainInfo.address) {
        params.log.warn(
          `[blockchain] agent active at ${blockchainInfo.address} (registered: ${blockchainInfo.registered})`,
        );
      }
    } catch (err) {
      params.log.warn(`[blockchain] initialization failed: ${String(err)}`);
    }
  }

  void startGatewayMemoryBackend({ cfg: params.cfg, log: params.log }).catch((err) => {
    params.log.warn(`qmd memory startup initialization failed: ${String(err)}`);
  });

  if (shouldWakeFromRestartSentinel()) {
    setTimeout(() => {
      void scheduleRestartSentinelWake({ deps: params.deps });
    }, 750);
  }

  return { browserControl, pluginServices, blockchainInfo, shutdownBlockchain };
}

function loadClawdConfigFallback(): ClawdConfigFallback | null {
  const clawdHome = process.env.CLAWD_HOME ?? join(homedir(), ".clawd");
  const clawdConfigPath = join(clawdHome, "clawd.json");
  if (!existsSync(clawdConfigPath)) {return null;}
  try {
    const raw = readFileSync(clawdConfigPath, "utf8");
    return JSON.parse(raw) as ClawdConfigFallback;
  } catch {
    return null;
  }
}
