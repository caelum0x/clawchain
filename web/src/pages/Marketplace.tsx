import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import {
  getSkills,
  getLiveAgents,
  getTopAgents,
  getTreeStats,
  getAgentRewards,
  getRewardLeaderboard,
  getComputeResources,
  getComputeLeases,
  getModels,
  getInferenceJobs,
  getInferenceProviders,
  getInferenceJob,
  buildSubmitInferenceJobMsg,
  buildLeaseComputeResourceMsg,
  formatClaw,
  shortAddr,
  type Skill,
  type AgentInfo,
  type Reputation,
  type ComputeResource,
  type ComputeLease,
  type ModelRecord,
  type InferenceJob,
  type InferenceProvider,
} from "../lib/chain.ts";
import { isKeplrAvailable, connectKeplr, signAndBroadcast, WalletState } from "../lib/wallet.ts";
import { useInferenceStream } from "../lib/inference-stream.ts";
import LiveGPUStatus from "../components/LiveGPUStatus.tsx";

type SkillCategory = "all" | "ai-ml" | "data" | "development" | "creative" | "finance" | "other";
type SkillSort = "newest" | "popular" | "price-low" | "rating";

const CATEGORY_CHIPS: { label: string; value: SkillCategory }[] = [
  { label: "All", value: "all" },
  { label: "AI/ML", value: "ai-ml" },
  { label: "Data", value: "data" },
  { label: "Development", value: "development" },
  { label: "Creative", value: "creative" },
  { label: "Finance", value: "finance" },
  { label: "Other", value: "other" },
];

const CATEGORY_LABELS: Record<string, string> = {
  "ai-ml": "AI/ML",
  data: "Data",
  development: "Development",
  creative: "Creative",
  finance: "Finance",
  other: "Other",
};

function inferCategory(skill: Skill): string {
  const text = `${skill.name} ${skill.description}`.toLowerCase();
  if (/\b(ai|ml|model|neural|llm|gpt|train|inference|deep.?learn)\b/.test(text)) return "ai-ml";
  if (/\b(data|etl|pipeline|analytics|database|sql|scrape)\b/.test(text)) return "data";
  if (/\b(dev|code|api|sdk|deploy|ci|build|test|debug|software)\b/.test(text)) return "development";
  if (/\b(creative|design|art|image|video|music|audio|render)\b/.test(text)) return "creative";
  if (/\b(financ|trade|defi|swap|token|lend|borrow|yield|stake)\b/.test(text)) return "finance";
  return "other";
}

function categoryClass(cat: string): string {
  if (["ai-ml", "data", "development", "creative", "finance"].includes(cat)) return cat;
  return "other";
}

function renderStars(rating: number): string {
  const filled = Math.min(5, Math.max(0, Math.round(rating)));
  return "\u2605".repeat(filled) + "\u2606".repeat(5 - filled);
}

function skillRating(skill: Skill): number {
  // Derive a rating from purchase count (higher purchases = higher inferred rating)
  const purchases = parseInt(skill.purchaseCount) || 0;
  if (purchases >= 50) return 5;
  if (purchases >= 20) return 4;
  if (purchases >= 5) return 3;
  if (purchases >= 1) return 2;
  return 0;
}

