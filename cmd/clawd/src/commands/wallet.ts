/**
 * `clawd wallet` - simple wallet UX for operators.
 */

import { GasPrice, SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";

const DEFAULT_HISTORY_URL = "http://127.0.0.1:17171";

type WalletBalanceOptions = {
  address?: string;
  denom?: string;
  json?: boolean;
};

type WalletSendOptions = {
  to: string;
  amount: string;
  denom?: string;
  memo?: string;
};

type WalletHistoryOptions = {
  address?: string;
  limit?: number;
  from?: string;
  cursor?: string;
  json?: boolean;
};

type WalletEarningsOptions = {
  address?: string;
  from?: string;
  window?: string;
  json?: boolean;
};

export type AgentContact = {
  name: string;
  address: string;
  source: "alias" | "onchain";
};

export async function runWalletBalance(options: WalletBalanceOptions): Promise<void> {
  let payload: {
    address: string;
    denom: string;
    amount: string;
    display: string;
    allBalances: Array<{ denom: string; amount: string }>;
  };
  try {
    payload = await getWalletBalance(options);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  console.log(`Address: ${payload.address}`);
  console.log(`Balance: ${payload.display} (${payload.amount} ${payload.denom})`);
  if (payload.allBalances.length > 1) {
    console.log("All balances:");
    for (const bal of payload.allBalances) {
      console.log(`  - ${bal.amount} ${bal.denom}`);
    }
  }
}

export async function runWalletSend(options: WalletSendOptions): Promise<void> {
  let result: { amountUclaw: string; to: string; txHash: string };
  try {
    result = await sendWalletTokens(options);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  console.log(`Sent ${formatClaw(result.amountUclaw)} to ${result.to}`);
  console.log(`TxHash: ${result.txHash}`);
}

export async function runWalletHistory(options: WalletHistoryOptions): Promise<void> {
  let response: any;
  try {
    response = await getWalletHistory(options);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  const msgs = Array.isArray(response?.msgs) ? response.msgs : [];
  if (options.json) {
    process.stdout.write(JSON.stringify(response, null, 2) + "\n");
    return;
  }

  if (msgs.length === 0) {
    console.log("No transactions found.");
    return;
  }

  for (const item of msgs) {
    const msg = item?.msg ?? {};
    const hash = String(msg.txHash ?? "").slice(0, 14);
    const relation = String(msg.relation ?? "unknown");
    const time = String(msg.time ?? "");
    const denoms = Array.isArray(msg.denoms) ? msg.denoms.join(",") : "";
    console.log(`${time}  ${hash}  ${relation}${denoms ? `  [${denoms}]` : ""}`);
  }
  const nextCursor = String(response?.nextCursor ?? "");
  if (nextCursor) {
    console.log(`Next cursor: ${nextCursor}`);
  }
}

export async function getWalletBalance(options: WalletBalanceOptions): Promise<{
  address: string;
  denom: string;
  amount: string;
  display: string;
  allBalances: Array<{ denom: string; amount: string }>;
}> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const denom = options.denom ?? cfg.denom ?? "uclaw";
  const address = options.address ?? cfg.agentAddress;

  if (!address) {
    throw new Error('No wallet address found. Run "clawd init" first or pass --address.');
  }

  const client = await StargateClient.connect(rpcUrl);
  const [primary, balances] = await Promise.all([
    client.getBalance(address, denom),
    client.getAllBalances(address),
  ]);
  client.disconnect();

  return {
    address,
    denom: primary.denom,
    amount: primary.amount,
    display: formatClaw(primary.amount),
    allBalances: balances.map((b) => ({ denom: b.denom, amount: b.amount })),
  };
}

export async function sendWalletTokens(options: WalletSendOptions): Promise<{
  amountUclaw: string;
  to: string;
  txHash: string;
}> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = options.denom ?? cfg.denom ?? "uclaw";
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

  const amount = parseClawAmount(options.amount);
  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  const toResolved = await resolveRecipient(options.to, cfg, rpcUrl);
  const res = await signingClient.sendTokens(
    account.address,
    toResolved,
    [{ denom, amount }],
    "auto",
    options.memo ?? "",
  );
  signingClient.disconnect();

  if (res.code !== 0) {
    throw new Error(`Send failed (code=${res.code}): ${res.rawLog}`);
  }

  return { amountUclaw: amount, to: toResolved, txHash: res.transactionHash };
}

export async function getWalletHistory(options: WalletHistoryOptions): Promise<any> {
  const cfg = loadClawdConfig();
  const address = options.address ?? cfg.agentAddress;
  if (!address) {
    throw new Error('No wallet address found. Run "clawd init" first or pass --address.');
  }

  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const historyBase = (options.from ?? process.env.CLAW_TX_HISTORY_URL ?? DEFAULT_HISTORY_URL).replace(/\/?$/, "");
  const chainId = cfg.chainId ?? "clawchain-1";
  const chainIdentifier = toChainIdentifier(chainId);
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  const url = `${historyBase}/history/v2/msgs/${encodeURIComponent(chainIdentifier)}/${encodeURIComponent(address)}?${params.toString()}`;

  let response: any;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    response = await res.json();
  } catch (err) {
    throw new Error(`History backend unavailable at ${historyBase}: ${String(err)}\nRun: npm --prefix claw-wallet run tx-history:dev`);
  }
  return response;
}

export async function runWalletEarnings(options: WalletEarningsOptions): Promise<void> {
  let response: any;
  try {
    response = await getWalletEarnings(options);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(response, null, 2) + "\n");
    return;
  }

  console.log(`Address: ${response.address}`);
  console.log(`Window:  ${response.window} (since ${response.since})`);
  console.log("Totals:");
  printCoinList(response.totals);
  console.log("Breakdown:");
  console.log("  staking rewards:");
  printCoinList(response.breakdown?.staking_rewards, "    ");
  console.log("  task fees:");
  printCoinList(response.breakdown?.task_fees, "    ");
  console.log("  skill sales:");
  printCoinList(response.breakdown?.skill_sales, "    ");
  console.log("  incoming transfers:");
  printCoinList(response.breakdown?.incoming_transfers, "    ");
}

