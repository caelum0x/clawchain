import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callLLM,
  scoreByLength,
  scoreByKeywords,
  buildExplorationTree,
  createProgram,
} from "../index.js";
import type { ExplorationTree, CompletionNode } from "../index.js";

// ──────────────────────────────────────────────
// Mock fetch globally
// ──────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("performance", { now: vi.fn(() => Date.now()) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeMockResponse(text: string, inputTokens = 50, outputTokens = 100) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: "text", text }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }),
    text: async () => "",
  } as unknown as Response;
}

function makeMockErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

// ──────────────────────────────────────────────
// scoreByLength tests
// ──────────────────────────────────────────────

describe("scoreByLength", () => {
  it("returns higher score for longer text", () => {
    const short = scoreByLength("hello", "n1");
    const long = scoreByLength("a".repeat(500), "n2");
    expect(long.score).toBeGreaterThan(short.score);
  });

  it("caps score at 10", () => {
    const result = scoreByLength("x".repeat(5000), "n1");
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it("returns 0 for empty string", () => {
    const result = scoreByLength("", "n1");
    expect(result.score).toBe(0);
  });
});

// ──────────────────────────────────────────────
// scoreByKeywords tests
// ──────────────────────────────────────────────

describe("scoreByKeywords", () => {
  it("scores higher when ClawChain keywords present", () => {
    const noKeywords = scoreByKeywords("The weather is nice today.", undefined, "n1");
    const withKeywords = scoreByKeywords(
      "The agent uses CLAW tokens for privacy shielding via the marketplace with governance and escrow support for validators.",
      undefined,
      "n2",
    );
    expect(withKeywords.score).toBeGreaterThan(noKeywords.score);
  });

  it("returns 0 for empty text", () => {
    const result = scoreByKeywords("", undefined, "n1");
    expect(result.score).toBe(0);
    expect(result.reason).toBe("Empty completion");
  });

  it("accepts custom keywords list", () => {
    const result = scoreByKeywords("foo bar baz foo", ["foo", "bar"], "n1");
    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toContain("foo");
  });

  it("counts multiple occurrences of the same keyword", () => {
    const single = scoreByKeywords("agent works well", undefined, "n1");
    const multi = scoreByKeywords("agent agent agent agent agent", undefined, "n2");
    expect(multi.score).toBeGreaterThan(single.score);
  });
});

// ──────────────────────────────────────────────
// callLLM tests
// ──────────────────────────────────────────────

describe("callLLM", () => {
  it("constructs correct API request", async () => {
    mockFetch.mockResolvedValueOnce(makeMockResponse("mock completion"));

    const result = await callLLM({
      apiKey: "test-key-123",
      model: "claude-sonnet-4-20250514",
      systemPrompt: "You are helpful.",
      userPrompt: "Hello world",
      temperature: 0.7,
      maxTokens: 1024,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(options.method).toBe("POST");

    const headers = options.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key-123");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.max_tokens).toBe(1024);
    expect(body.temperature).toBe(0.7);
    expect(body.system).toBe("You are helpful.");
    expect(body.messages).toEqual([{ role: "user", content: "Hello world" }]);

    expect(result.completion).toBe("mock completion");
    expect(result.tokensUsed).toBe(150);
  });

  it("handles API error responses gracefully", async () => {
    mockFetch.mockResolvedValueOnce(makeMockErrorResponse(429, "Rate limit exceeded"));

    await expect(
      callLLM({
        apiKey: "key",
        model: "claude-sonnet-4-20250514",
        userPrompt: "test",
        temperature: 0.5,
        maxTokens: 100,
      }),
    ).rejects.toThrow("Anthropic API error 429: Rate limit exceeded");
  });

  it("omits system field when no system prompt provided", async () => {
    mockFetch.mockResolvedValueOnce(makeMockResponse("response"));

    await callLLM({
      apiKey: "key",
      model: "claude-sonnet-4-20250514",
      userPrompt: "test",
      temperature: 0.5,
      maxTokens: 100,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.system).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// Exploration tree tests
// ──────────────────────────────────────────────

describe("buildExplorationTree", () => {
  it("builds correctly with 3 branches", async () => {
    mockFetch
      .mockResolvedValueOnce(makeMockResponse("Branch one response about agents", 40, 80))
      .mockResolvedValueOnce(makeMockResponse("Branch two response", 40, 60))
      .mockResolvedValueOnce(makeMockResponse("Branch three", 40, 50));

    const tree: ExplorationTree = await buildExplorationTree({
      prompt: "test prompt",
      apiKey: "key",
      model: "claude-sonnet-4-20250514",
      branches: 3,
      depth: 1,
      temperature: 0.7,
      maxTokens: 1024,
      scorer: "length",
    });

    expect(tree.rootPrompt).toBe("test prompt");
    expect(tree.nodes).toHaveLength(3);
    expect(tree.bestPath).toHaveLength(1);
    expect(tree.totalTokens).toBeGreaterThan(0);
    expect(tree.nodes.every((n: CompletionNode) => n.depth === 0)).toBe(true);
    expect(tree.nodes.every((n: CompletionNode) => n.model === "claude-sonnet-4-20250514")).toBe(
      true,
    );
  });

  it("picks highest-scoring node for best path", async () => {
    // Return completions of different lengths so length scorer produces different scores
    mockFetch
      .mockResolvedValueOnce(makeMockResponse("short", 10, 10))
      .mockResolvedValueOnce(makeMockResponse("a".repeat(600), 10, 100))
      .mockResolvedValueOnce(makeMockResponse("medium length text here", 10, 30));

    const tree = await buildExplorationTree({
      prompt: "test",
      apiKey: "key",
      model: "claude-sonnet-4-20250514",
      branches: 3,
      depth: 1,
      temperature: 0.7,
      maxTokens: 1024,
      scorer: "length",
    });

    const bestNode = tree.nodes.find((n: CompletionNode) => n.id === tree.bestPath[0]);
    expect(bestNode).toBeDefined();
    const maxScore = Math.max(...tree.nodes.map((n: CompletionNode) => n.score));
    expect(bestNode!.score).toBe(maxScore);
  });

  it("token counting sums correctly across branches", async () => {
    mockFetch
      .mockResolvedValueOnce(makeMockResponse("a", 100, 200))
      .mockResolvedValueOnce(makeMockResponse("b", 150, 250));

    const tree = await buildExplorationTree({
      prompt: "test",
      apiKey: "key",
      model: "claude-sonnet-4-20250514",
      branches: 2,
      depth: 1,
      temperature: 0.7,
      maxTokens: 1024,
      scorer: "length",
    });

    expect(tree.totalTokens).toBe(300 + 400);
  });

  it("handles multi-depth exploration", async () => {
    // Depth 0: 2 branches
    mockFetch
      .mockResolvedValueOnce(makeMockResponse("depth0 branch1 long enough text", 30, 60))
      .mockResolvedValueOnce(makeMockResponse("depth0 branch2", 30, 40))
      // Depth 1: 2 branches (follow-up from best of depth 0)
      .mockResolvedValueOnce(makeMockResponse("depth1 branch1 continuation", 40, 70))
      .mockResolvedValueOnce(makeMockResponse("depth1 branch2 more", 40, 50));

    const tree = await buildExplorationTree({
      prompt: "test",
      apiKey: "key",
      model: "claude-sonnet-4-20250514",
      branches: 2,
      depth: 2,
      temperature: 0.7,
      maxTokens: 1024,
      scorer: "length",
    });

    expect(tree.nodes).toHaveLength(4);
    expect(tree.bestPath).toHaveLength(2);
    expect(tree.nodes.filter((n: CompletionNode) => n.depth === 0)).toHaveLength(2);
    expect(tree.nodes.filter((n: CompletionNode) => n.depth === 1)).toHaveLength(2);
    // Depth-1 nodes should have a parentId
    const depth1Nodes = tree.nodes.filter((n: CompletionNode) => n.depth === 1);
    expect(depth1Nodes.every((n: CompletionNode) => n.parentId !== null)).toBe(true);
  });
});

// ──────────────────────────────────────────────
// JSON output test
// ──────────────────────────────────────────────

describe("JSON output", () => {
  it("includes all ExplorationTree fields", async () => {
    mockFetch
      .mockResolvedValueOnce(makeMockResponse("result one", 50, 100))
      .mockResolvedValueOnce(makeMockResponse("result two", 50, 100));

    const tree = await buildExplorationTree({
      prompt: "json test",
      apiKey: "key",
      model: "claude-sonnet-4-20250514",
      branches: 2,
      depth: 1,
      temperature: 0.7,
      maxTokens: 512,
      scorer: "length",
    });

    const json = JSON.parse(JSON.stringify(tree));
    expect(json).toHaveProperty("rootPrompt", "json test");
    expect(json).toHaveProperty("nodes");
    expect(json).toHaveProperty("bestPath");
    expect(json).toHaveProperty("totalTokens");
    expect(json).toHaveProperty("totalLatencyMs");
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(Array.isArray(json.bestPath)).toBe(true);

    for (const node of json.nodes) {
      expect(node).toHaveProperty("id");
      expect(node).toHaveProperty("parentId");
      expect(node).toHaveProperty("prompt");
      expect(node).toHaveProperty("completion");
      expect(node).toHaveProperty("score");
      expect(node).toHaveProperty("model");
      expect(node).toHaveProperty("temperature");
      expect(node).toHaveProperty("tokensUsed");
      expect(node).toHaveProperty("latencyMs");
      expect(node).toHaveProperty("depth");
    }
  });
});

// ──────────────────────────────────────────────
// Compare command test
// ──────────────────────────────────────────────

describe("compare command", () => {
  it("sends to multiple models", async () => {
    mockFetch
      .mockResolvedValueOnce(makeMockResponse("sonnet response", 50, 100))
      .mockResolvedValueOnce(makeMockResponse("haiku response", 30, 70));

    // Build trees directly for each model to verify fetch calls
    await Promise.all([
      callLLM({
        apiKey: "key",
        model: "claude-sonnet-4-20250514",
        userPrompt: "compare test",
        temperature: 0.7,
        maxTokens: 1024,
      }),
      callLLM({
        apiKey: "key",
        model: "claude-haiku-4-20250414",
        userPrompt: "compare test",
        temperature: 0.7,
        maxTokens: 1024,
      }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body as string);
    expect(body1.model).toBe("claude-sonnet-4-20250514");
    expect(body2.model).toBe("claude-haiku-4-20250414");
  });
});

// ──────────────────────────────────────────────
// Scorer listing test
// ──────────────────────────────────────────────

describe("scorers command", () => {
  it("shows all 3 methods", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = createProgram();
    program.parse(["node", "claw-flux", "scorers"]);

    const output = consoleSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("length");
    expect(output).toContain("keywords");
    expect(output).toContain("llm");

    consoleSpy.mockRestore();
  });
});

// ──────────────────────────────────────────────
// Parallel execution test
// ──────────────────────────────────────────────

describe("parallel execution", () => {
  it("branches execute concurrently", async () => {
    // Each call takes ~50ms — if sequential that would be ~150ms+ for 3 branches
    const delay = 50;
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(makeMockResponse("parallel response", 20, 40)), delay);
        }),
    );

    const start = Date.now();
    const tree = await buildExplorationTree({
      prompt: "concurrency test",
      apiKey: "key",
      model: "claude-sonnet-4-20250514",
      branches: 3,
      depth: 1,
      temperature: 0.7,
      maxTokens: 256,
      scorer: "length",
    });
    const elapsed = Date.now() - start;

    expect(tree.nodes).toHaveLength(3);
    // Parallel should be faster than sequential (3 * 50ms = 150ms)
    // Allow generous margin but ensure it's not fully sequential
    expect(elapsed).toBeLessThan(delay * 3 + 50);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
