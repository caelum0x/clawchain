/**
 * Resumable bootstrap flow for first-time provider setup.
 *
 * Orchestrates: key generation -> address derivation -> faucet funding ->
 * agent registration -> heartbeat. Each step is idempotent and persisted
 * to ~/.clawd/bootstrap-state.json so the flow can resume after failures.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { GasPrice, SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig, writeClawdConfig } from "./config.js";
import { generateMnemonic, saveMnemonic, loadMnemonic, mnemonicFileExists } from "./mnemonic.js";
import { CLAWD_HOME, CLAWD_MNEMONIC_PATH } from "./paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BootstrapState = {
  steps: {
    keyGenerated: boolean;
    addressDerived: boolean;
    funded: boolean;
    registered: boolean;
    heartbeatSent: boolean;
    gatewayStarted: boolean;
  };
  agentAddress?: string;
  fundingTxHash?: string;
  registerTxHash?: string;
  heartbeatTxHash?: string;
  lastUpdated: string;
};

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

const BOOTSTRAP_STATE_PATH = join(CLAWD_HOME, "bootstrap-state.json");

export function loadBootstrapState(): BootstrapState | null {
  try {
    const raw = readFileSync(BOOTSTRAP_STATE_PATH, "utf-8");
    return JSON.parse(raw) as BootstrapState;
  } catch {
    return null;
  }
}

export function saveBootstrapState(state: BootstrapState): void {
  state.lastUpdated = new Date().toISOString();
  mkdirSync(dirname(BOOTSTRAP_STATE_PATH), { recursive: true });
  writeFileSync(BOOTSTRAP_STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

export function resetBootstrapState(): void {
  try {
    unlinkSync(BOOTSTRAP_STATE_PATH);
  } catch {
    // File may not exist — that's fine.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function freshState(): BootstrapState {
  return {
    steps: {
      keyGenerated: false,
      addressDerived: false,
      funded: false,
      registered: false,
      heartbeatSent: false,
      gatewayStarted: false,
    },
    lastUpdated: new Date().toISOString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Bootstrap runner
// ---------------------------------------------------------------------------

export async function runBootstrap(opts: {
  skipFunding?: boolean;
  faucetUrl?: string;
}): Promise<BootstrapState> {
  const state = loadBootstrapState() ?? freshState();

  // Step 1 — Key check / generation
  if (!state.steps.keyGenerated) {
    console.log("bootstrap: step 1/5 — checking key...");
    if (!mnemonicFileExists()) {
      const mnemonic = await generateMnemonic();
      saveMnemonic(mnemonic);
      console.log(`  Mnemonic generated and saved to ${CLAWD_MNEMONIC_PATH}`);
    } else {
      console.log("  Mnemonic already exists, skipping generation.");
    }
    state.steps.keyGenerated = true;
    saveBootstrapState(state);
  }

  // Step 2 — Address derivation
  if (!state.steps.addressDerived) {
    console.log("bootstrap: step 2/5 — deriving address...");
    const mnemonic = loadMnemonic();
    if (!mnemonic) {
      throw new Error("Failed to load mnemonic after key generation.");
    }

    const cfg = loadClawdConfig();
    const prefix = cfg.prefix ?? "claw";
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    const [account] = await wallet.getAccounts();
    if (!account) {
      throw new Error("Failed to derive wallet account.");
    }

    state.agentAddress = account.address;
    console.log(`  Address: ${account.address}`);

    // Persist address to config
    writeClawdConfig({ ...cfg, agentAddress: account.address });

    state.steps.addressDerived = true;
    saveBootstrapState(state);
  }

  // Step 3 — Funding
  if (!state.steps.funded) {
    console.log("bootstrap: step 3/5 — checking balance / funding...");
    const cfg = loadClawdConfig();
    const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
    const denom = cfg.denom ?? "uclaw";
    const address = state.agentAddress!;

    if (opts.skipFunding) {
      console.log("  Funding skipped (--skip-funding).");
      state.steps.funded = true;
      saveBootstrapState(state);
    } else {
      const client = await StargateClient.connect(rpcUrl);
      try {
        const balance = await client.getBalance(address, denom);
        const amount = BigInt(balance.amount);

        if (amount < 2_000_000n) {
          const faucetUrl = (opts.faucetUrl ?? cfg.faucetUrl ?? "http://localhost:8888").replace(/\/+$/, "");
          console.log(`  Balance ${balance.amount}${denom} < 2000000${denom}. Requesting faucet at ${faucetUrl}...`);

          const faucetRes = await fetch(`${faucetUrl}/credit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, denom }),
            signal: AbortSignal.timeout(15_000),
          });

          if (!faucetRes.ok) {
            const body = await faucetRes.text().catch(() => "");
            throw new Error(`Faucet request failed (HTTP ${faucetRes.status}): ${body}`);
          }

          const faucetData = (await faucetRes.json().catch(() => ({}))) as Record<string, unknown>;
          state.fundingTxHash = typeof faucetData.txHash === "string" ? faucetData.txHash : undefined;

          console.log("  Waiting for funding to confirm...");
          await sleep(5_000);

          // Verify balance increased
          const newBalance = await client.getBalance(address, denom);
          const newAmount = BigInt(newBalance.amount);
          if (newAmount < 2_000_000n) {
            throw new Error(
              `Balance still insufficient after faucet (${newBalance.amount}${denom}). ` +
              "Faucet may be depleted or transaction not yet confirmed.",
            );
          }
          console.log(`  Funded: ${newBalance.amount}${denom}`);
        } else {
          console.log(`  Balance sufficient: ${balance.amount}${denom}`);
        }

        state.steps.funded = true;
        saveBootstrapState(state);
      } finally {
        client.disconnect();
      }
    }
  }

  // Step 4 — Registration
  if (!state.steps.registered) {
    console.log("bootstrap: step 4/5 — registering agent...");
    const cfg = loadClawdConfig();
    const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
    const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
    const prefix = cfg.prefix ?? "claw";
    const denom = cfg.denom ?? "uclaw";
    const gasPrice = cfg.gasPrice ?? `0.025${denom}`;
    const address = state.agentAddress!;

    // Check if already registered
    let alreadyRegistered = false;
    try {
      const agentRes = await fetch(
        `${restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(address)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (agentRes.ok) {
        const data = (await agentRes.json()) as { registered?: boolean };
        alreadyRegistered = Boolean(data.registered);
      }
    } catch {
      // Not registered or node unreachable — proceed with registration.
    }

    if (alreadyRegistered) {
      console.log("  Agent already registered on-chain, skipping.");
    } else {
      const mnemonic = loadMnemonic();
      if (!mnemonic) {
        throw new Error("Failed to load mnemonic for registration.");
      }
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
      const [account] = await wallet.getAccounts();
      if (!account) {
        throw new Error("Failed to derive wallet account for registration.");
      }

      const pubkeyHex = Buffer.from(account.pubkey).toString("hex");
      const endpoint = cfg.messagingEndpoint ?? `http://localhost:${cfg.messagingPort ?? 7777}`;
      const name = cfg.moniker ?? "clawd-agent";

      const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
        gasPrice: GasPrice.fromString(gasPrice),
      });

      try {
        const msg = {
          typeUrl: "/clawchain.agent.v1.MsgRegisterAgent",
          value: {
            creator: account.address,
            pubkey: pubkeyHex,
            endpoint,
            name,
            supportedTools: [],
            pricingHint: "",
            version: "clawd/0.1.0",
          },
        };

        const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
        if (res.code !== 0) {
          throw new Error(`Registration tx failed (code=${res.code}): ${res.rawLog}`);
        }
        state.registerTxHash = res.transactionHash;
        console.log(`  Registered: txHash=${res.transactionHash}`);
      } finally {
        signingClient.disconnect();
      }
    }

    state.steps.registered = true;
    saveBootstrapState(state);
  }

  // Step 5 — Heartbeat
  if (!state.steps.heartbeatSent) {
    console.log("bootstrap: step 5/5 — sending heartbeat...");
    const cfg = loadClawdConfig();
    const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
    const prefix = cfg.prefix ?? "claw";
    const denom = cfg.denom ?? "uclaw";
    const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

    const mnemonic = loadMnemonic();
    if (!mnemonic) {
      throw new Error("Failed to load mnemonic for heartbeat.");
    }
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    const [account] = await wallet.getAccounts();
    if (!account) {
      throw new Error("Failed to derive wallet account for heartbeat.");
    }

    // Get current block height
    let nodeHeight = 0;
    try {
      const statusRes = await fetch(`${rpcUrl.replace(/\/?$/, "")}/status`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as {
          result?: { sync_info?: { latest_block_height?: string } };
        };
        nodeHeight = parseInt(statusData.result?.sync_info?.latest_block_height ?? "0", 10);
      }
    } catch {
      /* use 0 */
    }

    const endpoint = cfg.messagingEndpoint ?? "";
    const metadata = JSON.stringify({ version: "clawd/0.1.0" });

    const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
      gasPrice: GasPrice.fromString(gasPrice),
    });

    try {
      const msg = {
        typeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
        value: {
          creator: account.address,
          nodeHeight: BigInt(nodeHeight),
          endpoint,
          metadata,
        },
      };

      const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
      if (res.code !== 0) {
        throw new Error(`Heartbeat tx failed (code=${res.code}): ${res.rawLog}`);
      }
      state.heartbeatTxHash = res.transactionHash;
      console.log(`  Heartbeat sent: txHash=${res.transactionHash}`);
    } finally {
      signingClient.disconnect();
    }

    state.steps.heartbeatSent = true;
    saveBootstrapState(state);
  }

  console.log("bootstrap: all steps complete.");
  return state;
}
