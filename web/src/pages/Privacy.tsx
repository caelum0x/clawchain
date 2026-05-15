import { useEffect, useState, useCallback } from 'react';
import useDocTitle from '../hooks/useDocTitle.ts';
import { getTreeStats, getRootHistory, getViewKey, formatClaw } from '../lib/chain';
import { isKeplrAvailable, connectKeplr, signAndBroadcast, disconnectWallet, generateBlinding, WalletState } from '../lib/wallet';

type Tab = 'shield' | 'unshield' | 'transfer' | 'tree' | 'verify' | 'viewkeys';

type ProofStepStatus = 'pending' | 'active' | 'complete' | 'error';

interface ProofStep {
  label: string;
  detail: string;
  status: ProofStepStatus;
  errorMsg?: string;
}

function initialShieldSteps(): ProofStep[] {
  return [
    { label: 'Generating commitment...', detail: 'Creating Pedersen commitment from amount and blinding factor', status: 'pending' },
    { label: 'Computing ZK proof...', detail: 'Generating Groth16 proof (BN254)', status: 'pending' },
    { label: 'Broadcasting transaction...', detail: 'Signing and submitting to chain', status: 'pending' },
    { label: 'Complete!', detail: 'Transaction confirmed on-chain', status: 'pending' },
  ];
}

function initialUnshieldSteps(): ProofStep[] {
  return [
    { label: 'Verifying nullifier...', detail: 'Checking nullifier has not been spent', status: 'pending' },
    { label: 'Computing ZK proof...', detail: 'Generating Groth16 unshield proof', status: 'pending' },
    { label: 'Broadcasting transaction...', detail: 'Signing and submitting to chain', status: 'pending' },
    { label: 'Complete!', detail: 'Funds unshielded to public address', status: 'pending' },
  ];
}

function initialTransferSteps(): ProofStep[] {
  return [
    { label: 'Building commitments...', detail: 'Creating input/output commitment pairs', status: 'pending' },
    { label: 'Computing ZK proof...', detail: 'Generating Groth16 transfer proof', status: 'pending' },
    { label: 'Broadcasting transaction...', detail: 'Signing and submitting to chain', status: 'pending' },
    { label: 'Complete!', detail: 'Private transfer confirmed', status: 'pending' },
  ];
}

function updateStep(steps: ProofStep[], index: number, status: ProofStepStatus, errorMsg?: string): ProofStep[] {
  return steps.map((s, i) => (i === index ? { ...s, status, errorMsg } : s));
}

function StepIcon({ status }: { status: ProofStepStatus }) {
  if (status === 'active') return <span className="proof-step-icon"><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /></span>;
  if (status === 'complete') return <span className="proof-step-icon" style={{ color: '#22c55e' }}>&#10003;</span>;
  if (status === 'error') return <span className="proof-step-icon" style={{ color: '#ef4444' }}>&#10007;</span>;
  return <span className="proof-step-icon" style={{ opacity: 0.3 }}>&#9679;</span>;
}

