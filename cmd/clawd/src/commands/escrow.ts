/**
 * `clawd escrow` subcommands — list, create, status, complete, dispute escrows.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr } from "../lib/format.js";

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
// Types
// ---------------------------------------------------------------------------

type MilestoneInfo = {
  description?: string;
  amount?: string;
  completed?: boolean;
};

type EscrowInfo = {
  id?: string;
  buyer?: string;
  seller?: string;
  amount?: { denom?: string; amount?: string };
  milestones?: MilestoneInfo[];
  status?: string;
  created_at?: string;
};

type DisputeInfo = {
  escrow_id?: string;
  initiator?: string;
  reason?: string;
  status?: string;
  created_at?: string;
};

// ---------------------------------------------------------------------------
// clawd escrow list
// ---------------------------------------------------------------------------

export type EscrowListOptions = {
  buyer?: string;
  seller?: string;
  json?: boolean;
};

export async function runEscrowList(opts: EscrowListOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let url: string;
  if (opts.buyer) {
    url = `${restUrl}/clawchain/marketplace/v1/escrows?buyer=${encodeURIComponent(opts.buyer)}`;
  } else if (opts.seller) {
    url = `${restUrl}/clawchain/marketplace/v1/escrows?seller=${encodeURIComponent(opts.seller)}`;
  } else {
    // Default to current wallet address as buyer
    if (!mnemonicFileExists()) {
      console.error('No address provided and no mnemonic. Run "clawd init" first.');
      process.exit(1);
    }
    const mnemonic = loadMnemonic();
    if (!mnemonic) { process.exit(1); return; }
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: cfg.prefix ?? "claw" });
    const [account] = await wallet.getAccounts();
    url = `${restUrl}/clawchain/marketplace/v1/escrows?buyer=${encodeURIComponent(account!.address)}`;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query escrows (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { escrows?: EscrowInfo[] };
    const escrows = data.escrows ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ escrows }, null, 2) + "\n");
      return;
    }

    if (escrows.length === 0) {
      console.log("No escrows found.");
      return;
    }

    const headers = ["ID", "Buyer", "Seller", "Amount", "Milestones", "Status"];
    const rows = escrows.map((e) => [
      String(e.id ?? ""),
      shortAddr(String(e.buyer ?? "")),
      shortAddr(String(e.seller ?? "")),
      e.amount?.amount ? formatClaw(e.amount.amount) : "-",
      String(e.milestones?.length ?? 0),
      String(e.status ?? "unknown"),
    ]);

    console.log(`Escrows (${escrows.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query escrows: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd escrow create
// ---------------------------------------------------------------------------

export type EscrowCreateOptions = {
  seller: string;
  amount: string;
  milestones?: string;
  denom?: string;
};

export async function runEscrowCreate(opts: EscrowCreateOptions): Promise<void> {
  const { denom, account, signingClient } = await ensureSigner();

  const escrowDenom = opts.denom ?? denom;

  let milestones: { description: string; amount: string }[] = [];
  if (opts.milestones) {
    try {
      milestones = JSON.parse(opts.milestones);
    } catch {
      console.error("Invalid --milestones JSON. Expected: [{\"description\":\"...\",\"amount\":\"...\"}]");
      process.exit(1);
    }
  }

  console.log(`Creating escrow with seller ${shortAddr(opts.seller)}...`);

  const msg = {
    typeUrl: "/clawchain.marketplace.v1.MsgCreateEscrow",
    value: {
      buyer: account.address,
      seller: opts.seller,
      amount: { denom: escrowDenom, amount: opts.amount },
      milestones,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Escrow creation failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Escrow created successfully.`);
    console.log(`  Seller:     ${shortAddr(opts.seller)}`);
    console.log(`  Amount:     ${formatClaw(opts.amount)} (${escrowDenom})`);
    console.log(`  Milestones: ${milestones.length}`);
    console.log(`  TxHash:     ${res.transactionHash}`);
  } catch (err) {
    console.error(`Escrow creation failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd escrow status
// ---------------------------------------------------------------------------

export type EscrowStatusOptions = {
  escrowId: string;
  json?: boolean;
};

export async function runEscrowStatus(opts: EscrowStatusOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/marketplace/v1/escrow/${encodeURIComponent(opts.escrowId)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query escrow (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { escrow?: EscrowInfo };
    const escrow = data.escrow;

    if (!escrow) {
      console.error(`Escrow ${opts.escrowId} not found.`);
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify({ escrow }, null, 2) + "\n");
      return;
    }

    console.log(`Escrow #${opts.escrowId}\n`);
    console.log(`  Buyer:      ${escrow.buyer ?? "-"}`);
    console.log(`  Seller:     ${escrow.seller ?? "-"}`);
    console.log(`  Amount:     ${escrow.amount?.amount ? formatClaw(escrow.amount.amount) : "-"}`);
    console.log(`  Status:     ${escrow.status ?? "unknown"}`);
    console.log(`  Created:    ${escrow.created_at ?? "-"}`);

    if (escrow.milestones && escrow.milestones.length > 0) {
      console.log(`\n  Milestones:`);
      escrow.milestones.forEach((m, i) => {
        const check = m.completed ? "[x]" : "[ ]";
        console.log(`    ${check} #${i}: ${m.description ?? ""} (${m.amount ? formatClaw(m.amount) : "-"})`);
      });
    }
    console.log();

    // Also fetch dispute info if available
    try {
      const disputeUrl = `${restUrl}/clawchain/marketplace/v1/dispute/${encodeURIComponent(opts.escrowId)}`;
      const disputeRes = await fetch(disputeUrl, { signal: AbortSignal.timeout(8_000) });
      if (disputeRes.ok) {
        const disputeData = (await disputeRes.json()) as { dispute?: DisputeInfo };
        if (disputeData.dispute) {
          console.log(`  Dispute:`);
          console.log(`    Initiator: ${disputeData.dispute.initiator ?? "-"}`);
          console.log(`    Reason:    ${disputeData.dispute.reason ?? "-"}`);
          console.log(`    Status:    ${disputeData.dispute.status ?? "-"}`);
          console.log();
        }
      }
    } catch {
      // No dispute info available — ignore
    }
  } catch (err) {
    console.error(`Failed to query escrow: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd escrow complete
// ---------------------------------------------------------------------------

export type EscrowCompleteOptions = {
  escrowId: string;
  milestoneIndex?: number;
};

export async function runEscrowComplete(opts: EscrowCompleteOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  if (opts.milestoneIndex !== undefined) {
    console.log(`Completing milestone #${opts.milestoneIndex} on escrow ${opts.escrowId}...`);

    const msg = {
      typeUrl: "/clawchain.marketplace.v1.MsgCompleteMilestone",
      value: {
        sender: account.address,
        escrow_id: opts.escrowId,
        milestone_index: opts.milestoneIndex,
      },
    };

    try {
      const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
      if (res.code !== 0) {
        console.error(`Milestone completion failed (code=${res.code}): ${res.rawLog}`);
        process.exit(1);
      }
      console.log(`Milestone #${opts.milestoneIndex} completed on escrow ${opts.escrowId}.`);
      console.log(`  TxHash: ${res.transactionHash}`);
    } catch (err) {
      console.error(`Milestone completion failed: ${String(err)}`);
      process.exit(1);
    } finally {
      signingClient.disconnect();
    }
  } else {
    console.log(`Completing escrow ${opts.escrowId} (releasing funds)...`);

    const msg = {
      typeUrl: "/clawchain.marketplace.v1.MsgCompleteEscrow",
      value: {
        sender: account.address,
        escrow_id: opts.escrowId,
      },
    };

    try {
      const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
      if (res.code !== 0) {
        console.error(`Escrow completion failed (code=${res.code}): ${res.rawLog}`);
        process.exit(1);
      }
      console.log(`Escrow ${opts.escrowId} completed. Funds released.`);
      console.log(`  TxHash: ${res.transactionHash}`);
    } catch (err) {
      console.error(`Escrow completion failed: ${String(err)}`);
      process.exit(1);
    } finally {
      signingClient.disconnect();
    }
  }
}

// ---------------------------------------------------------------------------
// clawd escrow dispute
// ---------------------------------------------------------------------------

export type EscrowDisputeOptions = {
  escrowId: string;
  reason: string;
};

export async function runEscrowDispute(opts: EscrowDisputeOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Disputing escrow ${opts.escrowId}...`);

  const msg = {
    typeUrl: "/clawchain.marketplace.v1.MsgDisputeEscrow",
    value: {
      sender: account.address,
      escrow_id: opts.escrowId,
      reason: opts.reason,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Dispute failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Escrow ${opts.escrowId} disputed.`);
    console.log(`  Reason: ${opts.reason}`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Dispute failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
