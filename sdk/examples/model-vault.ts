// Runnable example: drive a ModelVault contract through @clawchain/sdk's
// ModelVaultClient (docs/plans/2026-06-01-ai-model-tokens.md, P2/P4).
//
// Read-only by default:
//   CLAW_VAULT=<contract-addr> npx tsx sdk/examples/model-vault.ts
// Signed buy + stake + claim demo (needs a funded key and the model denom):
//   CLAW_VAULT=<addr> CLAW_MNEMONIC="..." CLAW_MODEL_DENOM="factory/<iss>/<sub>" \
//     npx tsx sdk/examples/model-vault.ts
//
// Mirrors the read-only-then-signed shape of viem-adapter.ts / wagmi-adapter.ts.

import { createModelVaultClient } from "../src/model-vault.js";

const contract = process.env.CLAW_VAULT;
if (!contract) {
  console.log("set CLAW_VAULT=<model-vault contract address> to run this example");
  process.exit(0);
}

const mnemonic = process.env.CLAW_MNEMONIC;
const modelDenom = process.env.CLAW_MODEL_DENOM;

const client = createModelVaultClient({
  rpcUrl: process.env.CLAW_RPC_URL ?? "http://localhost:26657",
  contract,
  mnemonic,
});

await client.connect();

// --- Reads (no signer required) ---
const config = await client.config();
console.log(
  `vault ${contract}\n  model_denom=${config.model_denom} reserve_denom=${config.reserve_denom} fee_bps=${config.fee_bps}`,
);

const pool = await client.pool();
const spot =
  BigInt(pool.inventory) > 0n
    ? Number(pool.reserve) / Number(pool.inventory)
    : 0;
console.log(
  `  pool reserve=${pool.reserve} inventory=${pool.inventory} spot≈${spot.toFixed(6)} ${config.reserve_denom}/token`,
);

const poolInfo = await client.poolInfo();
console.log(
  `  dividend pool total_staked=${poolInfo.total_staked} reward_index=${poolInfo.reward_per_token_stored}`,
);

const buyQuote = await client.quote("buy", "100000");
console.log(
  `  quote buy 100000${config.reserve_denom} -> ${buyQuote.amount_out} ${buyQuote.denom_out}`,
);

// --- Signed demo (buy -> stake -> claim) ---
if (mnemonic && modelDenom) {
  const address = client.getAddress();
  console.log(`signing as ${address}`);

  const bought = await client.buy("100000", config.reserve_denom);
  console.log(`  buy tx ${bought.transactionHash}`);

  const staked = await client.stake("50000", modelDenom);
  console.log(`  stake tx ${staked.transactionHash}`);

  const position = await client.stakeInfo(address);
  console.log(
    `  staked=${position.staked} claimable=${position.claimable} ${config.reserve_denom}`,
  );

  if (BigInt(position.claimable) > 0n) {
    const claimed = await client.claimRewards();
    console.log(`  claim tx ${claimed.transactionHash}`);
  } else {
    console.log("  nothing claimable yet (no revenue distributed to the pool)");
  }
} else {
  console.log(
    "set CLAW_MNEMONIC and CLAW_MODEL_DENOM to run the signed buy/stake/claim demo",
  );
}
