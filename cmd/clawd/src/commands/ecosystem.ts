/**
 * `clawd ecosystem` — Discover and manage ClawChain ecosystem packages.
 *
 * Lists all available CLI tools, libraries, and React hooks in the
 * ClawChain ecosystem with install instructions and usage examples.
 */

import { loadClawdConfig } from "../lib/config.js";
import { table } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Package registry (self-contained — no runtime dependency on SDK)
// ---------------------------------------------------------------------------

type PackageInfo = {
  name: string;
  npmName: string;
  description: string;
  category: "primitives" | "react" | "cli-tool" | "contract";
  access: string;
  exports: string[];
};

const PACKAGES: PackageInfo[] = [
  {
    name: "claw-viem",
    npmName: "@clawchain/claw-viem",
    description: "Low-level TS primitives — address, encoding, hashing, transport, tx builders",
    category: "primitives",
    access: "npm install @clawchain/claw-viem",
    exports: [
      "isValidAddress", "shortenAddress", "toBase64", "fromBase64", "toHex", "fromHex",
      "sha256", "txHash", "createRpcTransport", "createRestTransport",
      "buildSendMsg", "buildExecuteMsg", "buildDelegateMsg", "estimateGas",
    ],
  },
  {
    name: "claw-wagmi",
    npmName: "@clawchain/claw-wagmi",
    description: "React hooks — Provider, useBalance, useAccount, useStaking, useAgents",
    category: "react",
    access: "npm install @clawchain/claw-wagmi",
    exports: [
      "ClawChainProvider", "useClawChain", "useBalance", "useAccount",
      "useSendTokens", "useStaking", "useAgents", "useAgent",
      "useContractQuery", "useContractExecute", "useBlockHeight",
    ],
  },
  {
    name: "artemis",
    npmName: "clawd",
    description: "DEX arbitrage bot — scan pools, detect cross-pool arb, execute swaps",
    category: "cli-tool",
    access: "clawd artemis [run|scan|pools]",
    exports: ["runArtemisRun", "runArtemisScan", "runArtemisPools"],
  },
  {
    name: "cryo",
    npmName: "clawd",
    description: "Blockchain data extractor — blocks, txs, events to CSV/JSON",
    category: "cli-tool",
    access: "clawd cryo [extract|datasets|stats]",
    exports: ["runCryoExtract", "runCryoDatasets", "runCryoStats"],
  },
  {
    name: "flood",
    npmName: "clawd",
    description: "RPC load tester — benchmark CometBFT RPC, REST, gRPC endpoints",
    category: "cli-tool",
    access: "clawd flood [run|scenarios|check]",
    exports: ["runFloodRun", "runFloodScenarios", "runFloodCheck"],
  },
  {
    name: "flux",
    npmName: "clawd",
    description: "Parallel LLM explorer — N completions, scoring, tree exploration",
    category: "cli-tool",
    access: "clawd flux [explore|compare|scorers]",
    exports: ["runFluxExplore", "runFluxCompare", "runFluxScorers"],
  },
  {
    name: "data-portal",
    npmName: "clawd",
    description: "Dataset catalog — 12 datasets, sample generation, live chain fetch",
    category: "cli-tool",
    access: "clawd data-portal [list|categories|info|download]",
    exports: ["runDataPortalList", "runDataPortalCategories", "runDataPortalInfo", "runDataPortalDownload"],
  },
  {
    name: "rivet",
    npmName: "clawd",
    description: "Chain inspector — inspect, watch, decode, query modules, simulate",
    category: "cli-tool",
    access: "clawd rivet [inspect|watch|decode|query|simulate]",
    exports: ["runRivetInspect", "runRivetWatch", "runRivetDecode", "runRivetQuery", "runRivetSimulate"],
  },
  {
    name: "health",
    npmName: "clawd",
    description: "Service health checker — check all services, watch mode, endpoints list",
    category: "cli-tool",
    access: "clawd health [check|watch|endpoints]",
    exports: ["runHealthCheck", "runHealthWatch", "runHealthEndpoints"],
  },
  {
    name: "validate",
    npmName: "clawd",
    description: "Installation validator — config, binaries, chain data, genesis, all-in-one",
    category: "cli-tool",
    access: "clawd validate [config|binaries|chain|genesis|all]",
    exports: ["runValidateConfig", "runValidateBinaries", "runValidateChain", "runValidateGenesis", "runValidateAll"],
  },
  {
    name: "launch-checklist",
    npmName: "clawd",
    description: "Launch readiness tracker — 18 criteria, sign-off, export as markdown",
    category: "cli-tool",
    access: "clawd launch-checklist [status|sign|reset|export]",
    exports: ["runLaunchChecklistStatus", "runLaunchChecklistSign", "runLaunchChecklistReset", "runLaunchChecklistExport"],
  },
  {
    name: "checksums",
    npmName: "clawd",
    description: "Release checksum tool — generate, verify, show SHA-256 binary hashes",
    category: "cli-tool",
    access: "clawd checksums [generate|verify|show]",
    exports: ["runChecksumsGenerate", "runChecksumsVerify", "runChecksumsShow"],
  },
  {
    name: "monitoring",
    npmName: "clawd",
    description: "Monitoring stack manager — Prometheus, Grafana, AlertManager status, metrics, alerts",
    category: "cli-tool",
    access: "clawd monitoring [status|check|metrics|alerts|dashboards|export]",
    exports: ["runMonitoringStatus", "runMonitoringCheck", "runMonitoringMetrics", "runMonitoringAlerts", "runMonitoringDashboards", "runMonitoringExport"],
  },
];

