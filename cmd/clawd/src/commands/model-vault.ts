/**
 * `clawd model-vault` subcommands — wraps the ModelVault CosmWasm bonding-curve
 * contract (contracts/model-vault).
 *
 * Execute messages (signed via MsgExecuteContract):
 *   Fund {}, Buy {}, Sell {}, Stake {}, Unstake { amount }, ClaimRewards {},
 *   DistributeRevenue {}
 * Query messages (smart query over REST, no signing):
 *   Config {}, Pool {}, Quote { side, amount }, StakeInfo { address }, PoolInfo {}
 *
 * CosmWasm #[cw_serde] serializes enum variants as snake_case lowercase keys, so
 * the JSON payloads below MUST stay snake_case to match the Rust contract.
 */

import { readFileSync } from "node:fs";
import { toUtf8 } from "@cosmjs/encoding";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { loadClawdConfig } from "../lib/config.js";
import { shortAddr, table } from "../lib/format.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { connectClawchainSigningClient } from "../lib/signing.js";

type Coin = { denom: string; amount: string };
type TxEvent = {
  type: string;
  attributes?: readonly { key: string; value: string | Uint8Array }[];
};

const EXECUTE_TYPE_URL = "/cosmwasm.wasm.v1.MsgExecuteContract";
const STORE_CODE_TYPE_URL = "/cosmwasm.wasm.v1.MsgStoreCode";
const INSTANTIATE_TYPE_URL = "/cosmwasm.wasm.v1.MsgInstantiateContract";

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export type ModelVaultFundOptions = {
  contract: string;
  amount: string;
  denom?: string;
  json?: boolean;
};

export type ModelVaultBuyOptions = {
  contract: string;
  amount: string;
  json?: boolean;
};

export type ModelVaultSellOptions = {
  contract: string;
  amount: string;
  json?: boolean;
};

export type ModelVaultStakeOptions = {
  contract: string;
  amount: string;
  json?: boolean;
};

export type ModelVaultUnstakeOptions = {
  contract: string;
  amount: string;
  json?: boolean;
};

export type ModelVaultClaimOptions = {
  contract: string;
  json?: boolean;
};

export type ModelVaultDistributeOptions = {
  contract: string;
  amount: string;
  json?: boolean;
};

export type ModelVaultQuoteOptions = {
  contract: string;
  side: string;
  amount: string;
  json?: boolean;
};

export type ModelVaultStakeInfoOptions = {
  contract: string;
  address: string;
  json?: boolean;
};

export type ModelVaultContractQueryOptions = {
  contract: string;
  json?: boolean;
};

export type ModelVaultWatchOptions = {
  contract: string;
  intervalMs?: string;
  maxCycles?: string;
  json?: boolean;
};

export type ModelVaultArbOptions = {
  contract: string;
  dexPair: string;
  thresholdBps?: string;
  maxTrade?: string;
  execute?: boolean;
  json?: boolean;
};

export type ModelVaultPortfolioOptions = {
  address?: string;
  /** Comma-separated vault contract addresses. */
  vaults?: string;
  /** Repeated --vault flags collected by Commander. */
  vault?: string[];
  json?: boolean;
};

export type ModelVaultDeployOptions = {
  modelDenom: string;
  reserveDenom?: string;
  owner?: string;
  feeBps?: string;
  /** Optimized wasm artifact to store first (parses code_id from store tx). */
  wasm?: string;
  /** Pre-uploaded code id; skips the store step when provided. */
  codeId?: string;
  label?: string;
  admin?: string;
  /** Reserve-denom amount to fund after instantiate (optional). */
  seedReserve?: string;
  /** Model-denom amount to fund after instantiate (optional). */
  seedInventory?: string;
  json?: boolean;
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function requirePositiveAmount(label: string, amount: string | undefined): string {
  if (!amount || !/^[0-9]+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new Error(`${label} must be a positive integer amount.`);
  }
  return amount;
}

function requireNonEmpty(label: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`${label} cannot be empty.`);
  }
  return value;
}

function normalizeSide(side: string | undefined): "buy" | "sell" {
  const normalized = (side ?? "").trim().toLowerCase();
  if (normalized !== "buy" && normalized !== "sell") {
    throw new Error('--side must be "buy" or "sell".');
  }
  return normalized;
}

