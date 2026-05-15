/**
 * `clawd flux` subcommands — parallel LLM completion explorer for ClawChain
 * agents.
 *
 * Wraps the ClawFlux tool as a clawd subcommand with three actions:
 *   explore  — generate N parallel completions, score, select best (with
 *              optional multi-depth branching)
 *   compare  — compare completions side-by-side across different models
 *   scorers  — list available scoring methods
 */

import { loadClawdConfig } from "../lib/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CompletionNode = {
  id: string;
  parentId: string | null;
  prompt: string;
  completion: string;
  score: number;
  model: string;
  temperature: number;
  tokensUsed: number;
  latencyMs: number;
  depth: number;
};

type ExplorationTree = {
  rootPrompt: string;
  nodes: CompletionNode[];
  bestPath: string[];
  totalTokens: number;
  totalLatencyMs: number;
};

type ScoredCompletion = {
  nodeId: string;
  completion: string;
  score: number;
  reason: string;
};

type LLMParams = {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
};

type LLMResult = {
  completion: string;
  tokensUsed: number;
  latencyMs: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const FETCH_TIMEOUT_MS = 60_000;

const DEFAULT_KEYWORDS: string[] = [
  "agent",
  "CLAW",
  "privacy",
  "shield",
  "marketplace",
  "stake",
  "governance",
  "task",
  "reputation",
  "escrow",
  "validator",
  "IBC",
];

const SCORER_DESCRIPTIONS: Record<string, string> = {
  length:
    "Score by completion length -- longer responses score higher (assumes thoroughness).",
  keywords:
    "Score by ClawChain domain keyword density -- counts occurrences of agent, CLAW, privacy, etc.",
  llm: "Score via LLM meta-evaluation -- sends a follow-up prompt asking the model to rate 1-10 (extra token cost).",
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveApiKey(apiKeyDirect?: string, apiKeyEnv?: string): string {
  if (apiKeyDirect) return apiKeyDirect;
  const envVar = apiKeyEnv ?? "ANTHROPIC_API_KEY";
  const key = process.env[envVar];
  if (!key) {
    throw new Error(
      `API key not provided. Pass --api-key or set the ${envVar} environment variable.`,
    );
  }
  return key;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// LLM API integration
// ---------------------------------------------------------------------------

async function callLLM(params: LLMParams): Promise<LLMResult> {
  const { apiKey, model, systemPrompt, userPrompt, temperature, maxTokens } =
    params;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: userPrompt }],
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw new Error(
      `LLM request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const latencyMs = performance.now() - start;
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    content: { type: string; text: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };

  const completion = json.content?.[0]?.text ?? "";
  const tokensUsed =
    (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0);

  return { completion, tokensUsed, latencyMs };
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

function scoreByLength(
  completion: string,
  nodeId?: string,
): ScoredCompletion {
  const score = Math.min(completion.length / 100, 10);
  return {
    nodeId: nodeId ?? "unknown",
    completion,
    score: Math.round(score * 10) / 10,
    reason: `Length-based: ${completion.length} chars \u2192 ${score.toFixed(1)}/10`,
  };
}

function scoreByKeywords(
  completion: string,
  keywords?: string[],
  nodeId?: string,
): ScoredCompletion {
  if (!completion) {
    return {
      nodeId: nodeId ?? "unknown",
      completion,
      score: 0,
      reason: "Empty completion",
    };
  }
  const kws = keywords ?? DEFAULT_KEYWORDS;
  const lower = completion.toLowerCase();
  let hits = 0;
  const matched: string[] = [];
  for (const kw of kws) {
    const regex = new RegExp(kw.toLowerCase(), "g");
    const count = (lower.match(regex) ?? []).length;
    if (count > 0) {
      hits += count;
      matched.push(kw);
    }
  }
  const score = Math.min((hits / kws.length) * 10, 10);
  return {
    nodeId: nodeId ?? "unknown",
    completion,
    score: Math.round(score * 10) / 10,
    reason: `Keyword hits: ${hits} (${matched.join(", ")})`,
  };
}

async function scoreByLLM(
  completion: string,
  originalPrompt: string,
  apiKey: string,
  model: string,
  nodeId?: string,
): Promise<ScoredCompletion> {
  const metaPrompt = `Rate the following completion on a scale of 1-10 for quality, relevance, and thoroughness.

Original prompt: "${originalPrompt}"

Completion to rate:
"""
${completion}
"""

Respond with ONLY a JSON object: {"score": <number 1-10>, "reason": "<brief explanation>"}`;

  try {
    const result = await callLLM({
      apiKey,
      model,
      userPrompt: metaPrompt,
      temperature: 0,
      maxTokens: 150,
    });
    const parsed = JSON.parse(result.completion) as {
      score: number;
      reason: string;
    };
    return {
      nodeId: nodeId ?? "unknown",
      completion,
      score: Math.max(0, Math.min(10, parsed.score)),
      reason: parsed.reason,
    };
  } catch {
    return {
      nodeId: nodeId ?? "unknown",
      completion,
      score: 5,
      reason: "LLM scoring failed; defaulting to 5",
    };
  }
}

// ---------------------------------------------------------------------------
// Score dispatcher
// ---------------------------------------------------------------------------

async function scoreNode(
  completion: string,
  nodeId: string,
  scorerType: string,
  originalPrompt: string,
  apiKey: string,
  model: string,
): Promise<ScoredCompletion> {
  switch (scorerType) {
    case "keywords":
      return scoreByKeywords(completion, undefined, nodeId);
    case "llm":
      return scoreByLLM(completion, originalPrompt, apiKey, model, nodeId);
    default:
      return scoreByLength(completion, nodeId);
  }
}

// ---------------------------------------------------------------------------
// Exploration tree builder
// ---------------------------------------------------------------------------

function computeBestPath(nodes: CompletionNode[]): string[] {
  if (nodes.length === 0) return [];

  const byDepth = new Map<number, CompletionNode[]>();
  for (const node of nodes) {
    const group = byDepth.get(node.depth) ?? [];
    group.push(node);
    byDepth.set(node.depth, group);
  }

  const path: string[] = [];
  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  for (let d = 0; d <= maxDepth; d++) {
    const group = byDepth.get(d) ?? [];
    const best = group.reduce((a, b) => (a.score >= b.score ? a : b));
    path.push(best.id);
  }
  return path;
}

function computeParallelLatency(
  nodes: CompletionNode[],
  depth: number,
): number {
  let total = 0;
  const byDepth = new Map<number, CompletionNode[]>();
  for (const node of nodes) {
    const group = byDepth.get(node.depth) ?? [];
    group.push(node);
    byDepth.set(node.depth, group);
  }
  for (let d = 0; d < depth; d++) {
    const group = byDepth.get(d) ?? [];
    total += Math.max(...group.map((n) => n.latencyMs), 0);
  }
  return total;
}

async function buildExplorationTree(opts: {
  prompt: string;
  apiKey: string;
  model: string;
  branches: number;
  depth: number;
  temperature: number;
  maxTokens: number;
  scorer: string;
  systemPrompt?: string;
}): Promise<ExplorationTree> {
  const {
    prompt,
    apiKey,
    model,
    branches,
    depth,
    temperature,
    maxTokens,
    scorer,
    systemPrompt,
  } = opts;

  const nodes: CompletionNode[] = [];
  let currentPrompt = prompt;
  let parentId: string | null = null;

  for (let d = 0; d < depth; d++) {
    const branchPromises = Array.from({ length: branches }, async () => {
      const id = generateId();
      const result = await callLLM({
        apiKey,
        model,
        systemPrompt,
        userPrompt: currentPrompt,
        temperature,
        maxTokens,
      });
      const scored = await scoreNode(
        result.completion,
        id,
        scorer,
        prompt,
        apiKey,
        model,
      );

      const node: CompletionNode = {
        id,
        parentId,
        prompt: currentPrompt,
        completion: result.completion,
        score: scored.score,
        model,
        temperature,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
        depth: d,
      };
      return node;
    });

    const branchNodes = await Promise.all(branchPromises);
    nodes.push(...branchNodes);

    // For subsequent depths pick the best node and continue from it
    if (d < depth - 1) {
      const best = branchNodes.reduce((a, b) =>
        a.score >= b.score ? a : b,
      );
      parentId = best.id;
      currentPrompt = `Continue and refine:\n\n${best.completion}`;
    }
  }

  const bestPath = computeBestPath(nodes);
  const totalTokens = nodes.reduce((sum, n) => sum + n.tokensUsed, 0);
  const totalLatencyMs = computeParallelLatency(nodes, depth);

  return { rootPrompt: prompt, nodes, bestPath, totalTokens, totalLatencyMs };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function printExplorationResults(tree: ExplorationTree): void {
  const bestSet = new Set(tree.bestPath);

  console.log("");
  console.log("ClawFlux Exploration Results");
  console.log("\u2550".repeat(40));
  console.log(`Prompt: "${truncate(tree.rootPrompt, 80)}"`);
  console.log("");

  const byDepth = new Map<number, CompletionNode[]>();
  for (const node of tree.nodes) {
    const group = byDepth.get(node.depth) ?? [];
    group.push(node);
    byDepth.set(node.depth, group);
  }

  const maxDepth = Math.max(...tree.nodes.map((n) => n.depth));
  for (let d = 0; d <= maxDepth; d++) {
    if (maxDepth > 0) {
      console.log(`Depth ${d}`);
      console.log("\u2500".repeat(30));
    }
    const group = (byDepth.get(d) ?? []).sort((a, b) => b.score - a.score);
    group.forEach((node, i) => {
      const isBest = bestSet.has(node.id);
      const label = isBest ? " \u2605 BEST" : "";
      console.log(`Branch ${i + 1} (score: ${node.score})${label}`);
      console.log("\u2500".repeat(22));
      console.log(truncate(node.completion, 200));
      console.log(
        `Tokens: ${formatNumber(node.tokensUsed)} | Latency: ${formatMs(node.latencyMs)}`,
      );
      console.log("");
    });
  }

  console.log("Summary");
  const bestScore = Math.max(...tree.nodes.map((n) => n.score));
  const bestIdx =
    tree.nodes
      .filter((n) => n.depth === 0)
      .sort((a, b) => b.score - a.score)
      .findIndex((n) => n.score === bestScore) + 1;
  console.log(`  Total branches: ${tree.nodes.length}`);
  console.log(`  Total tokens:   ${formatNumber(tree.totalTokens)}`);
  console.log(`  Best score:     ${bestScore} (Branch ${bestIdx || 1})`);
  console.log(`  Total time:     ${formatMs(tree.totalLatencyMs)} (parallel)`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Option types
// ---------------------------------------------------------------------------

export type FluxExploreOptions = {
  prompt: string;
  model?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  branches?: string;
  depth?: string;
  temperature?: string;
  maxTokens?: string;
  scorer?: string;
  system?: string;
  select?: boolean;
  json?: boolean;
};

export type FluxCompareOptions = {
  prompt: string;
  models?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  scorer?: string;
  temperature?: string;
  maxTokens?: string;
  json?: boolean;
};

export type FluxScorersOptions = {
  json?: boolean;
};

// ---------------------------------------------------------------------------
// clawd flux explore
// ---------------------------------------------------------------------------

export async function runFluxExplore(opts: FluxExploreOptions): Promise<void> {
  const _cfg = loadClawdConfig();

  const apiKey = resolveApiKey(opts.apiKey, opts.apiKeyEnv);
  const model = opts.model ?? "claude-sonnet-4-20250514";
  const branches = parseInt(opts.branches ?? "3", 10);
  const depth = parseInt(opts.depth ?? "1", 10);
  const temperature = parseFloat(opts.temperature ?? "0.7");
  const maxTokens = parseInt(opts.maxTokens ?? "1024", 10);
  const scorer = opts.scorer ?? "length";

  if (!opts.prompt) {
    console.error("Error: <prompt> argument is required.");
    process.exit(1);
  }

  if (!["length", "keywords", "llm"].includes(scorer)) {
    console.error(
      `Error: unknown scorer "${scorer}". Use one of: length, keywords, llm`,
    );
    process.exit(1);
  }

  try {
    const tree = await buildExplorationTree({
      prompt: opts.prompt,
      apiKey,
      model,
      branches,
      depth,
      temperature,
      maxTokens,
      scorer,
      systemPrompt: opts.system,
    });

    if (opts.json) {
      process.stdout.write(JSON.stringify(tree, null, 2) + "\n");
    } else if (opts.select) {
      const best = tree.nodes.reduce((a, b) =>
        a.score >= b.score ? a : b,
      );
      console.log(best.completion);
    } else {
      printExplorationResults(tree);
    }
  } catch (err: unknown) {
    console.error(
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd flux compare
// ---------------------------------------------------------------------------

export async function runFluxCompare(opts: FluxCompareOptions): Promise<void> {
  const _cfg = loadClawdConfig();

  const apiKey = resolveApiKey(opts.apiKey, opts.apiKeyEnv);
  const models = (
    opts.models ?? "claude-sonnet-4-20250514,claude-haiku-4-20250414"
  )
    .split(",")
    .map((m) => m.trim());
  const scorer = opts.scorer ?? "length";
  const temperature = parseFloat(opts.temperature ?? "0.7");
  const maxTokens = parseInt(opts.maxTokens ?? "1024", 10);

  if (!opts.prompt) {
    console.error("Error: <prompt> argument is required.");
    process.exit(1);
  }

  if (!["length", "keywords", "llm"].includes(scorer)) {
    console.error(
      `Error: unknown scorer "${scorer}". Use one of: length, keywords, llm`,
    );
    process.exit(1);
  }

  try {
    const results = await Promise.all(
      models.map(async (model) => {
        const result = await callLLM({
          apiKey,
          model,
          userPrompt: opts.prompt,
          temperature,
          maxTokens,
        });
        const id = generateId();
        const scored = await scoreNode(
          result.completion,
          id,
          scorer,
          opts.prompt,
          apiKey,
          model,
        );
        return {
          model,
          completion: result.completion,
          score: scored.score,
          reason: scored.reason,
          tokensUsed: result.tokensUsed,
          latencyMs: result.latencyMs,
        };
      }),
    );

    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ prompt: opts.prompt, results }, null, 2) + "\n",
      );
      return;
    }

    console.log("");
    console.log("ClawFlux Model Comparison");
    console.log("\u2550".repeat(40));
    console.log(`Prompt: "${truncate(opts.prompt, 80)}"`);
    console.log("");

    const sorted = [...results].sort((a, b) => b.score - a.score);
    sorted.forEach((r, i) => {
      const best = i === 0 ? " \u2605 BEST" : "";
      console.log(`${r.model} (score: ${r.score})${best}`);
      console.log("\u2500".repeat(22));
      console.log(truncate(r.completion, 200));
      console.log(
        `Tokens: ${formatNumber(r.tokensUsed)} | Latency: ${formatMs(r.latencyMs)}`,
      );
      console.log(`Reason: ${r.reason}`);
      console.log("");
    });
  } catch (err: unknown) {
    console.error(
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd flux scorers
// ---------------------------------------------------------------------------

export async function runFluxScorers(opts: FluxScorersOptions): Promise<void> {
  const scorers = Object.entries(SCORER_DESCRIPTIONS).map(([name, desc]) => ({
    name,
    description: desc,
  }));

  if (opts.json) {
    process.stdout.write(JSON.stringify({ scorers }, null, 2) + "\n");
    return;
  }

  console.log("");
  console.log("Available Scoring Methods");
  console.log("\u2550".repeat(40));
  console.log("");
  console.log(`${"Method".padEnd(12)} ${"Description"}`);
  console.log("\u2500".repeat(80));
  for (const [name, desc] of Object.entries(SCORER_DESCRIPTIONS)) {
    console.log(`${name.padEnd(12)} ${desc}`);
  }
  console.log("");
}
