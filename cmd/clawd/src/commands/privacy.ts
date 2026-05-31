/**
 * `clawd privacy` subcommands — shield, unshield, tree stats, nullifier check.
 */

import { GasPrice } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { connectClawchainSigningClient } from "../lib/signing.js";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { formatClaw, shortAddr } from "../lib/format.js";
import * as crypto from "crypto";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

async function ensureSigner() {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

  if (!mnemonicFileExists()) {
    throw new Error('No mnemonic found. Run "clawd init" first.');
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("Failed to load mnemonic.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error("Failed to derive wallet account.");
  }

  const signingClient = await connectClawchainSigningClient(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return { cfg, rpcUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// clawd privacy shield
// ---------------------------------------------------------------------------

export type PrivacyShieldOptions = {
  amount: string;
};

export async function runPrivacyShield(opts: PrivacyShieldOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureSigner();

  const amount = parseInt(opts.amount, 10);
  if (isNaN(amount) || amount <= 0) {
    console.error("Amount must be a positive integer (in uclaw).");
    process.exit(1);
  }

  // Generate a cryptographically secure 32-byte blinding factor
  const blinding = crypto.randomBytes(32);

  console.log(`Shielding ${formatClaw(String(amount))} into the private pool...`);

  const msg = {
    typeUrl: "/clawchain.privacy.v1.MsgShield",
    value: {
      creator: account.address,
      amount: String(amount),
      coins: `${amount}${denom}`,
      blinding: blinding,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Shield failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    // Extract commitment from events
    let commitment = "";
    for (const event of res.events ?? []) {
      if (event.type === "shield") {
        const attr = event.attributes.find(
          (a: { key: string }) => a.key === "commitment",
        );
        if (attr) {
          commitment = typeof attr.value === "string" ? attr.value : new TextDecoder().decode(attr.value);
          break;
        }
      }
    }

    console.log(`Shielded ${formatClaw(String(amount))} successfully.`);
    if (commitment) {
      console.log(`  Commitment: ${commitment}`);
      console.log("  (Save this commitment — you'll need it to unshield or transfer privately.)");
    }
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Shield failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd privacy unshield
// ---------------------------------------------------------------------------

export type PrivacyUnshieldOptions = {
  commitment: string;
  nullifier: string;
  proof: string;
  amount: string;
  recipient?: string;
  root: string;
};

export async function runPrivacyUnshield(opts: PrivacyUnshieldOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  const amount = parseInt(opts.amount, 10);
  if (isNaN(amount) || amount <= 0) {
    console.error("Amount must be a positive integer (in uclaw).");
    process.exit(1);
  }

  const recipient = opts.recipient ?? account.address;

  console.log(`Unshielding ${formatClaw(String(amount))} to ${shortAddr(recipient)}...`);

  const msg = {
    typeUrl: "/clawchain.privacy.v1.MsgUnshield",
    value: {
      creator: account.address,
      commitment: opts.commitment,
      nullifier: opts.nullifier,
      proof: opts.proof,
      amount: String(amount),
      recipient: recipient,
      root: opts.root,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Unshield failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Unshielded ${formatClaw(String(amount))} to ${shortAddr(recipient)}.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Unshield failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd privacy tree-stats
// ---------------------------------------------------------------------------

export type PrivacyTreeStatsOptions = {
  json?: boolean;
};

export async function runPrivacyTreeStats(opts: PrivacyTreeStatsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/privacy/v1/tree_stats`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query tree stats (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as Record<string, any>;

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return;
    }

    const leafCount = data.leaf_count ?? data.leafCount ?? "0";
    const depth = data.depth ?? "0";
    const root = data.root ?? "N/A";

    console.log("Privacy Merkle Tree\n");
    console.log(`  Leaf Count: ${leafCount}`);
    console.log(`  Depth:      ${depth}`);
    console.log(`  Root:       ${root}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query tree stats: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd privacy nullifier-check
// ---------------------------------------------------------------------------

export type PrivacyNullifierCheckOptions = {
  nullifier: string;
  json?: boolean;
};

export async function runPrivacyNullifierCheck(opts: PrivacyNullifierCheckOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/privacy/v1/nullifier_exists/${encodeURIComponent(opts.nullifier)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to check nullifier (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { exists?: boolean };
    const exists = data.exists ?? false;

    if (opts.json) {
      process.stdout.write(JSON.stringify({ nullifier: opts.nullifier, exists }, null, 2) + "\n");
      return;
    }

    if (exists) {
      console.log(`Nullifier ${opts.nullifier.slice(0, 16)}... has been spent.`);
    } else {
      console.log(`Nullifier ${opts.nullifier.slice(0, 16)}... has NOT been spent.`);
    }
  } catch (err) {
    console.error(`Failed to check nullifier: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd privacy merkle-root
// ---------------------------------------------------------------------------

export type PrivacyMerkleRootOptions = {
  json?: boolean;
};

export async function runPrivacyMerkleRoot(opts: PrivacyMerkleRootOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/privacy/v1/merkle_root`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query Merkle root (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { root?: string };
    const root = data.root ?? "N/A";

    if (opts.json) {
      process.stdout.write(JSON.stringify({ root }, null, 2) + "\n");
      return;
    }

    console.log(`Current Merkle Root: ${root}`);
  } catch (err) {
    console.error(`Failed to query Merkle root: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd privacy root-history
// ---------------------------------------------------------------------------

export type PrivacyRootHistoryOptions = {
  json?: boolean;
};

export async function runPrivacyRootHistory(opts: PrivacyRootHistoryOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/privacy/v1/root_history`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query root history (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { roots?: string[] };
    const roots = data.roots ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ roots }, null, 2) + "\n");
      return;
    }

    if (roots.length === 0) {
      console.log("No root history found.");
      return;
    }

    console.log(`Merkle Root History (${roots.length} entries)\n`);
    for (let i = 0; i < roots.length; i++) {
      console.log(`  ${i + 1}. ${roots[i]}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query root history: ${String(err)}`);
    process.exit(1);
  }
}
