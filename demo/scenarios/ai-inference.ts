#!/usr/bin/env npx tsx

/**
 * ClawChain Demo Scenario: AI Inference Pipeline
 *
 * Demonstrates the full on-chain AI inference lifecycle:
 *
 *   1.  Initialize wallets (alice=model-owner, bob=requester)
 *   2.  Fund wallets via faucet
 *   3.  Register AI model on-chain
 *   4.  Set inference pricing
 *   5.  Register inference provider
 *   6.  Submit inference job with payment
 *   7.  Query job status
 *   8.  Rate model
 *   9.  Query model stats
 *  10.  Purchase model access (one-time)
 *
 * Requires ALICE_MNEMONIC and BOB_MNEMONIC environment variables for TX mode.
 *
 * Usage:
 *   ALICE_MNEMONIC="..." BOB_MNEMONIC="..." npx tsx scenarios/ai-inference.ts
 *
 * Programmatic usage:
 *   import { runAIInference } from "./scenarios/ai-inference.js";
 *   await runAIInference({ rpcUrl, restUrl });
 */

import { ClawChainClient } from "../../sdk/src/client.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_RPC = "http://localhost:26657";
const DEFAULT_REST = "http://localhost:1317";
const DEFAULT_FAUCET = "http://localhost:8000";

const STEP_DELAY_MS = 500;
const TOTAL_STEPS = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let stepNumber = 0;

