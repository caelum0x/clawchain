/**
 * `clawd oracle` subcommands — query oracle prices, history, and parameters.
 */

import { loadClawdConfig } from "../lib/config.js";
import { table } from "../lib/format.js";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

// ---------------------------------------------------------------------------
// clawd oracle price <pair>
// ---------------------------------------------------------------------------

export type OraclePriceOptions = {
  pair: string;
  json?: boolean;
};

export async function runOraclePrice(opts: OraclePriceOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/oracle/v1/price/${encodeURIComponent(opts.pair)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`No price found for pair "${opts.pair}".`);
      } else {
        console.error(`Failed to query oracle price (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { price?: any };
    const price = data.price ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(price, null, 2) + "\n");
      return;
    }

    console.log(`Oracle Price: ${opts.pair}\n`);
    console.log(`  Pair:       ${price.denom_pair ?? price.denomPair ?? opts.pair}`);
    console.log(`  Price:      ${price.price ?? price.exchange_rate ?? price.exchangeRate ?? "N/A"}`);
    console.log(`  Timestamp:  ${price.timestamp ?? price.updated_at ?? price.updatedAt ?? "N/A"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query oracle price: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle prices
// ---------------------------------------------------------------------------

export type OraclePricesOptions = {
  json?: boolean;
};

export async function runOraclePrices(opts: OraclePricesOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/oracle/v1/prices`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query oracle prices (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { prices?: any[] };
    const prices = data.prices ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ prices }, null, 2) + "\n");
      return;
    }

    if (prices.length === 0) {
      console.log("No oracle prices found.");
      return;
    }

    const headers = ["Pair", "Price", "Updated"];
    const rows = prices.map((p: any) => [
      String(p.denom_pair ?? p.denomPair ?? ""),
      String(p.price ?? p.exchange_rate ?? p.exchangeRate ?? ""),
      String(p.timestamp ?? p.updated_at ?? p.updatedAt ?? ""),
    ]);

    console.log("Oracle Prices\n");
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query oracle prices: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle history <pair>
// ---------------------------------------------------------------------------

export type OracleHistoryOptions = {
  pair: string;
  limit?: number;
  json?: boolean;
};

export async function runOracleHistory(opts: OracleHistoryOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const limit = opts.limit ?? 20;
  const url = `${restUrl}/clawchain/oracle/v1/price_history/${encodeURIComponent(opts.pair)}?limit=${limit}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`No price history found for pair "${opts.pair}".`);
      } else {
        console.error(`Failed to query price history (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { history?: any[]; prices?: any[] };
    const history = data.history ?? data.prices ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ history }, null, 2) + "\n");
      return;
    }

    if (history.length === 0) {
      console.log(`No price history for "${opts.pair}".`);
      return;
    }

    const headers = ["#", "Price", "Timestamp", "Block"];
    const rows = history.map((entry: any, idx: number) => [
      String(idx + 1),
      String(entry.price ?? entry.exchange_rate ?? entry.exchangeRate ?? ""),
      String(entry.timestamp ?? entry.updated_at ?? entry.updatedAt ?? ""),
      String(entry.block_height ?? entry.blockHeight ?? ""),
    ]);

    console.log(`Price History: ${opts.pair} (last ${limit})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query price history: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle params
// ---------------------------------------------------------------------------

export type OracleParamsOptions = {
  json?: boolean;
};

export async function runOracleParams(opts: OracleParamsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/oracle/v1/params`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query oracle params (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { params?: any };
    const params = data.params ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(params, null, 2) + "\n");
      return;
    }

    console.log("Oracle Parameters\n");
    for (const [key, value] of Object.entries(params)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
    console.log();
  } catch (err) {
    console.error(`Failed to query oracle params: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle feeder <validator>
// ---------------------------------------------------------------------------

export type OracleFeederOptions = {
  validator: string;
  json?: boolean;
};

export async function runOracleFeeder(opts: OracleFeederOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/oracle/v1/feeder/${encodeURIComponent(opts.validator)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`No feeder delegation found for validator "${opts.validator}".`);
      } else {
        console.error(`Failed to query feeder (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { feeder_address?: string; feederAddress?: string };

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return;
    }

    const feeder = data.feeder_address ?? data.feederAddress ?? "N/A";
    console.log(`Feeder Delegation\n`);
    console.log(`  Validator: ${opts.validator}`);
    console.log(`  Feeder:    ${feeder}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query feeder: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle miss <validator>
// ---------------------------------------------------------------------------

export type OracleMissOptions = {
  validator: string;
  json?: boolean;
};

export async function runOracleMiss(opts: OracleMissOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/oracle/v1/miss/${encodeURIComponent(opts.validator)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`No miss counter found for validator "${opts.validator}".`);
      } else {
        console.error(`Failed to query miss counter (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { miss_counter?: string; missCounter?: string };

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return;
    }

    const missCount = data.miss_counter ?? data.missCounter ?? "0";
    console.log(`Oracle Miss Counter\n`);
    console.log(`  Validator:    ${opts.validator}`);
    console.log(`  Miss Counter: ${missCount}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query miss counter: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd oracle prevote <hash> (placeholder — tx signing not yet wired)
// ---------------------------------------------------------------------------

export type OraclePrevoteOptions = {
  hash: string;
  validator: string;
};

export async function runOraclePrevote(opts: OraclePrevoteOptions): Promise<void> {
  console.log(`Prevote hash: ${opts.hash}`);
  console.log(`Validator:    ${opts.validator}`);
  console.log();
  console.log(
    'Transaction signing not yet implemented \u2014 use clawchaind tx oracle aggregate-exchange-rate-prevote',
  );
}

// ---------------------------------------------------------------------------
// clawd oracle vote <salt> <rates> (placeholder — tx signing not yet wired)
// ---------------------------------------------------------------------------

export type OracleVoteOptions = {
  salt: string;
  rates: string;
  validator: string;
};

export async function runOracleVote(opts: OracleVoteOptions): Promise<void> {
  console.log(`Salt:      ${opts.salt}`);
  console.log(`Rates:     ${opts.rates}`);
  console.log(`Validator: ${opts.validator}`);
  console.log();
  console.log(
    'Transaction signing not yet implemented \u2014 use clawchaind tx oracle aggregate-exchange-rate-vote',
  );
}
