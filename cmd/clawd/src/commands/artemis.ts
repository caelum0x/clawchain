/**
 * `clawd artemis` subcommands -- run, scan, pools for the ClawArtemis DEX
 * arbitrage bot.
 *
 * Wraps the claw-artemis bot logic as clawd subcommands so operators can
 * discover and execute arbitrage opportunities directly from the CLI.
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

type PoolAssetInfo =
  | { native_token: { denom: string } }
  | { token: { contract_addr: string } };

interface CosmWasmPoolResponse {
  assets: { info: PoolAssetInfo; amount: string }[];
  total_share: string;
}

interface FactoryPairsResponse {
  pairs: {
    asset_infos: PoolAssetInfo[];
    contract_addr: string;
    liquidity_token: string;
  }[];
}

type PoolState = {
  address: string;
  assets: { denom: string; amount: string }[];
  totalShare: string;
  feeRate: number;
};

type ArbitrageOpportunity = {
  path: { pool: string; action: "buy" | "sell"; asset: string }[];
  inputDenom: string;
  inputAmount: string;
  expectedOutput: string;
  estimatedProfit: string;
  profitPct: number;
};

type ScanResult = {
  timestamp: string;
  poolsScanned: number;
  opportunities: ArbitrageOpportunity[];
};

// ---------------------------------------------------------------------------
// CosmWasm smart-query: pool state
// ---------------------------------------------------------------------------

async function queryPoolState(
  restUrl: string,
  contractAddr: string,
): Promise<PoolState> {
  const query = JSON.stringify({ pool: {} });
  const b64Query = Buffer.from(query).toString("base64");
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${contractAddr}/smart/${b64Query}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    throw new Error(
      `Pool query failed for ${contractAddr}: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as { data: CosmWasmPoolResponse };
  const data = json.data;

  const assets = data.assets.map((a) => {
    const denom =
      "native_token" in a.info
        ? a.info.native_token.denom
        : a.info.token.contract_addr;
    return { denom, amount: a.amount };
  });

  return {
    address: contractAddr,
    assets,
    totalShare: data.total_share,
    feeRate: 0.003, // default 0.3%
  };
}

// ---------------------------------------------------------------------------
// CosmWasm smart-query: factory pairs
// ---------------------------------------------------------------------------

async function queryFactoryPairs(
  restUrl: string,
  factoryAddr: string,
): Promise<FactoryPairsResponse> {
  const query = JSON.stringify({ pairs: { limit: 100 } });
  const b64Query = Buffer.from(query).toString("base64");
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${factoryAddr}/smart/${b64Query}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    throw new Error(
      `Factory query failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as { data: FactoryPairsResponse };
  return json.data;
}

// ---------------------------------------------------------------------------
// AMM math: constant-product swap
// ---------------------------------------------------------------------------

/**
 * Calculate output amount for a swap using constant-product formula.
 * output = (reserveOut * offerAmount * (1 - fee)) / (reserveIn + offerAmount * (1 - fee))
 */
