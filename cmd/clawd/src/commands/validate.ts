/**
 * `clawd validate` subcommands -- local installation and configuration validation.
 *
 * Validates config, binaries, chain data directory, and genesis file:
 *   validate config    -- check clawd configuration file
 *   validate binaries  -- check required binaries are installed
 *   validate chain     -- validate chain data directory
 *   validate genesis   -- deep validate genesis file
 *   validate all       -- run all validations
 */

import { loadClawdConfig } from "../lib/config.js";
import { table } from "../lib/format.js";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidationCheck = {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveHome(dir: string): string {
  if (dir.startsWith("~")) {
    return path.join(process.env.HOME ?? "/root", dir.slice(1));
  }
  return dir;
}

function whichBinary(name: string): string | null {
  try {
    const result = execSync(`which ${name} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 5_000,
    }).trim();
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

function getBinaryVersion(name: string): string | null {
  const versionFlags = ["--version", "version", "-v"];
  for (const flag of versionFlags) {
    try {
      const result = execSync(`${name} ${flag} 2>&1`, {
        encoding: "utf-8",
        timeout: 10_000,
      }).trim();
      // Take first non-empty line
      const firstLine = result.split("\n").find((l) => l.trim().length > 0);
      if (firstLine && firstLine.length > 0) {
        return firstLine.length > 120 ? firstLine.slice(0, 117) + "..." : firstLine;
      }
    } catch {
      // try next flag
    }
  }
  return null;
}

function printChecks(checks: ValidationCheck[]): void {
  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  const headers = ["Check", "Status", "Detail"];
  const rows = checks.map((c) => [
    c.name,
    c.status.toUpperCase(),
    c.detail,
  ]);
  console.log(table(headers, rows));
  console.log("");
  console.log(
    `  ${passCount} passed, ${failCount} failed, ${warnCount} warnings`,
  );
  console.log("");

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

function printJson(section: string, checks: ValidationCheck[]): void {
  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  process.stdout.write(
    JSON.stringify(
      {
        section,
        ok: failCount === 0,
        passed: passCount,
        failed: failCount,
        warnings: warnCount,
        checks,
      },
      null,
      2,
    ) + "\n",
  );

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// clawd validate config
// ---------------------------------------------------------------------------

export type ValidateConfigOptions = {
  json?: boolean;
};

export function runValidateConfig(opts: ValidateConfigOptions): void {
  const checks: ValidationCheck[] = [];
  const cfg = loadClawdConfig();

  // Check config file exists (loadClawdConfig returns defaults if missing)
  const configPath = path.join(
    process.env.CLAWD_HOME ?? path.join(process.env.HOME ?? "/root", ".clawd"),
    "clawd.json",
  );
  if (fs.existsSync(configPath)) {
    checks.push({
      name: "Config file exists",
      status: "pass",
      detail: configPath,
    });
  } else {
    checks.push({
      name: "Config file exists",
      status: "fail",
      detail: `not found at ${configPath} (using defaults)`,
    });
  }

  // chainId
  if (cfg.chainId && cfg.chainId.trim().length > 0) {
    checks.push({
      name: "chainId",
      status: "pass",
      detail: cfg.chainId,
    });
  } else {
    checks.push({
      name: "chainId",
      status: "fail",
      detail: "missing or empty",
    });
  }

  // rpcUrl
  if (cfg.rpcUrl && isValidUrl(cfg.rpcUrl)) {
    checks.push({
      name: "rpc URL format",
      status: "pass",
      detail: cfg.rpcUrl,
    });
  } else {
    checks.push({
      name: "rpc URL format",
      status: "fail",
      detail: cfg.rpcUrl ? `invalid URL: ${cfg.rpcUrl}` : "missing",
    });
  }

  // restUrl
  if (cfg.restUrl && isValidUrl(cfg.restUrl)) {
    checks.push({
      name: "rest URL format",
      status: "pass",
      detail: cfg.restUrl,
    });
  } else if (cfg.restUrl) {
    checks.push({
      name: "rest URL format",
      status: "fail",
      detail: `invalid URL: ${cfg.restUrl}`,
    });
  } else {
    checks.push({
      name: "rest URL format",
      status: "warn",
      detail: "not set (will be derived from rpcUrl)",
    });
  }

  // denom
  if (cfg.denom && cfg.denom.trim().length > 0) {
    checks.push({
      name: "denom",
      status: "pass",
      detail: cfg.denom,
    });
  } else {
    checks.push({
      name: "denom",
      status: "fail",
      detail: "missing or empty",
    });
  }

  // mnemonic file
  const mnemonicPath = path.join(
    process.env.CLAWD_HOME ?? path.join(process.env.HOME ?? "/root", ".clawd"),
    "mnemonic.enc",
  );
  if (fs.existsSync(mnemonicPath)) {
    checks.push({
      name: "Mnemonic file",
      status: "pass",
      detail: mnemonicPath,
    });
  } else {
    checks.push({
      name: "Mnemonic file",
      status: "warn",
      detail: `not found at ${mnemonicPath} (wallet features unavailable)`,
    });
  }

  if (opts.json) {
    printJson("config", checks);
    return;
  }

  console.log("clawd validate config\n");
  printChecks(checks);
}

// ---------------------------------------------------------------------------
// clawd validate binaries
// ---------------------------------------------------------------------------

export type ValidateBinariesOptions = {
  json?: boolean;
};

const REQUIRED_BINARIES = [
  "clawchaind",
  "clawproof",
  "node",
  "npm",
  "go",
  "docker",
  "docker-compose",
];

export function runValidateBinaries(opts: ValidateBinariesOptions): void {
  const checks: ValidationCheck[] = [];

  for (const bin of REQUIRED_BINARIES) {
    const binPath = whichBinary(bin);
    if (binPath) {
      const version = getBinaryVersion(bin);
      checks.push({
        name: bin,
        status: "pass",
        detail: version ? `${binPath} (${version})` : binPath,
      });
    } else {
      checks.push({
        name: bin,
        status: "fail",
        detail: "not found in PATH",
      });
    }
  }

  if (opts.json) {
    printJson("binaries", checks);
    return;
  }

  console.log("clawd validate binaries\n");
  printChecks(checks);
}

// ---------------------------------------------------------------------------
// clawd validate chain
// ---------------------------------------------------------------------------

export type ValidateChainOptions = {
  home?: string;
  json?: boolean;
};

export function runValidateChain(opts: ValidateChainOptions): void {
  const checks: ValidationCheck[] = [];
  const home = resolveHome(opts.home ?? "~/.clawchain");

  // config/config.toml
  const configToml = path.join(home, "config", "config.toml");
  if (fs.existsSync(configToml)) {
    checks.push({
      name: "config/config.toml",
      status: "pass",
      detail: configToml,
    });
  } else {
    checks.push({
      name: "config/config.toml",
      status: "fail",
      detail: `not found at ${configToml}`,
    });
  }

  // config/app.toml
  const appToml = path.join(home, "config", "app.toml");
  if (fs.existsSync(appToml)) {
    checks.push({
      name: "config/app.toml",
      status: "pass",
      detail: appToml,
    });
  } else {
    checks.push({
      name: "config/app.toml",
      status: "fail",
      detail: `not found at ${appToml}`,
    });
  }

  // config/genesis.json — exists and is valid JSON
  const genesisJson = path.join(home, "config", "genesis.json");
  if (fs.existsSync(genesisJson)) {
    try {
      const raw = fs.readFileSync(genesisJson, "utf-8");
      JSON.parse(raw);
      checks.push({
        name: "config/genesis.json",
        status: "pass",
        detail: `valid JSON (${(Buffer.byteLength(raw) / 1024).toFixed(1)} KB)`,
      });
    } catch (err) {
      checks.push({
        name: "config/genesis.json",
        status: "fail",
        detail: `invalid JSON: ${String(err)}`,
      });
    }
  } else {
    checks.push({
      name: "config/genesis.json",
      status: "fail",
      detail: `not found at ${genesisJson}`,
    });
  }

  // data/ directory
  const dataDir = path.join(home, "data");
  if (fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory()) {
    checks.push({
      name: "data/ directory",
      status: "pass",
      detail: dataDir,
    });
  } else {
    checks.push({
      name: "data/ directory",
      status: "fail",
      detail: `not found at ${dataDir}`,
    });
  }

  // priv_validator_key.json
  const privValKey = path.join(home, "config", "priv_validator_key.json");
  if (fs.existsSync(privValKey)) {
    checks.push({
      name: "priv_validator_key.json",
      status: "pass",
      detail: privValKey,
    });
  } else {
    checks.push({
      name: "priv_validator_key.json",
      status: "warn",
      detail: `not found at ${privValKey} (non-validator node or key not yet generated)`,
    });
  }

  if (opts.json) {
    printJson("chain", checks);
    return;
  }

  console.log(`clawd validate chain (home: ${home})\n`);
  printChecks(checks);
}

// ---------------------------------------------------------------------------
// clawd validate genesis
// ---------------------------------------------------------------------------

export type ValidateGenesisOptions = {
  file?: string;
  json?: boolean;
};

const REQUIRED_MODULES = [
  "bank",
  "staking",
  "auth",
  "agent",
  "privacy",
  "marketplace",
];

export function runValidateGenesis(opts: ValidateGenesisOptions): void {
  const checks: ValidationCheck[] = [];
  const defaultHome = resolveHome("~/.clawchain");
  const genesisPath = opts.file ?? path.join(defaultHome, "config", "genesis.json");

  // Load genesis file
  let genesis: Record<string, unknown>;
  try {
    const raw = fs.readFileSync(genesisPath, "utf-8");
    genesis = JSON.parse(raw) as Record<string, unknown>;
    checks.push({
      name: "Genesis file readable",
      status: "pass",
      detail: genesisPath,
    });
  } catch (err) {
    checks.push({
      name: "Genesis file readable",
      status: "fail",
      detail: `cannot read or parse: ${String(err)}`,
    });

    if (opts.json) {
      printJson("genesis", checks);
    } else {
      console.log("clawd validate genesis\n");
      printChecks(checks);
    }
    return;
  }

  // chain_id
  const chainId = genesis.chain_id as string | undefined;
  if (chainId && typeof chainId === "string" && chainId.trim().length > 0) {
    checks.push({
      name: "chain_id",
      status: "pass",
      detail: chainId,
    });
  } else {
    checks.push({
      name: "chain_id",
      status: "fail",
      detail: "missing or empty",
    });
  }

  // genesis_time
  const genesisTime = genesis.genesis_time as string | undefined;
  if (genesisTime && typeof genesisTime === "string") {
    const parsed = new Date(genesisTime);
    if (!Number.isNaN(parsed.getTime())) {
      checks.push({
        name: "genesis_time",
        status: "pass",
        detail: genesisTime,
      });
    } else {
      checks.push({
        name: "genesis_time",
        status: "fail",
        detail: `invalid date: ${genesisTime}`,
      });
    }
  } else {
    checks.push({
      name: "genesis_time",
      status: "fail",
      detail: "missing",
    });
  }

  // app_state with required modules
  const appState = genesis.app_state as Record<string, unknown> | undefined;
  if (appState && typeof appState === "object") {
    for (const mod of REQUIRED_MODULES) {
      if (mod in appState) {
        checks.push({
          name: `app_state.${mod}`,
          status: "pass",
          detail: "present",
        });
      } else {
        checks.push({
          name: `app_state.${mod}`,
          status: "fail",
          detail: "missing from app_state",
        });
      }
    }
  } else {
    checks.push({
      name: "app_state",
      status: "fail",
      detail: "missing or not an object",
    });
  }

  // Initial balances sum > 0
  let balanceSum = 0n;
  try {
    const bankState = appState?.bank as Record<string, unknown> | undefined;
    const balances = (bankState?.balances ?? bankState?.supply) as
      | Array<{ coins?: Array<{ amount?: string }>; amount?: string }>
      | undefined;
    if (Array.isArray(balances)) {
      for (const entry of balances) {
        if (Array.isArray(entry.coins)) {
          for (const coin of entry.coins) {
            if (coin.amount) {
              balanceSum += BigInt(coin.amount);
            }
          }
        } else if (entry.amount) {
          balanceSum += BigInt(entry.amount);
        }
      }
    }
  } catch {
    // Ignore parse errors — we'll report the sum as 0
  }

  if (balanceSum > 0n) {
    checks.push({
      name: "Initial balances",
      status: "pass",
      detail: `total supply sum > 0 (${balanceSum.toString()} smallest units)`,
    });
  } else {
    checks.push({
      name: "Initial balances",
      status: "warn",
      detail: "balance sum is 0 or could not be determined",
    });
  }

  // Gentx count
  let gentxCount = 0;
  try {
    const genutil = appState?.genutil as Record<string, unknown> | undefined;
    const genTxs = genutil?.gen_txs as unknown[] | undefined;
    if (Array.isArray(genTxs)) {
      gentxCount = genTxs.length;
    }
  } catch {
    // Ignore
  }

  if (gentxCount > 0) {
    checks.push({
      name: "Gentx entries",
      status: "pass",
      detail: `${gentxCount} gentx(s) found`,
    });
  } else {
    checks.push({
      name: "Gentx entries",
      status: "warn",
      detail: "no gentx entries found (expected for non-validator genesis or single-node setup)",
    });
  }

  if (opts.json) {
    printJson("genesis", checks);
    return;
  }

  console.log(`clawd validate genesis (${genesisPath})\n`);
  printChecks(checks);
}

// ---------------------------------------------------------------------------
// clawd validate all
// ---------------------------------------------------------------------------

export type ValidateAllOptions = {
  json?: boolean;
};

export function runValidateAll(opts: ValidateAllOptions): void {
  const allChecks: ValidationCheck[] = [];

  // --- Config checks ---
  const configChecks = collectConfigChecks();
  allChecks.push(...configChecks);

  // --- Binary checks ---
  const binaryChecks = collectBinaryChecks();
  allChecks.push(...binaryChecks);

  // --- Chain checks ---
  const chainChecks = collectChainChecks("~/.clawchain");
  allChecks.push(...chainChecks);

  const passCount = allChecks.filter((c) => c.status === "pass").length;
  const failCount = allChecks.filter((c) => c.status === "fail").length;
  const warnCount = allChecks.filter((c) => c.status === "warn").length;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          section: "all",
          ok: failCount === 0,
          passed: passCount,
          failed: failCount,
          warnings: warnCount,
          checks: allChecks,
        },
        null,
        2,
      ) + "\n",
    );
    if (failCount > 0) {
      process.exitCode = 1;
    }
    return;
  }

  console.log("clawd validate all\n");

  console.log("--- Configuration ---");
  const configHeaders = ["Check", "Status", "Detail"];
  const configRows = configChecks.map((c) => [c.name, c.status.toUpperCase(), c.detail]);
  console.log(table(configHeaders, configRows));
  console.log("");

  console.log("--- Binaries ---");
  const binHeaders = ["Check", "Status", "Detail"];
  const binRows = binaryChecks.map((c) => [c.name, c.status.toUpperCase(), c.detail]);
  console.log(table(binHeaders, binRows));
  console.log("");

  console.log("--- Chain Data ---");
  const chainHeaders = ["Check", "Status", "Detail"];
  const chainRows = chainChecks.map((c) => [c.name, c.status.toUpperCase(), c.detail]);
  console.log(table(chainHeaders, chainRows));
  console.log("");

  console.log(
    `Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`,
  );
  console.log("");

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Internal collectors (shared by individual + all commands)
// ---------------------------------------------------------------------------

function collectConfigChecks(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const cfg = loadClawdConfig();

  const configPath = path.join(
    process.env.CLAWD_HOME ?? path.join(process.env.HOME ?? "/root", ".clawd"),
    "clawd.json",
  );
  if (fs.existsSync(configPath)) {
    checks.push({ name: "Config file exists", status: "pass", detail: configPath });
  } else {
    checks.push({ name: "Config file exists", status: "fail", detail: `not found at ${configPath} (using defaults)` });
  }

  if (cfg.chainId && cfg.chainId.trim().length > 0) {
    checks.push({ name: "chainId", status: "pass", detail: cfg.chainId });
  } else {
    checks.push({ name: "chainId", status: "fail", detail: "missing or empty" });
  }

  if (cfg.rpcUrl && isValidUrl(cfg.rpcUrl)) {
    checks.push({ name: "rpc URL format", status: "pass", detail: cfg.rpcUrl });
  } else {
    checks.push({ name: "rpc URL format", status: "fail", detail: cfg.rpcUrl ? `invalid URL: ${cfg.rpcUrl}` : "missing" });
  }

  if (cfg.restUrl && isValidUrl(cfg.restUrl)) {
    checks.push({ name: "rest URL format", status: "pass", detail: cfg.restUrl });
  } else if (cfg.restUrl) {
    checks.push({ name: "rest URL format", status: "fail", detail: `invalid URL: ${cfg.restUrl}` });
  } else {
    checks.push({ name: "rest URL format", status: "warn", detail: "not set (will be derived from rpcUrl)" });
  }

  if (cfg.denom && cfg.denom.trim().length > 0) {
    checks.push({ name: "denom", status: "pass", detail: cfg.denom });
  } else {
    checks.push({ name: "denom", status: "fail", detail: "missing or empty" });
  }

  const mnemonicPath = path.join(
    process.env.CLAWD_HOME ?? path.join(process.env.HOME ?? "/root", ".clawd"),
    "mnemonic.enc",
  );
  if (fs.existsSync(mnemonicPath)) {
    checks.push({ name: "Mnemonic file", status: "pass", detail: mnemonicPath });
  } else {
    checks.push({ name: "Mnemonic file", status: "warn", detail: `not found at ${mnemonicPath} (wallet features unavailable)` });
  }

  return checks;
}

function collectBinaryChecks(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  for (const bin of REQUIRED_BINARIES) {
    const binPath = whichBinary(bin);
    if (binPath) {
      const version = getBinaryVersion(bin);
      checks.push({
        name: bin,
        status: "pass",
        detail: version ? `${binPath} (${version})` : binPath,
      });
    } else {
      checks.push({
        name: bin,
        status: "fail",
        detail: "not found in PATH",
      });
    }
  }

  return checks;
}

function collectChainChecks(home: string): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const resolved = resolveHome(home);

  const configToml = path.join(resolved, "config", "config.toml");
  if (fs.existsSync(configToml)) {
    checks.push({ name: "config/config.toml", status: "pass", detail: configToml });
  } else {
    checks.push({ name: "config/config.toml", status: "fail", detail: `not found at ${configToml}` });
  }

  const appToml = path.join(resolved, "config", "app.toml");
  if (fs.existsSync(appToml)) {
    checks.push({ name: "config/app.toml", status: "pass", detail: appToml });
  } else {
    checks.push({ name: "config/app.toml", status: "fail", detail: `not found at ${appToml}` });
  }

  const genesisJson = path.join(resolved, "config", "genesis.json");
  if (fs.existsSync(genesisJson)) {
    try {
      const raw = fs.readFileSync(genesisJson, "utf-8");
      JSON.parse(raw);
      checks.push({
        name: "config/genesis.json",
        status: "pass",
        detail: `valid JSON (${(Buffer.byteLength(raw) / 1024).toFixed(1)} KB)`,
      });
    } catch (err) {
      checks.push({ name: "config/genesis.json", status: "fail", detail: `invalid JSON: ${String(err)}` });
    }
  } else {
    checks.push({ name: "config/genesis.json", status: "fail", detail: `not found at ${genesisJson}` });
  }

  const dataDir = path.join(resolved, "data");
  if (fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory()) {
    checks.push({ name: "data/ directory", status: "pass", detail: dataDir });
  } else {
    checks.push({ name: "data/ directory", status: "fail", detail: `not found at ${dataDir}` });
  }

  const privValKey = path.join(resolved, "config", "priv_validator_key.json");
  if (fs.existsSync(privValKey)) {
    checks.push({ name: "priv_validator_key.json", status: "pass", detail: privValKey });
  } else {
    checks.push({ name: "priv_validator_key.json", status: "warn", detail: `not found at ${privValKey} (non-validator node or key not yet generated)` });
  }

  return checks;
}
