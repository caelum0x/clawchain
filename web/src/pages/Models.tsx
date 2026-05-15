import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  getModels,
  getModelVersions,
  getInferenceJobs,
  getInferenceProviders,
  shortAddr,
  formatClaw,
  ModelRecord,
  ModelVersion,
  InferenceJob,
  InferenceProvider,
} from '../lib/chain';
import useDocTitle from '../hooks/useDocTitle.ts';

type AccessFilter = 'all' | 'free' | 'per-query' | 'one-time' | 'subscription';
type SortMode = 'newest' | 'highest-rated' | 'most-popular';

const FRAMEWORK_COLORS: Record<string, string> = {
  pytorch: 'pytorch',
  tensorflow: 'tensorflow',
  onnx: 'onnx',
};

function frameworkClass(fw: string): string {
  const key = fw.toLowerCase().replace(/\s+/g, '');
  return FRAMEWORK_COLORS[key] ?? '';
}

function accessClass(at: string): string {
  const key = at.toLowerCase().replace(/[\s_]+/g, '-');
  if (['free', 'per-query', 'one-time', 'subscription'].includes(key)) return key;
  return 'free';
}

function formatParams(p: string): string {
  if (!p) return '-';
  const n = parseInt(p.replace(/[^0-9]/g, ''));
  if (isNaN(n)) return p;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return p;
}

function renderStars(rating: number): string {
  const filled = Math.round(rating);
  const empty = 5 - filled;
  return '\u2605'.repeat(filled) + '\u2606'.repeat(empty);
}

function accessLabel(at: string): string {
  const key = at.toLowerCase().replace(/[\s_]+/g, '-');
  const labels: Record<string, string> = {
    free: 'Free',
    'per-query': 'Per-Query',
    'one-time': 'One-Time',
    subscription: 'Subscription',
  };
  return labels[key] ?? 'Free';
}

function modelPrice(m: ModelRecord): string {
  const at = m.accessType.toLowerCase().replace(/[\s_]+/g, '-');
  if (at === 'free') return 'Free';
  if (at === 'per-query' && m.pricePerQueryUclaw !== '0') return `${formatClaw(m.pricePerQueryUclaw)}/query`;
  if (at === 'one-time' && m.priceOneTimeUclaw !== '0') return formatClaw(m.priceOneTimeUclaw);
  if (at === 'subscription' && m.pricePerQueryUclaw !== '0') return `${formatClaw(m.pricePerQueryUclaw)}/mo`;
  return 'Free';
}