function constantProductSwap(
  reserveIn: bigint,
  reserveOut: bigint,
  offerAmount: bigint,
  feeRate: number,
): bigint {
  if (reserveIn <= 0n || reserveOut <= 0n || offerAmount <= 0n) {
    return 0n;
  }
  // Use basis-point math to avoid floating point: fee = 0.003 => 30 bps
  const feeBps = BigInt(Math.round(feeRate * 10000));
  const effectiveInput = offerAmount * (10000n - feeBps);
  const numerator = reserveOut * effectiveInput;
  const denominator = reserveIn * 10000n + effectiveInput;
  if (denominator === 0n) return 0n;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// Strategy: find two-pool arbitrage
// ---------------------------------------------------------------------------

function findTwoPoolArb(
  poolBuy: PoolState,
  poolSell: PoolState,
  inputDenom: string,
  intermediateDenom: string,
  minProfit: bigint,
): ArbitrageOpportunity | null {
  const buyInputAsset = poolBuy.assets.find((a) => a.denom === inputDenom);
  const buyOutputAsset = poolBuy.assets.find(
    (a) => a.denom === intermediateDenom,
  );
  const sellInputAsset = poolSell.assets.find(
    (a) => a.denom === intermediateDenom,
  );
  const sellOutputAsset = poolSell.assets.find((a) => a.denom === inputDenom);

  if (!buyInputAsset || !buyOutputAsset || !sellInputAsset || !sellOutputAsset) {
    return null;
  }

  const reserveBuyIn = BigInt(buyInputAsset.amount);
  const reserveBuyOut = BigInt(buyOutputAsset.amount);
  const reserveSellIn = BigInt(sellInputAsset.amount);
  const reserveSellOut = BigInt(sellOutputAsset.amount);

  // Search a range of input amounts to find the optimal one
  // From 0.2% to 10% of the buy-side input reserve in 50 steps
  let bestProfit = 0n;
  let bestInput = 0n;
  let bestOutput = 0n;

  const steps = 50;
  for (let i = 1; i <= steps; i++) {
    const fraction = BigInt(i);
    const inputAmount = (reserveBuyIn * fraction) / BigInt(steps * 10);

    if (inputAmount === 0n) continue;

    const intermediateAmount = constantProductSwap(
      reserveBuyIn,
      reserveBuyOut,
      inputAmount,
      poolBuy.feeRate,
    );
    if (intermediateAmount === 0n) continue;

    const outputAmount = constantProductSwap(
      reserveSellIn,
      reserveSellOut,
      intermediateAmount,
      poolSell.feeRate,
    );
    if (outputAmount === 0n) continue;

    const profit = outputAmount - inputAmount;
    if (profit > bestProfit) {
      bestProfit = profit;
      bestInput = inputAmount;
      bestOutput = outputAmount;
    }
  }

  if (bestProfit < minProfit) {
    return null;
  }

  const profitPct =
    bestInput > 0n
      ? Number((bestProfit * 10000n) / bestInput) / 100
      : 0;

  return {
    path: [
      { pool: poolBuy.address, action: "buy", asset: intermediateDenom },
      { pool: poolSell.address, action: "sell", asset: intermediateDenom },
    ],
    inputDenom,
    inputAmount: bestInput.toString(),
    expectedOutput: bestOutput.toString(),
    estimatedProfit: bestProfit.toString(),
    profitPct,
  };
}

// ---------------------------------------------------------------------------
// Strategy: calculate arbitrage between two pools sharing common assets
// ---------------------------------------------------------------------------

function calculateArbitrage(
  pool1: PoolState,
  pool2: PoolState,
  minProfit: string,
): ArbitrageOpportunity | null {
  if (pool1.assets.length < 2 || pool2.assets.length < 2) {
    return null;
  }

  // Find the common assets between the two pools
  const pool1Denoms = pool1.assets.map((a) => a.denom);
  const pool2Denoms = pool2.assets.map((a) => a.denom);
  const commonDenoms = pool1Denoms.filter((d) => pool2Denoms.includes(d));

  if (commonDenoms.length === 0) {
    return null;
  }

  const minProfitBig = BigInt(minProfit);
  let bestOpportunity: ArbitrageOpportunity | null = null;
  let bestProfit = 0n;

  for (const commonDenom of commonDenoms) {
    const otherDenom1 = pool1.assets.find((a) => a.denom !== commonDenom);
    const otherDenom2 = pool2.assets.find((a) => a.denom !== commonDenom);

    if (!otherDenom1 || !otherDenom2) continue;

    // Only works if pool1 and pool2 share both assets
    if (otherDenom1.denom === otherDenom2.denom) {
      // Forward: buy intermediate in pool1 with commonDenom, sell in pool2
      const forward = findTwoPoolArb(
        pool1,
        pool2,
        commonDenom,
        otherDenom1.denom,
        minProfitBig,
      );
      if (forward && BigInt(forward.estimatedProfit) > bestProfit) {
        bestProfit = BigInt(forward.estimatedProfit);
        bestOpportunity = forward;
      }

      // Reverse: buy intermediate in pool2, sell in pool1
      const reverse = findTwoPoolArb(
        pool2,
        pool1,
        commonDenom,
        otherDenom1.denom,
        minProfitBig,
      );
      if (reverse && BigInt(reverse.estimatedProfit) > bestProfit) {
        bestProfit = BigInt(reverse.estimatedProfit);
        bestOpportunity = reverse;
      }
    }
  }

  return bestOpportunity;
}

// ---------------------------------------------------------------------------
// Collector: poll pool states
// ---------------------------------------------------------------------------

async function collectPoolStates(
  restUrl: string,
  poolAddresses: string[],
): Promise<PoolState[]> {
  const states: PoolState[] = [];

  for (const addr of poolAddresses) {
    try {
      const state = await queryPoolState(restUrl, addr);
      states.push(state);
    } catch (err) {
      console.error(`[collector] Failed to query pool ${addr}:`, err);
    }
  }

  return states;
}

// ---------------------------------------------------------------------------
// Collector: WebSocket subscription for new blocks
// ---------------------------------------------------------------------------

function subscribeNewBlocks(
  rpcUrl: string,
  onBlock: () => void,
): { close: () => void } {
  const wsUrl = rpcUrl.replace(/^http/, "ws") + "/websocket";
  let ws: globalThis.WebSocket | null = null;
  let closed = false;

  function connect() {
    if (closed) return;
    try {
      ws = new globalThis.WebSocket(wsUrl);

      ws.onopen = () => {
        ws?.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "subscribe",
            id: 1,
            params: { query: "tm.event='NewBlock'" },
          }),
        );
      };

      ws.onmessage = () => {
        onBlock();
      };

      ws.onerror = (ev) => {
        console.error("[ws] WebSocket error:", ev);
      };

      ws.onclose = () => {
        if (!closed) {
          // Reconnect after delay
          setTimeout(connect, 3000);
        }
      };
    } catch (err) {
      console.error("[ws] Failed to connect:", err);
      if (!closed) {
        setTimeout(connect, 3000);
      }
    }
  }

  connect();

  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Strategy: scan all pool pairs for arbitrage
