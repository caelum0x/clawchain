/**
 * `clawd negotiate` subcommands -- propose, counter, accept, reject, and list negotiations.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, shortAddr } from "../lib/format.js";

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
// clawd negotiate propose
// ---------------------------------------------------------------------------

export type NegotiateProposeOptions = {
  targetAgent: string;
  taskDescription: string;
  proposedBudget: string;
  proposedDeadline?: number;
};

export async function runNegotiatePropose(opts: NegotiateProposeOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Proposing negotiation with ${shortAddr(opts.targetAgent)}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgNegotiate",
    value: {
      creator: account.address,
      counterparty: opts.targetAgent,
      action: "propose",
      taskDescription: opts.taskDescription,
      proposedBudget: opts.proposedBudget,
      proposedDeadlineBlocks: opts.proposedDeadline ?? 0,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Proposal failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Negotiation proposed with ${shortAddr(opts.targetAgent)}.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Proposal failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd negotiate counter <negotiationId>
// ---------------------------------------------------------------------------

export type NegotiateCounterOptions = {
  negotiationId: number;
  counterBudget: string;
  counterDeadline?: number;
  message?: string;
};

export async function runNegotiateCounter(opts: NegotiateCounterOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Submitting counter-proposal for negotiation #${opts.negotiationId}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgNegotiate",
    value: {
      creator: account.address,
      negotiationId: opts.negotiationId,
      action: "counter",
      proposedBudget: opts.counterBudget,
      proposedDeadlineBlocks: opts.counterDeadline ?? 0,
      message: opts.message ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Counter-proposal failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Counter-proposal submitted for negotiation #${opts.negotiationId}.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Counter-proposal failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd negotiate accept <negotiationId>
// ---------------------------------------------------------------------------

export type NegotiateAcceptOptions = {
  negotiationId: number;
};

export async function runNegotiateAccept(opts: NegotiateAcceptOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Accepting negotiation #${opts.negotiationId}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgNegotiate",
    value: {
      creator: account.address,
      negotiationId: opts.negotiationId,
      action: "accept",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Accept failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Negotiation #${opts.negotiationId} accepted (task auto-created).`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Accept failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd negotiate list
// ---------------------------------------------------------------------------

export type NegotiateListOptions = {
  address?: string;
  json?: boolean;
};

export async function runNegotiateList(opts: NegotiateListOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = opts.address
    ? `${restUrl}/clawchain/agent/v1/negotiations/${encodeURIComponent(opts.address)}`
    : `${restUrl}/clawchain/agent/v1/negotiations`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log("No negotiations found.");
      } else {
        console.error(`Failed to query negotiations (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { negotiations?: any[] };
    const negotiations = data.negotiations ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ negotiations }, null, 2) + "\n");
      return;
    }

    if (negotiations.length === 0) {
      console.log("No negotiations found.");
      return;
    }

    const headers = ["ID", "Proposer", "Counterparty", "Budget", "Status", "Rounds"];
    const rows = negotiations.map((n: any) => [
      String(n.id ?? n.Id ?? ""),
      shortAddr(n.initiator ?? n.Initiator ?? ""),
      shortAddr(n.counterparty ?? n.Counterparty ?? ""),
      n.proposed_budget ?? n.proposedBudget ?? n.ProposedBudget ?? "",
      n.status ?? n.Status ?? "",
      String(n.round ?? n.Round ?? "0"),
    ]);

    console.log(`Active Negotiations${opts.address ? ` for ${shortAddr(opts.address)}` : ""}\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query negotiations: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd negotiate reject <negotiationId>
// ---------------------------------------------------------------------------

export type NegotiateRejectOptions = {
  negotiationId: number;
  reason?: string;
};

export async function runNegotiateReject(opts: NegotiateRejectOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Rejecting negotiation #${opts.negotiationId}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgNegotiate",
    value: {
      creator: account.address,
      negotiationId: opts.negotiationId,
      action: "reject",
      message: opts.reason ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Reject failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Negotiation #${opts.negotiationId} rejected.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Reject failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
