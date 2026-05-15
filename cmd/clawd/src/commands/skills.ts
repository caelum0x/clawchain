/**
 * `clawd skills` subcommands — publish, price, delist, sales for skill
 * marketplace providers.
 *
 * Provider-side complement to the consumer-facing `clawd skill` commands.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr, truncate } from "../lib/format.js";

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
  skill_id?: string;
  owner?: string;
  name?: string;
  description?: string;
  price?: string;
  denom?: string;
  category?: string;
  active?: boolean;
  purchaseCount?: number;
  purchase_count?: number;
};

type SkillAnalytics = {
  skill_id?: string;
  total_revenue?: string;
  total_purchases?: number;
  revenue_by_period?: { period?: string; revenue?: string; count?: number }[];
};

// ---------------------------------------------------------------------------
// clawd skills list
// ---------------------------------------------------------------------------

export type SkillsListOptions = {
  json?: boolean;
  owner?: string;
  category?: string;
};

export async function runSkillsList(opts: SkillsListOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let url: string;
  if (opts.owner) {
    url = `${restUrl}/clawchain/marketplace/v1/skills_by_owner/${encodeURIComponent(opts.owner)}`;
  } else if (opts.category) {
    url = `${restUrl}/clawchain/marketplace/v1/skills/category/${encodeURIComponent(opts.category)}`;
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

    const headers = ["ID", "Name", "Owner", "Category", "Price", "Active", "Purchases"];
    const rows = skills.map((s) => [
      String(s.id ?? s.skill_id ?? 0),
      truncate(String(s.name ?? ""), 30),
      shortAddr(String(s.owner ?? "")),
      String(s.category ?? "-"),
      s.price ? formatClaw(s.price) : "-",
      String(s.active ?? true),
      String(s.purchaseCount ?? s.purchase_count ?? 0),
    ]);

    console.log(`Skills (${skills.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query skills: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd skills publish
// ---------------------------------------------------------------------------

export type SkillsPublishOptions = {
  name: string;
  description: string;
  price: string;
  category?: string;
  denom?: string;
};

export async function runSkillsPublish(opts: SkillsPublishOptions): Promise<void> {
  const { denom, account, signingClient } = await ensureSigner();

  const skillDenom = opts.denom ?? denom;

  console.log(`Publishing skill "${opts.name}"...`);

  const msg = {
    typeUrl: "/clawchain.marketplace.v1.MsgListSkill",
    value: {
      creator: account.address,
      name: opts.name,
      description: opts.description,
      price: opts.price,
      denom: skillDenom,
      category: opts.category ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Skill publish failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    // Extract skill_id from events
    let skillId = "unknown";
    for (const event of res.events ?? []) {
      if (event.type === "skill_listed" || event.type === "list_skill") {
        const attr = event.attributes.find(
          (a: { key: string }) => a.key === "skill_id",
        );
        if (attr) {
          skillId = typeof attr.value === "string" ? attr.value : new TextDecoder().decode(attr.value);
          break;
        }
      }
    }

    console.log(`Skill published successfully.`);
    console.log(`  Skill ID:    ${skillId}`);
    console.log(`  Name:        ${opts.name}`);
    console.log(`  Price:       ${formatClaw(opts.price)} (${skillDenom})`);
    if (opts.category) {
      console.log(`  Category:    ${opts.category}`);
    }
    console.log(`  TxHash:      ${res.transactionHash}`);
  } catch (err) {
    console.error(`Skill publish failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd skills price
// ---------------------------------------------------------------------------

export type SkillsPriceOptions = {
  skillId: string;
  price: string;
};

export async function runSkillsPrice(opts: SkillsPriceOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Updating price for skill #${opts.skillId}...`);

  const msg = {
    typeUrl: "/clawchain.marketplace.v1.MsgUpdateSkill",
    value: {
      creator: account.address,
      skillId: opts.skillId,
      price: opts.price,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Price update failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Skill #${opts.skillId} price updated.`);
    console.log(`  New Price: ${formatClaw(opts.price)}`);
    console.log(`  TxHash:    ${res.transactionHash}`);
  } catch (err) {
    console.error(`Price update failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd skills delist
// ---------------------------------------------------------------------------

export type SkillsDelistOptions = {
  skillId: string;
};

export async function runSkillsDelist(opts: SkillsDelistOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Delisting skill #${opts.skillId}...`);

  const msg = {
    typeUrl: "/clawchain.marketplace.v1.MsgDelistSkill",
    value: {
      creator: account.address,
      skillId: opts.skillId,
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Delist failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Skill #${opts.skillId} delisted.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Delist failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd skills sales
// ---------------------------------------------------------------------------

export type SkillsSalesOptions = {
  json?: boolean;
  skillId?: string;
};

export async function runSkillsSales(opts: SkillsSalesOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  if (!opts.skillId) {
    console.error("Error: --skill-id is required for sales analytics.");
    process.exit(1);
  }

  const url = `${restUrl}/clawchain/marketplace/v1/skill_analytics/${encodeURIComponent(opts.skillId)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.error(`Skill #${opts.skillId} not found.`);
      } else {
        console.error(`Failed to query skill analytics (HTTP ${res.status}).`);
      }
      process.exit(1);
    }

    const data = (await res.json()) as { analytics?: SkillAnalytics };
    const analytics = (data.analytics ?? data) as SkillAnalytics;

    if (opts.json) {
      process.stdout.write(JSON.stringify(analytics, null, 2) + "\n");
      return;
    }

    console.log(`Sales Analytics for Skill #${opts.skillId}\n`);
    console.log(`  Total Revenue:   ${formatClaw(String(analytics.total_revenue ?? "0"))}`);
    console.log(`  Total Purchases: ${analytics.total_purchases ?? 0}`);

    const periods = analytics.revenue_by_period ?? [];
    if (periods.length > 0) {
      console.log(`\n  Revenue by Period:`);

      const headers = ["Period", "Revenue", "Count"];
      const rows = periods.map((p: { period?: string; revenue?: string; count?: number }) => [
        String(p.period ?? "-"),
        formatClaw(String(p.revenue ?? "0")),
        String(p.count ?? 0),
      ]);

      console.log(table(headers, rows));
    }

    console.log();
  } catch (err) {
    console.error(`Failed to query skill analytics: ${String(err)}`);
    process.exit(1);
  }
}
