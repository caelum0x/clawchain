/**
 * `clawd dex` subcommands — DEX / AMM pool queries, swap execution, and
 * liquidity management.
 *
 * Queries Astroport-style CosmWasm DEX contracts via REST smart-query
 * (JSON -> base64 -> /cosmwasm/wasm/v1/contract/{addr}/smart/{b64}).
 *
 * Transaction subcommands (swap, add-liquidity, remove-liquidity) use the shared
 * clawchain signing registry with MsgExecuteContract built from the local mnemonic.
 */

import { GasPrice } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { toUtf8 } from "@cosmjs/encoding";
import { loadClawdConfig, writeClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, shortAddr, formatClaw } from "../lib/format.js";
import { connectClawchainSigningClient } from "../lib/signing.js";

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

function getRestUrl(): string {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  return (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
}

async function smartQuery(restUrl: string, contractAddr: string, queryMsg: Record<string, unknown>): Promise<unknown> {
  const base64Query = Buffer.from(JSON.stringify(queryMsg)).toString("base64");
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${encodeURIComponent(contractAddr)}/smart/${base64Query}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Smart query failed (HTTP ${res.status}): ${body}`);
  }
  const data = (await res.json()) as { data?: unknown };
  return data.data ?? data;
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

/**
 * Build a Cosmos SDK MsgExecuteContract value object compatible with
 * SigningStargateClient.signAndBroadcast.
 */
function buildMsgExecuteContract(
  sender: string,
  contract: string,
  msg: Record<string, unknown>,
  funds: { denom: string; amount: string }[] = [],
) {
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: {
      sender,
      contract,
      msg: toUtf8(JSON.stringify(msg)),
      funds,
    },
  };
}

/**
 * Format a DexAssetInfo for display.
 */
function assetLabel(info: any): string {
  if (info?.native_token?.denom) return info.native_token.denom;
  if (info?.token?.contract_addr) return shortAddr(info.token.contract_addr);
  return JSON.stringify(info);
}

/**
 * Build an Astroport-style asset info from a denom string.
 * If the denom looks like a bech32 contract address, treat it as CW20.
 */
function buildAssetInfo(denom: string): any {
  if (denom.startsWith("claw1") && denom.length > 20) {
    return { token: { contract_addr: denom } };
  }
  return { native_token: { denom } };
}

// ---------------------------------------------------------------------------
// clawd dex pools
// ---------------------------------------------------------------------------

export type DexPoolsOptions = {
  factory: string;
  limit?: string;
  json?: boolean;
};

export async function runDexPools(opts: DexPoolsOptions): Promise<void> {
  const restUrl = getRestUrl();

  if (!opts.factory) {
    console.error("Error: --factory <address> is required.");
    process.exit(1);
  }

  try {
    const queryMsg: Record<string, unknown> = {
      pairs: {
        ...(opts.limit !== undefined && { limit: Number(opts.limit) }),
      },
    };

    const result = (await smartQuery(restUrl, opts.factory, queryMsg)) as {
      pairs?: any[];
    };
    const pairs = result?.pairs ?? [];

    // For each pair, try to query pool state for liquidity info
    const poolDetails: any[] = [];
    for (const p of pairs) {
      const addr = p.contract_addr ?? "";
      let totalShare = "-";
      let poolType = p.pair_type
        ? typeof p.pair_type === "string"
          ? p.pair_type
          : Object.keys(p.pair_type)[0] ?? "xyk"
        : "xyk";
      try {
        const poolState = (await smartQuery(restUrl, addr, { pool: {} })) as {
          total_share?: string;
        };
        totalShare = poolState?.total_share ?? "-";
      } catch {
        // Pool query is best-effort
      }
      poolDetails.push({ ...p, totalShare, poolType });
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify({ pools: poolDetails }, null, 2) + "\n");
      return;
    }

    if (poolDetails.length === 0) {
      console.log("No trading pools found.");
      return;
    }

    const headers = ["#", "Pair Address", "Asset A", "Asset B", "Pool Type", "Total Liquidity"];
    const rows = poolDetails.map((p: any, i: number) => [
      String(i + 1),
      shortAddr(p.contract_addr ?? ""),
      assetLabel(p.asset_infos?.[0]),
      assetLabel(p.asset_infos?.[1]),
      String(p.poolType),
      String(p.totalShare),
    ]);

    console.log("DEX Trading Pools\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query DEX pools: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd dex pool <pair-addr>
// ---------------------------------------------------------------------------

export type DexPoolOptions = {
  pairAddr: string;
  json?: boolean;
};

export async function runDexPool(opts: DexPoolOptions): Promise<void> {
  const restUrl = getRestUrl();

  try {
    const [poolResult, pairResult] = await Promise.all([
      smartQuery(restUrl, opts.pairAddr, { pool: {} }) as Promise<{
        assets?: any[];
        total_share?: string;
      }>,
      smartQuery(restUrl, opts.pairAddr, { pair: {} }).catch(() => null) as Promise<{
        pair_type?: any;
        asset_infos?: any[];
        contract_addr?: string;
      } | null>,
    ]);

    // Also try to get config for fee rate
    let configResult: any = null;
    try {
      configResult = await smartQuery(restUrl, opts.pairAddr, { config: {} });
    } catch {
      // Config query is best-effort
    }

    const poolType = pairResult?.pair_type
      ? typeof pairResult.pair_type === "string"
        ? pairResult.pair_type
        : Object.keys(pairResult.pair_type)[0] ?? "xyk"
      : "unknown";

    const feeRate = configResult?.commission_rate
      ?? configResult?.fee_rate
      ?? configResult?.total_fee_rate
      ?? null;

    const combined = {
      ...poolResult,
      pool_type: poolType,
      fee_rate: feeRate,
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(combined, null, 2) + "\n");
      return;
    }

    const assets = poolResult?.assets ?? [];

    console.log(`Pool Details: ${opts.pairAddr}\n`);
    console.log(`  Pool Type:    ${poolType}`);
    if (feeRate !== null) {
      console.log(`  Fee Rate:     ${feeRate}`);
    }
    console.log();

    console.log("  Reserves:");
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      const label = assetLabel(a?.info);
      const amount = a?.amount ?? "0";
      console.log(`    Asset ${i + 1}: ${label}`);
      console.log(`      Amount: ${amount}`);
    }

    console.log();
    console.log(`  LP Token Supply: ${poolResult?.total_share ?? "0"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query pool state: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd dex price <pair-addr>
// ---------------------------------------------------------------------------

export type DexPriceOptions = {
  pairAddr: string;
  json?: boolean;
};

export async function runDexPrice(opts: DexPriceOptions): Promise<void> {
  const restUrl = getRestUrl();

  try {
    // First, query the pair info to discover the two asset infos
    const pairInfo = (await smartQuery(restUrl, opts.pairAddr, { pair: {} })) as {
      asset_infos?: any[];
    };
    const infos = pairInfo?.asset_infos ?? [];

    if (infos.length < 2) {
      console.error("Could not determine pair asset infos.");
      process.exit(1);
    }

    // Simulate 1 unit swap in both directions
    const oneUnit = "1000000"; // 1 token (assuming 6 decimals)

    const [fwdResult, revResult] = await Promise.all([
      smartQuery(restUrl, opts.pairAddr, {
        simulation: {
          offer_asset: { info: infos[0], amount: oneUnit },
        },
      }) as Promise<{ return_amount?: string; spread_amount?: string; commission_amount?: string }>,
      smartQuery(restUrl, opts.pairAddr, {
        simulation: {
          offer_asset: { info: infos[1], amount: oneUnit },
        },
      }) as Promise<{ return_amount?: string; spread_amount?: string; commission_amount?: string }>,
    ]);

    const fwdPrice = Number(fwdResult?.return_amount ?? 0) / 1_000_000;
    const revPrice = Number(revResult?.return_amount ?? 0) / 1_000_000;

    const output = {
      pair: opts.pairAddr,
      asset_a: assetLabel(infos[0]),
      asset_b: assetLabel(infos[1]),
      price_a_to_b: fwdPrice,
      price_b_to_a: revPrice,
      spread_a_to_b: fwdResult?.spread_amount ?? "0",
      spread_b_to_a: revResult?.spread_amount ?? "0",
      commission_a_to_b: fwdResult?.commission_amount ?? "0",
      commission_b_to_a: revResult?.commission_amount ?? "0",
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
      return;
    }

    const labelA = assetLabel(infos[0]);
    const labelB = assetLabel(infos[1]);

    console.log(`Price for ${opts.pairAddr}\n`);
    console.log(`  ${labelA} -> ${labelB}:`);
    console.log(`    Price:      1 ${labelA} = ${fwdPrice.toFixed(6)} ${labelB}`);
    console.log(`    Spread:     ${fwdResult?.spread_amount ?? "0"}`);
    console.log(`    Commission: ${fwdResult?.commission_amount ?? "0"}`);
    console.log();
    console.log(`  ${labelB} -> ${labelA}:`);
    console.log(`    Price:      1 ${labelB} = ${revPrice.toFixed(6)} ${labelA}`);
    console.log(`    Spread:     ${revResult?.spread_amount ?? "0"}`);
    console.log(`    Commission: ${revResult?.commission_amount ?? "0"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query price: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd dex swap
// ---------------------------------------------------------------------------

export type DexSwapOptions = {
  pair: string;
  offerAsset: string;
  amount: string;
  maxSpread?: string;
  from?: string;
  json?: boolean;
};

export async function runDexSwap(opts: DexSwapOptions): Promise<void> {
  if (!opts.pair) {
    console.error("Error: --pair <address> is required.");
    process.exit(1);
  }
  if (!opts.offerAsset) {
    console.error("Error: --offer-asset <denom> is required.");
    process.exit(1);
  }
  if (!opts.amount) {
    console.error("Error: --amount <amount> is required.");
    process.exit(1);
  }

  const maxSpread = opts.maxSpread ?? "0.5";
  const maxSpreadDecimal = (Number(maxSpread) / 100).toString();

  const { account, signingClient } = await ensureSigner();
  const restUrl = getRestUrl();

  const offerInfo = buildAssetInfo(opts.offerAsset);
  const isNative = !!offerInfo.native_token;

  try {
    // First simulate to show expected return
    let simulation: any = null;
    try {
      simulation = await smartQuery(restUrl, opts.pair, {
        simulation: {
          offer_asset: { info: offerInfo, amount: opts.amount },
        },
      });
    } catch {
      // Simulation is best-effort; proceed with swap anyway
    }

    if (simulation && !opts.json) {
      console.log("Swap Simulation:");
      console.log(`  Expected Return: ${simulation.return_amount ?? "?"}`);
      console.log(`  Spread:          ${simulation.spread_amount ?? "?"}`);
      console.log(`  Commission:      ${simulation.commission_amount ?? "?"}`);
      console.log();
    }

    let msg;
    if (isNative) {
      // Native token swap: send as MsgExecuteContract with funds
      const execMsg = {
        swap: {
          offer_asset: {
            info: offerInfo,
            amount: opts.amount,
          },
          max_spread: maxSpreadDecimal,
        },
      };

      msg = buildMsgExecuteContract(
        account.address,
        opts.pair,
        execMsg,
        [{ denom: offerInfo.native_token.denom, amount: opts.amount }],
      );
    } else {
      // CW20 token swap: send via CW20 send message to the pair contract
      const swapMsg = Buffer.from(
        JSON.stringify({
          swap: {
            max_spread: maxSpreadDecimal,
          },
        }),
      ).toString("base64");

      const cw20SendMsg = {
        send: {
          contract: opts.pair,
          amount: opts.amount,
          msg: swapMsg,
        },
      };

      msg = buildMsgExecuteContract(
        account.address,
        offerInfo.token.contract_addr,
        cw20SendMsg,
      );
    }

    console.log(`Executing swap on ${shortAddr(opts.pair)}...`);
    console.log(`  Offer:      ${opts.amount} ${assetLabel(offerInfo)}`);
    console.log(`  Max Spread: ${maxSpread}%`);
    console.log();

    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Swap failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            tx_hash: res.transactionHash,
            return_amount: simulation?.return_amount ?? null,
            spread_amount: simulation?.spread_amount ?? null,
            commission_amount: simulation?.commission_amount ?? null,
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }

    console.log("Swap executed successfully.");
    console.log(`  TxHash:     ${res.transactionHash}`);
    if (simulation) {
      console.log(`  Return:     ${simulation.return_amount ?? "?"}`);
      console.log(`  Spread:     ${simulation.spread_amount ?? "?"}`);
      console.log(`  Commission: ${simulation.commission_amount ?? "?"}`);
    }
    console.log();
  } catch (err) {
    console.error(`Swap failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd dex add-liquidity
// ---------------------------------------------------------------------------

export type DexAddLiquidityOptions = {
  pair: string;
  assets: string;
  slippage?: string;
  from?: string;
  json?: boolean;
};

/**
 * Parse asset string like "uclaw:1000000,claw1abc...:500000" into asset array.
 */
function parseAssets(raw: string): { info: any; amount: string }[] {
  return raw.split(",").map((entry) => {
    const [denom, amount] = entry.trim().split(":");
    if (!denom || !amount) {
      throw new Error(`Invalid asset format: "${entry}". Expected "denom:amount".`);
    }
    return {
      info: buildAssetInfo(denom),
      amount,
    };
  });
}

export async function runDexAddLiquidity(opts: DexAddLiquidityOptions): Promise<void> {
  if (!opts.pair) {
    console.error("Error: --pair <address> is required.");
    process.exit(1);
  }
  if (!opts.assets) {
    console.error("Error: --assets <denom1:amount1,denom2:amount2> is required.");
    process.exit(1);
  }

  let assets: { info: any; amount: string }[];
  try {
    assets = parseAssets(opts.assets);
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  const slippage = opts.slippage ?? "1";
  const slippageDecimal = (Number(slippage) / 100).toString();

  const { account, signingClient } = await ensureSigner();

  try {
    const execMsg = {
      provide_liquidity: {
        assets: assets.map((a) => ({
          info: a.info,
          amount: a.amount,
        })),
        slippage_tolerance: slippageDecimal,
      },
    };

    // Collect native funds to attach to the message
    const funds: { denom: string; amount: string }[] = [];
    for (const a of assets) {
      if (a.info.native_token) {
        funds.push({ denom: a.info.native_token.denom, amount: a.amount });
      }
    }
    // Sort funds by denom (required by Cosmos SDK)
    funds.sort((a, b) => a.denom.localeCompare(b.denom));

    const msg = buildMsgExecuteContract(
      account.address,
      opts.pair,
      execMsg,
      funds,
    );

    if (!opts.json) {
      console.log(`Providing liquidity to ${shortAddr(opts.pair)}...`);
      for (const a of assets) {
        console.log(`  ${a.amount} ${assetLabel(a.info)}`);
      }
      console.log(`  Slippage Tolerance: ${slippage}%`);
      console.log();
    }

    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Add liquidity failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            tx_hash: res.transactionHash,
            assets: assets.map((a) => ({
              asset: assetLabel(a.info),
              amount: a.amount,
            })),
            slippage_tolerance: slippageDecimal,
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }

    console.log("Liquidity provided successfully.");
    console.log(`  TxHash: ${res.transactionHash}`);
    console.log();
  } catch (err) {
    console.error(`Add liquidity failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd dex remove-liquidity
// ---------------------------------------------------------------------------

export type DexRemoveLiquidityOptions = {
  pair: string;
  lpAmount: string;
  from?: string;
  json?: boolean;
};

export async function runDexRemoveLiquidity(opts: DexRemoveLiquidityOptions): Promise<void> {
  if (!opts.pair) {
    console.error("Error: --pair <address> is required.");
    process.exit(1);
  }
  if (!opts.lpAmount) {
    console.error("Error: --lp-amount <amount> is required.");
    process.exit(1);
  }

  const { account, signingClient } = await ensureSigner();
  const restUrl = getRestUrl();

  try {
    // Query the pair to find its LP token address
    const pairInfo = (await smartQuery(restUrl, opts.pair, { pair: {} })) as {
      liquidity_token?: string;
    };
    const lpToken = pairInfo?.liquidity_token;

    if (!lpToken) {
      console.error("Could not determine LP token address for this pair.");
      process.exit(1);
    }

    // Build CW20 send message: send LP tokens to pair with withdraw_liquidity hook
    const withdrawMsg = Buffer.from(
      JSON.stringify({ withdraw_liquidity: {} }),
    ).toString("base64");

    const cw20SendMsg = {
      send: {
        contract: opts.pair,
        amount: opts.lpAmount,
        msg: withdrawMsg,
      },
    };

    const msg = buildMsgExecuteContract(
      account.address,
      lpToken,
      cw20SendMsg,
    );

    if (!opts.json) {
      console.log(`Removing liquidity from ${shortAddr(opts.pair)}...`);
      console.log(`  LP Tokens: ${opts.lpAmount}`);
      console.log(`  LP Token Contract: ${shortAddr(lpToken)}`);
      console.log();
    }

    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Remove liquidity failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            tx_hash: res.transactionHash,
            lp_token: lpToken,
            lp_amount: opts.lpAmount,
          },
          null,
          2,
        ) + "\n",
      );
      return;
    }

    console.log("Liquidity removed successfully.");
    console.log(`  TxHash: ${res.transactionHash}`);
    console.log();
  } catch (err) {
    console.error(`Remove liquidity failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd dex simulate <pair-addr> (kept for backward compatibility)
// ---------------------------------------------------------------------------

export type DexSimulateOptions = {
  pairAddr: string;
  offerDenom: string;
  offerAmount: string;
  offerContract?: string;
  reverse?: boolean;
  json?: boolean;
};

export async function runDexSimulate(opts: DexSimulateOptions): Promise<void> {
  const restUrl = getRestUrl();

  const assetInfo: any = opts.offerContract
    ? { token: { contract_addr: opts.offerContract } }
    : { native_token: { denom: opts.offerDenom } };

  try {
    let result: any;
    if (opts.reverse) {
      result = await smartQuery(restUrl, opts.pairAddr, {
        reverse_simulation: {
          ask_asset: { info: assetInfo, amount: opts.offerAmount },
        },
      });
    } else {
      result = await smartQuery(restUrl, opts.pairAddr, {
        simulation: {
          offer_asset: { info: assetInfo, amount: opts.offerAmount },
        },
      });
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }

    console.log(`Swap Simulation (${opts.reverse ? "reverse" : "forward"})\n`);
    console.log(`  Pair:       ${opts.pairAddr}`);
    console.log(`  Offer:      ${opts.offerAmount} ${assetLabel(assetInfo)}`);
    console.log();

    if (opts.reverse) {
      console.log(`  Required Offer Amount: ${result?.offer_amount ?? "?"}`);
    } else {
      console.log(`  Return Amount:         ${result?.return_amount ?? "?"}`);
    }
    console.log(`  Spread Amount:         ${result?.spread_amount ?? "?"}`);
    console.log(`  Commission Amount:     ${result?.commission_amount ?? "?"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to simulate swap: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd dex config
// ---------------------------------------------------------------------------

export type DexConfigOptions = {
  factory?: string;
  router?: string;
  json?: boolean;
};

export async function runDexConfig(opts: DexConfigOptions): Promise<void> {
  const cfg = loadClawdConfig();

  // If --factory or --router provided, save them
  const dexConfig = (cfg as any).dex ?? {};
  let changed = false;

  if (opts.factory) {
    dexConfig.factoryAddr = opts.factory;
    changed = true;
  }
  if (opts.router) {
    dexConfig.routerAddr = opts.router;
    changed = true;
  }

  if (changed) {
    (cfg as any).dex = dexConfig;
    writeClawdConfig(cfg);
    console.log("DEX config saved.\n");
  }

  const factoryAddr = dexConfig.factoryAddr ?? "";
  const routerAddr = dexConfig.routerAddr ?? "";

  // If router is configured, try to fetch its on-chain config
  let routerConfig: any = null;
  if (routerAddr) {
    try {
      const restUrl = getRestUrl();
      routerConfig = await smartQuery(restUrl, routerAddr, { config: {} });
    } catch {
      // Router config query is best-effort
    }
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          factory: factoryAddr || null,
          router: routerAddr || null,
          router_config: routerConfig,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("DEX Configuration\n");
  console.log(`  Factory: ${factoryAddr || "(not set)"}`);
  console.log(`  Router:  ${routerAddr || "(not set)"}`);

  if (routerConfig) {
    console.log("\n  Router On-Chain Config:");
    for (const [k, v] of Object.entries(routerConfig)) {
      console.log(`    ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Re-export old name for backward compatibility
// ---------------------------------------------------------------------------

export { runDexPools as runDexPairs };
