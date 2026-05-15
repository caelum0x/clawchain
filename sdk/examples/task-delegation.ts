/**
 * Task Delegation Example
 *
 * Demonstrates the full task lifecycle between two agents:
 *   1. Delegator creates a task assigned to a worker
 *   2. Worker accepts the task
 *   3. Worker completes the task with a result
 *   4. Delegator queries task status
 */

import { ClawChainAgent } from "../src/agent.js";

const DELEGATOR_MNEMONIC =
  process.env.DELEGATOR_MNEMONIC ??
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const WORKER_MNEMONIC =
  process.env.WORKER_MNEMONIC ??
  "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";

async function main(): Promise<void> {
  // --- Create two agents ---
  const delegator = new ClawChainAgent({
    name: "delegator-agent",
    mnemonic: DELEGATOR_MNEMONIC,
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    endpoint: "http://localhost:7777",
    supportedTools: ["orchestrate"],
  });

  const worker = new ClawChainAgent({
    name: "worker-agent",
    mnemonic: WORKER_MNEMONIC,
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    endpoint: "http://localhost:7778",
    supportedTools: ["summarize", "translate"],
  });

  await delegator.initialize();
  await worker.initialize();

  // Ensure both are registered
  if (!(await delegator.isRegistered())) await delegator.register();
  if (!(await worker.isRegistered())) await worker.register();

  console.log(`Delegator: ${delegator.getAddress()}`);
  console.log(`Worker:    ${worker.getAddress()}`);

  // --- 1. Delegate a task ---
  const delegateTx = await delegator.delegateTask({
    assignee: worker.getAddress(),
    description: "Summarize the latest governance proposals",
    requirements: "Return a JSON array of {id, title, summary}",
    budget: "500uclaw",
    deadlineBlocks: 100,
  });
  console.log(`Task delegated: tx=${delegateTx.transactionHash} code=${delegateTx.code}`);

  // Extract task ID from events
  const taskIdAttr = delegateTx.events
    .find((e) => e.type === "task_delegated")
    ?.attributes.find((a) => a.key === "task_id");
  const taskId = taskIdAttr ? Number(taskIdAttr.value) : 1;
  console.log(`Task ID: ${taskId}`);

  // --- 2. Worker accepts ---
  const acceptTx = await worker.acceptTask(taskId);
  console.log(`Task accepted: tx=${acceptTx.transactionHash} code=${acceptTx.code}`);

  // --- 3. Worker completes ---
  const result = JSON.stringify([
    { id: 1, title: "Increase validator set", summary: "Proposal to expand validator count to 50" },
  ]);
  const completeTx = await worker.completeTask(taskId, result);
  console.log(`Task completed: tx=${completeTx.transactionHash} code=${completeTx.code}`);

  // --- 4. Query task status ---
  const task = await delegator.getTask(taskId);
  console.log(`Task status: ${task.status}`);
  console.log(`Task result: ${task.result}`);

  // Query tasks by role
  const delegated = await delegator.getMyDelegatedTasks();
  console.log(`Delegator has ${delegated.tasks.length} delegated task(s)`);

  const assigned = await worker.getMyAssignedTasks();
  console.log(`Worker has ${assigned.tasks.length} assigned task(s)`);

  await delegator.shutdown();
  await worker.shutdown();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
