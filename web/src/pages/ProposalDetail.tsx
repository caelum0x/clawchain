import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatClaw, shortAddr } from '../lib/chain';
import { chainConfig } from '../lib/config';
import { isKeplrAvailable, connectKeplr, signAndBroadcast, type WalletState } from '../lib/wallet';
import Breadcrumbs from '../components/Breadcrumbs';
import VoteTallyBar from '../components/VoteTallyBar';
import DepositProgress from '../components/DepositProgress';
import useDocTitle from '../hooks/useDocTitle.ts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ParamChange {
  module: string;
  key: string;
  value: string;
}

interface Tally {
  yes_count: string;
  no_count: string;
  abstain_count: string;
  no_with_veto_count: string;
}

interface ProposalFull {
  id: string;
  proposer: string;
  title: string;
  description: string;
  status: string;
  deposit: string;
  denom: string;
  voting_end_time: string;
  tally: Tally;
  param_changes: ParamChange[];
}

type ProposalStatus =
  | 'deposit_period'
  | 'voting_period'
  | 'passed'
  | 'rejected'
  | 'executed'
  | 'failed';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  deposit_period: { bg: 'rgba(234,179,8,0.15)', fg: '#eab308', label: 'Deposit Period' },
  voting_period:  { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6', label: 'Voting Period' },
  passed:         { bg: 'rgba(34,197,94,0.15)',  fg: '#22c55e', label: 'Passed' },
  rejected:       { bg: 'rgba(239,68,68,0.15)',  fg: '#ef4444', label: 'Rejected' },
  executed:       { bg: 'rgba(34,197,94,0.15)',  fg: '#22c55e', label: 'Executed' },
  failed:         { bg: 'rgba(239,68,68,0.15)',  fg: '#ef4444', label: 'Failed' },
};

function statusBadge(status: string) {
  const s = STATUS_COLORS[status] ?? { bg: 'rgba(255,255,255,0.1)', fg: '#ccc', label: status };
  return (
    <span style={{
      display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '9999px',
      fontSize: '0.85rem', fontWeight: 600, background: s.bg, color: s.fg,
    }}>
      {s.label}
    </span>
  );
}

/** Map status string to a timeline step index (0-3). */
function statusToStep(status: string): number {
  switch (status) {
    case 'deposit_period': return 1;
    case 'voting_period':  return 2;
    case 'passed':
    case 'executed':
    case 'rejected':
    case 'failed':         return 3;
    default:               return 0;
  }
}

function countdownText(votingEndTime: string): string {
  const end = new Date(votingEndTime).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return 'Voting ended';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ') + ' remaining';
}

/** Very simple markdown-ish renderer: headers, bold, lists, code blocks. */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  function flushCode() {
    if (codeBuffer.length > 0) {
      elements.push(
        <pre key={`code-${elements.length}`} style={{
          background: 'rgba(255,255,255,0.06)', padding: '1rem', borderRadius: '0.5rem',
          overflowX: 'auto', fontSize: '0.85rem', lineHeight: 1.5, margin: '0.5rem 0',
        }}>
          <code>{codeBuffer.join('\n')}</code>
        </pre>,
      );
      codeBuffer = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ margin: '1rem 0 0.25rem' }}>{line.slice(4)}</h4>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ margin: '1rem 0 0.25rem' }}>{line.slice(3)}</h3>);
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ margin: '1rem 0 0.25rem' }}>{line.slice(2)}</h2>);
      continue;
    }

    // List items
    if (/^[-*] /.test(line.trimStart())) {
      const content = line.trimStart().slice(2);
      elements.push(
        <div key={i} style={{ paddingLeft: '1.25rem', position: 'relative', margin: '0.15rem 0' }}>
          <span style={{ position: 'absolute', left: '0.25rem' }}>&bull;</span>
          <span>{boldify(content)}</span>
        </div>,
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '0.5rem' }} />);
      continue;
    }

    // Regular paragraph
    elements.push(<p key={i} style={{ margin: '0.25rem 0', lineHeight: 1.6 }}>{boldify(line)}</p>);
  }

  // Flush any unclosed code block
  flushCode();

  return <>{elements}</>;
}

