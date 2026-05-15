#!/usr/bin/env node

import { Command } from "commander";
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DatasetInfo = {
  id: string;
  name: string;
  description: string;
  category: string;
  format: string;
  sampleRows: number;
  fields: string[];
};

// ---------------------------------------------------------------------------
// Dataset Registry
// ---------------------------------------------------------------------------

export const DATASETS: DatasetInfo[] = [
  {
    id: "blocks",
    name: "ClawChain Blocks",
    description:
      "Block headers with height, time, hash, proposer, num_txs, gas",
    category: "core",
    format: "csv",
    sampleRows: 1000,
    fields: [
      "height",
      "time",
      "hash",
      "proposer",
      "num_txs",
      "gas_used",
      "gas_wanted",
    ],
  },
  {
    id: "transactions",
    name: "ClawChain Transactions",
    description:
      "All transactions with hash, type, sender, gas, fee, status",
    category: "core",
    format: "csv",
    sampleRows: 5000,
    fields: [
      "height",
      "tx_hash",
      "msg_type",
      "sender",
      "gas_used",
      "fee",
      "success",
      "memo",
    ],
  },
  {
    id: "agent-registry",
    name: "Agent Registry",
    description:
      "All registered agents with name, capabilities, reputation, tasks completed",
    category: "agents",
    format: "csv",
    sampleRows: 500,
    fields: [
      "address",
      "name",
      "status",
      "capabilities",
      "reputation_score",
      "tasks_completed",
      "registered_at",
    ],
  },
  {
    id: "agent-tasks",
    name: "Agent Task History",
    description:
      "Task delegation, acceptance, completion events with budgets and outcomes",
    category: "agents",
    format: "csv",
    sampleRows: 2000,
    fields: [
      "task_id",
      "delegator",
      "assignee",
      "budget",
      "status",
      "created_at",
      "completed_at",
      "quality_tier",
    ],
  },
  {
    id: "dex-swaps",
    name: "ClawDEX Swap History",
    description:
      "All DEX swap transactions with pool, assets, amounts, slippage",
    category: "defi",
    format: "csv",
    sampleRows: 3000,
    fields: [
      "height",
      "tx_hash",
      "pool",
      "sender",
      "offer_asset",
      "offer_amount",
      "return_asset",
      "return_amount",
      "spread",
    ],
  },
  {
    id: "dex-liquidity",
    name: "ClawDEX Liquidity Snapshots",
    description:
      "Hourly liquidity snapshots for all pools (TVL, reserves, LP tokens)",
    category: "defi",
    format: "csv",
    sampleRows: 1000,
    fields: [
      "timestamp",
      "pool",
      "asset0_reserve",
      "asset1_reserve",
      "total_share",
      "tvl_uclaw",
    ],
  },
  {
    id: "privacy-events",
    name: "Privacy Shield/Unshield Events",
    description:
      "Shield and unshield events (public metadata only, no private data)",
    category: "privacy",
    format: "csv",
    sampleRows: 500,
    fields: [
      "height",
      "tx_hash",
      "action",
      "amount",
      "nullifier_used",
      "commitment_created",
    ],
  },
  {
    id: "staking-history",
    name: "Staking Delegation History",
    description: "Delegation, undelegation, and reward claim events",
    category: "staking",
    format: "csv",
    sampleRows: 2000,
    fields: [
      "height",
      "tx_hash",
      "action",
      "delegator",
      "validator",
      "amount",
      "timestamp",
    ],
  },
  {
    id: "governance-votes",
    name: "Governance Voting History",
    description:
      "All governance proposal votes with voter, option, weight",
    category: "governance",
    format: "csv",
    sampleRows: 500,
    fields: [
      "proposal_id",
      "proposal_title",
      "voter",
      "option",
      "weight",
      "timestamp",
      "status",
    ],
  },
  {
    id: "marketplace-skills",
    name: "Marketplace Skill Listings",
    description:
      "All skills listed on the marketplace with pricing and purchase counts",
    category: "marketplace",
    format: "csv",
    sampleRows: 300,
    fields: [
      "skill_id",
      "name",
      "owner",
      "category",
      "price_uclaw",
      "purchase_count",
      "rating",
      "listed_at",
    ],
  },
  {
    id: "gpu-compute-jobs",
    name: "GPU Compute Job History",
    description:
      "GPU compute job submissions, completions, and earnings",
    category: "compute",
    format: "csv",
    sampleRows: 1000,
    fields: [
      "job_id",
      "provider",
      "requester",
      "vram_gb",
      "duration_hours",
      "cost_uclaw",
      "status",
      "submitted_at",
      "completed_at",
    ],
  },
  {
    id: "token-transfers",
    name: "CLAW Token Transfers",
    description: "All CLAW token transfer events between addresses",
    category: "core",
    format: "csv",
    sampleRows: 5000,
    fields: [
      "height",
      "tx_hash",
      "sender",
      "recipient",
      "amount_uclaw",
      "memo",
      "timestamp",
    ],
  },
];

