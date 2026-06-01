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

import { toUtf8 } from "@cosmjs/encoding";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { loadClawdConfig } from "../lib/config.js";
import { shortAddr } from "../lib/format.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { connectClawchainSigningClient } from "../lib/signing.js";

type Coin = { denom: string; amount: string };

const EXECUTE_TYPE_URL = "/cosmwasm.wasm.v1.MsgExecuteContract";

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
// Internal: resolve the contract's configured denoms via Config query so the
// CLI attaches the correct denom for Buy/Sell/Stake/Distribute.
// ---------------------------------------------------------------------------

type ConfigShape = { model_denom?: string; reserve_denom?: string };

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
