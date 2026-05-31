/**
 * Round-trip helper (step 2/2): submit MsgUnshield with a clawproof-generated
 * Groth16 proof, withdrawing a previously-shielded commitment back to a public
 * address. Proves the privacy unshield path works end-to-end through the registry.
 *
 *   PRIV_HEX=$(cat /tmp/devkey.hex) COMMITMENT=.. NULLIFIER=.. PROOF=.. \
 *     AMOUNT=5000 ROOT=.. npx tsx scripts/roundtrip-unshield.ts
 */
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { fromHex } from "@cosmjs/encoding";

import { connectClawchainSigningClient } from "../src/lib/signing.js";

const RPC = process.env.RPC_URL ?? "http://localhost:26657";
const PRIV_HEX = (process.env.PRIV_HEX ?? "").trim();
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

async function main(): Promise<void> {
  if (PRIV_HEX.length !== 64) throw new Error("PRIV_HEX must be 64 hex chars");
  const wallet = await DirectSecp256k1Wallet.fromKey(fromHex(PRIV_HEX), "claw");
  const [account] = await wallet.getAccounts();
  if (!account) throw new Error("no account");
  const recipient = process.env.RECIPIENT ?? account.address;

  const client = await connectClawchainSigningClient(RPC, wallet, {
    gasPrice: GasPrice.fromString("0.025uclaw"),
  });

  const before = await client.getBalance(recipient, "uclaw");

  const msg = {
    typeUrl: "/clawchain.privacy.v1.MsgUnshield",
    value: {
      creator: account.address,
      commitment: env("COMMITMENT"),
      nullifier: env("NULLIFIER"),
      proof: env("PROOF"),
      amount: env("AMOUNT"),
      recipient,
      root: env("ROOT"),
    },
  };

  console.log(`unshield ${env("AMOUNT")}uclaw -> ${recipient}`);
  const res = await client.signAndBroadcast(account.address, [msg], 2.0);
  if (res.code !== 0) {
    console.error(`unshield FAILED code=${res.code} rawLog=${res.rawLog}`);
    client.disconnect();
    process.exit(1);
  }

  const after = await client.getBalance(recipient, "uclaw");
  const delta = BigInt(after.amount) - BigInt(before.amount);
  console.log(`code=0 height=${res.height} tx=${res.transactionHash}`);
  console.log(`recipient uclaw: ${before.amount} -> ${after.amount} (delta ${delta})`);
  console.log(`SUCCESS — unshield accepted; proof verified against on-chain VK.`);
  client.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