// ---------------------------------------------------------------------------

function scanForOpportunities(
  pools: PoolState[],
  minProfit: string,
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (let i = 0; i < pools.length; i++) {
    for (let j = i + 1; j < pools.length; j++) {
      const opp = calculateArbitrage(pools[i], pools[j], minProfit);
      if (opp) {
        opportunities.push(opp);
      }
    }
  }

  // Sort by estimated profit descending
  opportunities.sort(
    (a, b) => Number(BigInt(b.estimatedProfit) - BigInt(a.estimatedProfit)),
  );

  return opportunities;
}

// ---------------------------------------------------------------------------
// Executor: build swap message (MsgExecuteContract)
// ---------------------------------------------------------------------------

function buildSwapMsg(
  sender: string,
  pool: string,
  offerDenom: string,
  offerAmount: string,
): {
  typeUrl: string;
  value: {
    sender: string;
    contract: string;
    msg: Uint8Array;
    funds: { denom: string; amount: string }[];
  };
} {
  const executeMsg = {
    swap: {
      offer_asset: {
        info: { native_token: { denom: offerDenom } },
        amount: offerAmount,
      },
      max_spread: "0.01",
    },
  };

  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: {
      sender,
      contract: pool,
      msg: new TextEncoder().encode(JSON.stringify(executeMsg)),
      funds: [{ denom: offerDenom, amount: offerAmount }],
    },
  };
}

// ---------------------------------------------------------------------------
// Executor: broadcast swap transaction
// ---------------------------------------------------------------------------

async function executeArbitrage(
  client: SigningStargateClient,
  sender: string,
  opportunity: ArbitrageOpportunity,
): Promise<string> {
  // Build the two-leg swap messages atomically in a single transaction
  const messages = opportunity.path.map((leg, i) => {
    if (i === 0) {
      // First swap: spend inputDenom to buy the intermediate asset
      return buildSwapMsg(
        sender,
        leg.pool,
        opportunity.inputDenom,
        opportunity.inputAmount,
      );
    } else {
      // Second swap: sell the intermediate asset back for inputDenom
      // We use "0" as amount since the chain executes atomically and
      // the actual amount comes from the first swap's output
      return buildSwapMsg(sender, leg.pool, leg.asset, "0");
    }
  });

  const result = await client.signAndBroadcast(sender, messages, "auto");

  if (result.code !== 0) {
    throw new Error(`Tx failed with code ${result.code}: ${result.rawLog}`);
  }

  return result.transactionHash;
}

// ---------------------------------------------------------------------------
// Helper: resolve denom from PoolAssetInfo
// ---------------------------------------------------------------------------

function denomFromAssetInfo(info: PoolAssetInfo): string {
  return "native_token" in info
    ? info.native_token.denom
    : info.token.contract_addr;
}

// ---------------------------------------------------------------------------
// clawd artemis run
// ---------------------------------------------------------------------------

export type ArtemisRunOptions = {
  pools?: string;
  factory?: string;
  minProfit?: string;
  dryRun?: boolean;
  interval?: string;
  json?: boolean;
};

