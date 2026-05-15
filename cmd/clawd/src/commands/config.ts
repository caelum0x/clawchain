/**
 * `clawd config` subcommands — show, set, get, reset, validate, export, path.
 *
 * Manage the clawd configuration file (~/.clawd/clawd.json).
 */

import { loadClawdConfig, writeClawdConfig, type ClawdConfig } from "../lib/config.js";
import { CLAWD_CONFIG_PATH } from "../lib/paths.js";

/** Keys that are safe to set via `clawd config set`. */
const SETTABLE_KEYS: ReadonlySet<string> = new Set([
  "moniker",
  "chainId",
  "rpcUrl",
  "restUrl",
  "nodeAutoStart",
  "nodeBinaryPath",
  "nodeHome",
  "agentAddress",
  "seeds",
  "persistentPeers",
  "faucetUrl",
  "faucetEnabled",
  "faucetPort",
  "messagingPort",
  "publicHost",
  "messagingEndpoint",
  "denom",
  "prefix",
  "gasPrice",
]);

/** Keys that contain sensitive values and should be redacted in show/export. */
const REDACTED_KEYS: ReadonlySet<string> = new Set([
  "mnemonic",
]);

/**
 * Coerce a string value into the correct type for a given config key.
 */
function coerceValue(key: string, value: string): unknown {
  if (key === "nodeAutoStart" || key === "faucetEnabled") {
    return value === "true" || value === "1";
  }
  if (key === "faucetPort" || key === "messagingPort") {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`${key} must be a positive integer.`);
    }
    return n;
  }
  return value;
}

// ---------------------------------------------------------------------------
// clawd config show
// ---------------------------------------------------------------------------

export type ConfigShowOptions = {
  json?: boolean;
};

