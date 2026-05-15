/**
 * `clawd gpu-provider` subcommands — register, status, earnings, setup,
 * detect-hardware for GPU compute providers.
 *
 * Provider-side complement to the consumer-facing `clawd gpu` commands
 * (list, lease, submit-job, jobs, status, leases).
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

async function ensureSigner() {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

  if (!mnemonicFileExists()) {
    throw new Error('No mnemonic found. Run "clawd init" first.');
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("Failed to load mnemonic.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error("Failed to derive wallet account.");
  }

  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return { cfg, rpcUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GpuProviderInfo = {
  address?: string;
  name?: string;
  vram_gb?: number;
  cuda_cores?: number;
  price_per_hour_uclaw?: string;
  active?: boolean;
  utilization?: number;
  active_leases?: number;
  uptime_seconds?: number;
  total_jobs_completed?: number;
  registered_at?: string;
};

type CompletedJob = {
  id?: number;
  status?: string;
  provider?: string;
  earnings?: string;
  total_cost?: string;
  completed_at?: string;
};

// ---------------------------------------------------------------------------
// clawd gpu-provider register
// ---------------------------------------------------------------------------

export type GpuRegisterOptions = {
  vram: string;
  cudaCores?: string;
  price: string;
  name?: string;
};

export async function runGpuRegister(opts: GpuRegisterOptions): Promise<void> {
  const { account, signingClient, cfg, rpcUrl } = await ensureSigner();
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  // Check if already registered
  try {
    const checkUrl = `${restUrl}/clawchain/marketplace/v1/gpu_providers/${encodeURIComponent(account.address)}`;
    const checkRes = await fetch(checkUrl, { signal: AbortSignal.timeout(8_000) });
    if (checkRes.ok) {
      const data = (await checkRes.json()) as { provider?: GpuProviderInfo };
      if (data.provider && data.provider.active) {
        console.error("GPU provider already registered for this address.");
        console.error(`  Address: ${account.address}`);
        console.error(`  Name:    ${data.provider.name ?? "-"}`);
        console.error('Use "clawd gpu-provider status" to view current registration.');
        signingClient.disconnect();
        process.exit(1);
      }
    }
  } catch {
    // Check is best-effort; proceed with registration
  }

  const providerName = opts.name ?? `gpu-${shortAddr(account.address)}`;
  const payload = JSON.stringify({
    name: providerName,
    vram_gb: Number(opts.vram),
    cuda_cores: opts.cudaCores ? Number(opts.cudaCores) : 0,
    price_per_hour_uclaw: opts.price,
  });

  console.log(`Registering GPU provider "${providerName}"...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgAgentAction",
    value: {
      creator: account.address,
      actionType: "gpu_register",
      payload,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`GPU registration failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`GPU provider registered successfully.`);
    console.log(`  Address:     ${account.address}`);
    console.log(`  Name:        ${providerName}`);
    console.log(`  VRAM:        ${opts.vram} GB`);
    if (opts.cudaCores) {
      console.log(`  CUDA Cores:  ${opts.cudaCores}`);
    }
    console.log(`  Price/hr:    ${formatClaw(opts.price)}`);
    console.log(`  TxHash:      ${res.transactionHash}`);
  } catch (err) {
    console.error(`GPU registration failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd gpu-provider status
// ---------------------------------------------------------------------------

export type GpuProviderStatusOptions = {
  json?: boolean;
};

export async function runGpuProviderStatus(opts: GpuProviderStatusOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  if (!mnemonicFileExists()) {
    console.error('No mnemonic found. Run "clawd init" first.');
    process.exit(1);
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    console.error("Failed to load mnemonic.");
    process.exit(1);
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    console.error("Failed to derive wallet account.");
    process.exit(1);
  }

  const url = `${restUrl}/clawchain/marketplace/v1/gpu_providers/${encodeURIComponent(account.address)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log("No GPU provider registration found for this address.");
        console.log(`  Address: ${account.address}`);
        console.log('  Register with "clawd gpu-provider register".');
        return;
      }
      console.error(`Failed to query GPU provider status (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { provider?: GpuProviderInfo };
    const provider = (data.provider ?? data) as GpuProviderInfo;

    if (opts.json) {
      process.stdout.write(JSON.stringify(provider, null, 2) + "\n");
      return;
    }

    const uptimeHrs = provider.uptime_seconds
      ? (Number(provider.uptime_seconds) / 3600).toFixed(1)
      : "-";
    const utilPct = provider.utilization !== undefined
      ? `${(Number(provider.utilization) * 100).toFixed(1)}%`
      : "-";

    console.log(`GPU Provider Status\n`);
    console.log(`  Address:        ${provider.address ?? account.address}`);
    console.log(`  Name:           ${provider.name ?? "-"}`);
    console.log(`  VRAM:           ${provider.vram_gb ?? "-"} GB`);
    console.log(`  CUDA Cores:     ${provider.cuda_cores ?? "-"}`);
    console.log(`  Price/hr:       ${provider.price_per_hour_uclaw ? formatClaw(provider.price_per_hour_uclaw) : "-"}`);
    console.log(`  Active:         ${provider.active ?? false}`);
    console.log(`  Utilization:    ${utilPct}`);
    console.log(`  Active Leases:  ${provider.active_leases ?? 0}`);
    console.log(`  Uptime:         ${uptimeHrs} hrs`);
    console.log(`  Jobs Completed: ${provider.total_jobs_completed ?? 0}`);
    if (provider.registered_at) {
      console.log(`  Registered:     ${provider.registered_at}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query GPU provider status: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd gpu-provider earnings
// ---------------------------------------------------------------------------

export type GpuEarningsOptions = {
  json?: boolean;
};

export async function runGpuEarnings(opts: GpuEarningsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  if (!mnemonicFileExists()) {
    console.error('No mnemonic found. Run "clawd init" first.');
    process.exit(1);
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    console.error("Failed to load mnemonic.");
    process.exit(1);
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    console.error("Failed to derive wallet account.");
    process.exit(1);
  }

  const url = `${restUrl}/clawchain/marketplace/v1/compute/jobs?address=${encodeURIComponent(account.address)}&status=completed`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query compute jobs (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { jobs?: CompletedJob[] };
    const jobs = data.jobs ?? [];

    // Sum earnings from completed jobs
    let totalEarnings = 0n;
    const jobSummaries: { id: string; earnings: string; completedAt: string }[] = [];

    for (const j of jobs) {
      const amt = BigInt(j.earnings ?? j.total_cost ?? "0");
      totalEarnings += amt;
      jobSummaries.push({
        id: String(j.id ?? "?"),
        earnings: String(amt),
        completedAt: j.completed_at ?? "-",
      });
    }

    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            address: account.address,
            total_earnings_uclaw: totalEarnings.toString(),
            completed_jobs: jobs.length,
            jobs: jobSummaries,
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }

    console.log(`GPU Provider Earnings\n`);
    console.log(`  Address:         ${account.address}`);
    console.log(`  Total Earnings:  ${formatClaw(totalEarnings.toString())}`);
    console.log(`  Completed Jobs:  ${jobs.length}`);

    if (jobSummaries.length > 0) {
      console.log();

      const headers = ["Job ID", "Earnings", "Completed"];
      const rows = jobSummaries.map((j) => [
        j.id,
        formatClaw(j.earnings),
        j.completedAt,
      ]);

      console.log(table(headers, rows));
    }

    console.log();
  } catch (err) {
    console.error(`Failed to query GPU earnings: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// GPU hardware detection types
// ---------------------------------------------------------------------------

export type DetectedGpu = {
  vendor: "nvidia" | "amd" | "apple" | "unknown";
  model: string;
  vram_mb: number;
  driver_version: string;
};

export type HardwareDetectionResult = {
  gpus: DetectedGpu[];
  detected: boolean;
};

// ---------------------------------------------------------------------------
// clawd gpu-provider detect-hardware
// ---------------------------------------------------------------------------

/**
 * Detect NVIDIA GPUs via nvidia-smi.
 * Returns an array of detected GPUs or empty array on failure.
 */