export async function runArtemisRun(opts: ArtemisRunOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const dryRun = opts.dryRun ?? false;
  const minProfit = opts.minProfit ?? "1000";
  const intervalMs = parseInt(opts.interval ?? "2000", 10);

  // Resolve pool addresses: explicit list or factory discovery
  let poolAddresses: string[] = [];

  if (opts.pools) {
    poolAddresses = opts.pools.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (opts.factory) {
    try {
      const factoryData = await queryFactoryPairs(restUrl, opts.factory);
      poolAddresses = factoryData.pairs.map((p) => p.contract_addr);
    } catch (err) {
      console.error(`Failed to discover pools from factory: ${String(err)}`);
      process.exit(1);
    }
  }

  if (poolAddresses.length < 2) {
    console.error(
      "Error: At least 2 pool addresses are required for arbitrage scanning.",
    );
    console.error(
      "Provide --pools <addr1,addr2,...> or --factory <factory-addr> to discover pools.",
    );
    process.exit(1);
  }

  // Set up signing client (unless dry-run)
  let signingClient: SigningStargateClient | null = null;
  let senderAddress = "";

  if (!dryRun) {
    try {
      const signer = await ensureSigner();
      signingClient = signer.signingClient;
      senderAddress = signer.account.address;
    } catch (err) {
      console.error(`Failed to initialize wallet: ${String(err)}`);
      console.error('Use --dry-run to simulate without a wallet, or run "clawd init" first.');
      process.exit(1);
    }
  }

  console.log("[artemis] Starting arbitrage bot");
  console.log(`[artemis] RPC: ${rpcUrl} | REST: ${restUrl}`);
  console.log(`[artemis] Pools: ${poolAddresses.length} pool(s)`);
  for (const addr of poolAddresses) {
    console.log(`  ${addr}`);
  }
  console.log(`[artemis] Min profit: ${formatClaw(minProfit)}`);
  console.log(`[artemis] Dry run: ${dryRun}`);
  console.log(`[artemis] Poll interval: ${intervalMs}ms`);
  if (senderAddress) {
    console.log(`[artemis] Wallet: ${senderAddress}`);
  }
  console.log("");

  let running = true;
  let cycleCount = 0;
  let totalOpportunities = 0;
  let totalExecuted = 0;

  const runCycle = async () => {
    cycleCount++;
    try {
      const pools = await collectPoolStates(restUrl, poolAddresses);
      if (pools.length < 2) {
        console.log(
          "[collector] Not enough pool states collected, skipping cycle.",
        );
        return;
      }

      const opportunities = scanForOpportunities(pools, minProfit);

      if (opportunities.length === 0) {
        return;
      }

      totalOpportunities += opportunities.length;

      console.log(
        `[strategy] Found ${opportunities.length} opportunity(ies) at ${new Date().toISOString()}`,
      );

      for (const opp of opportunities) {
        const profitStr = `${formatClaw(opp.estimatedProfit)} (${opp.profitPct.toFixed(2)}%)`;

        if (dryRun) {
          console.log(`[dry-run] Opportunity: profit=${profitStr}`);
          console.log(
            `  Path: ${opp.path.map((p) => `${p.action} ${p.asset} @ ${shortAddr(p.pool)}`).join(" -> ")}`,
          );
          console.log(
            `  Input: ${formatClaw(opp.inputAmount)} | Output: ${formatClaw(opp.expectedOutput)}`,
          );
        } else if (signingClient) {
          try {
            console.log(`[executor] Executing arb: profit=${profitStr}`);
            const txHash = await executeArbitrage(
              signingClient,
              senderAddress,
              opp,
            );
            totalExecuted++;
            console.log(`[executor] Success! TxHash: ${txHash}`);
          } catch (err) {
            console.error("[executor] Tx failed:", err);
          }
        }
      }
    } catch (err) {
      console.error("[cycle] Error during arbitrage cycle:", err);
    }
  };

  // Subscribe to new blocks for immediate re-polling
  const sub = subscribeNewBlocks(rpcUrl, () => {
    void runCycle();
  });

  // Also run on a fixed interval as a fallback
  const timer = setInterval(() => {
    if (running) void runCycle();
  }, intervalMs);

  // Run first cycle immediately
  await runCycle();

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[artemis] Shutting down...");
    console.log(`[artemis] Cycles: ${cycleCount} | Opportunities: ${totalOpportunities} | Executed: ${totalExecuted}`);
    running = false;
    clearInterval(timer);
    sub.close();
    if (signingClient) {
      signingClient.disconnect();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive
  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// clawd artemis scan
// ---------------------------------------------------------------------------

export type ArtemisScanOptions = {
  pools?: string;
  factory?: string;
  minProfit?: string;
  json?: boolean;
};

export async function runArtemisScan(opts: ArtemisScanOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const minProfit = opts.minProfit ?? "1000";

  // Resolve pool addresses
  let poolAddresses: string[] = [];

  if (opts.pools) {
    poolAddresses = opts.pools.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (opts.factory) {
    try {
      const factoryData = await queryFactoryPairs(restUrl, opts.factory);
      poolAddresses = factoryData.pairs.map((p) => p.contract_addr);
    } catch (err) {
      console.error(`Failed to discover pools from factory: ${String(err)}`);
      process.exit(1);
    }
  }

  if (poolAddresses.length < 2) {
    console.error("Error: At least 2 pool addresses are required.");
    console.error(
      "Provide --pools <addr1,addr2,...> or --factory <factory-addr> to discover pools.",
    );
    process.exit(1);
  }

  const pools = await collectPoolStates(restUrl, poolAddresses);
  const opportunities = scanForOpportunities(pools, minProfit);

  const result: ScanResult = {
    timestamp: new Date().toISOString(),
    poolsScanned: pools.length,
    opportunities,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  console.log(`Scan completed at ${result.timestamp}`);
  console.log(`Pools scanned: ${result.poolsScanned}`);
  console.log(`Min profit threshold: ${formatClaw(minProfit)}`);
  console.log("");

  if (opportunities.length === 0) {
    console.log("No arbitrage opportunities found.");
    return;
  }

  console.log(`Found ${opportunities.length} opportunity(ies):\n`);

  const headers = ["Path", "Input", "Output", "Profit", "Pct"];
  const rows = opportunities.map((opp) => {
    const pathStr = opp.path
      .map((p) => `${p.action}@${shortAddr(p.pool)}`)
      .join(" -> ");
    return [
      pathStr,
      formatClaw(opp.inputAmount),
      formatClaw(opp.expectedOutput),
      formatClaw(opp.estimatedProfit),
      `${opp.profitPct.toFixed(2)}%`,
    ];
  });

  console.log(table(headers, rows));
  console.log();
}

// ---------------------------------------------------------------------------
// clawd artemis pools
// ---------------------------------------------------------------------------

export type ArtemisPoolsOptions = {
  factory?: string;
  json?: boolean;
};

export async function runArtemisPools(opts: ArtemisPoolsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  if (!opts.factory) {
    console.error("Error: --factory <addr> is required.");
    console.error("Provide the ClawDEX factory contract address to discover pools.");
    process.exit(1);
  }

  let factoryData: FactoryPairsResponse;
  try {
    factoryData = await queryFactoryPairs(restUrl, opts.factory);
  } catch (err) {
    console.error(`Failed to query factory: ${String(err)}`);
    process.exit(1);
  }

  const pairs = factoryData.pairs;

  if (opts.json) {
    // Enrich with pool state when outputting JSON
    const enriched = [];
    for (const pair of pairs) {
      try {
        const state = await queryPoolState(restUrl, pair.contract_addr);
        enriched.push({
          contract: pair.contract_addr,
          liquidityToken: pair.liquidity_token,
          assets: state.assets,
          totalShare: state.totalShare,
          feeRate: state.feeRate,
        });
      } catch {
        enriched.push({
          contract: pair.contract_addr,
          liquidityToken: pair.liquidity_token,
          assets: pair.asset_infos.map((info) => ({
            denom: denomFromAssetInfo(info),
            amount: "?",
          })),
          totalShare: "?",
          feeRate: 0.003,
        });
      }
    }
    process.stdout.write(JSON.stringify({ pools: enriched }, null, 2) + "\n");
    return;
  }

  if (pairs.length === 0) {
    console.log("No pools found.");
    return;
  }

  console.log(`Found ${pairs.length} pool(s) from factory ${shortAddr(opts.factory)}:\n`);

  // Fetch reserves for each pool to show a richer table
  const headers = ["Contract", "Asset 1", "Reserve 1", "Asset 2", "Reserve 2", "Total Share"];
  const rows: string[][] = [];

  for (const pair of pairs) {
    const denoms = pair.asset_infos.map(denomFromAssetInfo);

    try {
      const state = await queryPoolState(restUrl, pair.contract_addr);
      rows.push([
        shortAddr(pair.contract_addr),
        denoms[0] ?? "?",
        state.assets[0] ? formatClaw(state.assets[0].amount) : "?",
        denoms[1] ?? "?",
        state.assets[1] ? formatClaw(state.assets[1].amount) : "?",
        state.totalShare,
      ]);
    } catch {
      rows.push([
        shortAddr(pair.contract_addr),
        denoms[0] ?? "?",
        "?",
        denoms[1] ?? "?",
        "?",
        "?",
      ]);
    }
  }

  console.log(table(headers, rows));
  console.log();
}
