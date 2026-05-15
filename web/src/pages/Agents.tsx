import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useDocTitle from '../hooks/useDocTitle.ts';
import {
  getLiveAgents,
  getAgentInfo,
  getAgentLiveness,
  getTasksByAssignee,
  getReputation,
  getTopAgents,
  getAgentRewards,
  shortAddr,
  formatClaw,
  AgentInfo,
  AgentLiveness,
  AgentTask,
  Reputation,
} from '../lib/chain';
import { isKeplrAvailable, connectKeplr, signAndBroadcast, WalletState } from '../lib/wallet';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface EnrichedAgent extends AgentInfo {
  reputation: Reputation | null;
  rewards: string;
  tasksCompleted: number;
  uptime: number;          // derived from liveness uptimeBlocks
  securityDeposit: string;
  lastHeartbeat: string;   // ISO from liveness API
  registeredAt: string;
  liveness: AgentLiveness | null;
}

type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'newest' | 'reputation' | 'tasks';
type ViewMode = 'card' | 'table';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function reputationPercent(bps: string): number {
  return parseInt(bps || '0') / 100;
}

function reputationLevel(pct: number): 'high' | 'medium' | 'low' {
  if (pct >= 70) return 'high';
  if (pct >= 40) return 'medium';
  return 'low';
}

function relativeTime(iso: string): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 0) return 'Just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

function agentStatus(agent: EnrichedAgent): 'active' | 'inactive' | 'idle' {
  if (!agent.active) return 'inactive';
  // If last heartbeat was >10 min ago, consider idle
  if (agent.lastHeartbeat) {
    const diff = Date.now() - new Date(agent.lastHeartbeat).getTime();
    if (diff > 10 * 60 * 1000) return 'idle';
  }
  return 'active';
}

function statusLabel(s: 'active' | 'inactive' | 'idle'): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

