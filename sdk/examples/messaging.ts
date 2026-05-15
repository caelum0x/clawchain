import { ClawChainClient } from "../src/index.js";

async function main(): Promise<void> {
  const client = new ClawChainClient({
    rpcUrl: process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657",
    mnemonic: process.env.CLAWCHAIN_MNEMONIC,
  });

  await client.connect();
  try {
    const address = process.env.CLAWCHAIN_AGENT_ADDRESS;
    if (address) {
      const inbox = await client.getMessages(address);
      console.log("messages:", inbox.messages.length);
    }

    if (!process.env.CLAWCHAIN_MNEMONIC || !process.env.CLAWCHAIN_RECIPIENT) {
      console.log("set CLAWCHAIN_MNEMONIC and CLAWCHAIN_RECIPIENT to run tx example");
      return;
    }

    const tx = await client.sendOnChainMessage({
      recipient: process.env.CLAWCHAIN_RECIPIENT,
      ciphertext: "base64-ciphertext-placeholder",
      nonce: "base64-nonce-placeholder",
    });
    console.log("send message tx:", tx.transactionHash);
  } finally {
    await client.disconnect();
  }
}

void main();
