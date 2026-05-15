#!/usr/bin/env node

import { Command } from "commander";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient, GasPrice } from "@cosmjs/stargate";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PoolState = {
  address: string;
  assets: { denom: string; amount: string }[];
  totalShare: string;
  feeRate: number;
};

export type ArbitrageOpportunity = {
  path: { pool: string; action: "buy" | "sell"; asset: string }[];
  inputDenom: string;
  inputAmount: string;
  expectedOutput: string;
  estimatedProfit: string;
  profitPct: number;
};

export type ScanResult = {
  timestamp: string;
  poolsScanned: number;
  opportunities: ArbitrageOpportunity[];
};

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

// ---------------------------------------------------------------------------
// Helper: derive REST URL from RPC URL
// ---------------------------------------------------------------------------

export function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const u = new URL(rpcUrl);
    // Standard Cosmos pattern: RPC on 26657, REST on 1317
    u.port = "1317";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:1317";
  }
}

// ---------------------------------------------------------------------------
// Helper: load wallet from mnemonic file
// ---------------------------------------------------------------------------

export async function loadWallet(
  mnemonicPath: string,
  prefix = "claw",
): Promise<DirectSecp256k1HdWallet> {
  const mnemonic = readFileSync(mnemonicPath, "utf-8").trim();
  if (!mnemonic) {
    throw new Error(`Empty mnemonic file: ${mnemonicPath}`);
  }
  return DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
}

// ---------------------------------------------------------------------------
// Helper: query CosmWasm smart-contract pool state
// ---------------------------------------------------------------------------

export async function queryPoolState(
  restUrl: string,
  contractAddr: string,
): Promise<PoolState> {
  const query = JSON.stringify({ pool: {} });
  const b64Query = Buffer.from(query).toString("base64");
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${contractAddr}/smart/${b64Query}`;

  const res = await fetch(url);
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
// Helper: constant-product AMM math
// ---------------------------------------------------------------------------

/**
 * Calculate output amount for a swap using constant-product formula.
 * output = (reserveOut * offerAmount * (1 - fee)) / (reserveIn + offerAmount * (1 - fee))
 */
export function constantProductSwap(
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
// Strategy: calculate arbitrage between two pools sharing a common asset
// ---------------------------------------------------------------------------

export function calculateArbitrage(
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
// Executor: build swap message
// ---------------------------------------------------------------------------

export function buildSwapMsg(
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
// Output formatting
// ---------------------------------------------------------------------------

function formatTable(opportunities: ArbitrageOpportunity[]): string {
  if (opportunities.length === 0) {
    return "No arbitrage opportunities found.";
  }

  const header = [
    "Path".padEnd(50),
    "Input".padStart(18),
    "Output".padStart(18),
    "Profit".padStart(18),
    "Pct".padStart(8),
  ].join(" | ");

  const separator = "-".repeat(header.length);

  const rows = opportunities.map((opp) => {
    const pathStr = opp.path
      .map((p) => `${p.action}@${p.pool.slice(0, 8)}..`)
      .join(" -> ");
    return [
      pathStr.padEnd(50),
      opp.inputAmount.padStart(18),
      opp.expectedOutput.padStart(18),
      opp.estimatedProfit.padStart(18),
      `${opp.profitPct.toFixed(2)}%`.padStart(8),
    ].join(" | ");
  });

  return [header, separator, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Query factory for all pairs
// ---------------------------------------------------------------------------

async function queryFactoryPairs(
  restUrl: string,
  factoryAddr: string,
): Promise<FactoryPairsResponse> {
  const query = JSON.stringify({ pairs: { limit: 100 } });
  const b64Query = Buffer.from(query).toString("base64");
  const url = `${restUrl}/cosmwasm/wasm/v1/contract/${factoryAddr}/smart/${b64Query}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Factory query failed: ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as { data: FactoryPairsResponse };
  return json.data;
}

