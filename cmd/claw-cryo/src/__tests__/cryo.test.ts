import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  default: { writeFileSync: vi.fn() },
}));

import * as fs from "node:fs";

import {
  toJson,
  toJsonl,
  toCsv,
  extract,
  getLatestHeight,
  getChainStatus,
  DATASETS,
  type BlockRow,
  type TransactionRow,
  type EventRow,
  type AgentActionRow,
  type PrivacyEventRow,
} from "../index.js";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// Reusable RPC mock data
// ---------------------------------------------------------------------------

const STATUS_RESPONSE = {
  result: {
    node_info: { network: "clawchain-1" },
    sync_info: {
      latest_block_height: "500",
      earliest_block_height: "1",
    },
  },
};

function blockResponse(height: number) {
  return {
    result: {
      block: {
        header: {
          height: String(height),
          time: "2026-03-09T12:00:00Z",
          proposer_address: "DEADBEEF",
        },
        data: { txs: ["dHgx", "dHgy"] },
      },
      block_id: { hash: "ABCDEF1234" },
    },
  };
}

function blockResultsResponse(events: { type: string; attributes: { key: string; value: string }[] }[] = []) {
  return {
    result: {
      begin_block_events: [],
      end_block_events: [],
      txs_results: [
        {
          code: 0,
          gas_used: "50000",
          gas_wanted: "100000",
          events: [
            { type: "message", attributes: [{ key: "action", value: "/clawchain.agent.v1.MsgRegisterAgent" }, { key: "sender", value: "claw1abc" }, { key: "fee", value: "500uclaw" }, { key: "memo", value: "test" }] },
            ...events,
          ],
          log: "",
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Format helper tests
// ---------------------------------------------------------------------------

describe("toCsv", () => {
  it("correctly formats rows with headers", () => {
    const rows: BlockRow[] = [
      { height: 1, time: "2026-01-01T00:00:00Z", hash: "AAA", proposer: "val1", numTxs: 2, gasUsed: 100, gasWanted: 200 },
      { height: 2, time: "2026-01-01T00:01:00Z", hash: "BBB", proposer: "val2", numTxs: 0, gasUsed: 0, gasWanted: 0 },
    ];
    const csv = toCsv(rows as any);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("height,time,hash,proposer,numTxs,gasUsed,gasWanted");
    expect(lines[1]).toBe("1,2026-01-01T00:00:00Z,AAA,val1,2,100,200");
    expect(lines.length).toBe(3);
  });

  it("escapes commas and quotes in values", () => {
    const rows = [{ height: 1, memo: 'hello, "world"', note: "simple" }];
    const csv = toCsv(rows as any);
    const lines = csv.split("\n");
    expect(lines[1]).toContain('"hello, ""world"""');
  });
});

describe("toJsonl", () => {
  it("outputs one object per line", () => {
    const rows = [
      { height: 1, hash: "A" },
      { height: 2, hash: "B" },
    ];
    const output = toJsonl(rows as any);
    const lines = output.split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toEqual({ height: 1, hash: "A" });
    expect(JSON.parse(lines[1])).toEqual({ height: 2, hash: "B" });
  });
});

describe("toJson", () => {
  it("outputs pretty-printed JSON array", () => {
    const rows = [{ height: 1 }];
    const output = toJson(rows as any);
    expect(JSON.parse(output)).toEqual([{ height: 1 }]);
    expect(output).toContain("\n"); // pretty printed
  });
});

// ---------------------------------------------------------------------------
// Block extraction
// ---------------------------------------------------------------------------

describe("extract blocks", () => {
  it("parses RPC block response into BlockRow", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/block?height=")) return jsonResponse(blockResponse(1));
      if (url.includes("/block_results?height=")) return jsonResponse({
        result: { txs_results: [{ gas_used: "50000", gas_wanted: "100000" }, { gas_used: "25000", gas_wanted: "50000" }] },
      });
      return jsonResponse(STATUS_RESPONSE);
    });

    const rows = await extract("blocks", { rpc: "http://localhost:26657", from: 1, to: 1, batchSize: 100, verbose: false });
    expect(rows.length).toBe(1);
    const block = rows[0] as BlockRow;
    expect(block.height).toBe(1);
    expect(block.hash).toBe("ABCDEF1234");
    expect(block.proposer).toBe("DEADBEEF");
    expect(block.numTxs).toBe(2);
    expect(block.gasUsed).toBe(75000);
    expect(block.gasWanted).toBe(150000);
    expect(block.time).toBe("2026-03-09T12:00:00Z");
  });
});

// ---------------------------------------------------------------------------
// Transaction extraction
// ---------------------------------------------------------------------------

describe("extract transactions", () => {
  it("parses block_results into TransactionRow", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/block_results?height=")) return jsonResponse(blockResultsResponse());
      return jsonResponse(STATUS_RESPONSE);
    });

    const rows = await extract("transactions", { rpc: "http://localhost:26657", from: 5, to: 5, batchSize: 100, verbose: false });
    expect(rows.length).toBe(1);
    const tx = rows[0] as TransactionRow;
    expect(tx.height).toBe(5);
    expect(tx.msgType).toBe("/clawchain.agent.v1.MsgRegisterAgent");
    expect(tx.sender).toBe("claw1abc");
    expect(tx.gasUsed).toBe(50000);
    expect(tx.success).toBe(true);
    expect(tx.fee).toBe("500uclaw");
  });
});

// ---------------------------------------------------------------------------
// Agent action filtering
// ---------------------------------------------------------------------------

