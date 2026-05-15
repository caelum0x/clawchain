import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DATASETS,
  generateSampleData,
  toCsv,
  toJsonl,
  seededRandom,
  createProgram,
} from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const original = process.stdout.write;
  let captured = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write;

  const result = fn();
  const restore = () => {
    process.stdout.write = original;
  };
  if (result instanceof Promise) {
    return result.then(() => {
      restore();
      return captured;
    });
  }
  restore();
  return Promise.resolve(captured);
}

function captureConsoleLog(fn: () => void | Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  const result = fn();
  const restore = () => {
    console.log = originalLog;
  };
  if (result instanceof Promise) {
    return result.then(() => {
      restore();
      return logs;
    });
  }
  restore();
  return Promise.resolve(logs);
}

// ---------------------------------------------------------------------------
// Dataset Registry Tests
// ---------------------------------------------------------------------------

describe("Dataset Registry", () => {
  it("should contain exactly 12 datasets", () => {
    expect(DATASETS).toHaveLength(12);
  });

  it("should filter datasets by category", () => {
    const coreDatasets = DATASETS.filter((d) => d.category === "core");
    expect(coreDatasets).toHaveLength(3);
    expect(coreDatasets.map((d) => d.id)).toContain("blocks");
    expect(coreDatasets.map((d) => d.id)).toContain("transactions");
    expect(coreDatasets.map((d) => d.id)).toContain("token-transfers");

    const agentDatasets = DATASETS.filter((d) => d.category === "agents");
    expect(agentDatasets).toHaveLength(2);

    const defiDatasets = DATASETS.filter((d) => d.category === "defi");
    expect(defiDatasets).toHaveLength(2);
  });

  it("should have 8 unique categories with correct counts", () => {
    const categories = new Map<string, number>();
    for (const d of DATASETS) {
      categories.set(d.category, (categories.get(d.category) ?? 0) + 1);
    }
    expect(categories.size).toBe(8);
    expect(categories.get("core")).toBe(3);
    expect(categories.get("agents")).toBe(2);
    expect(categories.get("defi")).toBe(2);
    expect(categories.get("privacy")).toBe(1);
    expect(categories.get("staking")).toBe(1);
    expect(categories.get("governance")).toBe(1);
    expect(categories.get("marketplace")).toBe(1);
    expect(categories.get("compute")).toBe(1);
  });

  it("should show dataset details via info command", async () => {
    const program = createProgram();
    const logs = await captureConsoleLog(() => {
      program.parse(["node", "test", "info", "blocks"]);
    });
    const output = logs.join("\n");
    expect(output).toContain("ClawChain Blocks");
    expect(output).toContain("core");
    expect(output).toContain("height");
    expect(output).toContain("Fields (7)");
  });
});

// ---------------------------------------------------------------------------
// Sample Data Generation Tests
// ---------------------------------------------------------------------------

