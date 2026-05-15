import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useDocTitle from '../hooks/useDocTitle.ts';
import { formatClaw, shortAddr, getModuleParams } from '../lib/chain';
import { chainConfig } from '../lib/config';
import { isKeplrAvailable, connectKeplr, signAndBroadcast, WalletState } from '../lib/wallet';
import VoteTallyBar from '../components/VoteTallyBar';

interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  status: string;
  deposit: string;
  yes_votes: string;
  no_votes: string;
  abstain_votes: string;
  no_with_veto_votes: string;
  submit_time: string;
  voting_end_time: string;
}

export default function Governance() {
  useDocTitle("Governance");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'proposals' | 'submit' | 'vote' | 'param-change'>('proposals');
  const [wallet, setWallet] = useState<WalletState | null>(null);

  // Submit proposal form.
  const [propTitle, setPropTitle] = useState('');
  const [propDescription, setPropDescription] = useState('');
  const [propDeposit, setPropDeposit] = useState('');
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Vote form.
  const [voteProposalId, setVoteProposalId] = useState('');
  const [voteOption, setVoteOption] = useState('yes');
  const [voteStatus, setVoteStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [voting, setVoting] = useState(false);

  // Param change form.
  const [paramModule, setParamModule] = useState('agent');
  const [currentParams, setCurrentParams] = useState<Record<string, string>>({});
  const [loadingParams, setLoadingParams] = useState(false);
  const [paramKey, setParamKey] = useState('');
  const [paramValue, setParamValue] = useState('');
  const [paramChanges, setParamChanges] = useState<{ key: string; value: string }[]>([]);
  const [paramDeposit, setParamDeposit] = useState('');
  const [paramStatus, setParamStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [submittingParam, setSubmittingParam] = useState(false);

  useEffect(() => {
    loadProposals();
  }, []);

  async function loadProposals() {
    try {
      const rest = chainConfig.restEndpoint.startsWith('http')
        ? chainConfig.restEndpoint
        : `${window.location.origin}${chainConfig.restEndpoint}`;
      const resp = await fetch(`${rest}/clawchain/governance/v1/proposals`);
      if (resp.ok) {
        const data = await resp.json();
        setProposals(data.proposals || []);
      }
    } catch (e) {
      console.error('Failed to load proposals:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      setSubmitStatus({ type: 'error', msg: e.message });
    }
  }

  async function handleSubmitProposal(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setSubmitting(true);
    setSubmitStatus(null);

    try {
      const depositUclaw = String(Math.floor(parseFloat(propDeposit) * 1_000_000));

      const msg = {
        type: 'clawchain/governance/MsgSubmitProposal',
        value: {
          proposer: wallet.address,
          title: propTitle,
          description: propDescription,
          deposit: depositUclaw,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Submit governance proposal');

      if (result.code === 0) {
        setSubmitStatus({ type: 'success', msg: `Proposal submitted! Tx: ${result.txHash}` });
        setPropTitle('');
        setPropDescription('');
        setPropDeposit('');
        loadProposals();
      } else {
        setSubmitStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setSubmitStatus({ type: 'error', msg: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setVoting(true);
    setVoteStatus(null);

    try {
      const msg = {
        type: 'clawchain/governance/MsgVote',
        value: {
          voter: wallet.address,
          proposal_id: voteProposalId,
          option: voteOption,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], `Vote ${voteOption} on proposal ${voteProposalId}`);

      if (result.code === 0) {
        setVoteStatus({ type: 'success', msg: `Vote cast! Tx: ${result.txHash}` });
        loadProposals();
      } else {
        setVoteStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setVoteStatus({ type: 'error', msg: e.message });
    } finally {
      setVoting(false);
    }
  }

  async function handleLoadParams() {
    setLoadingParams(true);
    try {
      const params = await getModuleParams(paramModule);
      setCurrentParams(params);
    } catch (e: any) {
      setParamStatus({ type: 'error', msg: e.message });
    } finally {
      setLoadingParams(false);
    }
  }

  function handleAddParamChange() {
    if (!paramKey.trim()) return;
    setParamChanges(prev => [...prev, { key: paramKey.trim(), value: paramValue }]);
    setParamKey('');
    setParamValue('');
  }

  async function handleSubmitParamChange(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address || paramChanges.length === 0) return;
    setSubmittingParam(true);
    setParamStatus(null);

    try {
      const depositUclaw = String(Math.floor(parseFloat(paramDeposit) * 1_000_000));

      const msg = {
        type: 'clawchain/governance/MsgSubmitParamChangeProposal',
        value: {
          proposer: wallet.address,
          module: paramModule,
          changes: paramChanges,
          deposit: depositUclaw,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Submit parameter change proposal');

      if (result.code === 0) {
        setParamStatus({ type: 'success', msg: `Parameter change proposal submitted! Tx: ${result.txHash}` });
        setParamChanges([]);
        setParamDeposit('');
        loadProposals();
      } else {
        setParamStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setParamStatus({ type: 'error', msg: e.message });
    } finally {
      setSubmittingParam(false);
    }
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      voting: 'badge-info',
      passed: 'badge-success',
      rejected: 'badge-error',
      pending: 'badge-warning',
    };
    return <span className={`badge ${colors[status] || ''}`}>{status}</span>;
  }

  function tallyBar(p: Proposal) {
    const y = parseInt(p.yes_votes || '0');
    const n = parseInt(p.no_votes || '0');
    const a = parseInt(p.abstain_votes || '0');
    const v = parseInt(p.no_with_veto_votes || '0');

    return (
      <VoteTallyBar
        tally={{ yes: y, no: n, abstain: a, noWithVeto: v }}
        compact
        showLegend={false}
        showStatus={false}
      />
    );
  }

  // Compute aggregate vote participation summary across all proposals
  function computeParticipation() {
    let totalYes = 0;
    let totalNo = 0;
    let totalAbstain = 0;
    let totalVeto = 0;
    let votingCount = 0;
    let passedCount = 0;
    let rejectedCount = 0;

    for (const p of proposals) {
      totalYes += parseInt(p.yes_votes || '0');
      totalNo += parseInt(p.no_votes || '0');
      totalAbstain += parseInt(p.abstain_votes || '0');
      totalVeto += parseInt(p.no_with_veto_votes || '0');
      if (p.status === 'voting' || p.status === 'voting_period') votingCount++;
      if (p.status === 'passed' || p.status === 'executed') passedCount++;
      if (p.status === 'rejected' || p.status === 'failed') rejectedCount++;
    }

    const totalVotes = totalYes + totalNo + totalAbstain + totalVeto;
    return { totalYes, totalNo, totalAbstain, totalVeto, totalVotes, votingCount, passedCount, rejectedCount };
  }

  return (
    <div>
      <h1>Governance</h1>
      <p className="subtitle">Submit proposals and vote on chain parameter changes.</p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button className={`btn ${tab === 'proposals' ? 'btn-primary' : ''}`} onClick={() => setTab('proposals')}>
          Proposals ({proposals.length})
        </button>
        <button className={`btn ${tab === 'submit' ? 'btn-primary' : ''}`} onClick={() => setTab('submit')}>
          Submit Proposal
        </button>
        <button className={`btn ${tab === 'vote' ? 'btn-primary' : ''}`} onClick={() => setTab('vote')}>
          Cast Vote
        </button>
        <button className={`btn ${tab === 'param-change' ? 'btn-primary' : ''}`} onClick={() => setTab('param-change')}>
          Parameter Change
        </button>
      </div>

      {tab === 'proposals' && (
        <>
          {loading ? (
            <p>Loading proposals...</p>
          ) : proposals.length === 0 ? (
            <div className="card"><p>No governance proposals yet. Be the first to submit one!</p></div>
          ) : (
            <>
              {/* Vote Participation Summary */}
              {(() => {
                const stats = computeParticipation();
                return (
                  <div className="card" style={{ marginBottom: '1.5rem' }} data-testid="vote-participation-summary">
                    <h3 style={{ marginBottom: '0.75rem' }}>Vote Participation</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{proposals.length}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>Total Proposals</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{stats.votingCount}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>Active Voting</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{stats.passedCount}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>Passed</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{stats.rejectedCount}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>Rejected</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalVotes.toLocaleString()}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>Total Votes Cast</div>
                      </div>
                    </div>
                    {stats.totalVotes > 0 && (
                      <VoteTallyBar
                        tally={{
                          yes: stats.totalYes,
                          no: stats.totalNo,
                          abstain: stats.totalAbstain,
                          noWithVeto: stats.totalVeto,
                        }}
                        showStatus={false}
                      />
                    )}
                  </div>
                );
              })()}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Title</th>
                      <th>Proposer</th>
                      <th>Status</th>
                      <th>Deposit</th>
                      <th>Tally</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposals.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/governance/${p.id}`}>{p.id}</Link>
                        </td>
                        <td>
                          <Link to={`/governance/${p.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            <strong>{p.title}</strong>
                          </Link>
                        </td>
                        <td>
                          <Link to={`/explorer/account/${p.proposer}`}>
                            {shortAddr(p.proposer)}
                          </Link>
                        </td>
                        <td>{statusBadge(p.status)}</td>
                        <td>{formatClaw(p.deposit)}</td>
                        <td>{tallyBar(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'submit' && (
        <div className="card" style={{ maxWidth: '600px' }}>
          <h3>Submit Proposal</h3>

          {!wallet?.connected ? (
            <div>
              <p>Connect your wallet to submit a governance proposal.</p>
              <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Not Found'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitProposal}>
              <p>Connected: <strong>{shortAddr(wallet.address)}</strong> | Balance: {formatClaw(wallet.balance)}</p>

              <div style={{ marginBottom: '1rem' }}>
                <label>Title *</label>
                <input
                  type="text" value={propTitle} onChange={e => setPropTitle(e.target.value)}
                  placeholder="Increase max agents per block" required style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Description *</label>
                <textarea
                  value={propDescription} onChange={e => setPropDescription(e.target.value)}
                  placeholder="Describe the proposed change and rationale..." rows={5} required
                  style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Deposit (CLAW) *</label>
                <input
                  type="number" step="0.000001" min="0.000001"
                  value={propDeposit} onChange={e => setPropDeposit(e.target.value)}
                  placeholder="100" required style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Proposal'}
              </button>
            </form>
          )}

          {submitStatus && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem',
              background: submitStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: submitStatus.type === 'success' ? '#22c55e' : '#ef4444' }}>
              {submitStatus.msg}
            </div>
          )}
        </div>
      )}

      {tab === 'vote' && (
        <div className="card" style={{ maxWidth: '500px' }}>
          <h3>Cast Vote</h3>

          {!wallet?.connected ? (
            <div>
              <p>Connect your wallet to vote on proposals.</p>
              <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Not Found'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleVote}>
              <p>Connected: <strong>{shortAddr(wallet.address)}</strong></p>

              <div style={{ marginBottom: '1rem' }}>
                <label>Proposal ID *</label>
                <input
                  type="number" min="0" value={voteProposalId} onChange={e => setVoteProposalId(e.target.value)}
                  placeholder="0" required style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Vote *</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {['yes', 'no', 'abstain'].map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                      <input type="radio" name="vote" value={opt} checked={voteOption === opt}
                        onChange={() => setVoteOption(opt)} />
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <button className="btn btn-primary" type="submit" disabled={voting}>
                {voting ? 'Voting...' : 'Cast Vote'}
              </button>
            </form>
          )}

          {voteStatus && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem',
              background: voteStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: voteStatus.type === 'success' ? '#22c55e' : '#ef4444' }}>
              {voteStatus.msg}
            </div>
          )}
        </div>
      )}

      {tab === 'param-change' && (
        <div className="card" style={{ maxWidth: '600px' }}>
          <h3>Parameter Change Proposal</h3>

          {!wallet?.connected ? (
            <div>
              <p>Connect your wallet to submit a parameter change proposal.</p>
              <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
                {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Not Found'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitParamChange}>
              <p>Connected: <strong>{shortAddr(wallet.address)}</strong> | Balance: {formatClaw(wallet.balance)}</p>

              <div style={{ marginBottom: '1rem' }}>
                <label>Module *</label>
                <select
                  value={paramModule} onChange={e => setParamModule(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem' }}
                >
                  <option value="agent">agent</option>
                  <option value="privacy">privacy</option>
                  <option value="marketplace">marketplace</option>
                  <option value="modelregistry">modelregistry</option>
                  <option value="messaging">messaging</option>
                  <option value="reputation">reputation</option>
                  <option value="governance">governance</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <button type="button" className="btn" onClick={handleLoadParams} disabled={loadingParams}>
                  {loadingParams ? 'Loading...' : 'Load Current Params'}
                </button>
              </div>

              {Object.keys(currentParams).length > 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)' }}>
                  <strong>Current Parameters ({paramModule}):</strong>
                  <table style={{ width: '100%', marginTop: '0.5rem' }}>
                    <thead>
                      <tr><th style={{ textAlign: 'left' }}>Key</th><th style={{ textAlign: 'left' }}>Value</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(currentParams).map(([k, v]) => (
                        <tr key={k}><td>{k}</td><td>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label>New Parameter Values</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <input
                    type="text" value={paramKey} onChange={e => setParamKey(e.target.value)}
                    placeholder="Parameter key" style={{ flex: 1, padding: '0.5rem' }}
                  />
                  <input
                    type="text" value={paramValue} onChange={e => setParamValue(e.target.value)}
                    placeholder="New value" style={{ flex: 1, padding: '0.5rem' }}
                  />
                  <button type="button" className="btn" onClick={handleAddParamChange}>
                    Add Parameter
                  </button>
                </div>
              </div>

              {paramChanges.length > 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)' }}>
                  <strong>Queued Changes:</strong>
                  <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                    {paramChanges.map((c, i) => (
                      <li key={i}>
                        <strong>{c.key}</strong> = {c.value}
                        <button type="button" style={{ marginLeft: '0.5rem', cursor: 'pointer', background: 'none', border: 'none', color: '#ef4444' }}
                          onClick={() => setParamChanges(prev => prev.filter((_, idx) => idx !== i))}>
                          remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label>Deposit (CLAW) *</label>
                <input
                  type="number" step="0.000001" min="0.000001"
                  value={paramDeposit} onChange={e => setParamDeposit(e.target.value)}
                  placeholder="100" required style={{ width: '100%', padding: '0.5rem' }}
                />
              </div>

              <button className="btn btn-primary" type="submit" disabled={submittingParam || paramChanges.length === 0}>
                {submittingParam ? 'Submitting...' : 'Submit Parameter Change Proposal'}
              </button>
            </form>
          )}

          {paramStatus && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem',
              background: paramStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: paramStatus.type === 'success' ? '#22c55e' : '#ef4444' }}>
              {paramStatus.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
