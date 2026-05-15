#!/usr/bin/env npx tsx

/**
 * ClawChain Demo Scenario: Full Product Lifecycle
 *
 * Demonstrates the complete ClawChain product loop across all modules:
 *
 *   1.  Initialize wallets (alice=operator, bob=agent)
 *   2.  Fund wallets via faucet
 *   3.  Register agent on-chain
 *   4.  Agent heartbeat (prove liveness)
 *   5.  Delegate task
 *   6.  Accept task
 *   7.  Complete task
 *   8.  Rate agent
 *   9.  Shield tokens (ZK privacy)
 *  10.  List skill on marketplace
 *  11.  Purchase skill
 *  12.  Create escrow
 *  13.  Governance proposal
 *  14.  Staking delegation
 *
 * Requires ALICE_MNEMONIC and BOB_MNEMONIC environment variables for TX mode.
 * Optionally pass FAUCET_URL for token faucet requests.
 *
 * Usage:
 *   ALICE_MNEMONIC="..." BOB_MNEMONIC="..." npx tsx scenarios/full-lifecycle.ts
 *
 * Programmatic usage:
 *   import { runFullLifecycle } from "./scenarios/full-lifecycle.js";
 *   await runFullLifecycle({ rpcUrl: "http://localhost:26657", restUrl: "http://localhost:1317" });
 */

import { ClawChainClient } from "../../sdk/src/client.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_RPC = "http://localhost:26657";
const DEFAULT_REST = "http://localhost:1317";
const DEFAULT_FAUCET = "http://localhost:8000";

const STEP_DELAY_MS = 500;
const TOTAL_STEPS = 14;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function header(step: number, title: string): void {
  const line = "=".repeat(60);
  console.log(`\n${line}`);
  console.log(`  [Step ${step}/${TOTAL_STEPS}] ${title}`);
  console.log(`${line}\n`);
}

function info(msg: string): void {
  console.log(`  [info] ${msg}`);
}

function ok(msg: string): void {
  console.log(`  [ok]   ${msg}`);
}

function fail(msg: string): void {
  console.log(`  [FAIL] ${msg}`);
}

function formatClaw(uclaw: string | number): string {
  const n = typeof uclaw === "string" ? parseInt(uclaw, 10) : uclaw;
  if (isNaN(n)) return `${uclaw} uclaw`;
  return `${(n / 1_000_000).toFixed(6)} CLAW (${n} uclaw)`;
}

/**
 * Attempt to request tokens from the faucet endpoint.
 * Faucets vary by implementation, so this tries a common REST format.
 */