export async function runConfigShow(opts: ConfigShowOptions): Promise<void> {
  const cfg = loadClawdConfig();

  // Redact sensitive fields
  const display: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (REDACTED_KEYS.has(key) && value) {
      display[key] = "***REDACTED***";
    } else {
      display[key] = value;
    }
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(display, null, 2) + "\n");
    return;
  }

  console.log("Current Configuration\n");
  const entries = Object.entries(display);
  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));
  for (const [key, value] of entries) {
    const v = value === undefined || value === null || value === ""
      ? "(not set)"
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
    console.log(`  ${key.padEnd(maxKeyLen)}  ${v}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// clawd config set
// ---------------------------------------------------------------------------

export type ConfigSetOptions = {
  key: string;
  value: string;
  json?: boolean;
};

export async function runConfigSet(opts: ConfigSetOptions): Promise<void> {
  const { key, value } = opts;

  if (!SETTABLE_KEYS.has(key)) {
    console.error(`Unknown or non-settable config key: ${key}`);
    console.error(`Settable keys: ${Array.from(SETTABLE_KEYS).sort().join(", ")}`);
    process.exit(1);
  }

  let coerced: unknown;
  try {
    coerced = coerceValue(key, value);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  const cfg = loadClawdConfig();
  const updated = { ...cfg, [key]: coerced } as ClawdConfig;
  writeClawdConfig(updated);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ key, value: coerced }, null, 2) + "\n");
    return;
  }

  console.log(`Config updated: ${key} = ${String(coerced)}`);
}

// ---------------------------------------------------------------------------
// clawd config get
// ---------------------------------------------------------------------------

export type ConfigGetOptions = {
  key: string;
  json?: boolean;
};

export async function runConfigGet(opts: ConfigGetOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const record = cfg as Record<string, unknown>;

  if (!(opts.key in record)) {
    console.error(`Unknown config key: ${opts.key}`);
    process.exit(1);
  }

  const value = record[opts.key];

  if (REDACTED_KEYS.has(opts.key) && value) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ key: opts.key, value: "***REDACTED***" }, null, 2) + "\n");
    } else {
      console.log("***REDACTED***");
    }
    return;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ key: opts.key, value }, null, 2) + "\n");
    return;
  }

  if (value === undefined || value === null || value === "") {
    console.log("(not set)");
  } else if (typeof value === "object") {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

// ---------------------------------------------------------------------------
// clawd config reset
// ---------------------------------------------------------------------------

export type ConfigResetOptions = {
  confirm?: boolean;
  json?: boolean;
};

export async function runConfigReset(opts: ConfigResetOptions): Promise<void> {
  if (!opts.confirm) {
    console.error("This will reset all configuration to defaults.");
    console.error("Run with --confirm to proceed.");
    process.exit(1);
  }

  const defaultConfig: ClawdConfig = {
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  };

  writeClawdConfig(defaultConfig);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ reset: true, config: defaultConfig }, null, 2) + "\n");
    return;
  }

  console.log("Configuration reset to defaults.");
}

// ---------------------------------------------------------------------------
// clawd config validate
// ---------------------------------------------------------------------------

export type ConfigValidateOptions = {
  json?: boolean;
};

type ValidationResult = {
  valid: boolean;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
};

export async function runConfigValidate(opts: ConfigValidateOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const checks: ValidationResult["checks"] = [];

  // Check chain ID
  checks.push({
    name: "chainId",
    ok: Boolean(cfg.chainId && cfg.chainId.length > 0),
    detail: cfg.chainId ? `chainId = ${cfg.chainId}` : "chainId is not set",
  });

  // Check denom
  checks.push({
    name: "denom",
    ok: Boolean(cfg.denom && cfg.denom.length > 0),
    detail: cfg.denom ? `denom = ${cfg.denom}` : "denom is not set",
  });

  // Check prefix
  checks.push({
    name: "prefix",
    ok: Boolean(cfg.prefix && cfg.prefix.length > 0),
    detail: cfg.prefix ? `prefix = ${cfg.prefix}` : "prefix is not set",
  });

  // Check RPC URL format
  let rpcUrlOk = false;
  try {
    if (cfg.rpcUrl) {
      new URL(cfg.rpcUrl);
      rpcUrlOk = true;
    }
  } catch {
    // invalid URL
  }
  checks.push({
    name: "rpcUrl",
    ok: rpcUrlOk,
    detail: rpcUrlOk ? `rpcUrl = ${cfg.rpcUrl}` : `rpcUrl is invalid or not set: ${cfg.rpcUrl ?? "(empty)"}`,
  });

  // Check REST URL format
  let restUrlOk = false;
  try {
    if (cfg.restUrl) {
      new URL(cfg.restUrl);
      restUrlOk = true;
    }
  } catch {
    // invalid URL
  }
  checks.push({
    name: "restUrl",
    ok: restUrlOk,
    detail: restUrlOk ? `restUrl = ${cfg.restUrl}` : `restUrl is invalid or not set: ${cfg.restUrl ?? "(empty)"}`,
  });

  // Check RPC connectivity
  let rpcReachable = false;
  if (rpcUrlOk) {
    try {
      const rpcUrl = cfg.rpcUrl.replace(/\/+$/, "");
      const res = await fetch(`${rpcUrl}/status`, { signal: AbortSignal.timeout(5_000) });
      rpcReachable = res.ok;
    } catch {
      // not reachable
    }
  }
  checks.push({
    name: "rpcConnectivity",
    ok: rpcReachable,
    detail: rpcReachable ? "RPC endpoint is reachable" : "RPC endpoint is not reachable",
  });

  const valid = checks.every((c) => c.ok);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ valid, checks }, null, 2) + "\n");
    return;
  }

  console.log("Configuration Validation\n");
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`  [${status}] ${check.name}: ${check.detail}`);
  }
  console.log(`\n  Overall: ${valid ? "VALID" : "INVALID"}`);
  console.log();
}

// ---------------------------------------------------------------------------
// clawd config export
// ---------------------------------------------------------------------------

export type ConfigExportOptions = {
  json?: boolean;
};

export async function runConfigExport(opts: ConfigExportOptions): Promise<void> {
  const cfg = loadClawdConfig();

  const envVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (REDACTED_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;

    // Convert camelCase to UPPER_SNAKE_CASE with CLAWD_ prefix
    const envKey = "CLAWD_" + key.replace(/([A-Z])/g, "_$1").toUpperCase();
    envVars[envKey] = typeof value === "object" ? JSON.stringify(value) : String(value);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(envVars, null, 2) + "\n");
    return;
  }

  for (const [key, value] of Object.entries(envVars)) {
    // Shell-safe quoting
    const escaped = value.replace(/'/g, "'\\''");
    console.log(`${key}='${escaped}'`);
  }
}

// ---------------------------------------------------------------------------
// clawd config path
// ---------------------------------------------------------------------------

export type ConfigPathOptions = {
  json?: boolean;
};

export async function runConfigPath(opts: ConfigPathOptions): Promise<void> {
  if (opts.json) {
    process.stdout.write(JSON.stringify({ path: CLAWD_CONFIG_PATH }, null, 2) + "\n");
    return;
  }

  console.log(CLAWD_CONFIG_PATH);
}
