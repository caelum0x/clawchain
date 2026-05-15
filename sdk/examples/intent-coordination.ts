/**
 * Intent Coordination Example
 *
 * Demonstrates multi-agent intent coordination:
 *   1. Agent A submits an intent requesting collaboration
 *   2. Agent B responds (accepts)
 *   3. Agent A finalizes the intent
 *   4. Both agents query the intent status
 */

import { ClawChainAgent } from "../src/agent.js";

const AGENT_A_MNEMONIC =
  process.env.AGENT_A_MNEMONIC ??
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const AGENT_B_MNEMONIC =
  process.env.AGENT_B_MNEMONIC ??
  "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";

async function main(): Promise<void> {
  const agentA = new ClawChainAgent({
    name: "coordinator",
    mnemonic: AGENT_A_MNEMONIC,
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    endpoint: "http://localhost:7777",
  });

  const agentB = new ClawChainAgent({
    name: "responder",
    mnemonic: AGENT_B_MNEMONIC,
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    endpoint: "http://localhost:7778",
  });

  await agentA.initialize();
  await agentB.initialize();

  if (!(await agentA.isRegistered())) await agentA.register();
  if (!(await agentB.isRegistered())) await agentB.register();

  // --- 1. Submit an intent ---
  const intentTx = await agentA.submitIntent(
    "data_share",
    "Share aggregated market data for analysis",
    JSON.stringify({
      dataType: "market_prices",
      format: "json",
      timeRange: "24h",
    }),
    1, // minResponses
  );
  console.log(`Intent submitted: tx=${intentTx.transactionHash} code=${intentTx.code}`);

  // Extract intent ID from events
  const intentIdAttr = intentTx.events
    .find((e) => e.type === "intent_submitted")
    ?.attributes.find((a) => a.key === "intent_id");
  const intentId = intentIdAttr ? Number(intentIdAttr.value) : 1;
  console.log(`Intent ID: ${intentId}`);

  // --- 2. Agent B responds ---
  const respondTx = await agentB.respondToIntent(
    intentId,
    true,
    JSON.stringify({ availableData: ["BTC/USD", "ETH/USD"] }),
  );
  console.log(`Response: tx=${respondTx.transactionHash} code=${respondTx.code}`);

  // --- 3. Agent A finalizes ---
  const finalizeTx = await agentA.finalizeIntent(intentId);
  console.log(`Finalized: tx=${finalizeTx.transactionHash} code=${finalizeTx.code}`);

  // --- 4. Query intent ---
  const client = (agentA as any).client;
  const intent = await client.getIntent(intentId);
  console.log(`Intent status: ${intent.status}`);
  console.log(`Intent type: ${intent.intentType}`);

  await agentA.shutdown();
  await agentB.shutdown();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