/** Replace **text** with <strong>. */
function boldify(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const QUORUM_THRESHOLD = 0.334;   // 33.4%

const VOTE_OPTIONS: Record<string, number> = {
  'Yes': 1,
  'Abstain': 2,
  'No': 3,
  'No With Veto': 4,
};

export default function ProposalDetail() {
  useDocTitle("Proposal Detail");
  const { id } = useParams<{ id: string }>();
  const [proposal, setProposal] = useState<ProposalFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [voting, setVoting] = useState(false);

  useEffect(() => {
    if (id) loadProposal(id);
  }, [id]);

  async function loadProposal(proposalId: string) {
    setLoading(true);
    setError(null);
    try {
      const rest = chainConfig.restEndpoint.startsWith('http')
        ? chainConfig.restEndpoint
        : `${window.location.origin}${chainConfig.restEndpoint}`;
      const resp = await fetch(`${rest}/clawchain/governance/v1/proposal/${proposalId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const p = data.proposal ?? data;
      setProposal({
        id: p.id ?? proposalId,
        proposer: p.proposer ?? '',
        title: p.title ?? '',
        description: p.description ?? '',
        status: p.status ?? 'deposit_period',
        deposit: p.deposit?.amount ?? p.deposit ?? '0',
        denom: p.deposit?.denom ?? 'uclaw',
        voting_end_time: p.voting_end_time ?? '',
        tally: {
          yes_count: p.tally?.yes_count ?? p.yes_votes ?? '0',
          no_count: p.tally?.no_count ?? p.no_votes ?? '0',
          abstain_count: p.tally?.abstain_count ?? p.abstain_votes ?? '0',
          no_with_veto_count: p.tally?.no_with_veto_count ?? '0',
        },
        param_changes: (p.param_changes ?? []).map((c: any) => ({
          module: c.module ?? '',
          key: c.key ?? '',
          value: c.value ?? '',
        })),
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to load proposal');
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectWallet() {
    setTxStatus(null);
    try {
      const state = await connectKeplr();
      setWallet(state);
    } catch (e: any) {
      setTxStatus({ msg: e.message ?? 'Failed to connect wallet', type: 'error' });
    }
  }

  async function handleVote(option: string) {
    if (!wallet?.address) {
      setTxStatus({ msg: 'Connect your wallet before voting.', type: 'error' });
      return;
    }
    setVoting(true);
    setTxStatus(null);
    try {
      const msg = {
        type: 'cosmos-sdk/MsgVote',
        value: {
          proposal_id: id,
          voter: wallet.address,
          option: VOTE_OPTIONS[option] ?? 1,
        },
      };
      const result = await signAndBroadcast(wallet.address, [msg], `Vote ${option} on proposal #${id}`);
      if (result.code !== 0) {
        setTxStatus({ msg: `Transaction failed (code ${result.code})`, type: 'error' });
      } else {
        setTxStatus({ msg: `Vote "${option}" submitted successfully. Tx: ${result.txHash}`, type: 'success' });
      }
    } catch (e: any) {
      setTxStatus({ msg: e.message ?? 'Failed to submit vote', type: 'error' });
    } finally {
      setVoting(false);
    }
  }

  /* ---------- Render ---------- */

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading proposal...</p>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div>
        <Link to="/governance" style={{ color: '#3b82f6', textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>
          &larr; Back to Governance
        </Link>
        <div className="card" style={{ marginTop: '1rem' }}>
          <p style={{ color: '#ef4444' }}>{error ?? 'Proposal not found.'}</p>
        </div>
      </div>
    );
  }

  // Tally numbers
  const yes   = parseInt(proposal.tally.yes_count   || '0');
  const no    = parseInt(proposal.tally.no_count    || '0');
  const abstain = parseInt(proposal.tally.abstain_count || '0');
  const veto  = parseInt(proposal.tally.no_with_veto_count || '0');
  const totalVotes = yes + no + abstain + veto;

  // Deposit
  const depositAmount = parseInt(proposal.deposit || '0');
  const minDeposit = 100_000_000; // 100 CLAW in uclaw (example minimum)

  // Timeline
  const currentStep = statusToStep(proposal.status);
  const steps = ['Submit', 'Deposit Period', 'Voting Period', 'Execution'];

  return (
    <div>
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: "Governance", to: "/governance" },
        { label: `Proposal #${proposal.id}` },
      ]} />

      {/* ---- Header ---- */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          <h1 style={{ margin: 0 }}>Proposal #{proposal.id} &mdash; {proposal.title}</h1>
          {statusBadge(proposal.status)}
        </div>
        {proposal.proposer && (
          <p style={{ color: 'var(--text2)', margin: 0 }}>
            Proposer:{' '}
            <Link to={`/explorer/account/${proposal.proposer}`} style={{ color: '#3b82f6' }}>
              {shortAddr(proposal.proposer)}
            </Link>
          </p>
        )}
      </div>

      {/* ---- Timeline ---- */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Timeline</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {steps.map((label, idx) => {
            const isActive = idx <= currentStep;
            const isCurrent = idx === currentStep;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : 'none' }}>
                {/* Circle */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                  border: isCurrent ? '2px solid #60a5fa' : '2px solid transparent',
                  color: isActive ? '#fff' : 'var(--text2)',
                  fontWeight: 700, fontSize: '0.8rem',
                }}>
                  {idx + 1}
                </div>
                {/* Label */}
                <span style={{
                  marginLeft: '0.4rem', fontSize: '0.8rem', whiteSpace: 'nowrap',
                  fontWeight: isCurrent ? 700 : 400,
                  color: isActive ? '#fff' : 'var(--text2)',
                }}>
                  {label}
                </span>
                {/* Connector bar */}
                {idx < steps.length - 1 && (
                  <div style={{
                    flex: 1, height: 3, margin: '0 0.5rem',
                    background: idx < currentStep ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                    borderRadius: 2,
                  }} />
                )}
              </div>
            );
          })}
        </div>
        {/* Countdown */}
        {proposal.status === 'voting_period' && proposal.voting_end_time && (
          <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#3b82f6' }}>
            Voting ends: {new Date(proposal.voting_end_time).toLocaleString()} ({countdownText(proposal.voting_end_time)})
          </p>
        )}
      </div>

      {/* ---- Description ---- */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Description</h3>
        <div style={{ color: 'var(--text2)' }}>
          {proposal.description ? renderMarkdown(proposal.description) : <p>No description provided.</p>}
        </div>
      </div>

      {/* ---- Param Changes ---- */}
      {proposal.param_changes.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Parameter Changes</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Key</th>
                  <th>New Value</th>
                </tr>
              </thead>
              <tbody>
                {proposal.param_changes.map((c, i) => (
                  <tr key={i}>
                    <td><code>{c.module}</code></td>
                    <td><code>{c.key}</code></td>
                    <td><code>{c.value}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Vote Tally ---- */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Vote Tally</h3>

        {totalVotes === 0 ? (
          <p style={{ opacity: 0.5 }}>No votes cast yet.</p>
        ) : (
          <VoteTallyBar
            tally={{ yes, no, abstain, noWithVeto: veto }}
            quorumThreshold={QUORUM_THRESHOLD}
          />
        )}
      </div>

      {/* ---- Deposit Info ---- */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Deposit</h3>
        <DepositProgress
          currentAmount={depositAmount}
          requiredAmount={minDeposit}
          formatAmount={formatClaw}
        />
      </div>

      {/* ---- Vote Action ---- */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>Cast Your Vote</h3>

        {/* Wallet connect */}
        {!wallet?.connected ? (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '0.75rem' }}>
              {isKeplrAvailable()
                ? 'Connect your Keplr wallet to vote on this proposal.'
                : 'Install the Keplr browser extension to vote on this proposal.'}
            </p>
            <button className="btn btn-primary" onClick={handleConnectWallet} disabled={!isKeplrAvailable()}>
              Connect Wallet
            </button>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '1rem' }}>
            Connected as <strong>{shortAddr(wallet.address)}</strong>
          </p>
        )}

        {/* Tx status */}
        {txStatus && (
          <div style={{
            marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem',
            background: txStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: txStatus.type === 'success' ? '#22c55e' : '#ef4444',
          }}>
            {txStatus.msg}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 600 }}
            onClick={() => handleVote('Yes')} disabled={voting}>
            Yes
          </button>
          <button className="btn" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}
            onClick={() => handleVote('No')} disabled={voting}>
            No
          </button>
          <button className="btn" style={{ background: 'rgba(163,163,163,0.15)', color: '#a3a3a3', fontWeight: 600 }}
            onClick={() => handleVote('Abstain')} disabled={voting}>
            Abstain
          </button>
          <button className="btn" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', fontWeight: 600 }}
            onClick={() => handleVote('No With Veto')} disabled={voting}>
            No With Veto
          </button>
        </div>
      </div>
    </div>
  );
}

