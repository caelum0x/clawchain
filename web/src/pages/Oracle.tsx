import { useEffect, useState } from 'react';
import useDocTitle from '../hooks/useDocTitle.ts';
import { chainConfig } from '../lib/config';

interface PriceEntry {
  denom_pair: string;
  price: string;
  updated_at: string;
}

interface PriceHistoryEntry {
  price: string;
  timestamp: string;
  block_height: string;
}

interface OracleParams {
  admin: string;
  max_age_seconds: string;
  allowed_denoms: string[];
}

function getRestBase(): string {
  const rest = chainConfig.restEndpoint;
  return rest.startsWith('http') ? rest : `${window.location.origin}${rest}`;
}

function formatTimestamp(ts: string): string {
  if (!ts || ts === '0') return 'N/A';
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) {
      // Try parsing as unix seconds
      const unix = parseInt(ts, 10);
      if (!isNaN(unix) && unix > 0) {
        return new Date(unix * 1000).toLocaleString();
      }
      return ts;
    }
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  // Show up to 6 decimal places, trim trailing zeros
  return num.toFixed(6).replace(/\.?0+$/, '') || '0';
}

export default function Oracle() {
  useDocTitle('Oracle');

  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [params, setParams] = useState<OracleParams | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsError, setParamsError] = useState<string | null>(null);

  useEffect(() => {
    loadPrices();
  }, []);

  async function loadPrices() {
    setLoading(true);
    setError(null);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1/prices`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setPrices(data.prices || []);
    } catch (e: any) {
      console.error('Failed to load oracle prices:', e);
      setError(e.message || 'Failed to load prices');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(denomPair: string) {
    setSelectedPair(denomPair);
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory([]);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1/price_history/${denomPair}?limit=20`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setHistory(data.history || []);
    } catch (e: any) {
      console.error('Failed to load price history:', e);
      setHistoryError(e.message || 'Failed to load price history');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadParams() {
    if (params && paramsOpen) {
      // Toggle closed without refetching
      setParamsOpen(false);
      return;
    }
    setParamsOpen(true);
    setParamsLoading(true);
    setParamsError(null);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1/params`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setParams(data.params || null);
    } catch (e: any) {
      console.error('Failed to load oracle params:', e);
      setParamsError(e.message || 'Failed to load oracle parameters');
    } finally {
      setParamsLoading(false);
    }
  }

  return (
    <div>
      <h1>Oracle</h1>
      <p className="subtitle">Real-time price feeds from the on-chain oracle module.</p>

      {/* Price Table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Price Feeds</h3>
          <button className="btn" onClick={loadPrices} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <p>Loading prices...</p>
        ) : error ? (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
            {error}
          </div>
        ) : prices.length === 0 ? (
          <p>No oracle price feeds available yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Denom Pair</th>
                  <th>Price</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr
                    key={p.denom_pair}
                    style={{
                      cursor: 'pointer',
                      background: selectedPair === p.denom_pair ? 'rgba(59,130,246,0.1)' : undefined,
                    }}
                    onClick={() => loadHistory(p.denom_pair)}
                  >
                    <td><strong>{p.denom_pair}</strong></td>
                    <td>{formatPrice(p.price)}</td>
                    <td>{formatTimestamp(p.updated_at)}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          loadHistory(p.denom_pair);
                        }}
                      >
                        History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Price History */}
      {selectedPair && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Price History: {selectedPair}</h3>
            <button
              className="btn"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
              onClick={() => {
                setSelectedPair(null);
                setHistory([]);
              }}
            >
              Close
            </button>
          </div>

          {historyLoading ? (
            <p>Loading history...</p>
          ) : historyError ? (
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {historyError}
            </div>
          ) : history.length === 0 ? (
            <p>No price history entries found for {selectedPair}.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Price</th>
                    <th>Timestamp</th>
                    <th>Block Height</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{formatPrice(h.price)}</td>
                      <td>{formatTimestamp(h.timestamp)}</td>
                      <td>{h.block_height || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Oracle Parameters (collapsible) */}
      <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          onClick={loadParams}
        >
          <h3 style={{ margin: 0 }}>Oracle Parameters</h3>
          <button className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>
            {paramsOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {paramsOpen && (
          <div style={{ marginTop: '1rem' }}>
            {paramsLoading ? (
              <p>Loading parameters...</p>
            ) : paramsError ? (
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                {paramsError}
              </div>
            ) : params ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Admin</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{params.admin || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Max Age (seconds)</strong></td>
                      <td>{params.max_age_seconds || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Allowed Denoms</strong></td>
                      <td>
                        {params.allowed_denoms && params.allowed_denoms.length > 0
                          ? params.allowed_denoms.join(', ')
                          : 'None configured'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No parameters available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
