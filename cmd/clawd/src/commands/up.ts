/**
 * `clawd up` — one-command operator runtime bootstrap.
 *
 * Order:
 * 1) init (only if mnemonic is missing, unless --skip-init)
 * 2) optional join (manifest/nodecard/explicit network opts)
 * 3) start unified runtime (OpenClaw gateway + chain integration + messaging)
 */

import { mnemonicFileExists } from "../lib/mnemonic.js";
import {
  loadClawdConfig,
  writeClawdConfig,
  type ClawdUpSnapshot,
} from "../lib/config.js";
import { acquireUpLockOrExit } from "../lib/up-lock.js";
import { runInit } from "./init.js";
import { runJoin } from "./join.js";
import { runStart } from "./start.js";
import { waitForIntegratedReadiness, waitForStartupLifecycle, evaluateStartupLifecycle } from "../lib/readiness.js";
import { runAgentBootstrap } from "./agent-flow.js";

export type UpOptions = {
  openclawBin?: string;
  nodeBinary?: string;
  messagingPort?: number;
  noAutoStart?: boolean;
  skipInit?: boolean;
  skipJoin?: boolean;
  initMoniker?: string;
  chainId?: string;
  skipSetup?: boolean;
  fromManifest?: string;
  fromNodecard?: string;
  rpcUrl?: string;
  restUrl?: string;
  seeds?: string;
  persistentPeers?: string;
  faucetUrl?: string;
  messagingEndpoint?: string;
  host?: string;
  noSyncGenesis?: boolean;
  requestFaucet?: boolean;
  requireSignedManifest?: boolean;
  manifestTrustedPubkeys?: string;
  requireReady?: boolean;
  readyTimeoutSeconds?: number;
  skipReadyGate?: boolean;
};

export type UpAutoBootstrapReport = {
  attempted: boolean;
  triggerStage?: "register" | "heartbeat";
  ok?: boolean;
  reason?: string;
  stage?: string;
  error?: string;
  registerTxHash?: string;
  heartbeatTxHash?: string;
};

export type UpRunReport = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  steps: {
    initRan: boolean;
    joinRan: boolean;
    startRan: boolean;
    readinessEnforced: boolean;
    startupLifecyclePassed?: boolean;
    integratedReadinessPassed?: boolean;
  };
  autoBootstrap: UpAutoBootstrapReport;
  errors: string[];
};

export async function runUp(options: UpOptions): Promise<UpRunReport> {
  const releaseLock = acquireUpLockOrExit("clawd up");
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const report: UpRunReport = {
    ok: false,
    startedAt,
    finishedAt: startedAt,
    steps: {
      initRan: false,
      joinRan: false,
      startRan: false,
      readinessEnforced: false,
    },
    autoBootstrap: {
      attempted: false,
      reason: "not-evaluated",
    },
    errors,
  };
  try {
    if (options.messagingPort || options.host) {
      const cfg = loadClawdConfig();
      const next = { ...cfg };
      if (options.messagingPort) next.messagingPort = options.messagingPort;
      if (options.host) next.publicHost = options.host;
      writeClawdConfig(next);
    }

    const hasMnemonic = mnemonicFileExists();

    if (!hasMnemonic) {
      if (options.skipInit) {
        throw new Error(
          "No mnemonic found and --skip-init was set. Run `clawd init` first or remove --skip-init.",
        );
      }
      console.log("clawd up: no local identity found. Running init first...\n");
      await runInit({
        moniker: options.initMoniker,
        chainId: options.chainId,
        nodeBinary: options.nodeBinary,
        skipSetup: options.skipSetup,
        seeds: options.seeds,
        persistentPeers: options.persistentPeers,
      });
      report.steps.initRan = true;
      console.log("");
    }

    const shouldJoin =
      !options.skipJoin &&
      Boolean(
        options.fromManifest ||
          options.fromNodecard ||
          options.chainId ||
          options.rpcUrl ||
          options.restUrl ||
          options.seeds ||
          options.persistentPeers ||
          options.faucetUrl ||
          options.messagingEndpoint,
      );

    if (shouldJoin) {
      console.log("clawd up: applying network join configuration...\n");
      await runJoin({
        fromManifest: options.fromManifest,
        fromNodecard: options.fromNodecard,
        chainId: options.chainId,
        rpcUrl: options.rpcUrl,
        restUrl: options.restUrl,
        seeds: options.seeds,
        persistentPeers: options.persistentPeers,
        faucetUrl: options.faucetUrl,
        messagingEndpoint: options.messagingEndpoint,
        host: options.host,
        syncGenesis: options.noSyncGenesis ? false : true,
        requestFaucet: options.requestFaucet,
        requireSignedManifest: options.requireSignedManifest,
        manifestTrustedPubkeys: options.manifestTrustedPubkeys,
      });
      report.steps.joinRan = true;
      console.log("");
    }

    await runStart({
      openclawBin: options.openclawBin,
      nodeBinary: options.nodeBinary,
      rpcUrl: options.rpcUrl,
      restUrl: options.restUrl,
      seeds: options.seeds,
      persistentPeers: options.persistentPeers,
      messagingEndpoint: options.messagingEndpoint,
      noAutoStart: options.noAutoStart,
      messagingPort: options.messagingPort,
    });
    report.steps.startRan = true;

    report.autoBootstrap = await maybeAutoRecoverAgentLifecycle(options);
    if (report.autoBootstrap.attempted && report.autoBootstrap.ok === false) {
      throw new Error(
        `agent bootstrap failed [${report.autoBootstrap.stage ?? "unknown"}]: ${report.autoBootstrap.error ?? "unknown error"}`,
      );
    }

    const enforceReady =
      !options.skipReadyGate &&
      (options.requireReady === true || shouldEnforceReadinessByDefault(options));

    if (enforceReady) {
      report.steps.readinessEnforced = true;
      const timeoutSeconds = Math.max(10, options.readyTimeoutSeconds ?? 120);
      await enforceStartupLifecycle(timeoutSeconds);
      report.steps.startupLifecyclePassed = true;
      await enforceIntegratedReadiness(timeoutSeconds);
      report.steps.integratedReadinessPassed = true;
    }
  } catch (err) {
    errors.push(normalizeError(err));
  } finally {
    report.finishedAt = new Date().toISOString();
    report.ok = errors.length === 0;
    writeUpSnapshot(options, errors, report);
    releaseLock();
  }
  return report;
}