// ---------------------------------------------------------------------------
// clawd ecosystem list
// ---------------------------------------------------------------------------

export type EcosystemListOptions = {
  json?: boolean;
  category?: string;
};

export async function runEcosystemList(opts: EcosystemListOptions): Promise<void> {
  let packages = PACKAGES;
  if (opts.category) {
    packages = packages.filter((p) => p.category === opts.category);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ packages }, null, 2) + "\n");
    return;
  }

  const cfg = loadClawdConfig();
  console.log(`ClawChain Ecosystem Packages\n`);
  console.log(`  Chain ID: ${cfg.chainId ?? "clawchain-1"}\n`);

  const categories = [...new Set(packages.map((p) => p.category))];
  for (const cat of categories) {
    const catPackages = packages.filter((p) => p.category === cat);
    const label =
      cat === "cli-tool" ? "CLI Tools (via clawd)" :
      cat === "react" ? "React Libraries" :
      cat === "primitives" ? "Core Primitives" :
      cat === "contract" ? "Smart Contracts" : cat;

    console.log(`  ${label}:`);
    for (const pkg of catPackages) {
      console.log(`    ${pkg.name.padEnd(16)} ${pkg.description}`);
      console.log(`    ${"".padEnd(16)} -> ${pkg.access}`);
    }
    console.log();
  }

  console.log(`  Total: ${packages.length} packages`);
  console.log();
}

// ---------------------------------------------------------------------------
// clawd ecosystem info
// ---------------------------------------------------------------------------

export type EcosystemInfoOptions = {
  json?: boolean;
};

export async function runEcosystemInfo(name: string, opts: EcosystemInfoOptions): Promise<void> {
  const pkg = PACKAGES.find((p) => p.name === name || p.npmName === name);
  if (!pkg) {
    console.error(`Unknown package: ${name}`);
    console.error(`Run "clawd ecosystem list" to see available packages.`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(pkg, null, 2) + "\n");
    return;
  }

  console.log(`Package: ${pkg.name}\n`);
  console.log(`  npm:         ${pkg.npmName}`);
  console.log(`  Category:    ${pkg.category}`);
  console.log(`  Description: ${pkg.description}`);
  console.log(`  Access:      ${pkg.access}`);
  console.log(`\n  Exports (${pkg.exports.length}):`);
  for (const exp of pkg.exports) {
    console.log(`    - ${exp}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// clawd ecosystem categories
// ---------------------------------------------------------------------------

export async function runEcosystemCategories(opts: { json?: boolean }): Promise<void> {
  const cats = [...new Set(PACKAGES.map((p) => p.category))].map((cat) => ({
    category: cat,
    count: PACKAGES.filter((p) => p.category === cat).length,
  }));

  if (opts.json) {
    process.stdout.write(JSON.stringify({ categories: cats }, null, 2) + "\n");
    return;
  }

  console.log("Ecosystem Categories\n");
  const headers = ["Category", "Packages"];
  const rows = cats.map((c) => [c.category, String(c.count)]);
  console.log(table(headers, rows));
  console.log();
}
