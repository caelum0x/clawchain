/**
 * `clawd oracle` subcommands — query Terra-forked oracle exchange rates,
 * tobin taxes, vote targets, aggregate votes/prevotes, and parameters.
 *
 * Also includes:
 *   - `oracle setup`          — interactive feeder setup wizard
 *   - `oracle delegate-feed`  — submit MsgDelegateFeedConsent tx
 *
 * All endpoints follow the real REST surface at
 *   /clawchain/oracle/v1beta1/...
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table } from "../lib/format.js";
import * as readline from "node:readline/promises";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function restBase(): string {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  return (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
}

async function queryRest(path: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${restBase()}${path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    return { ok: false, status: res.status, data: null };
  }
  const data: unknown = await res.json();
  return { ok: true, status: res.status, data };
}

// ---------------------------------------------------------------------------
// clawd oracle price <denom>
// ---------------------------------------------------------------------------

export type OraclePriceOptions = {
  denom: string;
  json?: boolean;
};

export async function runOraclePrice(opts: OraclePriceOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/denoms/${encodeURIComponent(opts.denom)}/exchange_rate`,
    );
    if (!ok) {
      if (status === 404) {
        console.log(`No exchange rate found for denom "${opts.denom}".`);
      } else {
        console.error(`Failed to query exchange rate (HTTP ${status}).`);
      }
      return;
    }

    const body = data as { exchange_rate?: string };
    const rate = body.exchange_rate ?? "N/A";

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    console.log(`Exchange Rate\n`);
    console.log(`  Denom: ${opts.denom}`);
    console.log(`  Rate:  ${rate}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query exchange rate: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle prices
// ---------------------------------------------------------------------------

export type OraclePricesOptions = {
  json?: boolean;
};

export async function runOraclePrices(opts: OraclePricesOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/denoms/exchange_rates`,
    );
    if (!ok) {
      console.error(`Failed to query exchange rates (HTTP ${status}).`);
      process.exit(1);
    }

    const body = data as { exchange_rates?: Array<{ denom: string; exchange_rate: string }> };
    const rates = body.exchange_rates ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    if (rates.length === 0) {
      console.log("No exchange rates found.");
      return;
    }

    const headers = ["Denom", "Exchange Rate"];
    const rows = rates.map((r) => [
      String(r.denom ?? ""),
      String(r.exchange_rate ?? ""),
    ]);

    console.log("Exchange Rates\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query exchange rates: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle actives
// ---------------------------------------------------------------------------

export type OracleActivesOptions = {
  json?: boolean;
};

export async function runOracleActives(opts: OracleActivesOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/denoms/actives`,
    );
    if (!ok) {
      console.error(`Failed to query active denoms (HTTP ${status}).`);
      process.exit(1);
    }

    const body = data as { actives?: string[] };
    const actives = body.actives ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    if (actives.length === 0) {
      console.log("No active denoms.");
      return;
    }

    console.log("Active Denoms\n");
    for (const denom of actives) {
      console.log(`  ${denom}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query active denoms: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle vote-targets
// ---------------------------------------------------------------------------

export type OracleVoteTargetsOptions = {
  json?: boolean;
};

export async function runOracleVoteTargets(opts: OracleVoteTargetsOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/denoms/vote_targets`,
    );
    if (!ok) {
      console.error(`Failed to query vote targets (HTTP ${status}).`);
      process.exit(1);
    }

    const body = data as { vote_targets?: string[] };
    const targets = body.vote_targets ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    if (targets.length === 0) {
      console.log("No vote targets.");
      return;
    }

    console.log("Vote Targets\n");
    for (const denom of targets) {
      console.log(`  ${denom}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query vote targets: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle params
// ---------------------------------------------------------------------------

export type OracleParamsOptions = {
  json?: boolean;
};

export async function runOracleParams(opts: OracleParamsOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/params`,
    );
    if (!ok) {
      console.error(`Failed to query oracle params (HTTP ${status}).`);
      process.exit(1);
    }

    const body = data as { params?: Record<string, unknown> };
    const params = body.params ?? body;

    if (opts.json) {
      process.stdout.write(JSON.stringify(params, null, 2) + "\n");
      return;
    }

    console.log("Oracle Parameters\n");
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query oracle params: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle feeder <validator>
// ---------------------------------------------------------------------------

export type OracleFeederOptions = {
  validator: string;
  json?: boolean;
};

export async function runOracleFeeder(opts: OracleFeederOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/validators/${encodeURIComponent(opts.validator)}/feeder`,
    );
    if (!ok) {
      if (status === 404) {
        console.log(`No feeder delegation found for validator "${opts.validator}".`);
      } else {
        console.error(`Failed to query feeder (HTTP ${status}).`);
      }
      return;
    }

    const body = data as { feeder_addr?: string };

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    const feeder = body.feeder_addr ?? "N/A";
    console.log(`Feeder Delegation\n`);
    console.log(`  Validator: ${opts.validator}`);
    console.log(`  Feeder:    ${feeder}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query feeder: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle miss <validator>
// ---------------------------------------------------------------------------

export type OracleMissOptions = {
  validator: string;
  json?: boolean;
};

export async function runOracleMiss(opts: OracleMissOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/validators/${encodeURIComponent(opts.validator)}/miss`,
    );
    if (!ok) {
      if (status === 404) {
        console.log(`No miss counter found for validator "${opts.validator}".`);
      } else {
        console.error(`Failed to query miss counter (HTTP ${status}).`);
      }
      return;
    }

    const body = data as { miss_counter?: string };

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    const missCount = body.miss_counter ?? "0";
    console.log(`Oracle Miss Counter\n`);
    console.log(`  Validator:    ${opts.validator}`);
    console.log(`  Miss Counter: ${missCount}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query miss counter: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle prevote <validator>
// ---------------------------------------------------------------------------

export type OraclePrevoteOptions = {
  validator: string;
  json?: boolean;
};

export async function runOraclePrevote(opts: OraclePrevoteOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/validators/${encodeURIComponent(opts.validator)}/aggregate_prevote`,
    );
    if (!ok) {
      if (status === 404) {
        console.log(`No aggregate prevote found for validator "${opts.validator}".`);
      } else {
        console.error(`Failed to query aggregate prevote (HTTP ${status}).`);
      }
      return;
    }

    const body = data as {
      aggregate_prevote?: { hash?: string; voter?: string; submit_block?: string };
    };
    const prevote = body.aggregate_prevote;

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    console.log(`Aggregate Prevote\n`);
    console.log(`  Validator:    ${opts.validator}`);
    console.log(`  Hash:         ${prevote?.hash ?? "N/A"}`);
    console.log(`  Voter:        ${prevote?.voter ?? "N/A"}`);
    console.log(`  Submit Block: ${prevote?.submit_block ?? "N/A"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query aggregate prevote: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle prevotes
// ---------------------------------------------------------------------------

export type OraclePrevotesOptions = {
  json?: boolean;
};

export async function runOraclePrevotes(opts: OraclePrevotesOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/validators/aggregate_prevotes`,
    );
    if (!ok) {
      console.error(`Failed to query aggregate prevotes (HTTP ${status}).`);
      process.exit(1);
    }

    const body = data as {
      aggregate_prevotes?: Array<{ hash?: string; voter?: string; submit_block?: string }>;
    };
    const prevotes = body.aggregate_prevotes ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    if (prevotes.length === 0) {
      console.log("No aggregate prevotes found.");
      return;
    }

    const headers = ["Voter", "Hash", "Submit Block"];
    const rows = prevotes.map((p) => [
      String(p.voter ?? ""),
      String(p.hash ?? ""),
      String(p.submit_block ?? ""),
    ]);

    console.log("Aggregate Prevotes\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query aggregate prevotes: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle vote <validator>
// ---------------------------------------------------------------------------

export type OracleVoteOptions = {
  validator: string;
  json?: boolean;
};

export async function runOracleVote(opts: OracleVoteOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/validators/${encodeURIComponent(opts.validator)}/aggregate_vote`,
    );
    if (!ok) {
      if (status === 404) {
        console.log(`No aggregate vote found for validator "${opts.validator}".`);
      } else {
        console.error(`Failed to query aggregate vote (HTTP ${status}).`);
      }
      return;
    }

    const body = data as {
      aggregate_vote?: {
        exchange_rate_tuples?: Array<{ denom: string; exchange_rate: string }>;
        voter?: string;
      };
    };
    const vote = body.aggregate_vote;

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    console.log(`Aggregate Vote\n`);
    console.log(`  Validator: ${opts.validator}`);
    console.log(`  Voter:     ${vote?.voter ?? "N/A"}`);

    const tuples = vote?.exchange_rate_tuples ?? [];
    if (tuples.length > 0) {
      console.log(`  Rates:`);
      for (const t of tuples) {
        console.log(`    ${t.denom}: ${t.exchange_rate}`);
      }
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query aggregate vote: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle votes
// ---------------------------------------------------------------------------

export type OracleVotesOptions = {
  json?: boolean;
};

export async function runOracleVotes(opts: OracleVotesOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/validators/aggregate_votes`,
    );
    if (!ok) {
      console.error(`Failed to query aggregate votes (HTTP ${status}).`);
      process.exit(1);
    }

    const body = data as {
      aggregate_votes?: Array<{
        exchange_rate_tuples?: Array<{ denom: string; exchange_rate: string }>;
        voter?: string;
      }>;
    };
    const votes = body.aggregate_votes ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    if (votes.length === 0) {
      console.log("No aggregate votes found.");
      return;
    }

    for (const v of votes) {
      console.log(`Voter: ${v.voter ?? "N/A"}`);
      const tuples = v.exchange_rate_tuples ?? [];
      for (const t of tuples) {
        console.log(`  ${t.denom}: ${t.exchange_rate}`);
      }
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query aggregate votes: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle tobin-tax <denom>
// ---------------------------------------------------------------------------

export type OracleTobinTaxOptions = {
  denom: string;
  json?: boolean;
};

export async function runOracleTobinTax(opts: OracleTobinTaxOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/denoms/${encodeURIComponent(opts.denom)}/tobin_tax`,
    );
    if (!ok) {
      if (status === 404) {
        console.log(`No tobin tax found for denom "${opts.denom}".`);
      } else {
        console.error(`Failed to query tobin tax (HTTP ${status}).`);
      }
      return;
    }

    const body = data as { tobin_tax?: string };

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    console.log(`Tobin Tax\n`);
    console.log(`  Denom: ${opts.denom}`);
    console.log(`  Tax:   ${body.tobin_tax ?? "N/A"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query tobin tax: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle tobin-taxes
// ---------------------------------------------------------------------------

export type OracleTobinTaxesOptions = {
  json?: boolean;
};

export async function runOracleTobinTaxes(opts: OracleTobinTaxesOptions): Promise<void> {
  try {
    const { ok, status, data } = await queryRest(
      `/clawchain/oracle/v1beta1/denoms/tobin_taxes`,
    );
    if (!ok) {
      console.error(`Failed to query tobin taxes (HTTP ${status}).`);
      process.exit(1);
    }

    const body = data as {
      tobin_taxes?: Array<{ denom: string; tobin_tax: string }>;
    };
    const taxes = body.tobin_taxes ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(body, null, 2) + "\n");
      return;
    }

    if (taxes.length === 0) {
      console.log("No tobin taxes found.");
      return;
    }

    const headers = ["Denom", "Tobin Tax"];
    const rows = taxes.map((t) => [
      String(t.denom ?? ""),
      String(t.tobin_tax ?? ""),
    ]);

    console.log("Tobin Taxes\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query tobin taxes: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Helpers — interactive prompt & signer
// ---------------------------------------------------------------------------

async function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function ensureOracleSigner(): Promise<{
  rpcUrl: string;
  account: { address: string };
  signingClient: SigningStargateClient;
}> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

  if (!mnemonicFileExists()) {
    throw new Error('No mnemonic found. Run "clawd init" first.');
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("Failed to load mnemonic.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error("Failed to derive wallet account.");
  }

  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return { rpcUrl, account, signingClient };
}

// ---------------------------------------------------------------------------
// clawd oracle setup — Interactive oracle feeder setup wizard
// ---------------------------------------------------------------------------

export type OracleSetupOptions = {
  validator?: string;
  json?: boolean;
};

export async function runOracleSetup(opts: OracleSetupOptions): Promise<void> {
  const DIVIDER = "─".repeat(60);

  console.log();
  console.log(DIVIDER);
  console.log("  Oracle Price Feeder — Setup Wizard");
  console.log(DIVIDER);
  console.log();

  // Step 1: Check chain reachability
  console.log("Step 1/4: Checking chain connectivity...");
  try {
    const { ok, status } = await queryRest("/cosmos/base/tendermint/v1beta1/node_info");
    if (!ok) {
      console.error(`  Chain is not reachable (HTTP ${status}).`);
      console.error(`  Make sure the REST endpoint is running at: ${restBase()}`);
      process.exit(1);
    }
    console.log("  Chain is reachable.\n");
  } catch (err) {
    console.error(`  Cannot connect to chain REST endpoint at ${restBase()}.`);
    console.error(`  Error: ${String(err)}`);
    process.exit(1);
  }

  // Step 2: Get validator address
  let validator = opts.validator ?? "";
  if (!validator) {
    validator = await askQuestion("Step 2/4: Enter your validator operator address (clawvaloper1...): ");
  } else {
    console.log(`Step 2/4: Using validator address: ${validator}`);
  }

  if (!validator.startsWith("clawvaloper1")) {
    console.error(`  Invalid validator address. Expected prefix "clawvaloper1", got: "${validator}"`);
    process.exit(1);
  }
  console.log();

  // Step 3: Feeder key generation
  const feederKeyName = "oracle-feeder";
  console.log("Step 3/4: Generate a feeder key");
  console.log();
  console.log("  The feeder key is a separate key that votes on behalf of your");
  console.log("  validator. This avoids exposing your validator key to the price");
  console.log("  feeder process.");
  console.log();
  console.log("  Run the following command to create the feeder key:");
  console.log();
  console.log(`    clawchaind keys add ${feederKeyName} --keyring-backend test`);
  console.log();
  console.log("  After creating the key, note the feeder address (claw1...).");
  console.log();

  const feederAddr = await askQuestion("  Enter the feeder address (claw1...) or press Enter to skip: ");
  console.log();

  // Step 4: Delegate feed consent
  console.log("Step 4/4: Delegate feed consent & configure the price feeder");
  console.log();

  if (feederAddr && feederAddr.startsWith("claw1")) {
    console.log("  a) Delegate feed consent from your validator to the feeder:");
    console.log();
    console.log(`    clawchaind tx oracle delegate-feed-consent ${validator} ${feederAddr} \\`);
    console.log(`      --from ${validator} --keyring-backend test --chain-id clawchain-local -y`);
    console.log();
    console.log("  Or use clawd:");
    console.log();
    console.log(`    clawd oracle delegate-feed ${validator} ${feederAddr}`);
    console.log();
  } else {
    console.log("  a) Delegate feed consent (replace <feeder-address> with the feeder key address):");
    console.log();
    console.log(`    clawchaind tx oracle delegate-feed-consent ${validator} <feeder-address> \\`);
    console.log(`      --from ${validator} --keyring-backend test --chain-id clawchain-local -y`);
    console.log();
    console.log("  Or use clawd:");
    console.log();
    console.log("    clawd oracle delegate-feed <validator> <feeder-address>");
    console.log();
  }

  console.log("  b) Configure the price feeder:");
  console.log();
  console.log("    Copy the example configuration:");
  console.log();
  console.log("      cp price-feeder.toml.example price-feeder.toml");
  console.log();
  console.log("    Edit price-feeder.toml and fill in:");
  console.log();
  console.log(`      [account]`);
  console.log(`      address = "${feederAddr || "<feeder-address>"}"`);
  console.log(`      validator = "${validator}"`);
  console.log(`      chain_id = "clawchain-local"`);
  console.log();
  console.log("  c) Start the price feeder daemon:");
  console.log();
  console.log("      claw-price-feeder price-feeder.toml");
  console.log();

  // Summary
  console.log(DIVIDER);
  console.log("  Summary");
  console.log(DIVIDER);
  console.log();
  console.log("  1. Create feeder key:");
  console.log(`       clawchaind keys add ${feederKeyName} --keyring-backend test`);
  console.log();
  console.log("  2. Delegate feed consent:");
  if (feederAddr && feederAddr.startsWith("claw1")) {
    console.log(`       clawd oracle delegate-feed ${validator} ${feederAddr}`);
  } else {
    console.log(`       clawd oracle delegate-feed ${validator} <feeder-address>`);
  }
  console.log();
  console.log("  3. Configure price-feeder.toml with validator & feeder addresses");
  console.log();
  console.log("  4. Start the daemon:");
  console.log("       claw-price-feeder price-feeder.toml");
  console.log();

  if (opts.json) {
    const summary = {
      validator,
      feederKeyName,
      feederAddress: feederAddr || null,
      steps: [
        `clawchaind keys add ${feederKeyName} --keyring-backend test`,
        feederAddr
          ? `clawd oracle delegate-feed ${validator} ${feederAddr}`
          : `clawd oracle delegate-feed ${validator} <feeder-address>`,
        "cp price-feeder.toml.example price-feeder.toml && edit",
        "claw-price-feeder price-feeder.toml",
      ],
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  }
}

// ---------------------------------------------------------------------------
// clawd oracle delegate-feed <validator> <feeder>
// ---------------------------------------------------------------------------

export type OracleDelegateFeedOptions = {
  validator: string;
  feeder: string;
  json?: boolean;
};

export async function runOracleDelegateFeed(opts: OracleDelegateFeedOptions): Promise<void> {
  if (!opts.validator.startsWith("clawvaloper1")) {
    console.error(`Invalid validator address. Expected prefix "clawvaloper1", got: "${opts.validator}"`);
    process.exit(1);
  }
  if (!opts.feeder.startsWith("claw1")) {
    console.error(`Invalid feeder address. Expected prefix "claw1", got: "${opts.feeder}"`);
    process.exit(1);
  }

  console.log(`Delegating feed consent from ${opts.validator} to ${opts.feeder}...`);

  const msg = {
    typeUrl: "/clawchain.oracle.v1beta1.MsgDelegateFeedConsent",
    value: {
      operator: opts.validator,
      delegate: opts.feeder,
    },
  };

  try {
    const { account, signingClient } = await ensureOracleSigner();

    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Delegate feed consent failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            success: true,
            txHash: res.transactionHash,
            code: res.code,
            validator: opts.validator,
            feeder: opts.feeder,
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }

    console.log();
    console.log("Feed consent delegated successfully.");
    console.log(`  Validator: ${opts.validator}`);
    console.log(`  Feeder:    ${opts.feeder}`);
    console.log(`  TxHash:    ${res.transactionHash}`);
    console.log();
  } catch (err) {
    console.error(`Failed to delegate feed consent: ${String(err)}`);
    process.exit(1);
  }
}
