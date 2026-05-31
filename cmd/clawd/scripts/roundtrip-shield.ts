/**
 * Round-trip helper (step 1/2): shield a deterministic amount/blinding so the
 * off-chain clawproof prover can reproduce the same commitment + witness.
 *
 * The on-chain keeper computes commitment = MiMC(amount, bigInt(blindingBytes)).
 * We pass blinding as the 32-byte big-endian encoding of a uint64, so it equals
 * clawproof's `--blinding <uint>` and both sides derive the identical commitment.
 *
 *   PRIV_HEX=$(cat /tmp/devkey.hex) AMOUNT=5000 BLINDING=12345 \
 *     npx tsx scripts/roundtrip-shield.ts
 */
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { fromHex, toHex } from "@cosmjs/encoding";

import { connectClawchainSigningClient } from "../src/lib/signing.js";

const RPC = process.env.RPC_URL ?? "http://localhost:26657";
const PRIV_HEX = (process.env.PRIV_HEX ?? "").trim();
const AMOUNT = BigInt(process.env.AMOUNT ?? "5000");
const BLINDING = BigInt(process.env.BLINDING ?? "12345");

/** Encode a uint64-range bigint as 32 big-endian bytes (matches big.Int.SetBytes). */
function blinding32(v: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 31; i >= 0 && x > 0n; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

async function main(): Promise<void> {
  if (PRIV_HEX.length !== 64) throw new Error(`PRIV_HEX must be 64 hex chars`);
  const wallet = await DirectSecp256k1Wallet.fromKey(fromHex(PRIV_HEX), "claw");
  const [account] = await wallet.getAccounts();
  if (!account) throw new Error("no account");
  const client = await connectClawchainSigningClient(RPC, wallet, {
    gasPrice: GasPrice.fromString("0.025uclaw"),
  });

  const blinding = blinding32(BLINDING);
  const msg = {
    typeUrl: "/clawchain.privacy.v1.MsgShield",
    value: {
      creator: account.address,
      amount: AMOUNT.toString(),
      coins: "uclaw",
      blinding,
    },
  };
  console.log(`shield amount=${AMOUNT} blinding=${BLINDING} blinding32=0x${toHex(blinding)}`);
  const res = await client.signAndBroadcast(account.address, [msg], 2.0);
  if (res.code !== 0) {
    console.error(`shield FAILED code=${res.code} rawLog=${res.rawLog}`);
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
  console.log(`code=0 height=${res.height} tx=${res.transactionHash}`);
  console.log(`COMMITMENT=${commitment}`);
  client.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