export default function Models() {
  useDocTitle("Models");
  const [models, setModels] = useState<ModelRecord[]>([]);
  const [jobs, setJobs] = useState<InferenceJob[]>([]);
  const [providers, setProviders] = useState<InferenceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'models' | 'jobs' | 'providers'>('models');

  // Filters & sort
  const [search, setSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Detail modal
  const [selectedModel, setSelectedModel] = useState<ModelRecord | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<ModelVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Register form
  const [regForm, setRegForm] = useState({
    name: '',
    framework: '',
    architecture: '',
    parameterCount: '',
    storageUrl: '',
    checksum: '',
    accessType: 'free',
    price: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [m, j, p] = await Promise.all([
        getModels(),
        getInferenceJobs(),
        getInferenceProviders(),
      ]);
      setModels(m);
      setJobs(j);
      setProviders(p);
    } catch (e) {
      console.error('Failed to load model registry data:', e);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(m: ModelRecord) {
    setSelectedModel(m);
    setLoadingVersions(true);
    try {
      const versions = await getModelVersions(parseInt(m.id));
      setSelectedVersions(versions);
    } catch {
      setSelectedVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }

  function closeDetail() {
    setSelectedModel(null);
    setSelectedVersions([]);
  }

  // Filter + search + sort
  const filteredModels = useMemo(() => {
    let result = [...models];

    // Access type filter
    if (accessFilter !== 'all') {
      result = result.filter((m) => {
        const at = m.accessType.toLowerCase().replace(/[\s_]+/g, '-');
        return at === accessFilter;
      });
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          (m.name || '').toLowerCase().includes(q) ||
          (m.framework || '').toLowerCase().includes(q) ||
          (m.architecture || '').toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortMode === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortMode === 'highest-rated') return (b.rating || 0) - (a.rating || 0);
      if (sortMode === 'most-popular') return (b.totalDownloads || 0) - (a.totalDownloads || 0);
      return 0;
    });

    return result;
  }, [models, accessFilter, search, sortMode]);

  function statusBadge(status: string, active?: boolean) {
    const isActive = active ?? (status === 'completed' || status === 'active');
    const cls = isActive ? 'badge-success' : status === 'pending' ? 'badge-warning' : 'badge-info';
    return <span className={`badge ${cls}`}>{status || (active ? 'active' : 'inactive')}</span>;
  }

  const filterChips: { label: string; value: AccessFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Free', value: 'free' },
    { label: 'Per-Query', value: 'per-query' },
    { label: 'One-Time', value: 'one-time' },
    { label: 'Subscription', value: 'subscription' },
  ];

  return (
    <div>
      <div className="model-header-row">
        <div>
          <h1 className="page-title">Model Registry</h1>
          <p className="page-subtitle">
            Browse registered AI models, track inference jobs, and view inference providers on-chain.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button className={`btn ${tab === 'models' ? 'btn-primary' : ''}`} onClick={() => setTab('models')}>
          Models ({models.length})
        </button>
        <button className={`btn ${tab === 'jobs' ? 'btn-primary' : ''}`} onClick={() => setTab('jobs')}>
          Inference Jobs ({jobs.length})
        </button>
        <button className={`btn ${tab === 'providers' ? 'btn-primary' : ''}`} onClick={() => setTab('providers')}>
          Providers ({providers.length})
        </button>
      </div>

      {tab === 'models' && (
        <>
          {/* Search + Filters + Sort */}
          <div className="model-controls">
            <input
              className="model-search-bar"
              type="text"
              placeholder="Search models by name, framework, or architecture..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search models"
            />
            <div className="model-controls-row">
              <div className="model-filter-chips" role="group" aria-label="Filter by access type">
                {filterChips.map((chip) => (
                  <button
                    key={chip.value}
                    className={`model-filter-chip${accessFilter === chip.value ? ' active' : ''}`}
                    onClick={() => setAccessFilter(chip.value)}
                    data-testid={`filter-${chip.value}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <select
                className="model-sort-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="Sort models"
              >
                <option value="newest">Newest</option>
                <option value="highest-rated">Highest Rated</option>
                <option value="most-popular">Most Popular</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="loading">
              <div className="spinner" />
              <p>Loading models...</p>
            </div>
          ) : filteredModels.length === 0 && models.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                No models registered yet. Be the first to register an AI model on ClawChain.
              </p>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <p>No models match your search or filter criteria.</p>
            </div>
          ) : (
            <div className="model-grid" data-testid="model-grid">
              {filteredModels.map((m) => (
                <div key={m.id} className="model-card" data-testid="model-card" onClick={() => openDetail(m)}>
                  <div className="model-name">{m.name || 'Unnamed Model'}</div>
                  <div className="model-meta">
                    {m.framework && (
                      <span className={`model-badge ${frameworkClass(m.framework)}`}>{m.framework}</span>
                    )}
                    {m.architecture && (
                      <span className="model-badge">{m.architecture}</span>
                    )}
                    <span className={`model-badge ${accessClass(m.accessType)}`}>
                      {accessLabel(m.accessType)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span className="model-params">{formatParams(m.parameterCount)} params</span>
                    <span className="model-params">v{m.currentVersion}</span>
                  </div>
                  <div className="model-rating" aria-label={`Rating ${Math.round(m.rating)} out of 5`}>
                    {renderStars(m.rating)}
                    {m.ratingCount > 0 && (
                      <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '0.35rem', letterSpacing: 'normal' }}>
                        ({m.ratingCount})
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                    <span className="model-price">{modelPrice(m)}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                      <Link to={`/explorer/account/${m.owner}`} onClick={(e) => e.stopPropagation()}>
                        {shortAddr(m.owner)}
                      </Link>
                    </span>
                  </div>
                  <button
                    className="btn-outline"
                    style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.85rem', padding: '0.5rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail(m);
                    }}
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Register Model Form */}
          <div className="model-register-section" data-testid="register-section">
            <h2>Register a New Model</h2>
            <div className="model-register-grid">
              <div>
                <label>Name</label>
                <input
                  type="text"
                  placeholder="My AI Model"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                />
              </div>
              <div>
                <label>Framework</label>
                <input
                  type="text"
                  placeholder="PyTorch, TensorFlow, ONNX..."
                  value={regForm.framework}
                  onChange={(e) => setRegForm({ ...regForm, framework: e.target.value })}
                />
              </div>
              <div>
                <label>Architecture</label>
                <input
                  type="text"
                  placeholder="Transformer, CNN, Diffusion..."
                  value={regForm.architecture}
                  onChange={(e) => setRegForm({ ...regForm, architecture: e.target.value })}
                />
              </div>
              <div>
                <label>Parameter Count</label>
                <input
                  type="text"
                  placeholder="7000000000"
                  value={regForm.parameterCount}
                  onChange={(e) => setRegForm({ ...regForm, parameterCount: e.target.value })}
                />
              </div>
              <div className="full-span">
                <label>Storage URL</label>
                <input
                  type="text"
                  placeholder="ipfs://... or https://..."
                  value={regForm.storageUrl}
                  onChange={(e) => setRegForm({ ...regForm, storageUrl: e.target.value })}
                />
              </div>
              <div className="full-span">
                <label>SHA-256 Checksum</label>
                <input
                  type="text"
                  placeholder="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                  value={regForm.checksum}
                  onChange={(e) => setRegForm({ ...regForm, checksum: e.target.value })}
                />
              </div>
              <div>
                <label>Access Type</label>
                <select
                  value={regForm.accessType}
                  onChange={(e) => setRegForm({ ...regForm, accessType: e.target.value })}
                >
                  <option value="free">Free</option>
                  <option value="per-query">Per-Query</option>
                  <option value="one-time">One-Time</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>
              <div>
                <label>Price (uclaw)</label>
                <input
                  type="text"
                  placeholder="0"
                  value={regForm.price}
                  disabled={regForm.accessType === 'free'}
                  onChange={(e) => setRegForm({ ...regForm, price: e.target.value })}
                />
              </div>
            </div>

            {/* Preview Card */}
            {regForm.name && (
              <div className="model-preview-card">
                <h3>Preview</h3>
                <div className="model-name">{regForm.name}</div>
                <div className="model-meta">
                  {regForm.framework && (
                    <span className={`model-badge ${frameworkClass(regForm.framework)}`}>
                      {regForm.framework}
                    </span>
                  )}
                  {regForm.architecture && (
                    <span className="model-badge">{regForm.architecture}</span>
                  )}
                  <span className={`model-badge ${accessClass(regForm.accessType)}`}>
                    {accessLabel(regForm.accessType)}
                  </span>
                </div>
                {regForm.parameterCount && (
                  <div className="model-params">{formatParams(regForm.parameterCount)} params</div>
                )}
                <div className="model-price" style={{ marginTop: '0.5rem' }}>
                  {regForm.accessType === 'free'
                    ? 'Free'
                    : regForm.price
                      ? formatClaw(regForm.price)
                      : 'Price not set'}
                </div>
              </div>
            )}

            <button style={{ marginTop: '1rem' }} disabled>
              Register Model (connect wallet)
            </button>
          </div>
        </>
      )}

      {/* Detail Modal */}
      {selectedModel && (
        <div className="model-detail-overlay" data-testid="model-detail-overlay" onClick={closeDetail}>
          <div className="model-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>{selectedModel.name || 'Unnamed Model'}</h2>
              <button
                className="btn-outline"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.85rem' }}
                onClick={closeDetail}
                aria-label="Close detail"
              >
                X
              </button>
            </div>

            <div className="model-meta" style={{ marginBottom: '1rem' }}>
              {selectedModel.framework && (
                <span className={`model-badge ${frameworkClass(selectedModel.framework)}`}>
                  {selectedModel.framework}
                </span>
              )}
              {selectedModel.architecture && (
                <span className="model-badge">{selectedModel.architecture}</span>
              )}
              <span className={`model-badge ${accessClass(selectedModel.accessType)}`}>
                {accessLabel(selectedModel.accessType)}
              </span>
            </div>

            <div className="model-detail-section">
              <h4>Description</h4>
              <p>{selectedModel.description || 'No description provided.'}</p>
            </div>

            <div className="model-detail-section">
              <h4>Parameters</h4>
              <p>{formatParams(selectedModel.parameterCount)}</p>
            </div>

            <div className="model-detail-section">
              <h4>Rating</h4>
              <p>
                <span className="model-rating">{renderStars(selectedModel.rating)}</span>
                {selectedModel.ratingCount > 0 && ` (${selectedModel.ratingCount} ratings)`}
              </p>
            </div>

            <div className="model-detail-section">
              <h4>Storage</h4>
              <p>
                {selectedModel.storageType && <strong>{selectedModel.storageType}: </strong>}
                {selectedModel.storageUri || 'Not specified'}
              </p>
            </div>

            <div className="model-detail-section">
              <h4>SHA-256 Checksum</h4>
              <p className="mono" style={{ fontSize: '0.8rem' }}>
                {selectedModel.checksumSha256 || 'N/A'}
              </p>
            </div>

            <div className="model-detail-section">
              <h4>Version</h4>
              <p>v{selectedModel.currentVersion}</p>
            </div>

            {loadingVersions ? (
              <p style={{ opacity: 0.6 }}>Loading version history...</p>
            ) : selectedVersions.length > 0 ? (
              <div className="model-detail-section">
                <h4>Version History</h4>
                <ul className="model-version-list">
                  {selectedVersions.map((v) => (
                    <li key={v.id}>
                      <strong>v{v.version}</strong>
                      {v.changelog && <span> &mdash; {v.changelog}</span>}
                      {v.sizeBytes > 0 && (
                        <span style={{ opacity: 0.6 }}> ({(v.sizeBytes / 1_000_000).toFixed(1)} MB)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="model-detail-section">
              <h4>Access &amp; Pricing</h4>
              <p>
                <strong>Type:</strong> {accessLabel(selectedModel.accessType)}
                <br />
                <strong>Price:</strong> {modelPrice(selectedModel)}
              </p>
            </div>

            <div className="model-detail-section">
              <h4>Usage Stats</h4>
              <p>
                <strong>Downloads:</strong> {selectedModel.totalDownloads}
                <br />
                <strong>Revenue:</strong> {formatClaw(selectedModel.totalRevenue)}
              </p>
            </div>

            <div className="model-detail-section">
              <h4>Provider</h4>
              <p>
                <Link to={`/explorer/account/${selectedModel.owner}`}>
                  {selectedModel.owner}
                </Link>
              </p>
            </div>

            {selectedModel.license && (
              <div className="model-detail-section">
                <h4>License</h4>
                <p>{selectedModel.license}</p>
              </div>
            )}

            <button style={{ width: '100%', marginTop: '1rem' }} disabled>
              {selectedModel.accessType === 'free' ? 'Access Model' : 'Purchase Access'} (connect wallet)
            </button>
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <>
          {loading ? (
            <p>Loading inference jobs...</p>
          ) : jobs.length === 0 ? (
            <div className="card"><p>No inference jobs found.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Model</th>
                    <th>Requester</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.jobId}>
                      <td>{j.jobId}</td>
                      <td>{j.modelId}</td>
                      <td>
                        <Link to={`/explorer/account/${j.requester}`}>
                          {shortAddr(j.requester)}
                        </Link>
                      </td>
                      <td>
                        {j.provider ? (
                          <Link to={`/explorer/account/${j.provider}`}>
                            {shortAddr(j.provider)}
                          </Link>
                        ) : (
                          <span style={{ opacity: 0.5 }}>unassigned</span>
                        )}
                      </td>
                      <td>{statusBadge(j.status)}</td>
                      <td>{formatClaw(j.payment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'providers' && (
        <>
          {loading ? (
            <p>Loading inference providers...</p>
          ) : providers.length === 0 ? (
            <div className="card"><p>No inference providers registered yet.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Models Served</th>
                    <th>Active / Total Jobs</th>
                    <th>Earnings</th>
                    <th>Avg Latency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => (
                    <tr key={p.address}>
                      <td>
                        <Link to={`/explorer/account/${p.address}`}>
                          {shortAddr(p.address)}
                        </Link>
                      </td>
                      <td>
                        {p.modelIds.length > 0
                          ? p.modelIds.map((id, i) => (
                              <span key={i} className="badge badge-info" style={{ marginRight: '0.25rem' }}>
                                #{id}
                              </span>
                            ))
                          : <span style={{ opacity: 0.5 }}>none</span>
                        }
                      </td>
                      <td>{p.activeJobs} / {p.totalJobs}</td>
                      <td>{formatClaw(p.totalEarnings)}</td>
                      <td>{p.avgLatencyMs > 0 ? `${p.avgLatencyMs}ms` : '-'}</td>
                      <td>
                        <span className={`badge ${p.isOnline ? 'badge-success' : 'badge-warning'}`}>
                          {p.isOnline ? 'online' : 'offline'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