// ---------------------------------------------------------------------------
// Deterministic PRNG (Mulberry32)
// ---------------------------------------------------------------------------

export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Helpers for sample data generation
// ---------------------------------------------------------------------------

function randomHex(rng: () => number, len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(rng() * chars.length)];
  }
  return out;
}

function randomAddress(rng: () => number): string {
  return "claw1" + randomHex(rng, 38);
}

function randomValidatorAddress(rng: () => number): string {
  return "clawvaloper1" + randomHex(rng, 38);
}

function randomTxHash(rng: () => number): string {
  return randomHex(rng, 64).toUpperCase();
}

function randomBlockHash(rng: () => number): string {
  return randomHex(rng, 64).toUpperCase();
}

function weightedChoice<T>(rng: () => number, choices: [T, number][]): T {
  const total = choices.reduce((s, c) => s + c[1], 0);
  let r = rng() * total;
  for (const [val, weight] of choices) {
    r -= weight;
    if (r <= 0) return val;
  }
  return choices[choices.length - 1][0];
}

function isoTimestamp(base: Date, offsetSeconds: number): string {
  return new Date(base.getTime() + offsetSeconds * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Per-dataset sample generators
// ---------------------------------------------------------------------------

const BASE_DATE = new Date("2026-01-01T00:00:00Z");

const MSG_TYPES = [
  "/cosmos.bank.v1beta1.MsgSend",
  "/clawchain.agent.v1.MsgRegisterAgent",
  "/clawchain.agent.v1.MsgAgentAction",
  "/clawchain.agent.v1.MsgDelegateTask",
  "/clawchain.agent.v1.MsgCompleteTask",
  "/clawchain.privacy.v1.MsgShield",
  "/clawchain.privacy.v1.MsgUnshield",
  "/clawchain.privacy.v1.MsgPrivateTransfer",
  "/cosmos.staking.v1beta1.MsgDelegate",
  "/cosmos.staking.v1beta1.MsgUndelegate",
  "/cosmos.gov.v1.MsgVote",
  "/cosmwasm.wasm.v1.MsgExecuteContract",
];

const AGENT_NAMES = [
  "DataOracle", "InferenceBot", "StakeGuard", "AuditAgent",
  "BridgeKeeper", "PriceMonitor", "GovernanceBot", "ModelTrainer",
  "TaskRouter", "ReputationTracker", "ComplianceBot", "MarketMaker",
  "LiquidityManager", "SecurityScanner", "MetricsCollector",
];

const CAPABILITIES = [
  "inference", "data-collection", "monitoring", "staking",
  "governance", "bridging", "auditing", "training",
  "routing", "analytics", "compliance", "market-making",
];

const QUALITY_TIERS = ["gold", "silver", "bronze"];

const OFFER_ASSETS = ["uclaw", "uatom", "uosmo"];
const POOL_NAMES = ["CLAW-ATOM", "CLAW-OSMO", "CLAW-USDC", "ATOM-OSMO"];

const PROPOSAL_TITLES = [
  "Increase agent staking minimum",
  "Add new compute provider tier",
  "Update privacy pool parameters",
  "Reduce marketplace listing fee",
  "Enable cross-chain agent discovery",
  "Upgrade governance quorum threshold",
  "Fund developer grants program",
  "Modify block gas limit",
];

const VOTE_OPTIONS = ["VOTE_OPTION_YES", "VOTE_OPTION_NO", "VOTE_OPTION_ABSTAIN", "VOTE_OPTION_NO_WITH_VETO"];

const SKILL_NAMES = [
  "Image Classification", "Text Summarization", "Sentiment Analysis",
  "Object Detection", "Translation", "Code Review", "Data Cleaning",
  "Anomaly Detection", "Forecasting", "Embeddings Generation",
  "Speech-to-Text", "Document OCR", "Price Prediction", "Risk Assessment",
];

const SKILL_CATEGORIES = ["ml", "nlp", "vision", "data", "finance", "security"];

type RowGenerator = (
  rng: () => number,
  index: number,
  limit: number,
) => Record<string, unknown>;

const GENERATORS: Record<string, RowGenerator> = {
  blocks: (rng, i) => ({
    height: 1000000 + i,
    time: isoTimestamp(BASE_DATE, i * 6),
    hash: randomBlockHash(rng),
    proposer: randomValidatorAddress(rng),
    num_txs: Math.floor(rng() * 50) + 1,
    gas_used: Math.floor(rng() * 5000000) + 100000,
    gas_wanted: Math.floor(rng() * 8000000) + 200000,
  }),

  transactions: (rng, i) => {
    const success = weightedChoice(rng, [
      [true, 80],
      [false, 20],
    ]);
    return {
      height: 1000000 + Math.floor(i / 3),
      tx_hash: randomTxHash(rng),
      msg_type: MSG_TYPES[Math.floor(rng() * MSG_TYPES.length)],
      sender: randomAddress(rng),
      gas_used: Math.floor(rng() * 200000) + 50000,
      fee: Math.floor(rng() * 50000) + 500,
      success,
      memo: rng() > 0.7 ? "auto-" + randomHex(rng, 4) : "",
    };
  },

  "agent-registry": (rng, i) => {
    const numCaps = Math.floor(rng() * 3) + 1;
    const caps: string[] = [];
    while (caps.length < numCaps) {
      const c = CAPABILITIES[Math.floor(rng() * CAPABILITIES.length)];
      if (!caps.includes(c)) caps.push(c);
    }
    return {
      address: randomAddress(rng),
      name: AGENT_NAMES[Math.floor(rng() * AGENT_NAMES.length)] + "-" + (i + 1),
      status: weightedChoice(rng, [
        ["active", 75],
        ["inactive", 15],
        ["slashed", 10],
      ]),
      capabilities: caps.join(";"),
      reputation_score: Math.floor(rng() * 500 + 500),
      tasks_completed: Math.floor(rng() * rng() * 1000),
      registered_at: isoTimestamp(BASE_DATE, Math.floor(rng() * 5000000)),
    };
  },

  "agent-tasks": (rng, i) => {
    const status = weightedChoice(rng, [
      ["completed", 60],
      ["in_progress", 20],
      ["accepted", 10],
      ["failed", 7],
      ["expired", 3],
    ]);
    const createdOffset = Math.floor(rng() * 5000000);
    const completedOffset =
      status === "completed" || status === "failed"
        ? createdOffset + Math.floor(rng() * 86400)
        : 0;
    return {
      task_id: "task-" + randomHex(rng, 8),
      delegator: randomAddress(rng),
      assignee: randomAddress(rng),
      budget: Math.floor(rng() * rng() * 10000000) + 10000,
      status,
      created_at: isoTimestamp(BASE_DATE, createdOffset),
      completed_at:
        completedOffset > 0 ? isoTimestamp(BASE_DATE, completedOffset) : "",
      quality_tier: status === "completed"
        ? QUALITY_TIERS[Math.floor(rng() * QUALITY_TIERS.length)]
        : "",
    };
  },

  "dex-swaps": (rng, i) => {
    const offerAsset =
      OFFER_ASSETS[Math.floor(rng() * OFFER_ASSETS.length)];
    const returnAsset =
      OFFER_ASSETS.filter((a) => a !== offerAsset)[
        Math.floor(rng() * (OFFER_ASSETS.length - 1))
      ];
    const offerAmount = Math.floor(rng() * rng() * 50000000) + 100000;
    const spread = rng() * 0.03;
    const returnAmount = Math.floor(offerAmount * (1 - spread) * (0.8 + rng() * 0.4));
    return {
      height: 1000000 + Math.floor(i / 2),
      tx_hash: randomTxHash(rng),
      pool: POOL_NAMES[Math.floor(rng() * POOL_NAMES.length)],
      sender: randomAddress(rng),
      offer_asset: offerAsset,
      offer_amount: offerAmount,
      return_asset: returnAsset,
      return_amount: returnAmount,
      spread: spread.toFixed(6),
    };
  },

  "dex-liquidity": (rng, i) => {
    const pool = POOL_NAMES[Math.floor(rng() * POOL_NAMES.length)];
    const asset0 = Math.floor(rng() * 500000000000) + 1000000000;
    const asset1 = Math.floor(rng() * 500000000000) + 1000000000;
    return {
      timestamp: isoTimestamp(BASE_DATE, i * 3600),
      pool,
      asset0_reserve: asset0,
      asset1_reserve: asset1,
      total_share: Math.floor(Math.sqrt(asset0 * asset1) / 1000),
      tvl_uclaw: Math.floor((asset0 + asset1) * (0.9 + rng() * 0.2)),
    };
  },

  "privacy-events": (rng, i) => {
    const action = weightedChoice(rng, [
      ["shield", 55],
      ["unshield", 45],
    ]);
    return {
      height: 1000000 + i * 5,
      tx_hash: randomTxHash(rng),
      action,
      amount: Math.floor(rng() * rng() * 100000000) + 100000,
      nullifier_used: action === "unshield" ? randomHex(rng, 64) : "",
      commitment_created: action === "shield" ? randomHex(rng, 64) : "",
    };
  },

  "staking-history": (rng, i) => {
    const action = weightedChoice(rng, [
      ["delegate", 50],
      ["undelegate", 25],
      ["claim_rewards", 25],
    ]);
    return {
      height: 1000000 + Math.floor(i / 2),
      tx_hash: randomTxHash(rng),
      action,
      delegator: randomAddress(rng),
      validator: randomValidatorAddress(rng),
      amount: Math.floor(rng() * rng() * 50000000) + 100000,
      timestamp: isoTimestamp(BASE_DATE, Math.floor(rng() * 5000000)),
    };
  },

  "governance-votes": (rng, i) => {
    const proposalId = Math.floor(i / 10) + 1;
    return {
      proposal_id: proposalId,
      proposal_title:
        PROPOSAL_TITLES[(proposalId - 1) % PROPOSAL_TITLES.length],
      voter: randomAddress(rng),
      option: VOTE_OPTIONS[Math.floor(rng() * VOTE_OPTIONS.length)],
      weight: "1.000000",
      timestamp: isoTimestamp(BASE_DATE, Math.floor(rng() * 5000000)),
      status: weightedChoice(rng, [
        ["PROPOSAL_STATUS_PASSED", 50],
        ["PROPOSAL_STATUS_REJECTED", 25],
        ["PROPOSAL_STATUS_VOTING_PERIOD", 25],
      ]),
    };
  },

  "marketplace-skills": (rng, i) => ({
    skill_id: "skill-" + randomHex(rng, 6),
    name: SKILL_NAMES[Math.floor(rng() * SKILL_NAMES.length)] +
      " v" + (Math.floor(rng() * 5) + 1),
    owner: randomAddress(rng),
    category: SKILL_CATEGORIES[Math.floor(rng() * SKILL_CATEGORIES.length)],
    price_uclaw: Math.floor(rng() * rng() * 5000000) + 10000,
    purchase_count: Math.floor(rng() * rng() * 500),
    rating: (3 + rng() * 2).toFixed(1),
    listed_at: isoTimestamp(BASE_DATE, Math.floor(rng() * 5000000)),
  }),

  "gpu-compute-jobs": (rng, i) => {
    const status = weightedChoice(rng, [
      ["completed", 65],
      ["running", 15],
      ["queued", 10],
      ["failed", 7],
      ["cancelled", 3],
    ]);
    const submittedOffset = Math.floor(rng() * 5000000);
    const durationHours = Math.floor(rng() * 48) + 1;
    const completedOffset =
      status === "completed" || status === "failed"
        ? submittedOffset + durationHours * 3600
        : 0;
    return {
      job_id: "gpu-" + randomHex(rng, 8),
      provider: randomAddress(rng),
      requester: randomAddress(rng),
      vram_gb: [8, 16, 24, 40, 80][Math.floor(rng() * 5)],
      duration_hours: durationHours,
      cost_uclaw: Math.floor(rng() * rng() * 20000000) + 50000,
      status,
      submitted_at: isoTimestamp(BASE_DATE, submittedOffset),
      completed_at:
        completedOffset > 0 ? isoTimestamp(BASE_DATE, completedOffset) : "",
    };
  },

  "token-transfers": (rng, i) => ({
    height: 1000000 + Math.floor(i / 3),
    tx_hash: randomTxHash(rng),
    sender: randomAddress(rng),
    recipient: randomAddress(rng),
    amount_uclaw: Math.floor(rng() * rng() * 100000000) + 1000,
    memo: rng() > 0.8 ? "payment-" + randomHex(rng, 4) : "",
    timestamp: isoTimestamp(BASE_DATE, Math.floor(rng() * 5000000)),
  }),
};

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export function generateSampleData(
  dataset: DatasetInfo,
  limit: number,
  seed: number = 42,
): Record<string, unknown>[] {
  const generator = GENERATORS[dataset.id];
  if (!generator) {
    throw new Error(`No sample generator for dataset: ${dataset.id}`);
  }
  const rng = seededRandom(seed);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < limit; i++) {
    rows.push(generator(rng, i, limit));
  }
  return rows;
}

function escapeCsvField(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvField(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

export function toJsonl(rows: Record<string, unknown>[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export async function fetchLiveData(
  dataset: DatasetInfo,
  rpcUrl: string,
  restUrl: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];

  if (dataset.id === "blocks") {
    const statusResp = await fetch(`${rpcUrl}/status`);
    const statusData = (await statusResp.json()) as {
      result: { sync_info: { latest_block_height: string } };
    };
    const latestHeight = parseInt(
      statusData.result.sync_info.latest_block_height,
      10,
    );
    const startHeight = Math.max(1, latestHeight - limit + 1);

    for (let h = startHeight; h <= latestHeight && rows.length < limit; h++) {
      try {
        const blockResp = await fetch(`${rpcUrl}/block?height=${h}`);
        const blockData = (await blockResp.json()) as {
          result: {
            block: {
              header: {
                height: string;
                time: string;
                proposer_address: string;
              };
              data: { txs: unknown[] | null };
            };
            block_id: { hash: string };
          };
        };
        const header = blockData.result.block.header;
        rows.push({
          height: parseInt(header.height, 10),
          time: header.time,
          hash: blockData.result.block_id.hash,
          proposer: header.proposer_address,
          num_txs: blockData.result.block.data.txs?.length ?? 0,
          gas_used: 0,
          gas_wanted: 0,
        });
      } catch {
        // skip blocks that fail to fetch
      }
    }
  } else if (dataset.id === "transactions") {
    const searchResp = await fetch(
      `${rpcUrl}/tx_search?query="tx.height>0"&per_page=${Math.min(limit, 100)}&page=1&order_by="desc"`,
    );
    const searchData = (await searchResp.json()) as {
      result: {
        txs: Array<{
          hash: string;
          height: string;
          tx_result: {
            gas_used: string;
            gas_wanted: string;
            code: number;
          };
        }>;
      };
    };
    for (const tx of searchData.result.txs ?? []) {
      if (rows.length >= limit) break;
      rows.push({
        height: parseInt(tx.height, 10),
        tx_hash: tx.hash,
        msg_type: "unknown",
        sender: "unknown",
        gas_used: parseInt(tx.tx_result.gas_used, 10),
        fee: 0,
        success: tx.tx_result.code === 0,
        memo: "",
      });
    }
  } else if (dataset.id === "staking-history") {
    try {
      const validatorsResp = await fetch(
        `${restUrl}/cosmos/staking/v1beta1/validators?pagination.limit=${Math.min(limit, 100)}`,
      );
      const validatorsData = (await validatorsResp.json()) as {
        validators: Array<{
          operator_address: string;
          description: { moniker: string };
          tokens: string;
        }>;
      };
      for (const v of validatorsData.validators ?? []) {
        if (rows.length >= limit) break;
        rows.push({
          height: 0,
          tx_hash: "",
          action: "delegate",
          delegator: "unknown",
          validator: v.operator_address,
          amount: parseInt(v.tokens, 10),
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // REST not reachable
    }
  } else if (dataset.id === "governance-votes") {
    try {
      const proposalsResp = await fetch(
        `${restUrl}/cosmos/gov/v1/proposals?pagination.limit=${Math.min(limit, 50)}`,
      );
      const proposalsData = (await proposalsResp.json()) as {
        proposals: Array<{
          id: string;
          title: string;
          status: string;
        }>;
      };
      for (const p of proposalsData.proposals ?? []) {
        if (rows.length >= limit) break;
        rows.push({
          proposal_id: parseInt(p.id, 10),
          proposal_title: p.title,
          voter: "unknown",
          option: "unknown",
          weight: "1.000000",
          timestamp: new Date().toISOString(),
          status: p.status,
        });
      }
    } catch {
      // REST not reachable
    }
  } else {
    // For datasets without live fetch support, fall back to sample data
    console.error(
      `Live data fetch not implemented for ${dataset.id}, falling back to sample data`,
    );
    return generateSampleData(dataset, limit);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// CLI formatting helpers
// ---------------------------------------------------------------------------

function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + " ".repeat(len - str.length);
}

function formatTable(
  headers: string[],
  widths: number[],
  rows: string[][],
): string {
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const headerLine = headers
    .map((h, i) => padRight(h, widths[i]))
    .join(" | ");
  const lines = [headerLine, sep];
  for (const row of rows) {
    lines.push(row.map((c, i) => padRight(c, widths[i])).join(" | "));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

function findDataset(id: string): DatasetInfo | undefined {
  return DATASETS.find((d) => d.id === id);
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("claw-data-portal")
    .description(
      "Open blockchain data portal for ClawChain — download curated datasets of on-chain activity",
    )
    .version("1.0.0");

  // ---- list ----
  program
    .command("list")
    .description("List available datasets")
    .option("--category <cat>", "Filter datasets by category")
    .option("--json", "Output as JSON")
    .action((opts: { category?: string; json?: boolean }) => {
      let datasets = DATASETS;
      if (opts.category) {
        datasets = datasets.filter((d) => d.category === opts.category);
      }
      if (opts.json) {
        console.log(JSON.stringify(datasets, null, 2));
        return;
      }
      if (datasets.length === 0) {
        console.log("No datasets found.");
        return;
      }
      const rows = datasets.map((d) => [
        d.id,
        d.name,
        d.category,
        d.format,
        String(d.fields.length),
      ]);
      console.log(
        formatTable(
          ["ID", "Name", "Category", "Format", "Fields"],
          [22, 36, 12, 6, 6],
          rows,
        ),
      );
    });

  // ---- categories ----
  program
    .command("categories")
    .description("List dataset categories with counts")
    .action(() => {
      const counts = new Map<string, number>();
      for (const d of DATASETS) {
        counts.set(d.category, (counts.get(d.category) ?? 0) + 1);
      }
      const rows = Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([cat, count]) => [cat, String(count)]);
      console.log(formatTable(["Category", "Datasets"], [16, 8], rows));
    });

  // ---- info ----
  program
    .command("info <dataset-id>")
    .description("Show detailed information about a dataset")
    .action((datasetId: string) => {
      const ds = findDataset(datasetId);
      if (!ds) {
        console.error(`Error: Dataset "${datasetId}" not found.`);
        console.error(
          "Available datasets: " + DATASETS.map((d) => d.id).join(", "),
        );
        process.exit(1);
        return;
      }
      console.log(`Dataset: ${ds.name}`);
      console.log(`ID:      ${ds.id}`);
      console.log(`Description: ${ds.description}`);
      console.log(`Category:    ${ds.category}`);
      console.log(`Format:      ${ds.format}`);
      console.log(`Sample Rows: ${ds.sampleRows}`);
      console.log(`Fields (${ds.fields.length}):`);
      for (const f of ds.fields) {
        console.log(`  - ${f}`);
      }
      console.log(`\nData Source: CometBFT RPC + Cosmos REST API (live) or deterministic sample generator`);
    });

  // ---- download ----
  program
    .command("download <dataset-id>")
    .description("Download or generate a dataset")
    .option("--output <path>", "Output file path (default: stdout)")
    .option("--format <fmt>", "Output format: csv, json, jsonl", "csv")
    .option("--rpc <url>", "CometBFT RPC URL", "http://localhost:26657")
    .option("--rest <url>", "Cosmos REST API URL", "http://localhost:1317")
    .option("--sample", "Generate sample data instead of fetching live data")
    .option("--limit <n>", "Maximum number of rows")
    .action(
      async (
        datasetId: string,
        opts: {
          output?: string;
          format: string;
          rpc: string;
          rest: string;
          sample?: boolean;
          limit?: string;
        },
      ) => {
        const ds = findDataset(datasetId);
        if (!ds) {
          console.error(`Error: Dataset "${datasetId}" not found.`);
          console.error(
            "Available datasets: " + DATASETS.map((d) => d.id).join(", "),
          );
          process.exit(1);
          return;
        }

        const limit = opts.limit ? parseInt(opts.limit, 10) : ds.sampleRows;
        if (isNaN(limit) || limit < 1) {
          console.error("Error: --limit must be a positive integer");
          process.exit(1);
          return;
        }

        let rows: Record<string, unknown>[];
        if (opts.sample) {
          rows = generateSampleData(ds, limit);
        } else {
          try {
            rows = await fetchLiveData(ds, opts.rpc, opts.rest, limit);
          } catch (err) {
            console.error(
              `Error fetching live data: ${err instanceof Error ? err.message : err}`,
            );
            console.error("Tip: Use --sample to generate synthetic data instead.");
            process.exit(1);
            return;
          }
        }

        let output: string;
        switch (opts.format) {
          case "json":
            output = JSON.stringify(rows, null, 2) + "\n";
            break;
          case "jsonl":
            output = toJsonl(rows);
            break;
          case "csv":
          default:
            output = toCsv(rows);
            break;
        }

        if (opts.output) {
          writeFileSync(opts.output, output, "utf-8");
          console.error(
            `Wrote ${rows.length} rows to ${opts.output} (${opts.format})`,
          );
        } else {
          process.stdout.write(output);
        }
      },
    );

  return program;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const isTestEnv =
  typeof process !== "undefined" &&
  (process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.JEST_WORKER_ID !== undefined);

const isMainModule =
  !isTestEnv &&
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/index.ts") ||
    process.argv[1].endsWith("/index.js") ||
    process.argv[1].includes("claw-data-portal"));

if (isMainModule) {
  const program = createProgram();
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
