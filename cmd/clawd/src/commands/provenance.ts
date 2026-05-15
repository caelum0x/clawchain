/**
 * `clawd provenance` — binary provenance generator (SHA-256 checksums)
 * `clawd genesis-validate` — genesis file structure and parameter validator
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { loadClawdConfig } from "../lib/config.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProvenanceOptions = { output?: string; json?: boolean };

export type ProvenanceManifest = {
  timestamp: string;
  chainId: string;
  goVersion: string;
  artifacts: {
    name: string;
    path: string;
    sha256: string;
    sizeBytes: number;
    exists: boolean;
  }[];
};

type GenesisValidationResult = {
  name: string;
  pass: boolean;
  detail: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARTIFACT_NAMES = [
  "clawchaind",
  "clawproof",
  "claw-gpu-provider",
  "claw-inference-sidecar",
  "claw-txhistoryd",
  "claw-faucet",
  "claw-eventsd",
  "claw-notifyd",
];

const REQUIRED_MODULES = [
  "agent",
  "privacy",
  "marketplace",
  "modelregistry",
  "reputation",
  "messaging",
  "governance",
  "clawchain",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256File(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function findProjectRoot(): string {
  // Walk up from this file's location to find the project root (contains go.mod)
  let dir = resolve(dirname(new URL(import.meta.url).pathname));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "go.mod")) || existsSync(join(dir, "Makefile"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function getGoVersion(): string {
  try {
    return execSync("go version", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function resolveArtifactPath(name: string, projectRoot: string): string | null {
  // Check build/ directory first, then project root
  const buildPath = join(projectRoot, "build", name);
  if (existsSync(buildPath)) return buildPath;

  const rootPath = join(projectRoot, name);
  if (existsSync(rootPath)) return rootPath;

  return null;
}

// ---------------------------------------------------------------------------
// runProvenance
// ---------------------------------------------------------------------------

/** Generate SHA-256 checksums for all build artifacts */
export async function runProvenance(opts: ProvenanceOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const projectRoot = findProjectRoot();
  const goVersion = getGoVersion();

  const artifacts = ARTIFACT_NAMES.map((name) => {
    const resolvedPath = resolveArtifactPath(name, projectRoot);
    if (resolvedPath) {
      const stat = statSync(resolvedPath);
      return {
        name,
        path: resolvedPath,
        sha256: sha256File(resolvedPath),
        sizeBytes: stat.size,
        exists: true,
      };
    }
    return {
      name,
      path: join(projectRoot, "build", name),
      sha256: "",
      sizeBytes: 0,
      exists: false,
    };
  });

  const manifest: ProvenanceManifest = {
    timestamp: new Date().toISOString(),
    chainId: cfg.chainId,
    goVersion,
    artifacts,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  } else {
    console.log("clawd provenance\n");
    console.log(`  Chain ID:    ${manifest.chainId}`);
    console.log(`  Go version:  ${manifest.goVersion}`);
    console.log(`  Timestamp:   ${manifest.timestamp}`);
    console.log("");

    // Table header
    const nameW = 28;
    const hashW = 66;
    const sizeW = 14;
    console.log(
      `${"Artifact".padEnd(nameW)}${"SHA-256".padEnd(hashW)}${"Size".padEnd(sizeW)}Status`,
    );
    console.log("-".repeat(nameW + hashW + sizeW + 8));

    for (const a of artifacts) {
      const status = a.exists ? "OK" : "MISSING";
      const hash = a.exists ? a.sha256 : "-";
      const size = a.exists ? formatBytes(a.sizeBytes) : "-";
      console.log(
        `${a.name.padEnd(nameW)}${hash.padEnd(hashW)}${size.padEnd(sizeW)}${status}`,
      );
    }

    const found = artifacts.filter((a) => a.exists).length;
    const total = artifacts.length;
    console.log("");
    console.log(`${found}/${total} artifacts found`);
  }

  if (opts.output) {
    const outDir = resolve(opts.output);
    // Write checksums.txt
    const checksumLines = artifacts
      .filter((a) => a.exists)
      .map((a) => `${a.sha256}  ${a.name}`)
      .join("\n");
    writeFileSync(join(outDir, "checksums.txt"), checksumLines + "\n");

    // Write provenance.json
    writeFileSync(
      join(outDir, "provenance.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );

    if (!opts.json) {
      console.log(`\nWritten: ${join(outDir, "checksums.txt")}`);
      console.log(`Written: ${join(outDir, "provenance.json")}`);
    }
  }
}

// ---------------------------------------------------------------------------
// runGenesisValidate
// ---------------------------------------------------------------------------

/** Validate genesis file structure and parameters */
export async function runGenesisValidate(
  opts: { json?: boolean } = {},
): Promise<void> {
  const cfg = loadClawdConfig();
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;
  const genesisPath = join(nodeHome, "config", "genesis.json");

  const results: GenesisValidationResult[] = [];

  // Check genesis file exists
  if (!existsSync(genesisPath)) {
    results.push({
      name: "Genesis file exists",
      pass: false,
      detail: `not found at ${genesisPath}`,
    });
    outputGenesisResults(results, opts.json);
    return;
  }

  results.push({
    name: "Genesis file exists",
    pass: true,
    detail: genesisPath,
  });

  // Parse genesis
  let genesis: any;
  try {
    const raw = readFileSync(genesisPath, "utf-8");
    genesis = JSON.parse(raw);
  } catch (err) {
    results.push({
      name: "Genesis file parseable",
      pass: false,
      detail: `JSON parse error: ${String(err)}`,
    });
    outputGenesisResults(results, opts.json);
    return;
  }

  results.push({
    name: "Genesis file parseable",
    pass: true,
    detail: "valid JSON",
  });

  // Validate chain_id
  const genesisChainId = genesis.chain_id;
  if (!genesisChainId) {
    results.push({
      name: "chain_id present",
      pass: false,
      detail: "missing chain_id field",
    });
  } else if (genesisChainId !== cfg.chainId) {
    results.push({
      name: "chain_id matches config",
      pass: false,
      detail: `genesis=${genesisChainId} config=${cfg.chainId}`,
    });
  } else {
    results.push({
      name: "chain_id matches config",
      pass: true,
      detail: genesisChainId,
    });
  }

  // Validate genesis_time
  const genesisTime = genesis.genesis_time;
  if (!genesisTime) {
    results.push({
      name: "genesis_time present",
      pass: false,
      detail: "missing genesis_time field",
    });
  } else {
    const parsed = new Date(genesisTime);
    if (Number.isNaN(parsed.getTime())) {
      results.push({
        name: "genesis_time valid",
        pass: false,
        detail: `invalid ISO timestamp: ${genesisTime}`,
      });
    } else {
      results.push({
        name: "genesis_time valid",
        pass: true,
        detail: genesisTime,
      });
    }
  }

  // Validate app_state has required modules
  const appState = genesis.app_state;
  if (!appState || typeof appState !== "object") {
    results.push({
      name: "app_state present",
      pass: false,
      detail: "missing or invalid app_state",
    });
  } else {
    results.push({
      name: "app_state present",
      pass: true,
      detail: `${Object.keys(appState).length} modules`,
    });

    const missingModules = REQUIRED_MODULES.filter(
      (m) => !(m in appState),
    );
    if (missingModules.length > 0) {
      results.push({
        name: "Required modules present",
        pass: false,
        detail: `missing: ${missingModules.join(", ")}`,
      });
    } else {
      results.push({
        name: "Required modules present",
        pass: true,
        detail: REQUIRED_MODULES.join(", "),
      });
    }
  }

  // Validate consensus params
  const consensus =
    genesis.consensus ?? genesis.consensus_params;
  if (!consensus || typeof consensus !== "object") {
    results.push({
      name: "Consensus params present",
      pass: false,
      detail: "missing consensus or consensus_params",
    });
  } else {
    results.push({
      name: "Consensus params present",
      pass: true,
      detail: "found",
    });
  }

  // Validate validator set (gentxs or validators)
  const gentxs = appState?.genutil?.gen_txs ?? appState?.gentx?.gen_txs;
  const validators = genesis.validators;
  const hasValidators =
    (Array.isArray(gentxs) && gentxs.length > 0) ||
    (Array.isArray(validators) && validators.length > 0);
  if (!hasValidators) {
    results.push({
      name: "Validator set non-empty",
      pass: false,
      detail: "no gentxs or validators found",
    });
  } else {
    const count = Array.isArray(gentxs)
      ? gentxs.length
      : (validators?.length ?? 0);
    results.push({
      name: "Validator set non-empty",
      pass: true,
      detail: `${count} validator(s)`,
    });
  }

  // Check bond denom
  const bondDenom =
    appState?.staking?.params?.bond_denom;
  if (!bondDenom) {
    results.push({
      name: "Bond denom is uclaw",
      pass: false,
      detail: "staking.params.bond_denom not found",
    });
  } else if (bondDenom !== "uclaw") {
    results.push({
      name: "Bond denom is uclaw",
      pass: false,
      detail: `expected uclaw, got ${bondDenom}`,
    });
  } else {
    results.push({
      name: "Bond denom is uclaw",
      pass: true,
      detail: "uclaw",
    });
  }

  // Check min deposit
  const minDeposit =
    appState?.gov?.params?.min_deposit ??
    appState?.gov?.deposit_params?.min_deposit;
  if (Array.isArray(minDeposit) && minDeposit.length > 0) {
    const amount = Number(minDeposit[0].amount ?? "0");
    if (amount > 0) {
      results.push({
        name: "Min deposit reasonable",
        pass: true,
        detail: `${minDeposit[0].amount} ${minDeposit[0].denom}`,
      });
    } else {
      results.push({
        name: "Min deposit reasonable",
        pass: false,
        detail: "min deposit amount is 0",
      });
    }
  } else {
    results.push({
      name: "Min deposit reasonable",
      pass: false,
      detail: "gov min_deposit not found",
    });
  }

  // Check max validators
  const maxValidators =
    appState?.staking?.params?.max_validators;
  if (maxValidators === undefined || maxValidators === null) {
    results.push({
      name: "Max validators > 0",
      pass: false,
      detail: "staking.params.max_validators not found",
    });
  } else if (Number(maxValidators) <= 0) {
    results.push({
      name: "Max validators > 0",
      pass: false,
      detail: `max_validators=${maxValidators}`,
    });
  } else {
    results.push({
      name: "Max validators > 0",
      pass: true,
      detail: `max_validators=${maxValidators}`,
    });
  }

  // Compute genesis SHA-256
  const genesisBytes = readFileSync(genesisPath);
  const genesisSha = createHash("sha256").update(genesisBytes).digest("hex");
  results.push({
    name: "Genesis SHA-256",
    pass: true,
    detail: genesisSha,
  });

  outputGenesisResults(results, opts.json);
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function outputGenesisResults(
  results: GenesisValidationResult[],
  json?: boolean,
): void {
  const allPassed = results.every((r) => r.pass);

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: allPassed,
          checks: results,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    console.log("clawd genesis-validate\n");
    for (const r of results) {
      const status = r.pass ? "PASS" : "FAIL";
      console.log(`[${status}] ${r.name}: ${r.detail}`);
    }
    console.log("");
    const passed = results.filter((r) => r.pass).length;
    console.log(
      `${passed}/${results.length} checks passed${allPassed ? "" : " (VALIDATION FAILED)"}`,
    );
  }

  if (!allPassed) {
    process.exitCode = 1;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
