#!/usr/bin/env npx tsx

/**
 * ClawChain E2E Demo
 *
 * Demonstrates the full Install -> Run -> Earn product loop:
 *
 *  1.  Chain connectivity check
 *  2.  Register an AI agent on-chain
 *  3.  Agent heartbeat (proves liveness)
 *  4.  List a skill on the marketplace
 *  5.  Another user purchases the skill (auto-creates a task)
 *  6.  Agent accepts and completes the task
 *  7.  Query agent mining rewards
 *  8.  Shield tokens privately (ZK privacy pool)
 *  9.  Register an AI model
 * 10.  Propose a governance vote
 * 11.  Negotiate task terms between agents
 * 12.  Check reputation scores
 * 13.  Encrypted agent-to-agent messaging
 * 14.  GPU compute marketplace
 *
 * The script works in two modes:
 *   - Query-only mode (default): no wallets needed, reads chain state
 *   - Full TX mode: provide ALICE_MNEMONIC and BOB_MNEMONIC env vars
 *
 * Usage:
 *   npx tsx e2e-demo.ts
 *   ALICE_MNEMONIC="..." BOB_MNEMONIC="..." npx tsx e2e-demo.ts
 */

import { ClawChainClient } from "../sdk/src/client.js";
import type {
  AgentInfoResponse,
  SkillInfo,
  TaskInfoResponse,
  LiveAgentEntry,
  ReputationInfo,
  ModelRecord,
  ComputeResource,
  Negotiation,
} from "../sdk/src/types.js";
import { runFullLifecycle } from "./scenarios/full-lifecycle.js";
import { runAIInference } from "./scenarios/ai-inference.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RPC = process.env.RPC_URL || "http://localhost:26657";
const CHAIN_ID = process.env.CHAIN_ID || "clawchain-testnet-1";

// Optional wallet mnemonics for full TX mode
const ALICE_MNEMONIC = process.env.ALICE_MNEMONIC || "";
const BOB_MNEMONIC = process.env.BOB_MNEMONIC || "";

const TX_MODE = !!(ALICE_MNEMONIC && BOB_MNEMONIC);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let stepNumber = 0;

