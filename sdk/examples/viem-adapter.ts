import { createClawViemClient } from "../src/viem.js";

const mnemonic = process.env.CLAW_MNEMONIC;

const client = createClawViemClient({
  rpcUrl: process.env.CLAW_RPC_URL ?? "http://localhost:26657",
  mnemonic,
});

await client.connect();

const chainId = await client.getChainId();
const height = await client.getBlockNumber();
console.log(`connected ${chainId} at height ${height}`);

if (mnemonic) {
  const { address } = client.getAccount();
  const balance = await client.getBalance({ address });
  console.log(`${address} balance: ${balance}uclaw`);
} else {
  console.log("set CLAW_MNEMONIC to enable signed sendTransaction/writeContract calls");
}

await client.disconnect();
