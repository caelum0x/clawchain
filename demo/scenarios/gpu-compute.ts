#!/usr/bin/env npx tsx

/**
 * ClawChain Demo Scenario: GPU Compute Marketplace
 *
 * Demonstrates the decentralized GPU compute marketplace:
 *   list resource -> lease GPU -> submit job -> get results
 *
 * Requires ALICE_MNEMONIC (provider) and BOB_MNEMONIC (consumer) for TX mode.
 * Falls back to query-only mode otherwise.
 */

import { ClawChainClient } from "../../sdk/src/client.js";

const RPC = process.env.RPC_URL || "http://localhost:26657";
const ALICE_MNEMONIC = process.env.ALICE_MNEMONIC || "";
const BOB_MNEMONIC = process.env.BOB_MNEMONIC || "";

const TX_MODE = !!(ALICE_MNEMONIC && BOB_MNEMONIC);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function step(title: string): void {
  console.log(`\n--- ${title} ---\n`);
}

function formatClaw(uclaw: string | number): string {
  const n = typeof uclaw === "string" ? parseInt(uclaw, 10) : uclaw;
  if (isNaN(n)) return `${uclaw} uclaw`;
  return `${(n / 1_000_000).toFixed(6)} CLAW`;
}

async function main(): Promise<void> {
  console.log("\n  GPU Compute Marketplace Demo\n");
  console.log(`  Mode: ${TX_MODE ? "TRANSACTION (wallets provided)" : "QUERY-ONLY (no mnemonics)"}`);

  const reader = new ClawChainClient({ rpcUrl: RPC });
  await reader.connect();

  let alice: ClawChainClient | null = null;
  let bob: ClawChainClient | null = null;

  if (TX_MODE) {
    alice = new ClawChainClient({ rpcUrl: RPC, mnemonic: ALICE_MNEMONIC });
    bob = new ClawChainClient({ rpcUrl: RPC, mnemonic: BOB_MNEMONIC });
    await alice.connect();
    await bob.connect();
    console.log(`  Alice (GPU Provider): ${alice.getAddress()}`);
    console.log(`  Bob   (Consumer)    : ${bob.getAddress()}`);
  }

  // -------------------------------------------------------------------------
  step("1. List GPU Compute Resource");
  // -------------------------------------------------------------------------

  if (TX_MODE && alice) {
    try {
      const tx = await alice.listComputeResource({
        name: "NVIDIA A100 Cluster",
        description: "8x A100 80GB GPU cluster for AI training and inference",
        gpuModel: "NVIDIA A100",
        gpuCount: 8,
        vramGb: 640, // 8x 80GB
        cpuCores: 128,
        ramGb: 1024,
        storageGb: 10000,
        pricePerHourUclaw: "50000000", // 50 CLAW/hr
        minLeaseHours: 1,
        maxLeaseHours: 720, // 30 days
        region: "us-west-2",
        endpoint: "https://gpu.example.com:8443",
        tags: ["a100", "training", "inference", "high-memory"],
      });
      console.log(`  ListComputeResource TX: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      console.log(`  ListComputeResource: ${(e as Error).message}`);
    }
    await sleep(3000);
  } else {
    console.log("  Would send MsgListComputeResource with:");
    console.log("    name             : NVIDIA A100 Cluster");
    console.log("    gpuModel         : NVIDIA A100");
    console.log("    gpuCount         : 8");
    console.log("    vramGb           : 640 (8x 80GB)");
    console.log("    pricePerHourUclaw: 50000000 (50 CLAW/hr)");
    console.log("    region           : us-west-2");
  }

  // -------------------------------------------------------------------------
  step("2. Browse Available GPU Resources");
  // -------------------------------------------------------------------------

  try {
    const resources = await reader.getComputeResources();
    console.log(`  Total GPU resources: ${resources.resources?.length ?? 0}`);
    for (const r of (resources.resources ?? []).slice(0, 5)) {
      const status = r.active ? (r.currentLessee ? "LEASED" : "AVAILABLE") : "INACTIVE";
      console.log(`  [#${r.id}] ${r.name}`);
      console.log(`    GPU      : ${r.gpuModel} x${r.gpuCount} (${r.vramGb}GB VRAM)`);
      console.log(`    CPU/RAM  : ${r.cpuCores} cores / ${r.ramGb}GB RAM`);
      console.log(`    Storage  : ${r.storageGb}GB`);
      console.log(`    Price    : ${formatClaw(r.pricePerHourUclaw)}/hr`);
      console.log(`    Region   : ${r.region || "unspecified"}`);
      console.log(`    Status   : ${status}`);
      console.log(`    Leases   : ${r.totalLeases} total, revenue: ${formatClaw(r.totalRevenue)}`);
      console.log("");
    }
  } catch {
    console.log("  No GPU resources listed yet");
  }

  // Query only available resources
  try {
    const available = await reader.getComputeResources(true);
    console.log(`  Available (unleased) resources: ${available.resources?.length ?? 0}`);
  } catch {
    // Expected if none available
  }

  // -------------------------------------------------------------------------
  step("3. Lease GPU Resource");
  // -------------------------------------------------------------------------

  let leaseResourceId: number | undefined;

  if (TX_MODE && bob) {
    try {
      const resources = await reader.getComputeResources(true);
      const target = (resources.resources ?? [])[0];

      if (target) {
        leaseResourceId = target.id;
        console.log(`  Leasing resource #${target.id}: "${target.name}"`);
        console.log(`  Duration: 4 hours`);
        console.log(`  Total cost: ${formatClaw(parseInt(target.pricePerHourUclaw, 10) * 4)}`);

        const tx = await bob.leaseComputeResource(target.id, 4);
        console.log(`  LeaseComputeResource TX: ${tx.transactionHash} (code=${tx.code})`);
      } else {
        console.log("  No available resources to lease");
      }
    } catch (e: unknown) {
      console.log(`  LeaseComputeResource: ${(e as Error).message}`);
    }
    await sleep(3000);
  } else {
    console.log("  Lease flow:");
    console.log("    1. Consumer selects a GPU resource");
    console.log("    2. Consumer specifies lease duration (hours)");
    console.log("    3. Payment is escrowed for the lease period");
    console.log("    4. Consumer gets exclusive access to the GPU");
    console.log("    5. Provider endpoint becomes available for job submission");
  }

  // Query leases
  if (TX_MODE && bob) {
    try {
      const leases = await reader.getComputeLeases(bob.getAddress());
      console.log(`  Bob's active leases: ${leases.leases?.length ?? 0}`);
      for (const l of (leases.leases ?? []).slice(0, 3)) {
        console.log(`    Lease #${l.id}: resource=#${l.resourceId}, status=${l.status}, cost=${formatClaw(l.totalCostUclaw)}`);
      }
    } catch {
      console.log("  Lease query failed");
    }
  }

  // -------------------------------------------------------------------------
  step("4. Submit Compute Job");
  // -------------------------------------------------------------------------

  if (TX_MODE && bob && leaseResourceId !== undefined) {
    try {
      const leases = await reader.getComputeLeases(bob.getAddress());
      const activeLease = (leases.leases ?? []).find(
        (l) => l.resourceId === leaseResourceId && l.status !== "expired",
      );

      if (activeLease) {
        const result = await bob.submitComputeJob(leaseResourceId, activeLease.id, {
          name: "llm-finetune-security-audit",
          jobType: "ai-training",
          executionType: "docker",
          dockerImage: "clawchain/training:latest",
          inputDataUri: "ipfs://QmTrainingDataset",
          outputDataUri: "ipfs://QmOutputBucket",
          params: JSON.stringify({
            model: "llama-3.1-8b",
            epochs: 3,
            batchSize: 32,
            learningRate: 2e-5,
            taskType: "security-audit-finetune",
          }),
        });
        console.log(`  SubmitComputeJob TX: ${result.txHash}`);
        if (result.jobId !== undefined) {
          console.log(`  Job ID: ${result.jobId}`);
        }
      } else {
        console.log("  No active lease found for job submission");
      }
    } catch (e: unknown) {
      console.log(`  SubmitComputeJob: ${(e as Error).message}`);
    }
    await sleep(2000);
  } else {
    console.log("  Job submission flow:");
    console.log("    1. Consumer submits a job to a leased resource");
    console.log("    2. Job types: ai-training, inference, rendering, general");
    console.log("    3. Execution: Docker container or inline script");
    console.log("    4. Input/output via IPFS or other storage URIs");
    console.log("    5. Provider runs the job and reports status");
    console.log("");
    console.log("  await client.submitComputeJob(resourceId, leaseId, {");
    console.log('    name: "llm-finetune",');
    console.log('    jobType: "ai-training",');
    console.log('    executionType: "docker",');
    console.log('    dockerImage: "clawchain/training:latest",');
    console.log('    inputDataUri: "ipfs://QmTrainingData",');
    console.log("  });");
  }

  // Query jobs
  if (TX_MODE && bob) {
    try {
      const jobs = await reader.getComputeJobs(bob.getAddress());
      console.log(`  Bob's compute jobs: ${jobs.jobs?.length ?? 0}`);
      for (const j of (jobs.jobs ?? []).slice(0, 3)) {
        console.log(`    Job #${j.id}: "${j.name}" [${j.status}] type=${j.jobType}`);
      }
    } catch {
      console.log("  Jobs query not available");
    }
  }

  // -------------------------------------------------------------------------
  step("5. GPU Metrics & Provider Stats");
  // -------------------------------------------------------------------------

  if (TX_MODE && alice) {
    // Report GPU metrics
    try {
      const tx = await alice.updateGPUMetrics(leaseResourceId ?? 1, {
        utilizationGpu: 85,
        utilizationMem: 72,
        temperature: 68,
        powerDrawWatts: 350,
        memoryUsedMb: 57344, // 56GB of 80GB
        memoryTotalMb: 81920, // 80GB
        isHealthy: true,
        updatedAt: Math.floor(Date.now() / 1000),
      });
      console.log(`  UpdateGPUMetrics TX: ${tx.transactionHash}`);
    } catch (e: unknown) {
      console.log(`  UpdateGPUMetrics: ${(e as Error).message}`);
    }

    // Provider stats
    try {
      const stats = await reader.getProviderStats(alice.getAddress());
      console.log(`  Provider stats for Alice:`);
      console.log(`    Total resources : ${stats.stats.totalResources}`);
      console.log(`    Active leases   : ${stats.stats.activeLeases}`);
      console.log(`    Total jobs      : ${stats.stats.totalJobs}`);
      console.log(`    Completed jobs  : ${stats.stats.completedJobs}`);
      console.log(`    Failed jobs     : ${stats.stats.failedJobs}`);
      console.log(`    Total revenue   : ${formatClaw(stats.stats.totalRevenue)}`);
      console.log(`    Avg rating      : ${stats.stats.avgRating / 100}/5`);
    } catch {
      console.log("  Provider stats not available");
    }
  } else {
    console.log("  GPU metrics (reported by provider):");
    console.log("    - GPU utilization: 0-100%");
    console.log("    - Memory utilization: 0-100%");
    console.log("    - Temperature (Celsius)");
    console.log("    - Power draw (Watts)");
    console.log("    - Health status");
    console.log("");
    console.log("  Provider stats aggregate:");
    console.log("    - Total resources listed");
    console.log("    - Active leases");
    console.log("    - Job completion rate");
    console.log("    - Total revenue earned");
    console.log("    - Average consumer rating");
  }

  // -------------------------------------------------------------------------
  step("6. Release GPU Resource");
  // -------------------------------------------------------------------------

  console.log("  When a lease expires or is released early:");
  console.log("    1. Consumer calls MsgReleaseComputeResource");
  console.log("    2. Remaining escrowed funds are calculated");
  console.log("    3. Used portion goes to provider");
  console.log("    4. Unused portion refunded to consumer");
  console.log("    5. GPU resource becomes available for new leases");

  // -------------------------------------------------------------------------
  step("Complete");
  // -------------------------------------------------------------------------

  console.log("  GPU Compute Marketplace features demonstrated:");
  console.log("    1. Resource listing (GPU specs, pricing, region)");
  console.log("    2. Resource browsing and filtering");
  console.log("    3. GPU leasing with escrowed payment");
  console.log("    4. Compute job submission (Docker/script)");
  console.log("    5. Real-time GPU metrics reporting");
  console.log("    6. Provider stats and reputation");
  console.log("    7. Lease lifecycle management");
  console.log("");
  console.log("  Supported GPU types:");
  console.log("    - NVIDIA A100 (80GB) -- AI training");
  console.log("    - NVIDIA H100 (80GB) -- Large model training");
  console.log("    - NVIDIA L40S (48GB) -- Inference");
  console.log("    - NVIDIA RTX 4090 (24GB) -- Budget training");
  console.log("");

  await reader.disconnect();
  if (alice) await alice.disconnect();
  if (bob) await bob.disconnect();
}

main().catch((err) => {
  console.error("\n  [FATAL]", err);
  process.exit(1);
});
