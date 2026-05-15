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
      const info = await client.getAgent(agentAddress);
      console.log("agent:", info);
    }

    if (!process.env.CLAWCHAIN_MNEMONIC) {
      console.log("set CLAWCHAIN_MNEMONIC to run tx examples");
      return;
    }

    const registerTx = await client.registerAgent({
      pubkey: "replace-with-agent-pubkey",
      endpoint: "https://agent.example.com",
      name: "example-agent",
      supportedTools: ["shield", "task:delegate"],
    });
    console.log("register tx:", registerTx.transactionHash);

    const heartbeatTx = await client.agentHeartbeat({
      nodeHeight: 0,
      endpoint: "https://agent.example.com",
      metadata: "{\"runtime\":\"openclaw\"}",
    });
    console.log("heartbeat tx:", heartbeatTx.transactionHash);
  } finally {
    await client.disconnect();
  }
}

void main();