function requireNonNegativeInteger(label: string, value: string | undefined): number {
  if (value === undefined || !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return Number(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** fee_bps must be an integer in [0, 10000] (0%..100%). */
function requireFeeBps(label: string, value: string | undefined): number {
  if (value === undefined || !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const bps = Number(value);
  if (bps > 10_000) {
    throw new Error(`${label} must be between 0 and 10000 basis points.`);
  }
  return bps;
}

function attrValue(value: string | Uint8Array): string {
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

/**
 * Parse the last matching attribute from a tx's events. Mirrors the jq
 * `[.events[]|select(.type==T)|.attributes[]|select(.key==K)|.value]|last`
 * used by model-vault-demo.sh, and findEventAttribute in model-token.ts.
 */
export function findEventAttribute(
  events: readonly TxEvent[] | undefined,
  type: string,
  key: string,
): string | undefined {
  let found: string | undefined;
  for (const event of events ?? []) {
    if (event.type !== type) continue;
    for (const attr of event.attributes ?? []) {
      if (attr.key === key) found = attrValue(attr.value);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Message builders (pure, unit-testable)
// ---------------------------------------------------------------------------

export function buildExecuteMsg(
  sender: string,
  contract: string,
  msg: Record<string, unknown>,
  funds: Coin[] = [],
) {
  return {
    typeUrl: EXECUTE_TYPE_URL,
    value: {
      sender,
      contract,
      msg: toUtf8(JSON.stringify(msg)),
      funds,
    },
  };
}

export function buildFundMsg(sender: string, contract: string, funds: Coin[]) {
  return buildExecuteMsg(sender, contract, { fund: {} }, funds);
}

export function buildStoreCodeMsg(sender: string, wasmByteCode: Uint8Array) {
  return {
    typeUrl: STORE_CODE_TYPE_URL,
    value: { sender, wasmByteCode },
  };
}

/**
 * MsgInstantiateContract for the ModelVault. `initMsg` is the ModelVault
 * InstantiateMsg ({ model_denom, reserve_denom?, owner?, fee_bps?, ... }),
 * serialized to UTF-8 bytes like every other wasm payload here.
 */
export function buildInstantiateMsg(
  sender: string,
  codeId: string,
  initMsg: Record<string, unknown>,
  label: string,
  admin: string,
  funds: Coin[] = [],
) {
  return {
    typeUrl: INSTANTIATE_TYPE_URL,
    value: {
      sender,
      admin,
      codeId: BigInt(codeId),
      label,
      msg: toUtf8(JSON.stringify(initMsg)),
      funds,
    },
  };
}

/**
 * Build the ModelVault InstantiateMsg payload. Only required field is
 * model_denom; reserve_denom/owner/fee_bps are included when provided so the
 * contract falls back to its own defaults otherwise.
 */
export function buildVaultInstantiateMsg(opts: {
  modelDenom: string;
  reserveDenom?: string;
  owner?: string;
  feeBps?: number;
}): Record<string, unknown> {
  const msg: Record<string, unknown> = { model_denom: opts.modelDenom };
  if (opts.reserveDenom) msg.reserve_denom = opts.reserveDenom;
  if (opts.owner) msg.owner = opts.owner;
  if (opts.feeBps !== undefined) msg.fee_bps = opts.feeBps;
  return msg;
}

export function buildBuyMsg(sender: string, contract: string, funds: Coin[]) {
  return buildExecuteMsg(sender, contract, { buy: {} }, funds);
}

export function buildSellMsg(sender: string, contract: string, funds: Coin[]) {
  return buildExecuteMsg(sender, contract, { sell: {} }, funds);
}

export function buildStakeMsg(sender: string, contract: string, funds: Coin[]) {
  return buildExecuteMsg(sender, contract, { stake: {} }, funds);
}

export function buildUnstakeMsg(sender: string, contract: string, amount: string) {
  return buildExecuteMsg(sender, contract, { unstake: { amount } });
}

export function buildClaimRewardsMsg(sender: string, contract: string) {
  return buildExecuteMsg(sender, contract, { claim_rewards: {} });
}

export function buildDistributeRevenueMsg(sender: string, contract: string, funds: Coin[]) {
  return buildExecuteMsg(sender, contract, { distribute_revenue: {} }, funds);
}

export function buildConfigQuery(): Record<string, unknown> {
  return { config: {} };
}

export function buildPoolQuery(): Record<string, unknown> {
  return { pool: {} };
}

export function buildQuoteQuery(side: "buy" | "sell", amount: string): Record<string, unknown> {
  return { quote: { side, amount } };
}

export function buildStakeInfoQuery(address: string): Record<string, unknown> {
  return { stake_info: { address } };
}

export function buildPoolInfoQuery(): Record<string, unknown> {
  return { pool_info: {} };
}

// ---------------------------------------------------------------------------
// Signing / REST plumbing
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

  const signingClient = await connectClawchainSigningClient(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return {
    cfg,
    rpcUrl,
    restUrl: (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, ""),
    denom,
    account,
    signingClient,
  };
}

/**
 * Resolve the configured signer's bech32 address without spinning up a signing
 * client (portfolio is a read-only command). Returns null when no mnemonic is
 * configured so the caller can surface a clear "--address required" error.
 */
async function resolveConfiguredAddress(): Promise<string | null> {
  if (!mnemonicFileExists()) return null;
  const mnemonic = loadMnemonic();
  if (!mnemonic) return null;
  const prefix = loadClawdConfig().prefix ?? "claw";
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  return account?.address ?? null;
}

function getRestUrl(): string {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  return (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
}

async function smartQuery(contract: string, queryMsg: Record<string, unknown>): Promise<unknown> {
  const restUrl = getRestUrl();
  const base64Query = Buffer.from(JSON.stringify(queryMsg)).toString("base64");
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${encodeURIComponent(contract)}/smart/${base64Query}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Smart query failed (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data?: unknown };
  return data.data ?? data;
}

async function executeAndReport(
  label: string,
  buildMsg: (sender: string) => ReturnType<typeof buildExecuteMsg>,
  opts: { json?: boolean },
  extraReport: Record<string, unknown> = {},
): Promise<void> {
  const { account, signingClient } = await ensureSigner();
  try {
    const msg = buildMsg(account.address);
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      throw new Error(`${label} tx failed (code=${res.code}): ${res.rawLog}`);
    }

    const report = {
      action: label,
      contract: msg.value.contract,
      sender: account.address,
      tx_hash: res.transactionHash,
      ...extraReport,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log(`${label} submitted.`);
    console.log(`  Contract: ${shortAddr(msg.value.contract)}`);
    console.log(`  Sender:   ${shortAddr(account.address)}`);
    console.log(`  TxHash:   ${res.transactionHash}`);
  } catch (err) {
    console.error(`model-vault ${label} failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

async function queryAndReport(
  label: string,
  contract: string,
  queryMsg: Record<string, unknown>,
  opts: { json?: boolean },
): Promise<void> {
  try {
    const result = await smartQuery(contract, queryMsg);
    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }
    console.log(`${label}:\n`);
    console.log(JSON.stringify(result, null, 2));
    console.log();
  } catch (err) {
    console.error(`model-vault ${label} query failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Execute command runners
// ---------------------------------------------------------------------------

export async function runModelVaultFund(opts: ModelVaultFundOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const amount = requirePositiveAmount("--amount", opts.amount);
  const denom = requireNonEmpty("--denom", opts.denom);
  const funds: Coin[] = [{ denom, amount }];
  await executeAndReport("Fund", (sender) => buildFundMsg(sender, contract, funds), opts, { funds });
}

export async function runModelVaultBuy(opts: ModelVaultBuyOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const amount = requirePositiveAmount("--amount", opts.amount);
  const { account, signingClient, restUrl } = await ensureSigner();
  try {
    const reserveDenom = await resolveReserveDenom(restUrl, contract);
    const funds: Coin[] = [{ denom: reserveDenom, amount }];
    const msg = buildBuyMsg(account.address, contract, funds);
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      throw new Error(`Buy tx failed (code=${res.code}): ${res.rawLog}`);
    }
    reportExecute("Buy", contract, account.address, res.transactionHash, opts, { funds });
  } catch (err) {
    console.error(`model-vault Buy failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelVaultSell(opts: ModelVaultSellOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const amount = requirePositiveAmount("--amount", opts.amount);
  const { account, signingClient, restUrl } = await ensureSigner();
  try {
    const modelDenom = await resolveModelDenom(restUrl, contract);
    const funds: Coin[] = [{ denom: modelDenom, amount }];
    const msg = buildSellMsg(account.address, contract, funds);
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      throw new Error(`Sell tx failed (code=${res.code}): ${res.rawLog}`);
    }
    reportExecute("Sell", contract, account.address, res.transactionHash, opts, { funds });
  } catch (err) {
    console.error(`model-vault Sell failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelVaultStake(opts: ModelVaultStakeOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const amount = requirePositiveAmount("--amount", opts.amount);
  const { account, signingClient, restUrl } = await ensureSigner();
  try {
    const modelDenom = await resolveModelDenom(restUrl, contract);
    const funds: Coin[] = [{ denom: modelDenom, amount }];
    const msg = buildStakeMsg(account.address, contract, funds);
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      throw new Error(`Stake tx failed (code=${res.code}): ${res.rawLog}`);
    }
    reportExecute("Stake", contract, account.address, res.transactionHash, opts, { funds });
  } catch (err) {
    console.error(`model-vault Stake failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

export async function runModelVaultUnstake(opts: ModelVaultUnstakeOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const amount = requirePositiveAmount("--amount", opts.amount);
  await executeAndReport("Unstake", (sender) => buildUnstakeMsg(sender, contract, amount), opts, {
    amount,
  });
}

export async function runModelVaultClaim(opts: ModelVaultClaimOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  await executeAndReport("ClaimRewards", (sender) => buildClaimRewardsMsg(sender, contract), opts);
}

export async function runModelVaultDistribute(opts: ModelVaultDistributeOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const amount = requirePositiveAmount("--amount", opts.amount);
  const { account, signingClient, restUrl } = await ensureSigner();
  try {
    const reserveDenom = await resolveReserveDenom(restUrl, contract);
    const funds: Coin[] = [{ denom: reserveDenom, amount }];
    const msg = buildDistributeRevenueMsg(account.address, contract, funds);
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      throw new Error(`DistributeRevenue tx failed (code=${res.code}): ${res.rawLog}`);
    }
    reportExecute("DistributeRevenue", contract, account.address, res.transactionHash, opts, {
      funds,
    });
  } catch (err) {
    console.error(`model-vault DistributeRevenue failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Query command runners
// ---------------------------------------------------------------------------

export async function runModelVaultQuote(opts: ModelVaultQuoteOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const side = normalizeSide(opts.side);
  const amount = requirePositiveAmount("--amount", opts.amount);
  await queryAndReport("Quote", contract, buildQuoteQuery(side, amount), opts);
}

export async function runModelVaultStakeInfo(opts: ModelVaultStakeInfoOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const address = requireNonEmpty("--address", opts.address);
  await queryAndReport("StakeInfo", contract, buildStakeInfoQuery(address), opts);
}

export async function runModelVaultPoolInfo(opts: ModelVaultContractQueryOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  await queryAndReport("PoolInfo", contract, buildPoolInfoQuery(), opts);
}

export async function runModelVaultConfig(opts: ModelVaultContractQueryOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  await queryAndReport("Config", contract, buildConfigQuery(), opts);
}

export async function runModelVaultPool(opts: ModelVaultContractQueryOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  await queryAndReport("Pool", contract, buildPoolQuery(), opts);
}

// ---------------------------------------------------------------------------
// portfolio: aggregate one staker's positions across an explicit list of vault
// contracts (there is no on-chain model->vault registry yet, so the caller
// supplies the vaults). Per-vault failures are reported inline and skipped.
// ---------------------------------------------------------------------------

type StakeInfoShape = { staked?: string; claimable?: string };

type PortfolioVaultRow = {
  contract: string;
  model_denom: string;
  reserve_denom: string;
  staked: string;
  claimable: string;
};

type PortfolioVaultError = {
  contract: string;
  error: string;
};

/** Parse --vaults "a,b,c" plus repeated --vault flags into a unique list. */
export function parseVaultList(vaults: string | undefined, repeated: string[] | undefined): string[] {
  const fromCsv = (vaults ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  const fromRepeated = (repeated ?? []).map((v) => v.trim()).filter((v) => v.length > 0);
  return Array.from(new Set([...fromCsv, ...fromRepeated]));
}

/**
 * `clawd model-vault portfolio` — for an explicit list of vault contracts,
 * query stake_info{address} + config{} per vault (in parallel), then print a
 * per-vault table plus totals: claimable grouped by reserve_denom and the
 * number of vaults with a non-zero stake.
 */
export async function runModelVaultPortfolio(opts: ModelVaultPortfolioOptions): Promise<void> {
  try {
    const vaults = parseVaultList(opts.vaults, opts.vault);
    if (vaults.length === 0) {
      throw new Error(
        'No vaults supplied. Pass --vaults <a,b,c> or repeat --vault <addr>.',
      );
    }

    let address = opts.address?.trim();
    if (!address) {
      const configured = await resolveConfiguredAddress();
      if (!configured) {
        throw new Error('--address is required (no configured mnemonic to derive it from).');
      }
      address = configured;
    }

    // Query each vault independently; one failure must not abort the rest.
    const settled = await Promise.all(
      vaults.map(async (contract): Promise<PortfolioVaultRow | PortfolioVaultError> => {
        try {
          const [stake, config] = await Promise.all([
            smartQuery(contract, buildStakeInfoQuery(address as string)) as Promise<StakeInfoShape>,
            smartQuery(contract, buildConfigQuery()) as Promise<ConfigShape>,
          ]);
          return {
            contract,
            model_denom: config.model_denom?.trim() || "?",
            reserve_denom: config.reserve_denom?.trim() || "?",
            staked: stake.staked ?? "0",
            claimable: stake.claimable ?? "0",
          };
        } catch (err) {
          return { contract, error: String(err) };
        }
      }),
    );

    const rows = settled.filter((r): r is PortfolioVaultRow => !("error" in r));
    const errors = settled.filter((r): r is PortfolioVaultError => "error" in r);

    // Totals: claimable grouped by reserve_denom + count of non-zero stakes.
    const claimableByReserve: Record<string, bigint> = {};
    let vaultsWithStake = 0;
    for (const row of rows) {
      const claimable = BigInt(row.claimable || "0");
      claimableByReserve[row.reserve_denom] =
        (claimableByReserve[row.reserve_denom] ?? 0n) + claimable;
      if (BigInt(row.staked || "0") > 0n) vaultsWithStake += 1;
    }
    const totalClaimable = Object.fromEntries(
      Object.entries(claimableByReserve).map(([denom, amount]) => [denom, amount.toString()]),
    );

    if (opts.json) {
      const report = {
        address,
        vaults: rows,
        errors,
        totals: {
          claimable_by_reserve: totalClaimable,
          vaults_with_stake: vaultsWithStake,
          vaults_queried: vaults.length,
        },
      };
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log(`ModelVault portfolio for ${shortAddr(address)}`);
    console.log(`  Vaults queried: ${vaults.length}\n`);

    if (rows.length > 0) {
      const tableRows = rows.map((r) => [
        shortAddr(r.contract),
        r.model_denom,
        r.staked,
        `${r.claimable} ${r.reserve_denom}`,
      ]);
      console.log(table(["Contract", "Model Denom", "Staked", "Claimable"], tableRows));
      console.log();
    } else {
      console.log("No vaults returned a position.\n");
    }

    console.log("Totals:");
    const claimableEntries = Object.entries(totalClaimable);
    if (claimableEntries.length === 0) {
      console.log("  Claimable:          none");
    } else {
      for (const [denom, amount] of claimableEntries) {
        console.log(`  Claimable (${denom}): ${amount}`);
      }
    }
    console.log(`  Vaults with stake:  ${vaultsWithStake}`);
    console.log();

    if (errors.length > 0) {
      console.log(`Skipped ${errors.length} vault(s) due to query errors:`);
      for (const e of errors) {
        console.log(`  ${shortAddr(e.contract)}: ${e.error}`);
      }
      console.log();
    }
  } catch (err) {
    console.error(`model-vault portfolio failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// deploy: store the optimized wasm (optional) -> instantiate the vault ->
// optionally fund it. Parses code_id from the store_code event and the vault
// address from the instantiate event, exactly like model-vault-demo.sh.
// ---------------------------------------------------------------------------

function loadWasmBytes(path: string): Uint8Array {
  try {
    return new Uint8Array(readFileSync(path));
  } catch (err) {
    throw new Error(`Failed to read wasm artifact "${path}": ${String(err)}`);
  }
}

/**
 * `clawd model-vault deploy` — store + instantiate (+ optionally fund) a
 * ModelVault for a model token. Flow:
 *   [--wasm -> store -> code_id]  (or reuse --code-id)
 *   -> instantiate (parse _contract_address)
 *   -> [--seed-reserve/--seed-inventory -> fund{}]
 * Every tx goes through ensureSigner + the shared clawchain registry, and each
 * tx hash plus the final vault address is reported.
 */
export async function runModelVaultDeploy(opts: ModelVaultDeployOptions): Promise<void> {
  const modelDenom = requireNonEmpty("--model-denom", opts.modelDenom);
  const reserveDenom = (opts.reserveDenom?.trim() || "uclaw");
  const feeBps = requireFeeBps("--fee-bps", opts.feeBps ?? "30");
  const label = opts.label?.trim() || "model-vault";
  const owner = opts.owner?.trim() || undefined;

  if (!opts.wasm && !opts.codeId) {
    throw new Error("Provide --wasm <path> to store, or --code-id <n> to reuse an uploaded code.");
  }
  if (opts.codeId !== undefined && !/^[0-9]+$/.test(opts.codeId)) {
    throw new Error("--code-id must be a non-negative integer.");
  }

  // Validate optional seed amounts up front so we fail before broadcasting.
  const seedReserve = opts.seedReserve?.trim()
    ? requirePositiveAmount("--seed-reserve", opts.seedReserve)
    : undefined;
  const seedInventory = opts.seedInventory?.trim()
    ? requirePositiveAmount("--seed-inventory", opts.seedInventory)
    : undefined;

  const { account, signingClient } = await ensureSigner();
  try {
    const admin = opts.admin?.trim() || account.address;
    const report: Record<string, unknown> = {
      action: "ModelVaultDeploy",
      deployer: account.address,
      model_denom: modelDenom,
      reserve_denom: reserveDenom,
      fee_bps: feeBps,
      label,
      admin,
      owner: owner ?? account.address,
    };

    if (!opts.json) {
      console.log("Deploying ModelVault...");
      console.log(`  Deployer:    ${shortAddr(account.address)}`);
      console.log(`  Model Denom: ${modelDenom}`);
      console.log(`  Reserve:     ${reserveDenom}`);
      console.log(`  Fee:         ${feeBps} bps`);
      console.log();
    }

    // --- 1. Store the wasm (optional; skipped when --code-id is supplied). ---
    let codeId = opts.codeId;
    if (opts.wasm) {
      const wasmBytes = loadWasmBytes(opts.wasm);
      const storeMsg = buildStoreCodeMsg(account.address, wasmBytes);
      const storeRes = await signingClient.signAndBroadcast(account.address, [storeMsg], "auto");
      if (storeRes.code !== 0) {
        throw new Error(`store tx failed (code=${storeRes.code}): ${storeRes.rawLog}`);
      }
      const parsedCodeId = findEventAttribute(storeRes.events, "store_code", "code_id");
      if (!parsedCodeId) {
        throw new Error("Could not parse code_id from the store_code event.");
      }
      codeId = parsedCodeId;
      report.store_tx_hash = storeRes.transactionHash;
      report.code_id = codeId;

      if (!opts.json) {
        console.log("Wasm stored.");
        console.log(`  TxHash:  ${storeRes.transactionHash}`);
        console.log(`  CodeID:  ${codeId}`);
        console.log();
      }
    } else {
      report.code_id = codeId;
    }

    if (!codeId) {
      throw new Error("No code_id available to instantiate (store failed?).");
    }

    // --- 2. Instantiate the vault (parse _contract_address). ---
    const initMsg = buildVaultInstantiateMsg({ modelDenom, reserveDenom, owner, feeBps });
    const instantiateMsg = buildInstantiateMsg(account.address, codeId, initMsg, label, admin);
    const instRes = await signingClient.signAndBroadcast(account.address, [instantiateMsg], "auto");
    if (instRes.code !== 0) {
      throw new Error(`instantiate tx failed (code=${instRes.code}): ${instRes.rawLog}`);
    }
    const vault = findEventAttribute(instRes.events, "instantiate", "_contract_address");
    if (!vault) {
      throw new Error("Could not parse _contract_address from the instantiate event.");
    }
    report.instantiate_tx_hash = instRes.transactionHash;
    report.vault = vault;

    if (!opts.json) {
      console.log("Vault instantiated.");
      console.log(`  TxHash:  ${instRes.transactionHash}`);
      console.log(`  Vault:   ${vault}`);
      console.log();
    }

    // --- 3. Optionally fund the vault with reserve and/or model tokens. ---
    if (seedReserve || seedInventory) {
      const funds: Coin[] = [];
      if (seedReserve) funds.push({ denom: reserveDenom, amount: seedReserve });
      if (seedInventory) funds.push({ denom: modelDenom, amount: seedInventory });
      // CosmWasm requires funds sorted by denom.
      funds.sort((a, b) => a.denom.localeCompare(b.denom));

      const fundMsg = buildFundMsg(account.address, vault, funds);
      const fundRes = await signingClient.signAndBroadcast(account.address, [fundMsg], "auto");
      if (fundRes.code !== 0) {
        throw new Error(`fund tx failed (code=${fundRes.code}): ${fundRes.rawLog}`);
      }
      report.fund_tx_hash = fundRes.transactionHash;
      report.funds = funds;

      if (!opts.json) {
        console.log("Vault funded.");
        for (const f of funds) console.log(`  ${f.amount} ${f.denom}`);
        console.log(`  TxHash:  ${fundRes.transactionHash}`);
        console.log();
      }
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      console.log(`ModelVault deployed at ${vault}`);
    }
  } catch (err) {
    console.error(`model-vault deploy failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Market tooling: curve/DEX price discovery (watch) + rebalancing (arb)
// ---------------------------------------------------------------------------

type CurvePoolShape = { reserve?: string; inventory?: string };
type PoolInfoShape = { total_staked?: string; reward_index?: string; reward_per_token?: string };

/** Spot price = reserve / inventory (reserve units per 1 model token). */
function curveSpotPrice(pool: CurvePoolShape): number {
  const reserve = Number(pool.reserve ?? 0);
  const inventory = Number(pool.inventory ?? 0);
  if (!Number.isFinite(reserve) || !Number.isFinite(inventory) || inventory <= 0) {
    return 0;
  }
  return reserve / inventory;
}

function round6(x: number): number {
  return Math.round(x * 1_000_000) / 1_000_000;
}

/**
 * Read the curve's spot price + reserves + dividend-pool state in one shot,
 * reusing the same smartQuery plumbing as the query runners.
 */
async function snapshotCurve(contract: string): Promise<{
  reserve: string;
  inventory: string;
  spotPrice: number;
  totalStaked: string;
  rewardIndex: string;
}> {
  const [pool, poolInfo] = await Promise.all([
    smartQuery(contract, buildPoolQuery()) as Promise<CurvePoolShape>,
    smartQuery(contract, buildPoolInfoQuery()) as Promise<PoolInfoShape>,
  ]);
  return {
    reserve: pool.reserve ?? "0",
    inventory: pool.inventory ?? "0",
    spotPrice: round6(curveSpotPrice(pool)),
    totalStaked: poolInfo.total_staked ?? "0",
    rewardIndex: poolInfo.reward_index ?? poolInfo.reward_per_token ?? "0",
  };
}

/**
 * `clawd model-vault watch` — supervised polling loop (serve-loop style) that
 * prints the bonding-curve spot price, reserves, total staked, and reward index
 * each cycle. `--max-cycles 0` (default) runs until interrupted.
 */
export async function runModelVaultWatch(opts: ModelVaultWatchOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const intervalMs = requireNonNegativeInteger("--interval-ms", opts.intervalMs ?? "5000");
  const maxCycles = requireNonNegativeInteger("--max-cycles", opts.maxCycles ?? "0");
  let cycle = 0;

  if (!opts.json) {
    console.log("Watching ModelVault bonding curve...");
    console.log(`  Contract: ${shortAddr(contract)}`);
    console.log(`  Interval: ${intervalMs}ms`);
    console.log(`  Cycles:   ${maxCycles === 0 ? "until stopped" : String(maxCycles)}`);
    console.log();
  }

  while (maxCycles === 0 || cycle < maxCycles) {
    cycle += 1;
    try {
      const snap = await snapshotCurve(contract);
      if (opts.json) {
        process.stdout.write(JSON.stringify({ cycle, contract, ...snap }) + "\n");
      } else {
        console.log(`Cycle ${cycle}${maxCycles > 0 ? `/${maxCycles}` : ""}`);
        console.log(`  Spot Price:    ${snap.spotPrice} (reserve/inventory)`);
        console.log(`  Reserve:       ${snap.reserve}`);
        console.log(`  Inventory:     ${snap.inventory}`);
        console.log(`  Total Staked:  ${snap.totalStaked}`);
        console.log(`  Reward Index:  ${snap.rewardIndex}`);
        console.log();
      }
    } catch (err) {
      // A single failed cycle should not kill a long-running watch.
      console.error(`model-vault watch cycle ${cycle} failed: ${String(err)}`);
    }

    if (maxCycles > 0 && cycle >= maxCycles) break;
    if (intervalMs > 0) await sleep(intervalMs);
  }
}

// ---------------------------------------------------------------------------
// arb: compare curve spot price to the Astroport DEX pair price and emit the
// rebalancing trade when they diverge beyond --threshold-bps.
// ---------------------------------------------------------------------------

type AstroAssetInfo = {
  native_token?: { denom?: string };
  token?: { contract_addr?: string };
};
type AstroAsset = { info?: AstroAssetInfo; amount?: string };
type AstroPoolShape = { assets?: AstroAsset[] };

function assetDenom(info: AstroAssetInfo | undefined): string {
  return (info?.native_token?.denom ?? info?.token?.contract_addr ?? "").trim();
}

/**
 * DEX price of the model token in reserve units, derived from the Astroport
 * pair's pool reserves: reserveSide.amount / modelSide.amount. Matches the curve
 * convention (reserve per 1 model token) so the two prices are directly
 * comparable. Returns 0 when either leg is missing/empty.
 */
function dexPriceFromPool(
  pool: AstroPoolShape,
  modelDenom: string,
  reserveDenom: string,
): number {
  const assets = pool.assets ?? [];
  const modelAsset = assets.find((a) => assetDenom(a.info) === modelDenom);
  const reserveAsset = assets.find((a) => assetDenom(a.info) === reserveDenom);
  const modelAmt = Number(modelAsset?.amount ?? 0);
  const reserveAmt = Number(reserveAsset?.amount ?? 0);
  if (!Number.isFinite(modelAmt) || !Number.isFinite(reserveAmt) || modelAmt <= 0) {
    return 0;
  }
  return reserveAmt / modelAmt;
}

/**
 * `clawd model-vault arb` — compares the curve spot price to the DEX pair price
 * and, when they diverge beyond --threshold-bps, emits the rebalancing trade:
 * buy on the cheaper venue / sell on the dearer. Default DRY-RUN prints the
 * suggested MsgExecuteContract(s); --execute signs + broadcasts the curve leg.
 */
export async function runModelVaultArb(opts: ModelVaultArbOptions): Promise<void> {
  const contract = requireNonEmpty("--contract", opts.contract);
  const dexPair = requireNonEmpty("--dex-pair", opts.dexPair);
  const thresholdBps = requireNonNegativeInteger("--threshold-bps", opts.thresholdBps ?? "50");
  const maxTrade = requirePositiveAmount("--max-trade", opts.maxTrade ?? "1000000");

  try {
    const config = await fetchConfig(getRestUrl(), contract);
    const modelDenom = config.model_denom?.trim();
    const reserveDenom = config.reserve_denom?.trim();
    if (!modelDenom || !reserveDenom) {
      throw new Error("Contract Config did not return model_denom + reserve_denom.");
    }

    const [curvePool, dexPool] = await Promise.all([
      smartQuery(contract, buildPoolQuery()) as Promise<CurvePoolShape>,
      smartQuery(dexPair, { pool: {} }) as Promise<AstroPoolShape>,
    ]);

    const curvePrice = round6(curveSpotPrice(curvePool));
    const dexPrice = round6(dexPriceFromPool(dexPool, modelDenom, reserveDenom));

    if (curvePrice <= 0 || dexPrice <= 0) {
      throw new Error(
        `Cannot price both venues (curve=${curvePrice}, dex=${dexPrice}). Check liquidity.`,
      );
    }

    // Divergence relative to the cheaper venue, in basis points.
    const cheaper = Math.min(curvePrice, dexPrice);
    const divergenceBps = Math.round(((Math.abs(curvePrice - dexPrice)) / cheaper) * 10_000);
    const actionable = divergenceBps >= thresholdBps;

    // Rebalance: buy on the cheaper venue (model token is cheap there), sell on
    // the dearer. The curve buy attaches reserve_denom; the curve sell attaches
    // model_denom. We only own the curve leg as a signed message — the DEX leg
    // is reported as guidance.
    const curveIsCheaper = curvePrice < dexPrice;
    const curveSide: "buy" | "sell" = curveIsCheaper ? "buy" : "sell";
    const curveFundDenom = curveSide === "buy" ? reserveDenom : modelDenom;
    const curveFunds: Coin[] = [{ denom: curveFundDenom, amount: maxTrade }];

    const report = {
      action: "ModelVaultArb",
      contract,
      dex_pair: dexPair,
      model_denom: modelDenom,
      reserve_denom: reserveDenom,
      curve_price: curvePrice,
      dex_price: dexPrice,
      divergence_bps: divergenceBps,
      threshold_bps: thresholdBps,
      actionable,
      // Guidance: buy on the cheaper venue, sell on the dearer.
      buy_venue: curveIsCheaper ? "curve" : "dex",
      sell_venue: curveIsCheaper ? "dex" : "curve",
      max_trade: maxTrade,
      curve_leg: {
        side: curveSide,
        fund_denom: curveFundDenom,
        amount: maxTrade,
      },
      executed: false as boolean,
      tx_hash: null as string | null,
      dry_run: !opts.execute,
    };

    if (!actionable) {
      if (opts.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        console.log("No arbitrage: prices within threshold.");
        console.log(`  Curve Price:     ${curvePrice}`);
        console.log(`  DEX Price:       ${dexPrice}`);
        console.log(`  Divergence:      ${divergenceBps} bps (threshold ${thresholdBps} bps)`);
        console.log();
      }
      return;
    }

    // Build the curve-leg MsgExecuteContract (the leg this CLI can sign).
    const buildCurveMsg = (sender: string) =>
      curveSide === "buy"
        ? buildBuyMsg(sender, contract, curveFunds)
        : buildSellMsg(sender, contract, curveFunds);

    if (!opts.execute) {
      // DRY-RUN: print the suggested message without signing.
      const suggested = buildCurveMsg(config.owner?.trim() || "<sender>");
      const dryReport = {
        ...report,
        suggested_msgs: [
          {
            note: `Curve ${curveSide} leg (sign this with "clawd model-vault ${curveSide} --contract ${contract} --amount ${maxTrade}")`,
            typeUrl: suggested.typeUrl,
            value: {
              ...suggested.value,
              msg: JSON.parse(Buffer.from(suggested.value.msg).toString("utf8")),
            },
          },
          {
            note: `DEX ${curveSide === "buy" ? "sell" : "buy"} leg: rebalance on the Astroport pair ${dexPair} (see "clawd dex swap")`,
          },
        ],
      };
      if (opts.json) {
        process.stdout.write(JSON.stringify(dryReport, null, 2) + "\n");
      } else {
        console.log("Arbitrage opportunity detected (DRY-RUN — pass --execute to broadcast).");
        console.log(`  Curve Price:     ${curvePrice}`);
        console.log(`  DEX Price:       ${dexPrice}`);
        console.log(`  Divergence:      ${divergenceBps} bps (threshold ${thresholdBps} bps)`);
        console.log(`  Cheaper venue:   ${curveIsCheaper ? "curve" : "dex"} -> buy here`);
        console.log(`  Curve leg:       ${curveSide} ${maxTrade}${curveFundDenom}`);
        console.log(`  DEX leg:         ${curveSide === "buy" ? "sell" : "buy"} on ${shortAddr(dexPair)}`);
        console.log("\n  Suggested curve MsgExecuteContract:");
        console.log(JSON.stringify(dryReport.suggested_msgs[0], null, 2));
        console.log();
      }
      return;
    }

    // EXECUTE: sign + broadcast the curve leg via the shared signer.
    const { account, signingClient } = await ensureSigner();
    try {
      const msg = buildCurveMsg(account.address);
      const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
      if (res.code !== 0) {
        throw new Error(`Arb ${curveSide} tx failed (code=${res.code}): ${res.rawLog}`);
      }
      const execReport = { ...report, executed: true, tx_hash: res.transactionHash };
      if (opts.json) {
        process.stdout.write(JSON.stringify(execReport, null, 2) + "\n");
      } else {
        console.log(`Arbitrage curve leg broadcast (${curveSide}).`);
        console.log(`  Contract:    ${shortAddr(contract)}`);
        console.log(`  Sender:      ${shortAddr(account.address)}`);
        console.log(`  Leg:         ${curveSide} ${maxTrade}${curveFundDenom}`);
        console.log(`  TxHash:      ${res.transactionHash}`);
        console.log(`  Reminder:    settle the DEX ${curveSide === "buy" ? "sell" : "buy"} leg on ${shortAddr(dexPair)}.`);
        console.log();
      }
    } finally {
      signingClient.disconnect();
    }
  } catch (err) {
    console.error(`model-vault arb failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Internal: resolve the contract's configured denoms via Config query so the
// CLI attaches the correct denom for Buy/Sell/Stake/Distribute.
// ---------------------------------------------------------------------------

type ConfigShape = { model_denom?: string; reserve_denom?: string; owner?: string };

async function fetchConfig(restUrl: string, contract: string): Promise<ConfigShape> {
  const base64Query = Buffer.from(JSON.stringify(buildConfigQuery())).toString("base64");
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${encodeURIComponent(contract)}/smart/${base64Query}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Config query failed (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data?: ConfigShape };
  return data.data ?? (data as ConfigShape);
}

async function resolveReserveDenom(restUrl: string, contract: string): Promise<string> {
  const config = await fetchConfig(restUrl, contract);
  if (!config.reserve_denom?.trim()) {
    throw new Error("Contract Config did not return a reserve_denom.");
  }
  return config.reserve_denom;
}

async function resolveModelDenom(restUrl: string, contract: string): Promise<string> {
  const config = await fetchConfig(restUrl, contract);
  if (!config.model_denom?.trim()) {
    throw new Error("Contract Config did not return a model_denom.");
  }
  return config.model_denom;
}

function reportExecute(
  label: string,
  contract: string,
  sender: string,
  txHash: string,
  opts: { json?: boolean },
  extraReport: Record<string, unknown> = {},
): void {
  const report = {
    action: label,
    contract,
    sender,
    tx_hash: txHash,
    ...extraReport,
  };
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  console.log(`${label} submitted.`);
  console.log(`  Contract: ${shortAddr(contract)}`);
  console.log(`  Sender:   ${shortAddr(sender)}`);
  console.log(`  TxHash:   ${txHash}`);
}
