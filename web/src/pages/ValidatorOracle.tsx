import { useEffect, useState } from 'react';
import useDocTitle from '../hooks/useDocTitle.ts';
import { chainConfig } from '../lib/config';

/* ------------------------------------------------------------------ */
/* Types matching oracle REST responses for validator endpoints         */
/* ------------------------------------------------------------------ */

interface FeederResponse {
  feeder_addr: string;
}

interface MissResponse {
  miss_counter: string;
}

interface AggregatePrevote {
  hash: string;
  voter: string;
  submit_block: string;
}

interface ExchangeRateTuple {
  denom: string;
  exchange_rate: string;
}

interface AggregateVote {
  exchange_rate_tuples: ExchangeRateTuple[];
  voter: string;
}

type HealthStatus = 'Healthy' | 'Warning' | 'Critical';

interface ValidatorOracleData {
  readonly feeder: string | null;
  readonly missCounter: number;
  readonly prevote: AggregatePrevote | null;
  readonly vote: AggregateVote | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function getRestBase(): string {
  const rest = chainConfig.restEndpoint;
  return rest.startsWith('http') ? rest : `${window.location.origin}${rest}`;
}

function getHealthStatus(missCounter: number): HealthStatus {
  if (missCounter < 10) return 'Healthy';
  if (missCounter <= 50) return 'Warning';
  return 'Critical';
}

function getHealthColor(status: HealthStatus): string {
  switch (status) {
    case 'Healthy':
      return '#10b981';
    case 'Warning':
      return '#f59e0b';
    case 'Critical':
      return '#ef4444';
  }
}

function getHealthBackground(status: HealthStatus): string {
  switch (status) {
    case 'Healthy':
      return 'rgba(16,185,129,0.15)';
    case 'Warning':
      return 'rgba(245,158,11,0.15)';
    case 'Critical':
      return 'rgba(239,68,68,0.15)';
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function ValidatorOracle() {
  useDocTitle('Validator Oracle');

  const [validatorAddress, setValidatorAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ValidatorOracleData | null>(null);

  useEffect(() => {
    // No auto-load; user must enter address and click Load
  }, []);

  async function loadValidatorData() {
    const addr = validatorAddress.trim();
    if (!addr) {
      setError('Please enter a validator address.');
      return;
    }

    if (!addr.startsWith('clawvaloper')) {
      setError('Address must start with "clawvaloper".');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    const rest = getRestBase();
    const encodedAddr = encodeURIComponent(addr);

    try {
      const [feederResp, missResp, prevoteResp, voteResp] = await Promise.allSettled([
        fetch(`${rest}/clawchain/oracle/v1beta1/validators/${encodedAddr}/feeder`),
        fetch(`${rest}/clawchain/oracle/v1beta1/validators/${encodedAddr}/miss`),
        fetch(`${rest}/clawchain/oracle/v1beta1/validators/${encodedAddr}/aggregate_prevote`),
        fetch(`${rest}/clawchain/oracle/v1beta1/validators/${encodedAddr}/aggregate_vote`),
      ]);

      // Parse feeder
      let feeder: string | null = null;
      if (feederResp.status === 'fulfilled' && feederResp.value.ok) {
        const feederData: FeederResponse = await feederResp.value.json();
        feeder = feederData.feeder_addr ?? null;
      }

      // Parse miss counter
      let missCounter = 0;
      if (missResp.status === 'fulfilled' && missResp.value.ok) {
        const missData: MissResponse = await missResp.value.json();
        missCounter = parseInt(missData.miss_counter ?? '0', 10);
        if (isNaN(missCounter)) missCounter = 0;
      }

      // Parse prevote
      let prevote: AggregatePrevote | null = null;
      if (prevoteResp.status === 'fulfilled' && prevoteResp.value.ok) {
        const prevoteData = await prevoteResp.value.json();
        prevote = prevoteData.aggregate_prevote ?? null;
      }

      // Parse vote
      let vote: AggregateVote | null = null;
      if (voteResp.status === 'fulfilled' && voteResp.value.ok) {
        const voteData = await voteResp.value.json();
        vote = voteData.aggregate_vote ?? null;
      }

      setData({ feeder, missCounter, prevote, vote });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load validator oracle data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const healthStatus = data ? getHealthStatus(data.missCounter) : null;

  return (
    <div>
      <h1>Validator Oracle</h1>
      <p className="subtitle">Monitor oracle voting health for a specific validator.</p>

      {/* Validator Selector */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>Validator Selector</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={validatorAddress}
            onChange={(e) => setValidatorAddress(e.target.value)}
            placeholder="clawvaloper1..."
            aria-label="Validator address"
            style={{
              flex: 1,
              minWidth: '280px',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--border, #333)',
              background: 'var(--bg-secondary, #1a1a2e)',
              color: 'var(--text-primary, #e0e0e0)',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadValidatorData();
            }}
          />
          <button className="btn" onClick={loadValidatorData} disabled={loading}>
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
            {error}
          </div>
        )}
      </div>

      {loading && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p>Loading validator oracle data...</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Oracle Health Score */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Oracle Health Score</h3>
            <div
              style={{
                display: 'inline-block',
                padding: '0.5rem 1.25rem',
                borderRadius: '1rem',
                background: getHealthBackground(healthStatus!),
                color: getHealthColor(healthStatus!),
                fontWeight: 'bold',
                fontSize: '1.1rem',
              }}
            >
              {healthStatus}
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary, #888)' }}>
              Based on miss counter: &lt;10 = Healthy, 10-50 = Warning, &gt;50 = Critical
            </p>
          </div>

          {/* Feeder Delegation */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Feeder Delegation</h3>
            {data.feeder ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Feeder Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{data.feeder}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No feeder delegation found. The validator votes directly.</p>
            )}
          </div>

          {/* Miss Counter */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Miss Counter</h3>
              {data.missCounter > 20 && (
                <span
                  style={{
                    padding: '0.2rem 0.6rem',
                    borderRadius: '0.75rem',
                    background: 'rgba(239,68,68,0.15)',
                    color: '#ef4444',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                  }}
                >
                  High Misses
                </span>
              )}
            </div>
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
                    <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{validatorAddress.trim()}</td>
                    <td>
                      <strong style={{ color: data.missCounter > 20 ? '#ef4444' : 'inherit' }}>
                        {data.missCounter}
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Current Prevote */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Current Prevote</h3>
            {data.prevote ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Hash</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.9rem', wordBreak: 'break-all' }}>
                        {data.prevote.hash}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Submit Block</strong></td>
                      <td>{data.prevote.submit_block}</td>
                    </tr>
                    <tr>
                      <td><strong>Voter</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{data.prevote.voter}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No pending prevote found.</p>
            )}
          </div>

          {/* Current Vote */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Current Vote</h3>
            {data.vote && data.vote.exchange_rate_tuples && data.vote.exchange_rate_tuples.length > 0 ? (
              <>
                <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  Voter: <strong style={{ fontFamily: 'monospace' }}>{data.vote.voter}</strong>
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Denom</th>
                        <th>Exchange Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.vote.exchange_rate_tuples.map((tuple) => (
                        <tr key={tuple.denom}>
                          <td><strong>{tuple.denom}</strong></td>
                          <td>{tuple.exchange_rate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>No aggregate vote found.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
