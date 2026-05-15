/**
 * `clawd start` — sets BLOCKCHAIN_* env vars, spawns `openclaw gateway run`,
 * and optionally starts the faucet server and agent messaging server.
 */

import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { FaucetServer } from "../lib/faucet-server.js";
import { AgentMessageServer } from "../lib/message-server.js";
import { MessageStore } from "../lib/message-store.js";
import {
  CLAWD_HOME,
  CLAWD_OPENCLAW_CONFIG_PATH,
  CLAWD_OPENCLAW_PROFILE,
  CLAWD_OPENCLAW_STATE_DIR,
} from "../lib/paths.js";
import { commandHelpText, executeChatIntent, parseChatIntent } from "../lib/chat-intent.js";
import { sendAgentMessage } from "../lib/messaging.js";
import { startAutonomousLoop, type AutonomousLoopHandle } from "../lib/autonomous-loop.js";
import { recoverOrphanedTasks, createRestTaskFetcher } from "../lib/task-recovery.js";
import { ensureOpenClawProviderProfile } from "../lib/openclaw-provider-profile.js";

export type StartOptions = {
  /** Override the openclaw binary path. */
  openclawBin?: string;
  /** Override the clawchaind binary path. */
  nodeBinary?: string;
  /** Skip auto-starting the chain node. */
  noAutoStart?: boolean;
  /** Override the messaging server port. */
  messagingPort?: number;
  /** Override blockchain RPC URL. */
  rpcUrl?: string;
  /** Override blockchain REST URL. */
  restUrl?: string;
  /** Override seed peers (nodeID@host:port,...). */
  seeds?: string;
  /** Override persistent peers (nodeID@host:port,...). */
  persistentPeers?: string;
  /** Public endpoint for incoming encrypted messages. */
  messagingEndpoint?: string;
};