export async function getWalletEarnings(options: WalletEarningsOptions): Promise<any> {
  const cfg = loadClawdConfig();
  const address = options.address ?? cfg.agentAddress;
  if (!address) {
    throw new Error('No wallet address found. Run "clawd init" first or pass --address.');
  }
  const historyBase = (options.from ?? process.env.CLAW_TX_HISTORY_URL ?? DEFAULT_HISTORY_URL).replace(/\/?$/, "");
  const chainId = cfg.chainId ?? "clawchain-1";
  const chainIdentifier = toChainIdentifier(chainId);
  const windowText = (options.window ?? "7d").trim();
  const url = `${historyBase}/history/v2/earnings/${encodeURIComponent(chainIdentifier)}/${encodeURIComponent(address)}?window=${encodeURIComponent(windowText)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    throw new Error(`Earnings backend unavailable at ${historyBase}: ${String(err)}\nRun: go run ./cmd/claw-txhistoryd`);
  }
}

export async function runWalletContacts(options: {
  query?: string;
  limit?: number;
  json?: boolean;
} = {}): Promise<void> {
  let contacts: AgentContact[] = [];
  try {
    contacts = await getAgentContacts({ query: options.query, limit: options.limit });
  } catch (err) {
    console.error(`Failed to load contacts: ${String(err)}`);
    process.exit(1);
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ contacts }, null, 2) + "\n");
    return;
  }

  if (contacts.length === 0) {
    if (options.query) {
      console.log(`No contacts found for '${options.query}'.`);
    } else {
      console.log("No contacts found.");
    }
    return;
  }

  console.log(`Contacts (${contacts.length}):`);
  for (const c of contacts) {
    console.log(`- ${c.name} -> ${c.address} (${c.source})`);
  }
}

export function parseClawAmount(raw: string): string {
  const v = raw.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(v)) {
    throw new Error(`Invalid amount '${raw}'. Use whole or decimal CLAW (max 6 decimals).`);
  }
  const [wholePart, fracPartRaw = ""] = v.split(".");
  const fracPart = fracPartRaw.padEnd(6, "0");
  const whole = BigInt(wholePart);
  const frac = BigInt(fracPart || "0");
  return (whole * 1_000_000n + frac).toString();
}

export function formatClaw(amountUclaw: string): string {
  const n = BigInt(amountUclaw || "0");
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  if (frac === 0n) return `${whole} CLAW`;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} CLAW`;
}

export function toChainIdentifier(chainId: string): string {
  const normalized = chainId.toLowerCase();
  if (normalized.startsWith("clawchain-testnet")) return "clawchain-testnet";
  if (normalized.startsWith("clawchain")) return "clawchain";
  const dash = normalized.indexOf("-");
  return dash > 0 ? normalized.slice(0, dash) : normalized;
}