describe("Sample Data Generation", () => {
  it("should generate correct number of rows", () => {
    const blocks = generateSampleData(DATASETS[0], 50);
    expect(blocks).toHaveLength(50);

    const txs = generateSampleData(DATASETS[1], 100);
    expect(txs).toHaveLength(100);
  });

  it("should have all required fields for blocks dataset", () => {
    const blocksDs = DATASETS.find((d) => d.id === "blocks")!;
    const rows = generateSampleData(blocksDs, 10);
    for (const row of rows) {
      for (const field of blocksDs.fields) {
        expect(row).toHaveProperty(field);
      }
    }
    // Verify realistic data shapes
    expect(typeof rows[0].height).toBe("number");
    expect(typeof rows[0].time).toBe("string");
    expect((rows[0].hash as string).length).toBe(64);
    expect((rows[0].proposer as string).startsWith("clawvaloper1")).toBe(true);
    expect(typeof rows[0].num_txs).toBe("number");
  });

  it("should have all required fields for agent-tasks dataset", () => {
    const tasksDs = DATASETS.find((d) => d.id === "agent-tasks")!;
    const rows = generateSampleData(tasksDs, 20);
    for (const row of rows) {
      for (const field of tasksDs.fields) {
        expect(row).toHaveProperty(field);
      }
    }
    // Verify task-specific data
    expect((rows[0].task_id as string).startsWith("task-")).toBe(true);
    expect((rows[0].delegator as string).startsWith("claw1")).toBe(true);
    expect(typeof rows[0].budget).toBe("number");
  });

  it("should produce deterministic output with same seed", () => {
    const ds = DATASETS.find((d) => d.id === "blocks")!;
    const run1 = generateSampleData(ds, 25, 12345);
    const run2 = generateSampleData(ds, 25, 12345);
    expect(run1).toEqual(run2);

    // Different seed = different output
    const run3 = generateSampleData(ds, 25, 99999);
    expect(run3).not.toEqual(run1);
  });

  it("should generate data for all 12 datasets without error", () => {
    for (const ds of DATASETS) {
      const rows = generateSampleData(ds, 5);
      expect(rows).toHaveLength(5);
      for (const field of ds.fields) {
        expect(rows[0]).toHaveProperty(field);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Seeded PRNG Tests
// ---------------------------------------------------------------------------

describe("seededRandom", () => {
  it("should produce deterministic sequences", () => {
    const rng1 = seededRandom(42);
    const rng2 = seededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it("should produce values between 0 and 1", () => {
    const rng = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// CSV Output Tests
// ---------------------------------------------------------------------------

describe("toCsv", () => {
  it("should produce header row matching fields", () => {
    const ds = DATASETS.find((d) => d.id === "blocks")!;
    const rows = generateSampleData(ds, 3);
    const csv = toCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(ds.fields.join(","));
    // 1 header + 3 data rows
    expect(lines).toHaveLength(4);
  });

  it("should escape commas and quotes in values", () => {
    const rows = [
      { name: 'has, comma', description: 'has "quotes"', plain: "ok" },
    ];
    const csv = toCsv(rows);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("name,description,plain");
    expect(lines[1]).toContain('"has, comma"');
    expect(lines[1]).toContain('"has ""quotes"""');
    expect(lines[1]).toContain("ok");
  });

  it("should return empty string for empty array", () => {
    expect(toCsv([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// JSONL Output Tests
// ---------------------------------------------------------------------------

describe("toJsonl", () => {
  it("should produce one JSON object per line", () => {
    const ds = DATASETS.find((d) => d.id === "agent-registry")!;
    const rows = generateSampleData(ds, 5);
    const jsonl = toJsonl(rows);
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(5);
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(typeof parsed).toBe("object");
      expect(parsed).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// JSON Output Tests
// ---------------------------------------------------------------------------

describe("JSON output", () => {
  it("should produce a valid JSON array via --format json", async () => {
    const ds = DATASETS.find((d) => d.id === "blocks")!;
    const rows = generateSampleData(ds, 3);
    const jsonStr = JSON.stringify(rows, null, 2) + "\n";
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toHaveProperty("height");
  });
});

// ---------------------------------------------------------------------------
// CLI Command Tests
// ---------------------------------------------------------------------------

describe("CLI Commands", () => {
  let originalExit: typeof process.exit;

  beforeEach(() => {
    originalExit = process.exit;
    // Prevent process.exit from actually exiting during tests
    process.exit = vi.fn() as unknown as typeof process.exit;
  });

  afterEach(() => {
    process.exit = originalExit;
  });

  it("should list all datasets in table format", async () => {
    const program = createProgram();
    const logs = await captureConsoleLog(() => {
      program.parse(["node", "test", "list"]);
    });
    const output = logs.join("\n");
    // All 12 datasets should appear
    expect(output).toContain("blocks");
    expect(output).toContain("transactions");
    expect(output).toContain("agent-registry");
    expect(output).toContain("dex-swaps");
    expect(output).toContain("gpu-compute-jobs");
    expect(output).toContain("token-transfers");
  });

  it("should list datasets filtered by category", async () => {
    const program = createProgram();
    const logs = await captureConsoleLog(() => {
      program.parse(["node", "test", "list", "--category", "defi"]);
    });
    const output = logs.join("\n");
    expect(output).toContain("dex-swaps");
    expect(output).toContain("dex-liquidity");
    expect(output).not.toContain("blocks");
    expect(output).not.toContain("agent-registry");
  });

  it("should list datasets in JSON format", async () => {
    const program = createProgram();
    const logs = await captureConsoleLog(() => {
      program.parse(["node", "test", "list", "--json"]);
    });
    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(12);
    expect(parsed[0]).toHaveProperty("id");
    expect(parsed[0]).toHaveProperty("fields");
  });

  it("should download sample data with --limit", async () => {
    const program = createProgram();
    const output = await captureStdout(async () => {
      await program.parseAsync([
        "node",
        "test",
        "download",
        "blocks",
        "--sample",
        "--limit",
        "5",
      ]);
    });
    const lines = output.trim().split("\n");
    // 1 header + 5 data rows
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe(
      "height,time,hash,proposer,num_txs,gas_used,gas_wanted",
    );
  });

  it("should reject invalid dataset ID on download", async () => {
    const program = createProgram();
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    try {
      await program.parseAsync([
        "node",
        "test",
        "download",
        "nonexistent-dataset",
        "--sample",
      ]);
    } catch {
      // expected
    }
    console.error = originalError;
    expect(errors.some((e) => e.includes("not found"))).toBe(true);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("should show categories with correct counts", async () => {
    const program = createProgram();
    const logs = await captureConsoleLog(() => {
      program.parse(["node", "test", "categories"]);
    });
    const output = logs.join("\n");
    expect(output).toContain("core");
    expect(output).toContain("agents");
    expect(output).toContain("defi");
    expect(output).toContain("privacy");
    expect(output).toContain("staking");
    expect(output).toContain("governance");
    expect(output).toContain("marketplace");
    expect(output).toContain("compute");
    // Verify counts appear (core has 3, agents has 2, etc.)
    expect(output).toContain("3");
    expect(output).toContain("2");
    expect(output).toContain("1");
  });
});