export async function runStart(options: StartOptions): Promise<void> {
  const config = loadClawdConfig();
  const rpcUrl = options.rpcUrl ?? config.rpcUrl ?? "http://localhost:26657";
  const restUrl = options.restUrl ?? config.restUrl;
  const seeds = options.seeds ?? config.seeds;
  const persistentPeers = options.persistentPeers ?? config.persistentPeers;
  const messagingEndpoint = options.messagingEndpoint ?? config.messagingEndpoint;

  // Resolve mnemonic
  let mnemonic: string | null = null;
  if (mnemonicFileExists()) {
    try {
      mnemonic = loadMnemonic();
    } catch (err) {
      console.error(`Failed to load mnemonic: ${String(err)}`);
      process.exit(1);
    }
  }

  if (!mnemonic) {
    console.error(
      'No mnemonic found. Run "clawd init" first to generate one.',
    );
    process.exit(1);
  }

  // Build env vars for the openclaw gateway
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    BLOCKCHAIN_ENABLED: "true",
    BLOCKCHAIN_MNEMONIC: mnemonic,
    OPENCLAW_PROFILE: process.env.OPENCLAW_PROFILE?.trim() || CLAWD_OPENCLAW_PROFILE,
    OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR?.trim() || CLAWD_OPENCLAW_STATE_DIR,
    OPENCLAW_HOME: process.env.OPENCLAW_HOME?.trim() || CLAWD_OPENCLAW_STATE_DIR,
    OPENCLAW_CONFIG_PATH: process.env.OPENCLAW_CONFIG_PATH?.trim() || CLAWD_OPENCLAW_CONFIG_PATH,
  };

  env.BLOCKCHAIN_RPC_URL = rpcUrl;
  if (restUrl) env.BLOCKCHAIN_REST_URL = restUrl;
  if (config.denom) env.BLOCKCHAIN_DENOM = config.denom;
  if (config.prefix) env.BLOCKCHAIN_PREFIX = config.prefix;
  if (config.gasPrice) env.BLOCKCHAIN_GAS_PRICE = config.gasPrice;
  if (messagingEndpoint) env.BLOCKCHAIN_MESSAGING_ENDPOINT = messagingEndpoint;
  if (seeds) env.BLOCKCHAIN_PEER_SEEDS = seeds;
  if (persistentPeers) env.BLOCKCHAIN_PERSISTENT_PEERS = persistentPeers;
  env.BLOCKCHAIN_AUTO_REGISTER = "true";

  if (!options.noAutoStart && config.nodeAutoStart) {
    env.BLOCKCHAIN_NODE_AUTOSTART = "true";
  }

  if (options.nodeBinary ?? config.nodeBinaryPath) {
    env.BLOCKCHAIN_NODE_BINARY_PATH = options.nodeBinary ?? config.nodeBinaryPath!;
  }

  if (config.nodeHome) {
    env.BLOCKCHAIN_NODE_HOME = config.nodeHome;
  }
  if (config.faucetEnabled) {
    env.BLOCKCHAIN_FAUCET_ENABLED = "true";
  }
  if (config.faucetUrl) {
    env.BLOCKCHAIN_FAUCET_URL = config.faucetUrl;
  }
  if (config.faucetPort) {
    env.BLOCKCHAIN_FAUCET_PORT = String(config.faucetPort);
  }

  const providerProfile = ensureOpenClawProviderProfile(config, {
    profile: env.OPENCLAW_PROFILE,
    stateDir: env.OPENCLAW_STATE_DIR,
    rpcUrl,
    restUrl,
    messagingEndpoint,
    nodeBinary: options.nodeBinary ?? config.nodeBinaryPath,
  });

  const soulStatus = ensureSoulBootstrapFile();

  const openclawBin = options.openclawBin ?? "openclaw";
  const messagingPort = options.messagingPort ?? config.messagingPort ?? 7777;
  const autonomousEnabled = config.autonomousLoopEnabled ?? process.env.CLAWD_AUTONOMOUS_LOOP === "1";
  const autonomousAutoComplete = config.autonomousLoopAutoComplete ?? process.env.CLAWD_AUTONOMOUS_AUTO_COMPLETE === "1";
  const autonomousIntervalSecondsRaw = config.autonomousLoopIntervalSeconds ?? Number(process.env.CLAWD_AUTONOMOUS_INTERVAL_SECONDS ?? 20);
  const autonomousIntervalSeconds = Number.isFinite(autonomousIntervalSecondsRaw) && autonomousIntervalSecondsRaw > 0
    ? autonomousIntervalSecondsRaw
    : 20;
  const autonomousSkillExecutorCommand = (config.autonomousSkillExecutorCommand ?? process.env.CLAWD_AUTONOMOUS_SKILL_EXECUTOR_CMD ?? "").trim();
  const autonomousSkillExecutorMap = parseExecutorMap(
    config.autonomousSkillExecutorMap,
    process.env.CLAWD_AUTONOMOUS_SKILL_EXECUTOR_MAP_JSON,
  );
  const autonomousSkillExecutorTimeoutRaw =
    config.autonomousSkillExecutorTimeoutSeconds ?? Number(process.env.CLAWD_AUTONOMOUS_SKILL_EXECUTOR_TIMEOUT_SECONDS ?? 90);
  const autonomousSkillExecutorTimeoutSeconds = Number.isFinite(autonomousSkillExecutorTimeoutRaw) && autonomousSkillExecutorTimeoutRaw > 0
    ? autonomousSkillExecutorTimeoutRaw
    : 90;
  const autonomousMinTaskBudgetUclaw = parseNonNegativeBigInt(
    config.autonomousMinTaskBudgetUclaw ?? process.env.CLAWD_AUTONOMOUS_MIN_TASK_BUDGET_UCLAW ?? "0",
    0n,
  );
  const autonomousMinTaskProfitUclaw = parseNonNegativeBigInt(
    config.autonomousMinTaskProfitUclaw ?? process.env.CLAWD_AUTONOMOUS_MIN_TASK_PROFIT_UCLAW ?? "0",
    0n,
  );
  const autonomousMaxAcceptPerTick = parsePositiveInt(
    config.autonomousMaxAcceptPerTick ?? Number(process.env.CLAWD_AUTONOMOUS_MAX_ACCEPT_PER_TICK ?? 3),
    3,
  );
  const autonomousMaxPendingAcceptedTasks = parsePositiveInt(
    config.autonomousMaxPendingAcceptedTasks ?? Number(process.env.CLAWD_AUTONOMOUS_MAX_PENDING_ACCEPTED_TASKS ?? 20),
    20,
  );
  const autonomousAllowedSkillIds = parseAllowedSkillIds(
    config.autonomousAllowedSkillIds,
    process.env.CLAWD_AUTONOMOUS_ALLOWED_SKILL_IDS,
  );
  const autonomousDefaultExecutionCostUclaw = parseNonNegativeBigInt(
    config.autonomousDefaultExecutionCostUclaw ?? process.env.CLAWD_AUTONOMOUS_DEFAULT_EXEC_COST_UCLAW ?? "0",
    0n,
  );
  const autonomousMaxExecutionCostPerTaskUclaw = parseNonNegativeBigInt(
    config.autonomousMaxExecutionCostPerTaskUclaw ?? process.env.CLAWD_AUTONOMOUS_MAX_EXEC_COST_PER_TASK_UCLAW ?? "1000000000000",
    1_000_000_000_000n,
  );
  const autonomousMaxExecutionCostPerTickUclaw = parseNonNegativeBigInt(
    config.autonomousMaxExecutionCostPerTickUclaw ?? process.env.CLAWD_AUTONOMOUS_MAX_EXEC_COST_PER_TICK_UCLAW ?? "1000000000000",
    1_000_000_000_000n,
  );
  const autonomousReputationWeightBps = parsePositiveInt(
    config.autonomousReputationWeightBps ?? Number(process.env.CLAWD_AUTONOMOUS_REPUTATION_WEIGHT_BPS ?? 5000),
    5000,
  );
  const autonomousSkillSuccessWeightBps = parsePositiveInt(
    config.autonomousSkillSuccessWeightBps ?? Number(process.env.CLAWD_AUTONOMOUS_SKILL_SUCCESS_WEIGHT_BPS ?? 3000),
    3000,
  );
  const autonomousSkillRatingWeightBps = parsePositiveInt(
    config.autonomousSkillRatingWeightBps ?? Number(process.env.CLAWD_AUTONOMOUS_SKILL_RATING_WEIGHT_BPS ?? 2000),
    2000,
  );
  const autonomousQualityDataTtlSeconds = parsePositiveInt(
    config.autonomousQualityDataTtlSeconds ?? Number(process.env.CLAWD_AUTONOMOUS_QUALITY_DATA_TTL_SECONDS ?? 60),
    60,
  );
  const autonomousMinQualityScoreBps = parseBps(
    config.autonomousMinQualityScoreBps ?? Number(process.env.CLAWD_AUTONOMOUS_MIN_QUALITY_SCORE_BPS ?? 0),
    0,
  );
  // Autonomous loop configuration for extension-side loop compatibility.
  const extLoopEnabled = process.env.BLOCKCHAIN_AUTONOMOUS_LOOP_ENABLED !== "false" && autonomousEnabled;
  const extAutoAcceptTasks = process.env.BLOCKCHAIN_AUTO_ACCEPT_TASKS !== "false";
  const extMaxConcurrentTasks = parseInt(process.env.BLOCKCHAIN_MAX_CONCURRENT_TASKS || "3", 10);
  if (extLoopEnabled) {
    env.BLOCKCHAIN_AUTONOMOUS_LOOP_ENABLED = "true";
  }
  if (!extAutoAcceptTasks) {
    env.BLOCKCHAIN_AUTO_ACCEPT_TASKS = "false";
  }
  if (extMaxConcurrentTasks !== 3) {
    env.BLOCKCHAIN_MAX_CONCURRENT_TASKS = String(extMaxConcurrentTasks);
  }

  console.log("Starting ClawChain unified runtime...");
  console.log(`  Chain ID:    ${config.chainId}`);
  console.log(`  RPC URL:     ${rpcUrl}`);
  console.log(`  REST URL:    ${restUrl ?? "(derived)"}`);
  console.log(`  Auto-start:  ${!options.noAutoStart && config.nodeAutoStart}`);
  console.log(`  Agent:       ${config.agentAddress ?? "(unknown)"}`);
  console.log(`  Messaging:   port ${messagingPort}`);
  console.log(`  Profile:     ${env.OPENCLAW_PROFILE} (${providerProfile.changed ? "materialized" : "reused"})`);
  console.log(`  Config:      ${providerProfile.path}`);
  if (config.faucetEnabled) {
    console.log(`  Faucet:      port ${config.faucetPort ?? 8888}`);
  }
  if (autonomousEnabled) {
    console.log(`  Auto loop:   enabled (interval=${autonomousIntervalSeconds}s autoComplete=${autonomousAutoComplete})`);
    console.log(
      `  Auto policy: minBudget=${autonomousMinTaskBudgetUclaw.toString()} minProfit=${autonomousMinTaskProfitUclaw.toString()} maxAccept=${autonomousMaxAcceptPerTick} maxPending=${autonomousMaxPendingAcceptedTasks}`,
    );
    if (autonomousAutoComplete) {
      console.log(`  Skill hook:  ${autonomousSkillExecutorCommand ? "configured" : "missing (auto-complete will skip)"}`);
      if (Object.keys(autonomousSkillExecutorMap).length > 0) {
        console.log(`  Skill map:   ${Object.keys(autonomousSkillExecutorMap).length} entries`);
      }
      console.log(
        `  Exec budget: defaultCost=${autonomousDefaultExecutionCostUclaw.toString()} maxPerTask=${autonomousMaxExecutionCostPerTaskUclaw.toString()} maxPerTick=${autonomousMaxExecutionCostPerTickUclaw.toString()}`,
      );
    }
    console.log(
      `  Quality:     repWeight=${autonomousReputationWeightBps} successWeight=${autonomousSkillSuccessWeightBps} ratingWeight=${autonomousSkillRatingWeightBps} ttl=${autonomousQualityDataTtlSeconds}s`,
    );
    console.log(`  QualityGate: minScore=${autonomousMinQualityScoreBps}bps`);
  }
  if (soulStatus.enabled) {
    console.log(`  SOUL.md:     ${soulStatus.detail}`);
  }
  console.log();

  const child = spawn(openclawBin, ["gateway", "run"], {
    stdio: "inherit",
    env,
  });
  let openclawMissing = false;

  // Register error handler IMMEDIATELY — before any await — so ENOENT is caught
  // synchronously on the next tick rather than being thrown as unhandled.
  child.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      openclawMissing = true;
      console.warn(`[clawd] openclaw not found at '${openclawBin}'. Running in agent-only mode.`);
      return;
    }
    console.error(`Failed to start openclaw gateway: ${err.message}`);
    process.exit(1);
  });

  // Track sidecar servers for cleanup
  let faucetServer: FaucetServer | null = null;
  let messageServer: AgentMessageServer | null = null;
  let autonomousLoop: AutonomousLoopHandle | null = null;

  // Start faucet server if enabled
  if (config.faucetEnabled) {
    try {
      const { DirectSecp256k1HdWallet } = await import("@cosmjs/proto-signing");
      const { SigningStargateClient, GasPrice } = await import("@cosmjs/stargate");
      const prefix = config.prefix ?? "claw";
      const gasPrice = config.gasPrice ?? `0.025${config.denom ?? "uclaw"}`;
      const denom = config.denom ?? "uclaw";

      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
      const [account] = await wallet.getAccounts();
      if (account) {
        const signingClient = await SigningStargateClient.connectWithSigner(
          rpcUrl,
          wallet,
          { gasPrice: GasPrice.fromString(gasPrice) },
        );

        faucetServer = new FaucetServer({
          port: config.faucetPort,
          faucetAddress: account.address,
          async sendTokens(recipient, amount, denom) {
            const res = await signingClient.sendTokens(
              account.address, recipient,
              [{ denom, amount }], "auto",
            );
            if (res.code !== 0) throw new Error(`Tx failed: ${res.rawLog}`);
            return res.transactionHash;
          },
          async getBalance() {
            const coin = await signingClient.getBalance(account.address, denom);
            return coin.amount;
          },
        });
        await faucetServer.start();
      }
    } catch (err) {
      console.warn(`Warning: Failed to start faucet server: ${String(err)}`);
    }
  }

  // Start agent messaging server
  try {
    const { Slip10, Slip10Curve, stringToPath, EnglishMnemonic } = await import("@cosmjs/crypto");
    const { Bip39 } = await import("@cosmjs/crypto");
    const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(mnemonic));
    const hdPath = stringToPath("m/44'/118'/0'/0/0");
    const { privkey } = Slip10.derivePath(Slip10Curve.Secp256k1, seed, hdPath);
    const privateKeyHex = Buffer.from(privkey).toString("hex");

    const resolvedRestUrl = restUrl ?? (() => {
      try {
        const url = new URL(rpcUrl);
        return `${url.protocol}//${url.hostname}:1317`;
      } catch {
        return "http://localhost:1317";
      }
    })();

    const messageStore = new MessageStore(CLAWD_HOME);

    messageServer = new AgentMessageServer({
      port: messagingPort,
      privateKeyHex,
      agentAddress: config.agentAddress ?? "",
      restUrl: resolvedRestUrl,
      messageStore,
      async onMessage(msg) {
        console.log(`[MSG] From ${msg.from}: ${msg.body.substring(0, 80)}${msg.body.length > 80 ? "..." : ""}`);
        if (msg.from === (config.agentAddress ?? "")) {
          return;
        }

        const intent = parseChatIntent(msg.body);
        const lowered = msg.body.trim().toLowerCase();
        const looksLikeCommand =
          lowered === "help" ||
          lowered === "/help" ||
          lowered === "contacts" ||
          lowered === "/contacts" ||
          lowered.startsWith("find ") ||
          lowered.startsWith("balance") ||
          lowered.startsWith("/balance") ||
          lowered.startsWith("history") ||
          lowered.startsWith("/history") ||
          lowered.startsWith("wallet ") ||
          lowered.startsWith("send ");
        if (!intent) {
          if (looksLikeCommand) {
            const help = commandHelpText();
            const envelope = commandResultEnvelope({
              requestId: msg.id,
              ok: false,
              error: "Unrecognized command.",
              hint: help,
            });
            appendLocalBridgeReply({
              messageStore,
              from: config.agentAddress ?? "clawd-system",
              to: msg.from,
              body: envelope,
            });
            await trySendBridgeReply({
              from: config.agentAddress ?? "",
              to: msg.from,
              body: envelope,
              senderPrivKeyHex: privateKeyHex,
              restUrl: resolvedRestUrl,
            });
            console.log(`[BRIDGE] Unrecognized command from ${msg.from}. Usage returned.`);
          }
          return;
        }

        try {
          const output = await runCommandIntentWithRecovery(intent);
          const envelope = commandResultEnvelope({
            requestId: msg.id,
            ok: true,
            result: output,
            command: intent.kind,
          });
          appendLocalBridgeReply({
            messageStore,
            from: config.agentAddress ?? "clawd-system",
            to: msg.from,
            body: envelope,
          });
          await trySendBridgeReply({
            from: config.agentAddress ?? "",
            to: msg.from,
            body: envelope,
            senderPrivKeyHex: privateKeyHex,
            restUrl: resolvedRestUrl,
          });
          console.log(`[BRIDGE] Executed '${intent.kind}' for ${msg.from}`);
        } catch (err) {
          const errorText = renderCommandFailure(err);
          const envelope = commandResultEnvelope({
            requestId: msg.id,
            ok: false,
            error: errorText,
          });
          appendLocalBridgeReply({
            messageStore,
            from: config.agentAddress ?? "clawd-system",
            to: msg.from,
            body: envelope,
          });
          await trySendBridgeReply({
            from: config.agentAddress ?? "",
            to: msg.from,
            body: envelope,
            senderPrivKeyHex: privateKeyHex,
            restUrl: resolvedRestUrl,
          });
          console.warn(`[BRIDGE] Command failed for ${msg.from}: ${String(err)}`);
        }
      },
    });
    await messageServer.start();
  } catch (err) {
    console.warn(`Warning: Failed to start messaging server: ${String(err)}`);
  }

  // Run crash recovery: check for orphaned in-progress tasks from a prior run.
  try {
    const recoveryRestUrl = restUrl ?? (() => {
      try {
        const url = new URL(rpcUrl);
        return `${url.protocol}//${url.hostname}:1317`;
      } catch {
        return "http://localhost:1317";
      }
    })();
    const fetcher = createRestTaskFetcher(recoveryRestUrl);
    const recoveryReport = await recoverOrphanedTasks(fetcher);
    if (recoveryReport.orphanedCount > 0) {
      console.log(`[RECOVERY] Found ${recoveryReport.orphanedCount} orphaned task(s) from prior run.`);
      if (recoveryReport.resumedTaskIds.length > 0) {
        console.log(`[RECOVERY] Resumed: ${recoveryReport.resumedTaskIds.join(", ")}`);
      }
      if (recoveryReport.cleanedTaskIds.length > 0) {
        console.log(`[RECOVERY] Cleaned up: ${recoveryReport.cleanedTaskIds.join(", ")}`);
      }
    }
  } catch (err) {
    console.warn(`[RECOVERY] Task recovery check failed (non-fatal): ${String(err)}`);
  }

  if (autonomousEnabled) {
    autonomousLoop = await startAutonomousLoop({
      rpcUrl,
      prefix: config.prefix,
      gasPrice: config.gasPrice,
      intervalSeconds: autonomousIntervalSeconds,
      autoComplete: autonomousAutoComplete,
      skillExecutorCommand: autonomousSkillExecutorCommand,
      skillExecutorMap: autonomousSkillExecutorMap,
      skillExecutorTimeoutSeconds: autonomousSkillExecutorTimeoutSeconds,
      minTaskBudgetUclaw: autonomousMinTaskBudgetUclaw,
      minProfitUclaw: autonomousMinTaskProfitUclaw,
      maxAcceptPerTick: autonomousMaxAcceptPerTick,
      maxPendingAcceptedTasks: autonomousMaxPendingAcceptedTasks,
      allowedSkillIds: autonomousAllowedSkillIds,
      defaultExecutionCostUclaw: autonomousDefaultExecutionCostUclaw,
      maxExecutionCostPerTaskUclaw: autonomousMaxExecutionCostPerTaskUclaw,
      maxExecutionCostPerTickUclaw: autonomousMaxExecutionCostPerTickUclaw,
      reputationWeightBps: autonomousReputationWeightBps,
      skillSuccessWeightBps: autonomousSkillSuccessWeightBps,
      skillRatingWeightBps: autonomousSkillRatingWeightBps,
      qualityDataTtlSeconds: autonomousQualityDataTtlSeconds,
      minQualityScoreBps: autonomousMinQualityScoreBps,
    }).catch((err) => {
      console.warn(`Warning: Failed to start autonomous loop: ${String(err)}`);
      return null;
    });
  }

  // Forward signals to child and clean up servers
  const cleanup = async (signal: NodeJS.Signals) => {
    child.kill(signal);
    await safeStop(faucetServer);
    await safeStop(messageServer);
    await safeStop(autonomousLoop);
  };
  process.on("SIGTERM", () => cleanup("SIGTERM"));
  process.on("SIGINT", () => cleanup("SIGINT"));

  child.on("exit", (code, signal) => {
    // If openclaw was never available, keep running sidecar services
    if (openclawMissing) return;
    // Clean up sidecar servers
    Promise.all([
      safeStop(faucetServer),
      safeStop(messageServer),
      safeStop(autonomousLoop),
    ]).finally(() => {
      if (signal) {
        process.exit(128);
      }
      process.exit(code ?? 0);
    });
  });
}

function parsePositiveInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

async function safeStop(value: unknown): Promise<void> {
  if (!value || typeof value !== "object") {
    return;
  }
  const stop = (value as { stop?: () => Promise<unknown> | unknown }).stop;
  if (typeof stop !== "function") {
    return;
  }
  await Promise.resolve(stop.call(value)).catch(() => {});
}

function parseBps(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.floor(n);
  if (rounded < 0) return 0;
  if (rounded > 10_000) return 10_000;
  return rounded;
}

function parseNonNegativeBigInt(raw: unknown, fallback: bigint): bigint {
  try {
    const text = String(raw ?? "").trim();
    if (!text) return fallback;
    if (!/^\d+$/.test(text)) return fallback;
    return BigInt(text);
  } catch {
    return fallback;
  }
}

function parseAllowedSkillIds(configValue?: number[], envValue?: string): Set<number> | null {
  const out = new Set<number>();
  if (Array.isArray(configValue)) {
    for (const value of configValue) {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 0) out.add(n);
    }
  }
  const env = String(envValue ?? "").trim();
  if (env) {
    if (env.toLowerCase() === "all" || env === "*") {
      return null;
    }
    for (const part of env.split(",")) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n >= 0) out.add(n);
    }
  }
  return out.size > 0 ? out : null;
}

