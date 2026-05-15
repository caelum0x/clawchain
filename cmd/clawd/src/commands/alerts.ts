/**
 * `clawd alerts` — alert configuration and history.
 *
 * Subcommands:
 *   list           — show configured alerts
 *   add <type>     — add an alert rule
 *   remove <id>    — remove an alert
 *   history        — show triggered alerts history
 *   test <id>      — trigger a test alert
 *
 * Alerts are stored in ~/.clawd/alerts.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CLAWD_HOME } from "../lib/paths.js";
import { table, formatClaw } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid alert types. */
export type AlertType =
  | "block-delay"
  | "validator-jail"
  | "large-transfer"
  | "agent-slash"
  | "pool-imbalance"
  | "governance-proposal";

const VALID_ALERT_TYPES: AlertType[] = [
  "block-delay",
  "validator-jail",
  "large-transfer",
  "agent-slash",
  "pool-imbalance",
  "governance-proposal",
];

export interface AlertRule {
  /** Unique alert rule ID. */
  id: string;
  /** Alert type. */
  type: AlertType;
  /** Threshold value (meaning depends on type). */
  threshold?: string;
  /** Webhook URL for notifications. */
  webhook?: string;
  /** Email address for notifications. */
  email?: string;
  /** Whether the alert is enabled. */
  enabled: boolean;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** Human-readable description. */
  description: string;
}

export interface AlertEvent {
  /** Alert rule ID that triggered this event. */
  ruleId: string;
  /** Alert type. */
  type: AlertType;
  /** ISO timestamp of the trigger. */
  triggeredAt: string;
  /** Human-readable message. */
  message: string;
  /** Whether this was a test trigger. */
  isTest: boolean;
  /** Severity: info, warning, critical. */
  severity: "info" | "warning" | "critical";
}

