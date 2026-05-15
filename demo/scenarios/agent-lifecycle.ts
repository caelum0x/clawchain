#!/usr/bin/env npx tsx

/**
 * ClawChain Demo Scenario: Agent Lifecycle
 *
 * Full agent lifecycle:
 *   register -> heartbeat -> accept task -> complete -> earn rewards
 *
 * Requires ALICE_MNEMONIC and BOB_MNEMONIC environment variables.
 * Alice acts as the agent, Bob acts as the task delegator.
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

async function main(): Promise<void> {
  console.log("\n  Agent Lifecycle Demo\n");

  if (!ALICE_MNEMONIC || !BOB_MNEMONIC) {
    console.error("  Error: Set ALICE_MNEMONIC and BOB_MNEMONIC environment variables.");
    console.error("  Example:");
    console.error('    ALICE_MNEMONIC="word1 word2 ..." BOB_MNEMONIC="word1 word2 ..." npx tsx scenarios/agent-lifecycle.ts');
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
  console.log(`  Alice (Agent)    : ${aliceAddr}`);
  console.log(`  Bob   (Delegator): ${bobAddr}`);

  // -------------------------------------------------------------------------
  step("1. Register Agent");
  // -------------------------------------------------------------------------

  try {
    const tx = await alice.registerAgent({
      name: `agent-${Date.now()}`,
      endpoint: "http://localhost:8080",
      pubkey: `pk-${Date.now()}`,
      supportedTools: ["text-generation", "code-review", "data-analysis"],
      pricingHint: JSON.stringify({ baseRate: "100uclaw" }),
      version: "1.0.0",
    });
    console.log(`  TX hash : ${tx.transactionHash}`);
    console.log(`  Code    : ${tx.code}`);
    console.log(`  Gas used: ${tx.gasUsed}`);
  } catch (e: unknown) {
    console.log(`  Skipped: ${(e as Error).message}`);
  }

  await sleep(3000);

  // Verify registration
  try {
    const info = await reader.getAgent(aliceAddr);
    console.log(`  Registered: ${info.registered}`);
    console.log(`  Name      : ${info.name}`);
    console.log(`  Endpoint  : ${info.endpoint}`);
    console.log(`  Tools     : ${(info.supportedTools ?? []).join(", ")}`);
    console.log(`  Deposit   : ${info.depositAmount ?? "0"} uclaw`);
  } catch (e: unknown) {
    console.log(`  Query failed: ${(e as Error).message}`);
  }

  // -------------------------------------------------------------------------
  step("2. Heartbeat (Prove Liveness)");
  // -------------------------------------------------------------------------

  for (let i = 0; i < 3; i++) {
    try {
      const tx = await alice.agentHeartbeat({
        nodeHeight: i + 1,
        endpoint: "http://localhost:8080",
        metadata: JSON.stringify({ iteration: i + 1, mode: "full" }),
      });
      console.log(`  Heartbeat #${i + 1}: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      console.log(`  Heartbeat #${i + 1} failed: ${(e as Error).message}`);
    }
    await sleep(2000);
  }

  // Check liveness
  try {
    const liveness = await reader.getAgentLiveness(aliceAddr);
    if (liveness.found) {
      console.log(`  Heartbeat count : ${liveness.liveness.heartbeatCount}`);
      console.log(`  Last HB height  : ${liveness.liveness.lastHeartbeatHeight}`);
      console.log(`  Reported height : ${liveness.liveness.reportedNodeHeight}`);
    }
  } catch {
    console.log("  Liveness query not available");
  }

  // -------------------------------------------------------------------------
  step("3. Delegate Task (Bob -> Alice)");
  // -------------------------------------------------------------------------

  let taskId: number | undefined;

  try {
    const tx = await bob.delegateTask({
      assignee: aliceAddr,
      description: "Perform security audit on DeFi smart contract",
      requirements: JSON.stringify({
        scope: "Full contract audit",
        deliverables: ["Vulnerability report", "Severity ratings", "Remediation steps"],
      }),
      budget: "10000000", // 10 CLAW
      deadlineBlocks: 500,
    });
    console.log(`  DelegateTask TX: ${tx.transactionHash} (code=${tx.code})`);

    // Extract task ID from events
    for (const event of tx.events) {
      const attr = event.attributes.find((a) => a.key === "task_id");
      if (attr) {
        taskId = parseInt(attr.value, 10);
        console.log(`  Task ID: ${taskId}`);
        break;
      }
    }
  } catch (e: unknown) {
    console.log(`  DelegateTask failed: ${(e as Error).message}`);
  }

  await sleep(3000);

  // -------------------------------------------------------------------------
  step("4. Accept Task");
  // -------------------------------------------------------------------------

  if (taskId !== undefined) {
    try {
      const tx = await alice.acceptTask({ taskId });
      console.log(`  AcceptTask TX: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      console.log(`  AcceptTask failed: ${(e as Error).message}`);
    }
    await sleep(2000);

    // Query task status
    try {
      const task = await reader.getTask(taskId);
      console.log(`  Task status: ${task.status}`);
      console.log(`  Assignee   : ${task.assigneeAddress}`);
      console.log(`  Budget     : ${task.budget}`);
    } catch (e: unknown) {
      console.log(`  Task query failed: ${(e as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  step("5. Complete Task");
  // -------------------------------------------------------------------------

  if (taskId !== undefined) {
    try {
      const tx = await alice.completeTask({
        taskId,
        result: JSON.stringify({
          findings: [
            { severity: "high", description: "Reentrancy vulnerability in withdraw()" },
            { severity: "medium", description: "Missing access control on setFee()" },
            { severity: "low", description: "Unused variable in constructor" },
          ],
          overallRisk: "medium",
          reportUri: "ipfs://QmExampleAuditReport",
          completedAt: new Date().toISOString(),
        }),
      });
      console.log(`  CompleteTask TX: ${tx.transactionHash} (code=${tx.code})`);
    } catch (e: unknown) {
      console.log(`  CompleteTask failed: ${(e as Error).message}`);
    }
    await sleep(2000);

    // Verify completion
    try {
      const task = await reader.getTask(taskId);
      console.log(`  Final status : ${task.status}`);
      console.log(`  Result       : ${task.result.slice(0, 80)}...`);
    } catch (e: unknown) {
      console.log(`  Task query failed: ${(e as Error).message}`);
    }
  }

  // -------------------------------------------------------------------------
  step("6. Query Rewards");
  // -------------------------------------------------------------------------

  try {
    const rewards = await reader.getAgentRewards(aliceAddr);
    console.log(`  Address            : ${rewards.address}`);
    console.log(`  Cumulative rewards : ${rewards.cumulativeRewards} ${rewards.denom}`);
  } catch (e: unknown) {
    console.log(`  Rewards query: ${(e as Error).message}`);
  }

  // -------------------------------------------------------------------------
  step("7. Agent Stats");
  // -------------------------------------------------------------------------

  try {
    const stats = await reader.getAgentStats(aliceAddr);
    if (stats.found) {
      console.log(`  Total actions      : ${stats.stats.totalActions}`);
      console.log(`  Intents created    : ${stats.stats.intentsCreated}`);
      console.log(`  Intents finalized  : ${stats.stats.intentsFinalized}`);
      console.log(`  First active block : ${stats.stats.firstActiveBlock}`);
      console.log(`  Last active block  : ${stats.stats.lastActiveBlock}`);
    }
  } catch {
    console.log("  Agent stats not available");
  }

  // Check all tasks by assignee
  try {
    const tasks = await reader.getTasksByAssignee(aliceAddr);
    console.log(`  Tasks assigned to Alice: ${tasks.tasks?.length ?? 0}`);
    for (const t of (tasks.tasks ?? []).slice(0, 5)) {
      console.log(`    - Task #${t.taskId}: ${t.status} (budget: ${t.budget})`);
    }
  } catch {
    console.log("  Tasks query not available");
  }

  // -------------------------------------------------------------------------
  step("Complete");
  // -------------------------------------------------------------------------

  console.log("  Agent lifecycle demonstrated:");
  console.log("    1. Registered on-chain with capabilities");
  console.log("    2. Heartbeated 3 times to prove liveness");
  console.log("    3. Received a delegated task");
  console.log("    4. Accepted and completed the task");
  console.log("    5. Mining rewards accruing");
  console.log("");

  await alice.disconnect();
  await bob.disconnect();
  await reader.disconnect();
}

main().catch((err) => {
  console.error("\n  [FATAL]", err);
  process.exit(1);
});
