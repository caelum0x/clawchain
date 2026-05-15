import { useCallback, useEffect, useRef, useState } from "react";
import { useChainEvents, type ChainEvent } from "./useChainEvents.ts";
import { CHAIN_RPC } from "../lib/chain.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationCategory = "task" | "message" | "gpu" | "privacy" | "transaction" | "governance" | "validator" | "staking";

export interface Notification {
  id: string;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "claw-notifications";
const MAX_NOTIFICATIONS = 50;

/** The on-chain event types we subscribe to. */
const SUBSCRIBED_EVENTS = [
  "complete_task",
  "delegate_task",
  "accept_task",
  "send_message",
  "submit_compute_job",
  "update_job_status",
  "settle_compute_job",
  "rate_agent",
  "shield",
  "unshield",
  "transfer",
  "tx_confirmed",
  "submit_proposal",
  "proposal_vote",
  "proposal_deposit",
  "validator_jailed",
  "validator_unjailed",
  "delegate",
  "undelegate",
  "withdraw_rewards",
  "rewards_available",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryFor(eventType: string): NotificationCategory {
  switch (eventType) {
    case "complete_task":
    case "delegate_task":
    case "accept_task":
    case "rate_agent":
      return "task";
    case "send_message":
      return "message";
    case "submit_compute_job":
    case "update_job_status":
    case "settle_compute_job":
      return "gpu";
    case "shield":
    case "unshield":
      return "privacy";
    case "transfer":
    case "tx_confirmed":
      return "transaction";
    case "submit_proposal":
    case "proposal_vote":
    case "proposal_deposit":
      return "governance";
    case "validator_jailed":
    case "validator_unjailed":
      return "validator";
    case "delegate":
    case "undelegate":
    case "withdraw_rewards":
    case "rewards_available":
      return "staking";
    default:
      return "task";
  }
}

function titleFor(eventType: string): string {
  switch (eventType) {
    case "complete_task":
      return "Task Completed";
    case "delegate_task":
      return "Task Delegated";
    case "accept_task":
      return "Task Accepted";
    case "send_message":
      return "New Message";
    case "submit_compute_job":
      return "Compute Job Submitted";
    case "update_job_status":
      return "Job Status Updated";
    case "settle_compute_job":
      return "Compute Job Settled";
    case "rate_agent":
      return "Agent Rated";
    case "shield":
      return "Tokens Shielded";
    case "unshield":
      return "Tokens Unshielded";
    case "transfer":
      return "Transfer Confirmed";
    case "tx_confirmed":
      return "Transaction Confirmed";
    case "submit_proposal":
      return "Proposal Voting Started";
    case "proposal_vote":
      return "Vote Cast";
    case "proposal_deposit":
      return "Proposal Deposit";
    case "validator_jailed":
      return "Validator Jailed";
    case "validator_unjailed":
      return "Validator Unjailed";
    case "delegate":
      return "Stake Delegated";
    case "undelegate":
      return "Stake Undelegated";
    case "withdraw_rewards":
      return "Rewards Claimed";
    case "rewards_available":
      return "Stake Rewards Available";
    default:
      return eventType;
  }
}

function messageFor(eventType: string, attrs: Record<string, string>): string {
  const addr = (v: string | undefined) =>
    v ? (v.length > 16 ? `${v.slice(0, 10)}...${v.slice(-6)}` : v) : "unknown";

  switch (eventType) {
    case "complete_task":
      return `Task #${attrs.task_id ?? "?"} completed by ${addr(attrs.assignee ?? attrs.creator)}`;
    case "delegate_task":
      return `Task #${attrs.task_id ?? "?"} delegated to ${addr(attrs.assignee ?? attrs.agent)}`;
    case "accept_task":
      return `Task #${attrs.task_id ?? "?"} accepted by ${addr(attrs.assignee ?? attrs.agent)}`;
    case "send_message":
      return `Message from ${addr(attrs.sender)} to ${addr(attrs.recipient)}`;
    case "submit_compute_job":
      return `Job #${attrs.job_id ?? "?"} submitted on resource #${attrs.resource_id ?? "?"}`;
    case "update_job_status":
      return `Job #${attrs.job_id ?? "?"} status: ${attrs.status ?? "updated"}`;
    case "settle_compute_job":
      return `Job #${attrs.job_id ?? "?"} settled — ${attrs.amount ?? "?"} paid`;
    case "rate_agent":
      return `Agent ${addr(attrs.agent ?? attrs.agent_address)} rated ${attrs.rating ?? "?"}`;
    case "shield":
      return `${attrs.amount ?? "?"} shielded by ${addr(attrs.sender ?? attrs.creator)}`;
    case "unshield":
      return `${attrs.amount ?? "?"} unshielded to ${addr(attrs.recipient ?? attrs.creator)}`;
    case "transfer":
      return `${attrs.amount ?? "?"} transferred from ${addr(attrs.sender)} to ${addr(attrs.recipient)}`;
    case "tx_confirmed":
      return `Transaction ${addr(attrs.hash ?? attrs.tx_hash ?? "?")} confirmed at height ${attrs.height ?? "?"}`;
    case "submit_proposal":
      return `Proposal #${attrs.proposal_id ?? "?"} voting period started: ${attrs.title ?? "Governance proposal"}`;
    case "proposal_vote":
      return `Vote cast on proposal #${attrs.proposal_id ?? "?"} by ${addr(attrs.voter)}`;
    case "proposal_deposit":
      return `${attrs.amount ?? "?"} deposited on proposal #${attrs.proposal_id ?? "?"}`;
    case "validator_jailed":
      return `Validator ${addr(attrs.validator ?? attrs.operator)} has been jailed`;
    case "validator_unjailed":
      return `Validator ${addr(attrs.validator ?? attrs.operator)} has been unjailed`;
    case "delegate":
      return `${attrs.amount ?? "?"} delegated to ${addr(attrs.validator)}`;
    case "undelegate":
      return `${attrs.amount ?? "?"} undelegated from ${addr(attrs.validator)}`;
    case "withdraw_rewards":
      return `${attrs.amount ?? "?"} rewards claimed from ${addr(attrs.validator)}`;
    case "rewards_available":
      return `Staking rewards of ${attrs.amount ?? "?"} are available for claiming`;
    default:
      return eventType;
  }
}

function loadFromStorage(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Notification[];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: Notification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // localStorage may be full or unavailable — silently ignore.
  }
}

function tryBrowserNotification(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if ((Notification as unknown as { permission: string }).permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/claw.svg" });
  } catch {
    // Browser may block in certain contexts.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(loadFromStorage);

  // Keep a ref so the event handler always sees the latest list.
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  // Request browser notification permission on mount (non-blocking).
  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      (Notification as unknown as { permission: string }).permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Persist whenever notifications change.
  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  // Callback invoked for every matching chain event.
  const handleEvent = useCallback((event: ChainEvent) => {
    const id = `${event.type}-${event.height}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const title = titleFor(event.type);
    const body = messageFor(event.type, event.attributes);

    const entry: Notification = {
      id,
      type: event.type,
      category: categoryFor(event.type),
      title,
      message: body,
      timestamp: Date.now(),
      read: false,
    };

    setNotifications((prev) => [entry, ...prev].slice(0, MAX_NOTIFICATIONS));

    tryBrowserNotification(title, body);
  }, []);

  // Subscribe to chain events.
  useChainEvents({
    rpcUrl: CHAIN_RPC,
    eventTypes: SUBSCRIBED_EVENTS,
    onEvent: handleEvent,
    enabled: true,
  });

  // ------ Actions ------

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, markAllRead, clearAll } as const;
}