describe("extract agent_actions", () => {
  it("filters events for agent event types", async () => {
    const agentEvents = [
      { type: "register_agent", attributes: [{ key: "agent", value: "claw1agent" }, { key: "amount", value: "1000uclaw" }] },
      { type: "transfer", attributes: [{ key: "sender", value: "someone" }] },
      { type: "agent_heartbeat", attributes: [{ key: "agent", value: "claw1agent" }, { key: "detail", value: "alive" }] },
    ];

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/block_results?height=")) return jsonResponse({
        result: {
          begin_block_events: [],
          end_block_events: [],
          txs_results: [{ events: agentEvents }],
        },
      });
      return jsonResponse(STATUS_RESPONSE);
    });

    const rows = await extract("agent_actions", { rpc: "http://localhost:26657", from: 10, to: 10, batchSize: 100, verbose: false });
    expect(rows.length).toBe(2);
    const r0 = rows[0] as AgentActionRow;
    expect(r0.action).toBe("register_agent");
    expect(r0.agent).toBe("claw1agent");
    const r1 = rows[1] as AgentActionRow;
    expect(r1.action).toBe("agent_heartbeat");
  });
});

// ---------------------------------------------------------------------------
// Privacy event filtering
// ---------------------------------------------------------------------------

describe("extract privacy_events", () => {
  it("filters events for privacy event types", async () => {
    const privacyEvents = [
      { type: "shield", attributes: [{ key: "nullifier", value: "nul1" }, { key: "commitment", value: "com1" }, { key: "amount", value: "100uclaw" }] },
      { type: "unrelated", attributes: [] },
      { type: "unshield", attributes: [{ key: "nullifier", value: "nul2" }, { key: "commitment", value: "com2" }, { key: "amount", value: "50uclaw" }] },
    ];

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/block_results?height=")) return jsonResponse({
        result: {
          begin_block_events: [],
          end_block_events: [],
          txs_results: [{ events: privacyEvents }],
        },
      });
      return jsonResponse(STATUS_RESPONSE);
    });

    const rows = await extract("privacy_events", { rpc: "http://localhost:26657", from: 1, to: 1, batchSize: 100, verbose: false });
    expect(rows.length).toBe(2);
    const p0 = rows[0] as PrivacyEventRow;
    expect(p0.action).toBe("shield");
    expect(p0.nullifier).toBe("nul1");
    const p1 = rows[1] as PrivacyEventRow;
    expect(p1.action).toBe("unshield");
  });
});

// ---------------------------------------------------------------------------
// Dataset listing
// ---------------------------------------------------------------------------

describe("DATASETS catalogue", () => {
  it("contains all 9 datasets", () => {
    expect(DATASETS.length).toBe(9);
    const names = DATASETS.map((d) => d.name);
    expect(names).toContain("blocks");
    expect(names).toContain("transactions");
    expect(names).toContain("events");
    expect(names).toContain("agent_actions");
    expect(names).toContain("privacy_events");
    expect(names).toContain("marketplace_events");
    expect(names).toContain("staking_events");
    expect(names).toContain("governance_events");
    expect(names).toContain("dex_swaps");
  });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe("getChainStatus", () => {
  it("queries and returns chain info", async () => {
    mockFetch.mockImplementation(() => jsonResponse(STATUS_RESPONSE));

    const status = await getChainStatus("http://localhost:26657");
    expect(status.chainId).toBe("clawchain-1");
    expect(status.latestHeight).toBe(500);
    expect(status.earliestHeight).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:26657/status",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });
});

// ---------------------------------------------------------------------------
// Range respected
// ---------------------------------------------------------------------------

describe("--from and --to range", () => {
  it("only fetches blocks within the specified range", async () => {
    const fetchedHeights: number[] = [];
    mockFetch.mockImplementation((url: string) => {
      const match = url.match(/height=(\d+)/);
      if (match) fetchedHeights.push(parseInt(match[1], 10));
      if (url.includes("/block?height=")) return jsonResponse(blockResponse(parseInt(match![1], 10)));
      if (url.includes("/block_results?height=")) return jsonResponse({
        result: { txs_results: [] },
      });
      return jsonResponse(STATUS_RESPONSE);
    });

    await extract("blocks", { rpc: "http://localhost:26657", from: 5, to: 7, batchSize: 100, verbose: false });
    // block + block_results for each height = 5,5,6,6,7,7
    const uniqueHeights = [...new Set(fetchedHeights)];
    expect(uniqueHeights.sort()).toEqual([5, 6, 7]);
  });
});

// ---------------------------------------------------------------------------
// Output to file
// ---------------------------------------------------------------------------

describe("output file writing", () => {
  it("writes correct content via fs.writeFileSync", () => {
    const writeMock = vi.mocked(fs.writeFileSync);
    writeMock.mockClear();

    const rows = [
      { height: 1, time: "t", hash: "h", proposer: "p", numTxs: 0, gasUsed: 0, gasWanted: 0 },
    ];
    const output = toCsv(rows as any);
    fs.writeFileSync("/tmp/test-output.csv", output + "\n", "utf-8");

    expect(writeMock).toHaveBeenCalledWith("/tmp/test-output.csv", expect.stringContaining("height,time,hash"), "utf-8");
  });
});

// ---------------------------------------------------------------------------
// CSV header row
// ---------------------------------------------------------------------------

describe("CSV format", () => {
  it("includes header row matching object keys", () => {
    const rows = [{ alpha: 1, beta: "two", gamma: true }];
    const csv = toCsv(rows as any);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("alpha,beta,gamma");
    expect(lines[1]).toBe("1,two,true");
  });
});

// ---------------------------------------------------------------------------
// getLatestHeight
// ---------------------------------------------------------------------------

describe("getLatestHeight", () => {
  it("returns parsed integer from status response", async () => {
    mockFetch.mockImplementation(() => jsonResponse(STATUS_RESPONSE));
    const height = await getLatestHeight("http://localhost:26657");
    expect(height).toBe(500);
  });
});
