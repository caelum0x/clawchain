import { useEffect, useState, useCallback, useMemo } from 'react';
import useDocTitle from '../hooks/useDocTitle.ts';
import {
  getBalances,
  getTxPageByAddress,
  getDelegations,
  formatClaw,
  shortAddr,
  shortHash,
  timeAgo,
  type AccountBalance,
  type Tx,
  type TxMessage,
  type Delegation,
} from '../lib/chain';
import CopyButton from '../components/CopyButton.tsx';
import {
  isKeplrAvailable,
  connectKeplr,
  disconnectWallet,
  signAndBroadcast,
  type WalletState,
} from '../lib/wallet';
import { chainConfig } from '../lib/config';
import { useToast } from '../hooks/useToast';
import useAddressBook from '../hooks/useAddressBook';

type Tab = 'overview' | 'send' | 'history' | 'staking';

type TxTypeFilter = 'all' | 'transfers' | 'staking' | 'governance' | 'agent' | 'privacy' | 'marketplace';
type TxStatusFilter = 'all' | 'success' | 'failed';

const TX_TYPE_MATCHERS: Record<Exclude<TxTypeFilter, 'all'>, string[]> = {
  transfers: ['MsgSend', 'MsgMultiSend'],
  staking: ['MsgDelegate', 'MsgUndelegate', 'MsgBeginRedelegate'],
  governance: ['MsgVote', 'MsgSubmitProposal', 'MsgDeposit'],
  agent: ['MsgRegisterAgent', 'MsgDeregisterAgent', 'MsgDelegateTask', 'MsgAcceptTask', 'MsgCompleteTask', 'MsgAgentAction', 'MsgAgentHeartbeat', 'MsgSubmitIntent', 'MsgRespondIntent', 'MsgFinalizeIntent', 'MsgNegotiate'],
  privacy: ['MsgShield', 'MsgUnshield', 'MsgPrivateTransfer', 'MsgBatchPrivateTransfer', 'MsgRegisterViewKey'],
  marketplace: ['MsgListSkill', 'MsgPurchaseSkill', 'MsgSubmitComputeJob', 'MsgLeaseComputeResource', 'MsgRegisterComputeResource'],
};

function txMatchesType(tx: Tx, filter: TxTypeFilter): boolean {
  if (filter === 'all') return true;
  const matchers = TX_TYPE_MATCHERS[filter];
  return tx.messages.some(m => {
    const shortName = m.typeUrl.split('.').pop() ?? '';
    return matchers.some(match => shortName.includes(match));
  });
}

function decodeMsgSummary(msg: TxMessage, walletAddr: string): { text: string; icon: string } {
  const typeShort = msg.typeUrl.split('.').pop() ?? msg.typeUrl;
  const val = msg.value ?? {};

  if (typeShort.includes('MsgSend')) {
    const amount = (val.amount as Array<{ denom?: string; amount?: string }> | undefined)?.[0];
    const amtStr = amount ? formatClaw(amount.amount ?? '0') : '';
    const to = val.to_address as string | undefined ?? val.toAddress as string | undefined ?? '';
    const from = val.from_address as string | undefined ?? val.fromAddress as string | undefined ?? '';

    if (from === walletAddr && to === walletAddr) {
      return { text: `Self-sent ${amtStr}`, icon: '\u21C4' };
    }
    if (from === walletAddr) {
      return { text: `Sent ${amtStr} to ${shortAddr(to)}`, icon: '\u2191' };
    }
    return { text: `Received ${amtStr} from ${shortAddr(from)}`, icon: '\u2193' };
  }

  if (typeShort.includes('MsgDelegate')) {
    const amount = val.amount as { amount?: string } | undefined;
    const amtStr = amount ? formatClaw(amount.amount ?? '0') : '';
    return { text: `Delegated ${amtStr} to validator`, icon: '\u2191' };
  }

  if (typeShort.includes('MsgUndelegate')) {
    const amount = val.amount as { amount?: string } | undefined;
    const amtStr = amount ? formatClaw(amount.amount ?? '0') : '';
    return { text: `Undelegated ${amtStr}`, icon: '\u2193' };
  }

  if (typeShort.includes('MsgBeginRedelegate')) {
    return { text: 'Redelegated stake', icon: '\u21C4' };
  }

  if (typeShort.includes('MsgVote')) {
    return { text: `Voted on proposal #${val.proposal_id ?? val.proposalId ?? '?'}`, icon: '\u21C4' };
  }

  if (typeShort.includes('MsgSubmitProposal')) {
    return { text: 'Submitted governance proposal', icon: '\u2191' };
  }

  if (typeShort.includes('MsgShield')) {
    return { text: 'Shielded tokens (private)', icon: '\u2191' };
  }

  if (typeShort.includes('MsgUnshield')) {
    return { text: 'Unshielded tokens (public)', icon: '\u2193' };
  }

  if (typeShort.includes('MsgPrivateTransfer')) {
    return { text: 'Private transfer', icon: '\u21C4' };
  }

  if (typeShort.includes('MsgRegisterAgent')) {
    return { text: 'Registered agent', icon: '\u2191' };
  }

  if (typeShort.includes('MsgDelegateTask')) {
    return { text: 'Delegated task to agent', icon: '\u2191' };
  }

  if (typeShort.includes('MsgCompleteTask')) {
    return { text: 'Completed task', icon: '\u2193' };
  }

  if (typeShort.includes('MsgListSkill')) {
    return { text: 'Listed skill on marketplace', icon: '\u2191' };
  }

  if (typeShort.includes('MsgPurchaseSkill') || typeShort.includes('MsgPurchase')) {
    return { text: 'Purchased skill', icon: '\u2193' };
  }

  // Default: short name from typeUrl
  const name = typeShort.replace(/^Msg/, '');
  return { text: name, icon: '\u21C4' };
}