interface AlertsStore {
  rules: AlertRule[];
  history: AlertEvent[];
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const ALERTS_PATH = join(CLAWD_HOME, "alerts.json");

function loadAlerts(): AlertsStore {
  try {
    const raw = readFileSync(ALERTS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AlertsStore>;
    return {
      rules: parsed.rules ?? [],
      history: parsed.history ?? [],
    };
  } catch {
    return { rules: [], history: [] };
  }
}

function saveAlerts(store: AlertsStore): void {
  mkdirSync(CLAWD_HOME, { recursive: true });
  writeFileSync(ALERTS_PATH, JSON.stringify(store, null, 2) + "\n");
}

function generateId(): string {
  return `alert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Build a human-readable description from the alert type and threshold. */
function describeAlert(type: AlertType, threshold?: string): string {
  switch (type) {
    case "block-delay":
      return `No new block for ${threshold ?? "30"} seconds`;
    case "validator-jail":
      return "A validator was jailed";
    case "large-transfer":
      return `Transfer exceeding ${threshold ?? "1000000"} uclaw`;
    case "agent-slash":
      return "An agent was slashed";
    case "pool-imbalance":
      return `DEX pool imbalance exceeds ${threshold ?? "10"}%`;
    case "governance-proposal":
      return "New governance proposal submitted";
  }
}

/** Map alert type to default severity. */
function alertSeverity(type: AlertType): "info" | "warning" | "critical" {
  switch (type) {
    case "block-delay":
      return "critical";
    case "validator-jail":
      return "critical";
    case "large-transfer":
      return "warning";
    case "agent-slash":
      return "warning";
    case "pool-imbalance":
      return "warning";
    case "governance-proposal":
      return "info";
  }
}

// ---------------------------------------------------------------------------
// Green/Yellow/Red helpers
// ---------------------------------------------------------------------------

function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}

function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}

function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}

function severityColor(severity: "info" | "warning" | "critical"): string {
  switch (severity) {
    case "info":
      return green("INFO");
    case "warning":
      return yellow("WARN");
    case "critical":
      return red("CRIT");
  }
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

/**
 * clawd alerts list
 */
export async function runAlertsList(opts: { json?: boolean }): Promise<void> {
  const store = loadAlerts();

  if (opts.json) {
    process.stdout.write(JSON.stringify(store.rules, null, 2) + "\n");
    return;
  }

  if (store.rules.length === 0) {
    console.log("No alert rules configured.");
    console.log(dim(`Run "clawd alerts add <type>" to create one.`));
    console.log(
      dim(`  Types: ${VALID_ALERT_TYPES.join(", ")}`),
    );
    return;
  }

  console.log(bold("Configured Alert Rules"));
  console.log("");

  const headers = ["ID", "Type", "Threshold", "Enabled", "Webhook", "Email", "Created"];
  const rows = store.rules.map((r) => [
    r.id,
    r.type,
    r.threshold ?? "-",
    r.enabled ? green("yes") : dim("no"),
    r.webhook ? r.webhook.slice(0, 30) + (r.webhook.length > 30 ? "..." : "") : "-",
    r.email ?? "-",
    r.createdAt.slice(0, 10),
  ]);

  console.log(table(headers, rows));
  console.log("");
  console.log(dim(`Total: ${store.rules.length} rule(s)`));
}

/**
 * clawd alerts add <type>
 */
export async function runAlertsAdd(
  type: string,
  opts: {
    threshold?: string;
    webhook?: string;
    email?: string;
    json?: boolean;
  },
): Promise<void> {
  // Validate type
  if (!VALID_ALERT_TYPES.includes(type as AlertType)) {
    console.error(
      `Invalid alert type: "${type}"\nValid types: ${VALID_ALERT_TYPES.join(", ")}`,
    );
    process.exit(1);
  }

  const alertType = type as AlertType;
  const store = loadAlerts();

  const rule: AlertRule = {
    id: generateId(),
    type: alertType,
    threshold: opts.threshold,
    webhook: opts.webhook,
    email: opts.email,
    enabled: true,
    createdAt: new Date().toISOString(),
    description: describeAlert(alertType, opts.threshold),
  };

  store.rules.push(rule);
  saveAlerts(store);

  if (opts.json) {
    process.stdout.write(JSON.stringify(rule, null, 2) + "\n");
    return;
  }

  console.log(green("Alert rule created successfully."));
  console.log("");
  console.log(`  ID:          ${rule.id}`);
  console.log(`  Type:        ${rule.type}`);
  console.log(`  Description: ${rule.description}`);
  if (rule.threshold) console.log(`  Threshold:   ${rule.threshold}`);
  if (rule.webhook) console.log(`  Webhook:     ${rule.webhook}`);
  if (rule.email) console.log(`  Email:       ${rule.email}`);
  console.log(`  Enabled:     ${green("yes")}`);
}

/**
 * clawd alerts remove <id>
 */
export async function runAlertsRemove(
  id: string,
  opts: { json?: boolean },
): Promise<void> {
  const store = loadAlerts();
  const idx = store.rules.findIndex((r) => r.id === id);

  if (idx === -1) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: "not_found", id }) + "\n");
    } else {
      console.error(`Alert rule not found: ${id}`);
    }
    process.exit(1);
  }

  const removed = store.rules.splice(idx, 1)[0];
  saveAlerts(store);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ removed: removed.id, type: removed.type }) + "\n");
    return;
  }

  console.log(green(`Alert rule removed: ${removed.id}`));
  console.log(`  Type: ${removed.type}`);
  console.log(`  Description: ${removed.description}`);
}

/**
 * clawd alerts history
 */
export async function runAlertsHistory(opts: { json?: boolean }): Promise<void> {
  const store = loadAlerts();

  if (opts.json) {
    process.stdout.write(JSON.stringify(store.history, null, 2) + "\n");
    return;
  }

  if (store.history.length === 0) {
    console.log("No alert events in history.");
    return;
  }

  console.log(bold("Alert History"));
  console.log("");

  const headers = ["Time", "Severity", "Type", "Rule ID", "Message", "Test"];
  const rows = store.history
    .slice()
    .reverse()
    .slice(0, 50)
    .map((e) => [
      e.triggeredAt.slice(0, 19).replace("T", " "),
      severityColor(e.severity),
      e.type,
      e.ruleId,
      e.message.length > 40 ? e.message.slice(0, 37) + "..." : e.message,
      e.isTest ? yellow("yes") : "",
    ]);

  console.log(table(headers, rows));
  console.log("");
  console.log(dim(`Total: ${store.history.length} event(s) (showing last 50)`));
}

/**
 * clawd alerts test <id>
 */
export async function runAlertsTest(
  id: string,
  opts: { json?: boolean },
): Promise<void> {
  const store = loadAlerts();
  const rule = store.rules.find((r) => r.id === id);

  if (!rule) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: "not_found", id }) + "\n");
    } else {
      console.error(`Alert rule not found: ${id}`);
    }
    process.exit(1);
  }

  const event: AlertEvent = {
    ruleId: rule.id,
    type: rule.type,
    triggeredAt: new Date().toISOString(),
    message: `[TEST] ${rule.description}`,
    isTest: true,
    severity: alertSeverity(rule.type),
  };

  store.history.push(event);
  saveAlerts(store);

  // If webhook is configured, attempt to fire it
  let webhookResult: string | null = null;
  if (rule.webhook) {
    try {
      const res = await fetch(rule.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alert: rule.type,
          severity: event.severity,
          message: event.message,
          triggeredAt: event.triggeredAt,
          isTest: true,
          ruleId: rule.id,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      webhookResult = res.ok ? "delivered" : `HTTP ${res.status}`;
    } catch (err) {
      webhookResult = `failed: ${String(err)}`;
    }
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ event, webhookResult: webhookResult ?? "not_configured" }, null, 2) + "\n",
    );
    return;
  }

  console.log(green("Test alert fired."));
  console.log("");
  console.log(`  Rule:     ${rule.id}`);
  console.log(`  Type:     ${rule.type}`);
  console.log(`  Severity: ${severityColor(event.severity)}`);
  console.log(`  Message:  ${event.message}`);
  if (webhookResult) {
    const webhookOk = webhookResult === "delivered";
    console.log(`  Webhook:  ${webhookOk ? green("delivered") : red(webhookResult)}`);
  }
  if (rule.email) {
    console.log(`  Email:    ${dim("notification queued (not implemented in CLI)")}`);
  }
}
