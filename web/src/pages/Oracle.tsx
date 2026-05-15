import { useEffect, useRef, useState } from 'react';
import useDocTitle from '../hooks/useDocTitle.ts';
import { chainConfig } from '../lib/config';
import { isKeplrAvailable, connectKeplr, type WalletState } from '../lib/wallet.ts';

/* ------------------------------------------------------------------ */
/* Types matching Terra-forked oracle REST responses                   */
/* ------------------------------------------------------------------ */

interface ExchangeRateEntry {
  denom: string;
  exchange_rate: string;
}

interface WhitelistEntry {
  name: string;
  tobin_tax: string;
}

interface OracleParams {
  vote_period: string;
  vote_threshold: string;
  reward_band: string;
  reward_distribution_window: string;
  whitelist: WhitelistEntry[];
  slash_fraction: string;
  slash_window: string;
  min_valid_per_window: string;
}

function getRestBase(): string {
  const rest = chainConfig.restEndpoint;
  return rest.startsWith('http') ? rest : `${window.location.origin}${rest}`;
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  // Show up to 6 decimal places, trim trailing zeros
  return num.toFixed(6).replace(/\.?0+$/, '') || '0';
}

export default function Oracle() {
  useDocTitle('Oracle');

  const [exchangeRates, setExchangeRates] = useState<ExchangeRateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeDenoms, setActiveDenoms] = useState<string[]>([]);
  const [activesLoading, setActivesLoading] = useState(false);
  const [activesError, setActivesError] = useState<string | null>(null);

  const [voteTargets, setVoteTargets] = useState<string[]>([]);
  const [voteTargetsLoading, setVoteTargetsLoading] = useState(false);
  const [voteTargetsError, setVoteTargetsError] = useState<string | null>(null);

  const [selectedDenom, setSelectedDenom] = useState<string | null>(null);
  const [singleRate, setSingleRate] = useState<string | null>(null);
  const [singleRateLoading, setSingleRateLoading] = useState(false);
  const [singleRateError, setSingleRateError] = useState<string | null>(null);

  const [params, setParams] = useState<OracleParams | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsError, setParamsError] = useState<string | null>(null);

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [missCount, setMissCount] = useState<string | null>(null);
  const [missLoading, setMissLoading] = useState(false);
  const [missError, setMissError] = useState<string | null>(null);

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadExchangeRates();
    loadActiveDenoms();
    loadVoteTargets();
    refreshTimer.current = setInterval(() => {
      loadExchangeRates();
    }, 30_000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, []);

  async function loadExchangeRates() {
    setLoading(true);
    setError(null);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1beta1/denoms/exchange_rates`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setExchangeRates(data.exchange_rates || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load exchange rates';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveDenoms() {
    setActivesLoading(true);
    setActivesError(null);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1beta1/denoms/actives`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setActiveDenoms(data.actives || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load active denoms';
      setActivesError(msg);
    } finally {
      setActivesLoading(false);
    }
  }

  async function loadVoteTargets() {
    setVoteTargetsLoading(true);
    setVoteTargetsError(null);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1beta1/denoms/vote_targets`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setVoteTargets(data.vote_targets || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load vote targets';
      setVoteTargetsError(msg);
    } finally {
      setVoteTargetsLoading(false);
    }
  }

  async function loadSingleRate(denom: string) {
    setSelectedDenom(denom);
    setSingleRateLoading(true);
    setSingleRateError(null);
    setSingleRate(null);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1beta1/denoms/${encodeURIComponent(denom)}/exchange_rate`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setSingleRate(data.exchange_rate ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load exchange rate';
      setSingleRateError(msg);
    } finally {
      setSingleRateLoading(false);
    }
  }

  async function handleConnectWallet() {
    try {
      const state = await connectKeplr();
      setWallet(state);
      loadMissCounter(state.address);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to connect wallet';
      setMissError(msg);
    }
  }

  async function loadMissCounter(validatorAddr: string) {
    setMissLoading(true);
    setMissError(null);
    try {
      const rest = getRestBase();
      const resp = await fetch(`${rest}/clawchain/oracle/v1beta1/validators/${encodeURIComponent(validatorAddr)}/miss`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setMissCount(data.miss_counter ?? '0');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load miss counter';
      setMissError(msg);
    } finally {
      setMissLoading(false);
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
      const resp = await fetch(`${rest}/clawchain/oracle/v1beta1/params`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      const data = await resp.json();
      setParams(data.params || null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load oracle parameters';
      setParamsError(msg);
    } finally {
      setParamsLoading(false);
    }
  }

  return (
    <div>
      <h1>Oracle</h1>
      <p className="subtitle">Real-time price feeds from the on-chain oracle module.</p>

      {/* Exchange Rates Table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Exchange Rates</h3>
          <button className="btn" onClick={loadExchangeRates} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <p>Loading prices...</p>
        ) : error ? (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
            {error}
          </div>
        ) : exchangeRates.length === 0 ? (
          <p>No oracle price feeds available yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Denom</th>
                  <th>Exchange Rate</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exchangeRates.map((entry) => (
                  <tr
                    key={entry.denom}
                    style={{
                      cursor: 'pointer',
                      background: selectedDenom === entry.denom ? 'rgba(59,130,246,0.1)' : undefined,
                    }}
                    onClick={() => loadSingleRate(entry.denom)}
                  >
                    <td><strong>{entry.denom}</strong></td>
                    <td>{formatPrice(entry.exchange_rate)}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          loadSingleRate(entry.denom);
                        }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Single Denom Exchange Rate Detail */}
      {selectedDenom && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Exchange Rate: {selectedDenom}</h3>
            <button
              className="btn"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
              onClick={() => {
                setSelectedDenom(null);
                setSingleRate(null);
              }}
            >
              Close
            </button>
          </div>

          {singleRateLoading ? (
            <p>Loading exchange rate...</p>
          ) : singleRateError ? (
            <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {singleRateError}
            </div>
          ) : singleRate !== null ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Denom</th>
                    <th>Exchange Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>{selectedDenom}</strong></td>
                    <td>{formatPrice(singleRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p>No exchange rate available for {selectedDenom}.</p>
          )}
        </div>
      )}

      {/* Active Denoms */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>Active Denoms</h3>
        {activesLoading ? (
          <p>Loading active denoms...</p>
        ) : activesError ? (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
            {activesError}
          </div>
        ) : activeDenoms.length === 0 ? (
          <p>No active denoms reported.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {activeDenoms.map((d) => (
              <span
                key={d}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  background: 'rgba(59,130,246,0.15)',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                }}
              >
                {d}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Vote Targets */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>Vote Targets</h3>
        {voteTargetsLoading ? (
          <p>Loading vote targets...</p>
        ) : voteTargetsError ? (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
            {voteTargetsError}
          </div>
        ) : voteTargets.length === 0 ? (
          <p>No vote targets reported.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {voteTargets.map((t) => (
              <span
                key={t}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  background: 'rgba(16,185,129,0.15)',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

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
                      <td><strong>Vote Period</strong></td>
                      <td>{params.vote_period || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Vote Threshold</strong></td>
                      <td>{params.vote_threshold || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Reward Band</strong></td>
                      <td>{params.reward_band || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Reward Distribution Window</strong></td>
                      <td>{params.reward_distribution_window || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Slash Fraction</strong></td>
                      <td>{params.slash_fraction || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Slash Window</strong></td>
                      <td>{params.slash_window || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Min Valid Per Window</strong></td>
                      <td>{params.min_valid_per_window || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td><strong>Whitelist</strong></td>
                      <td>
                        {params.whitelist && params.whitelist.length > 0
                          ? params.whitelist.map((w) => `${w.name} (tobin: ${w.tobin_tax})`).join(', ')
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

      {/* Validator Miss Counts */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>Validator Miss Counter</h3>
        {wallet?.connected ? (
          <div>
            <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              Connected: <strong style={{ fontFamily: 'monospace' }}>{wallet.address}</strong>
            </p>
            {missLoading ? (
              <p>Loading miss counter...</p>
            ) : missError ? (
              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                {missError}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Validator</th>
                      <th>Miss Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{wallet.address}</td>
                      <td>{missCount ?? '0'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <button
              className="btn"
              style={{ marginTop: '0.75rem', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
              onClick={() => loadMissCounter(wallet.address)}
              disabled={missLoading}
            >
              Refresh
            </button>
          </div>
        ) : (
          <div>
            <p>Connect your wallet to view miss counter for your validator.</p>
            {isKeplrAvailable() ? (
              <button className="btn" onClick={handleConnectWallet}>
                Connect Keplr
              </button>
            ) : (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #888)' }}>
                Keplr wallet extension not detected.
              </p>
            )}
            {missError && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                {missError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
