#!/usr/bin/env node

import { Command } from "commander";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// Row schemas
// ---------------------------------------------------------------------------

export type BlockRow = {
  height: number;
  time: string;
  hash: string;
  proposer: string;
  numTxs: number;
  gasUsed: number;
  gasWanted: number;
};

export type TransactionRow = {
  height: number;
  txHash: string;
  msgType: string;
  sender: string;
  gasUsed: number;
  gasWanted: number;
  fee: string;
  success: boolean;
  memo: string;
};

export type EventRow = {
  height: number;
  txHash: string;
  eventType: string;
  attributes: Record<string, string>;
};

export type AgentActionRow = {
  height: number;
  txHash: string;
  action: string;
  agent: string;
  detail: string;
  amount: string;
};

export type PrivacyEventRow = {
  height: number;
  txHash: string;
  action: string;
  nullifier: string;
  commitment: string;
  amount: string;
};

export type MarketplaceEventRow = {
  height: number;
  txHash: string;
  action: string;
  creator: string;
  skillId: string;
  amount: string;
};

export type StakingEventRow = {
  height: number;
  txHash: string;
  action: string;
  delegator: string;
  validator: string;
  amount: string;
};

export type GovernanceEventRow = {
  height: number;
  txHash: string;
  action: string;
  proposalId: string;
  voter: string;
  option: string;
  amount: string;
};

export type DexSwapRow = {
  height: number;
  txHash: string;
  pool: string;
  sender: string;
  offerAsset: string;
  offerAmount: string;
  returnAsset: string;
  returnAmount: string;
};

type AnyRow =
  | BlockRow
  | TransactionRow
  | EventRow
  | AgentActionRow
  | PrivacyEventRow
  | MarketplaceEventRow
  | StakingEventRow
  | GovernanceEventRow
  | DexSwapRow;

// ---------------------------------------------------------------------------
// Dataset catalogue
// ---------------------------------------------------------------------------

export interface DatasetInfo {
  name: string;
  description: string;
  fields: string[];
}

export const DATASETS: DatasetInfo[] = [
  { name: "blocks", description: "Block headers with gas totals", fields: ["height", "time", "hash", "proposer", "numTxs", "gasUsed", "gasWanted"] },
  { name: "transactions", description: "Individual transactions with message type and fees", fields: ["height", "txHash", "msgType", "sender", "gasUsed", "gasWanted", "fee", "success", "memo"] },
  { name: "events", description: "All begin_block, end_block, and tx events", fields: ["height", "txHash", "eventType", "attributes"] },
  { name: "agent_actions", description: "Agent module events (register, heartbeat, delegate, complete)", fields: ["height", "txHash", "action", "agent", "detail", "amount"] },
  { name: "privacy_events", description: "Privacy module events (shield, unshield, private_transfer)", fields: ["height", "txHash", "action", "nullifier", "commitment", "amount"] },
  { name: "marketplace_events", description: "Marketplace events (list_skill, purchase_skill, escrow)", fields: ["height", "txHash", "action", "creator", "skillId", "amount"] },
  { name: "staking_events", description: "Staking events (delegate, unbond, redelegate, withdraw)", fields: ["height", "txHash", "action", "delegator", "validator", "amount"] },
  { name: "governance_events", description: "Governance events (submit_proposal, vote, deposit)", fields: ["height", "txHash", "action", "proposalId", "voter", "option", "amount"] },
  { name: "dex_swaps", description: "DEX swap events from CosmWasm contracts", fields: ["height", "txHash", "pool", "sender", "offerAsset", "offerAmount", "returnAsset", "returnAmount"] },
];

const VALID_DATASET_NAMES = DATASETS.map((d) => d.name);

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

