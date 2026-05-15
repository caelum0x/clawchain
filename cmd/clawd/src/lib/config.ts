/**
 * Load and write the clawd config file (~/.clawd/clawd.json).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { CLAWD_CONFIG_PATH } from "./paths.js";

export type ClawdConfig = {
  /** Moniker for the chain node. */
  moniker?: string;
  /** Chain ID. */
  chainId: string;
  /** RPC URL for the chain node. */
  rpcUrl: string;
  /** REST/LCD URL for the chain node. */
  restUrl?: string;
  /** Whether to auto-start the chain node. */
  nodeAutoStart: boolean;
  /** Path to clawchaind binary. */
  nodeBinaryPath?: string;
  /** --home for clawchaind. */
  nodeHome: string;
  /** The agent's bech32 address. */
  agentAddress?: string;

  // -- Peer discovery (Step 1) --
  /** Comma-separated seed node addresses (nodeID@host:port). */
  seeds?: string;
  /** Comma-separated persistent peer addresses (nodeID@host:port). */
  persistentPeers?: string;

  // -- Faucet (Step 2) --
  /** URL of a remote faucet to request tokens from. */
  faucetUrl?: string;
  /** Whether to run the built-in faucet server. */
  faucetEnabled?: boolean;
  /** Port for the faucet server. */
  faucetPort?: number;

  // -- Messaging (Step 3) --
  /** Port for the agent messaging server (default: 7777). */
  messagingPort?: number;
  /** Public host/DNS used for shareable nodecard + endpoint derivation. */
  publicHost?: string;
  /** Public endpoint for this agent's messaging server. */
  messagingEndpoint?: string;
  /** Chain token denom (default: uclaw). */
  denom?: string;
  /** Bech32 address prefix (default: claw). */
  prefix?: string;
  /** Gas price string (default: 0.025uclaw). */
  gasPrice?: string;
  /** Last manifest URL/path used for join/bootstrap. */
  networkManifest?: string;
  /** Whether signed-manifest verification was required for latest join/bootstrap. */
  manifestSignatureRequired?: boolean;
  /** Whether manifest signature verification passed for latest join/bootstrap. */
  manifestSignatureVerified?: boolean;
  /** Trusted signer pubkey that verified the latest manifest (if any). */
  manifestSignatureSignerPubkey?: string;
  /** ISO timestamp for latest manifest signature verification. */
  manifestSignatureVerifiedAt?: string;
  /** Status detail for latest manifest verification attempt. */
  manifestSignatureDetail?: string;
  /** Expected genesis SHA256 from manifest (if known). */
  genesisSha256?: string;
  /** Last runtime bootstrap execution summary from `clawd up`. */
  lastUp?: ClawdUpSnapshot;
  /** Incident-mode state for degraded operations/recovery. */
  incidentMode?: IncidentModeState;
  /** Address aliases for wallet/chat sends (e.g. "alice" -> "claw1..."). */
  recipientAliases?: Record<string, string>;
  /** Enable autonomous task loop during `clawd start`. */
  autonomousLoopEnabled?: boolean;
  /** Loop poll interval in seconds. */
  autonomousLoopIntervalSeconds?: number;
  /** Auto-complete accepted tasks with synthetic result. */
  autonomousLoopAutoComplete?: boolean;
  /** Shell command used to execute a task's skill and return result JSON/text on stdout. */
  autonomousSkillExecutorCommand?: string;
  /** Optional per-skill-id executor command map. */
  autonomousSkillExecutorMap?: Record<string, string>;
  /** Timeout for skill executor command in seconds. */
  autonomousSkillExecutorTimeoutSeconds?: number;
  /** Minimum task budget (uclaw) required before auto-accepting. */
  autonomousMinTaskBudgetUclaw?: string;
  /** Minimum expected profit (budget - execution_cost, uclaw) required before auto-accepting. */
  autonomousMinTaskProfitUclaw?: string;
  /** Max number of pending tasks to auto-accept in one loop tick. */
  autonomousMaxAcceptPerTick?: number;
  /** Max concurrently accepted (not completed) tasks this node should hold. */
  autonomousMaxPendingAcceptedTasks?: number;
  /** Optional allowlist of skill IDs to auto-accept (empty/undefined means all). */
  autonomousAllowedSkillIds?: number[];
  /** Default execution cost estimate (uclaw) when requirements don't specify one. */
  autonomousDefaultExecutionCostUclaw?: string;
  /** Hard execution-cost cap per task completion attempt (uclaw). */
  autonomousMaxExecutionCostPerTaskUclaw?: string;
  /** Hard execution-cost cap per tick across all completions (uclaw). */
  autonomousMaxExecutionCostPerTickUclaw?: string;
  /** Weight of reputation signal in quality score (bps weight, relative). */
  autonomousReputationWeightBps?: number;
  /** Weight of skill success-rate signal in quality score (bps weight, relative). */
  autonomousSkillSuccessWeightBps?: number;
  /** Weight of skill rating signal in quality score (bps weight, relative). */
  autonomousSkillRatingWeightBps?: number;
  /** TTL for cached quality data pulls (seconds). */
  autonomousQualityDataTtlSeconds?: number;
  /** Minimum composite quality score (bps) required for auto-accept. */
  autonomousMinQualityScoreBps?: number;
};

export type IncidentModeState = {
  active: boolean;
  enteredAt?: string;
  recoveredAt?: string;
  reason?: string;
  isolation?: {
    peersIsolated: boolean;
    previousSeeds?: string;
    previousPersistentPeers?: string;
  };
};

export type ClawdUpSnapshot = {
  /** ISO timestamp of the most recent `clawd up` attempt. */
  lastUpAt: string;
  /** Whether the most recent `clawd up` run succeeded. */
  ok?: boolean;
  /** How `clawd up` delegated runtime startup. */
  delegateMode: "default-openclaw" | "explicit-openclaw-bin";
  /** Source of bootstrap network input for this run. */
  bootstrapSource: "none" | "manifest" | "nodecard" | "manual";
  /** High-level execution steps for the latest run. */
  steps?: {
    initRan: boolean;
    joinRan: boolean;
    startRan: boolean;
    readinessEnforced: boolean;
    startupLifecyclePassed?: boolean;
    integratedReadinessPassed?: boolean;
  };
  /** Agent lifecycle auto-bootstrap telemetry for latest run. */
  autoBootstrap?: {
    attempted: boolean;
    triggerStage?: "register" | "heartbeat";
    ok?: boolean;
    reason?: string;
    stage?: string;
    error?: string;
    registerTxHash?: string;
    heartbeatTxHash?: string;
  };
  /** Error messages collected during the latest run (empty on success). */
  errors: string[];
};

const DEFAULT_CONFIG: ClawdConfig = {
  chainId: "clawchain-1",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: true,
  nodeHome: "",
  denom: "uclaw",
  prefix: "claw",
  gasPrice: "0.025uclaw",
};

/**
 * Load clawd config from disk. Returns defaults if the file doesn't exist.
 */
export function loadClawdConfig(): ClawdConfig {
  try {
    const raw = readFileSync(CLAWD_CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write clawd config to disk, creating the directory if needed.
 */
export function writeClawdConfig(config: ClawdConfig): void {
  mkdirSync(dirname(CLAWD_CONFIG_PATH), { recursive: true });
  writeFileSync(CLAWD_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}
