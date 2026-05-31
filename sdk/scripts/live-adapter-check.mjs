/**
 * Reproducible LIVE check for the @clawchain/sdk viem-style adapter against a running
 * ClawChain node. Exercises the read path, a signed bank send (via the offlineSigner
 * path), and — if a CosmWasm contract is supplied — a smart query + execute.
 *
 * Build first: `npm run build` (this imports from ../dist).
 *
 * Usage (against e.g. scripts/testnet/local-multinode.sh):
 *   PRIV_HEX=<64-hex secp256k1 key> RPC_URL=http://localhost:26657 \
 *     [CONTRACT=claw1... CW_QUERY='{"verifier":{}}' CW_FN=release] \
 *     node sdk/scripts/live-adapter-check.mjs
 *
 * Exits non-zero if any step fails (suitable for CI smoke against a devnet/testnet).
 */
import { fromHex } from "@cosmjs/encoding";
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing";
import { createClawViemClient } from "../dist/index.js";

const RPC_URL = process.env.RPC_URL ?? "http://localhost:26657";
const PRIV_HEX = (process.env.PRIV_HEX ?? "").trim();
const PREFIX = process.env.PREFIX ?? "claw";
const DENOM = process.env.DENOM ?? "uclaw";
const GAS_PRICE = process.env.GAS_PRICE ?? "0.0001uclaw";
const CONTRACT = process.env.CONTRACT;
const CW_QUERY = process.env.CW_QUERY; // JSON string, e.g. {"verifier":{}}
const CW_FN = process.env.CW_FN ?? "release";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

async function main() {
  if (PRIV_HEX.length !== 64) fail("PRIV_HEX must be a 64-char hex secp256k1 key");

  const signer = await DirectSecp256k1Wallet.fromKey(fromHex(PRIV_HEX), PREFIX);
  const [account] = await signer.getAccounts();
  if (!account) fail("could not derive account from PRIV_HEX");

  const client = createClawViemClient({ rpcUrl: RPC_URL, offlineSigner: signer, gasPrice: GAS_PRICE });
  await client.connect();

  const chainId = await client.getChainId();
  const height = await client.getBlockNumber();
  const addr = client.getAccount().address;
  const balance = await client.getBalance({ address: addr, denom: DENOM });
  console.log(`chainId=${chainId} height=${height} account=${addr} balance=${balance}${DENOM}`);

  // Signed bank send (to self — proves the offlineSigner write path).
  const send = await client.sendTransaction({ to: addr, value: 1000n, denom: DENOM });
  if (send.code !== 0) fail(`bank send code=${send.code} rawLog=${send.rawLog}`);
  console.log(`bank send: code=0 height=${send.height} tx=${send.hash}`);

  if (CONTRACT) {
    if (CW_QUERY) {
      const parsed = JSON.parse(CW_QUERY);
      const fn = Object.keys(parsed)[0];
      const q = await client.readContract({ address: CONTRACT, functionName: fn, args: parsed[fn] });
      console.log(`readContract ${fn}: ${JSON.stringify(q)}`);
    }
    const exec = await client.writeContract({ address: CONTRACT, functionName: CW_FN });
    if (exec.code !== 0) fail(`writeContract ${CW_FN} code=${exec.code} rawLog=${exec.rawLog}`);
    console.log(`writeContract ${CW_FN}: code=0 height=${exec.height} tx=${exec.hash}`);
  }

  await client.disconnect();
  console.log("LIVE ADAPTER CHECK OK");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