function formatPoolList(
  pairs: FactoryPairsResponse["pairs"],
): string {
  if (pairs.length === 0) {
    return "No pools found.";
  }

  const header = [
    "Contract".padEnd(50),
    "Asset 1".padEnd(20),
    "Asset 2".padEnd(20),
  ].join(" | ");

  const separator = "-".repeat(header.length);

  const rows = pairs.map((p) => {
    const denoms = p.asset_infos.map((info) =>
      "native_token" in info
        ? info.native_token.denom
        : info.token.contract_addr.slice(0, 16) + "..",
    );
    return [
      p.contract_addr.padEnd(50),
      (denoms[0] ?? "?").padEnd(20),
      (denoms[1] ?? "?").padEnd(20),
    ].join(" | ");
  });

  return [header, separator, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// CLI: run command
// ---------------------------------------------------------------------------

async function runCommand(opts: {
  rpc: string;
  rest: string;
  mnemonicFile?: string;
  minProfit: string;
  pools: string;
  dryRun: boolean;
  interval: string;
}): Promise<void> {
  const restUrl = opts.rest;
  const rpcUrl = opts.rpc;
  const poolAddresses = opts.pools
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (poolAddresses.length < 2) {
    console.error(
      "Error: At least 2 pool addresses are required for arbitrage scanning.",
    );
    process.exit(1);
  }

  let client: SigningStargateClient | null = null;
  let senderAddress = "";

  if (!opts.dryRun) {
    if (!opts.mnemonicFile) {
      console.error(
        "Error: --mnemonic-file is required unless --dry-run is set.",
      );
      process.exit(1);
    }

    const wallet = await loadWallet(opts.mnemonicFile);
    const [account] = await wallet.getAccounts();
    senderAddress = account.address;

    client = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
      gasPrice: GasPrice.fromString("0.025uclaw"),
    });

    console.log(`[executor] Wallet loaded: ${senderAddress}`);
  }

  const intervalMs = parseInt(opts.interval, 10);
  let running = true;

  console.log("[artemis] Starting arbitrage bot");
  console.log(`[artemis] RPC: ${rpcUrl} | REST: ${restUrl}`);
  console.log(`[artemis] Pools: ${poolAddresses.join(", ")}`);
  console.log(`[artemis] Min profit: ${opts.minProfit} uclaw`);
  console.log(`[artemis] Dry run: ${opts.dryRun}`);
  console.log(`[artemis] Poll interval: ${intervalMs}ms`);
  console.log("");

  const runCycle = async () => {
    try {
      const pools = await collectPoolStates(restUrl, poolAddresses);
      if (pools.length < 2) {
        console.log(
          "[collector] Not enough pool states collected, skipping cycle.",
        );
        return;
      }

      const opportunities = scanForOpportunities(pools, opts.minProfit);

      if (opportunities.length === 0) {
        return;
      }

      console.log(
        `[strategy] Found ${opportunities.length} opportunity(ies) at ${new Date().toISOString()}`,
      );

      for (const opp of opportunities) {
        const profitStr = `${opp.estimatedProfit} uclaw (${opp.profitPct.toFixed(2)}%)`;

        if (opts.dryRun) {
          console.log(`[dry-run] Opportunity: profit=${profitStr}`);
          console.log(
            `  Path: ${opp.path.map((p) => `${p.action} ${p.asset} @ ${p.pool}`).join(" -> ")}`,
          );
          console.log(
            `  Input: ${opp.inputAmount} | Output: ${opp.expectedOutput}`,
          );
        } else if (client) {
          try {
            console.log(`[executor] Executing arb: profit=${profitStr}`);
            const txHash = await executeArbitrage(
              client,
              senderAddress,
              opp,
            );
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
    running = false;
    clearInterval(timer);
    sub.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive
  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// CLI: scan command
// ---------------------------------------------------------------------------

async function scanCommand(opts: {
  rpc: string;
  rest: string;
  pools: string;
  minProfit: string;
  json: boolean;
}): Promise<void> {
  const restUrl = opts.rest;
  const poolAddresses = opts.pools
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (poolAddresses.length < 2) {
    console.error("Error: At least 2 pool addresses are required.");
    process.exit(1);
  }

  const pools = await collectPoolStates(restUrl, poolAddresses);
  const opportunities = scanForOpportunities(pools, opts.minProfit);

  const result: ScanResult = {
    timestamp: new Date().toISOString(),
    poolsScanned: pools.length,
    opportunities,
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    console.log(`Scan completed at ${result.timestamp}`);
    console.log(`Pools scanned: ${result.poolsScanned}`);
    console.log("");
    console.log(formatTable(opportunities));
  }
}

// ---------------------------------------------------------------------------
// CLI: pools command
// ---------------------------------------------------------------------------

async function poolsCommand(opts: {
  rpc: string;
  rest: string;
  factory: string;
  json: boolean;
}): Promise<void> {
  const restUrl = opts.rest;

  if (!opts.factory) {
    console.error("Error: --factory <addr> is required.");
    process.exit(1);
  }

  const data = await queryFactoryPairs(restUrl, opts.factory);

  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    console.log(`Found ${data.pairs.length} pool(s):\n`);
    console.log(formatPoolList(data.pairs));
  }
}

// ---------------------------------------------------------------------------
// CLI program definition
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name("claw-artemis")
  .description("ClawChain DEX arbitrage bot inspired by Paradigm's Artemis")
  .version("1.0.0");

program
  .command("run")
  .description(
    "Start the main arbitrage loop (Collector -> Strategy -> Executor)",
  )
  .option("--rpc <url>", "CometBFT RPC endpoint", "http://localhost:26657")
  .option("--rest <url>", "Cosmos REST/LCD endpoint", "http://localhost:1317")
  .option("--mnemonic-file <path>", "Path to file containing wallet mnemonic")
  .option(
    "--min-profit <uclaw>",
    "Minimum profit threshold in uclaw",
    "1000",
  )
  .option("--pools <ids>", "Comma-separated pool contract addresses", "")
  .option(
    "--dry-run",
    "Simulate only, do not broadcast transactions",
    false,
  )
  .option("--interval <ms>", "Polling interval in milliseconds", "2000")
  .action(async (opts) => {
    try {
      await runCommand(opts);
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

program
  .command("scan")
  .description("One-shot opportunity scan (scan once and exit)")
  .option("--rpc <url>", "CometBFT RPC endpoint", "http://localhost:26657")
  .option("--rest <url>", "Cosmos REST/LCD endpoint", "http://localhost:1317")
  .option("--pools <ids>", "Comma-separated pool contract addresses", "")
  .option(
    "--min-profit <uclaw>",
    "Minimum profit threshold in uclaw",
    "1000",
  )
  .option("--json", "Output results as JSON", false)
  .action(async (opts) => {
    try {
      await scanCommand(opts);
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

program
  .command("pools")
  .description("List available DEX pools from the ClawDEX factory")
  .option("--rpc <url>", "CometBFT RPC endpoint", "http://localhost:26657")
  .option("--rest <url>", "Cosmos REST/LCD endpoint", "http://localhost:1317")
  .option("--factory <addr>", "ClawDEX factory contract address", "")
  .option("--json", "Output results as JSON", false)
  .action(async (opts) => {
    try {
      await poolsCommand(opts);
    } catch (err) {
      console.error("Fatal error:", err);
      process.exit(1);
    }
  });

// Only parse CLI arguments when running as the main entry point (not under test)
const isTesting =
  typeof process !== "undefined" &&
  (process.env["VITEST"] === "true" ||
    process.env["NODE_ENV"] === "test" ||
    process.env["JEST_WORKER_ID"] !== undefined);

if (!isTesting) {
  program.parse();
}

export { program };