export default function Marketplace() {
  useDocTitle("Marketplace");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [topAgents, setTopAgents] = useState<Reputation[]>([]);
  const [treeStats, setTreeStats] = useState<{ leafCount: string; root: string; depth: string } | null>(null);
  const [rewardLeaderboard, setRewardLeaderboard] = useState<Array<{ address: string; name: string; cumulativeRewards: string }>>([]);
  const [computeResources, setComputeResources] = useState<ComputeResource[]>([]);
  const [activeLeases, setActiveLeases] = useState<ComputeLease[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [inferenceJobs, setInferenceJobs] = useState<InferenceJob[]>([]);
  const [inferenceProviders, setInferenceProviders] = useState<InferenceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"skills" | "create" | "agents" | "reputation" | "privacy" | "rewards" | "compute" | "models" | "inference">("skills");
  const [wallet, setWallet] = useState<WalletState | null>(null);

  // Skill browser state
  const [skillSearch, setSkillSearch] = useState("");
  const [skillCategory, setSkillCategory] = useState<SkillCategory>("all");
  const [skillSort, setSkillSort] = useState<SkillSort>("newest");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  // Create listing form
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    category: "other",
    price: "",
  });

  // Inference job submission form
  const [infModelId, setInfModelId] = useState("");
  const [infInput, setInfInput] = useState("");
  const [infMaxTokens, setInfMaxTokens] = useState("256");
  const [infTemp, setInfTemp] = useState("0.7");
  const [infPayment, setInfPayment] = useState("1");
  const [infSubmitting, setInfSubmitting] = useState(false);
  const [infStatus, setInfStatus] = useState<{ type: "success" | "error"; msg: string; jobId?: string } | null>(null);

  // Streaming state
  const [streamJobId, setStreamJobId] = useState<string | null>(null);
  const stream = useInferenceStream(streamJobId);

  // Lease form
  const [leaseResourceId, setLeaseResourceId] = useState<string | null>(null);
  const [leaseDuration, setLeaseDuration] = useState("1");
  const [leaseSubmitting, setLeaseSubmitting] = useState(false);
  const [leaseStatus, setLeaseStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function loadData() {
    try {
      const [sk, ag, top, tree, leaderboard, compute, leases, mdls, infJobs, infProviders] = await Promise.all([
        getSkills(),
        getLiveAgents(),
        getTopAgents(),
        getTreeStats(),
        getRewardLeaderboard(),
        getComputeResources(),
        getComputeLeases(),
        getModels(),
        getInferenceJobs(),
        getInferenceProviders(),
      ]);
      setSkills(sk);
      setAgents(ag);
      setTopAgents(top);
      setTreeStats(tree);
      setRewardLeaderboard(leaderboard);
      setComputeResources(compute);
      setActiveLeases(leases);
      setModels(mdls);
      setInferenceJobs(infJobs);
      setInferenceProviders(infProviders);
    } catch { /* offline */ }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      console.error("Wallet connect failed:", e);
    }
  }

  async function handleSubmitInference(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setInfSubmitting(true);
    setInfStatus(null);

    try {
      const paymentUclaw = String(Math.floor(parseFloat(infPayment) * 1_000_000));
      const msg = buildSubmitInferenceJobMsg(
        wallet.address,
        parseInt(infModelId),
        1,
        infInput,
        parseInt(infMaxTokens),
        infTemp,
        paymentUclaw
      );

      const result = await signAndBroadcast(wallet.address, [msg], "Submit inference job");

      if (result.code === 0) {
        const jobId = (result as any).jobId || "";
        setInfStatus({ type: "success", msg: `Job submitted! Tx: ${result.txHash}`, jobId });
        if (jobId) {
          setStreamJobId(jobId);
          stream.start();
        }
        setInfInput("");
        loadData();
      } else {
        setInfStatus({ type: "error", msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setInfStatus({ type: "error", msg: e.message });
    } finally {
      setInfSubmitting(false);
    }
  }

  async function handleLeaseResource(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address || !leaseResourceId) return;
    setLeaseSubmitting(true);
    setLeaseStatus(null);

    try {
      const msg = buildLeaseComputeResourceMsg(
        wallet.address,
        parseInt(leaseResourceId),
        parseInt(leaseDuration)
      );

      const result = await signAndBroadcast(wallet.address, [msg], "Lease GPU compute resource");

      if (result.code === 0) {
        setLeaseStatus({ type: "success", msg: `Lease created! Tx: ${result.txHash}` });
        setLeaseResourceId(null);
        setLeaseDuration("1");
        loadData();
      } else {
        setLeaseStatus({ type: "error", msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setLeaseStatus({ type: "error", msg: e.message });
    } finally {
      setLeaseSubmitting(false);
    }
  }

  // Filtered + sorted skills
  const filteredSkills = useMemo(() => {
    let result = skills.map((s) => ({ ...s, _category: inferCategory(s) }));

    // Category filter
    if (skillCategory !== "all") {
      result = result.filter((s) => s._category === skillCategory);
    }

    // Search
    if (skillSearch.trim()) {
      const q = skillSearch.toLowerCase();
      result = result.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (s._category || "").toLowerCase().includes(q) ||
          (s.owner || "").toLowerCase().includes(q) ||
          (s.description || "").toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (skillSort === "newest") return parseInt(b.id) - parseInt(a.id);
      if (skillSort === "popular") return parseInt(b.purchaseCount) - parseInt(a.purchaseCount);
      if (skillSort === "price-low") return parseInt(a.price) - parseInt(b.price);
      if (skillSort === "rating") return skillRating(b) - skillRating(a);
      return 0;
    });

    return result;
  }, [skills, skillCategory, skillSearch, skillSort]);

  if (loading) return <div className="loading"><div className="spinner" /><p>Loading marketplace...</p></div>;

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "skills", label: `Skills (${skills.length})` },
    { key: "create", label: "Create Listing" },
    { key: "agents", label: `Live Agents (${agents.length})` },
    { key: "compute", label: `GPU Compute (${computeResources.length})` },
    { key: "models", label: `Models (${models.length})` },
    { key: "inference", label: `Inference (${inferenceJobs.length})` },
    { key: "reputation", label: "Reputation" },
    { key: "privacy", label: "Privacy Pool" },
    { key: "rewards", label: "Rewards" },
  ];

  return (
    <>
      <h1 className="page-title">Marketplace</h1>
      <p className="page-subtitle">Browse skills, agents, and the privacy pool on ClawChain.</p>

      <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? "" : "btn-outline"}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== SKILLS TAB - Card-based browser ===== */}
      {tab === "skills" && (
        <>
          {/* Search + Category Filters + Sort */}
          <div className="marketplace-controls">
            <div className="marketplace-search">
              <input
                type="text"
                placeholder="Search skills by name, category, or seller..."
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                aria-label="Search skills"
                data-testid="skill-search"
              />
            </div>
            <select
              className="marketplace-sort-select"
              value={skillSort}
              onChange={(e) => setSkillSort(e.target.value as SkillSort)}
              aria-label="Sort skills"
              data-testid="skill-sort"
            >
              <option value="newest">Newest</option>
              <option value="popular">Most Popular</option>
              <option value="price-low">Lowest Price</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>

          <div className="marketplace-filter-chips" role="group" aria-label="Filter by category" style={{ marginBottom: "1.5rem" }}>
            {CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.value}
                className={`marketplace-filter-chip${skillCategory === chip.value ? " active" : ""}`}
                onClick={() => setSkillCategory(chip.value)}
                data-testid={`category-${chip.value}`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {skills.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem" }} data-testid="skills-empty">
              <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
                No skills listed yet. Register an agent and list a skill to get started.
              </p>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
              <p>No skills match your search or filter criteria.</p>
            </div>
          ) : (
            <div className="skill-grid" data-testid="skill-grid">
              {filteredSkills.map((s) => {
                const cat = s._category;
                const rating = skillRating(s);
                return (
                  <div
                    key={s.id}
                    className="skill-card"
                    data-testid="skill-card"
                    onClick={() => setSelectedSkill(s)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <div className="skill-name">{s.name || "Unnamed Skill"}</div>
                      <span className={`skill-category ${categoryClass(cat)}`}>
                        {CATEGORY_LABELS[cat] || "Other"}
                      </span>
                    </div>
                    <div className="skill-desc">{s.description || "No description provided."}</div>
                    <div style={{ marginTop: "0.5rem" }}>
                      <span className="skill-rating" aria-label={`Rating ${rating} out of 5`}>
                        {renderStars(rating)}
                      </span>
                      <span className="skill-purchases"> ({s.purchaseCount} purchases)</span>
                    </div>
                    <div className="skill-footer">
                      <span className="skill-price">{formatClaw(s.price)}</span>
                      <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
                        <Link
                          to={`/explorer/account/${s.owner}`}
                          className="mono"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {shortAddr(s.owner)}
                        </Link>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                      <button
                        style={{ flex: 1, fontSize: "0.85rem", padding: "0.5rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSkill(s);
                        }}
                      >
                        Purchase
                      </button>
                      <button
                        className="btn-outline"
                        style={{ flex: 1, fontSize: "0.85rem", padding: "0.5rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSkill(s);
                        }}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Escrow integration link */}
          <div style={{ marginTop: "2rem", textAlign: "center" }}>
            <Link to="/escrows" style={{ fontSize: "0.9rem" }}>
              View Escrow Management &rarr;
            </Link>
          </div>
        </>
      )}

      {/* ===== SKILL DETAIL MODAL ===== */}
      {selectedSkill && (
        <div className="skill-detail-overlay" data-testid="skill-detail-overlay" onClick={() => setSelectedSkill(null)}>
          <div className="skill-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <h2 style={{ margin: 0 }}>{selectedSkill.name || "Unnamed Skill"}</h2>
              <button
                className="btn-outline"
                style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}
                onClick={() => setSelectedSkill(null)}
                aria-label="Close detail"
              >
                X
              </button>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <span className={`skill-category ${categoryClass(inferCategory(selectedSkill))}`}>
                {CATEGORY_LABELS[inferCategory(selectedSkill)] || "Other"}
              </span>
            </div>

            <div className="skill-detail-section">
              <h4>Description</h4>
              <p>{selectedSkill.description || "No description provided."}</p>
            </div>

            <div className="skill-detail-section">
              <h4>Seller</h4>
              <p>
                <Link to={`/explorer/account/${selectedSkill.owner}`}>
                  {selectedSkill.owner}
                </Link>
              </p>
            </div>

            <div className="skill-detail-section">
              <h4>Price</h4>
              <p className="skill-price" style={{ fontSize: "1.25rem" }}>{formatClaw(selectedSkill.price)}</p>
            </div>

            <div className="skill-detail-section">
              <h4>Rating</h4>
              <p>
                <span className="skill-rating">{renderStars(skillRating(selectedSkill))}</span>
                <span style={{ opacity: 0.6, marginLeft: "0.5rem" }}>({selectedSkill.purchaseCount} purchases)</span>
              </p>
            </div>

            <div className="skill-detail-section">
              <h4>Skill ID</h4>
              <p className="mono">{selectedSkill.id}</p>
            </div>

            <button style={{ width: "100%", marginTop: "1rem" }} disabled>
              Purchase Skill (connect wallet)
            </button>
          </div>
        </div>
      )}

      {/* ===== CREATE LISTING TAB ===== */}
      {tab === "create" && (
        <div className="create-listing-form" data-testid="create-listing-section">
          <h2>Create a New Skill Listing</h2>
          <div className="create-listing-grid">
            <div className="full-span">
              <label>Skill Name</label>
              <input
                type="text"
                placeholder="e.g. GPT Fine-Tuning Service"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                data-testid="create-name"
              />
            </div>
            <div className="full-span">
              <label>Description</label>
              <textarea
                placeholder="Describe what your skill does, what inputs it accepts, and what outputs it produces..."
                rows={4}
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                data-testid="create-description"
              />
            </div>
            <div>
              <label>Category</label>
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                data-testid="create-category"
              >
                <option value="ai-ml">AI/ML</option>
                <option value="data">Data</option>
                <option value="development">Development</option>
                <option value="creative">Creative</option>
                <option value="finance">Finance</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label>Price (CLAW)</label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  placeholder="0.00"
                  value={createForm.price}
                  onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                  style={{ paddingRight: "3.5rem" }}
                  data-testid="create-price"
                />
                <span style={{
                  position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                  fontSize: "0.8rem", opacity: 0.5, pointerEvents: "none",
                }}>
                  CLAW
                </span>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          {createForm.name && (
            <div className="listing-preview-card" data-testid="create-preview">
              <h3>Preview</h3>
              <div className="skill-name">{createForm.name}</div>
              <span className={`skill-category ${categoryClass(createForm.category)}`}>
                {CATEGORY_LABELS[createForm.category] || "Other"}
              </span>
              {createForm.description && (
                <div className="skill-desc" style={{ marginTop: "0.5rem" }}>{createForm.description}</div>
              )}
              <div className="skill-price" style={{ marginTop: "0.75rem" }}>
                {createForm.price ? `${createForm.price} CLAW` : "Price not set"}
              </div>
            </div>
          )}

          <button style={{ marginTop: "1rem" }} disabled>
            Create Listing (connect wallet)
          </button>
        </div>
      )}

      {/* ===== AGENTS TAB ===== */}
      {tab === "agents" && (
        agents.length === 0 ? (
          <div className="empty">No live agents. Register yours with the SDK or CLI.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Endpoint</th>
                  <th>Tools</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.address}>
                    <td style={{ fontWeight: 600 }}>{a.name || "Unnamed"}</td>
                    <td>
                      <Link to={`/explorer/account/${a.address}`} className="mono">
                        {shortAddr(a.address)}
                      </Link>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{a.endpoint || "\u2014"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {a.supportedTools.length > 0 ? a.supportedTools.join(", ") : "\u2014"}
                    </td>
                    <td>
                      <span className={`badge ${a.active ? "success" : "warning"}`}>
                        {a.active ? "Online" : "Offline"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "compute" && (
        <>
          {/* Lease modal */}
          {leaseResourceId && (
            <div className="card" style={{ maxWidth: 500, marginBottom: 24 }}>
              <h3>Lease GPU Resource #{leaseResourceId}</h3>
              {!wallet?.connected ? (
                <div>
                  <p>Connect your wallet to lease GPU compute.</p>
                  <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                    {isKeplrAvailable() ? "Connect Keplr" : "Keplr Not Found"}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleLeaseResource}>
                  <p>Connected: <strong>{shortAddr(wallet.address)}</strong></p>
                  <div style={{ marginBottom: "1rem" }}>
                    <label>Duration (hours)</label>
                    <input type="number" min="1" value={leaseDuration} onChange={(e) => setLeaseDuration(e.target.value)}
                      required style={{ width: "100%", padding: "0.5rem" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-primary" type="submit" disabled={leaseSubmitting}>
                      {leaseSubmitting ? "Leasing..." : "Confirm Lease"}
                    </button>
                    <button className="btn" type="button" onClick={() => setLeaseResourceId(null)}>Cancel</button>
                  </div>
                </form>
              )}
              {leaseStatus && (
                <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: "0.5rem",
                  background: leaseStatus.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  color: leaseStatus.type === "success" ? "#22c55e" : "#ef4444" }}>
                  {leaseStatus.msg}
                </div>
              )}
            </div>
          )}

          {/* Active leases panel */}
          {activeLeases.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2>Active Leases</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lease ID</th>
                      <th>Resource</th>
                      <th>Lessee</th>
                      <th>Cost</th>
                      <th>Blocks</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeLeases.map((l) => (
                      <tr key={l.id}>
                        <td className="mono">{l.id}</td>
                        <td className="mono">{l.resourceId}</td>
                        <td>
                          <Link to={`/explorer/account/${l.lessee}`} className="mono">
                            {shortAddr(l.lessee)}
                          </Link>
                        </td>
                        <td><span style={{ color: "var(--accent)", fontWeight: 600 }}>{formatClaw(l.totalCostUclaw)}</span></td>
                        <td style={{ fontSize: 12 }}>{l.startBlock} - {l.endBlock}</td>
                        <td><span className={`badge ${l.status === "active" ? "success" : "warning"}`}>{l.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <LiveGPUStatus activeLeaseCount={activeLeases.length} />

          {computeResources.length === 0 ? (
            <div className="empty">No GPU compute resources listed yet. Providers can list GPU resources with the SDK or CLI.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>GPU</th>
                    <th>Specs</th>
                    <th>Price/hr</th>
                    <th>Region</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {computeResources.map((r) => {
                    const isAvailable = r.active && !r.currentLessee;
                    return (
                      <tr key={r.id}>
                        <td className="mono">{r.id}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.name}</div>
                          <div style={{ fontSize: 12, color: "var(--text2)" }}>{r.description}</div>
                          {r.tags && r.tags.length > 0 && (
                            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                              {r.tags.map((t) => (
                                <span key={t} style={{ background: "var(--bg2)", borderRadius: 4, padding: "1px 6px", marginRight: 4, display: "inline-block" }}>
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.gpuModel}</div>
                          <div style={{ fontSize: 12, color: "var(--text2)" }}>x{r.gpuCount} ({r.vramGb}GB VRAM)</div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <div>{r.cpuCores} CPU / {r.ramGb}GB RAM</div>
                          <div>{r.storageGb}GB Storage</div>
                        </td>
                        <td>
                          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                            {formatClaw(r.pricePerHourUclaw)}
                          </span>
                          <div style={{ fontSize: 11, color: "var(--text2)" }}>
                            min {r.minLeaseHours}h{r.maxLeaseHours > 0 ? ` / max ${r.maxLeaseHours}h` : ""}
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>{r.region || "--"}</td>
                        <td>
                          <span className={`badge ${isAvailable ? "success" : "warning"}`}>
                            {isAvailable ? "Available" : r.currentLessee ? "Leased" : "Inactive"}
                          </span>
                          {r.totalLeases > 0 && (
                            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                              {r.totalLeases} leases / {formatClaw(r.totalRevenue)} earned
                            </div>
                          )}
                        </td>
                        <td>
                          <Link to={`/explorer/account/${r.owner}`} className="mono">
                            {shortAddr(r.owner)}
                          </Link>
                        </td>
                        <td>
                          {isAvailable && (
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: 12, padding: "4px 12px" }}
                              onClick={() => setLeaseResourceId(r.id)}
                            >
                              Lease
                            </button>
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
      )}

      {tab === "models" && (
        models.length === 0 ? (
          <div className="empty">No AI models listed yet. Register a model with the SDK or CLI to get started.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Framework</th>
                  <th>Architecture</th>
                  <th>Params</th>
                  <th>Access</th>
                  <th>Price</th>
                  <th>Rating</th>
                  <th>Downloads</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const avgRating = m.ratingCount > 0 ? (m.rating / m.ratingCount) : 0;
                  const stars = Math.round(avgRating);
                  const starStr = stars > 0
                    ? Array.from({ length: 5 }, (_, i) => i < stars ? "\u2605" : "\u2606").join("")
                    : "--";
                  const price = m.accessType === "free"
                    ? "Free"
                    : m.accessType === "per_query"
                      ? `${formatClaw(m.pricePerQueryUclaw)}/query`
                      : formatClaw(m.priceOneTimeUclaw);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text2)" }}>{m.description}</div>
                        {m.tags && m.tags.length > 0 && (
                          <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                            {m.tags.map((t) => (
                              <span key={t} style={{ background: "var(--bg2)", borderRadius: 4, padding: "1px 6px", marginRight: 4, display: "inline-block" }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>{m.framework}</td>
                      <td style={{ fontSize: 12 }}>{m.architecture}</td>
                      <td style={{ fontSize: 12 }}>{m.parameterCount}</td>
                      <td>
                        <span className={`badge ${m.accessType === "free" ? "success" : "warning"}`}>
                          {m.accessType}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {price}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: "#f5a623", letterSpacing: 1 }}>{starStr}</span>
                        {m.ratingCount > 0 && (
                          <div style={{ fontSize: 11, color: "var(--text2)" }}>
                            ({m.ratingCount})
                          </div>
                        )}
                      </td>
                      <td>{m.totalDownloads}</td>
                      <td>
                        <Link to={`/explorer/account/${m.owner}`} className="mono">
                          {shortAddr(m.owner)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "inference" && (
        <>
          {/* Provider summary cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <div className="card">
              <h3>Providers</h3>
              <div className="value accent">{inferenceProviders.length}</div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
                {inferenceProviders.filter((p) => p.isOnline).length} online
              </div>
            </div>
            <div className="card">
              <h3>Total Jobs</h3>
              <div className="value">{inferenceJobs.length}</div>
            </div>
            <div className="card">
              <h3>Active Jobs</h3>
              <div className="value accent">
                {inferenceJobs.filter((j) => j.status === "pending" || j.status === "running").length}
              </div>
            </div>
            <div className="card">
              <h3>Completed</h3>
              <div className="value">
                {inferenceJobs.filter((j) => j.status === "completed").length}
              </div>
            </div>
          </div>

          {/* Submit Inference Job */}
          <div className="card" style={{ maxWidth: 700, marginBottom: 24 }}>
            <h2>Submit Inference Job</h2>
            {!wallet?.connected ? (
              <div>
                <p>Connect your wallet to submit inference jobs.</p>
                <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                  {isKeplrAvailable() ? "Connect Keplr" : "Keplr Not Found"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitInference}>
                <p>Connected: <strong>{shortAddr(wallet.address)}</strong> | Balance: {formatClaw(wallet.balance)}</p>

                <div style={{ marginBottom: "1rem" }}>
                  <label>Model</label>
                  <select value={infModelId} onChange={(e) => setInfModelId(e.target.value)} required
                    style={{ width: "100%", padding: "0.5rem" }}>
                    <option value="">Select a model...</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} (ID: {m.id}) - {m.framework}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label>Input / Prompt</label>
                  <textarea value={infInput} onChange={(e) => setInfInput(e.target.value)}
                    placeholder="Enter your inference prompt..." rows={4} required
                    style={{ width: "100%", padding: "0.5rem" }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                  <div>
                    <label>Max Tokens</label>
                    <input type="number" min="1" max="4096" value={infMaxTokens}
                      onChange={(e) => setInfMaxTokens(e.target.value)} style={{ width: "100%", padding: "0.5rem" }} />
                  </div>
                  <div>
                    <label>Temperature</label>
                    <input type="number" step="0.1" min="0" max="2" value={infTemp}
                      onChange={(e) => setInfTemp(e.target.value)} style={{ width: "100%", padding: "0.5rem" }} />
                  </div>
                  <div>
                    <label>Payment (CLAW)</label>
                    <input type="number" step="0.000001" min="0.000001" value={infPayment}
                      onChange={(e) => setInfPayment(e.target.value)} required style={{ width: "100%", padding: "0.5rem" }} />
                  </div>
                </div>

                <button className="btn btn-primary" type="submit" disabled={infSubmitting}>
                  {infSubmitting ? "Submitting..." : "Submit Job"}
                </button>
              </form>
            )}

            {infStatus && (
              <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: "0.5rem",
                background: infStatus.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                color: infStatus.type === "success" ? "#22c55e" : "#ef4444" }}>
                {infStatus.msg}
              </div>
            )}
          </div>

          {/* Streaming Output */}
          {stream.status !== "idle" && (
            <div className="card" style={{ maxWidth: 700, marginBottom: 24 }}>
              <h2>
                Inference Output
                {stream.status === "streaming" && (
                  <span style={{ fontSize: 12, color: "var(--accent)", marginLeft: 8 }}>streaming...</span>
                )}
                {stream.status === "complete" && (
                  <span className="badge success" style={{ marginLeft: 8 }}>Complete</span>
                )}
                {stream.status === "error" && (
                  <span className="badge error" style={{ marginLeft: 8 }}>Error</span>
                )}
              </h2>
              <div style={{
                background: "#111", borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: 14,
                whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto", color: "#ccc",
                border: "1px solid #222",
              }}>
                {stream.tokens || (stream.status === "connecting" ? "Connecting to sidecar..." : "")}
                {stream.status === "streaming" && <span style={{ opacity: 0.5 }}>|</span>}
              </div>
              {stream.status === "complete" && stream.txHash && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--text2)" }}>
                  Tx: <span className="mono">{stream.txHash}</span> | Tokens used: {stream.tokensUsed}
                </div>
              )}
              {stream.error && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{stream.error}</div>
              )}
            </div>
          )}

          {/* Inference Providers */}
          {inferenceProviders.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 24 }}>
              <h2>Inference Providers</h2>
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Models</th>
                    <th>Capacity</th>
                    <th>Jobs</th>
                    <th>Earnings</th>
                    <th>Latency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inferenceProviders.map((p) => (
                    <tr key={p.address}>
                      <td>
                        <Link to={`/explorer/account/${p.address}`} className="mono">
                          {shortAddr(p.address)}
                        </Link>
                        {p.endpoint && (
                          <div style={{ fontSize: 11, color: "var(--text2)" }}>{p.endpoint}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.modelIds.length > 0 ? p.modelIds.join(", ") : "--"}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{p.activeJobs}</span>
                        <span style={{ color: "var(--text2)" }}> / {p.maxConcurrent}</span>
                      </td>
                      <td>{p.totalJobs}</td>
                      <td>
                        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                          {formatClaw(p.totalEarnings)}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {p.avgLatencyMs > 0 ? `${p.avgLatencyMs}ms` : "--"}
                      </td>
                      <td>
                        <span className={`badge ${p.isOnline ? "success" : "warning"}`}>
                          {p.isOnline ? "Online" : "Offline"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Inference Jobs */}
          {inferenceJobs.length === 0 ? (
            <div className="empty">No inference jobs yet. Submit an inference request above or via the SDK/CLI.</div>
          ) : (
            <div className="table-wrap">
              <h2>Recent Inference Jobs</h2>
              <table>
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Model</th>
                    <th>Requester</th>
                    <th>Provider</th>
                    <th>Payment</th>
                    <th>Tokens</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inferenceJobs.slice(0, 50).map((j) => {
                    const statusColor = j.status === "completed"
                      ? "success"
                      : j.status === "failed" || j.status === "timeout"
                        ? "error"
                        : j.status === "running"
                          ? "warning"
                          : "";
                    return (
                      <tr key={j.jobId}>
                        <td className="mono">{j.jobId}</td>
                        <td className="mono">{j.modelId}</td>
                        <td>
                          <Link to={`/explorer/account/${j.requester}`} className="mono">
                            {shortAddr(j.requester)}
                          </Link>
                        </td>
                        <td>
                          <Link to={`/explorer/account/${j.provider}`} className="mono">
                            {shortAddr(j.provider)}
                          </Link>
                        </td>
                        <td>
                          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                            {formatClaw(j.payment)}
                          </span>
                        </td>
                        <td>
                          {j.gasUsed > 0 ? (
                            <span>{j.gasUsed} / {j.maxTokens}</span>
                          ) : (
                            <span style={{ color: "var(--text2)" }}>-- / {j.maxTokens}</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${statusColor}`}>
                            {j.status}
                          </span>
                          {j.errorMsg && (
                            <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2 }}>
                              {j.errorMsg}
                            </div>
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
      )}

      {tab === "reputation" && (
        topAgents.length === 0 ? (
          <div className="empty">No reputation data yet.</div>
        ) : (
          <div className="table-wrap">
            <h2>Top Agents by Reputation</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Agent</th>
                  <th>Rating</th>
                  <th>Total Ratings</th>
                  <th>Endorsements</th>
                </tr>
              </thead>
              <tbody>
                {topAgents.map((r, i) => (
                  <tr key={r.agentAddress}>
                    <td>{i + 1}</td>
                    <td>
                      <Link to={`/explorer/account/${r.agentAddress}`} className="mono">
                        {shortAddr(r.agentAddress)}
                      </Link>
                    </td>
                    <td>
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                        {(parseInt(r.avgRatingBps) / 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>{r.totalRatings}</td>
                    <td>{r.endorsementCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "privacy" && (
        <div className="grid-4">
          <div className="card">
            <h3>Commitments</h3>
            <div className="value accent">{treeStats?.leafCount ?? "0"}</div>
          </div>
          <div className="card">
            <h3>Tree Depth</h3>
            <div className="value">{treeStats?.depth ?? "0"}</div>
          </div>
          <div className="card">
            <h3>Merkle Root</h3>
            <div className="mono" style={{ fontSize: 12, wordBreak: "break-all", marginTop: 4 }}>
              {treeStats?.root || "Empty tree"}
            </div>
          </div>
          <div className="card">
            <h3>Status</h3>
            <div>
              <span className="badge success">Active</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 8 }}>
              Groth16 + BN254 + MiMC
            </div>
          </div>
        </div>
      )}

      {tab === "rewards" && (
        rewardLeaderboard.length === 0 ? (
          <div className="empty">No mining reward data yet. Agents earn rewards through task completion and heartbeats.</div>
        ) : (
          <div className="table-wrap">
            <h2>Agent Mining Rewards Leaderboard</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Agent</th>
                  <th>Address</th>
                  <th>Cumulative Rewards</th>
                </tr>
              </thead>
              <tbody>
                {rewardLeaderboard.map((entry, i) => (
                  <tr key={entry.address}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{entry.name}</td>
                    <td>
                      <Link to={`/explorer/account/${entry.address}`} className="mono">
                        {shortAddr(entry.address)}
                      </Link>
                    </td>
                    <td>
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                        {formatClaw(entry.cumulativeRewards)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  );
}
