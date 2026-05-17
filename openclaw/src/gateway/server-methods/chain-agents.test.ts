import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chainAgentHandlers } from "./chain-agents.js";

const mockGetBlockchainAgent = vi.fn();
const mockGetBlockchainAddress = vi.fn();

vi.mock("../../../extensions/clawchain/index.js", () => ({
  getBlockchainAgent: (...args: unknown[]) => mockGetBlockchainAgent(...args),
  getBlockchainAddress: (...args: unknown[]) => mockGetBlockchainAddress(...args),
}));

// Mock global fetch for LCD queries
const mockFetch = vi.fn();
let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

function makeReq(method: string) {
  return { type: "req", id: "1", method } as const;
}

function makeOpts(method: string, params: Record<string, unknown> = {}) {
  return {
    req: makeReq(method),
    params,
    client: null,
    isWebchatConnect: () => false,
    context: {} as never,
    respond: vi.fn(),
  };
}

function mockFetchJson(body: unknown, ok = true, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? "OK" : "Internal Server Error",
    json: async () => body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
});

afterEach(() => {
  fetchSpy?.mockRestore();
});

// ---------------------------------------------------------------------------
// chain.agents.list
// ---------------------------------------------------------------------------

describe("chain.agents.list handler", () => {
  it("returns a list of agents from LCD", async () => {
    mockFetchJson({
      agents: [
        {
          address: "claw1abc",
          name: "Agent Alpha",
          status: "active",
          last_heartbeat: "2026-03-08T00:00:00Z",
          capabilities: ["inference", "privacy"],
        },
        {
          address: "claw1def",
          name: "Agent Beta",
          status: "active",
          last_heartbeat: null,
          capabilities: [],
        },
      ],
      pagination: { total: "42" },
    });

    const opts = makeOpts("chain.agents.list", { limit: 10, offset: 0 });
    await chainAgentHandlers["chain.agents.list"](opts);

    expect(opts.respond).toHaveBeenCalledWith(true, {
      agents: [
        {
          address: "claw1abc",
          name: "Agent Alpha",
          status: "active",
          lastHeartbeat: "2026-03-08T00:00:00Z",
          capabilities: ["inference", "privacy"],
        },
        {
          address: "claw1def",
          name: "Agent Beta",
          status: "active",
          lastHeartbeat: null,
          capabilities: [],
        },
      ],
      count: 2,
      total: 42,
    });
  });

  it("uses default limit and offset when not specified", async () => {
    mockFetchJson({ agents: [], pagination: { total: "0" } });

    const opts = makeOpts("chain.agents.list");
    await chainAgentHandlers["chain.agents.list"](opts);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("pagination.limit=20&pagination.offset=0"),
      expect.any(Object),
    );
    expect(opts.respond).toHaveBeenCalledWith(true, {
      agents: [],
      count: 0,
      total: 0,
    });
  });

  it("responds with error when LCD request fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connection refused"));

    const opts = makeOpts("chain.agents.list");
    await chainAgentHandlers["chain.agents.list"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      code: expect.any(String),
    }));
  });
});

// ---------------------------------------------------------------------------
// chain.agents.info
// ---------------------------------------------------------------------------