function banner(title: string): void {
  stepNumber++;
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  Step ${stepNumber}/${TOTAL_STEPS}: ${title}`);
  console.log(`${line}\n`);
}

function info(msg: string): void {
  console.log(`  [info] ${msg}`);
}

function ok(msg: string): void {
  console.log(`  [ok]   ${msg}`);
}

function warn(msg: string): void {
  console.log(`  [warn] ${msg}`);
}

function fail(msg: string): void {
  console.log(`  [FAIL] ${msg}`);
}

// ---------------------------------------------------------------------------
// Main scenario
// ---------------------------------------------------------------------------

interface RunOptions {
  rpcUrl?: string;
  restUrl?: string;
  faucetUrl?: string;
  aliceMnemonic?: string;
  bobMnemonic?: string;
}

export async function runAIInference(opts: RunOptions = {}): Promise<void> {
  const rpcUrl = opts.rpcUrl || process.env.RPC_URL || DEFAULT_RPC;
  const restUrl = opts.restUrl || process.env.REST_URL || DEFAULT_REST;
  const faucetUrl = opts.faucetUrl || process.env.FAUCET_URL || DEFAULT_FAUCET;
  const aliceMnemonic = opts.aliceMnemonic || process.env.ALICE_MNEMONIC || "";
  const bobMnemonic = opts.bobMnemonic || process.env.BOB_MNEMONIC || "";

  const txMode = !!(aliceMnemonic && bobMnemonic);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║        ClawChain AI Inference Pipeline Demo             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  RPC:     ${rpcUrl}`);
  console.log(`  REST:    ${restUrl}`);
  console.log(`  Mode:    ${txMode ? "Full TX (signing)" : "Query-only (read)"}`);

  const client = new ClawChainClient({
    rpcUrl,
    restUrl,
    chainId: process.env.CHAIN_ID || "clawchain-testnet-1",
  });

  // ── Step 1: Initialize Wallets ──────────────────────────────────

  banner("Initialize Wallets");

  let aliceAddr = "";
  let bobAddr = "";

  if (txMode) {
    await client.connectWithMnemonic(aliceMnemonic);
    aliceAddr = client.getAddress();
    ok(`Alice (model owner): ${aliceAddr}`);

    // We'll need a second client for Bob
    const bobClient = new ClawChainClient({
      rpcUrl,
      restUrl,
      chainId: process.env.CHAIN_ID || "clawchain-testnet-1",
    });
    await bobClient.connectWithMnemonic(bobMnemonic);
    bobAddr = bobClient.getAddress();
    ok(`Bob (requester):     ${bobAddr}`);
  } else {
    info("No mnemonics provided — running in query-only mode.");
    info("Set ALICE_MNEMONIC and BOB_MNEMONIC for full TX mode.");
    aliceAddr = "claw1demo_alice_query_mode";
    bobAddr = "claw1demo_bob_query_mode";
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 2: Fund Wallets ────────────────────────────────────────

  banner("Fund Wallets via Faucet");

  if (txMode) {
    for (const [name, addr] of [["Alice", aliceAddr], ["Bob", bobAddr]]) {
      try {
        const res = await fetch(`${faucetUrl}/credit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, coins: ["100000000uclaw"] }),
        });
        if (res.ok) {
          ok(`Funded ${name}: 100 CLAW`);
        } else {
          warn(`Faucet returned ${res.status} for ${name} — may already be funded`);
        }
      } catch {
        warn(`Faucet unavailable for ${name} — continuing with existing balance`);
      }
    }
  } else {
    info("Query mode — skipping faucet funding.");
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 3: Register AI Model ───────────────────────────────────

  banner("Register AI Model On-Chain");

  let modelId: number | undefined;

  if (txMode) {
    try {
      const result = await client.registerModel({
        name: "ClawGPT-Demo",
        description: "Demo language model for ClawChain inference pipeline",
        framework: "pytorch",
        architecture: "transformer",
        parameterCount: "7B",
        license: "apache-2.0",
        tags: ["llm", "text-generation", "demo"],
        storageType: "ipfs",
        storageUri: "ipfs://QmDemoModelHash123",
        accessType: "per_query",
        pricePerQueryUclaw: "50000",
      });
      modelId = result.modelId;
      ok(`Model registered! TX: ${result.txHash.slice(0, 16)}... | ID: ${modelId}`);
    } catch (err: any) {
      fail(`Register model failed: ${err.message}`);
    }
  } else {
    info("Querying existing models...");
    try {
      const models = await client.getModels();
      if (models.length > 0) {
        const m = models[0];
        modelId = Number(m.id);
        ok(`Found model: ${m.name} (ID: ${m.id}) — ${m.framework}`);
      } else {
        info("No models registered on chain yet.");
      }
    } catch {
      warn("Could not query models — chain may be offline.");
    }
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 4: Set Inference Pricing ───────────────────────────────

  banner("Set Inference Pricing");

  if (txMode && modelId) {
    try {
      const result = await client.setInferencePricing({
        modelId,
        pricePerToken: "100",
        pricePerQuery: "50000",
        minPayment: "10000",
        maxTokens: 4096,
      });
      ok(`Pricing set! TX: ${result.txHash.slice(0, 16)}...`);
      info(`  Per token: 100 uclaw | Per query: 50000 uclaw | Max tokens: 4096`);
    } catch (err: any) {
      fail(`Set pricing failed: ${err.message}`);
    }
  } else {
    if (modelId) {
      try {
        const pricing = await client.getInferencePricing(modelId);
        if (pricing) {
          ok(`Current pricing for model ${modelId}:`);
          info(`  Per token: ${pricing.pricePerToken} uclaw`);
          info(`  Per query: ${pricing.pricePerQuery} uclaw`);
          info(`  Max tokens: ${pricing.maxTokens}`);
        } else {
          info("No pricing set for this model.");
        }
      } catch {
        info("Could not query pricing.");
      }
    } else {
      info("No model available — skipping pricing query.");
    }
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 5: Register Inference Provider ─────────────────────────

  banner("Register Inference Provider");

  if (txMode && modelId) {
    try {
      const result = await client.registerInferenceProvider({
        modelIds: [modelId],
        endpoint: "http://localhost:8090",
        maxConcurrent: 10,
      });
      ok(`Provider registered! TX: ${result.txHash.slice(0, 16)}...`);
      info(`  Serving model ${modelId} | Capacity: 10 concurrent`);
    } catch (err: any) {
      fail(`Register provider failed: ${err.message}`);
    }
  } else {
    info("Querying existing inference providers...");
    try {
      const providers = await client.getInferenceProviders();
      ok(`Found ${providers.length} inference provider(s)`);
      for (const p of providers.slice(0, 3)) {
        info(`  ${p.address} — models: [${p.modelIds.join(",")}] — ${p.isOnline ? "ONLINE" : "offline"}`);
      }
    } catch {
      warn("Could not query providers.");
    }
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 6: Submit Inference Job ────────────────────────────────

  banner("Submit Inference Job");

  let jobId: number | undefined;

  if (txMode && modelId) {
    // Switch to Bob's client for submission
    const bobClient = new ClawChainClient({
      rpcUrl,
      restUrl,
      chainId: process.env.CHAIN_ID || "clawchain-testnet-1",
    });
    await bobClient.connectWithMnemonic(bobMnemonic);

    try {
      const result = await bobClient.submitInferenceJob({
        modelId,
        input: "Explain how ClawChain enables decentralized AI computation in two sentences.",
        maxTokens: 256,
        payment: "500000",
      });
      jobId = result.jobId;
      ok(`Inference job submitted! TX: ${result.txHash.slice(0, 16)}... | Job ID: ${jobId}`);
    } catch (err: any) {
      fail(`Submit job failed: ${err.message}`);
    }
  } else {
    info("Querying existing inference jobs...");
    try {
      const jobs = await client.getInferenceJobs();
      ok(`Found ${jobs.length} inference job(s)`);
      for (const j of jobs.slice(0, 3)) {
        info(`  Job #${j.jobId} — model ${j.modelId} — ${j.status} — ${j.payment} uclaw`);
        if (j.jobId) jobId = Number(j.jobId);
      }
    } catch {
      warn("Could not query jobs.");
    }
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 7: Query Job Status ────────────────────────────────────

  banner("Query Inference Job Status");

  if (jobId) {
    try {
      const job = await client.getInferenceJob(jobId);
      if (job) {
        ok(`Job #${job.jobId} status: ${job.status}`);
        info(`  Model: ${job.modelId} | Requester: ${job.requester}`);
        info(`  Max tokens: ${job.maxTokens} | Payment: ${job.payment} uclaw`);
        if (job.output) {
          info(`  Output: "${job.output.slice(0, 100)}${job.output.length > 100 ? "..." : ""}"`);
        }
        if (job.provider) {
          info(`  Provider: ${job.provider}`);
        }
      } else {
        warn(`Job #${jobId} not found.`);
      }
    } catch {
      warn("Could not query job status.");
    }
  } else {
    info("No job ID available to query.");
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 8: Rate Model ──────────────────────────────────────────

  banner("Rate AI Model");

  if (txMode && modelId) {
    const bobClient = new ClawChainClient({
      rpcUrl,
      restUrl,
      chainId: process.env.CHAIN_ID || "clawchain-testnet-1",
    });
    await bobClient.connectWithMnemonic(bobMnemonic);

    try {
      const result = await bobClient.rateModel(modelId, 5);
      ok(`Model rated 5/5! TX: ${result.txHash.slice(0, 16)}...`);
    } catch (err: any) {
      fail(`Rate model failed: ${err.message}`);
    }
  } else {
    info("Query mode — skipping model rating.");
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 9: Query Model Stats ───────────────────────────────────

  banner("Query Model Stats");

  try {
    const models = await client.getModels();
    ok(`Total models on chain: ${models.length}`);
    for (const m of models.slice(0, 5)) {
      const rating = m.rating > 0 ? `${(m.rating / 10).toFixed(1)}/5 (${m.ratingCount} reviews)` : "unrated";
      info(`  [${m.id}] ${m.name} — ${m.framework} — ${rating} — ${m.totalDownloads || 0} downloads`);
    }
  } catch {
    warn("Could not query model stats — chain may be offline.");
  }

  await sleep(STEP_DELAY_MS);

  // ── Step 10: Purchase Model Access ──────────────────────────────

  banner("Purchase Model Access (One-Time)");

  if (txMode && modelId) {
    const bobClient = new ClawChainClient({
      rpcUrl,
      restUrl,
      chainId: process.env.CHAIN_ID || "clawchain-testnet-1",
    });
    await bobClient.connectWithMnemonic(bobMnemonic);

    try {
      const result = await bobClient.purchaseModelAccess(modelId);
      ok(`Access purchased! TX: ${result.txHash.slice(0, 16)}...`);
    } catch (err: any) {
      fail(`Purchase access failed: ${err.message}`);
    }
  } else {
    info("Query mode — skipping access purchase.");
  }

  // ── Summary ─────────────────────────────────────────────────────

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                    Demo Complete!                       ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  AI Inference Pipeline Demonstrated:                    ║");
  console.log("║                                                         ║");
  console.log("║  ✓ Model registration on-chain                         ║");
  console.log("║  ✓ Inference pricing configuration                     ║");
  console.log("║  ✓ Provider registration                               ║");
  console.log("║  ✓ Job submission with CLAW payment                    ║");
  console.log("║  ✓ Job status tracking                                 ║");
  console.log("║  ✓ Model rating                                        ║");
  console.log("║  ✓ Model stats & discovery                             ║");
  console.log("║  ✓ Access purchase                                     ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1]?.endsWith("ai-inference.ts") || process.argv[1]?.endsWith("ai-inference.js")) {
  runAIInference().catch((err) => {
    console.error("\n  [FATAL]", err.message || err);
    process.exit(1);
  });
}
