/**
 * `clawd gpu` subcommands — list, lease, submit-job, providers for GPU compute marketplace.
 */

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

type ComputeResource = {
  id?: number;
  owner?: string;
  name?: string;
  description?: string;
  gpuModel?: string; gpu_model?: string;
  gpuCount?: number; gpu_count?: number;
  vramGb?: number; vram_gb?: number;
  pricePerHourUclaw?: string; price_per_hour_uclaw?: string;
  active?: boolean;
  currentLessee?: string; current_lessee?: string;
  region?: string;
  endpoint?: string;
};

// ---------------------------------------------------------------------------
// clawd gpu list
// ---------------------------------------------------------------------------

export type GpuListOptions = {
  available?: boolean;
  json?: boolean;
};

export async function runGpuList(opts: GpuListOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const qs = opts.available ? "?only_available=true" : "";
  const url = `${restUrl}/clawchain/compute/v1/resources${qs}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query GPU resources (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { resources?: ComputeResource[] };
    const resources = data.resources ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ resources }, null, 2) + "\n");
      return;
    }

    if (resources.length === 0) {
      console.log("No GPU resources found.");
      return;
    }

    const headers = ["ID", "Name", "GPU Model", "GPUs", "VRAM", "Price/hr", "Active", "Region"];
    const rows = resources.map((r) => [
      String(r.id ?? 0),
      String(r.name ?? ""),
      String(r.gpuModel ?? r.gpu_model ?? ""),
      String(r.gpuCount ?? r.gpu_count ?? 0),
      `${r.vramGb ?? r.vram_gb ?? 0} GB`,
      formatClaw(String(r.pricePerHourUclaw ?? r.price_per_hour_uclaw ?? "0")),
      String(r.active ?? true),
      String(r.region ?? "-"),
    ]);

    console.log(`GPU Resources (${resources.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query GPU resources: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd gpu lease
// ---------------------------------------------------------------------------

export type GpuLeaseOptions = {
  resourceId: number;
  hours: number;
};

export async function runGpuLease(opts: GpuLeaseOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Leasing GPU resource #${opts.resourceId} for ${opts.hours} hours...`);

  const msg = {
    typeUrl: "/clawchain.compute.v1.MsgLeaseComputeResource",
    value: {
      creator: account.address,
      resourceId: BigInt(opts.resourceId),
      hours: BigInt(opts.hours),
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Lease failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    // Extract lease_id from events
    let leaseId = "unknown";
    for (const event of res.events ?? []) {
      if (event.type === "lease_compute_resource") {
        const attr = event.attributes.find(
          (a: { key: string }) => a.key === "lease_id",
        );
        if (attr) {
          leaseId = typeof attr.value === "string" ? attr.value : new TextDecoder().decode(attr.value);
          break;
        }
      }
    }

    console.log(`GPU resource #${opts.resourceId} leased successfully.`);
    console.log(`  Lease ID: ${leaseId}`);
    console.log(`  Hours:    ${opts.hours}`);
    console.log(`  TxHash:   ${res.transactionHash}`);
  } catch (err) {
    console.error(`Lease failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd gpu submit-job
// ---------------------------------------------------------------------------

export type GpuSubmitJobOptions = {
  resourceId: number;
  leaseId: number;
  name: string;
  jobType?: string;
  executionType?: string;
  dockerImage?: string;
  scriptContent?: string;
  inputDataUri?: string;
  outputDataUri?: string;
  params?: string;
};

export async function runGpuSubmitJob(opts: GpuSubmitJobOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Submitting compute job "${opts.name}"...`);

  const msg = {
    typeUrl: "/clawchain.compute.v1.MsgSubmitComputeJob",
    value: {
      creator: account.address,
      resourceId: BigInt(opts.resourceId),
      leaseId: BigInt(opts.leaseId),
      name: opts.name,
      jobType: opts.jobType ?? "general",
      executionType: opts.executionType ?? "docker",
      dockerImage: opts.dockerImage ?? "",
      scriptContent: opts.scriptContent ?? "",
      inputDataUri: opts.inputDataUri ?? "",
      outputDataUri: opts.outputDataUri ?? "",
      params: opts.params ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Job submission failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    // Extract job_id from events
    let jobId = "unknown";
    for (const event of res.events ?? []) {
      if (event.type === "submit_compute_job") {
        const attr = event.attributes.find(
          (a: { key: string }) => a.key === "job_id",
        );
        if (attr) {
          jobId = typeof attr.value === "string" ? attr.value : new TextDecoder().decode(attr.value);
          break;
        }
      }
    }

    console.log(`Compute job submitted successfully.`);
    console.log(`  Job ID:      ${jobId}`);
    console.log(`  Resource ID: ${opts.resourceId}`);
    console.log(`  Lease ID:    ${opts.leaseId}`);
    console.log(`  TxHash:      ${res.transactionHash}`);
  } catch (err) {
    console.error(`Job submission failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd gpu jobs
// ---------------------------------------------------------------------------

export type GpuJobsOptions = {
  address?: string;
  resourceId?: number;
  json?: boolean;
};

export async function runGpuJobs(opts: GpuJobsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const params: string[] = [];
  if (opts.address) params.push(`address=${encodeURIComponent(opts.address)}`);
  if (opts.resourceId !== undefined) params.push(`resource_id=${opts.resourceId}`);
  const qs = params.length > 0 ? `?${params.join("&")}` : "";
  const url = `${restUrl}/clawchain/marketplace/v1/compute/jobs${qs}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query compute jobs (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { jobs?: any[] };
    const jobs = data.jobs ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ jobs }, null, 2) + "\n");
      return;
    }

    if (jobs.length === 0) {
      console.log("No compute jobs found.");
      return;
    }

    const headers = ["ID", "Status", "Type", "GPU", "Submitter", "Provider", "Result Hash"];
    const rows = jobs.map((j: any) => [
      String(j.id ?? 0),
      statusBadge(j.status ?? "unknown"),
      String(j.job_type ?? j.jobType ?? "general"),
      String(j.gpu_type ?? j.gpuType ?? "-"),
      shortAddr(j.submitter ?? ""),
      shortAddr(j.provider ?? ""),
      j.result_hash ?? j.resultHash ?? "-",
    ]);

    console.log(`Compute Jobs (${jobs.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query compute jobs: ${String(err)}`);
    process.exit(1);
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case "pending": return "[PENDING]";
    case "running": return "[RUNNING]";
    case "completed": return "[DONE]";
    case "failed": return "[FAILED]";
    default: return `[${status.toUpperCase()}]`;
  }
}

// ---------------------------------------------------------------------------
// clawd gpu status <jobId>
// ---------------------------------------------------------------------------

export type GpuStatusOptions = {
  jobId: number;
  json?: boolean;
};

export async function runGpuStatus(opts: GpuStatusOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/marketplace/v1/compute/job/${opts.jobId}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.error(`Job #${opts.jobId} not found.`);
      } else {
        console.error(`Failed to query job (HTTP ${res.status}).`);
      }
      process.exit(1);
    }

    const data = (await res.json()) as { job?: any };
    const job = data.job ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n");
      return;
    }

    console.log(`Compute Job #${opts.jobId}\n`);
    console.log(`  Status:       ${statusBadge(job.status ?? "unknown")}`);
    console.log(`  Name:         ${job.name ?? "-"}`);
    console.log(`  Job Type:     ${job.job_type ?? job.jobType ?? "-"}`);
    console.log(`  Exec Type:    ${job.execution_type ?? job.executionType ?? "-"}`);
    console.log(`  GPU Type:     ${job.gpu_type ?? job.gpuType ?? "-"}`);
    console.log(`  GPU Count:    ${job.gpu_count ?? job.gpuCount ?? "-"}`);
    console.log(`  Submitter:    ${job.submitter ?? "-"}`);
    console.log(`  Provider:     ${job.provider ?? "-"}`);
    console.log(`  Resource ID:  ${job.resource_id ?? job.resourceId ?? "-"}`);
    console.log(`  Lease ID:     ${job.lease_id ?? job.leaseId ?? "-"}`);
    console.log(`  Docker Image: ${job.docker_image ?? job.dockerImage ?? "-"}`);

    if (job.result_hash ?? job.resultHash) {
      console.log(`  Result Hash:  ${job.result_hash ?? job.resultHash}`);
    }
    if (job.error_message ?? job.errorMessage) {
      console.log(`  Error:        ${job.error_message ?? job.errorMessage}`);
    }
    if (job.submitted_at ?? job.submittedAt) {
      console.log(`  Submitted:    ${new Date(Number(job.submitted_at ?? job.submittedAt) * 1000).toISOString()}`);
    }
    if (job.completed_at ?? job.completedAt) {
      console.log(`  Completed:    ${new Date(Number(job.completed_at ?? job.completedAt) * 1000).toISOString()}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query job status: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd gpu leases
// ---------------------------------------------------------------------------

export type GpuLeasesOptions = {
  address?: string;
  json?: boolean;
};

export async function runGpuLeases(opts: GpuLeasesOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const addrPart = opts.address ? `/${encodeURIComponent(opts.address)}` : "";
  const url = `${restUrl}/clawchain/marketplace/v1/compute_leases${addrPart}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query leases (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { leases?: any[] };
    const leases = data.leases ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ leases }, null, 2) + "\n");
      return;
    }

    if (leases.length === 0) {
      console.log("No active leases found.");
      return;
    }

    const headers = ["ID", "Resource", "Lessee", "Provider", "Start", "End", "Cost", "Status"];
    const rows = leases.map((l: any) => [
      String(l.id ?? 0),
      String(l.resource_id ?? l.resourceId ?? 0),
      shortAddr(l.lessee ?? ""),
      shortAddr(l.provider ?? ""),
      String(l.start_block ?? l.startBlock ?? "-"),
      String(l.end_block ?? l.endBlock ?? "-"),
      formatClaw(String(l.total_cost ?? l.totalCost ?? "0")),
      String(l.status ?? "active"),
    ]);

    console.log(`Compute Leases (${leases.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query leases: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd gpu providers
// ---------------------------------------------------------------------------

type GpuProviderEntry = {
  address?: string;
  name?: string;
  gpu_model?: string; gpuModel?: string;
  vram_gb?: number; vramGb?: number;
  gpu_count?: number; gpuCount?: number;
  cuda_cores?: number; cudaCores?: number;
  price_per_hour_uclaw?: string; pricePerHourUclaw?: string;
  active?: boolean;
  utilization?: number;
  active_leases?: number; activeLeases?: number;
  total_jobs_completed?: number; totalJobsCompleted?: number;
  registered_at?: string; registeredAt?: string;
};

export type GpuProvidersOptions = {
  active?: boolean;
  json?: boolean;
};

export async function runGpuProviders(opts: GpuProvidersOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const qs = opts.active ? "?active=true" : "";
  const url = `${restUrl}/clawchain/marketplace/v1/gpu_providers${qs}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query GPU providers (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { providers?: GpuProviderEntry[] };
    const providers = data.providers ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ providers }, null, 2) + "\n");
      return;
    }

    if (providers.length === 0) {
      console.log("No GPU providers found.");
      return;
    }

    const headers = ["Address", "Name", "GPU Model", "VRAM", "GPUs", "Price/hr", "Active", "Jobs Done"];
    const rows = providers.map((p) => [
      shortAddr(p.address ?? ""),
      String(p.name ?? "-"),
      String(p.gpu_model ?? p.gpuModel ?? "-"),
      `${p.vram_gb ?? p.vramGb ?? 0} GB`,
      String(p.gpu_count ?? p.gpuCount ?? 0),
      formatClaw(String(p.price_per_hour_uclaw ?? p.pricePerHourUclaw ?? "0")),
      String(p.active ?? true),
      String(p.total_jobs_completed ?? p.totalJobsCompleted ?? 0),
    ]);

    console.log(`GPU Providers (${providers.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query GPU providers: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd gpu job-status <jobId>
// ---------------------------------------------------------------------------

export type GpuJobStatusOptions = {
  jobId: number;
  json?: boolean;
  watch?: boolean;
};

export async function runGpuJobStatus(opts: GpuJobStatusOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const fetchJobStatus = async () => {
    const url = `${restUrl}/clawchain/marketplace/v1/compute_job/${opts.jobId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.error(`Job #${opts.jobId} not found.`);
      } else {
        console.error(`Failed to query job (HTTP ${res.status}).`);
      }
      process.exit(1);
    }
    return (await res.json()) as { job?: Record<string, unknown> };
  };

  try {
    const data = await fetchJobStatus();
    const job = data.job ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n");
      return;
    }

    const status = String((job as Record<string, unknown>).status ?? "unknown");
    const name = String((job as Record<string, unknown>).name ?? "-");
    const jobType = String((job as Record<string, unknown>).job_type ?? (job as Record<string, unknown>).jobType ?? "-");
    const gpuType = String((job as Record<string, unknown>).gpu_type ?? (job as Record<string, unknown>).gpuType ?? "-");
    const provider = String((job as Record<string, unknown>).provider ?? "-");
    const submitter = String((job as Record<string, unknown>).submitter ?? "-");
    const resultHash = String((job as Record<string, unknown>).result_hash ?? (job as Record<string, unknown>).resultHash ?? "-");
    const errorMsg = String((job as Record<string, unknown>).error_message ?? (job as Record<string, unknown>).errorMessage ?? "");

    console.log(`GPU Job #${opts.jobId} Status\n`);
    console.log(`  Status:       ${statusBadge(status)}`);
    console.log(`  Name:         ${name}`);
    console.log(`  Job Type:     ${jobType}`);
    console.log(`  GPU Type:     ${gpuType}`);
    console.log(`  Provider:     ${provider}`);
    console.log(`  Submitter:    ${submitter}`);
    if (resultHash !== "-") {
      console.log(`  Result Hash:  ${resultHash}`);
    }
    if (errorMsg) {
      console.log(`  Error:        ${errorMsg}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query job status: ${String(err)}`);
    process.exit(1);
  }
}