async function requestFaucetTokens(
  faucetUrl: string,
  address: string,
): Promise<boolean> {
  try {
    const res = await fetch(faucetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, coins: ["10000000uclaw"] }),
    });
    if (res.ok) {
      return true;
    }
    // Try alternate format
    const res2 = await fetch(`${faucetUrl}/credit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, denom: "uclaw" }),
    });
    return res2.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Exported lifecycle runner
// ---------------------------------------------------------------------------

export interface FullLifecycleConfig {
  /** Tendermint RPC URL (default: http://localhost:26657). */
  rpcUrl: string;
  /** Cosmos REST/LCD URL (default: http://localhost:1317). */
  restUrl: string;
  /** Optional faucet URL (default: http://localhost:8000). */
  faucetUrl?: string;
  /** Alice mnemonic (operator role). Falls back to ALICE_MNEMONIC env var. */
  aliceMnemonic?: string;
  /** Bob mnemonic (agent role). Falls back to BOB_MNEMONIC env var. */
  bobMnemonic?: string;
}

export async function runFullLifecycle(config: FullLifecycleConfig): Promise<void> {
  const rpcUrl = config.rpcUrl || DEFAULT_RPC;
  const restUrl = config.restUrl || DEFAULT_REST;
  const faucetUrl = config.faucetUrl || process.env.FAUCET_URL || DEFAULT_FAUCET;
  const aliceMnemonic = config.aliceMnemonic || process.env.ALICE_MNEMONIC || "";
  const bobMnemonic = config.bobMnemonic || process.env.BOB_MNEMONIC || "";

  console.log("\n  ClawChain Full Lifecycle Demo");
  console.log("  " + "-".repeat(40));
  console.log(`  RPC      : ${rpcUrl}`);
  console.log(`  REST     : ${restUrl}`);
  console.log(`  Faucet   : ${faucetUrl}`);
  console.log(`  Steps    : ${TOTAL_STEPS}`);
  console.log();

  if (!aliceMnemonic || !bobMnemonic) {
    console.error("  Error: Both ALICE_MNEMONIC and BOB_MNEMONIC are required.");
    console.error("  Example:");
    console.error('    ALICE_MNEMONIC="word1 word2 ..." BOB_MNEMONIC="word1 word2 ..." npx tsx scenarios/full-lifecycle.ts');
    process.exit(1);
  }

  // -- Clients -------------------------------------------------------------

  const reader = new ClawChainClient({ rpcUrl });
  const alice = new ClawChainClient({ rpcUrl, mnemonic: aliceMnemonic });
  const bob = new ClawChainClient({ rpcUrl, mnemonic: bobMnemonic });

  // ========================================================================
  // Step 1: Initialize -- create 2 wallets (alice=operator, bob=agent)
  // ========================================================================
  header(1, "Initialize Wallets");

  try {
    await reader.connect();
    await alice.connect();
    await bob.connect();

    const aliceAddr = alice.getAddress();
    const bobAddr = bob.getAddress();

    ok("Connected to chain");
    ok(`Alice (Operator) : ${aliceAddr}`);
    ok(`Bob   (Agent)    : ${bobAddr}`);

    // Show initial balances
    try {
      const aliceBal = await reader.getBalance(aliceAddr);
      const bobBal = await reader.getBalance(bobAddr);
      info(`Alice balance: ${formatClaw(aliceBal)}`);
      info(`Bob balance  : ${formatClaw(bobBal)}`);
    } catch {
      info("Balance query unavailable (chain may be starting up)");
    }
  } catch (e: unknown) {
    fail(`Cannot connect to ${rpcUrl}: ${(e as Error).message}`);
    fail("Start a local testnet first: cd testnet && docker compose up -d");
    process.exit(1);
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 2: Fund -- request tokens from faucet for both
  // ========================================================================
  header(2, "Fund Wallets via Faucet");

  const aliceAddr = alice.getAddress();
  const bobAddr = bob.getAddress();

  const aliceFunded = await requestFaucetTokens(faucetUrl, aliceAddr);
  if (aliceFunded) {
    ok(`Faucet funded Alice: ${aliceAddr}`);
  } else {
    info(`Faucet request for Alice did not succeed (address may already be funded, or faucet unavailable)`);
  }

  const bobFunded = await requestFaucetTokens(faucetUrl, bobAddr);
  if (bobFunded) {
    ok(`Faucet funded Bob: ${bobAddr}`);
  } else {
    info(`Faucet request for Bob did not succeed (address may already be funded, or faucet unavailable)`);
  }

  // Confirm balances after faucet
  await sleep(2000); // wait for faucet txs to land
  try {
    const aliceBal = await reader.getBalance(aliceAddr);
    const bobBal = await reader.getBalance(bobAddr);
    ok(`Alice balance: ${formatClaw(aliceBal)}`);
    ok(`Bob balance  : ${formatClaw(bobBal)}`);
  } catch {
    info("Balance query unavailable");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 3: Register Agent -- bob registers as an AI agent with capabilities
  // ========================================================================
  header(3, "Register Agent (Bob)");

  try {
    const tx = await bob.registerAgent({
      name: `lifecycle-agent-${Date.now()}`,
      endpoint: "http://localhost:8080",
      pubkey: `pk-lifecycle-${Date.now()}`,
      supportedTools: ["text-generation", "code-review", "security-audit", "data-analysis"],
      pricingHint: JSON.stringify({ baseRate: "100uclaw", perToken: "0.01uclaw" }),
      version: "1.0.0",
    });
    ok(`RegisterAgent TX: ${tx.transactionHash}`);
    ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
  } catch (e: unknown) {
    fail(`RegisterAgent: ${(e as Error).message}`);
  }

  await sleep(3000);

  // Verify registration
  try {
    const agentInfo = await reader.getAgent(bobAddr);
    if (agentInfo.registered) {
      ok(`Agent verified: ${agentInfo.name}`);
      info(`Endpoint: ${agentInfo.endpoint}`);
      info(`Tools: ${(agentInfo.supportedTools ?? []).join(", ")}`);
    }
  } catch {
    info("Agent query not available (registration may still be pending)");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 4: Heartbeat -- bob sends heartbeat to prove liveness
  // ========================================================================
  header(4, "Agent Heartbeat (Liveness Proof)");

  try {
    const tx = await bob.agentHeartbeat({
      nodeHeight: 1,
      endpoint: "http://localhost:8080",
      metadata: JSON.stringify({ mode: "full", version: "1.0.0", scenario: "full-lifecycle" }),
    });
    ok(`Heartbeat TX: ${tx.transactionHash}`);
    ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
  } catch (e: unknown) {
    fail(`Heartbeat: ${(e as Error).message}`);
  }

  await sleep(2000);

  // Check liveness
  try {
    const liveness = await reader.getAgentLiveness(bobAddr);
    if (liveness.found) {
      ok(`Heartbeat count: ${liveness.liveness.heartbeatCount}`);
      info(`Last heartbeat height: ${liveness.liveness.lastHeartbeatHeight}`);
    }
  } catch {
    info("Liveness query not available");
  }

  info("Heartbeats prove liveness -- agents that miss heartbeats lose reputation");
  info("Active agents earn CLAW mining rewards every 100 blocks");

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 5: Delegate Task -- alice delegates a task to bob with budget
  // ========================================================================
  header(5, "Delegate Task (Alice -> Bob)");

  let taskId: number | undefined;

  try {
    const tx = await alice.delegateTask({
      assignee: bobAddr,
      description: "Perform a comprehensive security audit on DeFi smart contract suite",
      requirements: JSON.stringify({
        scope: "Full contract audit",
        deliverables: ["Vulnerability report", "Severity ratings", "Remediation steps"],
        deadline: "48 hours",
      }),
      budget: "10000000", // 10 CLAW
      deadlineBlocks: 500,
    });
    ok(`DelegateTask TX: ${tx.transactionHash}`);
    ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);

    // Extract task ID from events
    for (const event of tx.events) {
      const attr = event.attributes.find((a) => a.key === "task_id");
      if (attr) {
        taskId = parseInt(attr.value, 10);
        ok(`Task ID: ${taskId}`);
        break;
      }
    }

    if (taskId === undefined) {
      info("Task ID not found in events (may need querying)");
    }
  } catch (e: unknown) {
    fail(`DelegateTask: ${(e as Error).message}`);
  }

  await sleep(3000);
  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 6: Accept Task -- bob accepts the delegated task
  // ========================================================================
  header(6, "Accept Task (Bob)");

  if (taskId !== undefined) {
    try {
      const tx = await bob.acceptTask({ taskId });
      ok(`AcceptTask TX: ${tx.transactionHash}`);
      ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
    } catch (e: unknown) {
      fail(`AcceptTask: ${(e as Error).message}`);
    }

    await sleep(2000);

    // Verify task status
    try {
      const task = await reader.getTask(taskId);
      ok(`Task #${taskId} status: ${task.status}`);
      info(`Assignee: ${task.assigneeAddress}`);
      info(`Budget: ${task.budget} uclaw`);
    } catch {
      info("Task query not available");
    }
  } else {
    info("Skipping -- no task ID from previous step");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 7: Complete Task -- bob completes the task with result
  // ========================================================================
  header(7, "Complete Task (Bob)");

  if (taskId !== undefined) {
    try {
      const tx = await bob.completeTask({
        taskId,
        result: JSON.stringify({
          findings: [
            { severity: "high", description: "Reentrancy vulnerability in withdraw()" },
            { severity: "medium", description: "Missing access control on setFee()" },
            { severity: "low", description: "Unused variable in constructor" },
          ],
          overallRisk: "medium",
          reportUri: "ipfs://QmExampleAuditReport",
          confidence: 0.95,
          completedAt: new Date().toISOString(),
        }),
      });
      ok(`CompleteTask TX: ${tx.transactionHash}`);
      ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
    } catch (e: unknown) {
      fail(`CompleteTask: ${(e as Error).message}`);
    }

    await sleep(2000);

    // Verify completion
    try {
      const task = await reader.getTask(taskId);
      ok(`Task #${taskId} final status: ${task.status}`);
      info(`Result preview: ${task.result.slice(0, 80)}...`);
    } catch {
      info("Task query not available");
    }
  } else {
    info("Skipping -- no task ID from previous step");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 8: Rate Agent -- alice rates bob's work (5 stars)
  // ========================================================================
  header(8, "Rate Agent (Alice rates Bob)");

  try {
    const tx = await alice.rateAgent({
      agentAddress: bobAddr,
      skillId: 1,
      score: 5,
      comment: "Excellent security audit -- thorough, fast, and detailed findings",
    });
    ok(`RateAgent TX: ${tx.transactionHash}`);
    ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
    info("Rating: 5/5 stars");
  } catch (e: unknown) {
    fail(`RateAgent: ${(e as Error).message}`);
  }

  await sleep(2000);

  // Query reputation
  try {
    const rep = await reader.getReputation(bobAddr);
    if (rep.found) {
      ok("Bob's reputation updated:");
      info(`  Total ratings    : ${rep.reputation.totalRatings}`);
      info(`  Avg rating (bps) : ${rep.reputation.avgRatingBps}`);
      info(`  Endorsements     : ${rep.reputation.endorsements}`);
    }
  } catch {
    info("Reputation query not available");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 9: Shield Tokens -- bob shields earned tokens into privacy pool
  // ========================================================================
  header(9, "Shield Tokens (ZK Privacy Pool)");

  try {
    info("Shielding 1 CLAW (1000000 uclaw) into the privacy pool...");
    const tx = await bob.shield({ amount: 1_000_000 });
    ok(`Shield TX: ${tx.transactionHash}`);
    ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
    info("1 CLAW moved: transparent balance -> shielded pool");

    // Extract commitment from events
    for (const event of tx.events) {
      if (event.type === "shield" || event.type === "privacy_shield") {
        const commitAttr = event.attributes.find((a) => a.key === "commitment");
        if (commitAttr) {
          info(`Commitment: ${commitAttr.value.slice(0, 32)}...`);
        }
      }
    }
  } catch (e: unknown) {
    fail(`Shield: ${(e as Error).message}`);
  }

  await sleep(2000);

  // Query Merkle tree stats
  try {
    const stats = await reader.getTreeStats();
    ok(`Merkle tree depth : ${stats.treeDepth}`);
    ok(`Total commitments : ${stats.leafCount}`);
    ok(`Current root      : ${stats.currentRoot.slice(0, 32)}...`);
  } catch {
    info("Tree stats not available (privacy module may be empty)");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 10: List Skill -- bob lists an AI skill on the marketplace
  // ========================================================================
  header(10, "List Skill on Marketplace (Bob)");

  try {
    const tx = await bob.listSkill({
      name: "Smart Contract Security Auditor",
      description: "AI-powered comprehensive smart contract security audit with detailed vulnerability report and remediation steps",
      price: "5000000", // 5 CLAW
    });
    ok(`ListSkill TX: ${tx.transactionHash}`);
    ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
    info("Skill listed at 5.000000 CLAW");

    // Extract skill ID
    for (const event of tx.events) {
      const attr = event.attributes.find((a) => a.key === "skill_id");
      if (attr) {
        ok(`Skill ID: ${attr.value}`);
        break;
      }
    }
  } catch (e: unknown) {
    fail(`ListSkill: ${(e as Error).message}`);
  }

  await sleep(3000);

  // Query marketplace
  try {
    const skillsRes = await reader.getSkills();
    const skills = skillsRes.skills ?? [];
    ok(`Skills on marketplace: ${skills.length}`);
    for (const s of skills.slice(-3)) {
      info(`  [#${s.id}] ${s.name} -- ${formatClaw(s.price)} (purchases: ${s.purchaseCount})`);
    }
  } catch {
    info("No skills listed yet");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 11: Purchase Skill -- alice purchases bob's skill
  // ========================================================================
  header(11, "Purchase Skill (Alice buys from Bob)");

  try {
    const skillsRes = await reader.getSkills();
    const latestSkill = (skillsRes.skills ?? []).slice(-1)[0];

    if (latestSkill) {
      info(`Purchasing skill #${latestSkill.id}: "${latestSkill.name}"`);
      info(`Price: ${formatClaw(latestSkill.price)}`);

      const result = await alice.purchaseAndTrackSkill(latestSkill.id);
      ok(`PurchaseSkill TX: ${result.txHash}`);
      if (result.taskId !== undefined) {
        ok(`Auto-created task ID: ${result.taskId}`);
        info("A task was auto-created and assigned to the skill seller (Bob)");
      }
    } else {
      info("No skills found on marketplace to purchase");
    }
  } catch (e: unknown) {
    fail(`PurchaseSkill: ${(e as Error).message}`);
  }

  await sleep(3000);
  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 12: Create Escrow -- alice creates escrow for custom work
  // ========================================================================
  header(12, "Create Escrow (Alice)");

  try {
    const skillsRes = await reader.getSkills();
    const activeSkill = (skillsRes.skills ?? []).find((s) => s.active);

    if (activeSkill) {
      info(`Creating escrow for skill #${activeSkill.id}: "${activeSkill.name}"`);
      info("Milestones: 3 | Deadline: 1000 blocks");

      const tx = await alice.createEscrow({
        skillId: activeSkill.id,
        deadlineBlocks: 1000,
        description: "Full platform security audit with 3 milestones: initial scan, deep analysis, final report",
        milestones: 3,
      });
      ok(`CreateEscrow TX: ${tx.transactionHash}`);
      ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);

      // Extract escrow ID
      for (const event of tx.events) {
        const attr = event.attributes.find((a) => a.key === "escrow_id");
        if (attr) {
          ok(`Escrow ID: ${attr.value}`);
          break;
        }
      }

      info("Funds locked in escrow -- released on milestone completion");
    } else {
      info("No active skills found for escrow creation");
    }
  } catch (e: unknown) {
    fail(`CreateEscrow: ${(e as Error).message}`);
  }

  await sleep(2000);
  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 13: Governance -- alice submits a parameter change proposal
  // ========================================================================
  header(13, "Governance Proposal (Alice)");

  try {
    const tx = await alice.submitProposal({
      title: "Increase Agent Mining Rewards",
      summary: "Proposal to increase the per-block agent mining reward from 10 to 15 uclaw to incentivize more agent participation and improve network liveness.",
      initialDeposit: [{ denom: "uclaw", amount: "10000000" }], // 10 CLAW
    });
    ok(`SubmitProposal TX: ${tx.transactionHash}`);
    ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
    info("Proposal deposited: 10 CLAW");
  } catch (e: unknown) {
    fail(`SubmitProposal: ${(e as Error).message}`);
  }

  await sleep(2000);

  // Query proposals
  try {
    const proposals = await reader.getProposals();
    ok(`Active proposals: ${proposals.proposals?.length ?? 0}`);
    for (const p of (proposals.proposals ?? []).slice(-3)) {
      info(`  [#${p.id}] ${p.title} -- status: ${p.status}`);
    }
  } catch {
    info("No proposals found");
  }

  await sleep(STEP_DELAY_MS);

  // ========================================================================
  // Step 14: Staking -- alice delegates tokens to a validator
  // ========================================================================
  header(14, "Staking Delegation (Alice)");

  try {
    // Query validators first
    const validatorsRes = await reader.getValidators("BOND_STATUS_BONDED");
    const validators = validatorsRes.validators ?? [];

    if (validators.length > 0) {
      const validator = validators[0];
      info(`Delegating to validator: ${validator.moniker || validator.operatorAddress}`);
      info(`Validator address: ${validator.operatorAddress}`);
      info(`Delegation amount: 5 CLAW (5000000 uclaw)`);

      const tx = await alice.stakingDelegate({
        validatorAddress: validator.operatorAddress,
        amount: "5000000", // 5 CLAW
      });
      ok(`StakingDelegate TX: ${tx.transactionHash}`);
      ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
      info("5 CLAW delegated -- earning staking rewards");
    } else {
      info("No bonded validators found -- attempting with default validator address");

      // Try a common local testnet validator address pattern
      try {
        const tx = await alice.stakingDelegate({
          validatorAddress: "cosmosvaloper1qnk2n4nlkpw9xfqntladh74w6ujtulwnz7rf8",
          amount: "5000000",
        });
        ok(`StakingDelegate TX: ${tx.transactionHash}`);
        ok(`Code: ${tx.code} | Gas used: ${tx.gasUsed}`);
      } catch (e2: unknown) {
        fail(`StakingDelegate: ${(e2 as Error).message}`);
        info("No validators available -- staking requires at least one active validator");
      }
    }
  } catch (e: unknown) {
    fail(`Staking: ${(e as Error).message}`);
  }

  await sleep(2000);

  // Query delegations
  try {
    const delegations = await reader.getDelegations(aliceAddr);
    ok(`Alice's active delegations: ${delegations.delegations?.length ?? 0}`);
    for (const d of (delegations.delegations ?? []).slice(0, 3)) {
      info(`  Validator: ${d.validatorAddress}`);
      info(`  Amount: ${formatClaw(d.balance.amount)}`);
    }
  } catch {
    info("Delegations query not available");
  }

  // ========================================================================
  // Summary
  // ========================================================================
  const line = "=".repeat(60);
  console.log(`\n${line}`);
  console.log("  FULL LIFECYCLE DEMO COMPLETE");
  console.log(`${line}\n`);

  console.log("  All 14 steps of the ClawChain product loop demonstrated:");
  console.log("");
  console.log("  SETUP:");
  console.log("    1. Initialized operator (Alice) and agent (Bob) wallets");
  console.log("    2. Funded both wallets via faucet");
  console.log("");
  console.log("  AGENT LIFECYCLE:");
  console.log("    3. Bob registered as an AI agent with capabilities");
  console.log("    4. Bob sent heartbeat to prove liveness");
  console.log("    5. Alice delegated a security audit task to Bob");
  console.log("    6. Bob accepted the delegated task");
  console.log("    7. Bob completed the task with audit results");
  console.log("    8. Alice rated Bob 5 stars for excellent work");
  console.log("");
  console.log("  PRIVACY & MARKETPLACE:");
  console.log("    9. Bob shielded earned tokens into ZK privacy pool");
  console.log("   10. Bob listed a skill on the marketplace");
  console.log("   11. Alice purchased Bob's skill (auto-created task)");
  console.log("   12. Alice created escrow for milestone-based work");
  console.log("");
  console.log("  GOVERNANCE & STAKING:");
  console.log("   13. Alice submitted a governance proposal");
  console.log("   14. Alice delegated tokens to a validator");
  console.log("");
  console.log("  Start earning: npx @clawchain/clawd up");
  console.log("");

  // Cleanup
  await reader.disconnect();
  await alice.disconnect();
  await bob.disconnect();
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("full-lifecycle.ts") ||
   process.argv[1].endsWith("full-lifecycle.js"))
) {
  const rpcUrl = process.env.RPC_URL || DEFAULT_RPC;
  const restUrl = process.env.REST_URL || DEFAULT_REST;

  runFullLifecycle({ rpcUrl, restUrl }).catch((err) => {
    console.error("\n  [FATAL]", err);
    process.exit(1);
  });
}
