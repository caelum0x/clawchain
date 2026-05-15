/**
 * `clawd monitoring` subcommands -- monitoring stack management and validation.
 *
 * Subcommands:
 *   status      -- check monitoring infrastructure status (Prometheus, Grafana, AlertManager)
 *   check       -- validate monitoring configuration files
 *   metrics     -- query current Prometheus metrics for ClawChain
 *   alerts      -- check current alerts and alert history
 *   dashboards  -- list and validate Grafana dashboards
 *   export      -- export monitoring configs for deployment
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadClawdConfig } from "../lib/config.js";
import { table } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HTTP_TIMEOUT = 8_000;

const EXPECTED_ALERT_RULES = [
  "HighBlockTime",
  "LowPeerCount",
  "ValidatorJailed",
  "NodeDown",
  "MempoolBacklog",
  "ConsensusStalled",
  "HighMemoryUsage",
  "AgentRegistrationDrop",
  "GPUProviderOffline",
  "PrivacyPoolAnomaly",
];

const EXPECTED_DASHBOARD_ROWS = [
  "chain",
  "agents",
  "gpu",
  "privacy",
  "marketplace",
  "dex",
  "system",
];

const CLAWCHAIN_METRICS = [
  { name: "cometbft_consensus_height", label: "Block Height", unit: "" },
  { name: "cometbft_consensus_validators", label: "Active Validators", unit: "" },
  { name: "cometbft_p2p_peers", label: "Peer Count", unit: "" },
  { name: "cometbft_consensus_rounds", label: "Consensus Rounds", unit: "" },
  { name: "cometbft_mempool_size", label: "Mempool Txs", unit: "" },
  { name: "process_resident_memory_bytes", label: "Memory Usage", unit: "bytes" },
  { name: "clawchain_agent_count", label: "Registered Agents", unit: "" },
  { name: "clawchain_gpu_utilization", label: "GPU Utilization", unit: "%" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchStatus(url: string): Promise<{ ok: boolean; latencyMs: number; status?: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT) });
    const latencyMs = Date.now() - start;
    return { ok: res.status >= 200 && res.status < 400, latencyMs, status: res.status };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs, error: message };
  }
}

function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}

function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}

function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}

function statusTag(ok: boolean): string {
  return ok ? green("[OK]") : red("[FAIL]");
}

function warnTag(): string {
  return yellow("[WARN]");
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(1)} ${units[i]}`;
}

function durationSince(isoTime: string): string {
  try {
    const diff = Date.now() - new Date(isoTime).getTime();
    if (diff < 0) return "future";
    if (diff < 1000) return "<1s";
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
  } catch {
    return "-";
  }
}

function defaultConfigDir(): string {
  const cfg = loadClawdConfig();
  // Look in the project root monitoring/ directory as default
  const projectRoot = resolve(
    cfg.nodeHome || process.cwd(),
    "..",
  );
  const monitoringDir = join(projectRoot, "monitoring");
  if (existsSync(monitoringDir)) return monitoringDir;
  return join(process.cwd(), "monitoring");
}

// ---------------------------------------------------------------------------
// Types (compact — only fields we actually read)
// ---------------------------------------------------------------------------

type PromTarget = { labels?: Record<string, string>; lastError?: string; lastScrape?: string; health?: string };
type PromTargetsResp = { status?: string; data?: { activeTargets?: PromTarget[] } };
type PromQueryResp = { status?: string; data?: { result?: Array<{ metric?: Record<string, string>; value?: [number, string] }> } };
type AMAlert = { annotations?: Record<string, string>; startsAt?: string; endsAt?: string; status?: { state?: string; silencedBy?: string[]; inhibitedBy?: string[] }; generatorURL?: string; labels?: Record<string, string> };
type AMGroup = { labels?: Record<string, string>; receiver?: { name?: string }; alerts?: AMAlert[] };
type AMSilence = { id?: string; status?: { state?: string }; comment?: string; createdBy?: string; startsAt?: string; endsAt?: string; matchers?: Array<{ name?: string; value?: string }> };
type GrafanaSearch = { uid?: string; title?: string; url?: string; tags?: string[]; folderTitle?: string };
type GrafanaDash = { dashboard?: { uid?: string; title?: string; panels?: Array<{ title?: string }>; rows?: Array<{ title?: string; panels?: unknown[] }> }; meta?: { updated?: string; version?: number } };

// ---------------------------------------------------------------------------
// 1. clawd monitoring status
// ---------------------------------------------------------------------------

export type MonitoringStatusOptions = {
  json?: boolean;
  prometheusUrl?: string;
  grafanaUrl?: string;
  alertmanagerUrl?: string;
};

export async function runMonitoringStatus(opts: MonitoringStatusOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const prometheusUrl = (opts.prometheusUrl ?? "http://localhost:9090").replace(/\/+$/, "");
  const grafanaUrl = (opts.grafanaUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const alertmanagerUrl = (opts.alertmanagerUrl ?? "http://localhost:9093").replace(/\/+$/, "");

  // Check all services in parallel
  const [promConfig, promTargets, grafanaHealth, alertStatus] = await Promise.all([
    fetchStatus(`${prometheusUrl}/api/v1/status/config`),
    fetchJSON<PromTargetsResp>(`${prometheusUrl}/api/v1/targets`),
    fetchStatus(`${grafanaUrl}/api/health`),
    fetchStatus(`${alertmanagerUrl}/api/v2/status`),
  ]);

  // Parse target data
  const activeTargets = promTargets?.data?.activeTargets ?? [];
  const upTargets = activeTargets.filter((t) => t.health === "up");
  const downTargets = activeTargets.filter((t) => t.health === "down");

  const result = {
    prometheus: { reachable: promConfig.ok, latencyMs: promConfig.latencyMs, error: promConfig.error,
      targets: { total: activeTargets.length, up: upTargets.length, down: downTargets.length,
        downTargets: downTargets.map((t) => ({ job: t.labels?.job ?? "-", instance: t.labels?.instance ?? "-", lastError: t.lastError ?? "-" })) } },
    grafana: { reachable: grafanaHealth.ok, latencyMs: grafanaHealth.latencyMs, error: grafanaHealth.error },
    alertmanager: { reachable: alertStatus.ok, latencyMs: alertStatus.latencyMs, error: alertStatus.error },
  };

  if (opts.json) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); return; }

  console.log(bold("\nClawChain Monitoring Infrastructure Status"));
  console.log("\u2500".repeat(50) + "\n");

  const svcLine = (name: string, url: string, s: typeof promConfig) =>
    `  ${name} (${url})\n    Status:    ${statusTag(s.ok)} ${s.ok ? `(${s.latencyMs}ms)` : s.error ?? "unreachable"}`;
  console.log(svcLine("Prometheus", prometheusUrl, promConfig));
  if (promConfig.ok) {
    console.log(`    Targets:   ${activeTargets.length} total, ${green(String(upTargets.length))} up, ${downTargets.length > 0 ? red(String(downTargets.length)) : "0"} down`);
    for (const t of downTargets) console.log(`      - ${t.labels?.job ?? "?"}/${t.labels?.instance ?? "?"}: ${t.lastError ?? "unknown error"}`);
  }
  console.log();
  console.log(svcLine("Grafana", grafanaUrl, grafanaHealth) + "\n");
  console.log(svcLine("AlertManager", alertmanagerUrl, alertStatus) + "\n");

  const allOk = promConfig.ok && grafanaHealth.ok && alertStatus.ok;
  if (allOk && downTargets.length === 0) console.log(`  ${green("All monitoring services are healthy.")}`);
  else if (allOk) console.log(`  ${yellow("Services reachable but some targets are down.")}`);
  else {
    const down = [!promConfig.ok && "Prometheus", !grafanaHealth.ok && "Grafana", !alertStatus.ok && "AlertManager"].filter(Boolean);
    console.log(`  ${red("Unreachable services:")} ${down.join(", ")}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 2. clawd monitoring check
// ---------------------------------------------------------------------------

export type MonitoringCheckOptions = {
  configDir?: string;
  json?: boolean;
};

interface CheckResult {
  name: string;
  pass: boolean;
  details: string;
}

export async function runMonitoringCheck(opts: MonitoringCheckOptions): Promise<void> {
  const configDir = opts.configDir ?? defaultConfigDir();
  const checks: CheckResult[] = [];

  /** Try reading a file from a list of candidate paths; return content + path or null. */
  function tryRead(paths: string[]): { content: string; path: string } | null {
    for (const p of paths) {
      try { return { content: readFileSync(p, "utf-8"), path: p }; } catch { /* next */ }
    }
    return null;
  }

  // Check 1: prometheus.yml with ClawChain scrape targets
  const promFile = tryRead([join(configDir, "prometheus.yml")]);
  if (promFile) {
    const hasScrape = promFile.content.includes("scrape_configs");
    const hasTarget = ["clawchain", "clawchaind", "cometbft", "26660"].some((k) => promFile.content.includes(k));
    checks.push({ name: "prometheus.yml", pass: hasScrape && hasTarget,
      details: hasScrape && hasTarget ? "Found scrape config with ClawChain targets"
        : hasScrape ? "scrape_configs found but no ClawChain targets detected" : "No scrape_configs section found" });
  } else {
    checks.push({ name: "prometheus.yml", pass: false, details: `File not found: ${join(configDir, "prometheus.yml")}` });
  }

  // Check 2: Alert rules file with expected alerts
  const alertFile = tryRead([
    join(configDir, "alerting-rules.yml"), join(configDir, "alert_rules.yml"), join(configDir, "alerts.yml"),
    join(configDir, "prometheus", "alert_rules.yml"), join(configDir, "prometheus", "alerting-rules.yml"),
  ]);
  if (alertFile) {
    const missing = EXPECTED_ALERT_RULES.filter((a) => !alertFile.content.includes(a));
    checks.push({ name: "Alert rules", pass: missing.length === 0,
      details: missing.length === 0 ? `All ${EXPECTED_ALERT_RULES.length} expected alerts found in ${alertFile.path}`
        : `Missing alerts: ${missing.join(", ")} (found ${EXPECTED_ALERT_RULES.length - missing.length}/${EXPECTED_ALERT_RULES.length})` });
  } else {
    checks.push({ name: "Alert rules", pass: false, details: "No alert rules file found in config directory" });
  }

  // Check 3: Grafana dashboard JSON with expected panels
  const dashFile = tryRead([
    join(configDir, "grafana-dashboard.json"), join(configDir, "grafana", "dashboards", "clawchain.json"),
    join(configDir, "grafana-dashboards", "clawchain.json"),
  ]);
  if (dashFile) {
    try {
      const d = JSON.parse(dashFile.content) as { panels?: Array<{ title?: string }>; rows?: Array<{ title?: string; panels?: unknown[] }> };
      const titles = [...(d.panels ?? []), ...(d.rows ?? [])].map((p) => (p.title ?? "").toLowerCase()).join(" ");
      const missing = EXPECTED_DASHBOARD_ROWS.filter((s) => !titles.includes(s));
      const panelCount = (d.panels?.length ?? 0) + (d.rows?.reduce((n, r) => n + (r.panels as unknown[] ?? []).length, 0) ?? 0);
      checks.push({ name: "Grafana dashboard", pass: missing.length === 0,
        details: missing.length === 0 ? `Valid JSON, ${panelCount} panels/rows, all ${EXPECTED_DASHBOARD_ROWS.length} expected sections present`
          : `Missing sections: ${missing.join(", ")} (found ${EXPECTED_DASHBOARD_ROWS.length - missing.length}/${EXPECTED_DASHBOARD_ROWS.length})` });
    } catch {
      checks.push({ name: "Grafana dashboard", pass: false, details: `Invalid JSON in ${dashFile.path}` });
    }
  } else {
    checks.push({ name: "Grafana dashboard", pass: false, details: "No Grafana dashboard JSON found in config directory" });
  }

  // Check 4: docker-compose monitoring section
  const composeFile = tryRead([
    join(configDir, "docker-compose.yml"), join(configDir, "docker-compose.yaml"),
    join(configDir, "..", "docker-compose.yml"), join(configDir, "..", "docker-compose.yaml"),
    join(configDir, "docker-compose.monitoring.yml"),
  ]);
  if (composeFile) {
    const required = ["prometheus", "grafana", "alertmanager"];
    const missing = required.filter((s) => !composeFile.content.includes(s));
    checks.push({ name: "Docker Compose", pass: missing.length === 0,
      details: missing.length === 0 ? `All monitoring services present in ${composeFile.path}`
        : `Missing services: ${missing.join(", ")} in ${composeFile.path}` });
  } else {
    checks.push({ name: "Docker Compose", pass: false, details: "No docker-compose file found" });
  }

  // --- Output ---
  const totalPass = checks.filter((c) => c.pass).length;
  const totalFail = checks.length - totalPass;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ configDir, checks, summary: { total: checks.length, pass: totalPass, fail: totalFail } }, null, 2) + "\n",
    );
    return;
  }

  console.log(bold("\nClawChain Monitoring Configuration Validation"));
  console.log("\u2500".repeat(50));
  console.log(dim(`  Config directory: ${configDir}`));
  console.log();

  for (const check of checks) {
    console.log(`  ${statusTag(check.pass)} ${check.name}`);
    console.log(`       ${dim(check.details)}`);
    console.log();
  }

  console.log("\u2500".repeat(50));
  if (totalFail === 0) {
    console.log(`  ${green(`All ${totalPass} checks passed.`)}`);
  } else {
    console.log(`  ${green(String(totalPass))} passed, ${red(String(totalFail))} failed out of ${checks.length} checks.`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 3. clawd monitoring metrics
// ---------------------------------------------------------------------------

export type MonitoringMetricsOptions = {
  json?: boolean;
  prometheusUrl?: string;
};

interface MetricResult {
  name: string;
  label: string;
  value: string | null;
  unit: string;
  trend: "up" | "down" | "stable" | "unknown";
}

export async function runMonitoringMetrics(opts: MonitoringMetricsOptions): Promise<void> {
  const prometheusUrl = (opts.prometheusUrl ?? "http://localhost:9090").replace(/\/+$/, "");

  // Query all metrics in parallel
  const queryPromises = CLAWCHAIN_METRICS.map(async (m) => {
    const url = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(m.name)}`;
    const data = await fetchJSON<PromQueryResp>(url);

    // Also query 5 minutes ago for trend
    const rangeUrl = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(m.name)}&time=${Math.floor(Date.now() / 1000) - 300}`;
    const prevData = await fetchJSON<PromQueryResp>(rangeUrl);

    const currentValue = data?.data?.result?.[0]?.value?.[1] ?? null;
    const prevValue = prevData?.data?.result?.[0]?.value?.[1] ?? null;

    let trend: "up" | "down" | "stable" | "unknown" = "unknown";
    if (currentValue !== null && prevValue !== null) {
      const curr = parseFloat(currentValue);
      const prev = parseFloat(prevValue);
      if (!isNaN(curr) && !isNaN(prev)) {
        const diff = curr - prev;
        const threshold = Math.abs(prev) * 0.01; // 1% change threshold
        if (diff > threshold) trend = "up";
        else if (diff < -threshold) trend = "down";
        else trend = "stable";
      }
    }

    return {
      name: m.name,
      label: m.label,
      value: currentValue,
      unit: m.unit,
      trend,
    } as MetricResult;
  });

  const metrics = await Promise.all(queryPromises);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ prometheusUrl, metrics }, null, 2) + "\n");
    return;
  }

  console.log(bold("\nClawChain Metrics Dashboard"));
  console.log("\u2500".repeat(50));
  console.log(dim(`  Source: ${prometheusUrl}`));
  console.log(dim(`  Time:   ${new Date().toISOString()}`));
  console.log();

  const available = metrics.filter((m) => m.value !== null);
  const unavailable = metrics.filter((m) => m.value === null);

  if (available.length === 0) {
    console.log(`  ${red("No metrics available.")} Is Prometheus reachable at ${prometheusUrl}?`);
    console.log();
    return;
  }

  // Render metrics table
  const headers = ["Metric", "Value", "Trend"];
  const rows = available.map((m) => {
    let displayValue = m.value!;
    if (m.unit === "bytes") {
      const numVal = parseFloat(displayValue);
      if (!isNaN(numVal)) displayValue = formatBytes(numVal);
    } else if (m.unit === "%") {
      const numVal = parseFloat(displayValue);
      if (!isNaN(numVal)) displayValue = `${numVal.toFixed(1)}%`;
    } else {
      // Format large numbers with commas
      const numVal = parseFloat(displayValue);
      if (!isNaN(numVal) && numVal === Math.floor(numVal)) {
        displayValue = numVal.toLocaleString();
      } else if (!isNaN(numVal)) {
        displayValue = numVal.toFixed(2);
      }
    }

    const trendMap = { up: green("^ up"), down: red("v down"), stable: dim("- stable"), unknown: dim("? n/a") };
    return [m.label, displayValue, trendMap[m.trend]];
  });

  console.log(table(headers, rows));
  console.log();

  if (unavailable.length > 0) {
    console.log(dim(`  Unavailable metrics (${unavailable.length}):`));
    for (const m of unavailable) {
      console.log(dim(`    - ${m.label} (${m.name})`));
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// 4. clawd monitoring alerts
// ---------------------------------------------------------------------------

export type MonitoringAlertsOptions = {
  json?: boolean;
  alertmanagerUrl?: string;
};

export async function runMonitoringAlerts(opts: MonitoringAlertsOptions): Promise<void> {
  const alertmanagerUrl = (opts.alertmanagerUrl ?? "http://localhost:9093").replace(/\/+$/, "");

  // Fetch alerts, groups, and silences in parallel
  const [alertsData, groupsData, silencesData] = await Promise.all([
    fetchJSON<AMAlert[]>(`${alertmanagerUrl}/api/v2/alerts`),
    fetchJSON<AMGroup[]>(`${alertmanagerUrl}/api/v2/alerts/groups`),
    fetchJSON<AMSilence[]>(`${alertmanagerUrl}/api/v2/silences`),
  ]);

  const alerts = alertsData ?? [];
  const groups = groupsData ?? [];
  const silences = (silencesData ?? []).filter((s) => s.status?.state === "active");

  const firing = alerts.filter((a) => a.status?.state === "active").length;
  const suppressed = alerts.filter((a) => (a.status?.silencedBy?.length ?? 0) > 0 || (a.status?.inhibitedBy?.length ?? 0) > 0).length;
  const result = {
    alertmanagerUrl,
    alerts: alerts.map((a) => ({ alertname: a.labels?.alertname ?? "-", severity: a.labels?.severity ?? "-",
      state: a.status?.state ?? "-", description: a.annotations?.description ?? a.annotations?.summary ?? "-",
      startsAt: a.startsAt ?? "-", silenced: (a.status?.silencedBy?.length ?? 0) > 0 })),
    groups: groups.map((g) => ({ labels: g.labels ?? {}, receiver: g.receiver?.name ?? "-", alertCount: g.alerts?.length ?? 0 })),
    silences: silences.map((s) => ({ id: s.id ?? "-", comment: s.comment ?? "-", createdBy: s.createdBy ?? "-", endsAt: s.endsAt ?? "-" })),
    summary: { totalAlerts: alerts.length, firingAlerts: firing, suppressedAlerts: suppressed, activeSilences: silences.length },
  };

  if (opts.json) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); return; }

  console.log(bold("\nClawChain Active Alerts"));
  console.log("\u2500".repeat(50));
  console.log(dim(`  Source: ${alertmanagerUrl}\n`));

  if (alertsData === null) { console.log(`  ${red("[FAIL]")} AlertManager not reachable at ${alertmanagerUrl}\n`); return; }

  if (alerts.length === 0) {
    console.log(`  ${green("No active alerts.")} All systems nominal.\n`);
  } else {
    console.log(`  Total: ${alerts.length}  Firing: ${firing > 0 ? red(String(firing)) : green("0")}  Suppressed: ${suppressed}\n`);

    const headers = ["Alert", "Severity", "State", "Description", "Duration"];
    const sevColor = (s: string) => s === "critical" ? red(s) : s === "warning" ? yellow(s) : s;
    const stateColor = (s: string) => s === "active" ? red("firing") : s === "suppressed" ? yellow("suppressed") : s;
    const rows = alerts.map((a) => {
      const desc = a.annotations?.description ?? a.annotations?.summary ?? "-";
      return [a.labels?.alertname ?? "-", sevColor(a.labels?.severity ?? "-"), stateColor(a.status?.state ?? "-"),
        desc.length > 40 ? desc.slice(0, 37) + "..." : desc, a.startsAt ? durationSince(a.startsAt) : "-"];
    });

    console.log(table(headers, rows));
    console.log();
  }

  // Alert groups
  if (groups.length > 0) {
    console.log(bold("  Alert Groups:"));
    for (const g of groups) {
      const labelStr = Object.entries(g.labels ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      const alertCount = g.alerts?.length ?? 0;
      console.log(`    ${g.receiver?.name ?? "-"} [${labelStr || "no labels"}] (${alertCount} alerts)`);
    }
    console.log();
  }

  // Active silences
  if (silences.length > 0) {
    console.log(bold("  Active Silences:"));
    const silenceHeaders = ["ID", "Created By", "Comment", "Expires"];
    const silenceRows = silences.map((s) => [
      (s.id ?? "-").slice(0, 12),
      s.createdBy ?? "-",
      (s.comment ?? "-").length > 30 ? (s.comment ?? "-").slice(0, 27) + "..." : (s.comment ?? "-"),
      s.endsAt ? durationSince(s.endsAt) : "-",
    ]);
    console.log(table(silenceHeaders, silenceRows));
    console.log();
  } else {
    console.log(dim("  No active silences."));
    console.log();
  }
}

// ---------------------------------------------------------------------------
// 5. clawd monitoring dashboards
// ---------------------------------------------------------------------------

export type MonitoringDashboardsOptions = {
  json?: boolean;
  grafanaUrl?: string;
  apiKey?: string;
};

export async function runMonitoringDashboards(opts: MonitoringDashboardsOptions): Promise<void> {
  const grafanaUrl = (opts.grafanaUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const authHeaders: Record<string, string> = {};
  if (opts.apiKey) {
    authHeaders["Authorization"] = `Bearer ${opts.apiKey}`;
  }

  // Search for all dashboards
  let searchResults: GrafanaSearch[] | null = null;
  try {
    const res = await fetch(`${grafanaUrl}/api/search?type=dash-db`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
      headers: authHeaders,
    });
    if (res.ok) {
      searchResults = (await res.json()) as GrafanaSearch[];
    }
  } catch {
    searchResults = null;
  }

  if (searchResults === null) {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ grafanaUrl, error: "Grafana not reachable", dashboards: [] }, null, 2) + "\n",
      );
    } else {
      console.log(bold("\nClawChain Grafana Dashboards"));
      console.log("\u2500".repeat(50));
      console.log(`  ${red("[FAIL]")} Grafana not reachable at ${grafanaUrl}`);
      console.log();
    }
    return;
  }

  // Fetch details for each dashboard (limit to first 20 to avoid overwhelming Grafana)
  const dashboardPromises = searchResults.slice(0, 20).map(async (sr) => {
    if (!sr.uid) return null;
    try {
      const res = await fetch(`${grafanaUrl}/api/dashboards/uid/${sr.uid}`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT),
        headers: authHeaders,
      });
      if (!res.ok) return null;
      return (await res.json()) as GrafanaDash;
    } catch {
      return null;
    }
  });

  const dashboardDetails = await Promise.all(dashboardPromises);

  const clawDb = dashboardDetails.find((d) => {
    const t = (d?.dashboard?.title ?? "").toLowerCase();
    return t.includes("clawchain") || t.includes("claw");
  });
  const clawPanels = clawDb?.dashboard?.panels?.map((p) => p.title ?? "untitled") ?? [];
  const clawRows = clawDb?.dashboard?.rows?.map((r) => r.title ?? "untitled") ?? [];

  const inventory = searchResults.map((sr) => {
    const det = dashboardDetails.find((d) => d?.dashboard?.uid === sr.uid);
    return { uid: sr.uid ?? "-", title: sr.title ?? "-", folder: sr.folderTitle ?? "(General)",
      panels: (det?.dashboard?.panels?.length ?? 0) + (det?.dashboard?.rows?.length ?? 0), updated: det?.meta?.updated ?? "-" };
  });

  const allTitles = [...clawPanels, ...clawRows].map((t) => t.toLowerCase()).join(" ");
  const sectionCheck = EXPECTED_DASHBOARD_ROWS.map((s) => ({ section: s, found: allTitles.includes(s) }));

  const result = { grafanaUrl, totalDashboards: searchResults.length, dashboards: inventory,
    clawchainDashboard: clawDb ? { title: clawDb.dashboard?.title ?? "-", uid: clawDb.dashboard?.uid ?? "-",
      panelCount: clawPanels.length, panels: clawPanels, rows: clawRows, sectionValidation: sectionCheck } : null };

  if (opts.json) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); return; }

  console.log(bold("\nClawChain Grafana Dashboards"));
  console.log("\u2500".repeat(50));
  console.log(dim(`  Source: ${grafanaUrl}\n`));

  if (inventory.length === 0) { console.log("  No dashboards found.\n"); return; }

  console.log(`  ${bold("Dashboard Inventory")} (${inventory.length} total)\n`);
  console.log(table(["Title", "UID", "Folder", "Panels", "Updated"],
    inventory.map((d) => [d.title.length > 35 ? d.title.slice(0, 32) + "..." : d.title,
      d.uid.slice(0, 12), d.folder, String(d.panels), d.updated !== "-" ? durationSince(d.updated) + " ago" : "-"])));
  console.log();

  if (clawDb) {
    console.log(bold("  ClawChain Dashboard Validation:"));
    console.log(`    Title: ${clawDb.dashboard?.title ?? "-"}  Panels: ${clawPanels.length}  Rows: ${clawRows.length}\n`);
    for (const sv of sectionCheck) console.log(`      ${statusTag(sv.found)} ${sv.section}`);
    const missing = sectionCheck.filter((sv) => !sv.found).map((sv) => sv.section);
    console.log(missing.length === 0 ? `\n    ${green("All expected sections present.")}` : `\n    ${yellow(`Missing sections: ${missing.join(", ")}`)}`);
  } else {
    console.log(`  ${warnTag()} No ClawChain dashboard found.`);
    console.log(dim("    Expected a dashboard with 'ClawChain' or 'claw' in the title."));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 6. clawd monitoring export
// ---------------------------------------------------------------------------

export type MonitoringExportOptions = {
  output?: string;
  format?: string;
  json?: boolean;
};

export async function runMonitoringExport(opts: MonitoringExportOptions): Promise<void> {
  const outputDir = opts.output ?? join(process.cwd(), "monitoring-export");
  const format = opts.format ?? "docker";
  const k8s = format === "k8s";
  const svc = (name: string, port: string) => k8s ? `${name}-service:${port}` : `${name}:${port}`;

  // --- Generate prometheus.yml ---
  const scrapeJobs = [
    { job: "clawchaind", target: svc("clawchaind", "26660"), interval: "10s" },
    { job: "cometbft", target: svc("clawchaind", "26660") },
    { job: "clawchain-rest", target: svc("clawchaind", "1317"), interval: "30s" },
    { job: "gpu-provider", target: svc("gpu-provider", "9100"), interval: "15s" },
    { job: "inference-sidecar", target: svc("inference-sidecar", "9101") },
    { job: "faucet", target: svc("faucet", "8080"), interval: "30s" },
    { job: "eventsd", target: svc("eventsd", "9102") },
    { job: "txhistoryd", target: svc("txhistoryd", "9103"), interval: "30s" },
    { job: "prometheus", target: "localhost:9090" },
  ];
  const scrapeBlock = scrapeJobs.map((j) => {
    let block = `  - job_name: "${j.job}"\n    static_configs:\n      - targets: ["${j.target}"]\n    metrics_path: /metrics`;
    if (j.interval) block += `\n    scrape_interval: ${j.interval}`;
    return block;
  }).join("\n\n");

  const prometheusYml = `# ClawChain Prometheus Configuration — generated by clawd monitoring export
global:\n  scrape_interval: 15s\n  evaluation_interval: 15s\n  scrape_timeout: 10s
rule_files:\n  - "alert_rules.yml"
alerting:\n  alertmanagers:\n    - static_configs:\n        - targets: ["alertmanager:9093"]
scrape_configs:\n${scrapeBlock}\n`;

  // --- Generate alert_rules.yml ---
  type AlertDef = { name: string; expr: string; dur: string; sev: string; summary: string; desc: string };
  const alerts: AlertDef[] = [
    { name: "NodeDown", expr: 'up{job="clawchaind"} == 0', dur: "1m", sev: "critical", summary: "ClawChain node is down", desc: "clawchaind unreachable for >1m." },
    { name: "HighBlockTime", expr: "rate(cometbft_consensus_height[5m]) < 0.05", dur: "5m", sev: "warning", summary: "Block production is slow", desc: "Block height increasing <3/min for 5m." },
    { name: "ConsensusStalled", expr: "increase(cometbft_consensus_height[10m]) == 0", dur: "10m", sev: "critical", summary: "Consensus has stalled", desc: "No new blocks in 10 minutes." },
    { name: "LowPeerCount", expr: "cometbft_p2p_peers < 2", dur: "5m", sev: "warning", summary: "Low peer count", desc: "Node has <2 peers for 5 minutes." },
    { name: "ValidatorJailed", expr: "increase(cometbft_consensus_validator_missed_blocks[1h]) > 100", dur: "5m", sev: "critical", summary: "Validator may be jailed", desc: "Validator missed >100 blocks in 1h." },
    { name: "MempoolBacklog", expr: "cometbft_mempool_size > 500", dur: "5m", sev: "warning", summary: "Mempool backlog", desc: "Mempool >500 pending transactions." },
    { name: "HighMemoryUsage", expr: 'process_resident_memory_bytes{job="clawchaind"} > 4294967296', dur: "10m", sev: "warning", summary: "High memory on clawchaind", desc: "clawchaind using >4GB memory." },
    { name: "GPUProviderOffline", expr: 'up{job="gpu-provider"} == 0', dur: "2m", sev: "warning", summary: "GPU provider offline", desc: "GPU provider unreachable for >2m." },
    { name: "AgentRegistrationDrop", expr: "delta(clawchain_agent_count[1h]) < -5", dur: "5m", sev: "warning", summary: "Drop in registered agents", desc: ">5 agents deregistered in 1h." },
    { name: "PrivacyPoolAnomaly", expr: "rate(clawchain_privacy_shield_total[5m]) > 10", dur: "5m", sev: "warning", summary: "Unusual privacy pool activity", desc: "Shield rate >10/5min." },
  ];
  const renderAlert = (a: AlertDef) =>
    `      - alert: ${a.name}\n        expr: ${a.expr}\n        for: ${a.dur}\n        labels:\n          severity: ${a.sev}\n        annotations:\n          summary: "${a.summary}"\n          description: "${a.desc}"`;
  const chainAlerts = alerts.slice(0, 7).map(renderAlert).join("\n\n");
  const svcAlerts = alerts.slice(7).map(renderAlert).join("\n\n");
  const alertRulesYml = `# ClawChain Alert Rules — generated by clawd monitoring export
groups:
  - name: clawchain_chain
    interval: 30s
    rules:
${chainAlerts}

  - name: clawchain_services
    interval: 30s
    rules:
${svcAlerts}
`;

  // --- Generate grafana-datasource.yml ---
  const grafanaDatasourceYml = `# ClawChain Grafana Datasource — generated by clawd monitoring export
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    orgId: 1
    url: http://${svc("prometheus", "9090")}
    isDefault: true
    editable: true
    jsonData: { timeInterval: "15s", httpMethod: POST }
  - name: AlertManager
    type: alertmanager
    access: proxy
    orgId: 1
    url: http://${svc("alertmanager", "9093")}
    editable: true
    jsonData: { implementation: prometheus }
`;

  // --- Generate deployment config ---
  let deploymentConfig: string;
  let deploymentFilename: string;

  if (format === "k8s") {
    deploymentFilename = "monitoring-k8s.yml";
    const ns = "clawchain-monitoring";
    const k8sDeploy = (name: string, image: string, port: number, args: string[], vols: string) =>
      `---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\n  namespace: ${ns}\nspec:\n  replicas: 1\n  selector:\n    matchLabels: { app: ${name} }\n  template:\n    metadata:\n      labels: { app: ${name} }\n    spec:\n      containers:\n        - name: ${name}\n          image: ${image}\n          args: [${args.map((a) => `"${a}"`).join(", ")}]\n          ports: [{ containerPort: ${port} }]\n${vols}\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: ${name}-service\n  namespace: ${ns}\nspec:\n  selector: { app: ${name} }\n  ports: [{ port: ${port}, targetPort: ${port} }]`;
    deploymentConfig = [
      `# ClawChain Monitoring - K8s Manifests (generated)\n---\napiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${ns}`,
      k8sDeploy("prometheus", "prom/prometheus:v2.51.0", 9090,
        ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus", "--storage.tsdb.retention.time=30d"],
        "          volumeMounts:\n            - { name: config, mountPath: /etc/prometheus }\n            - { name: data, mountPath: /prometheus }\n      volumes:\n        - { name: config, configMap: { name: prometheus-config } }\n        - { name: data, persistentVolumeClaim: { claimName: prometheus-data } }"),
      k8sDeploy("grafana", "grafana/grafana:10.4.0", 3000, [],
        "          volumeMounts:\n            - { name: ds, mountPath: /etc/grafana/provisioning/datasources }\n            - { name: data, mountPath: /var/lib/grafana }\n      volumes:\n        - { name: ds, configMap: { name: grafana-datasources } }\n        - { name: data, persistentVolumeClaim: { claimName: grafana-data } }"),
      k8sDeploy("alertmanager", "prom/alertmanager:v0.27.0", 9093,
        ["--config.file=/etc/alertmanager/alertmanager.yml"],
        "          volumeMounts:\n            - { name: config, mountPath: /etc/alertmanager }\n      volumes:\n        - { name: config, configMap: { name: alertmanager-config } }"),
    ].join("\n");
  } else if (format === "standalone") {
    deploymentFilename = "monitoring-standalone.sh";
    deploymentConfig = `#!/usr/bin/env bash
# ClawChain Monitoring - Standalone Setup (generated)
set -euo pipefail
SD="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
BASE=/opt/clawchain/monitoring
mkdir -p \${BASE}/{prometheus,grafana,alertmanager} \${BASE}/data/{prometheus,grafana}
cp "\${SD}/prometheus.yml" "\${SD}/alert_rules.yml" \${BASE}/prometheus/
cp "\${SD}/grafana-datasource.yml" \${BASE}/grafana/datasource.yml
prometheus --config.file=\${BASE}/prometheus/prometheus.yml --storage.tsdb.path=\${BASE}/data/prometheus --storage.tsdb.retention.time=30d --web.listen-address=:9090 &
grafana-server --homepath=/usr/share/grafana &
alertmanager --config.file=\${BASE}/alertmanager/alertmanager.yml --storage.path=\${BASE}/data/alertmanager &
echo "Prometheus :9090 | Grafana :3000 | AlertManager :9093"; wait
`;
  } else {
    deploymentFilename = "docker-compose.monitoring.yml";
    const composeSvc = (name: string, image: string, port: number, extras: string) =>
      `  ${name}:\n    image: ${image}\n    container_name: clawchain-${name}\n    restart: unless-stopped\n${extras}    ports: ["${port}:${port}"]\n    networks: [clawchain-monitoring]\n    healthcheck:\n      test: ["CMD", "wget", "-q", "--spider", "http://localhost:${port}/-/healthy"]\n      interval: 15s\n      timeout: 5s\n      retries: 3`;
    deploymentConfig = `# ClawChain Monitoring - Docker Compose (generated)
version: "3.8"
services:
${composeSvc("prometheus", "prom/prometheus:v2.51.0", 9090,
  '    command: ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus", "--storage.tsdb.retention.time=30d", "--web.enable-lifecycle"]\n    volumes:\n      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro\n      - ./alert_rules.yml:/etc/prometheus/alert_rules.yml:ro\n      - prometheus-data:/prometheus\n')}

${composeSvc("grafana", "grafana/grafana:10.4.0", 3000,
  '    environment: [GF_SECURITY_ADMIN_USER=admin, GF_SECURITY_ADMIN_PASSWORD=clawchain, GF_USERS_ALLOW_SIGN_UP=false]\n    volumes:\n      - ./grafana-datasource.yml:/etc/grafana/provisioning/datasources/datasource.yml:ro\n      - grafana-data:/var/lib/grafana\n    depends_on:\n      prometheus: { condition: service_healthy }\n')}

${composeSvc("alertmanager", "prom/alertmanager:v0.27.0", 9093,
  '    command: ["--config.file=/etc/alertmanager/alertmanager.yml", "--storage.path=/alertmanager"]\n    volumes:\n      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro\n      - alertmanager-data:/alertmanager\n')}

volumes:
  prometheus-data: { driver: local }
  grafana-data: { driver: local }
  alertmanager-data: { driver: local }
networks:
  clawchain-monitoring: { driver: bridge }
`;
  }

  // --- Write files ---
  const files = [
    { name: "prometheus.yml", content: prometheusYml },
    { name: "alert_rules.yml", content: alertRulesYml },
    { name: "grafana-datasource.yml", content: grafanaDatasourceYml },
    { name: deploymentFilename, content: deploymentConfig },
  ];

  if (opts.json) {
    const result = {
      outputDir,
      format,
      files: files.map((f) => ({
        name: f.name,
        path: join(outputDir, f.name),
        size: Buffer.byteLength(f.content, "utf-8"),
      })),
    };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  mkdirSync(outputDir, { recursive: true });

  for (const file of files) {
    const filePath = join(outputDir, file.name);
    writeFileSync(filePath, file.content, "utf-8");
  }

  console.log(bold("\nClawChain Monitoring Export"));
  console.log("\u2500".repeat(50));
  console.log(`  Format:    ${format}`);
  console.log(`  Output:    ${outputDir}`);
  console.log();

  const fileHeaders = ["File", "Size"];
  const fileRows = files.map((f) => [
    f.name,
    formatBytes(Buffer.byteLength(f.content, "utf-8")),
  ]);
  console.log(table(fileHeaders, fileRows));
  console.log();

  console.log(green("  Export complete."));
  console.log();

  // Usage instructions
  switch (format) {
    case "docker":
      console.log(dim("  Usage:"));
      console.log(dim(`    cd ${outputDir}`));
      console.log(dim("    docker compose -f docker-compose.monitoring.yml up -d"));
      break;
    case "k8s":
      console.log(dim("  Usage:"));
      console.log(dim(`    kubectl apply -f ${join(outputDir, deploymentFilename)}`));
      console.log(dim(`    kubectl create configmap prometheus-config --from-file=${join(outputDir, "prometheus.yml")} -n clawchain-monitoring`));
      console.log(dim(`    kubectl create configmap grafana-datasources --from-file=${join(outputDir, "grafana-datasource.yml")} -n clawchain-monitoring`));
      break;
    case "standalone":
      console.log(dim("  Usage:"));
      console.log(dim(`    chmod +x ${join(outputDir, deploymentFilename)}`));
      console.log(dim(`    ${join(outputDir, deploymentFilename)}`));
      break;
  }
  console.log();
}
