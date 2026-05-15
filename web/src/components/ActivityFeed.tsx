import { useCallback, useEffect, useRef, useState } from "react";
import { getRecentBlocks, getTxsByHeight, getLatestBlock } from "../lib/chain";
import type { Tx, TxMessage } from "../lib/chain";
import { chainConfig } from "../lib/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType =
  | "Transfer"
  | "Stake"
  | "Vote"
  | "AgentRegister"
  | "DEXSwap"
  | "PrivacyShield"
  | "ContractExecute";

export interface ActivityEvent {
  id: string;
  type: EventType;
  description: string;
  from: string;
  to: string;
  amount: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_ICONS: Record<EventType, string> = {
  Transfer: "\u21C4",
  Stake: "\u2B50",
  Vote: "\u2611",
  AgentRegister: "\u2699",
  DEXSwap: "\u21C5",
  PrivacyShield: "\u26E8",
  ContractExecute: "\u25B6",
};

const EVENT_COLORS: Record<EventType, string> = {
  Transfer: "var(--accent, #38bdf8)",
  Stake: "var(--green, #4ade80)",
  Vote: "var(--purple, #a78bfa)",
  AgentRegister: "#fb923c",
  DEXSwap: "#f472b6",
  PrivacyShield: "var(--yellow, #fbbf24)",
  ContractExecute: "#60a5fa",
};

const EVENT_BG: Record<EventType, string> = {
  Transfer: "rgba(56,189,248,0.12)",
  Stake: "rgba(74,222,128,0.12)",
  Vote: "rgba(167,139,250,0.12)",
  AgentRegister: "rgba(251,146,60,0.12)",
  DEXSwap: "rgba(244,114,182,0.12)",
  PrivacyShield: "rgba(251,191,36,0.12)",
  ContractExecute: "rgba(96,165,250,0.12)",
};

const ALL_EVENT_TYPES: EventType[] = [
  "Transfer",
  "Stake",
  "Vote",
  "AgentRegister",
  "DEXSwap",
  "PrivacyShield",
  "ContractExecute",
];

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  Transfer: "Transfer",
  Stake: "Stake",
  Vote: "Vote",
  AgentRegister: "Agent Register",
  DEXSwap: "DEX Swap",
  PrivacyShield: "Privacy Shield",
  ContractExecute: "Contract Execute",
};

const POLL_INTERVAL_MS = 10_000;

// ---------------------------------------------------------------------------
// Map typeUrl to EventType
// ---------------------------------------------------------------------------

function classifyMessage(typeUrl: string): EventType {
  const url = typeUrl.toLowerCase();
  if (url.includes("msgdelegate") || url.includes("msgundelegate") || url.includes("msgredelegate") || url.includes("msgbeginredelegate")) return "Stake";
  if (url.includes("msgvote") || url.includes("msgsubmitproposal") || url.includes("msgdeposit")) return "Vote";
  if (url.includes("msgregisteragent") || url.includes("msgderegisteragent") || url.includes("msgheart")) return "AgentRegister";
  if (url.includes("msgshield") || url.includes("msgunshield") || url.includes("msgprivatetransfer")) return "PrivacyShield";
  if (url.includes("msgexecutecontract") || url.includes("msginstantiatecontract") || url.includes("msgmigratecontract")) return "ContractExecute";
  if (url.includes("swap") || url.includes("dex")) return "DEXSwap";
  // Default to Transfer for MsgSend, MsgMultiSend, IBC transfers, and anything else
  return "Transfer";
}

// ---------------------------------------------------------------------------
// Extract sender, recipient, and amount from a message
// ---------------------------------------------------------------------------

function extractSender(msg: TxMessage): string {
  const v = msg.value ?? {};
  return (
    (v.from_address as string) ??
    (v.sender as string) ??
    (v.delegator_address as string) ??
    (v.voter as string) ??
    (v.proposer as string) ??
    (v.creator as string) ??
    ""
  );
}

function extractRecipient(msg: TxMessage): string {
  const v = msg.value ?? {};
  return (
    (v.to_address as string) ??
    (v.receiver as string) ??
    (v.validator_address as string) ??
    (v.contract as string) ??
    ""
  );
}

