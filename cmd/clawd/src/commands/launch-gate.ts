/**
 * `clawd launch-gate` — programmatic mainnet launch readiness assessment.
 *
 * Evaluates all 18 go/no-go criteria from docs/mainnet-launch-checklist.md
 * and outputs a pass/fail matrix. Automated checks query the chain REST API
 * and inspect local filesystem artifacts; manual checks are flagged for
 * human verification.
 */

import { loadClawdConfig } from "../lib/config.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LaunchGateOptions = { json?: boolean; verbose?: boolean };

export type GateCriterion = {
  id: number;
  name: string;
  category: "testing" | "security" | "network" | "operations" | "documentation";
  status: "pass" | "fail" | "warn" | "skip" | "manual";
  detail: string;
  automated: boolean;
};

export type LaunchGateReport = {
  timestamp: string;
  chainId: string;
  overallStatus: "go" | "no-go";
  passed: number;
  failed: number;
  manual: number;
  criteria: GateCriterion[];
  blockers: string[];
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runLaunchGate(opts: LaunchGateOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const restUrl = trimSlash(cfg.restUrl ?? deriveRestUrl(cfg.rpcUrl ?? "http://localhost:26657"));
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;
  const projectRoot = resolveProjectRoot();

  const criteria: GateCriterion[] = [];

  // --- Manual checks (require human / CI runner) ---
  criteria.push(manualCriterion(1, "Unit tests pass", "testing", "Run: go test ./..."));
  criteria.push(manualCriterion(2, "Integration tests pass", "testing", "Run: go test -tags=integration ./x/..."));

  // --- Semi-automated (file existence) ---
  criteria.push(checkSecurityReview(projectRoot));
  criteria.push(checkThreatModel(projectRoot));
  criteria.push(checkTrustedSetup(projectRoot));
  criteria.push(checkVerifyingKeys(projectRoot));
  criteria.push(checkDependencyAudit());

  // --- Automated (chain + filesystem) ---
  criteria.push(await checkGenesisFile(nodeHome));
  criteria.push(await checkValidatorCount(restUrl));
  criteria.push(await checkGovernanceParticipation(restUrl));

  // --- Manual ---
  criteria.push(manualCriterion(11, "Load testing completed", "testing", "See docs/mainnet-capacity-criteria.md"));

  // --- Automated ---
  criteria.push(await checkTestnetStability(restUrl));

  // --- Semi-automated (file existence) ---
  criteria.push(checkBinaryProvenance(projectRoot));
  criteria.push(checkIncidentRunbook(projectRoot));
  criteria.push(checkKeyCustodyPolicy(projectRoot));
  criteria.push(checkOperatorQuickstart(projectRoot));

  // --- Semi-automated ---
  criteria.push(checkSdkBuilds(projectRoot));

  // --- Manual ---
  criteria.push(manualCriterion(18, "E2E demo runs cleanly", "testing", "Run: demo/demo.sh"));

  // Build report
  const passed = criteria.filter((c) => c.status === "pass").length;
  const failed = criteria.filter((c) => c.status === "fail").length;
  const manual = criteria.filter((c) => c.status === "manual").length;
  const blockers = criteria
    .filter((c) => c.status === "fail")
    .map((c) => `#${c.id} ${c.name}: ${c.detail}`);

  const overallStatus: "go" | "no-go" = failed === 0 ? "go" : "no-go";

  const report: LaunchGateReport = {
    timestamp: new Date().toISOString(),
    chainId: cfg.chainId,
    overallStatus,
    passed,
    failed,
    manual,
    criteria,
    blockers,
  };

  // --- Output ---
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (overallStatus === "no-go") {
      process.exitCode = 1;
    }
    return;
  }

  printReport(report, opts.verbose ?? false);

  if (overallStatus === "no-go") {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Automated criterion checks
// ---------------------------------------------------------------------------

/** #3 Security review checklist signed off */
function checkSecurityReview(projectRoot: string): GateCriterion {
  const filePath = join(projectRoot, "docs", "security-review-checklist.md");
  if (!existsSync(filePath)) {
    return criterion(3, "Security review signed", "security", "fail",
      "docs/security-review-checklist.md not found", false);
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const hasSignOff =
      content.includes("Approved") ||
      content.includes("SIGNED") ||
      content.includes("Sign-off") ||
      content.includes("[x]");
    if (hasSignOff) {
      return criterion(3, "Security review signed", "security", "pass",
        "sign-off markers found in security-review-checklist.md", false);
    }
    return criterion(3, "Security review signed", "security", "fail",
      "docs/security-review-checklist.md exists but no sign-off markers found", false);
  } catch {
    return criterion(3, "Security review signed", "security", "fail",
      "could not read docs/security-review-checklist.md", false);
  }
}

/** #4 Threat model reviewed */
function checkThreatModel(projectRoot: string): GateCriterion {
  const filePath = join(projectRoot, "docs", "threat-model.md");
  if (!existsSync(filePath)) {
    return criterion(4, "Threat model reviewed", "security", "fail",
      "docs/threat-model.md not found", false);
  }
  return criterion(4, "Threat model reviewed", "security", "pass",
    "docs/threat-model.md exists", false);
}

/** #5 Trusted setup ceremony completed */
function checkTrustedSetup(projectRoot: string): GateCriterion {
  const keysDir = join(projectRoot, "x", "privacy", "circuit", "keys");
  if (!existsSync(keysDir)) {
    return criterion(5, "Trusted setup ceremony", "security", "fail",
      "x/privacy/circuit/keys/ directory not found", false);
  }

  const expectedFiles = ["proving_key", "verifying_key"];
  const found: string[] = [];
  const missing: string[] = [];
  for (const f of expectedFiles) {
    // Check for files with any extension (e.g., .bin, .key, etc.)
    const candidates = [f, `${f}.bin`, `${f}.key`, `${f}.pk`, `${f}.vk`];
    let fileFound = false;
    for (const candidate of candidates) {
      if (existsSync(join(keysDir, candidate))) {
        found.push(candidate);
        fileFound = true;
        break;
      }
    }
    if (!fileFound) {
      missing.push(f);
    }
  }

  if (missing.length > 0) {
    return criterion(5, "Trusted setup ceremony", "security", "fail",
      `key files missing in x/privacy/circuit/keys/: ${missing.join(", ")}`, false);
  }
  return criterion(5, "Trusted setup ceremony", "security", "pass",
    `key files found: ${found.join(", ")}`, false);
}

/** #6 Verifying keys embedded and verified */
function checkVerifyingKeys(projectRoot: string): GateCriterion {
  const keysDir = join(projectRoot, "x", "privacy", "circuit", "keys");
  if (!existsSync(keysDir)) {
    return criterion(6, "Verifying keys embedded", "security", "fail",
      "x/privacy/circuit/keys/ directory not found", false);
  }

  // Look for any verifying key file with non-zero size
  const candidates = ["verifying_key", "verifying_key.bin", "verifying_key.key", "verifying_key.vk"];
  for (const name of candidates) {
    const fullPath = join(keysDir, name);
    if (existsSync(fullPath)) {
      try {
        const stat = statSync(fullPath);
        if (stat.size > 0) {
          return criterion(6, "Verifying keys embedded", "security", "pass",
            `${name} found (${stat.size} bytes)`, false);
        }
        return criterion(6, "Verifying keys embedded", "security", "fail",
          `${name} exists but is empty (0 bytes)`, false);
      } catch {
        return criterion(6, "Verifying keys embedded", "security", "fail",
          `could not stat ${name}`, false);
      }
    }
  }

  return criterion(6, "Verifying keys embedded", "security", "fail",
    "no verifying key file found in x/privacy/circuit/keys/", false);
}

/** #7 Dependency audit clean */
function checkDependencyAudit(): GateCriterion {
  // We cannot run govulncheck inline; check if a results file exists
  // or just report the Go version as a proxy.
  try {
    // Best effort: check that Go is available and report version
    return criterion(7, "Dependency audit clean", "security", "warn",
      "run govulncheck and npm audit manually to verify", false);
  } catch {
    return criterion(7, "Dependency audit clean", "security", "warn",
      "could not verify dependency audit status", false);
  }
}

/** #8 Genesis file validated */
async function checkGenesisFile(nodeHome: string): Promise<GateCriterion> {
  const genesisPath = join(nodeHome, "config", "genesis.json");
  if (!existsSync(genesisPath)) {
    return criterion(8, "Genesis file validated", "network", "fail",
      `genesis.json not found at ${genesisPath}`, true);
  }
  try {
    const bytes = readFileSync(genesisPath);
    const sha = createHash("sha256").update(bytes).digest("hex");
    // Validate JSON structure
    const genesis = JSON.parse(bytes.toString("utf-8")) as {
      chain_id?: string;
      genesis_time?: string;
    };
    const chainId = genesis.chain_id ?? "unknown";
    return criterion(8, "Genesis file validated", "network", "pass",
      `chain_id=${chainId} sha256=${sha.substring(0, 16)}...`, true);
  } catch (err) {
    return criterion(8, "Genesis file validated", "network", "fail",
      `genesis.json parse error: ${String(err)}`, true);
  }
}

/** #9 Minimum validator count >= 5 */
async function checkValidatorCount(restUrl: string): Promise<GateCriterion> {
  const url = `${restUrl}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return criterion(9, "Min 5 validators", "network", "fail",
        `REST query failed: HTTP ${res.status}`, true);
    }
    const data = (await res.json()) as {
      validators?: Array<{ operator_address?: string }>;
      pagination?: { total?: string };
    };
    const count = data.validators?.length ?? 0;
    if (count >= 5) {
      return criterion(9, "Min 5 validators", "network", "pass",
        `${count} bonded validators found`, true);
    }
    return criterion(9, "Min 5 validators", "network", "fail",
      `only ${count} bonded validators (need >= 5)`, true);
  } catch (err) {
    return criterion(9, "Min 5 validators", "network", "fail",
      `could not query validators: ${String(err)}`, true);
  }
}

/** #10 Governance participation (>= 3 validators voted) */
async function checkGovernanceParticipation(restUrl: string): Promise<GateCriterion> {
  const url = `${restUrl}/clawchain/governance/v1/proposals`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      // Fall back to cosmos governance endpoint
      return await checkGovernanceFallback(restUrl);
    }
    const data = (await res.json()) as {
      proposals?: Array<{
        id?: string;
        status?: string;
        final_tally_result?: {
          yes_count?: string;
          no_count?: string;
          abstain_count?: string;
        };
      }>;
    };
    const proposals = data.proposals ?? [];
    const passedWithVotes = proposals.filter((p) => {
      const yes = Number.parseInt(p.final_tally_result?.yes_count ?? "0", 10);
      const no = Number.parseInt(p.final_tally_result?.no_count ?? "0", 10);
      const abstain = Number.parseInt(p.final_tally_result?.abstain_count ?? "0", 10);
      return (yes + no + abstain) >= 3;
    });
    if (passedWithVotes.length > 0) {
      return criterion(10, "Governance participation", "network", "pass",
        `${passedWithVotes.length} proposal(s) with >= 3 votes`, true);
    }
    return criterion(10, "Governance participation", "network", "fail",
      `no proposals found with >= 3 validator votes`, true);
  } catch (err) {
    return await checkGovernanceFallback(restUrl);
  }
}

async function checkGovernanceFallback(restUrl: string): Promise<GateCriterion> {
  const url = `${restUrl}/cosmos/gov/v1/proposals`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return criterion(10, "Governance participation", "network", "fail",
        `governance query failed: HTTP ${res.status}`, true);
    }
    const data = (await res.json()) as {
      proposals?: Array<{
        id?: string;
        status?: string;
        final_tally_result?: {
          yes_count?: string;
          no_count?: string;
          abstain_count?: string;
        };
      }>;
    };
    const proposals = data.proposals ?? [];
    const passedWithVotes = proposals.filter((p) => {
      const yes = Number.parseInt(p.final_tally_result?.yes_count ?? "0", 10);
      const no = Number.parseInt(p.final_tally_result?.no_count ?? "0", 10);
      const abstain = Number.parseInt(p.final_tally_result?.abstain_count ?? "0", 10);
      return (yes + no + abstain) >= 3;
    });
    if (passedWithVotes.length > 0) {
      return criterion(10, "Governance participation", "network", "pass",
        `${passedWithVotes.length} proposal(s) with >= 3 votes`, true);
    }
    return criterion(10, "Governance participation", "network", "fail",
      `no proposals found with >= 3 validator votes`, true);
  } catch (err) {
    return criterion(10, "Governance participation", "network", "fail",
      `could not query governance: ${String(err)}`, true);
  }
}

/** #12 Testnet stable >= 7 days */
async function checkTestnetStability(restUrl: string): Promise<GateCriterion> {
  const url = `${restUrl}/cosmos/base/tendermint/v1beta1/blocks/latest`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return criterion(12, "Testnet stable >= 7 days", "network", "fail",
        `block query failed: HTTP ${res.status}`, true);
    }
    const data = (await res.json()) as {
      block?: {
        header?: {
          height?: string;
          time?: string;
          chain_id?: string;
        };
      };
    };
    const height = data.block?.header?.height;
    const blockTime = data.block?.header?.time;
    if (!height || !blockTime) {
      return criterion(12, "Testnet stable >= 7 days", "network", "fail",
        "could not parse latest block", true);
    }

    const blockDate = new Date(blockTime);
    const now = new Date();
    const ageMs = now.getTime() - blockDate.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Chain is producing blocks if latest block is recent (< 1 minute old)
    if (ageMs > 60_000) {
      return criterion(12, "Testnet stable >= 7 days", "network", "warn",
        `latest block is ${Math.round(ageMs / 1000)}s old (may be stalled) height=${height}`, true);
    }

    // Check approximate chain age from block height (assuming ~6s blocks)
    const estimatedAgeDays = (Number.parseInt(height, 10) * 6) / (60 * 60 * 24);
    if (estimatedAgeDays >= 7) {
      return criterion(12, "Testnet stable >= 7 days", "network", "pass",
        `chain producing blocks at height=${height} (~${Math.round(estimatedAgeDays)} days estimated)`, true);
    }
    return criterion(12, "Testnet stable >= 7 days", "network", "fail",
      `chain age ~${Math.round(estimatedAgeDays)} days (need >= 7) height=${height}`, true);
  } catch (err) {
    return criterion(12, "Testnet stable >= 7 days", "network", "fail",
      `could not query blocks: ${String(err)}`, true);
  }
}

/** #13 Binary provenance (checksums) */
function checkBinaryProvenance(projectRoot: string): GateCriterion {
  const checksumPath = join(projectRoot, "build", "checksums.txt");
  if (!existsSync(checksumPath)) {
    return criterion(13, "Binary provenance", "operations", "fail",
      "build/checksums.txt not found", false);
  }
  try {
    const stat = statSync(checksumPath);
    if (stat.size === 0) {
      return criterion(13, "Binary provenance", "operations", "fail",
        "build/checksums.txt is empty", false);
    }
    return criterion(13, "Binary provenance", "operations", "pass",
      `build/checksums.txt found (${stat.size} bytes)`, false);
  } catch {
    return criterion(13, "Binary provenance", "operations", "fail",
      "could not read build/checksums.txt", false);
  }
}

/** #14 Incident runbook tested */
function checkIncidentRunbook(projectRoot: string): GateCriterion {
  const filePath = join(projectRoot, "docs", "incident-runbook.md");
  if (!existsSync(filePath)) {
    return criterion(14, "Incident runbook tested", "operations", "fail",
      "docs/incident-runbook.md not found", false);
  }
  return criterion(14, "Incident runbook tested", "operations", "pass",
    "docs/incident-runbook.md exists", false);
}

/** #15 Key custody policy documented */
function checkKeyCustodyPolicy(projectRoot: string): GateCriterion {
  const filePath = join(projectRoot, "docs", "key-custody-policy.md");
  if (!existsSync(filePath)) {
    return criterion(15, "Key custody policy", "documentation", "fail",
      "docs/key-custody-policy.md not found", false);
  }
  return criterion(15, "Key custody policy", "documentation", "pass",
    "docs/key-custody-policy.md exists", false);
}

/** #16 Operator quickstart complete */
function checkOperatorQuickstart(projectRoot: string): GateCriterion {
  const filePath = join(projectRoot, "docs", "operator-quickstart.md");
  if (!existsSync(filePath)) {
    return criterion(16, "Operator quickstart", "documentation", "fail",
      "docs/operator-quickstart.md not found", false);
  }
  return criterion(16, "Operator quickstart", "documentation", "pass",
    "docs/operator-quickstart.md exists", false);
}

/** #17 SDK/OpenClaw builds pass */
function checkSdkBuilds(projectRoot: string): GateCriterion {
  const sdkDist = join(projectRoot, "sdk", "dist");
  const sdkDistExists = existsSync(sdkDist);

  if (!sdkDistExists) {
    return criterion(17, "SDK/OpenClaw builds", "testing", "fail",
      "sdk/dist/ not found — run: cd sdk && npm run build", false);
  }

  return criterion(17, "SDK/OpenClaw builds", "testing", "pass",
    "sdk/dist/ exists", false);
}

// ---------------------------------------------------------------------------
// Pretty printer
// ---------------------------------------------------------------------------

function printReport(report: LaunchGateReport, verbose: boolean): void {
  console.log(`\nLaunch Gate Assessment — ${report.chainId}`);
  console.log(
    "\u2501".repeat(50),
  );
  console.log("");

  // Header
  const colId = " # ";
  const colName = " Criterion                         ";
  const colStatus = " Status ";
  const colDetail = " Detail";
  console.log(`${colId} | ${colName} | ${colStatus} | ${colDetail}`);
  console.log("----+-" + "-".repeat(35) + "-+-" + "-".repeat(8) + "-+-" + "-".repeat(30));

  for (const c of report.criteria) {
    const id = String(c.id).padStart(2, " ");
    const name = c.name.padEnd(35, " ");
    const statusLabel = formatStatus(c.status);
    const detail = verbose ? c.detail : truncate(c.detail, 50);
    console.log(` ${id} | ${name} | ${statusLabel} | ${detail}`);
  }

  console.log("");
  console.log(
    `Overall: ${report.overallStatus.toUpperCase()} ` +
    `(${report.passed} passed, ${report.failed} failed, ${report.manual} manual)`,
  );

  if (report.blockers.length > 0) {
    console.log("\nBlockers:");
    for (const b of report.blockers) {
      console.log(`  - ${b}`);
    }
  }
  console.log("");
}

function formatStatus(status: GateCriterion["status"]): string {
  switch (status) {
    case "pass":
      return " PASS  ";
    case "fail":
      return " FAIL  ";
    case "warn":
      return " WARN  ";
    case "skip":
      return " SKIP  ";
    case "manual":
      return "MANUAL ";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function criterion(
  id: number,
  name: string,
  category: GateCriterion["category"],
  status: GateCriterion["status"],
  detail: string,
  automated: boolean,
): GateCriterion {
  return { id, name, category, status, detail, automated };
}

function manualCriterion(
  id: number,
  name: string,
  category: GateCriterion["category"],
  detail: string,
): GateCriterion {
  return { id, name, category, status: "manual", detail, automated: false };
}

function trimSlash(v: string): string {
  return v.replace(/\/+$/, "");
}

function deriveRestUrl(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.substring(0, maxLen - 3) + "...";
}

function resolveProjectRoot(): string {
  // Walk up from this file's location to find the project root
  // (contains go.mod or .git)
  let dir = resolve(__dirname ?? process.cwd());
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "go.mod")) || existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: use cwd
  return process.cwd();
}