export function detectNvidiaGpus(): DetectedGpu[] {
  try {
    const raw = execSync(
      "nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits",
      { encoding: "utf-8", timeout: 10_000 },
    ).trim();
    if (!raw) return [];

    return raw.split("\n").filter(Boolean).map((line) => {
      const parts = line.split(",").map((s) => s.trim());
      return {
        vendor: "nvidia" as const,
        model: parts[0] ?? "Unknown NVIDIA GPU",
        vram_mb: Math.round(Number(parts[1]) || 0),
        driver_version: parts[2] ?? "unknown",
      };
    });
  } catch {
    return [];
  }
}

/**
 * Detect AMD GPUs via rocm-smi.
 */
export function detectAmdGpus(): DetectedGpu[] {
  try {
    const raw = execSync("rocm-smi --showproductname --showmeminfo vram --csv", {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    if (!raw) return [];

    // Parse CSV output — header line + data lines
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length < 2) return [];

    // rocm-smi CSV: device, Card series, Card model, Card vendor, ...
    const gpus: DetectedGpu[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map((s) => s.trim());
      gpus.push({
        vendor: "amd" as const,
        model: parts[1] || parts[2] || "Unknown AMD GPU",
        vram_mb: Math.round(Number(parts[4]) / (1024 * 1024)) || 0,
        driver_version: "rocm",
      });
    }
    return gpus;
  } catch {
    return [];
  }
}

/**
 * Detect Apple GPUs via system_profiler SPDisplaysDataType.
 */
export function detectAppleGpus(): DetectedGpu[] {
  try {
    const raw = execSync("system_profiler SPDisplaysDataType", {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    if (!raw) return [];

    const gpus: DetectedGpu[] = [];
    const chipsetMatches = raw.match(/Chipset Model:\s*(.+)/g) ?? [];
    const vramMatches = raw.match(/VRAM.*?:\s*(\d+)\s*(MB|GB)/gi) ?? [];

    for (let i = 0; i < chipsetMatches.length; i++) {
      const model = chipsetMatches[i].replace(/Chipset Model:\s*/, "").trim();
      let vram_mb = 0;
      if (i < vramMatches.length) {
        const m = vramMatches[i].match(/(\d+)\s*(MB|GB)/i);
        if (m) {
          vram_mb = Number(m[1]) * (m[2].toUpperCase() === "GB" ? 1024 : 1);
        }
      }
      gpus.push({
        vendor: "apple" as const,
        model,
        vram_mb,
        driver_version: "macOS",
      });
    }
    return gpus;
  } catch {
    return [];
  }
}

/**
 * Detect all available GPU hardware across vendors.
 */
export function detectAllGpus(): HardwareDetectionResult {
  const nvidia = detectNvidiaGpus();
  const amd = detectAmdGpus();
  const apple = detectAppleGpus();
  const gpus = [...nvidia, ...amd, ...apple];
  return { gpus, detected: gpus.length > 0 };
}

export type DetectHardwareOptions = {
  json?: boolean;
};

export async function runDetectHardware(opts: DetectHardwareOptions): Promise<void> {
  const result = detectAllGpus();

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (!result.detected) {
    console.log("No GPU hardware detected.");
    console.log("  Checked: nvidia-smi, rocm-smi, system_profiler SPDisplaysDataType");
    console.log('  You can still register as a provider with manual --vram and --price flags.');
    return;
  }

  console.log(`Detected GPU Hardware\n`);

  const headers = ["Vendor", "Model", "VRAM", "Driver"];
  const rows = result.gpus.map((g) => [
    g.vendor.toUpperCase(),
    g.model,
    g.vram_mb >= 1024 ? `${(g.vram_mb / 1024).toFixed(0)} GB` : `${g.vram_mb} MB`,
    g.driver_version,
  ]);

  console.log(table(headers, rows));
  console.log();
}

// ---------------------------------------------------------------------------
// Chain / Docker / balance checks (used by setup wizard)
// ---------------------------------------------------------------------------

export type ChainConnectivityResult = {
  ok: boolean;
  nodeInfo?: { network?: string; moniker?: string; version?: string };
  error?: string;
};

export async function checkChainConnectivity(restUrl: string): Promise<ChainConnectivityResult> {
  try {
    const url = `${restUrl.replace(/\/+$/, "")}/cosmos/base/tendermint/v1beta1/node_info`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      default_node_info?: { network?: string; moniker?: string; version?: string };
    };
    const info = data.default_node_info;
    return {
      ok: true,
      nodeInfo: {
        network: info?.network,
        moniker: info?.moniker,
        version: info?.version,
      },
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export type BalanceCheckResult = {
  ok: boolean;
  balanceUclaw: string;
  sufficient: boolean;
  error?: string;
};

export async function checkAccountBalance(
  restUrl: string,
  address: string,
  denom: string,
): Promise<BalanceCheckResult> {
  try {
    const url = `${restUrl.replace(/\/+$/, "")}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      return { ok: false, balanceUclaw: "0", sufficient: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      balances?: Array<{ denom?: string; amount?: string }>;
    };
    const balances = data.balances ?? [];
    const entry = balances.find((b) => b.denom === denom);
    const amount = entry?.amount ?? "0";
    const sufficient = BigInt(amount) >= 1_000_000n; // 1 CLAW = 1_000_000 uclaw
    return { ok: true, balanceUclaw: amount, sufficient };
  } catch (err) {
    return { ok: false, balanceUclaw: "0", sufficient: false, error: String(err) };
  }
}

export type DockerCheckResult = {
  ok: boolean;
  version?: string;
  error?: string;
};

export function checkDockerAvailability(): DockerCheckResult {
  try {
    const version = execSync("docker info --format '{{.ServerVersion}}'", {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim().replace(/^'|'$/g, "");
    return { ok: true, version };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Config generation
// ---------------------------------------------------------------------------

export type SetupConfigValues = {
  restUrl: string;
  rpcUrl: string;
  chainId: string;
  denom: string;
  providerName: string;
  providerAddress: string;
  gpus: DetectedGpu[];
  dockerEnabled: boolean;
};

export function generateConfigToml(values: SetupConfigValues): string {
  const gpuList = values.gpus
    .map((g) => `${g.model} (${g.vram_mb >= 1024 ? `${(g.vram_mb / 1024).toFixed(0)} GB` : `${g.vram_mb} MB`})`)
    .join(", ") || "none detected";

  return `# ClawChain GPU Provider Configuration
# Generated by clawd gpu-provider setup on ${new Date().toISOString()}

[chain]
# REST API endpoint for the chain node
rest_url = "${values.restUrl}"
# RPC endpoint for CometBFT (used for WebSocket events and tx broadcast)
rpc_url = "${values.rpcUrl}"
# Chain ID
chain_id = "${values.chainId}"
# Token denomination
denom = "${values.denom}"

[provider]
# Provider display name
name = "${values.providerName}"
# Bech32 provider address (must match the mnemonic)
address = "${values.providerAddress}"
# BIP39 mnemonic for signing transactions (KEEP SECRET)
# Alternatively set via MNEMONIC environment variable
mnemonic = ""
# On-chain resource ID (obtained after listing your GPU resource)
resource_id = 0
# Detected GPUs: ${gpuList}

[jobs]
# Maximum number of concurrent jobs
max_concurrent = 2
# Enable Docker job execution
docker_enabled = ${values.dockerEnabled}
# Working directory for temporary job files
work_dir = "/tmp/claw-gpu-jobs"
# Job execution timeout in seconds (0 = no timeout)
job_timeout_sec = 3600

[events]
# Use WebSocket events for real-time job dispatch (recommended)
websocket_enabled = true
# Fallback to HTTP polling when WebSocket disconnects
poll_fallback = true
# HTTP polling interval in seconds (only used when WebSocket is unavailable)
poll_interval_sec = 15
# WebSocket reconnect delay in seconds
ws_reconnect_sec = 5

[heartbeat]
# Interval between heartbeat/metric reports in seconds
interval_sec = 60

[metrics]
# Port for the Prometheus metrics and health endpoints
port = 9090

[dantegpu]
# Enable DanteGPU integration for advanced job orchestration
enabled = false
# DanteGPU API gateway endpoint
api_url = "http://localhost:8080"
# DanteGPU API key (obtain from provider registration)
api_key = ""
# Use DanteGPU for job output storage (MinIO/S3)
use_remote_storage = false
# Storage endpoint for large job outputs
storage_url = "http://localhost:9000"
`;
}

// ---------------------------------------------------------------------------
// clawd gpu-provider setup — interactive 6-step wizard
// ---------------------------------------------------------------------------

export type GpuSetupOptions = {
  skipChecks?: boolean;
  output?: string;
  name?: string;
  restUrl?: string;
  rpcUrl?: string;
};

export type SetupStepResult = {
  step: number;
  title: string;
  ok: boolean;
  detail: string;
};

export async function runGpuProviderSetup(opts: GpuSetupOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const restUrl = opts.restUrl ?? cfg.restUrl ?? deriveRestFromRpc(cfg.rpcUrl ?? "http://localhost:26657");
  const rpcUrl = opts.rpcUrl ?? cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const chainId = cfg.chainId ?? "clawchain-1";

  const results: SetupStepResult[] = [];

  console.log("==========================================================");
  console.log("  ClawChain GPU Provider — Setup Wizard");
  console.log("==========================================================");
  console.log();

  // --- Step 1: Detect GPU hardware ---
  console.log("[1/6] Detecting GPU hardware...");
  const hwResult = detectAllGpus();

  if (hwResult.detected) {
    console.log(`  Found ${hwResult.gpus.length} GPU(s):`);
    for (const g of hwResult.gpus) {
      const vram = g.vram_mb >= 1024 ? `${(g.vram_mb / 1024).toFixed(0)} GB` : `${g.vram_mb} MB`;
      console.log(`    - ${g.model} (${vram}, driver: ${g.driver_version})`);
    }
    results.push({ step: 1, title: "GPU Detection", ok: true, detail: `${hwResult.gpus.length} GPU(s) found` });
  } else {
    console.log("  No GPU hardware detected.");
    console.log("  You can still register as a provider with manual configuration.");
    results.push({ step: 1, title: "GPU Detection", ok: false, detail: "No GPUs detected" });
  }
  console.log();

  // --- Step 2: Chain connectivity ---
  if (!opts.skipChecks) {
    console.log("[2/6] Checking chain connectivity...");
    const chainResult = await checkChainConnectivity(restUrl);

    if (chainResult.ok) {
      console.log(`  Connected to chain node.`);
      if (chainResult.nodeInfo?.network) {
        console.log(`    Network:  ${chainResult.nodeInfo.network}`);
      }
      if (chainResult.nodeInfo?.moniker) {
        console.log(`    Moniker:  ${chainResult.nodeInfo.moniker}`);
      }
      if (chainResult.nodeInfo?.version) {
        console.log(`    Version:  ${chainResult.nodeInfo.version}`);
      }
      results.push({ step: 2, title: "Chain Connectivity", ok: true, detail: `connected (${chainResult.nodeInfo?.network ?? "unknown"})` });
    } else {
      console.log(`  Warning: Could not connect to chain at ${restUrl}`);
      console.log(`  Error: ${chainResult.error}`);
      console.log("  Make sure the chain node is running, or use --skip-checks to continue.");
      results.push({ step: 2, title: "Chain Connectivity", ok: false, detail: chainResult.error ?? "connection failed" });
    }
    console.log();

    // --- Step 3: Account balance ---
    console.log("[3/6] Checking account balance...");
    let address = "";
    if (mnemonicFileExists()) {
      const mnemonic = loadMnemonic();
      if (mnemonic) {
        try {
          const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
          const [account] = await wallet.getAccounts();
          if (account) {
            address = account.address;
          }
        } catch {
          // Wallet derivation may fail in some environments; non-fatal
        }
      }
    }

    if (address) {
      const balResult = await checkAccountBalance(restUrl, address, denom);
      if (balResult.ok) {
        console.log(`  Address: ${address}`);
        console.log(`  Balance: ${formatClaw(balResult.balanceUclaw)}`);
        if (!balResult.sufficient) {
          console.log("  Warning: Balance is below 1 CLAW. Fund your account before registering.");
        }
        results.push({
          step: 3,
          title: "Account Balance",
          ok: balResult.sufficient,
          detail: `${formatClaw(balResult.balanceUclaw)}${balResult.sufficient ? "" : " (insufficient)"}`,
        });
      } else {
        console.log(`  Warning: Could not check balance: ${balResult.error}`);
        results.push({ step: 3, title: "Account Balance", ok: false, detail: balResult.error ?? "query failed" });
      }
    } else {
      console.log('  No wallet found. Run "clawd init" to create one.');
      results.push({ step: 3, title: "Account Balance", ok: false, detail: "no wallet found" });
    }
    console.log();
  } else {
    console.log("[2/6] Chain connectivity check — skipped (--skip-checks)");
    results.push({ step: 2, title: "Chain Connectivity", ok: true, detail: "skipped" });
    console.log();
    console.log("[3/6] Account balance check — skipped (--skip-checks)");
    results.push({ step: 3, title: "Account Balance", ok: true, detail: "skipped" });
    console.log();
  }

  // --- Step 4: Docker availability ---
  console.log("[4/6] Checking Docker availability...");
  const dockerResult = checkDockerAvailability();

  if (dockerResult.ok) {
    console.log(`  Docker is available (version ${dockerResult.version}).`);
    results.push({ step: 4, title: "Docker", ok: true, detail: `version ${dockerResult.version}` });
  } else {
    console.log("  Warning: Docker is not available.");
    console.log("  Docker is required for executing compute jobs.");
    results.push({ step: 4, title: "Docker", ok: false, detail: "not available" });
  }
  console.log();

  // --- Step 5: Generate config.toml ---
  console.log("[5/6] Generating configuration...");

  let providerAddress = "";
  if (mnemonicFileExists()) {
    const mnemonic = loadMnemonic();
    if (mnemonic) {
      try {
        const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
        const [account] = await wallet.getAccounts();
        if (account) providerAddress = account.address;
      } catch {
        // non-fatal
      }
    }
  }

  const configValues: SetupConfigValues = {
    restUrl,
    rpcUrl,
    chainId,
    denom,
    providerName: opts.name ?? "my-gpu-provider",
    providerAddress,
    gpus: hwResult.gpus,
    dockerEnabled: dockerResult.ok,
  };

  const configContent = generateConfigToml(configValues);
  const configPath = opts.output ?? "config.toml";

  try {
    writeFileSync(configPath, configContent, { mode: 0o600 });
    console.log(`  Configuration written to ${configPath}`);
    results.push({ step: 5, title: "Config Generation", ok: true, detail: configPath });
  } catch (err) {
    console.log(`  Error writing config: ${String(err)}`);
    results.push({ step: 5, title: "Config Generation", ok: false, detail: String(err) });
  }
  console.log();

  // --- Step 6: Registration summary ---
  console.log("[6/6] Registration summary");
  console.log();

  const passCount = results.filter((r) => r.ok).length;
  const totalCount = results.length;

  for (const r of results) {
    const icon = r.ok ? "[OK]" : "[!!]";
    console.log(`  ${icon} Step ${r.step}: ${r.title} — ${r.detail}`);
  }
  console.log();
  console.log(`  Result: ${passCount}/${totalCount} checks passed.`);

  if (passCount === totalCount) {
    console.log();
    console.log("  Your provider is ready! Next steps:");
    console.log('    1. Review and adjust config.toml');
    console.log('    2. Run "clawd gpu-provider register --vram <gb> --price <uclaw>" to register on-chain');
    console.log('    3. Start the provider daemon: ./claw-gpu-provider');
  } else {
    console.log();
    console.log("  Some checks did not pass. Review the warnings above before registering.");
  }

  console.log();
  console.log("==========================================================");
}