function formatCoinAmount(coins: unknown): string {
  if (!coins) return "";
  // Single coin object: { denom, amount }
  if (typeof coins === "object" && !Array.isArray(coins)) {
    const c = coins as { denom?: string; amount?: string };
    if (c.amount && c.denom) {
      return formatSingleCoin(c.amount, c.denom);
    }
  }
  // Array of coins
  if (Array.isArray(coins) && coins.length > 0) {
    const c = coins[0] as { denom?: string; amount?: string };
    if (c.amount && c.denom) {
      return formatSingleCoin(c.amount, c.denom);
    }
  }
  return "";
}

function formatSingleCoin(amount: string, denom: string): string {
  if (denom === chainConfig.coinMinimalDenom) {
    const decimal = parseInt(amount, 10) / Math.pow(10, chainConfig.coinDecimals);
    const formatted = decimal % 1 === 0 ? decimal.toLocaleString() : decimal.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `${formatted} ${chainConfig.coinDenom}`;
  }
  return `${amount} ${denom}`;
}

function extractAmount(msg: TxMessage): string {
  const v = msg.value ?? {};
  // MsgSend, MsgMultiSend
  if (v.amount) return formatCoinAmount(v.amount);
  // MsgDelegate, MsgUndelegate, etc.
  if (v.token) return formatCoinAmount(v.token);
  return "";
}

// ---------------------------------------------------------------------------
// Build a human-readable description
// ---------------------------------------------------------------------------

function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}

function buildDescription(type: EventType, msg: TxMessage, from: string, to: string): string {
  const sf = from ? shortAddr(from) : "unknown";
  const st = to ? shortAddr(to) : "";
  switch (type) {
    case "Transfer":
      return st ? `${sf} sent tokens to ${st}` : `${sf} transferred tokens`;
    case "Stake":
      return st ? `${sf} delegated stake to validator ${st}` : `${sf} staking action`;
    case "Vote": {
      const proposalId = (msg.value?.proposal_id as string) ?? "";
      return proposalId
        ? `${sf} voted on governance proposal #${proposalId}`
        : `${sf} participated in governance`;
    }
    case "AgentRegister": {
      const agentName = (msg.value?.name as string) ?? "";
      return agentName
        ? `${sf} registered agent "${agentName}"`
        : `${sf} agent registry action`;
    }
    case "DEXSwap":
      return `${sf} swapped tokens on ClawDEX`;
    case "PrivacyShield":
      return `${sf} shielded tokens using ZK proof`;
    case "ContractExecute":
      return st ? `${sf} executed contract ${st}` : `${sf} executed a contract`;
  }
}

// ---------------------------------------------------------------------------
// Convert a chain Tx into ActivityEvent(s) — one per message
// ---------------------------------------------------------------------------