describe("chain.agents.info handler", () => {
  it("returns agent info via SDK client when agent is connected", async () => {
    const mockClient = {
      getAgent: vi.fn().mockResolvedValue({
        registered: true,
        agent: {
          name: "Alpha",
          reputation: 95,
          skills: ["inference", "coding"],
          task_count: 12,
        },
      }),
      getAgentLiveness: vi.fn().mockResolvedValue({
        found: true,
        liveness: { lastHeartbeat: "2026-03-08T10:00:00Z" },
      }),
    };

    mockGetBlockchainAgent.mockReturnValue({ client: mockClient });

    const opts = makeOpts("chain.agents.info", { address: "claw1abc" });
    await chainAgentHandlers["chain.agents.info"](opts);

    expect(opts.respond).toHaveBeenCalledWith(true, {
      agent: {
        address: "claw1abc",
        name: "Alpha",
        registered: true,
        reputation: 95,
        lastHeartbeat: "2026-03-08T10:00:00Z",
        skills: ["inference", "coding"],
        taskCount: 12,
      },
    });
  });

  it("falls back to LCD when agent is not connected", async () => {
    mockGetBlockchainAgent.mockReturnValue(null);

    mockFetchJson({
      agent: {
        name: "Beta",
        registered: true,
        reputation: 80,
        last_heartbeat: "2026-03-07T12:00:00Z",
        skills: ["privacy"],
        task_count: 5,
      },
    });

    const opts = makeOpts("chain.agents.info", { address: "claw1def" });
    await chainAgentHandlers["chain.agents.info"](opts);

    expect(opts.respond).toHaveBeenCalledWith(true, {
      agent: {
        address: "claw1def",
        name: "Beta",
        registered: true,
        reputation: 80,
        lastHeartbeat: "2026-03-07T12:00:00Z",
        skills: ["privacy"],
        taskCount: 5,
      },
    });
  });

  it("returns error when address is missing", async () => {
    const opts = makeOpts("chain.agents.info", {});
    await chainAgentHandlers["chain.agents.info"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      message: "address is required",
    }));
  });
});

// ---------------------------------------------------------------------------
// chain.agents.tasks
// ---------------------------------------------------------------------------

describe("chain.agents.tasks handler", () => {
  it("returns tasks by assignee using LCD", async () => {
    mockGetBlockchainAddress.mockReturnValue("claw1me");

    mockFetchJson({
      tasks: [
        {
          id: "task-1",
          description: "Run inference",
          assignee: "claw1me",
          delegator: "claw1boss",
          status: "pending",
          created_at: "2026-03-08T08:00:00Z",
        },
      ],
    });

    const opts = makeOpts("chain.agents.tasks", { role: "assignee" });
    await chainAgentHandlers["chain.agents.tasks"](opts);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("tasks_by_assignee/claw1me"),
      expect.any(Object),
    );
    expect(opts.respond).toHaveBeenCalledWith(true, {
      tasks: [
        {
          id: "task-1",
          description: "Run inference",
          assignee: "claw1me",
          delegator: "claw1boss",
          status: "pending",
          createdAt: "2026-03-08T08:00:00Z",
        },
      ],
      count: 1,
    });
  });

  it("queries by delegator when role is delegator", async () => {
    mockFetchJson({ tasks: [] });

    const opts = makeOpts("chain.agents.tasks", {
      address: "claw1boss",
      role: "delegator",
    });
    await chainAgentHandlers["chain.agents.tasks"](opts);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("tasks_by_delegator/claw1boss"),
      expect.any(Object),
    );
    expect(opts.respond).toHaveBeenCalledWith(true, {
      tasks: [],
      count: 0,
    });
  });

  it("appends status filter to query", async () => {
    mockFetchJson({ tasks: [] });

    const opts = makeOpts("chain.agents.tasks", {
      address: "claw1me",
      role: "assignee",
      status: "completed",
    });
    await chainAgentHandlers["chain.agents.tasks"](opts);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("status=completed"),
      expect.any(Object),
    );
  });

  it("returns error when no address and agent not connected", async () => {
    mockGetBlockchainAddress.mockReturnValue(null);

    const opts = makeOpts("chain.agents.tasks", {});
    await chainAgentHandlers["chain.agents.tasks"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      message: expect.stringContaining("address is required"),
    }));
  });
});

// ---------------------------------------------------------------------------
// chain.agents.delegate
// ---------------------------------------------------------------------------

