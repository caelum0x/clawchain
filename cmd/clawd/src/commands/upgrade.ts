/**
 * `clawd upgrade` subcommands — check version compatibility, inspect upgrade
 * plans, and prepare for upcoming chain upgrades.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { loadClawdConfig } from "../lib/config.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpgradeCheckOptions = { json?: boolean };
export type UpgradeInfoOptions = { json?: boolean };
export type UpgradePrepareOptions = { name: string; height?: string };

type NodeInfoResponse = {
  default_node_info?: {
    network?: string;
  };
  application_version?: {
    name?: string;
    app_name?: string;
    version?: string;
    cosmos_sdk_version?: string;
  };
};

type UpgradePlan = {
  name?: string;
  height?: string;
  info?: string;
  time?: string;
};

type UpgradePlanResponse = {
  plan?: UpgradePlan;
};

type ModuleVersion = {
  name?: string;
  version?: string;
};

type ModuleVersionsResponse = {
  module_versions?: ModuleVersion[];
};

type AppliedPlanResponse = {
  height?: string;
};

// ---------------------------------------------------------------------------
// clawd upgrade check
// ---------------------------------------------------------------------------

/** Check current version and any pending upgrades. */
export async function runUpgradeCheck(opts: UpgradeCheckOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let nodeInfo: NodeInfoResponse | null = null;
  let currentPlan: UpgradePlanResponse | null = null;
  let moduleVersions: ModuleVersionsResponse | null = null;
  let currentHeight: string | null = null;

  // Query node info
  try {
    const res = await fetch(
      `${restUrl}/cosmos/base/tendermint/v1beta1/node_info`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (res.ok) {
      nodeInfo = (await res.json()) as NodeInfoResponse;
    }
  } catch {
    /* node unreachable */
  }

  // Query current block height via RPC /status
  try {
    const rpcBase = rpcUrl.replace(/\/+$/, "");
    const res = await fetch(`${rpcBase}/status`, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const data = (await res.json()) as {
        result?: { sync_info?: { latest_block_height?: string } };
      };
      currentHeight = data.result?.sync_info?.latest_block_height ?? null;
    }
  } catch {
    /* node unreachable */
  }

  // Query pending upgrade plan
  try {
    const res = await fetch(
      `${restUrl}/cosmos/upgrade/v1beta1/current_plan`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (res.ok) {
      currentPlan = (await res.json()) as UpgradePlanResponse;
    }
  } catch {
    /* node unreachable */
  }

  // Query module versions
  try {
    const res = await fetch(
      `${restUrl}/cosmos/upgrade/v1beta1/module_versions`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (res.ok) {
      moduleVersions = (await res.json()) as ModuleVersionsResponse;
    }
  } catch {
    /* node unreachable */
  }

  const appVersion = nodeInfo?.application_version;
  const plan = currentPlan?.plan;
  const modules = moduleVersions?.module_versions ?? [];

  // Calculate blocks remaining and estimated time
  let blocksRemaining: number | null = null;
  let estimatedTime: string | null = null;
  if (plan?.height && currentHeight) {
    const planHeight = Number(plan.height);
    const height = Number(currentHeight);
    if (planHeight > height) {
      blocksRemaining = planHeight - height;
      // Assume ~6 second block time
      const secondsRemaining = blocksRemaining * 6;
      const hours = Math.floor(secondsRemaining / 3600);
      const minutes = Math.floor((secondsRemaining % 3600) / 60);
      estimatedTime = `~${hours}h ${minutes}m`;
    }
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          version: appVersion?.version ?? null,
          app_name: appVersion?.app_name ?? appVersion?.name ?? null,
          cosmos_sdk_version: appVersion?.cosmos_sdk_version ?? null,
          chain_id: nodeInfo?.default_node_info?.network ?? cfg.chainId,
          current_height: currentHeight,
          pending_upgrade: plan
            ? {
                name: plan.name,
                height: plan.height,
                info: plan.info,
                blocks_remaining: blocksRemaining,
                estimated_time: estimatedTime,
              }
            : null,
          module_versions: modules,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Upgrade Check\n");

  // Node version
  if (appVersion) {
    console.log(`  App:              ${appVersion.app_name ?? appVersion.name ?? "unknown"}`);
    console.log(`  Version:          ${appVersion.version ?? "unknown"}`);
    console.log(`  Cosmos SDK:       ${appVersion.cosmos_sdk_version ?? "unknown"}`);
  } else {
    console.log("  Version:          (could not query node)");
  }

  console.log(`  Chain ID:         ${nodeInfo?.default_node_info?.network ?? cfg.chainId}`);

  if (currentHeight) {
    console.log(`  Current Height:   ${currentHeight}`);
  }

  // Pending upgrade
  console.log();
  if (plan && plan.name) {
    console.log("  Pending Upgrade:");
    console.log(`    Name:           ${plan.name}`);
    console.log(`    Height:         ${plan.height ?? "unknown"}`);
    if (plan.info) {
      console.log(`    Info:           ${plan.info}`);
    }
    if (blocksRemaining !== null) {
      console.log(`    Blocks left:    ${blocksRemaining}`);
    }
    if (estimatedTime) {
      console.log(`    ETA:            ${estimatedTime}`);
    }
  } else {
    console.log("  Pending Upgrade:  none");
  }

  // Module versions
  if (modules.length > 0) {
    console.log();
    console.log("  Module Versions:");
    for (const m of modules) {
      console.log(`    ${(m.name ?? "unknown").padEnd(20)} v${m.version ?? "?"}`);
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// clawd upgrade info
// ---------------------------------------------------------------------------

/** Show detailed info about a specific upgrade plan. */
export async function runUpgradeInfo(opts: UpgradeInfoOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let currentPlan: UpgradePlanResponse | null = null;
  let appliedHeight: string | null = null;

  // Query current plan
  try {
    const res = await fetch(
      `${restUrl}/cosmos/upgrade/v1beta1/current_plan`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (res.ok) {
      currentPlan = (await res.json()) as UpgradePlanResponse;
    }
  } catch {
    /* node unreachable */
  }

  const plan = currentPlan?.plan;
  const upgradeName = plan?.name;

  // If there is a plan, also check if it has been applied
  if (upgradeName) {
    try {
      const res = await fetch(
        `${restUrl}/cosmos/upgrade/v1beta1/applied_plan/${encodeURIComponent(upgradeName)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as AppliedPlanResponse;
        if (data.height && data.height !== "0") {
          appliedHeight = data.height;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          plan: plan ?? null,
          applied: appliedHeight !== null,
          applied_height: appliedHeight,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Upgrade Info\n");

  if (!plan || !plan.name) {
    console.log("  No upgrade plan found.");
    console.log();
    return;
  }

  console.log(`  Name:      ${plan.name}`);
  console.log(`  Height:    ${plan.height ?? "unknown"}`);
  if (plan.info) {
    console.log(`  Info:      ${plan.info}`);
  }
  if (plan.time) {
    console.log(`  Time:      ${plan.time}`);
  }
  console.log(`  Applied:   ${appliedHeight !== null ? `yes (height ${appliedHeight})` : "no"}`);
  console.log();
}

// ---------------------------------------------------------------------------
// clawd upgrade prepare
// ---------------------------------------------------------------------------

/** Prepare for an upcoming upgrade (create directory, download binary if URL provided). */
export async function runUpgradePrepare(opts: UpgradePrepareOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const upgradeName = opts.name;

  // 1. Check if an upgrade plan exists and matches --name
  let plan: UpgradePlan | null = null;
  try {
    const res = await fetch(
      `${restUrl}/cosmos/upgrade/v1beta1/current_plan`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (res.ok) {
      const data = (await res.json()) as UpgradePlanResponse;
      plan = data.plan ?? null;
    }
  } catch {
    /* node unreachable */
  }

  if (plan && plan.name && plan.name !== upgradeName) {
    console.log(
      `Warning: pending upgrade is "${plan.name}" but you specified "${upgradeName}".`,
    );
  }

  // 2. Verify clawchaind binary exists
  const clawchainHome = cfg.nodeHome || CLAWCHAIN_HOME;
  const currentBinaryPath = cfg.nodeBinaryPath ?? "clawchaind";
  console.log(`Preparing upgrade "${upgradeName}"...\n`);
  console.log(`  Chain home:      ${clawchainHome}`);
  console.log(`  Current binary:  ${currentBinaryPath}`);

  // 3. Create cosmovisor upgrade directory
  const upgradeDir = join(clawchainHome, "cosmovisor", "upgrades", upgradeName, "bin");
  if (!existsSync(upgradeDir)) {
    mkdirSync(upgradeDir, { recursive: true });
    console.log(`  Upgrade dir:     ${upgradeDir} (created)`);
  } else {
    console.log(`  Upgrade dir:     ${upgradeDir} (exists)`);
  }

  // 4. If binary URL is in upgrade info, download and verify SHA-256
  let binaryUrl: string | null = null;
  if (plan?.info) {
    try {
      const infoObj = JSON.parse(plan.info) as { binaries?: Record<string, string> };
      // Try platform-specific binary, fallback to any/all
      const platform = `${process.platform}/${process.arch}`;
      binaryUrl =
        infoObj.binaries?.[platform] ??
        infoObj.binaries?.["any"] ??
        null;
    } catch {
      // info is not JSON, check if it looks like a URL
      if (plan.info.startsWith("http://") || plan.info.startsWith("https://")) {
        binaryUrl = plan.info;
      }
    }
  }

  if (binaryUrl) {
    console.log(`  Binary URL:      ${binaryUrl}`);

    // Parse checksum if present (format: url?checksum=sha256:abc123)
    let expectedChecksum: string | null = null;
    try {
      const urlObj = new URL(binaryUrl);
      const checksumParam = urlObj.searchParams.get("checksum");
      if (checksumParam?.startsWith("sha256:")) {
        expectedChecksum = checksumParam.slice(7);
        // Strip checksum from download URL
        urlObj.searchParams.delete("checksum");
        binaryUrl = urlObj.toString();
      }
    } catch {
      /* not a valid URL with params */
    }

    try {
      console.log("  Downloading...");
      const res = await fetch(binaryUrl, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        console.error(`  Download failed (HTTP ${res.status}).`);
        process.exit(1);
      }

      const buffer = Buffer.from(await res.arrayBuffer());

      // Verify checksum if provided
      if (expectedChecksum) {
        const hash = createHash("sha256").update(buffer).digest("hex");
        if (hash !== expectedChecksum) {
          console.error(`  Checksum mismatch!`);
          console.error(`    Expected: ${expectedChecksum}`);
          console.error(`    Got:      ${hash}`);
          process.exit(1);
        }
        console.log(`  Checksum:        verified (sha256:${expectedChecksum.slice(0, 16)}...)`);
      }

      const binaryPath = join(upgradeDir, "clawchaind");
      writeFileSync(binaryPath, buffer, { mode: 0o755 });
      console.log(`  Binary saved:    ${binaryPath}`);
    } catch (err) {
      if ((err as any)?.code !== undefined) throw err; // re-throw process.exit
      console.error(`  Download failed: ${String(err)}`);
      process.exit(1);
    }
  } else {
    console.log("  Binary URL:      not available (place binary manually)");
    console.log(`  Expected path:   ${join(upgradeDir, "clawchaind")}`);
  }

  // 5. Report readiness
  const binaryReady = existsSync(join(upgradeDir, "clawchaind"));
  console.log();
  console.log(`  Ready: ${binaryReady ? "yes" : "no (binary not found)"}`);

  if (plan?.height) {
    console.log(`  Upgrade height:  ${plan.height}`);
  }
  if (opts.height) {
    console.log(`  Target height:   ${opts.height}`);
  }
  console.log();
}
