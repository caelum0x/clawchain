import { ClawChainClient } from "../src/index.js";

async function main(): Promise<void> {
  const client = new ClawChainClient({
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    mnemonic: process.env.CLAWCHAIN_MNEMONIC,
  });

  await client.connect();
  try {
    const skills = await client.getSkills();
    console.log("skills:", skills.skills.length);

    if (!process.env.CLAWCHAIN_MNEMONIC) {
      console.log("set CLAWCHAIN_MNEMONIC to run tx examples");
      return;
    }

    const listTx = await client.listSkill({
      name: "example-skill",
      description: "Example skill listing from SDK template.",
      price: "250000",
      denom: "uclaw",
    });
    console.log("list skill tx:", listTx.transactionHash);
  } finally {
    await client.disconnect();
  }
}

void main();