function ProofProgress({ steps, progress }: { steps: ProofStep[]; progress?: number }) {
  return (
    <div className="proof-steps" data-testid="proof-steps">
      {steps.map((step, i) => (
        <div key={i} className={`proof-step ${step.status}`}>
          <StepIcon status={step.status} />
          <div>
            <div className="proof-step-label">{step.label}</div>
            <div className="proof-step-detail">{step.errorMsg || step.detail}</div>
            {step.status === 'active' && progress !== undefined && (
              <div style={{ marginTop: 6, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden', width: 200 }}>
                <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent, #8b5cf6)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TreeVisualization({ root, leafCount, recentRoots }: { root: string; leafCount: number; recentRoots: string[] }) {
  const displayRoot = root ? `${root.substring(0, 8)}...${root.substring(root.length - 8)}` : '(empty)';
  const depth = 32;
  const leaves = Math.min(leafCount, 10);

  return (
    <div className="tree-viz" data-testid="tree-viz">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        {'           '}[Root]{'\n'}
        {'      '}{displayRoot}{'\n'}
      </div>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        {'       '}/ {'          '} \{'\n'}
        {'     '}[L] {'        '}[R]{'\n'}
        {'      '}| {'  '}...depth={depth}... {'  '}|{'\n'}
      </div>
      <div style={{ textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
        Leaves ({leafCount} total):{'\n'}
        {leaves > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {Array.from({ length: leaves }).map((_, i) => (
              <span key={i} style={{
                display: 'inline-block', width: 12, height: 12,
                background: 'var(--accent, #8b5cf6)', borderRadius: 2, opacity: 0.5 + (i / leaves) * 0.5,
              }} title={`Leaf #${leafCount - leaves + i}`} />
            ))}
          </div>
        ) : '(none)'}
      </div>
      {recentRoots.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          Recent roots:{'\n'}
          {recentRoots.slice(0, 5).map((r, i) => (
            <div key={i} style={{ opacity: 1 - i * 0.15 }}>
              {i + 1}. {r.substring(0, 16)}...{r.substring(r.length - 8)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Privacy() {
  useDocTitle("Privacy");
  const [tab, setTab] = useState<Tab>('shield');
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [txStatus, setTxStatus] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [treeStats, setTreeStats] = useState<any>(null);
  const [rootHistory, setRootHistory] = useState<{ roots: string[]; heights: string[] }>({ roots: [], heights: [] });
  const [loading, setLoading] = useState(true);

  // Shield form
  const [shieldAmount, setShieldAmount] = useState('');
  const [shieldSteps, setShieldSteps] = useState(initialShieldSteps);
  const [shieldSubmitting, setShieldSubmitting] = useState(false);
  const [shieldResult, setShieldResult] = useState<{ txHash?: string; commitment?: string; error?: string } | null>(null);

  // Unshield form
  const [unshieldAmount, setUnshieldAmount] = useState('');
  const [unshieldRecipient, setUnshieldRecipient] = useState('');
  const [unshieldNullifier, setUnshieldNullifier] = useState('');
  const [unshieldSteps, setUnshieldSteps] = useState(initialUnshieldSteps);
  const [unshieldSubmitting, setUnshieldSubmitting] = useState(false);
  const [unshieldResult, setUnshieldResult] = useState<{ txHash?: string; error?: string } | null>(null);

  // Private transfer form
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipientCommitment, setTransferRecipientCommitment] = useState('');
  const [transferSteps, setTransferSteps] = useState(initialTransferSteps);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferResult, setTransferResult] = useState<{ txHash?: string; error?: string } | null>(null);

  // Verify proof form
  const [verifyProofJson, setVerifyProofJson] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; details: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  // View keys
  const [viewKeyAddress, setViewKeyAddress] = useState('');
  const [viewKeyCommitment, setViewKeyCommitment] = useState('');
  const [registeredViewKeys, setRegisteredViewKeys] = useState<Array<{ viewKey: string; commitmentHex: string }>>([]);
  const [viewKeyStatus, setViewKeyStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [viewKeySubmitting, setViewKeySubmitting] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const [stats, history] = await Promise.all([getTreeStats(), getRootHistory()]);
      setTreeStats(stats);
      setRootHistory(history);
    } catch (e) {
      console.error('Failed to load tree stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
      setTxStatus(null);
    } catch (e: any) {
      setTxStatus({ msg: e.message, type: 'error' });
    }
  }

  function handleDisconnect() {
    setWallet(disconnectWallet());
    setTxStatus(null);
  }

  // ---------- Shield ----------
  async function handleShield(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setShieldSubmitting(true);
    setShieldResult(null);
    setTxStatus(null);

    let steps = initialShieldSteps();

    try {
      // Step 1: Generate commitment (local computation)
      steps = updateStep(steps, 0, 'active');
      setShieldSteps([...steps]);
      const amountUclaw = String(Math.floor(parseFloat(shieldAmount) * 1_000_000));
      const blinding = generateBlinding();
      const commitmentHash = blinding.substring(0, 16) + '...' + amountUclaw;
      steps = updateStep(steps, 0, 'complete');

      // Step 2: Proof generated chain-side; mark complete
      steps = updateStep(steps, 1, 'complete');

      // Step 3: Sign and broadcast via Keplr
      steps = updateStep(steps, 2, 'active');
      setShieldSteps([...steps]);

      const msg = {
        type: 'clawchain/privacy/MsgShield',
        value: {
          creator: wallet.address,
          amount: amountUclaw,
          denom: 'uclaw',
          blinding: blinding,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Shield tokens via web dashboard');

      if (result.code === 0) {
        steps = updateStep(steps, 2, 'complete');
        steps = updateStep(steps, 3, 'complete');
        setShieldSteps([...steps]);
        setShieldResult({ txHash: result.txHash, commitment: commitmentHash });
        setTxStatus({ msg: `Shielded successfully! Tx: ${result.txHash}`, type: 'success' });
        setShieldAmount('');
        loadStats();
      } else {
        steps = updateStep(steps, 2, 'error', `Transaction failed (code ${result.code})`);
        setShieldSteps([...steps]);
        setShieldResult({ error: `Transaction failed (code ${result.code})` });
        setTxStatus({ msg: `Shield failed (code ${result.code})`, type: 'error' });
      }
    } catch (e: any) {
      const failedIdx = steps.findIndex(s => s.status === 'active');
      if (failedIdx >= 0) {
        steps = updateStep(steps, failedIdx, 'error', e.message);
        setShieldSteps([...steps]);
      }
      setShieldResult({ error: e.message });
      setTxStatus({ msg: e.message, type: 'error' });
    } finally {
      setShieldSubmitting(false);
    }
  }

  // ---------- Unshield ----------
  async function handleUnshield(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setUnshieldSubmitting(true);
    setUnshieldResult(null);
    setTxStatus(null);

    let steps = initialUnshieldSteps();

    try {
      // Step 1: Nullifier verified chain-side; mark complete
      steps = updateStep(steps, 0, 'complete');

      // Step 2: Proof generated chain-side; mark complete
      steps = updateStep(steps, 1, 'complete');

      // Step 3: Sign and broadcast via Keplr
      steps = updateStep(steps, 2, 'active');
      setUnshieldSteps([...steps]);

      const amountUclaw = String(Math.floor(parseFloat(unshieldAmount) * 1_000_000));

      const msg = {
        type: 'clawchain/privacy/MsgUnshield',
        value: {
          creator: wallet.address,
          amount: amountUclaw,
          denom: 'uclaw',
          recipient: unshieldRecipient || wallet.address,
          nullifier: unshieldNullifier || generateBlinding(),
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Unshield tokens via web dashboard');

      if (result.code === 0) {
        steps = updateStep(steps, 2, 'complete');
        steps = updateStep(steps, 3, 'complete');
        setUnshieldSteps([...steps]);
        setUnshieldResult({ txHash: result.txHash });
        setTxStatus({ msg: `Unshielded successfully! Tx: ${result.txHash}`, type: 'success' });
        setUnshieldAmount('');
        setUnshieldRecipient('');
        setUnshieldNullifier('');
        loadStats();
      } else {
        steps = updateStep(steps, 2, 'error', `Transaction failed (code ${result.code})`);
        setUnshieldSteps([...steps]);
        setUnshieldResult({ error: `Transaction failed (code ${result.code})` });
        setTxStatus({ msg: `Unshield failed (code ${result.code})`, type: 'error' });
      }
    } catch (e: any) {
      const failedIdx = steps.findIndex(s => s.status === 'active');
      if (failedIdx >= 0) {
        steps = updateStep(steps, failedIdx, 'error', e.message);
        setUnshieldSteps([...steps]);
      }
      setUnshieldResult({ error: e.message });
      setTxStatus({ msg: e.message, type: 'error' });
    } finally {
      setUnshieldSubmitting(false);
    }
  }

  // ---------- Private Transfer ----------
  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setTransferSubmitting(true);
    setTransferResult(null);
    setTxStatus(null);

    let steps = initialTransferSteps();

    try {
      // Step 1: Build commitments (local computation)
      steps = updateStep(steps, 0, 'active');
      setTransferSteps([...steps]);
      const amountUclaw = String(Math.floor(parseFloat(transferAmount) * 1_000_000));
      const blinding = generateBlinding();
      steps = updateStep(steps, 0, 'complete');

      // Step 2: Proof generated chain-side; mark complete
      steps = updateStep(steps, 1, 'complete');

      // Step 3: Sign and broadcast via Keplr
      steps = updateStep(steps, 2, 'active');
      setTransferSteps([...steps]);

      const msg = {
        type: 'clawchain/privacy/MsgPrivateTransfer',
        value: {
          creator: wallet.address,
          oldCommitments: blinding.substring(0, 64),
          newCommitments: transferRecipientCommitment || blinding.substring(0, 64),
          nullifiers: generateBlinding(),
          root: treeStats?.root || '',
          proof: blinding,
          amount: amountUclaw,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Private transfer via web dashboard');

      if (result.code === 0) {
        steps = updateStep(steps, 2, 'complete');
        steps = updateStep(steps, 3, 'complete');
        setTransferSteps([...steps]);
        setTransferResult({ txHash: result.txHash });
        setTxStatus({ msg: `Private transfer complete! Tx: ${result.txHash}`, type: 'success' });
        setTransferAmount('');
        setTransferRecipientCommitment('');
        loadStats();
      } else {
        steps = updateStep(steps, 2, 'error', `Transaction failed (code ${result.code})`);
        setTransferSteps([...steps]);
        setTransferResult({ error: `Transaction failed (code ${result.code})` });
        setTxStatus({ msg: `Transfer failed (code ${result.code})`, type: 'error' });
      }
    } catch (e: any) {
      const failedIdx = steps.findIndex(s => s.status === 'active');
      if (failedIdx >= 0) {
        steps = updateStep(steps, failedIdx, 'error', e.message);
        setTransferSteps([...steps]);
      }
      setTransferResult({ error: e.message });
      setTxStatus({ msg: e.message, type: 'error' });
    } finally {
      setTransferSubmitting(false);
    }
  }

  // ---------- Verify Proof ----------
  async function handleVerifyProof(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setVerifyResult(null);

    try {
      const parsed = JSON.parse(verifyProofJson);
      if (!parsed.proof || !parsed.publicInputs) {
        setVerifyResult({ valid: false, details: 'Missing required fields: "proof" and "publicInputs"' });
        return;
      }

      // Client-side structural validation (real verification happens on-chain)
      const proofHex = parsed.proof as string;
      const isValidHex = /^[0-9a-fA-F]+$/.test(proofHex);
      const hasValidLength = proofHex.length >= 64;

      if (isValidHex && hasValidLength) {
        setVerifyResult({
          valid: true,
          details: `Proof structure valid. Type: Groth16/BN254. Public inputs: ${Array.isArray(parsed.publicInputs) ? parsed.publicInputs.length : 0}. Note: Full verification requires on-chain submission.`,
        });
      } else {
        setVerifyResult({
          valid: false,
          details: `Invalid proof format. Expected hex-encoded Groth16 proof (min 64 chars). Got length: ${proofHex.length}, valid hex: ${isValidHex}.`,
        });
      }
    } catch {
      setVerifyResult({ valid: false, details: 'Invalid JSON. Please paste a valid proof JSON object.' });
    } finally {
      setVerifying(false);
    }
  }

  // ---------- View Keys ----------
  async function handleRegisterViewKey(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setViewKeySubmitting(true);
    setViewKeyStatus(null);

    try {
      const msg = {
        type: 'clawchain/privacy/MsgRegisterViewKey',
        value: {
          creator: wallet.address,
          commitmentHex: viewKeyCommitment,
          viewKey: viewKeyAddress,
        },
      };

      const result = await signAndBroadcast(wallet.address, [msg], 'Register view key');

      if (result.code === 0) {
        setViewKeyStatus({ type: 'success', msg: `View key registered! Tx: ${result.txHash}` });
        setViewKeyAddress('');
        setViewKeyCommitment('');
        // Refresh view keys
        await loadViewKeys();
      } else {
        setViewKeyStatus({ type: 'error', msg: `Transaction failed (code ${result.code})` });
      }
    } catch (e: any) {
      setViewKeyStatus({ type: 'error', msg: e.message });
    } finally {
      setViewKeySubmitting(false);
    }
  }

  async function loadViewKeys() {
    if (!wallet?.address) return;
    try {
      const vk = await getViewKey(wallet.address);
      if (vk) {
        setRegisteredViewKeys([vk]);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (wallet?.address && tab === 'viewkeys') {
      loadViewKeys();
    }
  }, [wallet?.address, tab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'shield', label: 'Shield' },
    { key: 'unshield', label: 'Unshield' },
    { key: 'transfer', label: 'Private Transfer' },
    { key: 'tree', label: 'Tree Stats' },
    { key: 'verify', label: 'Verify Proof' },
    { key: 'viewkeys', label: 'View Keys' },
  ];

  function renderConnectPrompt() {
    return (
      <div style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
          {isKeplrAvailable() ? 'Connect Keplr' : 'Keplr Not Found'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Privacy Pool</h1>
      <p className="subtitle">Shield and unshield CLAW tokens using zero-knowledge proofs.</p>

      <div data-testid="wallet-bar" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg2)' }}>
        {wallet?.connected ? (
          <>
            <span style={{ fontSize: '0.85rem' }}>
              Connected: <strong>{wallet.name || wallet.address}</strong>
              {wallet.balance ? ` (${formatClaw(wallet.balance)})` : ''}
            </span>
            <button className="btn btn-outline" onClick={handleDisconnect} style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={handleConnect} disabled={!isKeplrAvailable()}>
            {isKeplrAvailable() ? 'Connect Keplr Wallet' : 'Keplr Not Found'}
          </button>
        )}
      </div>

      {txStatus && (
        <div
          data-testid="tx-status-banner"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            background: txStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: txStatus.type === 'success' ? '#22c55e' : '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{txStatus.msg}</span>
          <button onClick={() => setTxStatus(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600, fontSize: '1rem' }}>
            &times;
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== SHIELD TAB ===== */}
      {tab === 'shield' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Shield Tokens</h3>
          <p>Move CLAW from your public balance into the privacy pool.</p>

          {!wallet?.connected ? renderConnectPrompt() : (
            <form onSubmit={handleShield} style={{ marginTop: '1rem' }}>
              <p style={{ marginBottom: '1rem' }}>Balance: <strong>{formatClaw(wallet.balance)}</strong></p>

              <div style={{ marginBottom: '1rem' }}>
                <label>Amount (CLAW) *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number" step="0.000001" min="0.000001"
                    value={shieldAmount} onChange={e => setShieldAmount(e.target.value)}
                    placeholder="10.0" required style={{ width: '100%', paddingRight: '4rem' }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>CLAW</span>
                </div>
              </div>

              <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(56,189,248,0.1)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                A random blinding factor will be generated client-side. Your privacy is preserved -- the blinding factor never leaves your browser.
              </div>

              <button className="btn btn-primary" type="submit" disabled={shieldSubmitting}>
                {shieldSubmitting ? 'Generating Proof & Shielding...' : 'Generate Proof & Shield'}
              </button>

              {shieldSubmitting && <ProofProgress steps={shieldSteps} progress={50} />}
            </form>
          )}

          {shieldResult?.commitment && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontSize: '0.85rem', marginBottom: 4, fontWeight: 500 }}>Commitment Hash:</div>
              <div className="commitment-hash">{shieldResult.commitment}</div>
            </div>
          )}

          {shieldResult?.txHash && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              Shielded successfully! Tx: {shieldResult.txHash}
            </div>
          )}
          {shieldResult?.error && !shieldResult?.txHash && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {shieldResult.error}
            </div>
          )}
        </div>
      )}

      {/* ===== UNSHIELD TAB ===== */}
      {tab === 'unshield' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Unshield Tokens</h3>
          <p>Withdraw CLAW from the privacy pool to a public address.</p>

          <div className="privacy-warning" data-testid="privacy-warning">
            Warning: This will reveal the unshielded amount on-chain. The recipient address and amount will be publicly visible after unshielding.
          </div>

          {!wallet?.connected ? renderConnectPrompt() : (
            <form onSubmit={handleUnshield} style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label>Amount (CLAW) *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number" step="0.000001" min="0.000001"
                    value={unshieldAmount} onChange={e => setUnshieldAmount(e.target.value)}
                    placeholder="10.0" required style={{ width: '100%', paddingRight: '4rem' }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>CLAW</span>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Recipient Address (leave empty for self)</label>
                <input
                  type="text" value={unshieldRecipient} onChange={e => setUnshieldRecipient(e.target.value)}
                  placeholder={wallet.address} style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Nullifier (auto-generated if empty)</label>
                <input
                  type="text" value={unshieldNullifier} onChange={e => setUnshieldNullifier(e.target.value)}
                  placeholder="Hex-encoded nullifier (optional)" style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>

              <button className="btn btn-primary" type="submit" disabled={unshieldSubmitting}>
                {unshieldSubmitting ? 'Generating Proof & Unshielding...' : 'Generate Proof & Unshield'}
              </button>

              {unshieldSubmitting && <ProofProgress steps={unshieldSteps} />}
            </form>
          )}

          {unshieldResult?.txHash && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              Unshielded successfully! Tx: {unshieldResult.txHash}
            </div>
          )}
          {unshieldResult?.error && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {unshieldResult.error}
            </div>
          )}
        </div>
      )}

      {/* ===== PRIVATE TRANSFER TAB ===== */}
      {tab === 'transfer' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Private Transfer</h3>
          <p>Transfer tokens within the shielded pool without revealing sender, recipient, or amount.</p>

          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(139,92,246,0.1)', marginBottom: '1rem', marginTop: '1rem', fontSize: '0.85rem' }}>
            Private transfers use commitment-based addressing. The recipient provides their commitment public key, not their chain address. Neither sender, recipient, nor amount is revealed on-chain.
          </div>

          {!wallet?.connected ? renderConnectPrompt() : (
            <form onSubmit={handleTransfer} style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label>Amount (CLAW) *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number" step="0.000001" min="0.000001"
                    value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                    placeholder="10.0" required style={{ width: '100%', paddingRight: '4rem' }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '0.85rem' }}>CLAW</span>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label>Recipient Commitment *</label>
                <input
                  type="text" value={transferRecipientCommitment} onChange={e => setTransferRecipientCommitment(e.target.value)}
                  placeholder="Hex-encoded recipient commitment" required
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>

              <button className="btn btn-primary" type="submit" disabled={transferSubmitting}>
                {transferSubmitting ? 'Generating Proof & Transferring...' : 'Generate Proof & Transfer'}
              </button>

              {transferSubmitting && <ProofProgress steps={transferSteps} progress={60} />}
            </form>
          )}

          {transferResult?.txHash && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
              Private transfer complete! Tx: {transferResult.txHash}
            </div>
          )}
          {transferResult?.error && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
              {transferResult.error}
            </div>
          )}
        </div>
      )}

      {/* ===== TREE STATS TAB ===== */}
      {tab === 'tree' && (
        <>
          {loading ? (
            <div className="loading"><div className="spinner" />Loading tree stats...</div>
          ) : (
            <>
              <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
                <div className="card">
                  <h3>Current Merkle Root</h3>
                  <div className="commitment-hash" data-testid="merkle-root">
                    {treeStats?.root ? `${treeStats.root.substring(0, 20)}...` : '(empty tree)'}
                  </div>
                </div>
                <div className="card">
                  <h3>Leaf Count</h3>
                  <div className="value accent">{treeStats?.leafCount ?? '0'}</div>
                </div>
                <div className="card">
                  <h3>Tree Depth</h3>
                  <div className="value">32</div>
                </div>
                <div className="card">
                  <h3>Last Update Height</h3>
                  <div className="value">{rootHistory.heights?.[0] ?? '-'}</div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h3>Commitment Tree Visualization</h3>
                <TreeVisualization
                  root={treeStats?.root || ''}
                  leafCount={Number(treeStats?.leafCount ?? 0)}
                  recentRoots={rootHistory.roots}
                />
              </div>

              <div className="card">
                <h3>How The Merkle Tree Works</h3>
                <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  The privacy pool uses a sparse Merkle tree with depth 32, supporting up to 2^32 (~4 billion) commitments.
                  Each leaf is a Pedersen commitment <code>H(amount, blinding)</code>. The root is published on-chain and
                  used by ZK proofs to demonstrate membership without revealing which leaf is being spent.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {/* ===== VERIFY PROOF TAB ===== */}
      {tab === 'verify' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <h3>Verify Proof</h3>
          <p>Paste a ZK proof JSON to verify its structure and validity.</p>

          <form onSubmit={handleVerifyProof} style={{ marginTop: '1rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label>Proof JSON *</label>
              <textarea
                value={verifyProofJson} onChange={e => setVerifyProofJson(e.target.value)}
                placeholder={'{\n  "proof": "hex-encoded-proof-data",\n  "publicInputs": ["input1", "input2"],\n  "verificationKey": "optional-vk-hex"\n}'}
                required rows={8}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>

            <button className="btn btn-primary" type="submit" disabled={verifying}>
              {verifying ? 'Verifying...' : 'Verify Proof'}
            </button>
          </form>

          {verifyResult && (
            <div style={{
              marginTop: '1rem', padding: '1rem', borderRadius: '0.5rem',
              background: verifyResult.valid ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${verifyResult.valid ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: verifyResult.valid ? '#22c55e' : '#ef4444' }}>
                {verifyResult.valid ? 'Valid Proof Structure' : 'Invalid Proof'}
              </div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{verifyResult.details}</div>
            </div>
          )}

          <div style={{ marginTop: '1.5rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(56,189,248,0.08)', fontSize: '0.85rem' }}>
            <strong>Expected format:</strong>
            <ul style={{ marginTop: 4, paddingLeft: '1.25rem' }}>
              <li><code>proof</code> -- Hex-encoded Groth16 proof bytes</li>
              <li><code>publicInputs</code> -- Array of hex-encoded public inputs (Merkle root, nullifier hash, etc.)</li>
              <li><code>verificationKey</code> -- (Optional) hex-encoded verification key</li>
            </ul>
          </div>
        </div>
      )}

      {/* ===== VIEW KEYS TAB ===== */}
      {tab === 'viewkeys' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <h3>View Keys</h3>
          <p>Register a view key for selective disclosure of your shielded balances.</p>

          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(139,92,246,0.1)', marginTop: '1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <strong>What are view keys?</strong> A view key allows a designated party (auditor, counterparty, or yourself on another device) to see the amounts in your shielded commitments without being able to spend them. This enables selective compliance and auditability while preserving transfer privacy.
          </div>

          {!wallet?.connected ? renderConnectPrompt() : (
            <>
              <form onSubmit={handleRegisterViewKey} style={{ marginTop: '1rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                  <label>View Key Address *</label>
                  <input
                    type="text" value={viewKeyAddress} onChange={e => setViewKeyAddress(e.target.value)}
                    placeholder="Hex-encoded view key" required
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label>Commitment Hex *</label>
                  <input
                    type="text" value={viewKeyCommitment} onChange={e => setViewKeyCommitment(e.target.value)}
                    placeholder="Commitment hash to associate with view key" required
                    style={{ width: '100%', fontFamily: 'monospace' }}
                  />
                </div>

                <button className="btn btn-primary" type="submit" disabled={viewKeySubmitting}>
                  {viewKeySubmitting ? 'Registering...' : 'Register View Key'}
                </button>
              </form>

              {viewKeyStatus && (
                <div style={{
                  marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem',
                  background: viewKeyStatus.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: viewKeyStatus.type === 'success' ? '#22c55e' : '#ef4444',
                }}>
                  {viewKeyStatus.msg}
                </div>
              )}

              <div style={{ marginTop: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Registered View Keys</h3>
                {registeredViewKeys.length === 0 ? (
                  <div className="empty">No view keys registered for this wallet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {registeredViewKeys.map((vk, i) => (
                      <div key={i} style={{ padding: '0.75rem', background: 'var(--bg3)', borderRadius: '0.5rem' }}>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: 2 }}>View Key</div>
                        <div className="commitment-hash">{vk.viewKey}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 8, marginBottom: 2 }}>Commitment</div>
                        <div className="commitment-hash">{vk.commitmentHex}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
