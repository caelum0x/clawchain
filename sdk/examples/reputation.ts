import { ClawChainClient } from "../src/index.js";

async function main(): Promise<void> {
  const client = new ClawChainClient({
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    mnemonic: process.env.CLAWCHAIN_MNEMONIC,
  });

  await client.connect();
  try {
    const agentAddress = process.env.CLAWCHAIN_AGENT_ADDRESS;
    if (agentAddress) {
      const rep = await client.getReputation(agentAddress);
      console.log("reputation found:", rep.found);
    }

    if (!process.env.CLAWCHAIN_MNEMONIC || !agentAddress) {
      console.log("set CLAWCHAIN_MNEMONIC and CLAWCHAIN_AGENT_ADDRESS to run tx example");
      return;
    }

    const tx = await client.endorseAgent({
      agentAddress,
      reason: "Reliable delivery and clear communication.",
    });
    console.log("endorse tx:", tx.transactionHash);
  } finally {
    await client.disconnect();
  }
}

void main();
