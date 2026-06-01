import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import CopyButton from "../components/CopyButton.tsx";
import { useToast } from "../hooks/useToast.tsx";
import { getConnectedAddress } from "../lib/walletconnect.ts";
import { chainConfig } from "../lib/config.ts";
import {
  buildLaunchCommand,
  previewLaunch,
  type LaunchModelInput,
} from "../lib/launch-command.ts";

const RESERVE_DENOM = chainConfig.coinMinimalDenom; // e.g. "uclaw"
const RESERVE_LABEL = chainConfig.coinDenom; // e.g. "CLAW"

interface FormState {
  model: string;
  symbol: string;
  supply: string;
  name: string;
  description: string;
  feeBps: string;
  deployVault: boolean;
  seedReserve: string;
  seedInventory: string;
  seedDex: boolean;
  dexFactory: string;
  baseAmount: string;
  modelAmount: string;
}

const INITIAL_FORM: FormState = {
  model: "",
  symbol: "",
  supply: "1000000",
  name: "",
  description: "",
  feeBps: "30",
  deployVault: true,
  seedReserve: "",
  seedInventory: "",
  seedDex: false,
  dexFactory: "",
  baseAmount: "",
  modelAmount: "",
};

function toLaunchInput(form: FormState): LaunchModelInput {
  return {
    model: form.model,
    symbol: form.symbol || undefined,
    supply: form.supply,
    name: form.name || undefined,
    description: form.description || undefined,
    reserveDenom: RESERVE_DENOM,
    dexFactory: form.seedDex ? form.dexFactory || undefined : undefined,
    baseAmount: form.seedDex ? form.baseAmount || undefined : undefined,
    modelAmount: form.seedDex ? form.modelAmount || undefined : undefined,
    deployVault: form.deployVault,
    feeBps: form.feeBps || undefined,
    seedReserve: form.deployVault ? form.seedReserve || undefined : undefined,
    seedInventory: form.deployVault ? form.seedInventory || undefined : undefined,
  };
}

