import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getComputeResources,
  getComputeJobs,
  formatClaw,
  shortAddr,
  type ComputeResource,
  type ComputeJob,
} from "../lib/chain.ts";

type Tab = "providers" | "models" | "performance";
type SortField =
  | "address" | "gpu" | "vram" | "status" | "rate" | "jobs" | "uptime"
  | "modelName" | "totalProviders" | "avgPrice" | "totalVram" | "utilization"
  | "avgResponse" | "throughput" | "errorRate" | "earningsPerDay";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "online" | "offline" | "leased";

// Derived types from chain data
interface GPUProvider {
  address: string;
  gpuModel: string;
  vramGB: number;
  status: "online" | "offline" | "leased";
  hourlyRate: string;
  jobsCompleted: number;
  totalRevenue: string;
}

interface GPUModelSummary {
  modelName: string;
  totalProviders: number;
  avgPrice: string;
  totalVramGB: number;
  utilization: number;
}

interface ProviderPerformance {
  address: string;
  gpuModel: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  earningsTotal: string;
}

function statusColor(status: GPUProvider["status"]): string {
  if (status === "online") return "var(--green)";
  if (status === "leased") return "var(--accent)";
  return "var(--red)";
}

function statusBadgeClass(status: GPUProvider["status"]): string {
  if (status === "online") return "badge-success";
  if (status === "leased") return "badge-info";
  return "badge-error";
}

// Derive providers from resources (group by owner)
function deriveProviders(resources: ComputeResource[]): GPUProvider[] {
  const byOwner = new Map<string, ComputeResource[]>();
  for (const r of resources) {
    const list = byOwner.get(r.owner) ?? [];
    list.push(r);
    byOwner.set(r.owner, list);
  }

  const providers: GPUProvider[] = [];
  for (const [address, owned] of byOwner) {
    const primaryGpu = owned.reduce((best, r) => r.vramGb > best.vramGb ? r : best, owned[0]);
    const hasLeased = owned.some((r) => !!r.currentLessee);
    const isActive = owned.some((r) => r.active);
    providers.push({
      address,
      gpuModel: primaryGpu.gpuModel || "Unknown",
      vramGB: owned.reduce((s, r) => s + r.vramGb, 0),
      status: !isActive ? "offline" : hasLeased ? "leased" : "online",
      hourlyRate: primaryGpu.pricePerHourUclaw,
      jobsCompleted: owned.reduce((s, r) => s + r.totalLeases, 0),
      totalRevenue: owned.reduce((s, r) => s + BigInt(r.totalRevenue || "0"), 0n).toString(),
    });
  }
  return providers;
}

// Derive GPU model summaries from resources
function deriveModelSummaries(resources: ComputeResource[]): GPUModelSummary[] {
  const byModel = new Map<string, ComputeResource[]>();
  for (const r of resources) {
    const model = r.gpuModel || "Unknown";
    const list = byModel.get(model) ?? [];
    list.push(r);
    byModel.set(model, list);
  }

  const summaries: GPUModelSummary[] = [];
  for (const [modelName, group] of byModel) {
    const owners = new Set(group.map((r) => r.owner));
    const totalPrice = group.reduce((s, r) => s + BigInt(r.pricePerHourUclaw || "0"), 0n);
    const avgPrice = group.length > 0 ? (totalPrice / BigInt(group.length)).toString() : "0";
    const totalVram = group.reduce((s, r) => s + r.vramGb, 0);
    const leased = group.filter((r) => !!r.currentLessee).length;
    summaries.push({
      modelName,
      totalProviders: owners.size,
      avgPrice,
      totalVramGB: totalVram,
      utilization: group.length > 0 ? (leased / group.length) * 100 : 0,
    });
  }
  return summaries;
}

// Derive performance from resources + jobs
function derivePerformance(resources: ComputeResource[], jobs: ComputeJob[]): ProviderPerformance[] {
  const byProvider = new Map<string, { resources: ComputeResource[]; jobs: ComputeJob[] }>();

  for (const r of resources) {
    const entry = byProvider.get(r.owner) ?? { resources: [], jobs: [] };
    entry.resources.push(r);
    byProvider.set(r.owner, entry);
  }

  for (const j of jobs) {
    const provider = j.provider || "";
    if (!provider) continue;
    const entry = byProvider.get(provider) ?? { resources: [], jobs: [] };
    entry.jobs.push(j);
    byProvider.set(provider, entry);
  }

  const perf: ProviderPerformance[] = [];
  for (const [address, data] of byProvider) {
    const primaryGpu = data.resources.length > 0
      ? data.resources.reduce((best, r) => r.vramGb > best.vramGb ? r : best, data.resources[0]).gpuModel
      : "Unknown";
    const completed = data.jobs.filter((j) => j.status === "completed").length;
    const failed = data.jobs.filter((j) => j.status === "failed").length;
    perf.push({
      address,
      gpuModel: primaryGpu || "Unknown",
      totalJobs: data.jobs.length,
      completedJobs: completed,
      failedJobs: failed,
      earningsTotal: data.resources.reduce((s, r) => s + BigInt(r.totalRevenue || "0"), 0n).toString(),
    });
  }
  return perf;
}