async function fetchTaskHistory(address: string): Promise<AgentTask[]> {
  try {
    return await getTasksByAssignee(address);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function Agents() {
  useDocTitle("Agents");
  const [agents, setAgents] = useState<EnrichedAgent[]>([]);
  const [topAgents, setTopAgents] = useState<Reputation[]>([]);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletState | null>(null);

  // UI controls
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  // Detail modal
  const [selectedAgent, setSelectedAgent] = useState<EnrichedAgent | null>(null);
  const [taskHistory, setTaskHistory] = useState<AgentTask[]>([]);
  const [taskHistoryLoading, setTaskHistoryLoading] = useState(false);

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regEndpoint, setRegEndpoint] = useState('');
  const [regTools, setRegTools] = useState('');
  const [regDescription, setRegDescription] = useState('');
  const [regDeposit, setRegDeposit] = useState('');
  const [regStatus, setRegStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delegate task form
  const [delegateDesc, setDelegateDesc] = useState('');
  const [delegateBudget, setDelegateBudget] = useState('');
  const [delegateDeadline, setDelegateDeadline] = useState('24h');
  const [delegateQuality, setDelegateQuality] = useState('standard');
  const [delegating, setDelegating] = useState(false);
  const [delegateStatus, setDelegateStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Endorsement
  const [endorsing, setEndorsing] = useState(false);
  const [endorseStatus, setEndorseStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Copied address feedback
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  async function loadAgents() {
    try {
      const [liveData, top] = await Promise.all([getLiveAgents(), getTopAgents()]);
      setTopAgents(top);

      // Enrich agents with reputation, rewards, and liveness data
      const enriched: EnrichedAgent[] = await Promise.all(
        liveData.map(async (agent) => {
          let reputation: Reputation | null = null;
          let rewards = '0';
          let liveness: AgentLiveness | null = null;
          try {
            reputation = await getReputation(agent.address);
          } catch { /* ignore */ }
          try {
            const r = await getAgentRewards(agent.address);
            rewards = r.cumulativeRewards;
          } catch { /* ignore */ }
          try {
            liveness = await getAgentLiveness(agent.address);
          } catch { /* ignore */ }

          const totalRatings = reputation ? parseInt(reputation.totalRatings) : 0;

          // Derive uptime percentage from uptimeBlocks (assume out of last 1000 blocks)
          const uptimeBlocks = liveness?.uptimeBlocks ?? 0;
          const uptime = uptimeBlocks > 0 ? Math.min(100, Math.round((uptimeBlocks / 1000) * 100)) : 0;

          return {
            ...agent,
            reputation,
            rewards,
            tasksCompleted: totalRatings,
            uptime,
            securityDeposit: '0',
            lastHeartbeat: liveness?.lastHeartbeat ?? '',
            registeredAt: '', // Not available from current API
            liveness,
          };
        })
      );
      setAgents(enriched);
    } catch (e) {
      console.error('Failed to load agents:', e);
    } finally {
      setLoading(false);
    }
  }

  // ---- Filtering + Sorting ----

  const filteredAgents = useMemo(() => {
    let result = [...agents];

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter((a) => a.active);
    } else if (statusFilter === 'inactive') {
      result = result.filter((a) => !a.active);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.address.toLowerCase().includes(q) ||
          (a.supportedTools || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort
    if (sortKey === 'reputation') {
      result.sort((a, b) => {
        const aPct = a.reputation ? reputationPercent(a.reputation.avgRatingBps) : 0;
        const bPct = b.reputation ? reputationPercent(b.reputation.avgRatingBps) : 0;
        return bPct - aPct;
      });
    } else if (sortKey === 'tasks') {
      result.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
    } else {
      // newest — by registeredAt desc
      result.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
    }

    return result;
  }, [agents, statusFilter, searchQuery, sortKey]);

  // ---- Actions ----

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      setRegStatus({ type: 'error', msg: e.message });
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setSubmitting(true);
    setRegStatus(null);

    try {
      const msg = {
        type: 'clawchain/agent/MsgRegisterAgent',
        value: {
          creator: wallet.address,
          name: regName,
          endpoint: regEndpoint,
          supported_tools: regTools.split(',').map((t) => t.trim()).filter(Boolean),
          description: regDescription,
          deposit: regDeposit ? `${regDeposit}uclaw` : undefined,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Register agent via web dashboard');

      if (result.code === 0) {
        setRegStatus({ type: 'success', msg: `Agent registered! Tx: ${result.txHash}` });
        setRegName('');
        setRegEndpoint('');
        setRegTools('');
        setRegDescription('');
        setRegDeposit('');
        loadAgents();
      } else {
        setRegStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setRegStatus({ type: 'error', msg: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelegateTask(agentAddr: string) {
    if (!wallet?.address) return;
    setDelegating(true);
    setDelegateStatus(null);

    try {
      const msg = {
        type: 'clawchain/agent/MsgDelegateTask',
        value: {
          delegator: wallet.address,
          agent_address: agentAddr,
          description: delegateDesc,
          budget: `${delegateBudget}000000`, // Convert CLAW to uclaw
          deadline: delegateDeadline,
          quality_tier: delegateQuality,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], `Delegate task to ${agentAddr.substring(0, 12)}...`);

      if (result.code === 0) {
        setDelegateStatus({ type: 'success', msg: `Task delegated! Tx: ${result.txHash}` });
        setDelegateDesc('');
        setDelegateBudget('');
      } else {
        setDelegateStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setDelegateStatus({ type: 'error', msg: e.message });
    } finally {
      setDelegating(false);
    }
  }

  async function handleEndorse(agentAddr: string) {
    if (!wallet?.address) return;
    setEndorsing(true);
    setEndorseStatus(null);

    try {
      const msg = {
        type: 'clawchain/reputation/MsgEndorseAgent',
        value: {
          endorser: wallet.address,
          agent_address: agentAddr,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], `Endorse agent ${agentAddr.substring(0, 12)}...`);

      if (result.code === 0) {
        setEndorseStatus({ type: 'success', msg: `Endorsed! Tx: ${result.txHash}` });
        loadAgents();
      } else {
        setEndorseStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setEndorseStatus({ type: 'error', msg: e.message });
    } finally {
      setEndorsing(false);
    }
  }

  function openAgentDetail(agent: EnrichedAgent) {
    setSelectedAgent(agent);
    setTaskHistory([]);
    setTaskHistoryLoading(true);
    setDelegateStatus(null);
    fetchTaskHistory(agent.address).then((tasks) => {
      setTaskHistory(tasks);
      setTaskHistoryLoading(false);
    }).catch(() => {
      setTaskHistoryLoading(false);
    });
  }

  function closeDetail() {
    setSelectedAgent(null);
    setTaskHistory([]);
    setTaskHistoryLoading(false);
    setDelegateStatus(null);
  }

  function handleCopy(addr: string) {
    copyToClipboard(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  }

  // ---- Render helpers ----

  function renderReputationBar(agent: EnrichedAgent) {
    const pct = agent.reputation ? reputationPercent(agent.reputation.avgRatingBps) : 0;
    const level = reputationLevel(pct);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span className="agent-stat-label">Reputation</span>
          <span style={{ fontWeight: 600 }}>{pct.toFixed(1)}%</span>
        </div>
        <div className="reputation-bar">
          <div
            className={`reputation-fill ${level}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
            data-testid="reputation-fill"
          />
        </div>
      </div>
    );
  }

  function renderAgentCard(agent: EnrichedAgent) {
    const status = agentStatus(agent);
    return (
      <div className="agent-card" key={agent.address} data-testid="agent-card">
        <div className="agent-header">
          <span className={`agent-status ${status}`} title={statusLabel(status)} data-testid={`status-${status}`} />
          <span className="agent-name">{agent.name || 'Unnamed Agent'}</span>
        </div>

        {/* Address */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Link to={`/explorer/account/${agent.address}`} className="mono" style={{ fontSize: '0.8rem' }}>
            {shortAddr(agent.address)}
          </Link>
          <button
            className="btn-copy"
            onClick={() => handleCopy(agent.address)}
            title="Copy address"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text2)',
              fontSize: '0.75rem',
              padding: '2px 4px',
            }}
          >
            {copiedAddr === agent.address ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Capabilities */}
        <div className="capability-badges">
          {(agent.supportedTools || []).map((tool, j) => (
            <span key={j} className="capability-badge">
              {tool}
            </span>
          ))}
          {(!agent.supportedTools || agent.supportedTools.length === 0) && (
            <span className="capability-badge" style={{ opacity: 0.5 }}>No capabilities listed</span>
          )}
        </div>

        {/* Reputation bar */}
        {renderReputationBar(agent)}

        {/* Stats grid */}
        <div className="agent-stats">
          <div>
            <div className="agent-stat-label">Tasks</div>
            <div className="agent-stat-value">{agent.tasksCompleted}</div>
          </div>
          <div>
            <div className="agent-stat-label">Uptime</div>
            <div className="agent-stat-value">{agent.uptime}%</div>
          </div>
          <div>
            <div className="agent-stat-label">Deposit</div>
            <div className="agent-stat-value">{formatClaw(agent.securityDeposit)}</div>
          </div>
        </div>

        {/* Last heartbeat */}
        <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: '0.75rem' }}>
          Last heartbeat: {relativeTime(agent.lastHeartbeat)}
        </div>

        {/* Endpoint */}
        {agent.endpoint && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text2)', marginBottom: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Endpoint: <code style={{ fontSize: '0.75rem' }}>{agent.endpoint.length > 40 ? agent.endpoint.substring(0, 40) + '...' : agent.endpoint}</code>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            className="btn-outline"
            style={{ flex: 1, fontSize: '0.8rem', padding: '6px 12px' }}
            onClick={() => openAgentDetail(agent)}
          >
            View Detail
          </button>
          <button
            className="btn-outline"
            style={{ flex: 1, fontSize: '0.8rem', padding: '6px 12px' }}
            onClick={() => {
              if (!wallet?.connected) {
                handleConnect().then(() => openAgentDetail(agent));
              } else {
                openAgentDetail(agent);
              }
            }}
          >
            Delegate Task
          </button>
        </div>
      </div>
    );
  }

  function renderTableView() {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Status</th>
              <th>Reputation</th>
              <th>Tasks</th>
              <th>Uptime</th>
              <th>Deposit</th>
              <th>Last Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {filteredAgents.map((agent) => {
              const status = agentStatus(agent);
              const pct = agent.reputation ? reputationPercent(agent.reputation.avgRatingBps) : 0;
              return (
                <tr key={agent.address} data-testid="agent-table-row">
                  <td>
                    <strong
                      style={{ cursor: 'pointer', color: 'var(--accent)' }}
                      onClick={() => openAgentDetail(agent)}
                    >
                      {agent.name || 'Unnamed'}
                    </strong>
                  </td>
                  <td>
                    <Link to={`/explorer/account/${agent.address}`} className="mono">
                      {shortAddr(agent.address)}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${status === 'active' ? 'success' : status === 'idle' ? 'warning' : 'error'}`}>
                      {statusLabel(status)}
                    </span>
                  </td>
                  <td>{pct.toFixed(1)}%</td>
                  <td>{agent.tasksCompleted}</td>
                  <td>{agent.uptime}%</td>
                  <td>{formatClaw(agent.securityDeposit)}</td>
                  <td>{relativeTime(agent.lastHeartbeat)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderDetailModal() {
    if (!selectedAgent) return null;
    const agent = selectedAgent;
    const status = agentStatus(agent);
    const pct = agent.reputation ? reputationPercent(agent.reputation.avgRatingBps) : 0;
    const endorsements = agent.reputation ? parseInt(agent.reputation.endorsementCount) : 0;
    const totalRatings = agent.reputation ? parseInt(agent.reputation.totalRatings) : 0;

    return (
      <div className="agent-detail-overlay" data-testid="agent-detail" onClick={closeDetail}>
        <div className="agent-detail-panel" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Agent Detail</h2>
            <button
              onClick={closeDetail}
              style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: '1.25rem', cursor: 'pointer', padding: '4px 8px' }}
              aria-label="Close detail"
            >
              X
            </button>
          </div>

          {/* Header */}
          <div className="agent-header" style={{ marginBottom: '1rem' }}>
            <span className={`agent-status ${status}`} />
            <span className="agent-name" style={{ fontSize: '1.25rem' }}>{agent.name || 'Unnamed Agent'}</span>
            <span className={`badge ${status === 'active' ? 'success' : status === 'idle' ? 'warning' : 'error'}`} style={{ marginLeft: 'auto' }}>
              {statusLabel(status)}
            </span>
          </div>

          {/* Full address */}
          <div style={{ marginBottom: '1rem' }}>
            <span className="agent-stat-label">Address</span>
            <div className="mono" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
              {agent.address}
              <button
                onClick={() => handleCopy(agent.address)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', marginLeft: '0.5rem', fontSize: '0.75rem' }}
              >
                {copiedAddr === agent.address ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Capabilities */}
          <div style={{ marginBottom: '1rem' }}>
            <span className="agent-stat-label">Capabilities</span>
            <div className="capability-badges" style={{ marginTop: '0.25rem' }}>
              {(agent.supportedTools || []).map((tool, j) => (
                <span key={j} className="capability-badge" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                  {tool}
                </span>
              ))}
              {(!agent.supportedTools || agent.supportedTools.length === 0) && (
                <span style={{ opacity: 0.5, fontSize: '0.85rem' }}>None listed</span>
              )}
            </div>
          </div>

          {/* Reputation breakdown */}
          <div style={{ marginBottom: '1rem' }}>
            <span className="agent-stat-label">Reputation Breakdown</span>
            <div className="agent-stats" style={{ marginTop: '0.5rem' }}>
              <div>
                <div className="agent-stat-label">Rating</div>
                <div className="agent-stat-value">{pct.toFixed(1)}%</div>
              </div>
              <div>
                <div className="agent-stat-label">Endorsements</div>
                <div className="agent-stat-value">{endorsements}</div>
              </div>
              <div>
                <div className="agent-stat-label">Total Ratings</div>
                <div className="agent-stat-value">{totalRatings}</div>
              </div>
            </div>
            {renderReputationBar(agent)}
          </div>

          {/* Key stats */}
          <div className="agent-stats" style={{ marginBottom: '1rem' }}>
            <div>
              <div className="agent-stat-label">Tasks Completed</div>
              <div className="agent-stat-value">{agent.tasksCompleted}</div>
            </div>
            <div>
              <div className="agent-stat-label">Uptime</div>
              <div className="agent-stat-value">{agent.uptime}%</div>
            </div>
            <div>
              <div className="agent-stat-label">Deposit</div>
              <div className="agent-stat-value">{formatClaw(agent.securityDeposit)}</div>
            </div>
          </div>

          <div className="agent-stats" style={{ marginBottom: '1rem' }}>
            <div>
              <div className="agent-stat-label">Total Earnings</div>
              <div className="agent-stat-value">{formatClaw(agent.rewards)}</div>
            </div>
            <div>
              <div className="agent-stat-label">Registered</div>
              <div className="agent-stat-value" style={{ fontSize: '0.85rem' }}>{agent.registeredAt ? new Date(agent.registeredAt).toLocaleDateString() : 'N/A'}</div>
            </div>
            <div>
              <div className="agent-stat-label">Last Heartbeat</div>
              <div className="agent-stat-value" style={{ fontSize: '0.85rem' }}>{relativeTime(agent.lastHeartbeat)}</div>
            </div>
          </div>

          {/* Endpoint */}
          {agent.endpoint && (
            <div style={{ marginBottom: '1rem' }}>
              <span className="agent-stat-label">Endpoint</span>
              <div className="mono" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{agent.endpoint}</div>
            </div>
          )}

          {/* Liveness status */}
          <div style={{ marginBottom: '1rem' }}>
            <span className="agent-stat-label">Liveness Status</span>
            <div data-testid="heartbeat-chart" style={{ marginTop: '0.5rem' }}>
              {agent.liveness ? (
                <div className="agent-stats">
                  <div>
                    <div className="agent-stat-label">Health</div>
                    <div className="agent-stat-value">
                      <span className={`badge ${agent.liveness.isHealthy ? 'success' : 'error'}`}>
                        {agent.liveness.isHealthy ? 'Healthy' : 'Unhealthy'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="agent-stat-label">Uptime Blocks</div>
                    <div className="agent-stat-value">{agent.liveness.uptimeBlocks.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="agent-stat-label">Last Heartbeat</div>
                    <div className="agent-stat-value" style={{ fontSize: '0.85rem' }}>
                      {agent.liveness.lastHeartbeat ? relativeTime(agent.liveness.lastHeartbeat) : 'Never'}
                    </div>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '0.25rem' }}>No liveness data available.</p>
              )}
            </div>
          </div>

          {/* Task history */}
          <div style={{ marginBottom: '1rem' }}>
            <span className="agent-stat-label">Recent Tasks</span>
            {taskHistoryLoading ? (
              <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '0.25rem' }}>Loading tasks...</p>
            ) : taskHistory.length === 0 ? (
              <p style={{ fontSize: '0.85rem', opacity: 0.6, marginTop: '0.25rem' }}>No task history available.</p>
            ) : (
              <div style={{ marginTop: '0.25rem' }}>
                {taskHistory.map((task) => (
                  <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    <span>{task.description || `Task #${task.id}`}</span>
                    <span className={`badge ${task.status === 'completed' ? 'success' : task.status === 'failed' ? 'error' : 'warning'}`}>
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delegate task form */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Delegate Task</h3>

            {!wallet?.connected ? (
              <div>
                <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Connect your wallet to delegate a task.</p>
                <button className="btn-outline" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                  {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Not Found'}
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleDelegateTask(agent.address);
                }}
              >
                <div style={{ marginBottom: '0.75rem' }}>
                  <label>Task Description *</label>
                  <textarea
                    value={delegateDesc}
                    onChange={(e) => setDelegateDesc(e.target.value)}
                    placeholder="Describe the task..."
                    rows={2}
                    required
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label>Budget (CLAW) *</label>
                    <input
                      type="number"
                      value={delegateBudget}
                      onChange={(e) => setDelegateBudget(e.target.value)}
                      placeholder="10"
                      required
                      min="1"
                    />
                  </div>
                  <div>
                    <label>Deadline</label>
                    <select value={delegateDeadline} onChange={(e) => setDelegateDeadline(e.target.value)}>
                      <option value="1h">1 hour</option>
                      <option value="6h">6 hours</option>
                      <option value="24h">24 hours</option>
                      <option value="7d">7 days</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label>Quality Tier</label>
                  <select value={delegateQuality} onChange={(e) => setDelegateQuality(e.target.value)}>
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>

                <button type="submit" disabled={delegating} style={{ width: '100%' }}>
                  {delegating ? 'Delegating...' : 'Delegate Task'}
                </button>
              </form>
            )}

            {delegateStatus && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                  background: delegateStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: delegateStatus.type === 'success' ? '#22c55e' : '#ef4444',
                  fontSize: '0.85rem',
                }}
              >
                {delegateStatus.msg}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Main render ----

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Agent Registry</h1>
        <span
          className="badge info"
          style={{ fontSize: '0.85rem', padding: '4px 10px' }}
          data-testid="agent-count-badge"
        >
          {agents.length} agent{agents.length !== 1 ? 's' : ''}
        </span>
      </div>
      <p className="page-subtitle">Browse registered AI agents, view reputation scores, and register your own on-chain.</p>

      {/* Search + Controls */}
      <div className="agent-controls" data-testid="agent-controls">
        <div className="agent-search-wrap">
          <input
            type="text"
            placeholder="Search by name, address, or capability..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="agent-search"
            style={{ width: '100%' }}
          />
        </div>

        <div className="agent-filters" data-testid="agent-filters">
          {/* Filter chips */}
          <div className="filter-chips">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                className={`filter-chip ${statusFilter === f ? 'active' : ''}`}
                onClick={() => setStatusFilter(f)}
                data-testid={`filter-${f}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={{ fontSize: '0.85rem' }}
            data-testid="agent-sort"
          >
            <option value="newest">Newest</option>
            <option value="reputation">Highest Reputation</option>
            <option value="tasks">Most Tasks Completed</option>
          </select>

          {/* View toggle */}
          <div className="view-toggle" data-testid="view-toggle">
            <button
              className={viewMode === 'card' ? 'active' : ''}
              onClick={() => setViewMode('card')}
              data-testid="view-card"
            >
              Cards
            </button>
            <button
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => setViewMode('table')}
              data-testid="view-table"
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading" data-testid="loading">
          <div className="spinner" />
          <p>Loading agents...</p>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="card" data-testid="empty-state">
          <p style={{ textAlign: 'center', padding: '2rem 0' }}>
            {agents.length === 0
              ? 'No agents registered yet. Be the first to register an agent!'
              : 'No agents match your search criteria.'}
          </p>
        </div>
      ) : viewMode === 'card' ? (
        <div className="agent-grid" data-testid="agent-grid">
          {filteredAgents.map((agent) => renderAgentCard(agent))}
        </div>
      ) : (
        renderTableView()
      )}

      {/* Register Agent Section */}
      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }} data-testid="register-section">
        <h2 style={{ marginBottom: '1rem' }}>Register New Agent</h2>
        <div className="card" style={{ maxWidth: '640px' }}>
          {!wallet?.connected ? (
            <div>
              <p style={{ marginBottom: '0.75rem' }}>Connect your wallet to register an agent on-chain.</p>
              <button onClick={handleConnect} disabled={!isKeplrAvailable()}>
                {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Not Found'}
              </button>
              {!isKeplrAvailable() && (
                <p style={{ marginTop: '0.5rem', opacity: 0.7, fontSize: '0.85rem' }}>
                  Install the Keplr browser extension to register agents.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleRegister}>
              <p style={{ marginBottom: '1rem' }}>
                Connected: <strong>{shortAddr(wallet.address)}</strong>
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <label>Agent Name *</label>
                <input
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="my-ai-agent"
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Endpoint URL *</label>
                <input
                  type="url"
                  value={regEndpoint}
                  onChange={(e) => setRegEndpoint(e.target.value)}
                  placeholder="https://agent.example.com/api"
                  required
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Capabilities (comma-separated)</label>
                <input
                  type="text"
                  value={regTools}
                  onChange={(e) => setRegTools(e.target.value)}
                  placeholder="text-generation, image-gen, code-review"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Description</label>
                <textarea
                  value={regDescription}
                  onChange={(e) => setRegDescription(e.target.value)}
                  placeholder="Describe what your agent does..."
                  rows={3}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Security Deposit (uclaw)</label>
                <input
                  type="number"
                  value={regDeposit}
                  onChange={(e) => setRegDeposit(e.target.value)}
                  placeholder="100000000"
                  min="0"
                />
              </div>

              <button type="submit" disabled={submitting}>
                {submitting ? 'Registering...' : 'Register Agent'}
              </button>
            </form>
          )}

          {regStatus && (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                background: regStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: regStatus.type === 'success' ? '#22c55e' : '#ef4444',
              }}
            >
              {regStatus.msg}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {renderDetailModal()}
    </div>
  );
}
