/**
 * `clawd reputation` subcommands — query, rate, and endorse agents.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr } from "../lib/format.js";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

async function ensureSigner() {
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

  return { cfg, rpcUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// clawd reputation query <address>
// ---------------------------------------------------------------------------

export type ReputationQueryOptions = {
  address: string;
  json?: boolean;
};

export async function runReputationQuery(opts: ReputationQueryOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/reputation/v1/reputation/${encodeURIComponent(opts.address)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`No reputation data found for ${opts.address}.`);
      } else {
        console.error(`Failed to query reputation (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { reputation?: any };
    const rep = data.reputation ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(rep, null, 2) + "\n");
      return;
    }

    const avgRating = (parseInt(rep.avg_rating_bps ?? rep.avgRatingBps ?? "0") / 100).toFixed(1);
    const totalRatings = rep.total_ratings ?? rep.totalRatings ?? "0";
    const endorsements = rep.endorsement_count ?? rep.endorsementCount ?? "0";

    console.log(`Reputation for ${shortAddr(opts.address)}\n`);
    console.log(`  Average Rating: ${avgRating}/5.0`);
    console.log(`  Total Ratings:  ${totalRatings}`);
    console.log(`  Endorsements:   ${endorsements}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query reputation: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd reputation leaderboard
// ---------------------------------------------------------------------------

export type ReputationLeaderboardOptions = {
  limit?: number;
  json?: boolean;
};

export async function runReputationLeaderboard(opts: ReputationLeaderboardOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const limit = opts.limit ?? 20;
  const url = `${restUrl}/clawchain/reputation/v1/top_agents?limit=${limit}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query leaderboard (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { agents?: any[] };
    const agents = data.agents ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ agents }, null, 2) + "\n");
      return;
    }

    if (agents.length === 0) {
      console.log("No rated agents found.");
      return;
    }

    const headers = ["#", "Agent", "Rating", "Reviews", "Endorsements"];
    const rows = agents.map((a: any, i: number) => [
      String(i + 1),
      shortAddr(a.agent_address ?? a.agentAddress ?? ""),
      (parseInt(a.avg_rating_bps ?? a.avgRatingBps ?? "0") / 100).toFixed(1) + "/5.0",
      String(a.total_ratings ?? a.totalRatings ?? "0"),
      String(a.endorsement_count ?? a.endorsementCount ?? "0"),
    ]);

    console.log(`Reputation Leaderboard (top ${agents.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query leaderboard: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd reputation rate <address>
// ---------------------------------------------------------------------------

export type ReputationRateOptions = {
  address: string;
  rating: number;
  comment?: string;
};

export async function runReputationRate(opts: ReputationRateOptions): Promise<void> {
  if (opts.rating < 1 || opts.rating > 5) {
    console.error("Rating must be between 1 and 5.");
    process.exit(1);
  }

  const { account, signingClient } = await ensureSigner();

  console.log(`Rating agent ${shortAddr(opts.address)} — ${opts.rating}/5...`);

  const msg = {
    typeUrl: "/clawchain.reputation.v1.MsgRateAgent",
    value: {
      creator: account.address,
      agentAddress: opts.address,
      rating: opts.rating,
      comment: opts.comment ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Rating failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Agent ${shortAddr(opts.address)} rated ${opts.rating}/5.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Rating failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd reputation endorse <address>
// ---------------------------------------------------------------------------

export type ReputationEndorseOptions = {
  address: string;
  reason?: string;
};

export async function runReputationEndorse(opts: ReputationEndorseOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Endorsing agent ${shortAddr(opts.address)}...`);

  const msg = {
    typeUrl: "/clawchain.reputation.v1.MsgEndorseAgent",
    value: {
      creator: account.address,
      agentAddress: opts.address,
      reason: opts.reason ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Endorsement failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Agent ${shortAddr(opts.address)} endorsed.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Endorsement failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
