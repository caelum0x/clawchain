/**
 * `clawd model-index` subcommands — P3 oracle model index / fundamentals.
 *
 * Computes a per-model "fundamentals index" purely from on-chain
 * `x/modelregistry` data (completed-job volume, average latency derived from
 * job created/completed timestamps, the registry RateModel score, and the
 * distinct provider count) and exposes:
 *
 *   - `model-index compute  --model-id <id>` : query modelregistry + print the
 *      computed index (supports `--json`).
 *   - `model-index publish  --model-id <id>` : submit the computed index as an
 *      oracle exchange-rate-style commit/reveal vote (prevote + vote) so feeders
 *      can carry model fundamentals on the same rail as price votes.
 *
 * Index denom convention: model fundamentals are published under the synthetic
 * oracle denom `idx:model:<id>` (mirrors how the price feeder keys denoms), with
 * the composite index score (0..1, scaled) as the "exchange rate". This keeps
 * the data shape identical to a real oracle exchange-rate vote tuple.
 *
 * REST query surface (read-only, no signing):
 *   /clawchain/modelregistry/v1/model/{model_id}
 *   /clawchain/modelregistry/v1/inference/jobs?model_id={id}
 *
 * Oracle msgs reused for publish (commit-reveal, Terra-forked):
 *   /clawchain.oracle.v1beta1.MsgAggregateExchangeRatePrevote { hash, feeder, validator }
 *   /clawchain.oracle.v1beta1.MsgAggregateExchangeRateVote { salt, exchange_rates, feeder, validator }
 */

import { createHash, randomBytes } from "node:crypto";
import { GasPrice } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { shortAddr, table } from "../lib/format.js";
import { connectClawchainSigningClient } from "../lib/signing.js";

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export type ModelIndexComputeOptions = {
  modelId: string;
  json?: boolean;
};

export type ModelIndexPublishOptions = {
  modelId: string;
  validator: string;
  json?: boolean;
};

export type ModelIndexLeaderboardOptions = {
  /** Comma-separated explicit model ids; when omitted, all registered models are enumerated. */
  models?: string;
  /** Keep only the top N ranked models (default: all). */
  top?: string;
  json?: boolean;
};

/** One row of the leaderboard: a computed index, or a per-model failure note. */
export type ModelIndexLeaderboardEntry =
  | { ok: true; index: ModelIndex }
  | { ok: false; modelId: string; error: string };

// ---------------------------------------------------------------------------
// Shapes returned by the modelregistry REST surface. The grpc-gateway emits
// snake_case JSON, but the ts-proto codecs (and some intermediaries) emit
// camelCase, so every read tolerates both spellings.
// ---------------------------------------------------------------------------

type ModelRecordJson = {
  id?: string;
  name?: string;
  owner?: string;
  rating?: number;
  rating_count?: number;
  ratingCount?: number;
  active?: boolean;
};

type InferenceJobJson = {
  job_id?: string;
  jobId?: string;
  model_id?: string;
  modelId?: string;
  provider?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  completed_at?: string;
  completedAt?: string;
};

/** Computed per-model fundamentals index. */
export type ModelIndex = {
  modelId: string;
  name: string;
  /** Number of jobs with a terminal "completed" status. */
  completedJobs: number;
  /** Total jobs observed (any status). */
  totalJobs: number;
  /** Completed / total, 0..1 (0 when no jobs). */
  completionRate: number;
  /** Mean (completed_at - created_at) over completed jobs, in seconds. */
  avgLatencySeconds: number;
  /** Registry RateModel score, 0..5. */
  ratingScore: number;
  /** Number of distinct providers that served jobs for this model. */
  providerCount: number;
  /** Composite index score, 0..1 (4-decimal precision). */
  indexScore: number;
  /** Oracle denom this index publishes under. */
  indexDenom: string;
};

