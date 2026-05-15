/**
 * `clawd governance` subcommands — proposals, voting, and governance params.
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
// clawd governance proposals
// ---------------------------------------------------------------------------

export type GovernanceProposalsOptions = {
  json?: boolean;
  status?: string;
};

export async function runGovernanceProposals(opts: GovernanceProposalsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let url = `${restUrl}/clawchain/governance/v1/proposals`;
  if (opts.status) {
    url += `?status=${encodeURIComponent(opts.status)}`;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query proposals (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { proposals?: any[] };
    const proposals = data.proposals ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ proposals }, null, 2) + "\n");
      return;
    }

    if (proposals.length === 0) {
      console.log("No proposals found.");
      return;
    }

    const headers = ["#", "Title", "Status", "Proposer", "Yes", "No", "Abstain", "Deposit"];
    const rows = proposals.map((p: any) => [
      String(p.id ?? p.proposal_id ?? ""),
      String(p.title ?? ""),
      String(p.status ?? ""),
      shortAddr(p.proposer ?? p.creator ?? ""),
      String(p.yes_count ?? p.yesCount ?? "0"),
      String(p.no_count ?? p.noCount ?? "0"),
      String(p.abstain_count ?? p.abstainCount ?? "0"),
      formatClaw(p.total_deposit ?? p.totalDeposit ?? "0"),
    ]);

    console.log("Governance Proposals\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query proposals: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd governance proposal <id>
// ---------------------------------------------------------------------------

export type GovernanceProposalOptions = {
  proposalId: number;
  json?: boolean;
};

export async function runGovernanceProposal(opts: GovernanceProposalOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/governance/v1/proposal/${encodeURIComponent(String(opts.proposalId))}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Proposal ${opts.proposalId} not found.`);
      } else {
        console.error(`Failed to query proposal (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { proposal?: any };
    const proposal = data.proposal ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(proposal, null, 2) + "\n");
      return;
    }

    console.log(`Proposal #${proposal.id ?? proposal.proposal_id ?? opts.proposalId}\n`);
    console.log(`  Title:       ${proposal.title ?? ""}`);
    console.log(`  Status:      ${proposal.status ?? ""}`);
    console.log(`  Proposer:    ${proposal.proposer ?? proposal.creator ?? ""}`);
    console.log(`  Description: ${proposal.description ?? ""}`);
    console.log(`  Yes:         ${proposal.yes_count ?? proposal.yesCount ?? "0"}`);
    console.log(`  No:          ${proposal.no_count ?? proposal.noCount ?? "0"}`);
    console.log(`  Abstain:     ${proposal.abstain_count ?? proposal.abstainCount ?? "0"}`);
    console.log(`  No w/ Veto:  ${proposal.no_with_veto_count ?? proposal.noWithVetoCount ?? "0"}`);
    console.log(`  Deposit:     ${formatClaw(proposal.total_deposit ?? proposal.totalDeposit ?? "0")}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query proposal: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd governance submit-proposal
// ---------------------------------------------------------------------------

export type GovernanceSubmitProposalOptions = {
  title: string;
  description: string;
  deposit: string;
};

export async function runGovernanceSubmitProposal(opts: GovernanceSubmitProposalOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureSigner();

  console.log(`Submitting proposal "${opts.title}"...`);

  const msg = {
    typeUrl: "/clawchain.governance.v1.MsgSubmitProposal",
    value: {
      creator: account.address,
      title: opts.title,
      description: opts.description,
      deposit: [{ denom, amount: opts.deposit }],
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Proposal submission failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Proposal "${opts.title}" submitted.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Proposal submission failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd governance vote
// ---------------------------------------------------------------------------

export type GovernanceVoteOptions = {
  proposalId: number;
  option: string;
};

const VOTE_OPTION_MAP: Record<string, number> = {
  yes: 1,
  abstain: 2,
  no: 3,
  no_with_veto: 4,
};

export async function runGovernanceVote(opts: GovernanceVoteOptions): Promise<void> {
  const optionNum = VOTE_OPTION_MAP[opts.option];
  if (optionNum === undefined) {
    console.error(`Invalid vote option "${opts.option}". Use: yes, no, abstain, no_with_veto.`);
    process.exit(1);
  }

  const { account, signingClient } = await ensureSigner();

  console.log(`Voting "${opts.option}" on proposal #${opts.proposalId}...`);

  const msg = {
    typeUrl: "/clawchain.governance.v1.MsgVoteProposal",
    value: {
      creator: account.address,
      proposalId: opts.proposalId,
      option: optionNum,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Vote failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Voted "${opts.option}" on proposal #${opts.proposalId}.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Vote failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd governance params
// ---------------------------------------------------------------------------

export type GovernanceParamsOptions = {
  json?: boolean;
};

export async function runGovernanceParams(opts: GovernanceParamsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/governance/v1/params`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query governance params (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { params?: any };
    const params = data.params ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(params, null, 2) + "\n");
      return;
    }

    console.log("Governance Parameters\n");
    for (const [key, value] of Object.entries(params)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query governance params: ${String(err)}`);
    process.exit(1);
  }
}
