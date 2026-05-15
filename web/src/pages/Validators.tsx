import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getValidators, formatClaw, shortAddr, type Validator } from "../lib/chain.ts";
import useDocTitle from "../hooks/useDocTitle.ts";
import ExportMenu from "../components/ExportMenu.tsx";

type SortKey = "rank" | "power" | "commission";
type StatusFilter = "all" | "active" | "jailed";

export default function Validators() {
  useDocTitle("Validators");
  const [validators, setValidators] = useState<Validator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    (async () => {
      try {
        const v = await getValidators();
        v.sort((a, b) => Number(BigInt(b.tokens) - BigInt(a.tokens)));
        setValidators(v);
      } catch { /* offline */ }
      setLoading(false);
    })();
  }, []);

  const totalStake = useMemo(
    () => validators.reduce((sum, v) => sum + BigInt(v.tokens), 0n),
    [validators],
  );
  const activeCount = useMemo(
    () => validators.filter((v) => !v.jailed).length,
    [validators],
  );
  const jailedCount = useMemo(
    () => validators.filter((v) => v.jailed).length,
    [validators],
  );
  const avgCommission = useMemo(() => {
    if (validators.length === 0) return 0;
    const sum = validators.reduce((s, v) => s + parseFloat(v.commission), 0);
    return sum / validators.length;
  }, [validators]);

  const filtered = useMemo(() => {
    let result = validators;
    if (statusFilter === "active") result = result.filter((v) => !v.jailed);
    if (statusFilter === "jailed") result = result.filter((v) => v.jailed);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.moniker.toLowerCase().includes(q) ||
          v.operatorAddress.toLowerCase().includes(q),
      );
    }
    return result;
  }, [validators, search, statusFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortKey === "power") {
      list.sort((a, b) => Number(BigInt(a.tokens) - BigInt(b.tokens)) * (sortAsc ? 1 : -1));
    } else if (sortKey === "commission") {
      list.sort((a, b) => (parseFloat(a.commission) - parseFloat(b.commission)) * (sortAsc ? 1 : -1));
    } else {
      // rank = default power descending, but flip if asc requested
      list.sort((a, b) => Number(BigInt(b.tokens) - BigInt(a.tokens)) * (sortAsc ? -1 : 1));
    }
    return list;
  }, [filtered, sortKey, sortAsc]);

  const exportData = useMemo(
    () =>
      sorted.map((v, i) => ({
        rank: i + 1,
        moniker: v.moniker || "Unnamed",
        operatorAddress: v.operatorAddress,
        tokens: v.tokens,
        votingPower: formatClaw(v.tokens),
        commission: `${(parseFloat(v.commission) * 100).toFixed(1)}%`,
        status: v.jailed ? "Jailed" : "Active",
      })),
    [sorted],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? " \u25B2" : " \u25BC";
  }

  if (loading) return <div className="loading"><div className="spinner" /><p>Loading validators...</p></div>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Validators</h1>
          <p className="page-subtitle">
            {validators.length} validator{validators.length !== 1 ? "s" : ""}
            {totalStake > 0n && <> &mdash; {formatClaw(totalStake.toString())} total stake</>}
          </p>
        </div>
        {validators.length > 0 && <ExportMenu data={exportData} filename="validators" />}
      </div>

      {/* Stat cards */}
      {validators.length > 0 && (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <div className="card">
            <h3>Active Validators</h3>
            <div className="value">{activeCount}</div>
          </div>
          <div className="card">
            <h3>Total Staked</h3>
            <div className="value">{formatClaw(totalStake.toString())}</div>
          </div>
          <div className="card">
            <h3>Avg Commission</h3>
            <div className="value">{(avgCommission * 100).toFixed(1)}%</div>
          </div>
          <div className="card">
            <h3>Jailed</h3>
            <div className="value" style={{ color: jailedCount > 0 ? "var(--error)" : undefined }}>
              {jailedCount}
            </div>
          </div>
        </div>
      )}

      {/* Search and filter bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search validators..."
          style={{ flex: 1, minWidth: 200 }}
          aria-label="Search validators"
        />
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "active", "jailed"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              className={statusFilter === f ? "btn-primary" : "btn-outline"}
              onClick={() => setStatusFilter(f)}
              style={{ textTransform: "capitalize", padding: "6px 14px", fontSize: 13 }}
            >
              {f === "all" ? `All (${validators.length})` : f === "active" ? `Active (${activeCount})` : `Jailed (${jailedCount})`}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty">
          {validators.length === 0
            ? "No validators found. Is the chain running?"
            : "No validators match your search."}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th
                  onClick={() => handleSort("rank")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  #{sortIndicator("rank")}
                </th>
                <th>Validator</th>
                <th
                  onClick={() => handleSort("power")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Voting Power{sortIndicator("power")}
                </th>
                <th
                  onClick={() => handleSort("commission")}
                  style={{ cursor: "pointer", userSelect: "none" }}
                >
                  Commission{sortIndicator("commission")}
                </th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v, i) => {
                const pct = totalStake > 0n
                  ? ((BigInt(v.tokens) * 10000n) / totalStake)
                  : 0n;
                return (
                  <tr key={v.operatorAddress}>
                    <td>{i + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        <Link to={`/validators/${v.operatorAddress}`}>
                          {v.moniker || "Unnamed"}
                        </Link>
                      </div>
                      <div className="mono" style={{ fontSize: 12, color: "var(--text2)" }}>
                        <Link to={`/validators/${v.operatorAddress}`}>
                          {shortAddr(v.operatorAddress)}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <div>{formatClaw(v.tokens)}</div>
                      <div style={{ fontSize: 12, color: "var(--text2)" }}>
                        {(Number(pct) / 100).toFixed(2)}%
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          height: 4,
                          borderRadius: 2,
                          background: "var(--bg3)",
                          overflow: "hidden",
                          maxWidth: 120,
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Number(pct) / 100)}%`,
                            height: "100%",
                            background: "var(--accent)",
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </td>
                    <td>{(parseFloat(v.commission) * 100).toFixed(1)}%</td>
                    <td>
                      {v.jailed ? (
                        <span className="badge error">Jailed</span>
                      ) : (
                        <span className="badge success">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