function utilizationColor(pct: number): string {
  if (pct >= 80) return "var(--green)";
  if (pct >= 50) return "var(--yellow)";
  return "var(--red)";
}

function errorRateColor(rate: number): string {
  if (rate <= 0.05) return "var(--green)";
  if (rate <= 0.10) return "var(--yellow)";
  return "var(--red)";
}

export default function GPUProviders() {
  useDocTitle("GPU Providers");
  const [tab, setTab] = useState<Tab>("providers");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [gpuModelFilter, setGpuModelFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortField, setSortField] = useState<SortField>("jobs");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resources, setResources] = useState<ComputeResource[]>([]);
  const [allJobs, setAllJobs] = useState<ComputeJob[]>([]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "providers", label: "Active Providers" },
    { key: "models", label: "GPU Models" },
    { key: "performance", label: "Performance" },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [res, jobs] = await Promise.all([
          getComputeResources(),
          getComputeJobs(),
        ]);
        if (!cancelled) {
          setResources(res);
          setAllJobs(jobs);
        }
      } catch {
        if (!cancelled) setError("Failed to load GPU provider data. Is the chain running?");
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const providers = useMemo(() => deriveProviders(resources), [resources]);
  const gpuModels = useMemo(() => deriveModelSummaries(resources), [resources]);
  const performance = useMemo(() => derivePerformance(resources, allJobs), [resources, allJobs]);

  const gpuModelOptions = useMemo(() => {
    const models = new Set(providers.map((p) => p.gpuModel));
    return ["all", ...Array.from(models).sort()];
  }, [providers]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function sortIndicator(field: SortField): string {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  // Filtered + sorted providers
  const filteredProviders = useMemo(() => {
    let result = [...providers];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.address.toLowerCase().includes(q) || p.gpuModel.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (gpuModelFilter !== "all") {
      result = result.filter((p) => p.gpuModel === gpuModelFilter);
    }

    if (minPrice) {
      const min = parseInt(minPrice) * 1_000_000;
      result = result.filter((p) => parseInt(p.hourlyRate) >= min);
    }
    if (maxPrice) {
      const max = parseInt(maxPrice) * 1_000_000;
      result = result.filter((p) => parseInt(p.hourlyRate) <= max);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "address": cmp = a.address.localeCompare(b.address); break;
        case "gpu": cmp = a.gpuModel.localeCompare(b.gpuModel); break;
        case "vram": cmp = a.vramGB - b.vramGB; break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "rate": cmp = parseInt(a.hourlyRate) - parseInt(b.hourlyRate); break;
        case "jobs": cmp = a.jobsCompleted - b.jobsCompleted; break;
        default: cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [providers, search, statusFilter, gpuModelFilter, minPrice, maxPrice, sortField, sortDir]);

  // Filtered + sorted GPU models
  const filteredModels = useMemo(() => {
    let result = [...gpuModels];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((m) => m.modelName.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "modelName": cmp = a.modelName.localeCompare(b.modelName); break;
        case "totalProviders": cmp = a.totalProviders - b.totalProviders; break;
        case "avgPrice": cmp = parseInt(a.avgPrice) - parseInt(b.avgPrice); break;
        case "totalVram": cmp = a.totalVramGB - b.totalVramGB; break;
        case "utilization": cmp = a.utilization - b.utilization; break;
        default: cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [gpuModels, search, sortField, sortDir]);

  // Filtered + sorted performance
  const filteredPerformance = useMemo(() => {
    let result = [...performance];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => p.address.toLowerCase().includes(q) || p.gpuModel.toLowerCase().includes(q)
      );
    }

    if (gpuModelFilter !== "all") {
      result = result.filter((p) => p.gpuModel === gpuModelFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "address": cmp = a.address.localeCompare(b.address); break;
        case "gpu": cmp = a.gpuModel.localeCompare(b.gpuModel); break;
        case "earningsPerDay": cmp = Number(BigInt(a.earningsTotal) - BigInt(b.earningsTotal)); break;
        default: cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [performance, search, gpuModelFilter, sortField, sortDir]);

  // Summary stats
  const onlineCount = providers.filter((p) => p.status === "online").length;
  const offlineCount = providers.filter((p) => p.status === "offline").length;
  const leasedCount = providers.filter((p) => p.status === "leased").length;
  const totalVram = resources.reduce((s, r) => s + r.vramGb, 0);
  const totalLeases = resources.reduce((s, r) => s + r.totalLeases, 0);

  return (
    <div>
      <h1 className="page-title">GPU Providers</h1>
      <p className="page-subtitle" style={{ color: "var(--text2)", marginBottom: "1.5rem" }}>
        Browse GPU compute providers, hardware models, and performance metrics on ClawChain.
      </p>

      {error && (
        <div style={{ marginBottom: "1.5rem", padding: "0.75rem", borderRadius: "0.5rem", background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading GPU provider data...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* Summary cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Total Providers
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{providers.length}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Online / Offline / Leased
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                <span style={{ color: "var(--green)" }}>{onlineCount}</span>
                {" / "}
                <span style={{ color: "var(--red)" }}>{offlineCount}</span>
                {" / "}
                <span style={{ color: "var(--accent)" }}>{leasedCount}</span>
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Total VRAM
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>
                {totalVram} GB
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Total Leases
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {totalLeases.toLocaleString()}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: "0.25rem" }}>
                Resources
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {resources.length}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`btn ${tab === t.key ? "btn-primary" : ""}`}
                onClick={() => { setTab(t.key); setSortField(t.key === "providers" ? "jobs" : t.key === "models" ? "utilization" : "earningsPerDay"); setSortDir("desc"); }}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              marginBottom: "1.5rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by address or GPU model..."
              data-testid="search-input"
              style={{
                flex: 1,
                minWidth: "200px",
                maxWidth: "350px",
                padding: "8px 12px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius, 6px)",
                color: "var(--text)",
                fontSize: "0.875rem",
              }}
            />

            {(tab === "providers" || tab === "performance") && (
              <select
                value={gpuModelFilter}
                onChange={(e) => setGpuModelFilter(e.target.value)}
                data-testid="gpu-model-filter"
                style={{
                  padding: "8px 12px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius, 6px)",
                  color: "var(--text)",
                  fontSize: "0.875rem",
                }}
              >
                {gpuModelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m === "all" ? "All GPU Models" : m}
                  </option>
                ))}
              </select>
            )}

            {tab === "providers" && (
              <>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  data-testid="status-filter"
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius, 6px)",
                    color: "var(--text)",
                    fontSize: "0.875rem",
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="leased">Leased</option>
                </select>

                <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", fontSize: "0.8rem" }}>
                  <span style={{ color: "var(--text2)" }}>Rate:</span>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Min"
                    data-testid="min-price"
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius, 6px)",
                      color: "var(--text)",
                      fontSize: "0.8rem",
                    }}
                  />
                  <span style={{ color: "var(--text2)" }}>-</span>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Max"
                    data-testid="max-price"
                    style={{
                      width: 70,
                      padding: "6px 8px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius, 6px)",
                      color: "var(--text)",
                      fontSize: "0.8rem",
                    }}
                  />
                  <span style={{ color: "var(--text2)" }}>CLAW/hr</span>
                </div>
              </>
            )}
          </div>

          {/* Active Providers */}
          {tab === "providers" && (
            <div className="card" style={{ overflowX: "auto" }} data-testid="providers-tab">
              <h3 style={{ marginBottom: "1rem" }}>
                Active Providers ({filteredProviders.length})
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("address")}>
                      Provider{sortIndicator("address")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("gpu")}>
                      GPU Model{sortIndicator("gpu")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("vram")}>
                      VRAM{sortIndicator("vram")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("status")}>
                      Status{sortIndicator("status")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("rate")}>
                      Rate/hr{sortIndicator("rate")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("jobs")}>
                      Leases{sortIndicator("jobs")}
                    </th>
                    <th style={thStyle}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProviders.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }}>
                        {providers.length === 0
                          ? "No GPU providers registered on chain yet."
                          : "No providers match the current filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredProviders.map((p) => (
                      <tr key={p.address} style={{ borderBottom: "1px solid var(--border)" }} data-testid="provider-row">
                        <td style={tdStyle}>
                          <Link
                            to={`/explorer/account/${p.address}`}
                            className="mono"
                            style={{ color: "var(--accent)", fontSize: "0.85rem" }}
                          >
                            {shortAddr(p.address)}
                          </Link>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600 }}>{p.gpuModel}</span>
                        </td>
                        <td style={tdStyle}>{p.vramGB} GB</td>
                        <td style={tdStyle}>
                          <span className={`badge ${statusBadgeClass(p.status)}`}>
                            {p.status}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span className="mono" style={{ fontWeight: 600 }}>
                            {formatClaw(p.hourlyRate)}
                          </span>
                        </td>
                        <td style={tdStyle}>{p.jobsCompleted.toLocaleString()}</td>
                        <td style={tdStyle}>
                          <span className="mono" style={{ fontWeight: 600, color: "#22c55e" }}>
                            {formatClaw(p.totalRevenue)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* GPU Models */}
          {tab === "models" && (
            <div className="card" style={{ overflowX: "auto" }} data-testid="models-tab">
              <h3 style={{ marginBottom: "1rem" }}>
                GPU Models ({filteredModels.length})
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("modelName")}>
                      Model{sortIndicator("modelName")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("totalProviders")}>
                      Providers{sortIndicator("totalProviders")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("avgPrice")}>
                      Avg Price/hr{sortIndicator("avgPrice")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("totalVram")}>
                      Total VRAM{sortIndicator("totalVram")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("utilization")}>
                      Utilization{sortIndicator("utilization")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }}>
                        {gpuModels.length === 0
                          ? "No GPU resources registered on chain yet."
                          : "No GPU models match the current filter."}
                      </td>
                    </tr>
                  ) : (
                    filteredModels.map((m) => (
                      <tr key={m.modelName} style={{ borderBottom: "1px solid var(--border)" }} data-testid="model-row">
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 700 }}>{m.modelName}</span>
                        </td>
                        <td style={tdStyle}>{m.totalProviders}</td>
                        <td style={tdStyle}>
                          <span className="mono" style={{ fontWeight: 600 }}>
                            {formatClaw(m.avgPrice)}
                          </span>
                        </td>
                        <td style={tdStyle}>{m.totalVramGB} GB</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, color: utilizationColor(m.utilization), minWidth: 45 }}>
                              {m.utilization.toFixed(1)}%
                            </span>
                            <div style={{ flex: 1, maxWidth: 100, height: 6, background: "var(--border)", borderRadius: 3 }}>
                              <div
                                style={{
                                  width: `${m.utilization}%`,
                                  height: "100%",
                                  background: utilizationColor(m.utilization),
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Performance */}
          {tab === "performance" && (
            <div className="card" style={{ overflowX: "auto" }} data-testid="performance-tab">
              <h3 style={{ marginBottom: "1rem" }}>
                Provider Performance ({filteredPerformance.length})
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("address")}>
                      Provider{sortIndicator("address")}
                    </th>
                    <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => toggleSort("gpu")}>
                      GPU{sortIndicator("gpu")}
                    </th>
                    <th style={thStyle}>Total Jobs</th>
                    <th style={thStyle}>Completed</th>
                    <th style={thStyle}>Error Rate</th>
                    <th style={{ ...thStyle, cursor: "pointer", textAlign: "right" }} onClick={() => toggleSort("earningsPerDay")}>
                      Total Earnings{sortIndicator("earningsPerDay")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text2)" }}>
                        {performance.length === 0
                          ? "No provider data available yet."
                          : "No performance data matches the current filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredPerformance.map((p) => {
                      const errRate = p.totalJobs > 0 ? p.failedJobs / p.totalJobs : 0;
                      return (
                        <tr key={p.address} style={{ borderBottom: "1px solid var(--border)" }} data-testid="performance-row">
                          <td style={tdStyle}>
                            <Link
                              to={`/explorer/account/${p.address}`}
                              className="mono"
                              style={{ color: "var(--accent)", fontSize: "0.85rem" }}
                            >
                              {shortAddr(p.address)}
                            </Link>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600 }}>{p.gpuModel}</span>
                          </td>
                          <td style={tdStyle}>{p.totalJobs}</td>
                          <td style={tdStyle}>
                            <span style={{ color: "var(--green)", fontWeight: 600 }}>
                              {p.completedJobs}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{ color: errorRateColor(errRate), fontWeight: 600 }}>
                              {(errRate * 100).toFixed(2)}%
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <span className="mono" style={{ fontWeight: 700, color: "#22c55e" }}>
                              {formatClaw(p.earningsTotal)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  color: "var(--text2)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
};