function txToEvents(tx: Tx): ActivityEvent[] {
  if (tx.code !== 0) return []; // skip failed txs
  const ts = tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now();
  return tx.messages.map((msg, i) => {
    const type = classifyMessage(msg.typeUrl);
    const from = extractSender(msg);
    const to = extractRecipient(msg);
    return {
      id: `${tx.hash}-${i}`,
      type,
      description: buildDescription(type, msg, from, to),
      from,
      to,
      amount: extractAmount(msg),
      timestamp: ts,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Set<EventType>>(new Set(ALL_EVENT_TYPES));
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showFilters, setShowFilters] = useState(false);
  const lastHeightRef = useRef<string>("0");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch transactions from a set of block heights, returning ActivityEvents
  const fetchTxsFromBlocks = useCallback(async (heights: string[]): Promise<ActivityEvent[]> => {
    const txArrays = await Promise.all(heights.map((h) => getTxsByHeight(h)));
    const allTxs = txArrays.flat();
    return allTxs.flatMap(txToEvents);
  }, []);

  // Initial load: fetch recent blocks and their transactions
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const blocks = await getRecentBlocks(5);
        if (cancelled) return;
        if (blocks.length > 0) {
          lastHeightRef.current = blocks[0].height;
        }
        // Only fetch txs from blocks that actually have transactions
        const heights = blocks.filter((b) => b.txCount > 0).map((b) => b.height);
        const newEvents = await fetchTxsFromBlocks(heights);
        if (cancelled) return;
        // Sort descending by timestamp
        newEvents.sort((a, b) => b.timestamp - a.timestamp);
        setEvents(newEvents);
      } catch {
        // Chain may be unreachable — leave events empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [fetchTxsFromBlocks]);

  // Poll for new blocks every 10 seconds
  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const latest = await getLatestBlock();
        const latestH = parseInt(latest.height);
        const lastH = parseInt(lastHeightRef.current);
        if (latestH <= lastH) return;

        // Fetch all new blocks since our last known height
        const newHeights: string[] = [];
        for (let h = lastH + 1; h <= latestH; h++) {
          newHeights.push(String(h));
        }
        lastHeightRef.current = latest.height;

        // Only fetch txs if there could be transactions
        if (newHeights.length === 0) return;
        const newEvents = await fetchTxsFromBlocks(newHeights);
        if (newEvents.length > 0) {
          setEvents((prev) => {
            const merged = [...newEvents, ...prev];
            // Deduplicate by id and cap at 200
            const seen = new Set<string>();
            const deduped: ActivityEvent[] = [];
            for (const e of merged) {
              if (!seen.has(e.id)) {
                seen.add(e.id);
                deduped.push(e);
              }
            }
            return deduped.slice(0, 200);
          });
        }
      } catch {
        // Ignore polling errors
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTxsFromBlocks]);

  const toggleFilter = useCallback((type: EventType) => {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setFilters(new Set(ALL_EVENT_TYPES));
  }, []);

  const selectNone = useCallback(() => {
    setFilters(new Set());
  }, []);

  const filteredEvents = events.filter((e) => filters.has(e.type));
  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEvents.length;

  return (
    <div className="activity-feed-container" data-testid="activity-feed-component">
      {/* Header */}
      <div className="activity-feed-header">
        <h3>Chain Activity</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {loading ? "loading\u2026" : `${filteredEvents.length} events`}
          </span>
          <button
            onClick={() => setShowFilters((v) => !v)}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              background: showFilters ? "var(--accent)" : "var(--bg3)",
              color: showFilters ? "#fff" : "var(--text2)",
              border: `1px solid ${showFilters ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              cursor: "pointer",
            }}
          >
            {showFilters ? "Hide Filters" : "Filters"}
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="activity-feed-filters">
          {ALL_EVENT_TYPES.map((type) => (
            <label key={type}>
              <input
                type="checkbox"
                checked={filters.has(type)}
                onChange={() => toggleFilter(type)}
              />
              <span style={{ color: EVENT_COLORS[type] }}>
                {EVENT_ICONS[type]}
              </span>
              {EVENT_TYPE_LABELS[type]}
            </label>
          ))}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button
              onClick={selectAll}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--accent)",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              All
            </button>
            <button
              onClick={selectNone}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text2)",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              None
            </button>
          </div>
        </div>
      )}

      {/* Events list */}
      {loading ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--text2)",
            fontSize: 14,
          }}
        >
          Loading chain activity...
        </div>
      ) : visibleEvents.length === 0 ? (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--text2)",
            fontSize: 14,
          }}
        >
          {filters.size === 0
            ? "No event types selected. Use the filter to show events."
            : "No recent activity"}
        </div>
      ) : (
        visibleEvents.map((event) => (
          <div className="activity-event" key={event.id} data-testid="activity-event">
            {/* Icon */}
            <div
              className="activity-event-icon"
              style={{
                background: EVENT_BG[event.type],
                color: EVENT_COLORS[event.type],
              }}
            >
              {EVENT_ICONS[event.type]}
            </div>

            {/* Content */}
            <div className="activity-event-content">
              <div className="activity-event-desc">{event.description}</div>
              <div className="activity-event-meta">
                <span
                  className="badge"
                  style={{
                    background: EVENT_BG[event.type],
                    color: EVENT_COLORS[event.type],
                    fontSize: 10,
                    padding: "1px 6px",
                  }}
                >
                  {EVENT_TYPE_LABELS[event.type]}
                </span>
                {event.amount && (
                  <span className="activity-event-amount">{event.amount}</span>
                )}
                {event.from && (
                  <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>
                    {shortAddr(event.from)}
                  </span>
                )}
                <span style={{ opacity: 0.5 }}>{timeAgo(event.timestamp)}</span>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Load more */}
      {hasMore && (
        <button
          className="activity-load-more"
          onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
        >
          Load more ({filteredEvents.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}
