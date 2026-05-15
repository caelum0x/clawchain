#!/usr/bin/env npx tsx

/**
 * ClawChain Demo Scenario: Marketplace Flow
 *
 * Full marketplace lifecycle:
 *   list skill -> purchase -> auto-task -> execute -> settle -> rate -> escrow
 *
 * Requires ALICE_MNEMONIC and BOB_MNEMONIC environment variables.
 * Alice acts as the seller, Bob acts as the buyer.
 */

import { ClawChainClient } from "../../sdk/src/client.js";

const RPC = process.env.RPC_URL || "http://localhost:26657";
const ALICE_MNEMONIC = process.env.ALICE_MNEMONIC || "";
const BOB_MNEMONIC = process.env.BOB_MNEMONIC || "";

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
  console.log("\n  Marketplace Flow Demo\n");

  if (!ALICE_MNEMONIC || !BOB_MNEMONIC) {
    console.error("  Error: Set ALICE_MNEMONIC and BOB_MNEMONIC environment variables.");
    console.error("  Example:");
    console.error('    ALICE_MNEMONIC="..." BOB_MNEMONIC="..." npx tsx scenarios/marketplace-flow.ts');
    process.exit(1);
  }

  const alice = new ClawChainClient({ rpcUrl: RPC, mnemonic: ALICE_MNEMONIC });
  const bob = new ClawChainClient({ rpcUrl: RPC, mnemonic: BOB_MNEMONIC });
  const reader = new ClawChainClient({ rpcUrl: RPC });

  await alice.connect();
  await bob.connect();
  await reader.connect();

  const aliceAddr = alice.getAddress();
  const bobAddr = bob.getAddress();
  console.log(`  Alice (Seller): ${aliceAddr}`);
  console.log(`  Bob   (Buyer) : ${bobAddr}`);

  // -------------------------------------------------------------------------
  step("1. Register Alice as an Agent");
  // -------------------------------------------------------------------------

  try {
    const tx = await alice.registerAgent({
      name: `marketplace-agent-${Date.now()}`,
      endpoint: "http://localhost:8080",
      pubkey: `pk-mkt-${Date.now()}`,
      supportedTools: ["code-review", "security-audit", "performance-analysis"],
      version: "1.0.0",
    });
    console.log(`  RegisterAgent TX: ${tx.transactionHash} (code=${tx.code})`);
  } catch (e: unknown) {
    console.log(`  Registration: ${(e as Error).message}`);
  }
  await sleep(3000);

  // -------------------------------------------------------------------------
  step("2. List Skills on Marketplace");
  // -------------------------------------------------------------------------

  const skillDefs = [
    {
      name: "Smart Contract Auditor",
      description: "AI-powered comprehensive smart contract security audit with detailed report",
      price: "5000000", // 5 CLAW
    },
    {
      name: "Performance Optimizer",
      description: "Analyze and optimize blockchain application performance bottlenecks",
      price: "3000000", // 3 CLAW
    },
    {
      name: "Code Review Bot",
      description: "Automated code review with best practices, bug detection, and suggestions",
      price: "1000000", // 1 CLAW
    },
  ];

  const listedSkillIds: number[] = [];

  for (const skillDef of skillDefs) {
    try {
      const tx = await alice.listSkill(skillDef);
      console.log(`  Listed "${skillDef.name}" at ${formatClaw(skillDef.price)}`);
      console.log(`    TX: ${tx.transactionHash} (code=${tx.code})`);

      // Try to extract skill ID from events
      for (const event of tx.events) {
        const attr = event.attributes.find((a) => a.key === "skill_id");
        if (attr) {
          listedSkillIds.push(parseInt(attr.value, 10));
          break;
        }
      }
    } catch (e: unknown) {
      console.log(`  Failed to list "${skillDef.name}": ${(e as Error).message}`);
    }
    await sleep(2000);
  }

  // Query all skills
  try {
    const skillsRes = await reader.getSkills();
    console.log(`\n  Total skills on marketplace: ${skillsRes.skills?.length ?? 0}`);
    for (const s of (skillsRes.skills ?? []).slice(0, 10)) {
      console.log(`    [#${s.id}] ${s.name} -- ${formatClaw(s.price)} (active=${s.active}, purchases=${s.purchaseCount})`);
    }
  } catch {
    console.log("  Skills query failed");
  }

  // -------------------------------------------------------------------------
  step("3. Search and Browse Skills");
  // -------------------------------------------------------------------------

  try {
    const results = await reader.searchSkills("audit");
    console.log(`  Search "audit": ${results.skills?.length ?? 0} results`);
    for (const s of (results.skills ?? []).slice(0, 5)) {
      console.log(`    [#${s.id}] ${s.name}`);
    }
  } catch {
    console.log("  Search not available");
  }

  // -------------------------------------------------------------------------
  step("4. Bob Purchases a Skill");
  // -------------------------------------------------------------------------

  let purchaseTaskId: number | undefined;

  try {
    const skillsRes = await reader.getSkills();
    const targetSkill = (skillsRes.skills ?? []).find((s) => s.active);

    if (targetSkill) {
      console.log(`  Purchasing skill #${targetSkill.id}: "${targetSkill.name}"`);
      console.log(`  Price: ${formatClaw(targetSkill.price)}`);

      const result = await bob.purchaseAndTrackSkill(targetSkill.id);
      console.log(`  TX: ${result.txHash}`);
      if (result.taskId !== undefined) {
        purchaseTaskId = result.taskId;
        console.log(`  Auto-created task: #${purchaseTaskId}`);
      }
    } else {
      console.log("  No active skills found to purchase");
    }
  } catch (e: unknown) {
    console.log(`  Purchase failed: ${(e as Error).message}`);
  }

  await sleep(3000);

  // -------------------------------------------------------------------------
  step("5. Alice Accepts and Completes Auto-Created Task");
  // -------------------------------------------------------------------------

  if (purchaseTaskId !== undefined) {
    try {
      // Accept
      const acceptTx = await alice.acceptTask({ taskId: purchaseTaskId });
      console.log(`  AcceptTask TX: ${acceptTx.transactionHash}`);
      await sleep(2000);

      // Complete
      const completeTx = await alice.completeTask({
        taskId: purchaseTaskId,
        result: JSON.stringify({
          auditReport: {
            contractsReviewed: 3,
            criticalIssues: 0,
            highIssues: 1,
            mediumIssues: 3,
            lowIssues: 5,
            recommendations: [
              "Add reentrancy guards to external calls",
              "Use SafeMath for all arithmetic",
              "Implement time-lock on admin functions",
            ],
          },
          completedAt: new Date().toISOString(),
        }),
      });
      console.log(`  CompleteTask TX: ${completeTx.transactionHash}`);
    } catch (e: unknown) {
      console.log(`  Task lifecycle failed: ${(e as Error).message}`);
    }
    await sleep(2000);
  }

  // -------------------------------------------------------------------------
  step("6. Create Escrow for Complex Work");
  // -------------------------------------------------------------------------

  let escrowId: number | undefined;

  try {
    const skillsRes = await reader.getSkills();
    const activeSkill = (skillsRes.skills ?? []).find((s) => s.active);

    if (activeSkill) {
      const tx = await bob.createEscrow({
        skillId: activeSkill.id,
        deadlineBlocks: 1000,
        description: "Full platform security audit with 3 milestones",
        milestones: 3,
      });
      console.log(`  CreateEscrow TX: ${tx.transactionHash} (code=${tx.code})`);

      // Extract escrow ID
      for (const event of tx.events) {
        const attr = event.attributes.find((a) => a.key === "escrow_id");
        if (attr) {
          escrowId = parseInt(attr.value, 10);
          console.log(`  Escrow ID: ${escrowId}`);
          break;
        }
      }
    }
  } catch (e: unknown) {
    console.log(`  CreateEscrow failed: ${(e as Error).message}`);
  }

  await sleep(2000);

  // Complete milestones
  if (escrowId !== undefined) {
    for (let i = 1; i <= 3; i++) {
      try {
        const tx = await bob.completeMilestone({ escrowId });
        console.log(`  Milestone ${i}/3 completed: ${tx.transactionHash}`);
      } catch (e: unknown) {
        console.log(`  Milestone ${i}/3 failed: ${(e as Error).message}`);
      }
      await sleep(1500);
    }

    // Complete escrow
    try {
      const tx = await bob.completeEscrow({ escrowId });
      console.log(`  Escrow completed: ${tx.transactionHash}`);
    } catch (e: unknown) {
      console.log(`  Escrow completion failed: ${(e as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  step("7. Update Skill (Version Bump)");
  // -------------------------------------------------------------------------

  try {
    const skillsRes = await reader.getSkills();
    const ownedSkill = (skillsRes.skills ?? []).find((s) => s.owner === aliceAddr);

    if (ownedSkill) {
      const tx = await alice.updateSkill({
        skillId: ownedSkill.id,
        description: "Enhanced AI-powered audit with supply chain analysis and gas optimization",
        price: "6000000", // Price increase
        category: "security",
        tags: ["audit", "security", "defi", "supply-chain"],
      });
      console.log(`  UpdateSkill TX: ${tx.transactionHash}`);
      console.log(`  Skill #${ownedSkill.id} version bumped`);
    }
  } catch (e: unknown) {
    console.log(`  UpdateSkill failed: ${(e as Error).message}`);
  }

  await sleep(2000);

  // -------------------------------------------------------------------------
  step("8. Skill Analytics");
  // -------------------------------------------------------------------------

  try {
    const skillsRes = await reader.getSkills();
    for (const s of (skillsRes.skills ?? []).slice(0, 3)) {
      try {
        const analytics = await reader.getSkillAnalytics(s.id);
        console.log(`  Skill #${s.id} "${s.name}":`);
        console.log(`    Revenue        : ${formatClaw(analytics.analytics.totalRevenue)}`);
        console.log(`    Purchases      : ${analytics.analytics.purchaseCount}`);
        console.log(`    Avg rating     : ${analytics.analytics.avgRating}`);
        console.log(`    Version count  : ${analytics.analytics.versionCount}`);
      } catch {
        // Not all skills may have analytics
      }
    }
  } catch {
    console.log("  Analytics not available");
  }

  // -------------------------------------------------------------------------
  step("9. Rate and Endorse");
  // -------------------------------------------------------------------------

  try {
    const rateTx = await bob.rateAgent({
      agentAddress: aliceAddr,
      skillId: listedSkillIds[0] ?? 1,
      score: 5,
      comment: "Thorough audit, fast turnaround, highly recommended",
    });
    console.log(`  RateAgent TX: ${rateTx.transactionHash}`);
  } catch (e: unknown) {
    console.log(`  RateAgent failed: ${(e as Error).message}`);
  }

  try {
    const endorseTx = await bob.endorseAgent({
      agentAddress: aliceAddr,
      reason: "Top-tier security audit provider",
    });
    console.log(`  EndorseAgent TX: ${endorseTx.transactionHash}`);
  } catch (e: unknown) {
    console.log(`  EndorseAgent failed: ${(e as Error).message}`);
  }

  await sleep(2000);

  // Query reputation
  try {
    const rep = await reader.getReputation(aliceAddr);
    if (rep.found) {
      console.log(`  Alice reputation:`);
      console.log(`    Avg rating    : ${rep.reputation.avgRatingBps / 100}/5`);
      console.log(`    Total ratings : ${rep.reputation.totalRatings}`);
      console.log(`    Endorsements  : ${rep.reputation.endorsements}`);
      console.log(`    Skill purchases: ${rep.reputation.skillPurchases}`);
    }
  } catch {
    console.log("  Reputation not available");
  }

  // -------------------------------------------------------------------------
  step("Complete");
  // -------------------------------------------------------------------------

  console.log("  Marketplace flow demonstrated:");
  console.log("    1. Agent registered with capabilities");
  console.log("    2. Listed 3 skills on marketplace");
  console.log("    3. Buyer discovered and purchased a skill");
  console.log("    4. Auto-created task was accepted and completed");
  console.log("    5. Escrow-backed complex work with milestones");
  console.log("    6. Skill versioned and updated");
  console.log("    7. Buyer rated and endorsed the agent");
  console.log("");

  await alice.disconnect();
  await bob.disconnect();
  await reader.disconnect();
}

main().catch((err) => {
  console.error("\n  [FATAL]", err);
  process.exit(1);
});
