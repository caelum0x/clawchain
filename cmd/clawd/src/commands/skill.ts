/**
 * `clawd skill` subcommands — list, create, purchase marketplace skills.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr } from "../lib/format.js";

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

  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return { cfg, rpcUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SkillInfo = {
  id?: number;
  owner?: string;
  name?: string;
  description?: string;
  price?: string;
  denom?: string;
  active?: boolean;
  purchaseCount?: number;
  purchase_count?: number;
};

// ---------------------------------------------------------------------------
// clawd skill list
// ---------------------------------------------------------------------------

export type SkillListOptions = {
  category?: string;
  search?: string;
  owner?: string;
  json?: boolean;
};

export async function runSkillList(opts: SkillListOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let url: string;
  if (opts.search) {
    url = `${restUrl}/clawchain/marketplace/v1/skills/search/${encodeURIComponent(opts.search)}`;
  } else if (opts.category) {
    url = `${restUrl}/clawchain/marketplace/v1/skills/category/${encodeURIComponent(opts.category)}`;
  } else if (opts.owner) {
    url = `${restUrl}/clawchain/marketplace/v1/skills/owner/${encodeURIComponent(opts.owner)}`;
  } else {
    url = `${restUrl}/clawchain/marketplace/v1/skills`;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query skills (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { skills?: SkillInfo[] };
    const skills = data.skills ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ skills }, null, 2) + "\n");
      return;
    }

    if (skills.length === 0) {
      console.log("No skills found.");
      return;
    }

    const headers = ["ID", "Name", "Owner", "Price", "Active", "Purchases"];
    const rows = skills.map((s) => [
      String(s.id ?? 0),
      String(s.name ?? ""),
      shortAddr(String(s.owner ?? "")),
      s.price ? formatClaw(s.price) : "-",
      String(s.active ?? true),
      String(s.purchaseCount ?? s.purchase_count ?? 0),
    ]);

    console.log(`Marketplace Skills (${skills.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query skills: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd skill create
// ---------------------------------------------------------------------------

export type SkillCreateOptions = {
  name: string;
  description: string;
  price: string;
  denom?: string;
};

export async function runSkillCreate(opts: SkillCreateOptions): Promise<void> {
  const { cfg, rpcUrl, denom, account, signingClient } = await ensureSigner();

  const skillDenom = opts.denom ?? denom;

  console.log(`Creating skill "${opts.name}"...`);

  const msg = {
    typeUrl: "/clawchain.marketplace.v1.MsgListSkill",
    value: {
      creator: account.address,
      name: opts.name,
      description: opts.description,
      price: opts.price,
      denom: skillDenom,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Skill creation failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Skill listed successfully.`);
    console.log(`  Name:     ${opts.name}`);
    console.log(`  Price:    ${formatClaw(opts.price)} (${skillDenom})`);
    console.log(`  TxHash:   ${res.transactionHash}`);
  } catch (err) {
    console.error(`Skill creation failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd skill purchase
// ---------------------------------------------------------------------------

export type SkillPurchaseOptions = {
  skillId: number;
};

export async function runSkillPurchase(opts: SkillPurchaseOptions): Promise<void> {
  const { cfg, rpcUrl, account, signingClient } = await ensureSigner();

  console.log(`Purchasing skill #${opts.skillId}...`);

  const msg = {
    typeUrl: "/clawchain.marketplace.v1.MsgPurchaseSkill",
    value: {
      creator: account.address,
      skillId: BigInt(opts.skillId),
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Purchase failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }
    console.log(`Skill #${opts.skillId} purchased successfully.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Purchase failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
