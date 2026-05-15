/**
 * Query Dashboard Example
 *
 * Demonstrates read-only queries across all ClawChain modules.
 * No mnemonic required — works with a public RPC endpoint.
 */

import { ClawChainClient } from "../src/client.js";

async function main(): Promise<void> {
  const client = new ClawChainClient({
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
  });
  await client.connect();

  console.log("=== ClawChain Dashboard ===\n");

  // --- Agent Module ---
  console.log("--- Agent Module ---");
  const agentParams = await client.getAgentParams();
  console.log("Params:", JSON.stringify(agentParams.params, null, 2));

  const liveAgents = await client.getLiveAgents();
  console.log(`Live agents: ${liveAgents.agents.length}`);
  for (const a of liveAgents.agents) {
    console.log(`  ${a.name} (${a.address}) — last heartbeat block: ${a.liveness.lastHeartbeatHeight}`);
  }

  const recent = await client.getRecentActivity(5);
  console.log(`Recent activity (last 5):`);
  for (const act of recent.activities) {
    console.log(`  [${act.actionType}] by ${act.creator} at block ${act.blockHeight}`);
  }

  // --- Privacy Module ---
  console.log("\n--- Privacy Module ---");
  const treeStats = await client.getTreeStats();
  console.log(`Merkle tree: ${treeStats.leafCount} leaves, depth ${treeStats.treeDepth}`);
  console.log(`Current root: ${treeStats.currentRoot}`);

  const rootHistory = await client.getRootHistory(0, 3);
  console.log(`Root history (first 3): ${rootHistory.roots.length} entries`);

  // --- Marketplace Module ---
  console.log("\n--- Marketplace ---");
  const skills = await client.getSkills();
  console.log(`Listed skills: ${skills.skills.length}`);
  for (const s of skills.skills) {
    console.log(`  #${s.id} ${s.name} — ${s.price} ${s.denom} (${s.purchaseCount} purchases)`);
  }

  // --- Reputation Module ---
  console.log("\n--- Reputation ---");
  const topAgents = await client.getTopAgents(5);
  console.log(`Top agents by reputation:`);
  for (const r of topAgents.agents) {
    const avg = (r.avgRatingBps / 100).toFixed(1);
    console.log(`  ${r.agentAddress} — avg ${avg}/50, ${r.endorsements} endorsements, uptime ${r.uptimeScoreBps}bps`);
  }

  // --- Governance Module ---
  console.log("\n--- Governance ---");
  const proposals = await client.getProposals();
  console.log(`Active proposals: ${proposals.proposals.length}`);
  for (const p of proposals.proposals) {
    console.log(`  #${p.id} "${p.title}" — ${p.status}`);
  }

  await client.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
