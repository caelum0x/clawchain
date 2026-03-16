/**
 * `clawd ibc` subcommands — cross-chain queries and transactions for IBC channels,
 * connections, remote agents, transfers, and cross-chain privacy operations.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, shortAddr, formatClaw } from "../lib/format.js";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

// ---------------------------------------------------------------------------
// clawd ibc channels
// ---------------------------------------------------------------------------

export type IBCChannelsOptions = {
  json?: boolean;
};

export async function runIBCChannels(opts: IBCChannelsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/ibc/core/channel/v1/channels`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query IBC channels (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { channels?: any[] };
    const channels = data.channels ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ channels }, null, 2) + "\n");
      return;
    }

    if (channels.length === 0) {
      console.log("No IBC channels found.");
      return;
    }

    const headers = ["Channel ID", "Port", "State", "Counterparty Channel", "Counterparty Port", "Connection"];
    const rows = channels.map((ch: any) => [
      ch.channel_id ?? "",
      ch.port_id ?? "",
      ch.state ?? "unknown",
      ch.counterparty?.channel_id ?? "-",
      ch.counterparty?.port_id ?? "-",
      (ch.connection_hops ?? [])[0] ?? "-",
    ]);

    console.log(`IBC Channels (${channels.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query IBC channels: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd ibc connections
// ---------------------------------------------------------------------------

export type IBCConnectionsOptions = {
  json?: boolean;
};

export async function runIBCConnections(opts: IBCConnectionsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/ibc/core/connection/v1/connections`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query IBC connections (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { connections?: any[] };
    const connections = data.connections ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ connections }, null, 2) + "\n");
      return;
    }

    if (connections.length === 0) {
      console.log("No IBC connections found.");
      return;
    }

    const headers = ["Connection ID", "Client ID", "State", "Counterparty Connection", "Counterparty Client"];
    const rows = connections.map((c: any) => [
      c.id ?? "",
      c.client_id ?? "",
      c.state ?? "unknown",
      c.counterparty?.connection_id ?? "-",
      c.counterparty?.client_id ?? "-",
    ]);

    console.log(`IBC Connections (${connections.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query IBC connections: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd ibc clients
// ---------------------------------------------------------------------------

export type IBCClientsOptions = {
  json?: boolean;
};

export async function runIBCClients(opts: IBCClientsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/ibc/core/client/v1/client_states`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query IBC clients (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { client_states?: any[] };
    const clients = data.client_states ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ clients }, null, 2) + "\n");
      return;
    }

    if (clients.length === 0) {
      console.log("No IBC clients found.");
      return;
    }

    const headers = ["Client ID", "Type", "Chain ID"];
    const rows = clients.map((c: any) => {
      const state = c.client_state ?? {};
      return [
        c.client_id ?? "",
        state["@type"]?.split(".")?.pop() ?? "unknown",
        state.chain_id ?? "-",
      ];
    });

    console.log(`IBC Clients (${clients.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query IBC clients: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd ibc remote-agents
// ---------------------------------------------------------------------------

export type IBCRemoteAgentsOptions = {
  json?: boolean;
};

export async function runIBCRemoteAgents(opts: IBCRemoteAgentsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/agent/v1/remote_agents`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 501) {
        console.log("Remote agent discovery not available (no IBC channels configured).");
      } else {
        console.error(`Failed to query remote agents (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { agents?: any[] };
    const agents = data.agents ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ agents }, null, 2) + "\n");
      return;
    }

    if (agents.length === 0) {
      console.log("No remote agents discovered via IBC.");
      return;
    }

    const headers = ["Address", "Name", "Source Chain", "Channel", "Capabilities"];
    const rows = agents.map((a: any) => [
      shortAddr(a.agent_address ?? a.agentAddress ?? ""),
      a.name ?? "-",
      a.source_chain ?? a.sourceChain ?? "-",
      a.channel_id ?? a.channelId ?? "-",
      (a.capabilities ?? []).slice(0, 3).join(", ") || "-",
    ]);

    console.log(`Remote Agents via IBC (${agents.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query remote agents: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd ibc denoms
// ---------------------------------------------------------------------------

export type IBCDenomsOptions = {
  json?: boolean;
};

export async function runIBCDenoms(opts: IBCDenomsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/ibc/apps/transfer/v1/denom_traces`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query IBC denom traces (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { denom_traces?: any[] };
    const traces = data.denom_traces ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ denom_traces: traces }, null, 2) + "\n");
      return;
    }

    if (traces.length === 0) {
      console.log("No IBC denom traces found.");
      return;
    }

    const headers = ["Path", "Base Denom"];
    const rows = traces.map((t: any) => [
      t.path ?? "",
      t.base_denom ?? "",
    ]);

    console.log(`IBC Denom Traces (${traces.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query IBC denom traces: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Shared signer helper
// ---------------------------------------------------------------------------

async function ensureIBCSigner() {
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

  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  return { cfg, rpcUrl, restUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// clawd ibc transfer
// ---------------------------------------------------------------------------

export type IBCTransferOptions = {
  channel: string;
  amount: string;
  denom?: string;
  receiver: string;
  memo?: string;
  timeoutHeight?: string;
};

export async function runIBCTransfer(opts: IBCTransferOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureIBCSigner();

  const amount = opts.amount;
  const transferDenom = opts.denom ?? denom;

  console.log(`Sending IBC transfer: ${amount} ${transferDenom} via ${opts.channel} to ${shortAddr(opts.receiver)}...`);

  const msg = {
    typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
    value: {
      sourcePort: "transfer",
      sourceChannel: opts.channel,
      token: { denom: transferDenom, amount },
      sender: account.address,
      receiver: opts.receiver,
      timeoutHeight: opts.timeoutHeight
        ? { revisionNumber: BigInt(0), revisionHeight: BigInt(opts.timeoutHeight) }
        : undefined,
      timeoutTimestamp: BigInt(Math.floor(Date.now() / 1000) + 600) * BigInt(1_000_000_000),
      memo: opts.memo ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`IBC transfer failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`IBC transfer submitted. TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`IBC transfer failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd ibc delegate-task
// ---------------------------------------------------------------------------

export type IBCDelegateTaskOptions = {
  channel: string;
  assignee: string;
  description: string;
  budget: string;
  deadlineBlocks?: string;
  requirements?: string;
};

export async function runIBCDelegateTask(opts: IBCDelegateTaskOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureIBCSigner();

  const deadlineBlocks = opts.deadlineBlocks ? parseInt(opts.deadlineBlocks, 10) : 200;
  const budgetAmount = opts.budget.replace(/[^0-9]/g, "");

  console.log(`Delegating task via IBC (${opts.channel}): "${opts.description}" to ${shortAddr(opts.assignee)}...`);

  const memo = JSON.stringify({
    clawchain_agent: {
      action: "delegate_task",
      task: {
        assignee: opts.assignee,
        description: opts.description,
        requirements: opts.requirements ?? "",
        budget: opts.budget,
        deadline_blocks: deadlineBlocks,
      },
    },
  });

  const msg = {
    typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
    value: {
      sourcePort: "transfer",
      sourceChannel: opts.channel,
      token: { denom, amount: budgetAmount || "1" },
      sender: account.address,
      receiver: opts.assignee,
      timeoutTimestamp: BigInt(Math.floor(Date.now() / 1000) + 600) * BigInt(1_000_000_000),
      memo,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`IBC delegate-task failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`IBC task delegation submitted. TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`IBC delegate-task failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd ibc shield
// ---------------------------------------------------------------------------

export type IBCShieldOptions = {
  channel: string;
  amount: string;
  denom?: string;
  receiver: string;
};

export async function runIBCShield(opts: IBCShieldOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureIBCSigner();

  const transferDenom = opts.denom ?? denom;

  console.log(`IBC shield transfer: ${opts.amount} ${transferDenom} via ${opts.channel} to ${shortAddr(opts.receiver)} (auto-shield)...`);

  const memo = JSON.stringify({
    clawchain_privacy: {
      auto_shield: true,
    },
  });

  const msg = {
    typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
    value: {
      sourcePort: "transfer",
      sourceChannel: opts.channel,
      token: { denom: transferDenom, amount: opts.amount },
      sender: account.address,
      receiver: opts.receiver,
      timeoutTimestamp: BigInt(Math.floor(Date.now() / 1000) + 600) * BigInt(1_000_000_000),
      memo,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`IBC shield failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`IBC shield transfer submitted. Tokens will be auto-shielded on arrival.`);
    console.log(`TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`IBC shield failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd ibc unshield
// ---------------------------------------------------------------------------

export type IBCUnshieldOptions = {
  channel: string;
  amount: string;
  proof: string;
  nullifier: string;
  receiver: string;
  denom?: string;
};

export async function runIBCUnshield(opts: IBCUnshieldOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureIBCSigner();

  const transferDenom = opts.denom ?? denom;

  console.log(`IBC unshield: ${opts.amount} ${transferDenom} via ${opts.channel} to ${shortAddr(opts.receiver)}...`);

  const memo = JSON.stringify({
    clawchain_privacy: {
      auto_shield: false,
      action: "unshield",
      proof: opts.proof,
      nullifier: opts.nullifier,
      amount: opts.amount,
    },
  });

  const msg = {
    typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
    value: {
      sourcePort: "transfer",
      sourceChannel: opts.channel,
      token: { denom: transferDenom, amount: "1" },
      sender: account.address,
      receiver: opts.receiver,
      timeoutTimestamp: BigInt(Math.floor(Date.now() / 1000) + 600) * BigInt(1_000_000_000),
      memo,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`IBC unshield failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`IBC unshield submitted. TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`IBC unshield failed: ${String(err)}`);
    process.exit(1);
  }
}
