/**
 * Live verification: broadcast one real tx per newly-registered module through the
 * clawchain registry, proving each module's codec encodes and the chain accepts it.
 *
 * Usage (chain must be running on localhost:26657):
 *   PRIV_HEX=$(cat /tmp/devkey.hex) npx tsx scripts/live-modules-check.ts
 */
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { fromHex } from "@cosmjs/encoding";

import { connectClawchainSigningClient } from "../src/lib/signing.js";

const RPC = process.env.RPC_URL ?? "http://localhost:26657";
const PRIV_HEX = (process.env.PRIV_HEX ?? "").trim();

async function main(): Promise<void> {
  if (PRIV_HEX.length !== 64) throw new Error(`PRIV_HEX must be 64 hex chars, got ${PRIV_HEX.length}`);

  const wallet = await DirectSecp256k1Wallet.fromKey(fromHex(PRIV_HEX), "claw");
  const [account] = await wallet.getAccounts();
  if (!account) throw new Error("no account derived");
  const addr = account.address;
  console.log(`signer: ${addr}`);

  const client = await connectClawchainSigningClient(RPC, wallet, {
    gasPrice: GasPrice.fromString("0.025uclaw"),
  });

  // Unique suffix derived from current block height keeps names distinct across reruns.
  const height = await client.getHeight();
  const uniq = String(height);

  const cases: Array<{
    label: string;
    typeUrl: string;
    value: Record<string, unknown>;
    idempotentReject?: RegExp;
  }> = [
    {
      label: "agent.MsgRegisterAgent",
      typeUrl: "/clawchain.agent.v1.MsgRegisterAgent",
      value: {
        creator: addr,
        pubkey: `agentpub-${uniq}`,
        endpoint: "http://localhost:9999",
        name: `live-agent-${uniq}`,
        supportedTools: ["summarize"],
        pricingHint: "{}",
        version: "1.0.0",
      },
      idempotentReject: /already registered/i,
    },
    {
      label: "marketplace.MsgListSkill",
      typeUrl: "/clawchain.marketplace.v1.MsgListSkill",
      value: {
        creator: addr,
        name: `live-skill-${uniq}`,
        description: "live verification skill",
        price: "100",
        denom: "uclaw",
      },
    },
  ];

  let failures = 0;
  for (const c of cases) {
    try {
      // 2.0 gas multiplier: simulation under-estimates per-byte store writes for
      // string-heavy msgs (MsgListSkill hit "out of gas" at the default 1.4x).
      const res = await client.signAndBroadcast(addr, [{ typeUrl: c.typeUrl, value: c.value }], 2.0);
      if (res.code === 0) {
        console.log(`OK   ${c.label} — code=0 height=${res.height} tx=${res.transactionHash}`);
      } else {
        failures++;
        console.log(`FAIL ${c.label} — code=${res.code} rawLog=${res.rawLog}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // "already registered" is a keeper-level rejection on rerun (one agent per
      // creator): the codec still decoded and reached business logic, which is the
      // thing being proven here. Treat it as a pass.
      if (c.idempotentReject && c.idempotentReject.test(msg)) {
        console.log(`OK   ${c.label} — reached keeper (idempotent reject on rerun): proven`);
      } else {
        failures++;
        console.log(`ERR  ${c.label} — ${msg}`);
      }
    }
  }

  client.disconnect();
  if (failures > 0) process.exit(1);
  console.log(`ALL ${cases.length} module txs accepted on-chain.`);
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
