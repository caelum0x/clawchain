import { ClawChainClient } from "../src/index.js";

async function main(): Promise<void> {
  const client = new ClawChainClient({
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    mnemonic: process.env.CLAWCHAIN_MNEMONIC,
  });

  await client.connect();
  try {
    const delegator = process.env.CLAWCHAIN_AGENT_ADDRESS;
    if (delegator) {
      const tasks = await client.getTasksByDelegator(delegator);
      console.log("delegated tasks:", tasks.tasks.length);
    }

    if (!process.env.CLAWCHAIN_MNEMONIC || !process.env.CLAWCHAIN_RECIPIENT) {
      console.log("set CLAWCHAIN_MNEMONIC and CLAWCHAIN_RECIPIENT to run tx example");
      return;
    }

    const tx = await client.delegateTask({
      assignee: process.env.CLAWCHAIN_RECIPIENT,
      description: "Analyze orderbook imbalance and return execution plan.",
      requirements: "Return JSON with risk score and confidence.",
      budget: "500000uclaw",
      deadlineBlocks: 300,
    });
    console.log("delegate task tx:", tx.transactionHash);
  } finally {
    await client.disconnect();
  }
}

void main();