function printCoinList(items: Array<{ denom?: string; amount?: string }> | undefined, indent = "  "): void {
  if (!Array.isArray(items) || items.length === 0) {
    console.log(`${indent}- 0`);
    return;
  }
  for (const item of items) {
    const denom = String(item?.denom ?? "");
    const amount = String(item?.amount ?? "0");
    const display = denom === "uclaw" ? formatClaw(amount) : `${amount} ${denom}`;
    console.log(`${indent}- ${display}`);
  }
}

function resolveRecipientAlias(raw: string, cfg: ReturnType<typeof loadClawdConfig>): string {
  const target = String(raw ?? "").trim();
  if (!target) {
    throw new Error("Recipient is required.");
  }
  if (target.startsWith((cfg.prefix ?? "claw") + "1")) {
    return target;
  }
  const aliases = cfg.recipientAliases ?? {};
  const resolved = aliases[target.toLowerCase()];
  if (!resolved) {
    throw new Error(`Unknown recipient alias '${target}'. Add it via clawd config recipientAliases.`);
  }
  return resolved;
}

async function resolveRecipient(
  raw: string,
  cfg: ReturnType<typeof loadClawdConfig>,
  rpcUrl: string,
): Promise<string> {
  const target = String(raw ?? "").trim();
  const prefix = (cfg.prefix ?? "claw").toLowerCase();
  if (target.toLowerCase().startsWith(`${prefix}1`)) {
    return target;
  }

  // 1) Local alias map
  try {
    return resolveRecipientAlias(target, cfg);
  } catch {
    // fallback to on-chain name lookup
  }

  // 2) On-chain agent name lookup
  const byName = await lookupAgentAddressByName(target, cfg, rpcUrl);
  if (byName) {
    return byName;
  }

  throw new Error(`Unknown recipient '${target}'. Use a bech32 address, alias, or registered agent name.`);
}

async function lookupAgentAddressByName(
  rawName: string,
  cfg: ReturnType<typeof loadClawdConfig>,
  rpcUrl: string,
): Promise<string | null> {
  const want = rawName.trim().toLowerCase().replace(/^@/, "");
  if (!want) return null;
  const contacts = await getAgentContacts({ query: want, limit: 200 });
  const exact = contacts.find((c) => c.name.trim().toLowerCase() === want);
  if (exact?.address) return exact.address;
  const starts = contacts.find((c) => c.name.trim().toLowerCase().startsWith(want));
  if (starts?.address) return starts.address;
  return null;
}

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

export async function getAgentContacts(options: {
  query?: string;
  limit?: number;
} = {}): Promise<AgentContact[]> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const limit = Math.max(1, Math.min(500, options.limit ?? 50));
  const query = String(options.query ?? "").trim().toLowerCase().replace(/^@/, "");

  const out: AgentContact[] = [];
  const byAddress = new Map<string, AgentContact>();

  // local aliases
  const aliases = cfg.recipientAliases ?? {};
  for (const [alias, address] of Object.entries(aliases)) {
    const entry: AgentContact = {
      name: alias,
      address: String(address),
      source: "alias",
    };
    byAddress.set(entry.address, entry);
    out.push(entry);
  }

  // on-chain live agents
  const live = await fetchLiveAgents(cfg, rpcUrl);
  for (const agent of live) {
    const address = String(agent.address ?? "").trim();
    if (!address) continue;
    const name = String(agent.name ?? "").trim() || address;
    const existing = byAddress.get(address);
    if (existing) {
      // preserve alias as primary but fill missing name if alias absent.
      if (!existing.name && name) {
        existing.name = name;
      }
      continue;
    }
    const entry: AgentContact = {
      name,
      address,
      source: "onchain",
    };
    byAddress.set(address, entry);
    out.push(entry);
  }

  let filtered = out;
  if (query) {
    filtered = out.filter((c) => {
      const name = c.name.toLowerCase();
      const addr = c.address.toLowerCase();
      return name.includes(query) || addr.includes(query);
    });
  }

  filtered.sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    return a.address.localeCompare(b.address);
  });

  return filtered.slice(0, limit);
}

async function fetchLiveAgents(
  cfg: ReturnType<typeof loadClawdConfig>,
  rpcUrl: string,
): Promise<Array<{ address?: string; name?: string }>> {
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
  const candidates: string[] = [
    `${restUrl}/clawchain/agent/v1/live?pagination.limit=500`,
    `${restUrl}/clawchain/agent/v1/live`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        agents?: Array<{ address?: string; name?: string }>;
      };
      if (Array.isArray(data?.agents)) {
        return data.agents;
      }
    } catch {
      // try next
    }
  }
  return [];
}