export function toJson(rows: AnyRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function toJsonl(rows: AnyRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n");
}

function escapeCsvField(value: unknown): string {
  const str = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: AnyRow[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.map(escapeCsvField).join(",");
  const lines = rows.map((row) => {
    const rec = row as Record<string, unknown>;
    return keys.map((k) => escapeCsvField(rec[k])).join(",");
  });
  return [header, ...lines].join("\n");
}

function formatOutput(rows: AnyRow[], format: string): string {
  switch (format) {
    case "csv":
      return toCsv(rows);
    case "jsonl":
      return toJsonl(rows);
    case "json":
    default:
      return toJson(rows);
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Chain queries
// ---------------------------------------------------------------------------

interface StatusResult {
  result: {
    node_info: { network: string };
    sync_info: {
      latest_block_height: string;
      earliest_block_height: string;
    };
  };
}

export async function getLatestHeight(rpc: string): Promise<number> {
  const data = await fetchJson<StatusResult>(`${rpc}/status`);
  return parseInt(data.result.sync_info.latest_block_height, 10);
}

export async function getChainStatus(rpc: string): Promise<{
  chainId: string;
  latestHeight: number;
  earliestHeight: number;
}> {
  const data = await fetchJson<StatusResult>(`${rpc}/status`);
  return {
    chainId: data.result.node_info.network,
    latestHeight: parseInt(data.result.sync_info.latest_block_height, 10),
    earliestHeight: parseInt(data.result.sync_info.earliest_block_height, 10),
  };
}

// ---------------------------------------------------------------------------
// Event attribute helpers
// ---------------------------------------------------------------------------

interface RawAttribute {
  key: string;
  value: string;
}

interface RawEvent {
  type: string;
  attributes: RawAttribute[];
}

function attrMap(attrs: RawAttribute[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of attrs) {
    m[a.key] = a.value;
  }
  return m;
}

function collectEvents(
  blockResults: { result: { begin_block_events?: RawEvent[]; end_block_events?: RawEvent[]; txs_results?: { events?: RawEvent[]; log?: string }[] } },
  height: number,
): EventRow[] {
  const rows: EventRow[] = [];

  const beginEvents = blockResults.result.begin_block_events ?? [];
  for (const ev of beginEvents) {
    rows.push({ height, txHash: "", eventType: ev.type, attributes: attrMap(ev.attributes) });
  }

  const endEvents = blockResults.result.end_block_events ?? [];
  for (const ev of endEvents) {
    rows.push({ height, txHash: "", eventType: ev.type, attributes: attrMap(ev.attributes) });
  }

  const txResults = blockResults.result.txs_results ?? [];
  for (let i = 0; i < txResults.length; i++) {
    const txEvents = txResults[i].events ?? [];
    const txHash = `tx_${height}_${i}`;
    for (const ev of txEvents) {
      rows.push({ height, txHash, eventType: ev.type, attributes: attrMap(ev.attributes) });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Dataset extractors
// ---------------------------------------------------------------------------

const AGENT_EVENT_TYPES = new Set(["agent_action", "register_agent", "agent_heartbeat", "delegate_task", "complete_task"]);
const PRIVACY_EVENT_TYPES = new Set(["shield", "unshield", "private_transfer"]);
const MARKETPLACE_EVENT_TYPES = new Set(["list_skill", "purchase_skill", "create_escrow", "release_escrow"]);
const STAKING_EVENT_TYPES = new Set(["delegate", "unbond", "redelegate", "withdraw_rewards"]);
const GOVERNANCE_EVENT_TYPES = new Set(["submit_proposal", "vote", "proposal_deposit"]);

async function extractBlocks(rpc: string, from: number, to: number, batchSize: number, verbose: boolean): Promise<BlockRow[]> {
  const rows: BlockRow[] = [];
  for (let start = from; start <= to; start += batchSize) {
    const end = Math.min(start + batchSize - 1, to);
    if (verbose) process.stderr.write(`[blocks] fetching ${start}..${end}\n`);
    for (let h = start; h <= end; h++) {
      try {
        const block = await fetchJson<{
          result: {
            block: {
              header: { height: string; time: string; proposer_address: string };
              data: { txs: string[] | null };
            };
            block_id: { hash: string };
          };
        }>(`${rpc}/block?height=${h}`);
        const hdr = block.result.block.header;
        const txs = block.result.block.data.txs ?? [];

        // Fetch block_results for gas totals
        const br = await fetchJson<{
          result: { txs_results?: { gas_used?: string; gas_wanted?: string }[] };
        }>(`${rpc}/block_results?height=${h}`);
        const txResults = br.result.txs_results ?? [];
        let gasUsed = 0;
        let gasWanted = 0;
        for (const tr of txResults) {
          gasUsed += parseInt(tr.gas_used ?? "0", 10);
          gasWanted += parseInt(tr.gas_wanted ?? "0", 10);
        }

        rows.push({
          height: parseInt(hdr.height, 10),
          time: hdr.time,
          hash: block.result.block_id.hash,
          proposer: hdr.proposer_address,
          numTxs: txs.length,
          gasUsed,
          gasWanted,
        });
      } catch (err) {
        if (verbose) process.stderr.write(`[blocks] error at height ${h}: ${(err as Error).message}\n`);
      }
    }
  }
  return rows;
}

async function extractTransactions(rpc: string, from: number, to: number, batchSize: number, verbose: boolean): Promise<TransactionRow[]> {
  const rows: TransactionRow[] = [];
  for (let start = from; start <= to; start += batchSize) {
    const end = Math.min(start + batchSize - 1, to);
    if (verbose) process.stderr.write(`[transactions] fetching ${start}..${end}\n`);
    for (let h = start; h <= end; h++) {
      try {
        const br = await fetchJson<{
          result: {
            txs_results?: {
              code?: number;
              gas_used?: string;
              gas_wanted?: string;
              events?: RawEvent[];
              log?: string;
            }[];
          };
        }>(`${rpc}/block_results?height=${h}`);

        const txResults = br.result.txs_results ?? [];
        for (let i = 0; i < txResults.length; i++) {
          const tr = txResults[i];
          const events = tr.events ?? [];
          const msgEvent = events.find((e) => e.type === "message");
          const attrs = msgEvent ? attrMap(msgEvent.attributes) : {};

          rows.push({
            height: h,
            txHash: `tx_${h}_${i}`,
            msgType: attrs.action ?? "unknown",
            sender: attrs.sender ?? "",
            gasUsed: parseInt(tr.gas_used ?? "0", 10),
            gasWanted: parseInt(tr.gas_wanted ?? "0", 10),
            fee: attrs.fee ?? "0",
            success: (tr.code ?? 0) === 0,
            memo: attrs.memo ?? "",
          });
        }
      } catch (err) {
        if (verbose) process.stderr.write(`[transactions] error at height ${h}: ${(err as Error).message}\n`);
      }
    }
  }
  return rows;
}

async function extractEvents(rpc: string, from: number, to: number, batchSize: number, verbose: boolean): Promise<EventRow[]> {
  const rows: EventRow[] = [];
  for (let start = from; start <= to; start += batchSize) {
    const end = Math.min(start + batchSize - 1, to);
    if (verbose) process.stderr.write(`[events] fetching ${start}..${end}\n`);
    for (let h = start; h <= end; h++) {
      try {
        const br = await fetchJson<{
          result: { begin_block_events?: RawEvent[]; end_block_events?: RawEvent[]; txs_results?: { events?: RawEvent[] }[] };
        }>(`${rpc}/block_results?height=${h}`);
        rows.push(...collectEvents(br, h));
      } catch (err) {
        if (verbose) process.stderr.write(`[events] error at height ${h}: ${(err as Error).message}\n`);
      }
    }
  }
  return rows;
}

function filterEventsToTyped<T>(
  eventRows: EventRow[],
  typeSet: Set<string>,
  mapper: (ev: EventRow) => T,
): T[] {
  return eventRows.filter((e) => typeSet.has(e.eventType)).map(mapper);
}

async function extractFilteredEvents<T>(
  rpc: string,
  from: number,
  to: number,
  batchSize: number,
  verbose: boolean,
  label: string,
  typeSet: Set<string>,
  mapper: (ev: EventRow) => T,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = from; start <= to; start += batchSize) {
    const end = Math.min(start + batchSize - 1, to);
    if (verbose) process.stderr.write(`[${label}] fetching ${start}..${end}\n`);
    for (let h = start; h <= end; h++) {
      try {
        const br = await fetchJson<{
          result: { begin_block_events?: RawEvent[]; end_block_events?: RawEvent[]; txs_results?: { events?: RawEvent[] }[] };
        }>(`${rpc}/block_results?height=${h}`);
        const allEvents = collectEvents(br, h);
        rows.push(...filterEventsToTyped(allEvents, typeSet, mapper));
      } catch (err) {
        if (verbose) process.stderr.write(`[${label}] error at height ${h}: ${(err as Error).message}\n`);
      }
    }
  }
  return rows;
}

async function extractDexSwaps(rpc: string, from: number, to: number, batchSize: number, verbose: boolean): Promise<DexSwapRow[]> {
  const rows: DexSwapRow[] = [];
  for (let start = from; start <= to; start += batchSize) {
    const end = Math.min(start + batchSize - 1, to);
    if (verbose) process.stderr.write(`[dex_swaps] fetching ${start}..${end}\n`);
    for (let h = start; h <= end; h++) {
      try {
        const br = await fetchJson<{
          result: { begin_block_events?: RawEvent[]; end_block_events?: RawEvent[]; txs_results?: { events?: RawEvent[] }[] };
        }>(`${rpc}/block_results?height=${h}`);
        const allEvents = collectEvents(br, h);
        for (const ev of allEvents) {
          if (ev.eventType === "wasm" && ev.attributes.action === "swap") {
            rows.push({
              height: ev.height,
              txHash: ev.txHash,
              pool: ev.attributes._contract_address ?? "",
              sender: ev.attributes.sender ?? "",
              offerAsset: ev.attributes.offer_asset ?? "",
              offerAmount: ev.attributes.offer_amount ?? "",
              returnAsset: ev.attributes.return_asset ?? "",
              returnAmount: ev.attributes.return_amount ?? "",
            });
          }
        }
      } catch (err) {
        if (verbose) process.stderr.write(`[dex_swaps] error at height ${h}: ${(err as Error).message}\n`);
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Main extract dispatcher
// ---------------------------------------------------------------------------

export async function extract(
  dataset: string,
  opts: { rpc: string; from: number; to: number; batchSize: number; verbose: boolean },
): Promise<AnyRow[]> {
  const { rpc, from, to, batchSize, verbose } = opts;

  switch (dataset) {
    case "blocks":
      return extractBlocks(rpc, from, to, batchSize, verbose);
    case "transactions":
      return extractTransactions(rpc, from, to, batchSize, verbose);
    case "events":
      return extractEvents(rpc, from, to, batchSize, verbose);
    case "agent_actions":
      return extractFilteredEvents(rpc, from, to, batchSize, verbose, "agent_actions", AGENT_EVENT_TYPES, (ev) => ({
        height: ev.height,
        txHash: ev.txHash,
        action: ev.eventType,
        agent: ev.attributes.agent ?? ev.attributes.sender ?? "",
        detail: ev.attributes.detail ?? ev.attributes.task_id ?? "",
        amount: ev.attributes.amount ?? "0",
      }));
    case "privacy_events":
      return extractFilteredEvents(rpc, from, to, batchSize, verbose, "privacy_events", PRIVACY_EVENT_TYPES, (ev) => ({
        height: ev.height,
        txHash: ev.txHash,
        action: ev.eventType,
        nullifier: ev.attributes.nullifier ?? "",
        commitment: ev.attributes.commitment ?? "",
        amount: ev.attributes.amount ?? "0",
      }));
    case "marketplace_events":
      return extractFilteredEvents(rpc, from, to, batchSize, verbose, "marketplace_events", MARKETPLACE_EVENT_TYPES, (ev) => ({
        height: ev.height,
        txHash: ev.txHash,
        action: ev.eventType,
        creator: ev.attributes.creator ?? ev.attributes.sender ?? "",
        skillId: ev.attributes.skill_id ?? "",
        amount: ev.attributes.amount ?? "0",
      }));
    case "staking_events":
      return extractFilteredEvents(rpc, from, to, batchSize, verbose, "staking_events", STAKING_EVENT_TYPES, (ev) => ({
        height: ev.height,
        txHash: ev.txHash,
        action: ev.eventType,
        delegator: ev.attributes.delegator ?? ev.attributes.sender ?? "",
        validator: ev.attributes.validator ?? "",
        amount: ev.attributes.amount ?? "0",
      }));
    case "governance_events":
      return extractFilteredEvents(rpc, from, to, batchSize, verbose, "governance_events", GOVERNANCE_EVENT_TYPES, (ev) => ({
        height: ev.height,
        txHash: ev.txHash,
        action: ev.eventType,
        proposalId: ev.attributes.proposal_id ?? "",
        voter: ev.attributes.voter ?? ev.attributes.sender ?? "",
        option: ev.attributes.option ?? "",
        amount: ev.attributes.amount ?? "0",
      }));
    case "dex_swaps":
      return extractDexSwaps(rpc, from, to, batchSize, verbose);
    default:
      throw new Error(`Unknown dataset: ${dataset}. Valid datasets: ${VALID_DATASET_NAMES.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("claw-cryo")
  .version("1.0.0")
  .description("ClawChain blockchain data extractor — inspired by Paradigm Cryo");

program
  .command("extract <dataset>")
  .description(`Extract blockchain data. Datasets: ${VALID_DATASET_NAMES.join(", ")}`)
  .option("--rpc <url>", "CometBFT RPC endpoint", "http://localhost:26657")
  .option("--rest <url>", "REST/LCD endpoint", "http://localhost:1317")
  .option("--from <height>", "Start block height", "1")
  .option("--to <height>", 'End block height or "latest"', "latest")
  .option("--output <path>", "Output file path (default: stdout)")
  .option("--format <fmt>", "Output format: json | csv | jsonl", "json")
  .option("--batch-size <n>", "Blocks per batch", "100")
  .option("--verbose", "Log progress to stderr", false)
  .action(async (dataset: string, opts: {
    rpc: string;
    rest: string;
    from: string;
    to: string;
    output?: string;
    format: string;
    batchSize: string;
    verbose: boolean;
  }) => {
    if (!VALID_DATASET_NAMES.includes(dataset)) {
      process.stderr.write(`Error: unknown dataset "${dataset}"\nValid datasets: ${VALID_DATASET_NAMES.join(", ")}\n`);
      process.exit(1);
    }

    const format = opts.format;
    if (!["json", "csv", "jsonl"].includes(format)) {
      process.stderr.write(`Error: unsupported format "${format}". Use json, csv, or jsonl.\n`);
      process.exit(1);
    }

    const fromHeight = parseInt(opts.from, 10);
    if (isNaN(fromHeight) || fromHeight < 1) {
      process.stderr.write("Error: --from must be a positive integer\n");
      process.exit(1);
    }

    let toHeight: number = 0;
    if (opts.to === "latest") {
      try {
        toHeight = await getLatestHeight(opts.rpc);
        if (opts.verbose) process.stderr.write(`Resolved latest height: ${toHeight}\n`);
      } catch (err) {
        process.stderr.write(`Error resolving latest height: ${(err as Error).message}\n`);
        return process.exit(1);
      }
    } else {
      toHeight = parseInt(opts.to, 10);
      if (isNaN(toHeight) || toHeight < 1) {
        process.stderr.write("Error: --to must be a positive integer or 'latest'\n");
        return process.exit(1);
      }
    }

    if (fromHeight > toHeight) {
      process.stderr.write(`Error: --from (${fromHeight}) is greater than --to (${toHeight})\n`);
      process.exit(1);
    }

    const batchSize = parseInt(opts.batchSize, 10) || 100;

    try {
      const rows = await extract(dataset, {
        rpc: opts.rpc,
        from: fromHeight,
        to: toHeight,
        batchSize,
        verbose: opts.verbose,
      });

      const output = formatOutput(rows, format);

      if (opts.output) {
        fs.writeFileSync(opts.output, output + "\n", "utf-8");
        if (opts.verbose) process.stderr.write(`Wrote ${rows.length} rows to ${opts.output}\n`);
      } else {
        process.stdout.write(output + "\n");
      }
    } catch (err) {
      process.stderr.write(`Extraction failed: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

program
  .command("datasets")
  .description("List all available datasets")
  .action(() => {
    const nameWidth = 22;
    const descWidth = 56;

    process.stdout.write(`${"DATASET".padEnd(nameWidth)}${"DESCRIPTION".padEnd(descWidth)}FIELDS\n`);
    process.stdout.write(`${"─".repeat(nameWidth)}${"─".repeat(descWidth)}${"─".repeat(40)}\n`);

    for (const ds of DATASETS) {
      process.stdout.write(
        `${ds.name.padEnd(nameWidth)}${ds.description.padEnd(descWidth)}${ds.fields.join(", ")}\n`,
      );
    }
  });

program
  .command("stats")
  .description("Show chain statistics")
  .option("--rpc <url>", "CometBFT RPC endpoint", "http://localhost:26657")
  .option("--json", "Output as JSON", false)
  .action(async (opts: { rpc: string; json: boolean }) => {
    try {
      const status = await getChainStatus(opts.rpc);

      if (opts.json) {
        process.stdout.write(JSON.stringify(status, null, 2) + "\n");
      } else {
        process.stdout.write(`Chain ID:         ${status.chainId}\n`);
        process.stdout.write(`Latest Height:    ${status.latestHeight}\n`);
        process.stdout.write(`Earliest Height:  ${status.earliestHeight}\n`);
      }
    } catch (err) {
      process.stderr.write(`Error fetching chain stats: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });

// Only parse CLI arguments when executed directly (not when imported by tests)
const isDirectRun =
  process.argv[1] &&
  (import.meta.url === `file://${process.argv[1]}` ||
    import.meta.url === new URL(`file://${process.argv[1]}`).href);

if (isDirectRun) {
  program.parse();
}

export { program };