function appendLocalBridgeReply(options: {
  messageStore: MessageStore;
  from: string;
  to: string;
  body: string;
}): void {
  options.messageStore.append({
    from: options.from,
    to: options.to,
    body: options.body,
    timestamp: Date.now(),
    signature: "",
  });
}

async function trySendBridgeReply(options: {
  from: string;
  to: string;
  body: string;
  senderPrivKeyHex: string;
  restUrl: string;
}): Promise<void> {
  if (!options.from) return;
  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const routing = await lookupAgentMessaging(options.restUrl, options.to);
      if (!routing) return;
      await sendAgentMessage({
        to: options.to,
        body: options.body,
        senderPrivKey: options.senderPrivKeyHex,
        senderAddress: options.from,
        recipientPubkey: routing.pubkey,
        recipientEndpoint: routing.endpoint,
      });
      return;
    } catch (err) {
      lastErr = err;
      const text = String(err).toLowerCase();
      if (!isRetryableBridgeErrorText(text) || attempt === maxAttempts) {
        break;
      }
      await sleep(600 * attempt);
    }
  }
  console.warn(`[BRIDGE] Failed to send command reply to ${options.to}: ${String(lastErr)}`);
}

async function lookupAgentMessaging(
  restUrl: string,
  address: string,
): Promise<{ pubkey: string; endpoint: string } | null> {
  const url = `${restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(address)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    pubkey?: string;
    endpoint?: string;
    registered?: boolean;
  };
  if (!data.registered || !data.pubkey || !data.endpoint) return null;
  return { pubkey: data.pubkey, endpoint: data.endpoint };
}

function commandResultEnvelope(options: {
  requestId: string;
  ok: boolean;
  result?: string;
  error?: string;
  command?: string;
  hint?: string;
}): string {
  return JSON.stringify({
    type: "command_result",
    request_id: options.requestId,
    ok: options.ok,
    command: options.command,
    result: options.result,
    error: options.error,
    hint: options.hint,
    ts: Date.now(),
  });
}

async function runCommandIntentWithRecovery(
  intent: Parameters<typeof executeChatIntent>[0],
): Promise<string> {
  const maxAttempts = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await executeChatIntent(intent);
    } catch (err) {
      lastErr = err;
      const text = String(err).toLowerCase();
      if (!isRetryableBridgeErrorText(text) || attempt === maxAttempts) {
        break;
      }
      await sleep(800 * attempt);
    }
  }
  throw lastErr ?? new Error("command execution failed");
}

function isRetryableBridgeErrorText(text: string): boolean {
  return (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("connection reset") ||
    text.includes("connection refused") ||
    text.includes("unavailable") ||
    text.includes("i/o timeout") ||
    text.includes("eof") ||
    text.includes("too frequently") ||
    text.includes("must wait")
  );
}

function renderCommandFailure(err: unknown): string {
  const raw = String(err);
  const lower = raw.toLowerCase();
  if (lower.includes("invalid amount")) {
    return "Command failed: invalid amount. Use up to 6 decimals, e.g. `send 1.25 CLAW to <address>`.";
  }
  if (lower.includes("wallet address found")) {
    return 'Command failed: wallet is not initialized. Run "clawd init" first.';
  }
  if (lower.includes("history backend unavailable")) {
    return "Command failed: history backend unavailable right now. Try again shortly.";
  }
  if (lower.includes("insufficient funds")) {
    return "Command failed: insufficient funds for transfer + gas.";
  }
  return `Command failed: ${raw}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureSoulBootstrapFile(): { enabled: boolean; detail: string } {
  const cwd = process.cwd();
  const sourcePreferred = join(cwd, "SOUL.md");
  const sourceExample = join(cwd, "docs", "SOUL.md.example");
  const source = existsSync(sourcePreferred)
    ? sourcePreferred
    : (existsSync(sourceExample) ? sourceExample : "");
  if (!source) {
    return { enabled: false, detail: "not found in project workspace" };
  }

  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || CLAWD_OPENCLAW_STATE_DIR;
  const workspaceDir = join(stateDir, "workspace");
  const target = join(workspaceDir, "SOUL.md");
  try {
    mkdirSync(workspaceDir, { recursive: true });
    if (!existsSync(target)) {
      copyFileSync(source, target);
      return { enabled: true, detail: `installed at ${target}` };
    }

    // Refresh target if source changed.
    const srcMtime = statSync(source).mtimeMs;
    const dstMtime = statSync(target).mtimeMs;
    if (srcMtime > dstMtime) {
      copyFileSync(source, target);
      return { enabled: true, detail: `updated at ${target}` };
    }
    return { enabled: true, detail: `active at ${target}` };
  } catch {
    return { enabled: false, detail: "failed to provision workspace SOUL.md" };
  }
}

function parseExecutorMap(
  fromConfig: Record<string, string> | undefined,
  fromEnvRaw: string | undefined,
): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [k, v] of Object.entries(fromConfig ?? {})) {
    const key = String(k).trim();
    const val = String(v).trim();
    if (!key || !val) continue;
    base[key] = val;
  }

  const envText = String(fromEnvRaw ?? "").trim();
  if (!envText) return base;
  try {
    const parsed = JSON.parse(envText) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const key = String(k).trim();
      const val = String(v).trim();
      if (!key || !val) continue;
      base[key] = val;
    }
  } catch {
    console.warn("Warning: invalid CLAWD_AUTONOMOUS_SKILL_EXECUTOR_MAP_JSON (must be JSON object).");
  }
  return base;
}
