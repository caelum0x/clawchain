import { ClawChainClient } from "../src/index.js";

async function main(): Promise<void> {
  const client = new ClawChainClient({
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    mnemonic: process.env.CLAWCHAIN_MNEMONIC,
  });

  await client.connect();
  try {
    const root = await client.getMerkleRoot();
    console.log("merkle root:", root);

    if (!process.env.CLAWCHAIN_MNEMONIC) {
      console.log("set CLAWCHAIN_MNEMONIC to run tx examples");
      return;
    }

    const tx = await client.shield({
      amount: 1_000_000,
      coins: "uclaw",
    });
    console.log("shield tx:", tx.transactionHash);
  } finally {
    await client.disconnect();
  }
}

void main();