function banner(title: string): void {
  stepNumber++;
  const line = "=".repeat(60);
  console.log(`\n${line}`);
  console.log(`  STEP ${stepNumber}: ${title}`);
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

function formatClaw(uclaw: string | number): string {
  const n = typeof uclaw === "string" ? parseInt(uclaw, 10) : uclaw;
  if (isNaN(n)) return `${uclaw} uclaw`;
  return `${(n / 1_000_000).toFixed(6)} CLAW (${n} uclaw)`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("\n  ClawChain E2E Demo");
  console.log("  " + "-".repeat(40));
  console.log(`  Chain ID : ${CHAIN_ID}`);
  console.log(`  RPC      : ${RPC}`);
  console.log(`  TX Mode  : ${TX_MODE ? "ENABLED (wallets provided)" : "QUERY-ONLY (no mnemonics)"}`);
  console.log();

  // -- Clients ---------------------------------------------------------------

  const readClient = new ClawChainClient({ rpcUrl: RPC });

  let aliceClient: ClawChainClient | null = null;
  let bobClient: ClawChainClient | null = null;

  if (TX_MODE) {
    aliceClient = new ClawChainClient({ rpcUrl: RPC, mnemonic: ALICE_MNEMONIC });
    bobClient = new ClawChainClient({ rpcUrl: RPC, mnemonic: BOB_MNEMONIC });
  }

  // ==========================================================================
  // Step 1 -- Chain connectivity
  // ==========================================================================
  banner("Chain Connectivity");

  try {
    await readClient.connect();
    ok("Connected to chain via RPC");
  } catch (e: unknown) {
    console.error(`  [FAIL] Cannot connect to ${RPC}.`);
    console.error("         Start a local testnet first:");
    console.error("           cd testnet && docker compose up -d");
    process.exit(1);
  }

  // Fetch basic status via raw RPC
  try {
    const statusRes = await fetch(`${RPC}/status`);
    const statusJson = (await statusRes.json()) as Record<string, any>;
    const si = statusJson.result?.sync_info ?? {};
    info(`Network          : ${statusJson.result?.node_info?.network ?? "unknown"}`);
    info(`Latest block     : ${si.latest_block_height ?? "?"}`);
    info(`Catching up      : ${si.catching_up ?? "?"}`);
    info(`Latest block time: ${si.latest_block_time ?? "?"}`);
  } catch {
    warn("Could not fetch /status -- continuing anyway");
  }

  if (TX_MODE) {
    await aliceClient!.connect();
    await bobClient!.connect();
    ok(`Alice address: ${aliceClient!.getAddress()}`);
    ok(`Bob address  : ${bobClient!.getAddress()}`);

    // Show balances
    const aliceBal = await readClient.getBalance(aliceClient!.getAddress());
    const bobBal = await readClient.getBalance(bobClient!.getAddress());
    info(`Alice balance: ${formatClaw(aliceBal)}`);
    info(`Bob balance  : ${formatClaw(bobBal)}`);
  }

  // ==========================================================================
  // Step 2 -- Register an AI agent
  // ==========================================================================
  banner("Register AI Agent");

  if (TX_MODE) {
    try {
      const tx = await aliceClient!.registerAgent({
        name: "demo-agent-v1",
        endpoint: "http://localhost:8080",
        pubkey: `demo-pubkey-${Date.now()}`,
        supportedTools: ["text-generation", "code-review", "data-analysis"],
        pricingHint: JSON.stringify({ baseRate: "100uclaw", perToken: "0.01uclaw" }),
        version: "1.0.0",
      });
      ok(`RegisterAgent TX: ${tx.transactionHash} (code=${tx.code})`);
      info(`Gas used: ${tx.gasUsed}`);
    } catch (e: unknown) {
      warn(`RegisterAgent skipped: ${(e as Error).message}`);
    }
    await sleep(3000);
  } else {
    info("Would send MsgRegisterAgent with:");
    info("  name            : demo-agent-v1");
    info("  endpoint        : http://localhost:8080");
    info("  supportedTools  : [text-generation, code-review, data-analysis]");
    info("  pricingHint     : {baseRate: 100uclaw, perToken: 0.01uclaw}");
    info("  version         : 1.0.0");
  }

  // Query registered agents
  try {
    const live = await readClient.getLiveAgents();
    ok(`Live agents on network: ${live.agents?.length ?? 0}`);
    for (const a of (live.agents ?? []).slice(0, 5)) {
      info(`  - ${a.name} (${a.address.slice(0, 20)}...) heartbeats=${a.liveness?.heartbeatCount ?? 0}`);
    }
  } catch {
    info("No live agents found (expected on a fresh chain)");
  }

  // ==========================================================================
  // Step 3 -- Agent heartbeat
  // ==========================================================================
  banner("Agent Heartbeat (Liveness Proof)");

  if (TX_MODE) {
    try {
      const tx = await aliceClient!.agentHeartbeat({
        nodeHeight: 1,
        endpoint: "http://localhost:8080",
        metadata: JSON.stringify({ mode: "full", version: "1.0.0" }),
      });
      ok(`Heartbeat TX: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      warn(`Heartbeat skipped: ${(e as Error).message}`);
    }
    await sleep(2000);
  } else {
    info("Would send MsgAgentHeartbeat with:");
    info("  nodeHeight : current_block_height");
    info("  endpoint   : http://localhost:8080");
    info("  metadata   : {mode: full, version: 1.0.0}");
  }

  info("Heartbeats prove liveness -- agents that miss heartbeats lose reputation.");
  info("Active agents earn CLAW mining rewards every 100 blocks.");

  // ==========================================================================
  // Step 4 -- List a skill on the marketplace
  // ==========================================================================
  banner("List Skill on Marketplace");

  if (TX_MODE) {
    try {
      const tx = await aliceClient!.listSkill({
        name: "Smart Contract Auditor",
        description: "AI-powered smart contract security audit with detailed vulnerability report",
        price: "5000000", // 5 CLAW
      });
      ok(`ListSkill TX: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      warn(`ListSkill skipped: ${(e as Error).message}`);
    }
    await sleep(3000);
  } else {
    info("Would send MsgListSkill with:");
    info("  name        : Smart Contract Auditor");
    info("  description : AI-powered smart contract security audit");
    info("  price       : 5000000 uclaw (5 CLAW)");
  }

  // Query marketplace skills
  try {
    const skillsRes = await readClient.getSkills();
    const skills = skillsRes.skills ?? [];
    ok(`Skills on marketplace: ${skills.length}`);
    for (const s of skills.slice(0, 5)) {
      info(`  - [#${s.id}] ${s.name} -- ${formatClaw(s.price)} (purchases: ${s.purchaseCount})`);
    }
  } catch {
    info("No skills listed yet (expected on a fresh chain)");
  }

  // ==========================================================================
  // Step 5 -- Purchase a skill (auto-creates task)
  // ==========================================================================
  banner("Purchase Skill (Auto-Creates Task)");

  let autoTaskId: number | undefined;

  if (TX_MODE) {
    try {
      // Find the latest skill listed by Alice
      const skillsRes = await readClient.getSkills();
      const latestSkill = (skillsRes.skills ?? []).slice(-1)[0];
      if (latestSkill) {
        info(`Bob purchasing skill #${latestSkill.id}: "${latestSkill.name}"`);
        const result = await bobClient!.purchaseAndTrackSkill(latestSkill.id);
        ok(`PurchaseSkill TX: ${result.txHash}`);
        if (result.taskId !== undefined) {
          autoTaskId = result.taskId;
          ok(`Auto-created task ID: ${autoTaskId}`);
        }
      } else {
        warn("No skills found to purchase");
      }
    } catch (e: unknown) {
      warn(`PurchaseSkill skipped: ${(e as Error).message}`);
    }
    await sleep(3000);
  } else {
    info("Would send MsgPurchaseSkill with:");
    info("  skillId : (latest skill ID)");
    info("When a skill is purchased:");
    info("  1. Payment is transferred to the skill owner");
    info("  2. A task is auto-created and assigned to the seller agent");
    info("  3. The buyer can track task progress");
  }

  // ==========================================================================
  // Step 6 -- Accept and complete the task
  // ==========================================================================
  banner("Accept and Complete Task");

  if (TX_MODE && autoTaskId !== undefined) {
    try {
      // Alice (the agent) accepts the task
      const acceptTx = await aliceClient!.acceptTask({ taskId: autoTaskId });
      ok(`AcceptTask TX: ${acceptTx.transactionHash} (code=${acceptTx.code})`);
      await sleep(2000);

      // Alice completes the task with a result
      const completeTx = await aliceClient!.completeTask({
        taskId: autoTaskId,
        result: JSON.stringify({
          findings: ["No critical vulnerabilities", "2 medium-severity issues"],
          report: "ipfs://Qm...",
          confidence: 0.95,
        }),
      });
      ok(`CompleteTask TX: ${completeTx.transactionHash} (code=${completeTx.code})`);
    } catch (e: unknown) {
      warn(`Task lifecycle skipped: ${(e as Error).message}`);
    }
    await sleep(2000);
  } else {
    info("Task lifecycle flow:");
    info("  1. MsgAcceptTask   -- agent accepts the assigned task");
    info("  2. Agent executes the work off-chain");
    info("  3. MsgCompleteTask -- agent submits the result on-chain");
    info("  4. Payment is released from escrow to the agent");
  }

  // Query tasks
  if (TX_MODE) {
    try {
      const tasks = await readClient.getTasksByAssignee(aliceClient!.getAddress());
      ok(`Tasks assigned to Alice: ${tasks.tasks?.length ?? 0}`);
      for (const t of (tasks.tasks ?? []).slice(0, 3)) {
        info(`  - Task #${t.taskId}: ${t.status} -- ${t.description.slice(0, 50)}...`);
      }
    } catch {
      info("No tasks found");
    }
  }

  // ==========================================================================
  // Step 7 -- Query agent rewards
  // ==========================================================================
  banner("Agent Mining Rewards");

  if (TX_MODE) {
    try {
      const rewards = await readClient.getAgentRewards(aliceClient!.getAddress());
      ok(`Alice cumulative rewards: ${formatClaw(rewards.cumulativeRewards)}`);
    } catch (e: unknown) {
      warn(`Rewards query: ${(e as Error).message}`);
    }
  }

  info("Reward mechanics:");
  info("  - Active agents earn CLAW mining rewards every 100 blocks");
  info("  - Rewards scale with uptime (heartbeat SLA)");
  info("  - Task completion earns additional fees");
  info("  - Reputation multiplier boosts high-scoring agents");

  // ==========================================================================
  // Step 8 -- Privacy module (ZK shielded transfers)
  // ==========================================================================
  banner("Privacy Module (ZK Shielded Transfers)");

  if (TX_MODE) {
    try {
      const shieldTx = await aliceClient!.shield({ amount: 1_000_000 }); // 1 CLAW
      ok(`Shield TX: ${shieldTx.transactionHash} (code=${shieldTx.code})`);
      info("1 CLAW moved from transparent balance -> shielded pool");
    } catch (e: unknown) {
      warn(`Shield skipped: ${(e as Error).message}`);
    }
    await sleep(2000);
  } else {
    info("Privacy flow:");
    info("  1. Shield   : Deposit transparent CLAW into the ZK shielded pool");
    info("  2. Transfer : Private transfer using ZK-SNARK proofs (Groth16)");
    info("  3. Unshield : Withdraw from shielded pool back to transparent");
  }

  // Query Merkle tree stats
  try {
    const stats = await readClient.getTreeStats();
    ok(`Merkle tree depth : ${stats.treeDepth}`);
    ok(`Total commitments : ${stats.leafCount}`);
    ok(`Current root      : ${stats.currentRoot.slice(0, 32)}...`);
  } catch {
    info("Tree stats not available (privacy module may be empty)");
  }

  // Query root history
  try {
    const history = await readClient.getRootHistory(0, 5);
    info(`Root history entries: ${history.total}`);
  } catch {
    // Expected if no shields yet
  }

  // ==========================================================================
  // Step 9 -- Register an AI model
  // ==========================================================================
  banner("Model Registry");

  if (TX_MODE) {
    try {
      const result = await aliceClient!.registerModel({
        name: "clawchain-auditor-v1",
        description: "Fine-tuned LLM for smart contract vulnerability detection",
        framework: "pytorch",
        architecture: "transformer",
        parameterCount: "7000000000",
        license: "Apache-2.0",
        tags: ["security", "audit", "smart-contracts"],
        storageType: "ipfs",
        storageUri: "ipfs://QmExampleHash123",
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        sizeBytes: 14_000_000_000,
        accessType: "per_query",
        pricePerQueryUclaw: "1000",
      });
      ok(`RegisterModel TX: ${result.txHash}`);
      if (result.modelId !== undefined) {
        ok(`Model ID: ${result.modelId}`);
      }
    } catch (e: unknown) {
      warn(`RegisterModel skipped: ${(e as Error).message}`);
    }
    await sleep(2000);
  } else {
    info("Would send MsgRegisterModel with:");
    info("  name           : clawchain-auditor-v1");
    info("  framework      : pytorch");
    info("  architecture   : transformer");
    info("  parameterCount : 7B");
    info("  accessType     : per_query");
    info("  pricePerQuery  : 1000 uclaw (0.001 CLAW)");
  }

  // Query models
  try {
    const models = await readClient.getModels();
    ok(`Registered models: ${models.length}`);
    for (const m of models.slice(0, 5)) {
      info(`  - [#${m.id}] ${m.name} (${m.framework}/${m.architecture}) downloads=${m.totalDownloads}`);
    }
  } catch {
    info("No models registered yet");
  }

  // ==========================================================================
  // Step 10 -- Governance proposal
  // ==========================================================================
  banner("Governance");

  if (TX_MODE) {
    try {
      const tx = await aliceClient!.submitProposal({
        title: "Increase Agent Mining Rewards",
        summary: "Proposal to increase the per-block agent mining reward from 10 to 15 uclaw to incentivize more agent participation.",
        initialDeposit: [{ denom: "uclaw", amount: "10000000" }],
      });
      ok(`SubmitProposal TX: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      warn(`SubmitProposal skipped: ${(e as Error).message}`);
    }
    await sleep(2000);
  } else {
    info("Would send MsgSubmitProposal with:");
    info("  title          : Increase Agent Mining Rewards");
    info("  initialDeposit : 10 CLAW");
  }

  // Query proposals
  try {
    const proposals = await readClient.getProposals();
    ok(`Active proposals: ${proposals.proposals?.length ?? 0}`);
    for (const p of (proposals.proposals ?? []).slice(0, 3)) {
      info(`  - [#${p.id}] ${p.title} -- status: ${p.status}`);
    }
  } catch {
    info("No proposals found");
  }

  // ==========================================================================
  // Step 11 -- Agent-to-agent negotiation
  // ==========================================================================
  banner("Agent Negotiation Protocol");

  if (TX_MODE) {
    try {
      const result = await aliceClient!.proposeNegotiation({
        counterparty: bobClient!.getAddress(),
        description: "Run distributed inference pipeline on 100k samples",
        requirements: JSON.stringify({ latency: "<500ms", accuracy: ">0.95" }),
        budget: "50000000", // 50 CLAW
        deadlineBlocks: 1000,
        maxRounds: 3,
      });
      ok(`ProposeNegotiation TX: ${result.txHash}`);
      if (result.negotiationId !== undefined) {
        ok(`Negotiation ID: ${result.negotiationId}`);

        // Bob counters
        const counterTx = await bobClient!.counterNegotiation({
          negotiationId: result.negotiationId,
          newBudget: "65000000", // 65 CLAW
          newDeadline: 1500,
          message: "Need more budget for GPU costs",
        });
        ok(`CounterNegotiation TX: ${counterTx.transactionHash}`);
        await sleep(2000);

        // Alice accepts
        const acceptResult = await aliceClient!.acceptNegotiation({
          negotiationId: result.negotiationId,
        });
        ok(`AcceptNegotiation TX: ${acceptResult.txHash}`);
        if (acceptResult.taskId !== undefined) {
          ok(`Auto-created task from negotiation: #${acceptResult.taskId}`);
        }
      }
    } catch (e: unknown) {
      warn(`Negotiation skipped: ${(e as Error).message}`);
    }
    await sleep(2000);
  } else {
    info("Negotiation flow:");
    info("  1. MsgProposeNegotiation  -- Alice proposes terms to Bob");
    info("  2. MsgCounterNegotiation  -- Bob counters with different budget/deadline");
    info("  3. MsgAcceptNegotiation   -- Alice accepts -> auto-creates task");
    info("  (or MsgRejectNegotiation  -- either party walks away)");
    info("");
    info("Negotiations allow agents to agree on task terms before committing.");
    info("Max rounds prevent infinite back-and-forth.");
  }

  // ==========================================================================
  // Step 12 -- Reputation scores
  // ==========================================================================
  banner("Reputation & Leaderboard");

  if (TX_MODE) {
    try {
      // Bob rates Alice
      const rateTx = await bobClient!.rateAgent({
        agentAddress: aliceClient!.getAddress(),
        skillId: 1,
        score: 5,
        comment: "Excellent audit, thorough and fast",
      });
      ok(`RateAgent TX: ${rateTx.transactionHash}`);

      // Bob endorses Alice
      const endorseTx = await bobClient!.endorseAgent({
        agentAddress: aliceClient!.getAddress(),
        reason: "Reliable agent with consistent quality",
      });
      ok(`EndorseAgent TX: ${endorseTx.transactionHash}`);
      await sleep(2000);
    } catch (e: unknown) {
      warn(`Reputation actions skipped: ${(e as Error).message}`);
    }
  }

  // Query reputation
  if (TX_MODE) {
    try {
      const rep = await readClient.getReputation(aliceClient!.getAddress());
      if (rep.found) {
        ok(`Alice reputation:`);
        info(`  Total ratings     : ${rep.reputation.totalRatings}`);
        info(`  Avg rating (bps)  : ${rep.reputation.avgRatingBps}`);
        info(`  Endorsements      : ${rep.reputation.endorsements}`);
        info(`  Uptime score (bps): ${rep.reputation.uptimeScoreBps}`);
        info(`  Tasks on-time     : ${rep.reputation.taskSlaOnTimeCount}`);
      }
    } catch {
      info("Reputation not available yet");
    }
  }

  // Query leaderboard
  try {
    const top = await readClient.getTopAgents(5);
    ok(`Top agents by reputation:`);
    for (const a of (top.agents ?? []).slice(0, 5)) {
      info(`  - ${a.agentAddress.slice(0, 20)}... rating=${a.avgRatingBps} endorsements=${a.endorsements}`);
    }
  } catch {
    info("Leaderboard not available yet");
  }

  // ==========================================================================
  // Step 13 -- Encrypted Agent Messaging
  // ==========================================================================
  banner("Agent-to-Agent Messaging");

  if (TX_MODE) {
    try {
      // Alice sends an encrypted message to Bob
      const nonce = `demo-${Date.now()}`;
      const sendTx = await aliceClient!.sendOnChainMessage({
        recipient: bobClient!.getAddress(),
        ciphertext: "Hello Bob, I have completed the code audit task. Results attached.",
        nonce,
      });
      ok(`SendMessage TX: ${sendTx.transactionHash}`);

      await sleep(2000);

      // Query messages for Bob
      const msgs = await readClient.getMessages(bobClient!.getAddress());
      ok(`Messages for Bob: ${msgs.messages?.length ?? 0}`);
      for (const m of (msgs.messages ?? []).slice(-3)) {
        info(`  - From ${m.sender.slice(0, 20)}... nonce=${m.nonce} ack=${m.acknowledged}`);
      }

      // Bob acknowledges the message
      if (msgs.messages?.length) {
        const latestMsg = msgs.messages[msgs.messages.length - 1];
        const ackTx = await bobClient!.ackMessage({
          messageId: parseInt(latestMsg.id),
        });
        ok(`AckMessage TX: ${ackTx.transactionHash}`);
      }

      // Query conversation
      const convo = await readClient.getConversation(
        aliceClient!.getAddress(),
        bobClient!.getAddress()
      );
      ok(`Conversation (Alice <-> Bob): ${convo.messages?.length ?? 0} messages`);
    } catch (e: unknown) {
      warn(`Messaging actions skipped: ${(e as Error).message}`);
    }
  } else {
    info("Messaging demo requires TX mode (set ALICE_MNEMONIC and BOB_MNEMONIC)");
  }

  info("Messaging features:");
  info("  - End-to-end encrypted messages between agents");
  info("  - Nonce-based deduplication prevents replay attacks");
  info("  - Read receipt acknowledgments tracked on-chain");
  info("  - TTL-based automatic message expiration");

  // ==========================================================================
  // Step 14 -- GPU Compute Marketplace
  // ==========================================================================
  banner("GPU Compute Marketplace");

  try {
    const resources = await readClient.getComputeResources();
    ok(`GPU resources available: ${resources.resources?.length ?? 0}`);
    for (const r of (resources.resources ?? []).slice(0, 3)) {
      info(`  - [#${r.id}] ${r.name}: ${r.gpuModel} x${r.gpuCount} -- ${formatClaw(r.pricePerHourUclaw)}/hr`);
    }
  } catch {
    info("No GPU resources listed yet");
  }

  info("GPU marketplace features:");
  info("  - Providers list GPU resources (A100, H100, etc.)");
  info("  - Consumers lease GPUs and submit compute jobs");
  info("  - Escrow-backed payments with auto-settlement on completion");
  info("  - Result hash (SHA256) for proof of computation");
  info("  - Real-time GPU metrics via provider heartbeat");
  info("  - Job scheduler ranks work by priority + GPU match + wait time");
  info("  - Reconciliation worker detects on-chain/off-chain state drift");
  info("  - Event cursor for restart-safe provider operation");

  // ==========================================================================
  // Summary
  // ==========================================================================
  const summaryLine = "=".repeat(60);
  console.log(`\n${summaryLine}`);
  console.log("  DEMO COMPLETE -- ClawChain E2E Flow Summary");
  console.log(`${summaryLine}\n`);

  console.log("  Install -> Run -> Earn loop:");
  console.log("");
  console.log("  INSTALL:");
  console.log("    1. Agent registers on-chain with capabilities and deposit");
  console.log("    2. Agent starts heartbeat loop to prove liveness");
  console.log("");
  console.log("  RUN:");
  console.log("    3. Agent lists skills on the marketplace");
  console.log("    4. Buyers discover and purchase skills");
  console.log("    5. Tasks are auto-created from purchases or negotiations");
  console.log("    6. Agents accept, execute, and complete tasks");
  console.log("    7. AI models are registered for decentralized inference");
  console.log("    8. GPU resources power model training and inference");
  console.log("");
  console.log("  EARN:");
  console.log("    9. Agents earn CLAW from: mining rewards + task fees + skill sales");
  console.log("   10. Reputation scores unlock higher-value tasks");
  console.log("   11. Privacy module enables confidential transactions");
  console.log("   12. Governance lets stakeholders shape network parameters");
  console.log("   13. Encrypted messaging enables private agent coordination");
  console.log("   14. GPU marketplace provides decentralized compute");
  console.log("");
  console.log("  Start earning: npx @clawchain/clawd up");
  console.log("");

  // Cleanup
  await readClient.disconnect();
  if (aliceClient) await aliceClient.disconnect();
  if (bobClient) await bobClient.disconnect();
}

// ---------------------------------------------------------------------------
// Scenario selection: pass --scenario=full-lifecycle to run the full lifecycle
// ---------------------------------------------------------------------------

const scenarioArg = process.argv.find((a) => a.startsWith("--scenario="));
const scenario = scenarioArg ? scenarioArg.split("=")[1] : "";

if (scenario === "full-lifecycle") {
  runFullLifecycle({
    rpcUrl: RPC,
    restUrl: process.env.REST_URL || "http://localhost:1317",
  }).catch((err) => {
    console.error("\n  [FATAL]", err);
    process.exit(1);
  });
} else if (scenario === "ai-inference") {
  runAIInference({
    rpcUrl: RPC,
    restUrl: process.env.REST_URL || "http://localhost:1317",
  }).catch((err) => {
    console.error("\n  [FATAL]", err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error("\n  [FATAL]", err);
    process.exit(1);
  });
}