describe("chain.agents.delegate handler", () => {
  it("delegates a task via the SDK client", async () => {
    mockGetBlockchainAddress.mockReturnValue("claw1me");
    mockGetBlockchainAgent.mockReturnValue({
      client: {
        delegateTask: vi.fn().mockResolvedValue({
          transactionHash: "AABB11",
          height: 500,
          code: 0,
          taskId: "task-99",
        }),
      },
    });

    const opts = makeOpts("chain.agents.delegate", {
      assignee: "claw1worker",
      description: "Analyze dataset",
      budget: "100uclaw",
    });
    await chainAgentHandlers["chain.agents.delegate"](opts);

    expect(opts.respond).toHaveBeenCalledWith(true, {
      transactionHash: "AABB11",
      height: 500,
      code: 0,
      success: true,
      taskId: "task-99",
      assignee: "claw1worker",
    });
  });

  it("returns error when assignee is missing", async () => {
    const opts = makeOpts("chain.agents.delegate", {
      description: "Do something",
    });
    await chainAgentHandlers["chain.agents.delegate"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      message: "assignee is required",
    }));
  });

  it("returns error when description is missing", async () => {
    const opts = makeOpts("chain.agents.delegate", {
      assignee: "claw1worker",
    });
    await chainAgentHandlers["chain.agents.delegate"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      message: "description is required",
    }));
  });

  it("returns error when agent is not connected", async () => {
    mockGetBlockchainAgent.mockReturnValue(null);
    mockGetBlockchainAddress.mockReturnValue(null);

    const opts = makeOpts("chain.agents.delegate", {
      assignee: "claw1worker",
      description: "Do something",
    });
    await chainAgentHandlers["chain.agents.delegate"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      message: expect.stringContaining("not connected"),
    }));
  });

  it("reports failed tx with success=false", async () => {
    mockGetBlockchainAddress.mockReturnValue("claw1me");
    mockGetBlockchainAgent.mockReturnValue({
      client: {
        delegateTask: vi.fn().mockResolvedValue({
          transactionHash: "CCDD22",
          height: 501,
          code: 5,
          rawLog: "insufficient funds",
        }),
      },
    });

    const opts = makeOpts("chain.agents.delegate", {
      assignee: "claw1worker",
      description: "Task",
    });
    await chainAgentHandlers["chain.agents.delegate"](opts);

    expect(opts.respond).toHaveBeenCalledWith(true, expect.objectContaining({
      code: 5,
      success: false,
    }));
  });
});

// ---------------------------------------------------------------------------
// chain.agents.reputation
// ---------------------------------------------------------------------------

describe("chain.agents.reputation handler", () => {
  it("returns reputation data from LCD", async () => {
    mockFetchJson({
      reputation: {
        score: 92,
        total_ratings: 50,
        avg_rating: 4.6,
        endorsements: 12,
      },
    });

    const opts = makeOpts("chain.agents.reputation", { address: "claw1abc" });
    await chainAgentHandlers["chain.agents.reputation"](opts);

    expect(opts.respond).toHaveBeenCalledWith(true, {
      address: "claw1abc",
      reputation: {
        score: 92,
        totalRatings: 50,
        avgRating: 4.6,
        endorsements: 12,
      },
    });
  });

  it("returns defaults when reputation data is empty", async () => {
    mockFetchJson({});

    const opts = makeOpts("chain.agents.reputation", { address: "claw1new" });
    await chainAgentHandlers["chain.agents.reputation"](opts);

    expect(opts.respond).toHaveBeenCalledWith(true, {
      address: "claw1new",
      reputation: {
        score: 0,
        totalRatings: 0,
        avgRating: 0,
        endorsements: 0,
      },
    });
  });

  it("returns error when address is missing", async () => {
    const opts = makeOpts("chain.agents.reputation", {});
    await chainAgentHandlers["chain.agents.reputation"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      message: "address is required",
    }));
  });

  it("responds with error when LCD request fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));

    const opts = makeOpts("chain.agents.reputation", { address: "claw1abc" });
    await chainAgentHandlers["chain.agents.reputation"](opts);

    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.objectContaining({
      code: expect.any(String),
    }));
  });
});
