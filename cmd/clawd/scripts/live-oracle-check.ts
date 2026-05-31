/**
 * Live verification: oracle commit-reveal flow through the clawchain registry.
 *
 * Prevote commits SHA256("{salt}:{rates}:{valoper}")[:20] (tmhash-truncated), then
 * the vote in the NEXT vote period reveals salt + rates. Proves the custom oracle
 * Msg codecs encode and the chain accepts the multi-step flow.
 *
 *   PRIV_HEX=$(cat /tmp/devkey.hex) VALOPER=clawvaloper1... \
 *     npx tsx scripts/live-oracle-check.ts
 */
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { fromHex } from "@cosmjs/encoding";
import { createHash } from "node:crypto";

import { connectClawchainSigningClient } from "../src/lib/signing.js";

const RPC = process.env.RPC_URL ?? "http://localhost:26657";
const PRIV_HEX = (process.env.PRIV_HEX ?? "").trim();
const VALOPER = process.env.VALOPER ?? "";
const VOTE_PERIOD = Number(process.env.VOTE_PERIOD ?? "6");
const SALT = process.env.SALT ?? "abcd"; // keeper requires salt length 1..4
const RATES = process.env.RATES ?? "1.50uusd";

/** tmhash truncated = first 20 bytes of SHA256, hex-encoded (matches GetAggregateVoteHash). */
function voteHash(salt: string, rates: string, valoper: string): string {
  const src = `${salt}:${rates}:${valoper}`;
  return createHash("sha256").update(src).digest("hex").slice(0, 40); // 20 bytes = 40 hex
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  if (PRIV_HEX.length !== 64) throw new Error("PRIV_HEX must be 64 hex chars");
  if (!VALOPER) throw new Error("VALOPER required");
  const wallet = await DirectSecp256k1Wallet.fromKey(fromHex(PRIV_HEX), "claw");
  const [account] = await wallet.getAccounts();
  if (!account) throw new Error("no account");
  const feeder = account.address;
  const client = await connectClawchainSigningClient(RPC, wallet, {
    gasPrice: GasPrice.fromString("0.025uclaw"),
  });

  // Ensure the feeder is authorized for the validator (operator self-feed is fine too).
  const delegate = await client.signAndBroadcast(
    feeder,
    [{ typeUrl: "/clawchain.oracle.v1beta1.MsgDelegateFeedConsent", value: { operator: VALOPER, delegate: feeder } }],
    2.0,
  );
  console.log(`set-feeder: code=${delegate.code} (height ${delegate.height})`);

  const hash = voteHash(SALT, RATES, VALOPER);
  console.log(`prevote hash=${hash} (salt=${SALT} rates=${RATES})`);
  const pre = await client.signAndBroadcast(
    feeder,
    [{ typeUrl: "/clawchain.oracle.v1beta1.MsgAggregateExchangeRatePrevote", value: { hash, feeder, validator: VALOPER } }],
    2.0,
  );
  if (pre.code !== 0) {
    console.error(`prevote FAILED code=${pre.code} rawLog=${pre.rawLog}`);
    client.disconnect();
    process.exit(1);
  }
  const prevoteHeight = pre.height;
  console.log(`prevote: code=0 height=${prevoteHeight} tx=${pre.transactionHash}`);

  // Reveal must land in the vote period AFTER the prevote's period.
  const prevotePeriodEnd = (Math.floor(prevoteHeight / VOTE_PERIOD) + 1) * VOTE_PERIOD;
  console.log(`waiting for next vote period (block > ${prevotePeriodEnd}) ...`);
  for (;;) {
    const h = await client.getHeight();
    if (h > prevotePeriodEnd) break;
    await sleep(1000);
  }

  const vote = await client.signAndBroadcast(
    feeder,
    [
      {
        typeUrl: "/clawchain.oracle.v1beta1.MsgAggregateExchangeRateVote",
        value: { salt: SALT, exchangeRates: RATES, feeder, validator: VALOPER },
      },
    ],
    2.0,
  );
  if (vote.code !== 0) {
    console.error(`vote FAILED code=${vote.code} rawLog=${vote.rawLog}`);
    client.disconnect();
    process.exit(1);
  }
  console.log(`vote: code=0 height=${vote.height} tx=${vote.transactionHash}`);
  console.log(`SUCCESS — oracle commit-reveal accepted on-chain.`);
  client.disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
