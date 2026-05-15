/**
 * Agent Lifecycle Example
 *
 * Demonstrates the full agent lifecycle using the high-level ClawChainAgent:
 *   1. Initialize and connect
 *   2. Register on-chain (locks deposit)
 *   3. Send heartbeats
 *   4. Perform actions
 *   5. Check balance and stats
 *   6. Deregister (withdraws deposit)
 *   7. Shutdown
 */

import { ClawChainAgent } from "../src/agent.js";

const MNEMONIC =
  process.env.AGENT_MNEMONIC ??
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

async function main(): Promise<void> {
  // --- 1. Create and initialize the agent ---
  const agent = new ClawChainAgent({
    name: "lifecycle-demo",
    mnemonic: MNEMONIC,
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    endpoint: "http://localhost:7777",
    supportedTools: ["search", "summarize"],
    pricingHint: JSON.stringify({ base: "100uclaw" }),
    version: "1.0.0",
  });

  await agent.initialize();
  console.log(`Agent address: ${agent.getAddress()}`);

  // --- 2. Register ---
  const alreadyRegistered = await agent.isRegistered();
  if (!alreadyRegistered) {
    const regTx = await agent.register();
    console.log(`Registered: tx=${regTx.transactionHash} code=${regTx.code}`);
  } else {
    console.log("Agent already registered, skipping registration.");
  }

  // --- 3. Heartbeat ---
  // In production, heartbeats run in a loop every N blocks.
  const client = (agent as any).client; // access low-level client for heartbeat
  const hbTx = await client.agentHeartbeat({
    nodeHeight: 100,
    endpoint: "http://localhost:7777",
    metadata: JSON.stringify({ mode: "demo" }),
  });
  console.log(`Heartbeat: tx=${hbTx.transactionHash} code=${hbTx.code}`);

  // --- 4. Agent action ---
  const actionTx = await client.agentAction({
    actionType: "query",
    payload: JSON.stringify({ query: "What is the current block height?" }),
  });
  console.log(`Action: tx=${actionTx.transactionHash} code=${actionTx.code}`);

  // --- 5. Query balance and stats ---
  const balance = await agent.checkBalance();
  console.log(`Balance: ${balance} uclaw`);

  const params = await agent.getAgentParams();
  console.log(`Agent params:`, JSON.stringify(params.params, null, 2));

  const stats = await agent.getMyStats();
  console.log(`Stats:`, JSON.stringify(stats.stats, null, 2));

  // --- 6. Deregister ---
  const deregTx = await agent.deregister();
  console.log(`Deregistered: tx=${deregTx.transactionHash} code=${deregTx.code}`);

  // --- 7. Shutdown ---
  await agent.shutdown();
  console.log("Agent shut down.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
