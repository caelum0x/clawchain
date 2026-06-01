import { chainConfig } from "./config.ts";
import { getModels, type ModelRecord } from "./chain.ts";

const REST = chainConfig.restEndpoint;

/**
 * An "AI model token" is the join of:
 *  - a registered model in x/modelregistry,
 *  - its x/tokenfactory denom `factory/<issuer>/<subdenom>` and total supply, and
 *  - (best-effort) a derived price from a DEX TOKEN/CLAW pool, when one exists.
 *
 * See docs/plans/2026-06-01-ai-model-tokens.md. This is a read-first view; issue/redeem
 * are clawd commands (`clawd model-token issue|redeem`).
 */
export interface ModelToken {
  /** modelregistry model id */
  modelId: string;
  /** issuer / model owner (tokenfactory creator) */
  issuer: string;
  /** model display name */
  name: string;
  description: string;
  framework: string;
  /** tokenfactory subdenom (normalized model symbol), e.g. `opus_4_8` */
  subdenom: string;
  /** full denom, e.g. `factory/<issuer>/opus_4_8` */
  denom: string;
  /** short human symbol for display */
  symbol: string;
  /** total minted supply in base units (string for bigint safety), "0" when none */
  supply: string;
  /** whether a tokenfactory supply was found on-chain for this denom */
  hasToken: boolean;
  /** derived CLAW-per-token price from a DEX pool, or null when no pool / N/A */
  priceClaw: number | null;
  /** DEX pool contract address backing the price, when available */
  poolAddress: string | null;
  tags: string[];
  storageUri: string;
  active: boolean;
}

/**
 * Normalize a model id / symbol into a tokenfactory-safe subdenom.
 * Mirrors `normalizeModelTokenSubdenom` in cmd/clawd so the web view derives the
 * same `factory/<issuer>/<subdenom>` the CLI issues.
 */
export function normalizeModelTokenSubdenom(model: string, symbol?: string): string {
  const raw = (symbol ?? model).trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9/_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_/]+|[_/]+$/g, "");
  return normalized;
}

/** Build the tokenfactory denom a model would be issued under. */
export function modelTokenDenom(issuer: string, model: string, symbol?: string): string {
  return `factory/${issuer}/${normalizeModelTokenSubdenom(model, symbol)}`;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Query total supply of a tokenfactory denom via the bank module.
 * Returns "0" (and hasToken=false) when the denom has no supply / is not minted.
 */
export async function getDenomSupply(denom: string): Promise<{ amount: string; found: boolean }> {
  try {
    const data = await get<any>(
      `${REST}/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(denom)}`,
    );
    const amount = data?.amount?.amount ?? "0";
    return { amount: String(amount), found: amount !== "0" && amount != null };
  } catch {
    return { amount: "0", found: false };
  }
}

interface PoolAsset {
  info?: { native_token?: { denom?: string }; token?: { contract_addr?: string } };
  amount?: string;
}

/**
 * Best-effort: scan deployed CosmWasm pool contracts for a TOKEN/CLAW pair and derive a
 * CLAW-per-token spot price from the reserves. Returns null when no matching pool exists.
 * Price discovery is optional per the plan (DEX listing is a P1 surface).
 */
export async function getModelTokenPoolPrice(
  denom: string,
  clawDenom = chainConfig.coinMinimalDenom,
): Promise<{ priceClaw: number; poolAddress: string } | null> {
  try {
    const codesData = await get<any>(`${REST}/cosmwasm/wasm/v1/code?pagination.limit=100`);
    const codeInfos: Array<{ code_id: string }> = codesData.code_infos ?? [];

    for (const code of codeInfos.slice(0, 10)) {
      let addrs: string[] = [];
      try {
        const contractsData = await get<any>(
          `${REST}/cosmwasm/wasm/v1/code/${code.code_id}/contracts?pagination.limit=10`,
        );
        addrs = contractsData.contracts ?? [];
      } catch {
        continue;
      }

      for (const addr of addrs.slice(0, 5)) {
        try {
          const poolQuery = btoa(JSON.stringify({ pool: {} }));
          const poolData = await get<any>(
            `${REST}/cosmwasm/wasm/v1/contract/${addr}/smart/${poolQuery}`,
          );
          const assets: PoolAsset[] = poolData?.data?.assets ?? [];
          if (assets.length !== 2) continue;

          const tokenAsset = assets.find((a) => a.info?.native_token?.denom === denom);
          const clawAsset = assets.find((a) => a.info?.native_token?.denom === clawDenom);
          if (!tokenAsset || !clawAsset) continue;

          const tokenReserve = Number(tokenAsset.amount ?? "0");
          const clawReserve = Number(clawAsset.amount ?? "0");
          if (tokenReserve <= 0 || clawReserve <= 0) continue;

          // CLAW per model token (constant-product spot price)
          return { priceClaw: clawReserve / tokenReserve, poolAddress: addr };
        } catch {
          // not a pool contract
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Short, human-readable symbol from a subdenom (e.g. `opus_4_8` -> `OPUS_4_8`). */
function symbolFromSubdenom(subdenom: string): string {
  return subdenom.replace(/\//g, "_").toUpperCase();
}

/**
 * Build the full AI model token view by joining modelregistry models with their
 * tokenfactory supply and (optionally) a DEX-derived price.
 *
 * @param withPrice when true, also attempts best-effort DEX price discovery per token.
 */
export async function getModelTokens(opts?: { withPrice?: boolean }): Promise<ModelToken[]> {
  const models = await getModels();
  return joinModelTokens(models, opts?.withPrice ?? false);
}

/**
 * Pure join of model records into model tokens. Exposed for testing with fixtures.
 */
export async function joinModelTokens(
  models: ModelRecord[],
  withPrice: boolean,
): Promise<ModelToken[]> {
  const tokens = await Promise.all(
    models.map(async (m): Promise<ModelToken> => {
      const subdenom = normalizeModelTokenSubdenom(m.name || m.id);
      const denom = `factory/${m.owner}/${subdenom}`;
      const { amount, found } = subdenom
        ? await getDenomSupply(denom)
        : { amount: "0", found: false };

      let priceClaw: number | null = null;
      let poolAddress: string | null = null;
      if (withPrice && found) {
        const pool = await getModelTokenPoolPrice(denom);
        if (pool) {
          priceClaw = pool.priceClaw;
          poolAddress = pool.poolAddress;
        }
      }

      return {
        modelId: m.id,
        issuer: m.owner,
        name: m.name,
        description: m.description,
        framework: m.framework,
        subdenom,
        denom,
        symbol: symbolFromSubdenom(subdenom),
        supply: amount,
        hasToken: found,
        priceClaw,
        poolAddress,
        tags: m.tags ?? [],
        storageUri: m.storageUri,
        active: m.active,
      };
    }),
  );
  return tokens;
}

/** Format a base-unit supply string into a CLAW-denominated display (6 decimals). */
export function formatTokenSupply(baseUnits: string): string {
  const n = BigInt(baseUnits || "0");
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}