async function maybeAutoRecoverAgentLifecycle(options: UpOptions): Promise<UpAutoBootstrapReport> {
  const lifecycle = await evaluateStartupLifecycle();
  const chainStage = lifecycle.stages.find((s) => s.stage === "chain_connect");
  const current = lifecycle.currentStage;

  if (!chainStage?.ok) {
    return {
      attempted: false,
      reason: "chain-not-ready",
    };
  }
  if (current !== "register" && current !== "heartbeat") {
    return {
      attempted: false,
      reason: "lifecycle-not-blocked-at-register-or-heartbeat",
    };
  }

  console.log(`clawd up: lifecycle blocked at ${current}. Running typed agent bootstrap...`);
  const out = await runAgentBootstrap({
    endpoint: options.messagingEndpoint,
  });
  if (!out.ok) {
    return {
      attempted: true,
      triggerStage: current,
      ok: false,
      stage: out.stage,
      error: out.error ?? "unknown error",
      registerTxHash: out.registerTxHash,
      heartbeatTxHash: out.heartbeatTxHash,
    };
  }
  console.log("clawd up: agent bootstrap completed (register + heartbeat).");
  return {
    attempted: true,
    triggerStage: current,
    ok: true,
    stage: out.stage,
    registerTxHash: out.registerTxHash,
    heartbeatTxHash: out.heartbeatTxHash,
  };
}

async function enforceStartupLifecycle(timeoutSeconds: number): Promise<void> {
  const startedAt = Date.now();
  let lastBlocker = "unknown";

  console.log(`clawd up: enforcing startup lifecycle path (timeout: ${timeoutSeconds}s)...`);
  const report = await waitForStartupLifecycle(timeoutSeconds, {
    intervalMs: 5000,
    onPending: (pending) => {
      lastBlocker = pending.blocker ?? "unknown";
      console.log(`clawd up: lifecycle pending -> ${lastBlocker}`);
    },
  });

  if (report.completed) {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    console.log(`clawd up: startup lifecycle path satisfied in ${elapsed}s.`);
    return;
  }

  throw new Error(`startup lifecycle path timed out after ${timeoutSeconds}s. blocker: ${lastBlocker}`);
}

async function enforceIntegratedReadiness(timeoutSeconds: number): Promise<void> {
  const startedAt = Date.now();
  let lastBlockers = "unknown";

  console.log(`clawd up: waiting for integrated readiness (timeout: ${timeoutSeconds}s)...`);
  const report = await waitForIntegratedReadiness(timeoutSeconds, {
    intervalMs: 5000,
    onPending: (pending) => {
      lastBlockers = pending.blockers.map((b) => `${b.name}: ${b.detail}`).join(" | ");
      console.log(`clawd up: readiness pending -> ${lastBlockers}`);
    },
  });
  if (report.ready) {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    console.log(`clawd up: integrated readiness passed in ${elapsed}s.`);
    return;
  }

  throw new Error(`integrated readiness timed out after ${timeoutSeconds}s. blockers: ${lastBlockers}`);
}

function writeUpSnapshot(options: UpOptions, errors: string[], report?: UpRunReport): void {
  const cfg = loadClawdConfig();
  const snapshot: ClawdUpSnapshot = {
    lastUpAt: new Date().toISOString(),
    ok: report?.ok,
    delegateMode: options.openclawBin ? "explicit-openclaw-bin" : "default-openclaw",
    bootstrapSource: resolveBootstrapSource(options),
    steps: report?.steps,
    autoBootstrap: report?.autoBootstrap,
    errors: [...errors],
  };
  writeClawdConfig({ ...cfg, lastUp: snapshot });
}

function resolveBootstrapSource(options: UpOptions): ClawdUpSnapshot["bootstrapSource"] {
  if (options.fromManifest) return "manifest";
  if (options.fromNodecard) return "nodecard";
  if (
    options.chainId ||
    options.rpcUrl ||
    options.restUrl ||
    options.seeds ||
    options.persistentPeers ||
    options.faucetUrl ||
    options.messagingEndpoint ||
    options.host
  ) {
    return "manual";
  }
  return "none";
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function shouldEnforceReadinessByDefault(options: UpOptions): boolean {
  if (options.fromManifest || options.fromNodecard) return true;
  if (options.host || options.faucetUrl || options.messagingEndpoint) return true;
  if (options.seeds || options.persistentPeers) return true;

  const cfg = loadClawdConfig();
  const effectiveRpc = options.rpcUrl ?? cfg.rpcUrl ?? "http://localhost:26657";
  const effectiveRest = options.restUrl ?? cfg.restUrl ?? deriveRestUrl(effectiveRpc);

  return !isLocalEndpoint(effectiveRpc) || !isLocalEndpoint(effectiveRest);
}

function isLocalEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function deriveRestUrl(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}