export default function LaunchModel() {
  useDocTitle("Launch a Model Token");
  const { addToast } = useToast();
  const issuer = getConnectedAddress();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const input = useMemo(() => toLaunchInput(form), [form]);
  const preview = useMemo(() => previewLaunch(input, issuer), [input, issuer]);

  const build = useMemo<{ command: string | null; error: string | null }>(() => {
    if (!form.model.trim()) {
      return { command: null, error: null };
    }
    try {
      return { command: buildLaunchCommand(input), error: null };
    } catch (e: unknown) {
      return {
        command: null,
        error: e instanceof Error ? e.message : "Invalid launch parameters",
      };
    }
  }, [input, form.model]);

  const onShowToast = () => {
    if (!build.command) return;
    addToast({
      type: "info",
      title: "Run this from the clawd CLI",
      message: "Issuance and vault deploy run via the CLI/SDK, not the browser.",
      duration: 6000,
    });
  };

  return (
    <>
      <div className="section-header">
        <div>
          <h1 className="page-title">Launch a Model Token</h1>
          <p className="page-subtitle">
            Guided wizard that derives the exact <code>clawd</code> command to register an
            AI model, mint its tokenfactory denom, and optionally deploy a{" "}
            <strong>ModelVault</strong> bonding-curve market. Issuance &amp; deploy run via
            the <code>clawd</code> CLI / SDK &mdash; not in the browser. Testnet only &mdash;
            not financial advice.
          </p>
        </div>
      </div>

      {/* Live denom / vault preview */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card" data-testid="launch-stat-subdenom">
          <h3>Subdenom</h3>
          <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginTop: 4 }}>
            {preview?.subdenom ?? "--"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            normalized from model id
          </div>
        </div>
        <div className="card" data-testid="launch-stat-denom">
          <h3>Factory Denom</h3>
          <div className="mono" style={{ fontSize: 11, wordBreak: "break-all", marginTop: 4 }}>
            {preview?.denom ?? "--"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {issuer ? "issuer = connected wallet" : "issuer resolved at run time"}
          </div>
        </div>
        <div className="card" data-testid="launch-stat-vault-label">
          <h3>Vault Label</h3>
          <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginTop: 4 }}>
            {form.deployVault ? preview?.vaultLabel ?? "--" : "--"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {form.deployVault ? "ModelVault instantiate label" : "vault deploy disabled"}
          </div>
        </div>
        <div className="card" data-testid="launch-stat-reserve">
          <h3>Reserve Asset</h3>
          <div className="value">{RESERVE_LABEL}</div>
          <div className="mono" style={{ fontSize: 12, color: "var(--text2)", marginTop: 4 }}>
            {RESERVE_DENOM}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="card" data-testid="launch-form" style={{ marginBottom: 24 }}>
        <h2>Model Token</h2>
        <div className="grid-2" style={{ gap: 16, marginTop: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Model id / OpenRouter ID *</span>
            <input
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="anthropic/claude-opus-4.8"
              aria-label="Model id"
              data-testid="launch-model-input"
              className="mono"
              style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Symbol / subdenom (optional)</span>
            <input
              value={form.symbol}
              onChange={(e) => set("symbol", e.target.value)}
              placeholder="defaults to normalized model id"
              aria-label="Symbol subdenom"
              data-testid="launch-symbol-input"
              className="mono"
              style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Initial supply *</span>
            <input
              value={form.supply}
              onChange={(e) => set("supply", e.target.value)}
              placeholder="1000000"
              aria-label="Initial supply"
              data-testid="launch-supply-input"
              inputMode="numeric"
              style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, color: "var(--text2)" }}>Display name (optional)</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Claude Opus 4.8"
              aria-label="Display name"
              data-testid="launch-name-input"
              style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
            />
          </label>
        </div>
        <label style={{ display: "block", marginTop: 16 }}>
          <span style={{ fontSize: 13, color: "var(--text2)" }}>Description (optional)</span>
          <input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Tokenized inference capacity for ..."
            aria-label="Description"
            data-testid="launch-description-input"
            style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
          />
        </label>
      </div>

      {/* ModelVault options */}
      <div className="card" data-testid="launch-vault-section" style={{ marginBottom: 24 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={form.deployVault}
            onChange={(e) => set("deployVault", e.target.checked)}
            data-testid="launch-deploy-vault"
          />
          <strong>Also deploy a ModelVault</strong> (bonding-curve market + dividend pool)
        </label>
        {form.deployVault && (
          <div className="grid-4" style={{ gap: 16, marginTop: 16 }}>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>Fee (bps)</span>
              <input
                value={form.feeBps}
                onChange={(e) => set("feeBps", e.target.value)}
                placeholder="30"
                aria-label="Fee bps"
                data-testid="launch-fee-bps-input"
                inputMode="numeric"
                style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>Seed reserve ({RESERVE_DENOM})</span>
              <input
                value={form.seedReserve}
                onChange={(e) => set("seedReserve", e.target.value)}
                placeholder="optional"
                aria-label="Seed reserve"
                data-testid="launch-seed-reserve-input"
                inputMode="numeric"
                style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>Seed inventory (model)</span>
              <input
                value={form.seedInventory}
                onChange={(e) => set("seedInventory", e.target.value)}
                placeholder="optional"
                aria-label="Seed inventory"
                data-testid="launch-seed-inventory-input"
                inputMode="numeric"
                style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Optional DEX seed */}
      <div className="card" data-testid="launch-dex-section" style={{ marginBottom: 24 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={form.seedDex}
            onChange={(e) => set("seedDex", e.target.checked)}
            data-testid="launch-seed-dex"
          />
          <strong>Seed an Astroport DEX pair</strong> (TOKEN/{RESERVE_LABEL})
        </label>
        {form.seedDex && (
          <div className="grid-4" style={{ gap: 16, marginTop: 16 }}>
            <label style={{ display: "block", gridColumn: "span 2" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>Astroport factory address</span>
              <input
                value={form.dexFactory}
                onChange={(e) => set("dexFactory", e.target.value)}
                placeholder="claw1..."
                aria-label="DEX factory address"
                data-testid="launch-dex-factory-input"
                className="mono"
                style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>Base amount ({RESERVE_DENOM})</span>
              <input
                value={form.baseAmount}
                onChange={(e) => set("baseAmount", e.target.value)}
                placeholder="optional"
                aria-label="DEX base amount"
                data-testid="launch-base-amount-input"
                inputMode="numeric"
                style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>Model amount</span>
              <input
                value={form.modelAmount}
                onChange={(e) => set("modelAmount", e.target.value)}
                placeholder="optional"
                aria-label="DEX model amount"
                data-testid="launch-model-amount-input"
                inputMode="numeric"
                style={{ padding: "6px 10px", width: "100%", marginTop: 4 }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Generated command */}
      <div className="card" data-testid="launch-command-section">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h2>Generated clawd command</h2>
          {build.command && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CopyButton text={build.command} label="Copy launch command" />
              <button className="btn-outline" data-testid="launch-show-toast" onClick={onShowToast}>
                How to run
              </button>
            </div>
          )}
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", marginBottom: 12 }}>
          Issuance and vault deploy run via the <code>clawd</code> CLI / SDK, not the browser.
          Copy this command and run it from a host with your signer mnemonic
          (<code>clawd init</code> first).
        </p>

        {build.error ? (
          <div data-testid="launch-command-error" style={{ color: "#ef4444" }}>
            {build.error}
          </div>
        ) : build.command ? (
          <pre
            data-testid="launch-command"
            className="mono"
            style={{
              background: "var(--bg2)",
              borderRadius: 6,
              padding: 12,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
            }}
          >
            {build.command}
          </pre>
        ) : (
          <div className="empty" data-testid="launch-command-empty">
            Enter a model id above to generate the launch command.
          </div>
        )}

        <p style={{ fontSize: 12, color: "var(--text2)", marginTop: 16 }}>
          After launching, view your token on the{" "}
          <Link to="/model-exchange">AI Model Exchange</Link>, inspect the vault on the{" "}
          <Link to="/vault-inspector">Vault Inspector</Link>, or browse markets on the{" "}
          <Link to="/model-markets">AI Stock Exchange</Link>.
        </p>
      </div>
    </>
  );
}
