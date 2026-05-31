/**
 * Live verification: broadcast a real MsgShield through the clawchain registry.
 *
 * This is the on-chain proof that the cosmjs registry fix works end-to-end —
 * encode, sign, broadcast, accepted (code=0) — not just a unit-level encode.
 *
 * Usage (chain must be running on localhost:26657):
 *   PRIV_HEX=$(cat /tmp/devkey.hex) npx tsx scripts/live-shield-check.ts
 */
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { fromHex } from "@cosmjs/encoding";
import * as crypto from "crypto";

import { connectClawchainSigningClient } from "../src/lib/signing.js";

const RPC = process.env.RPC_URL ?? "http://localhost:26657";
const PRIV_HEX = (process.env.PRIV_HEX ?? "").trim();

async function main(): Promise<void> {
  if (PRIV_HEX.length !== 64) {
    throw new Error(`PRIV_HEX must be 64 hex chars, got ${PRIV_HEX.length}`);
  }

  const wallet = await DirectSecp256k1Wallet.fromKey(fromHex(PRIV_HEX), "claw");
  const [account] = await wallet.getAccounts();
  if (!account) throw new Error("no account derived");
  console.log(`signer: ${account.address}`);

  const client = await connectClawchainSigningClient(RPC, wallet, {
    gasPrice: GasPrice.fromString("0.025uclaw"),
  });

  const amount = 1000;
  const blinding = crypto.randomBytes(32);
  const msg = {
    typeUrl: "/clawchain.privacy.v1.MsgShield",
    value: {
      creator: account.address,
      amount: String(amount),
      coins: "uclaw", // denom marker, not a coin string (quantity is in `amount`)
      blinding,
    },
  };

  console.log("broadcasting MsgShield (1000uclaw) ...");
  const res = await client.signAndBroadcast(account.address, [msg], "auto");

  console.log(`code=${res.code} height=${res.height} txhash=${res.transactionHash}`);
  if (res.code !== 0) {
    console.error(`FAILED rawLog: ${res.rawLog}`);
    client.disconnect();
    process.exit(1);
  }

  let commitment = "";
  for (const ev of res.events ?? []) {
    if (ev.type === "shield") {
      const a = ev.attributes.find((x: { key: string }) => x.key === "commitment");
      if (a) commitment = typeof a.value === "string" ? a.value : new TextDecoder().decode(a.value);
    }
  }
  console.log(`SUCCESS — shield accepted on-chain. commitment=${commitment || "(not in events)"}`);
  client.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
