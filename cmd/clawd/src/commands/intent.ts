/**
 * `clawd intent` subcommands — submit, respond, finalize, list, and query
 * coordination intents for multi-agent collaboration.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, shortAddr, truncate } from "../lib/format.js";

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
// clawd intent submit
// ---------------------------------------------------------------------------

export type IntentSubmitOptions = {
  description: string;
  requiredCapabilities?: string;
  maxBudget?: string;
  deadline?: number;
};

export async function runIntentSubmit(opts: IntentSubmitOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log("Submitting coordination intent...");

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgSubmitIntent",
    value: {
      creator: account.address,
      description: opts.description,
      requiredCapabilities: opts.requiredCapabilities ?? "",
      maxBudget: opts.maxBudget ?? "",
      deadlineBlocks: opts.deadline ?? 0,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Intent submission failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log("Intent submitted successfully.");
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Intent submission failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd intent respond <intentId>
// ---------------------------------------------------------------------------

export type IntentRespondOptions = {
  intentId: number;
  proposedBudget: string;
  message?: string;
};

export async function runIntentRespond(opts: IntentRespondOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Responding to intent #${opts.intentId}...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgRespondIntent",
    value: {
      creator: account.address,
      intentId: opts.intentId,
      proposedBudget: opts.proposedBudget,
      message: opts.message ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Intent response failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Responded to intent #${opts.intentId}.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Intent response failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd intent finalize <intentId>
// ---------------------------------------------------------------------------

export type IntentFinalizeOptions = {
  intentId: number;
  selectedAgent: string;
};

export async function runIntentFinalize(opts: IntentFinalizeOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Finalizing intent #${opts.intentId} (selected: ${shortAddr(opts.selectedAgent)})...`);

  const msg = {
    typeUrl: "/clawchain.agent.v1.MsgFinalizeIntent",
    value: {
      creator: account.address,
      intentId: opts.intentId,
      selectedAgent: opts.selectedAgent,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Intent finalization failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Intent #${opts.intentId} finalized.`);
    console.log(`  Selected Agent: ${shortAddr(opts.selectedAgent)}`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Intent finalization failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd intent list
// ---------------------------------------------------------------------------

export type IntentListOptions = {
  address?: string;
  json?: boolean;
};

export async function runIntentList(opts: IntentListOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let url = `${restUrl}/clawchain/agent/v1/intents`;
  if (opts.address) {
    url += `?creator=${encodeURIComponent(opts.address)}`;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log("No intents found.");
      } else {
        console.error(`Failed to list intents (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { intents?: any[] };
    const intents = data.intents ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ intents }, null, 2) + "\n");
      return;
    }

    if (intents.length === 0) {
      console.log("No intents found.");
      return;
    }

    const headers = ["ID", "Creator", "Description", "Responses", "Budget", "Status"];
    const rows = intents.map((intent: any) => [
      String(intent.id ?? intent.Id ?? ""),
      shortAddr(intent.creator_address ?? intent.creatorAddress ?? ""),
      truncate(intent.description ?? intent.Description ?? "", 50),
      String(intent.response_count ?? intent.responseCount ?? "0"),
      intent.max_budget ?? intent.maxBudget ?? "-",
      intent.status ?? intent.Status ?? "unknown",
    ]);

    console.log("Coordination Intents\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to list intents: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd intent query <intentId>
// ---------------------------------------------------------------------------

export type IntentQueryOptions = {
  intentId: number;
  json?: boolean;
};

export async function runIntentQuery(opts: IntentQueryOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/agent/v1/intent/${encodeURIComponent(String(opts.intentId))}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Intent #${opts.intentId} not found.`);
      } else {
        console.error(`Failed to query intent (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as Record<string, any>;
    const found = data.found ?? true;

    if (!found) {
      console.log(`Intent #${opts.intentId} not found.`);
      return;
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return;
    }

    const id = data.id ?? data.Id ?? opts.intentId;
    const creator = data.creator_address ?? data.creatorAddress ?? "";
    const description = data.description ?? data.Description ?? "";
    const intentType = data.intent_type ?? data.intentType ?? "";
    const payload = data.payload ?? data.Payload ?? "";
    const status = data.status ?? data.Status ?? "unknown";
    const minResponses = data.min_responses ?? data.minResponses ?? "0";
    const responses = data.responses ?? [];

    console.log(`Intent #${id}\n`);
    console.log(`  Creator:       ${shortAddr(creator)}`);
    console.log(`  Status:        ${status}`);
    console.log(`  Type:          ${intentType || "-"}`);
    console.log(`  Description:   ${description}`);
    console.log(`  Min Responses: ${minResponses}`);
    if (payload) {
      console.log(`  Payload:       ${truncate(payload, 80)}`);
    }

    if (Array.isArray(responses) && responses.length > 0) {
      console.log(`\n  Responses (${responses.length}):`);
      for (const r of responses) {
        const responder = r.responder_addr ?? r.responderAddr ?? "";
        const accepted = r.accepted ?? false;
        const rPayload = r.payload ?? "";
        console.log(`    - ${shortAddr(responder)} | accepted=${accepted}${rPayload ? ` | ${truncate(rPayload, 40)}` : ""}`);
      }
    }

    console.log();
  } catch (err) {
    console.error(`Failed to query intent: ${String(err)}`);
    process.exit(1);
  }
}
