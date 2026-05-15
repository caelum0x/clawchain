import test from "node:test";
import assert from "node:assert/strict";

import { Secp256k1 } from "@cosmjs/crypto";
import { computeSharedSecretSecp256k1 } from "./agent.js";

test("computeSharedSecretSecp256k1 is symmetric across peers", async () => {
  const alicePriv = Uint8Array.from(Array(32).fill(1));
  const bobPriv = Uint8Array.from(Array(32).fill(2));

  const { pubkey: alicePub } = await Secp256k1.makeKeypair(alicePriv);
  const { pubkey: bobPub } = await Secp256k1.makeKeypair(bobPriv);
  const alicePubHex = Buffer.from(Secp256k1.compressPubkey(alicePub)).toString("hex");
  const bobPubHex = Buffer.from(Secp256k1.compressPubkey(bobPub)).toString("hex");

  const sharedAB = await computeSharedSecretSecp256k1(alicePriv, bobPubHex);
  const sharedBA = await computeSharedSecretSecp256k1(bobPriv, alicePubHex);

  assert.equal(sharedAB.length, 32);
  assert.equal(sharedBA.length, 32);
  assert.deepEqual(Buffer.from(sharedAB), Buffer.from(sharedBA));
  assert.notDeepEqual(Buffer.from(sharedAB), Buffer.alloc(32));
});