const INDEX_DENOM_PREFIX = "idx:model:";

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function requireNonNegativeInteger(label: string, value: string | undefined): string {
  if (!value || !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function requireValidator(value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error("--validator is required (clawvaloper1...).");
  }
  if (!value.startsWith("clawvaloper1")) {
    throw new Error(`Invalid validator address. Expected prefix "clawvaloper1", got: "${value}"`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// REST plumbing
// ---------------------------------------------------------------------------

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function restBase(): string {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  return (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Query failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Field accessors (snake_case / camelCase tolerant)
// ---------------------------------------------------------------------------

function jobProvider(job: InferenceJobJson): string {
  return (job.provider ?? "").trim();
}

function jobStatus(job: InferenceJobJson): string {
  return (job.status ?? "").trim().toLowerCase();
}

function jobCreatedAt(job: InferenceJobJson): string {
  return job.created_at ?? job.createdAt ?? "0";
}

function jobCompletedAt(job: InferenceJobJson): string {
  return job.completed_at ?? job.completedAt ?? "0";
}

function modelRatingScore(model: ModelRecordJson): number {
  const raw = Number(model.rating ?? 0);
  return Number.isFinite(raw) ? raw : 0;
}

// ---------------------------------------------------------------------------
// Index computation (pure, deterministic)
// ---------------------------------------------------------------------------

/**
 * Mean job latency in seconds over completed jobs that carry both a created and
 * completed timestamp. Timestamps are stored as int64 unix seconds (string) by
 * x/modelregistry; jobs missing either bound are skipped rather than counted as
 * zero latency to avoid skewing the average.
 */
function computeAvgLatencySeconds(completed: ReadonlyArray<InferenceJobJson>): number {
  const deltas: number[] = [];
  for (const job of completed) {
    const created = Number(jobCreatedAt(job));
    const done = Number(jobCompletedAt(job));
    if (!Number.isFinite(created) || !Number.isFinite(done)) continue;
    if (created <= 0 || done <= 0 || done < created) continue;
    deltas.push(done - created);
  }
  if (deltas.length === 0) return 0;
  const sum = deltas.reduce((acc, d) => acc + d, 0);
  return round4(sum / deltas.length);
}

/**
 * Composite index score in [0,1]. A model scores higher with more completed
 * volume, a higher completion rate, a stronger registry rating, and broader
 * provider participation. Latency is folded in as an inverse factor (faster is
 * better). Weights are fixed and documented so the score is reproducible by any
 * feeder computing the same on-chain inputs.
 */
function computeIndexScore(args: {
  completedJobs: number;
  completionRate: number;
  avgLatencySeconds: number;
  ratingScore: number;
  providerCount: number;
}): number {
  // Volume: saturating log-style curve so a few jobs already register but large
  // counts don't dominate. completedJobs / (completedJobs + 50) -> 0..1.
  const volumeFactor = args.completedJobs / (args.completedJobs + 50);
  // Completion rate is already 0..1.
  const completionFactor = clamp01(args.completionRate);
  // Rating 0..5 normalized to 0..1.
  const ratingFactor = clamp01(args.ratingScore / 5);
  // Providers: more redundancy is healthier; saturate at ~5 providers.
  const providerFactor = clamp01(args.providerCount / 5);
  // Latency: 0s -> 1.0, decaying; 60s -> ~0.5. Skip (treat as neutral 0.5)
  // when no latency signal exists.
  const latencyFactor =
    args.avgLatencySeconds > 0 ? 60 / (60 + args.avgLatencySeconds) : 0.5;

  const score =
    0.35 * volumeFactor +
    0.2 * completionFactor +
    0.2 * ratingFactor +
    0.15 * providerFactor +
    0.1 * latencyFactor;

  return round4(clamp01(score));
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

/**
 * Pull the model record + its inference jobs from x/modelregistry and fold them
 * into a {@link ModelIndex}. Throws on a missing model so callers can surface a
 * clear error.
 */
export async function computeModelIndex(modelId: string): Promise<ModelIndex> {
  const base = restBase();

  const modelUrl = `${base}/clawchain/modelregistry/v1/model/${encodeURIComponent(modelId)}`;
  const modelResp = await fetchJson<{ model?: ModelRecordJson }>(modelUrl);
  const model = modelResp.model ?? (modelResp as ModelRecordJson);
  if (!model || (model.id == null && model.name == null)) {
    throw new Error(`Model ${modelId} not found in modelregistry.`);
  }

  const jobsUrl = `${base}/clawchain/modelregistry/v1/inference/jobs?model_id=${encodeURIComponent(modelId)}`;
  const jobsResp = await fetchJson<{ jobs?: InferenceJobJson[] }>(jobsUrl);
  const jobs = jobsResp.jobs ?? [];

  const completed = jobs.filter((j) => jobStatus(j) === "completed");
  const totalJobs = jobs.length;
  const completedJobs = completed.length;
  const completionRate = totalJobs > 0 ? round4(completedJobs / totalJobs) : 0;
  const avgLatencySeconds = computeAvgLatencySeconds(completed);
  const ratingScore = round4(modelRatingScore(model));

  const providers = new Set<string>();
  for (const job of jobs) {
    const p = jobProvider(job);
    if (p) providers.add(p);
  }
  const providerCount = providers.size;

  const indexScore = computeIndexScore({
    completedJobs,
    completionRate,
    avgLatencySeconds,
    ratingScore,
    providerCount,
  });

  return {
    modelId,
    name: model.name ?? `model-${modelId}`,
    completedJobs,
    totalJobs,
    completionRate,
    avgLatencySeconds,
    ratingScore,
    providerCount,
    indexScore,
    indexDenom: `${INDEX_DENOM_PREFIX}${modelId}`,
  };
}

// ---------------------------------------------------------------------------
// Oracle commit-reveal helpers
// ---------------------------------------------------------------------------

/**
 * Terra-forked oracle exchange-rate tuple encoding: `<rate><denom>` pairs joined
 * by commas. We publish a single tuple — the model index score under the
 * synthetic `idx:model:<id>` denom.
 */
export function encodeExchangeRates(rate: string, denom: string): string {
  return `${rate}${denom}`;
}

/**
 * Aggregate vote hash matching the Terra oracle scheme:
 *   hex( sha256( "<salt>:<exchange_rates>:<validator>" )[:20] )
 * The prevote commits to this hash; the reveal vote later supplies salt +
 * exchange_rates so validators can recompute and verify the commitment.
 */
export function aggregateVoteHash(salt: string, exchangeRates: string, validator: string): string {
  const payload = `${salt}:${exchangeRates}:${validator}`;
  const digest = createHash("sha256").update(payload, "utf8").digest();
  // Terra truncates the tmhash to 20 bytes (40 hex chars).
  return digest.subarray(0, 20).toString("hex");
}

/** Random hex salt for the commit-reveal round. */
function newSalt(): string {
  return randomBytes(4).toString("hex");
}

export function buildPrevoteMsg(args: {
  hash: string;
  feeder: string;
  validator: string;
}) {
  return {
    typeUrl: "/clawchain.oracle.v1beta1.MsgAggregateExchangeRatePrevote",
    value: {
      hash: args.hash,
      feeder: args.feeder,
      validator: args.validator,
    },
  };
}

export function buildVoteMsg(args: {
  salt: string;
  exchangeRates: string;
  feeder: string;
  validator: string;
}) {
  return {
    typeUrl: "/clawchain.oracle.v1beta1.MsgAggregateExchangeRateVote",
    value: {
      salt: args.salt,
      // Field is `exchange_rates` on the wire; the registered ts-proto codec
      // reads `exchangeRates`. cosmjs encodes via fromPartial, so the camelCase
      // key is what the codec expects.
      exchangeRates: args.exchangeRates,
      feeder: args.feeder,
      validator: args.validator,
    },
  };
}

// ---------------------------------------------------------------------------
// Signer plumbing
// ---------------------------------------------------------------------------

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

  return { account, signingClient };
}

// ---------------------------------------------------------------------------
// Pretty printers
// ---------------------------------------------------------------------------

function printIndex(index: ModelIndex): void {
  console.log(`Model Fundamentals Index — #${index.modelId} (${index.name})\n`);
  console.log(`  Completed Jobs:   ${index.completedJobs}`);
  console.log(`  Total Jobs:       ${index.totalJobs}`);
  console.log(`  Completion Rate:  ${(index.completionRate * 100).toFixed(2)}%`);
  console.log(`  Avg Latency:      ${index.avgLatencySeconds}s`);
  console.log(`  Rating Score:     ${index.ratingScore} / 5`);
  console.log(`  Provider Count:   ${index.providerCount}`);
  console.log(`  Index Score:      ${index.indexScore} (0..1)`);
  console.log(`  Index Denom:      ${index.indexDenom}`);
  console.log();
}

// ---------------------------------------------------------------------------
// clawd model-index compute --model-id <id>
// ---------------------------------------------------------------------------

export async function runModelIndexCompute(opts: ModelIndexComputeOptions): Promise<void> {
  try {
    const modelId = requireNonNegativeInteger("--model-id", opts.modelId);
    const index = await computeModelIndex(modelId);

    if (opts.json) {
      process.stdout.write(JSON.stringify(index, null, 2) + "\n");
      return;
    }
    printIndex(index);
  } catch (err) {
    console.error(`model-index compute failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd model-index publish --model-id <id> --validator <clawvaloper1...>
// ---------------------------------------------------------------------------

export async function runModelIndexPublish(opts: ModelIndexPublishOptions): Promise<void> {
  try {
    const modelId = requireNonNegativeInteger("--model-id", opts.modelId);
    const validator = requireValidator(opts.validator);

    const index = await computeModelIndex(modelId);

    // Oracle exchange rates carry the score as a decimal string under the
    // synthetic index denom. The current vote reveals the freshly-computed
    // score; the matching prevote commits its hash so a feeder run is a single
    // prevote+vote batch (next-period reveal semantics still hold on-chain).
    const rate = index.indexScore.toFixed(4);
    const exchangeRates = encodeExchangeRates(rate, index.indexDenom);
    const salt = newSalt();

    const { account, signingClient } = await ensureSigner();
    try {
      const hash = aggregateVoteHash(salt, exchangeRates, validator);

      const prevote = buildPrevoteMsg({ hash, feeder: account.address, validator });
      const vote = buildVoteMsg({ salt, exchangeRates, feeder: account.address, validator });

      const res = await signingClient.signAndBroadcast(account.address, [prevote, vote], "auto");
      if (res.code !== 0) {
        throw new Error(`publish tx failed (code=${res.code}): ${res.rawLog}`);
      }

      const report = {
        action: "ModelIndexPublish",
        model_id: modelId,
        validator,
        feeder: account.address,
        index_denom: index.indexDenom,
        index_score: index.indexScore,
        exchange_rates: exchangeRates,
        hash,
        tx_hash: res.transactionHash,
      };

      if (opts.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        return;
      }

      console.log("Model index published to oracle (prevote + vote).");
      console.log(`  Model:      #${modelId} (${index.name})`);
      console.log(`  Validator:  ${shortAddr(validator)}`);
      console.log(`  Feeder:     ${shortAddr(account.address)}`);
      console.log(`  Denom:      ${index.indexDenom}`);
      console.log(`  Score:      ${rate}`);
      console.log(`  Hash:       ${hash}`);
      console.log(`  TxHash:     ${res.transactionHash}`);
      console.log();
    } finally {
      signingClient.disconnect();
    }
  } catch (err) {
    console.error(`model-index publish failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd model-index leaderboard
// ---------------------------------------------------------------------------

/** Parse a `--models a,b,c` list into validated, de-duped, order-preserving ids. */
function parseModelIdList(raw: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id) continue;
    requireNonNegativeInteger("--models entry", id);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) {
    throw new Error("--models was provided but contained no valid ids.");
  }
  return ids;
}

/**
 * Enumerate every registered model id from x/modelregistry. Mirrors the read in
 * `runModelList` (GET /clawchain/modelregistry/v1/models) so the leaderboard
 * sees the same universe of models the `model list` command does.
 */
async function listAllModelIds(): Promise<string[]> {
  const url = `${restBase()}/clawchain/modelregistry/v1/models`;
  const data = await fetchJson<{ models?: ModelRecordJson[] }>(url);
  const models = data.models ?? [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of models) {
    const id = m.id == null ? "" : String(m.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Optional positive-integer cap for `--top`. */
function parseTop(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  if (!/^[0-9]+$/.test(raw) || Number(raw) <= 0) {
    throw new Error("--top must be a positive integer.");
  }
  return Number(raw);
}

/**
 * Compute the composite fundamentals index for a set of models and print a
 * ranked table. Reuses {@link computeModelIndex} (and therefore the exact same
 * weights as `model-index compute`) for every row — no scoring is redefined
 * here. Per-model compute failures are reported inline and skipped rather than
 * aborting the whole run.
 */
export async function runModelIndexLeaderboard(
  opts: ModelIndexLeaderboardOptions,
): Promise<void> {
  try {
    const top = parseTop(opts.top);
    const modelIds = opts.models
      ? parseModelIdList(opts.models)
      : await listAllModelIds();

    if (modelIds.length === 0) {
      if (opts.json) {
        process.stdout.write(
          JSON.stringify({ leaderboard: [], failures: [] }, null, 2) + "\n",
        );
        return;
      }
      console.log("No models found to rank.");
      return;
    }

    // Compute each model's index independently; isolate failures per model.
    const entries: ModelIndexLeaderboardEntry[] = [];
    for (const modelId of modelIds) {
      try {
        const index = await computeModelIndex(modelId);
        entries.push({ ok: true, index });
      } catch (err) {
        entries.push({ ok: false, modelId, error: String(err) });
      }
    }

    const ranked = entries
      .filter((e): e is { ok: true; index: ModelIndex } => e.ok)
      .map((e) => e.index)
      // Descending by composite index; modelId as a stable tiebreaker.
      .sort(
        (a, b) =>
          b.indexScore - a.indexScore ||
          Number(a.modelId) - Number(b.modelId),
      );
    const failures = entries.filter(
      (e): e is { ok: false; modelId: string; error: string } => !e.ok,
    );

    const shown = top != null ? ranked.slice(0, top) : ranked;

    if (opts.json) {
      const report = {
        leaderboard: shown.map((index, i) => ({ rank: i + 1, ...index })),
        failures: failures.map((f) => ({ model_id: f.modelId, error: f.error })),
      };
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      return;
    }

    console.log(
      `Model Fundamentals Leaderboard — ${shown.length} of ${ranked.length} ranked` +
        (top != null ? ` (top ${top})` : "") +
        "\n",
    );

    if (shown.length === 0) {
      console.log("No models could be scored.");
    } else {
      const headers = ["Rank", "ID", "Name", "Score", "Jobs", "Rating", "Providers"];
      const rows = shown.map((index, i) => [
        String(i + 1),
        index.modelId,
        index.name,
        index.indexScore.toFixed(4),
        `${index.completedJobs}/${index.totalJobs}`,
        `${index.ratingScore}/5`,
        String(index.providerCount),
      ]);
      console.log(table(headers, rows));
    }

    if (failures.length > 0) {
      console.log(`\nSkipped ${failures.length} model(s):`);
      for (const f of failures) {
        console.log(`  #${f.modelId}: ${f.error}`);
      }
    }
    console.log();
  } catch (err) {
    console.error(`model-index leaderboard failed: ${String(err)}`);
    process.exit(1);
  }
}