function buildCsvContent(txList: Tx[]): string {
  const header = 'Hash,Height,Time,Status,Type,Gas Used,Gas Wanted,Memo';
  const rows = txList.map(tx => {
    const status = tx.code === 0 ? 'Success' : `Failed(${tx.code})`;
    const msgType = tx.messages[0]?.typeUrl
      ? (tx.messages[0].typeUrl.split('.').pop() ?? '').replace(/^Msg/, '')
      : '-';
    const time = tx.timestamp ?? '';
    // Escape memo for CSV (double-quote fields that contain commas, quotes, or newlines)
    const escapedMemo = `"${(tx.memo ?? '').replace(/"/g, '""')}"`;
    return `${tx.hash},${tx.height},${time},${status},${msgType},${tx.gasUsed},${tx.gasWanted},${escapedMemo}`;
  });
  return [header, ...rows].join('\n');
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Wallet() {
  useDocTitle("Wallet");
  const { addToast } = useToast();
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  // Send form.
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendMemo, setSendMemo] = useState('');
  const [sendStatus, setSendStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [sending, setSending] = useState(false);

  // Address book picker.
  const { contacts: addressBookContacts, searchContacts: searchAddressBook } = useAddressBook();
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [addressPickerQuery, setAddressPickerQuery] = useState('');

  const filteredAddressBookContacts = addressPickerQuery
    ? searchAddressBook(addressPickerQuery)
    : addressBookContacts;

  // History filters.
  const [historyTypeFilter, setHistoryTypeFilter] = useState<TxTypeFilter>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<TxStatusFilter>('all');
  const [historyMemoSearch, setHistoryMemoSearch] = useState('');

  const loadData = useCallback(async (address: string, page = 1) => {
    setLoading(true);
    try {
      const [bals, txResult, dels] = await Promise.all([
        getBalances(address),
        getTxPageByAddress(address, page, 10),
        getDelegations(address),
      ]);
      setBalances(bals);
      setTxs(txResult.txs);
      setTxTotal(txResult.total);
      setDelegations(dels);
    } catch (e) {
      console.error('Failed to load wallet data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
      loadData(state.address);
    } catch (e: any) {
      setSendStatus({ type: 'error', msg: e.message });
    }
  }

  function handleDisconnect() {
    const state = disconnectWallet();
    setWallet(state);
    setBalances([]);
    setTxs([]);
    setDelegations([]);
  }

  function handlePageChange(newPage: number) {
    if (!wallet?.address) return;
    setTxPage(newPage);
    loadData(wallet.address, newPage);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;

    // Check insufficient balance
    const sendUclaw = Math.floor(parseFloat(sendAmount) * 1_000_000);
    if (sendUclaw > parseInt(clawBalance)) {
      setSendStatus({ type: 'error', msg: 'Insufficient balance' });
      addToast({ type: 'warning', title: 'Insufficient Balance', message: `You need ${sendAmount} CLAW but only have ${formatClaw(clawBalance)} available.` });
      return;
    }

    setSending(true);
    setSendStatus(null);

    try {
      const amountUclaw = String(sendUclaw);
      const msg = {
        type: 'cosmos-sdk/MsgSend',
        value: {
          from_address: wallet.address,
          to_address: sendTo,
          amount: [{ denom: chainConfig.coinMinimalDenom, amount: amountUclaw }],
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], sendMemo);
      if (result.code === 0) {
        setSendStatus({ type: 'success', msg: `Sent! Tx: ${result.txHash}` });
        addToast({ type: 'success', title: 'Transaction Sent', message: `Sent ${sendAmount} CLAW successfully.`, txHash: result.txHash });
        setSendTo('');
        setSendAmount('');
        setSendMemo('');
        loadData(wallet.address);
      } else {
        setSendStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
        addToast({ type: 'error', title: 'Transaction Failed', message: `Transaction returned error code ${result.code}.` });
      }
    } catch (e: any) {
      setSendStatus({ type: 'error', msg: e.message });
      addToast({ type: 'error', title: 'Transaction Error', message: e.message });
    } finally {
      setSending(false);
    }
  }

  const filteredTxs = useMemo(() => {
    let result = txs;
    if (historyTypeFilter !== 'all') {
      result = result.filter(tx => txMatchesType(tx, historyTypeFilter));
    }
    if (historyStatusFilter !== 'all') {
      result = result.filter(tx =>
        historyStatusFilter === 'success' ? tx.code === 0 : tx.code !== 0
      );
    }
    if (historyMemoSearch.trim()) {
      const q = historyMemoSearch.trim().toLowerCase();
      result = result.filter(tx => (tx.memo ?? '').toLowerCase().includes(q));
    }
    return result;
  }, [txs, historyTypeFilter, historyStatusFilter, historyMemoSearch]);

  function handleExportCsv() {
    const csv = buildCsvContent(filteredTxs);
    const date = new Date().toISOString().slice(0, 10);
    const addr = wallet?.address ?? 'unknown';
    downloadCsv(csv, `clawchain-tx-history-${addr}-${date}.csv`);
  }

  const clawBalance = balances.find(b => b.denom === chainConfig.coinMinimalDenom)?.amount || '0';
  const totalDelegated = delegations.reduce((sum, d) => sum + parseInt(d.amount || '0'), 0).toString();

  // Not connected state.
  if (!wallet?.connected) {
    return (
      <>
        <h1 className="page-title">Wallet</h1>
        <p className="page-subtitle">Connect your Keplr wallet to manage CLAW tokens.</p>

        <div className="card" style={{ maxWidth: 500, textAlign: 'center', padding: '3rem 2rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Connect Wallet</h2>
          <p style={{ color: 'var(--text2)', marginBottom: '1.5rem' }}>
            Use Keplr browser extension to sign transactions and view your balance.
          </p>
          <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
            {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Extension Not Found'}
          </button>
          {!isKeplrAvailable() && (
            <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: '1rem' }}>
              Install the{' '}
              <a href="https://www.keplr.app/download" target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)' }}>
                Keplr extension
              </a>{' '}
              to get started.
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Wallet</h1>
      <p className="page-subtitle">
        Connected as <strong>{wallet.name}</strong> &mdash;{' '}
        <code className="mono" style={{ fontSize: '0.85rem' }}>{shortAddr(wallet.address)}</code>{' '}<CopyButton text={wallet.address} />
        <button
          onClick={handleDisconnect}
          style={{ marginLeft: 12, background: 'none', border: 'none', color: '#ef4444',
            cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}>
          Disconnect
        </button>
      </p>

      {/* Balance Summary */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-label">Available Balance</div>
          <div className="card-value">{formatClaw(clawBalance)}</div>
        </div>
        <div className="card">
          <div className="card-label">Staked</div>
          <div className="card-value">{formatClaw(totalDelegated)}</div>
        </div>
        <div className="card">
          <div className="card-label">Total Assets</div>
          <div className="card-value">
            {formatClaw((parseInt(clawBalance) + parseInt(totalDelegated)).toString())}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Transactions</div>
          <div className="card-value">{txTotal}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {(['overview', 'send', 'history', 'staking'] as Tab[]).map(t => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : ''}`}
            onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          {/* All Balances */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3>Token Balances</h3>
            {balances.length === 0 ? (
              <p style={{ color: 'var(--text2)' }}>No tokens found.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Denom</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map(b => (
                    <tr key={b.denom}>
                      <td style={tdStyle}><code className="mono">{b.denom}</code></td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{b.denom === chainConfig.coinMinimalDenom ? formatClaw(b.amount) : b.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Recent Transactions */}
          <div className="card">
            <h3>Recent Transactions</h3>
            {txs.length === 0 ? (
              <p style={{ color: 'var(--text2)' }}>No transactions yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tx Hash</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Height</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.slice(0, 5).map(tx => (
                    <tr key={tx.hash}>
                      <td style={tdStyle}>
                        <a href={`/explorer/tx/${tx.hash}`} style={{ color: 'var(--accent)' }}>
                          <code className="mono">{shortHash(tx.hash)}</code>
                        </a>
                      </td>
                      <td style={tdStyle}>{formatMsgType(tx.messages[0]?.typeUrl)}</td>
                      <td style={tdStyle}>{tx.height}</td>
                      <td style={tdStyle}>
                        <span className={`badge ${tx.code === 0 ? 'badge-success' : 'badge-error'}`}>
                          {tx.code === 0 ? 'Success' : 'Failed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {txs.length > 0 && (
              <button className="btn" style={{ marginTop: '0.75rem' }} onClick={() => setTab('history')}>
                View All Transactions
              </button>
            )}
          </div>
        </>
      )}

      {/* Send Tab */}
      {tab === 'send' && (
        <div className="card" style={{ maxWidth: 500 }}>
          <h3>Send CLAW</h3>
          <p style={{ color: 'var(--text2)', marginBottom: '1rem' }}>
            Available: <strong>{formatClaw(clawBalance)}</strong>
          </p>

          <form onSubmit={handleSend}>
            <div style={{ marginBottom: '1rem' }}>
              <label>Recipient Address *</label>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text" value={sendTo} onChange={e => { setSendTo(e.target.value); setShowAddressPicker(false); }}
                    placeholder={`${chainConfig.bech32Prefix}1...`}
                    required style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowAddressPicker(!showAddressPicker)}
                    title="Pick from Address Book"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  >
                    Address Book
                  </button>
                </div>
                {showAddressPicker && (
                  <div className="address-picker-dropdown">
                    {addressBookContacts.length > 3 && (
                      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
                        <input
                          type="text"
                          value={addressPickerQuery}
                          onChange={e => setAddressPickerQuery(e.target.value)}
                          placeholder="Search contacts..."
                          style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                        />
                      </div>
                    )}
                    {filteredAddressBookContacts.length === 0 ? (
                      <div style={{ padding: '0.75rem', color: 'var(--text2)', fontSize: '0.85rem', textAlign: 'center' }}>
                        {addressBookContacts.length === 0 ? 'No contacts saved. Visit the Address Book page to add contacts.' : 'No matching contacts.'}
                      </div>
                    ) : (
                      filteredAddressBookContacts.map(c => (
                        <div
                          key={c.address}
                          className="address-picker-item"
                          onClick={() => {
                            setSendTo(c.address);
                            setShowAddressPicker(false);
                            setAddressPickerQuery('');
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                          <span style={{ opacity: 0.6, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {c.address.slice(0, 10)}...{c.address.slice(-4)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label>Amount (CLAW) *</label>
              <input
                type="number" step="0.000001" min="0.000001"
                value={sendAmount} onChange={e => setSendAmount(e.target.value)}
                placeholder="10.0" required style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label>Memo (optional)</label>
              <input
                type="text" value={sendMemo} onChange={e => setSendMemo(e.target.value)}
                placeholder="Optional memo" style={inputStyle}
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={sending}>
              {sending ? 'Sending...' : 'Send Tokens'}
            </button>
          </form>

          {sendStatus && (
            <div style={{
              marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem',
              background: sendStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: sendStatus.type === 'success' ? '#22c55e' : '#ef4444',
              wordBreak: 'break-all',
            }}>
              {sendStatus.msg}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Transaction History</h3>
            <button className="btn" onClick={handleExportCsv} disabled={filteredTxs.length === 0}
              title="Export filtered transactions as CSV">
              Export CSV
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text2)', display: 'block', marginBottom: '0.25rem' }}>Type</label>
              <select value={historyTypeFilter} onChange={e => setHistoryTypeFilter(e.target.value as TxTypeFilter)}
                style={selectStyle}>
                <option value="all">All Types</option>
                <option value="transfers">Transfers</option>
                <option value="staking">Staking</option>
                <option value="governance">Governance</option>
                <option value="agent">Agent</option>
                <option value="privacy">Privacy</option>
                <option value="marketplace">Marketplace</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text2)', display: 'block', marginBottom: '0.25rem' }}>Status</label>
              <select value={historyStatusFilter} onChange={e => setHistoryStatusFilter(e.target.value as TxStatusFilter)}
                style={selectStyle}>
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text2)', display: 'block', marginBottom: '0.25rem' }}>Search Memo</label>
              <input type="text" placeholder="Filter by memo..."
                value={historyMemoSearch} onChange={e => setHistoryMemoSearch(e.target.value)}
                style={inputStyle} />
            </div>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text2)' }}>Loading...</p>
          ) : txs.length === 0 ? (
            <p style={{ color: 'var(--text2)' }}>No transactions found.</p>
          ) : filteredTxs.length === 0 ? (
            <p style={{ color: 'var(--text2)' }}>No transactions match the current filters.</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tx Hash</th>
                    <th style={thStyle}>Summary</th>
                    <th style={thStyle}>Height</th>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Gas</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxs.map(tx => {
                    const summary = decodeMsgSummary(tx.messages[0] ?? { typeUrl: '', value: {} }, wallet?.address ?? '');
                    return (
                      <tr key={tx.hash}>
                        <td style={tdStyle}>
                          <a href={`/explorer/tx/${tx.hash}`} style={{ color: 'var(--accent)' }}>
                            <code className="mono">{shortHash(tx.hash)}</code>
                          </a>
                        </td>
                        <td style={tdStyle}>
                          <span title={tx.messages[0]?.typeUrl ?? ''}>
                            <span style={{ marginRight: '0.4rem', fontSize: '1rem' }}>{summary.icon}</span>
                            {summary.text}
                          </span>
                          {tx.memo && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text2)', marginTop: '0.15rem' }}>
                              Memo: {tx.memo.length > 40 ? tx.memo.slice(0, 40) + '...' : tx.memo}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <a href={`/explorer/block/${tx.height}`} style={{ color: 'var(--accent)' }}>{tx.height}</a>
                        </td>
                        <td style={tdStyle}>{tx.timestamp ? timeAgo(tx.timestamp) : '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '0.8rem', color: 'var(--text2)' }}>
                          {tx.gasUsed}/{tx.gasWanted}
                        </td>
                        <td style={tdStyle}>
                          <span className={`badge ${tx.code === 0 ? 'badge-success' : 'badge-error'}`}>
                            {tx.code === 0 ? 'OK' : `Err:${tx.code}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
                <button className="btn" disabled={txPage <= 1}
                  onClick={() => handlePageChange(txPage - 1)}>Prev</button>
                <span style={{ color: 'var(--text2)' }}>
                  Page {txPage} of {Math.max(1, Math.ceil(txTotal / 10))}
                </span>
                <button className="btn" disabled={txPage * 10 >= txTotal}
                  onClick={() => handlePageChange(txPage + 1)}>Next</button>
                <span style={{ color: 'var(--text2)', marginLeft: 'auto', fontSize: '0.8rem' }}>
                  Showing {filteredTxs.length} of {txs.length} on this page
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Staking Tab */}
      {tab === 'staking' && (
        <div className="card">
          <h3>Delegations</h3>
          <p style={{ color: 'var(--text2)', marginBottom: '1rem' }}>
            Total staked: <strong>{formatClaw(totalDelegated)}</strong>
          </p>

          {delegations.length === 0 ? (
            <p style={{ color: 'var(--text2)' }}>No active delegations.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Validator</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Staked</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Shares</th>
                </tr>
              </thead>
              <tbody>
                {delegations.map(d => (
                  <tr key={d.validatorAddress}>
                    <td style={tdStyle}>
                      <code className="mono">{shortAddr(d.validatorAddress)}</code>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatClaw(d.amount)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{parseFloat(d.shares).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginTop: '1rem' }}>
            Use the <a href="/validators" style={{ color: 'var(--accent)' }}>Validators</a> page to delegate or redelegate tokens.
          </p>
        </div>
      )}
    </>
  );
}

// --- Helpers ---

function formatMsgType(typeUrl: string | undefined): string {
  if (!typeUrl) return '-';
  const parts = typeUrl.split('.');
  const last = parts[parts.length - 1] || typeUrl;
  return last.replace(/^Msg/, '');
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid var(--border, #333)',
  color: 'var(--text2)',
  fontSize: '0.8rem',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid var(--border, #222)',
  fontSize: '0.875rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  background: 'var(--bg, #0a0a0a)',
  border: '1px solid var(--border, #333)',
  borderRadius: '0.375rem',
  color: 'var(--text, #fff)',
  fontSize: '0.875rem',
};

const selectStyle: React.CSSProperties = {
  padding: '0.5rem',
  background: 'var(--bg, #0a0a0a)',
  border: '1px solid var(--border, #333)',
  borderRadius: '0.375rem',
  color: 'var(--text, #fff)',
  fontSize: '0.875rem',
};
