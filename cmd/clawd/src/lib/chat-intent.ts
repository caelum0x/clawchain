import { formatClaw, getAgentContacts, getWalletBalance, getWalletEarnings, getWalletHistory, sendWalletTokens } from "../commands/wallet.js";

export type ChatIntent =
  | { kind: "balance" }
  | { kind: "history"; limit: number; page: number }
  | { kind: "earnings"; window: string }
  | { kind: "contacts" }
  | { kind: "find"; query: string }
  | { kind: "send"; amount: string; to: string };

export function parseChatIntent(input: string): ChatIntent | null {
  const raw = input.trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  if (
    normalized === "balance" ||
    normalized === "bal" ||
    normalized === "/balance" ||
    normalized === "wallet balance" ||
    normalized === "what is my balance" ||
    normalized === "show my balance"
  ) {
    return { kind: "balance" };
  }
  if (
    normalized === "history" ||
    normalized === "/history" ||
    normalized === "wallet history" ||
    normalized === "show history"
  ) {
    return { kind: "history", limit: 10, page: 1 };
  }
  if (normalized === "earnings" || normalized === "/earnings") {
    return { kind: "earnings", window: "7d" };
  }
  if (normalized === "earnings week") {
    return { kind: "earnings", window: "7d" };
  }
  if (normalized === "earnings day") {
    return { kind: "earnings", window: "24h" };
  }
  if (normalized === "earnings month") {
    return { kind: "earnings", window: "30d" };
  }
  if (normalized === "contacts" || normalized === "/contacts") {
    return { kind: "contacts" };
  }
  const findMatch = raw.match(/^find\s+(@?[a-z0-9._-]{2,100})$/i);
  if (findMatch) {
    return { kind: "find", query: findMatch[1] };
  }

  const historyLimitMatch = normalized.match(/^history\s+(\d{1,3})$/i);
  if (historyLimitMatch) {
    const parsed = Number(historyLimitMatch[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return { kind: "history", limit: Math.min(parsed, 100), page: 1 };
    }
  }

  const historyPageMatch = normalized.match(/^history\s+page\s+(\d{1,3})$/i);
  if (historyPageMatch) {
    const parsed = Number(historyPageMatch[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return { kind: "history", limit: 10, page: parsed };
    }
  }

  const sendMatch = raw.match(/^send\s+(\d+(?:\.\d{1,6})?)\s*(?:claw)?\s+to\s+(@?[a-z0-9._-]{3,100})$/i);
  if (sendMatch) {
    const amount = sendMatch[1];
    const to = sendMatch[2];
    return { kind: "send", amount, to };
  }

  return null;
}

export async function executeChatIntent(intent: ChatIntent): Promise<string> {
  if (intent.kind === "balance") {
    const balance = await getWalletBalance({});
    return `Balance: ${balance.display} (${balance.amount} ${balance.denom})`;
  }

  if (intent.kind === "send") {
    const tx = await sendWalletTokens({ to: intent.to, amount: intent.amount });
    return `Sent ${formatClaw(tx.amountUclaw)} to ${tx.to}\nTxHash: ${tx.txHash}`;
  }
  if (intent.kind === "contacts") {
    const contacts = await getAgentContacts({ limit: 25 });
    if (contacts.length === 0) {
      return "Contacts: no known recipients yet.";
    }
    return [
      "Contacts:",
      ...contacts.map((c) => `- ${c.name} -> ${c.address} (${c.source})`),
    ].join("\n");
  }
  if (intent.kind === "find") {
    const contacts = await getAgentContacts({ query: intent.query, limit: 25 });
    if (contacts.length === 0) {
      return `Find '${intent.query}': no matches.`;
    }
    return [
      `Find '${intent.query}' (${contacts.length}):`,
      ...contacts.map((c) => `- ${c.name} -> ${c.address} (${c.source})`),
    ].join("\n");
  }
  if (intent.kind === "earnings") {
    const data = await getWalletEarnings({ window: intent.window });
    const totals = Array.isArray(data?.totals) ? data.totals : [];
    const top = totals
      .map((x: any) => `${x.amount} ${x.denom}`)
      .join(", ");
    return `Earnings (${data?.window ?? intent.window}): ${top || "0"}\n` +
      `staking=${formatCoinList(data?.breakdown?.staking_rewards)} ` +
      `task=${formatCoinList(data?.breakdown?.task_fees)} ` +
      `sales=${formatCoinList(data?.breakdown?.skill_sales)}`;
  }

  const boundedPage = Math.max(1, intent.page);
  const boundedLimit = Math.max(1, Math.min(100, intent.limit));
  const history = await fetchHistoryWindowByCursor(boundedPage, boundedLimit);
  const window = history.msgs;
  if (window.length === 0) {
    return "History: no transactions found.";
  }
  const lines: string[] = [];
  lines.push(`History page ${boundedPage} (showing ${window.length}):`);
  for (const item of window) {
    const msg = item?.msg ?? {};
    const hash = String(msg.txHash ?? "").slice(0, 14);
    const relation = String(msg.relation ?? "unknown");
    const time = String(msg.time ?? "");
    const denoms = Array.isArray(msg.denoms) ? msg.denoms.join(",") : "";
    lines.push(`${time} ${hash} ${relation}${denoms ? ` [${denoms}]` : ""}`.trim());
  }
  if (history.nextCursor) {
    lines.push(`Next cursor: ${history.nextCursor}`);
  }
  return lines.join("\n");
}

export function commandHelpText(): string {
  return [
    "Supported commands:",
    "- balance",
    "- history",
    "- history page <n>",
    "- earnings",
    "- earnings week",
    "- contacts",
    "- find <name>",
    "- send <amount> CLAW to <address|alias>",
  ].join("\n");
}

function formatCoinList(items: any): string {
  if (!Array.isArray(items) || items.length === 0) return "0";
  return items
    .map((x) => `${String(x?.amount ?? "0")} ${String(x?.denom ?? "")}`.trim())
    .join(",");
}

async function fetchHistoryWindowByCursor(page: number, limit: number): Promise<{ msgs: any[]; nextCursor: string }> {
  let cursor: string | undefined;
  for (let currentPage = 1; currentPage <= page; currentPage += 1) {
    const response = await getWalletHistory({
      limit,
      cursor,
    });
    const msgs = Array.isArray(response?.msgs) ? response.msgs : [];
    const nextCursor = String(response?.nextCursor ?? "");
    if (currentPage === page) {
      return { msgs, nextCursor };
    }
    if (!nextCursor) {
      return { msgs: [], nextCursor: "" };
    }
    cursor = nextCursor;
  }
  return { msgs: [], nextCursor: "" };
}
