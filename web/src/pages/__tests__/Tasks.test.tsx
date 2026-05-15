import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Tasks from "../Tasks";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

vi.mock("../../lib/config.ts", () => ({
  chainConfig: {
    chainId: "clawchain",
    chainName: "ClawChain",
    bech32Prefix: "claw",
    coinDenom: "CLAW",
    coinMinimalDenom: "uclaw",
    coinDecimals: 6,
    gasPrice: "0.025uclaw",
    restEndpoint: "http://localhost:1317",
    rpcEndpoint: "http://localhost:26657",
    faucetEndpoint: "http://localhost:8888",
    walletUrl: "http://localhost:3001",
  },
}));

vi.mock("../../lib/chain.ts", () => ({
  formatClaw: vi.fn((v: string) => {
    const n = BigInt(v || "0");
    return `${n / 1_000_000n} CLAW`;
  }),
  shortAddr: vi.fn((addr: string) =>
    addr.length > 16 ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : addr,
  ),
}));

vi.mock("../../lib/wallet.ts", () => ({
  isKeplrAvailable: vi.fn(() => false),
  connectKeplr: vi.fn(),
  signAndBroadcast: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    delegator: "claw1delegator_addr_long_enough_to_truncate_test",
    assignee: "claw1assignee_addr_long_enough_to_truncate_test",
    description: "Run inference on dataset",
    budget: { amount: "5000000", denom: "uclaw" },
    status: "pending",
    deadline: Math.floor(Date.now() / 1000) + 86400,
    quality_tier: "standard",
    created_at: Math.floor(Date.now() / 1000) - 3600,
    completed_at: 0,
    result: "",
    ...overrides,
  };
}

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    action: "task_delegated",
    task_id: "1",
    actor: "claw1actor_addr_long_enough_to_truncate_test0",
    timestamp: Math.floor(Date.now() / 1000) - 600,
    description: "Agent delegated a task",
    ...overrides,
  };
}

function makeAgentStats(overrides: Record<string, unknown> = {}) {
  return {
    agent_address: "claw1assignee_addr_long_enough_to_truncate_test",
    intents_submitted: 20,
    intents_responded: 15,
    intents_finalized: 12,
    intents_cancelled: 3,
    last_active_height: 50000,
    last_active_time: Math.floor(Date.now() / 1000) - 300,
    ...overrides,
  };
}

function makeReputation(overrides: Record<string, unknown> = {}) {
  return {
    agent_address: "claw1assignee_addr_long_enough_to_truncate_test",
    total_ratings: 8,
    rating_sum: 640,
    avg_rating_bps: 8000,
    endorsement_count: 3,
    ...overrides,
  };
}

function makeAgentInfo(overrides: Record<string, unknown> = {}) {
  return {
    address: "claw1assignee_addr_long_enough_to_truncate_test",
    name: "TestAgent",
    endpoint: "http://agent.local",
    active: true,
    pubkey: "abc123",
    supported_tools: ["inference", "classify"],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function renderTasks() {
  return render(
    <MemoryRouter>
      <Tasks />
    </MemoryRouter>,
  );
}

function mockFetchResponses(opts: {
  activity?: unknown[];
  delegated?: unknown[];
  assigned?: unknown[];
  task?: unknown | null;
  agentStats?: unknown | null;
  reputation?: unknown | null;
  agentInfo?: unknown | null;
} = {}) {
  const {
    activity = [],
    delegated = [],
    assigned = [],
    task = null,
    agentStats = null,
    reputation = null,
    agentInfo = null,
  } = opts;

  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("recent_activity")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ activities: activity }),
      });
    }
    if (typeof url === "string" && url.includes("tasks_by_delegator")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: delegated }),
      });
    }
    if (typeof url === "string" && url.includes("tasks_by_assignee")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ tasks: assigned }),
      });
    }
    if (typeof url === "string" && url.includes("/task/")) {
      return Promise.resolve({
        ok: task !== null,
        json: () => Promise.resolve({ task }),
      });
    }
    if (typeof url === "string" && url.includes("/stats/")) {
      return Promise.resolve({
        ok: agentStats !== null,
        json: () => Promise.resolve({ stats: agentStats }),
      });
    }
    if (typeof url === "string" && url.includes("/reputation/")) {
      return Promise.resolve({
        ok: reputation !== null,
        json: () => Promise.resolve({ reputation }),
      });
    }
    if (typeof url === "string" && url.includes("/agent/") && !url.includes("/v1/task/")) {
      return Promise.resolve({
        ok: agentInfo !== null,
        json: () => Promise.resolve({ agent: agentInfo }),
      });
    }
    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({}),
    });
  });
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("Tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockFetchResponses();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Renders page title and tab buttons
  it("renders page title and tab buttons", async () => {
    renderTasks();

    expect(screen.getByText("Task Delegation")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Delegated/)).toBeInTheDocument();
      expect(screen.getByText(/Assigned/)).toBeInTheDocument();
    });
  });

  // 2. Shows address lookup form
  it("shows address lookup form with input and Lookup button", () => {
    renderTasks();

    expect(
      screen.getByPlaceholderText("Enter your claw... address to view tasks"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lookup" }),
    ).toBeInTheDocument();
  });

  // 3. Overview tab shows prompt when no address entered
  it("overview tab shows prompt when no address is entered", async () => {
    mockFetchResponses({ activity: [] });
    renderTasks();

    await waitFor(() => {
      expect(
        screen.getByText(/enter your address above/i),
      ).toBeInTheDocument();
    });
  });

  // 4. Overview tab shows stats after address lookup
  it("overview tab shows stats after address lookup", async () => {
    const tasks = [
      makeTask({ id: "1", status: "pending" }),
      makeTask({ id: "2", status: "accepted" }),
      makeTask({ id: "3", status: "completed" }),
    ];
    mockFetchResponses({ activity: [], delegated: tasks, assigned: [] });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await waitFor(() => {
      expect(screen.getByText("Total Tasks")).toBeInTheDocument();
    });

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  // 5. Delegated tab shows task table
  it("delegated tab shows task table with task data", async () => {
    const tasks = [
      makeTask({ id: "42", description: "Train model", status: "pending" }),
    ];
    mockFetchResponses({ activity: [], delegated: tasks, assigned: [] });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    // Switch to Delegated tab
    await waitFor(() => {
      expect(screen.getByText(/Delegated/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#42")).toBeInTheDocument();
    });

    expect(screen.getByText("Train model")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  // 6. Assigned tab shows tasks with action buttons
  it("assigned tab shows tasks with Accept button for pending tasks", async () => {
    const assigned = [
      makeTask({ id: "10", description: "Classify images", status: "pending" }),
    ];
    mockFetchResponses({ activity: [], delegated: [], assigned });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    // Switch to Assigned tab
    await waitFor(() => {
      expect(screen.getByText(/Assigned/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/Assigned/));

    await waitFor(() => {
      expect(screen.getByText("#10")).toBeInTheDocument();
    });

    expect(screen.getByText("Classify images")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
  });

  // 7. Assigned tab shows Complete button for accepted tasks
  it("assigned tab shows Complete button for accepted tasks", async () => {
    const assigned = [
      makeTask({ id: "11", description: "Process data", status: "accepted" }),
    ];
    mockFetchResponses({ activity: [], delegated: [], assigned });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Assigned/));

    await waitFor(() => {
      expect(screen.getByText("#11")).toBeInTheDocument();
    });

    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  // 8. Tab switching works correctly
  it("switches between tabs correctly", async () => {
    mockFetchResponses({ activity: [makeActivity()] });
    renderTasks();

    const user = userEvent.setup();

    // Default tab is overview, should show Recent Activity
    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    });

    // Switch to Delegated
    await user.click(screen.getByText(/Delegated/));
    await waitFor(() => {
      expect(
        screen.getByText("Enter your address above to view delegated tasks."),
      ).toBeInTheDocument();
    });

    // Switch to Assigned
    await user.click(screen.getByText(/Assigned/));
    await waitFor(() => {
      expect(
        screen.getByText("Enter your address above to view assigned tasks."),
      ).toBeInTheDocument();
    });

    // Switch back to Overview
    await user.click(screen.getByText("Overview"));
    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    });
  });

  // 9. Empty delegated tasks shows message
  it("shows empty message when no delegated tasks exist", async () => {
    mockFetchResponses({ activity: [], delegated: [], assigned: [] });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(
        screen.getByText("No delegated tasks found for this address."),
      ).toBeInTheDocument();
    });
  });

  // 10. Recent activity renders on overview tab
  it("shows recent activity entries on overview tab", async () => {
    const activities = [
      makeActivity({ action: "task_delegated", task_id: "5", description: "Agent delegated task #5" }),
      makeActivity({ action: "task_completed", task_id: "3", description: "Agent completed task #3" }),
    ];
    mockFetchResponses({ activity: activities });

    renderTasks();

    await waitFor(() => {
      expect(screen.getByText("task_delegated")).toBeInTheDocument();
      expect(screen.getByText("task_completed")).toBeInTheDocument();
    });

    expect(screen.getByText("#5")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  // 11. Status badges show correct text
  it("shows status badges with correct status text", async () => {
    const tasks = [
      makeTask({ id: "1", status: "pending" }),
      makeTask({ id: "2", status: "completed" }),
      makeTask({ id: "3", status: "accepted" }),
    ];
    mockFetchResponses({ activity: [], delegated: tasks, assigned: [] });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("pending")).toBeInTheDocument();
      expect(screen.getByText("completed")).toBeInTheDocument();
      expect(screen.getByText("accepted")).toBeInTheDocument();
    });
  });

  // 12. No Keplr button shows when wallet not available
  it("shows No Keplr button when wallet extension is not available", () => {
    renderTasks();

    expect(
      screen.getByRole("button", { name: "No Keplr" }),
    ).toBeInTheDocument();
  });

  // 13. Overview tab shows Failed/Expired stat card
  it("overview tab shows failed/expired count after lookup", async () => {
    const tasks = [
      makeTask({ id: "1", status: "failed" }),
      makeTask({ id: "2", status: "expired" }),
      makeTask({ id: "3", status: "completed" }),
    ];
    mockFetchResponses({ activity: [], delegated: tasks, assigned: [] });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await waitFor(() => {
      expect(screen.getByText("Failed/Expired")).toBeInTheDocument();
    });
  });

  // 14. Task detail shows status stepper
  it("task detail view shows the execution pipeline stepper", async () => {
    const task = makeTask({
      id: "50",
      status: "accepted",
      result: "",
    });
    mockFetchResponses({
      activity: [],
      delegated: [task],
      assigned: [],
      task,
      agentStats: makeAgentStats(),
      reputation: makeReputation(),
      agentInfo: makeAgentInfo(),
    });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#50")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#50"));

    await waitFor(() => {
      expect(screen.getByText("Execution Pipeline")).toBeInTheDocument();
      expect(screen.getByTestId("task-status-stepper")).toBeInTheDocument();
    });
  });

  // 15. Task detail shows checkpoint progress when checkpoints exist
  it("task detail shows checkpoint progress bar when task has checkpoints", async () => {
    const task = makeTask({
      id: "60",
      status: "in_progress",
      checkpoints: [
        { index: 0, label: "Data loaded", completed: true, timestamp: Math.floor(Date.now() / 1000) - 1800 },
        { index: 1, label: "Model trained", completed: true, timestamp: Math.floor(Date.now() / 1000) - 900 },
        { index: 2, label: "Evaluation done", completed: false, timestamp: 0 },
      ],
    });
    mockFetchResponses({
      activity: [],
      delegated: [task],
      assigned: [],
      task,
      agentStats: makeAgentStats(),
      reputation: makeReputation(),
      agentInfo: makeAgentInfo(),
    });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#60")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#60"));

    await waitFor(() => {
      expect(screen.getByTestId("checkpoint-progress")).toBeInTheDocument();
    });

    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
    expect(screen.getByText("Data loaded")).toBeInTheDocument();
    expect(screen.getByText("Model trained")).toBeInTheDocument();
    expect(screen.getByText("Evaluation done")).toBeInTheDocument();
  });

  // 16. Task detail shows agent performance card
  it("task detail shows agent performance stats when agent data available", async () => {
    const task = makeTask({
      id: "70",
      status: "completed",
      completed_at: Math.floor(Date.now() / 1000) - 120,
      result: '{"accuracy": 0.95}',
    });
    mockFetchResponses({
      activity: [],
      delegated: [task],
      assigned: [],
      task,
      agentStats: makeAgentStats(),
      reputation: makeReputation(),
      agentInfo: makeAgentInfo(),
    });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#70")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#70"));

    await waitFor(() => {
      expect(screen.getByTestId("agent-performance")).toBeInTheDocument();
    });

    expect(screen.getByText("Completion Rate")).toBeInTheDocument();
    expect(screen.getByText("Tasks Finalized")).toBeInTheDocument();
    expect(screen.getByText("Tasks Cancelled")).toBeInTheDocument();
  });

  // 17. Task detail shows collapsible result viewer for completed tasks
  it("task detail shows collapsible result viewer when task has result", async () => {
    const task = makeTask({
      id: "80",
      status: "completed",
      completed_at: Math.floor(Date.now() / 1000) - 60,
      result: '{"accuracy": 0.95, "model": "gpt-claw"}',
    });
    mockFetchResponses({
      activity: [],
      delegated: [task],
      assigned: [],
      task,
      agentStats: makeAgentStats(),
      reputation: makeReputation(),
      agentInfo: makeAgentInfo(),
    });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#80")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#80"));

    await waitFor(() => {
      expect(screen.getByTestId("task-result-viewer")).toBeInTheDocument();
    });

    // Result should be collapsed initially (no pre visible)
    expect(screen.queryByText(/"accuracy"/)).not.toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByText(/Task Result/));

    await waitFor(() => {
      expect(screen.getByText(/"accuracy"/)).toBeInTheDocument();
    });
  });

  // 18. Assigned tab shows Complete button for in_progress tasks
  it("assigned tab shows Complete button for in_progress tasks", async () => {
    const assigned = [
      makeTask({ id: "15", description: "Process batch", status: "in_progress" }),
    ];
    mockFetchResponses({ activity: [], delegated: [], assigned });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Assigned/));

    await waitFor(() => {
      expect(screen.getByText("#15")).toBeInTheDocument();
    });

    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  // 19. In_progress status badge renders correctly
  it("shows in_progress status badge in delegated table", async () => {
    const tasks = [
      makeTask({ id: "1", status: "in_progress" }),
    ];
    mockFetchResponses({ activity: [], delegated: tasks, assigned: [] });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("in_progress")).toBeInTheDocument();
    });
  });

  // 20. Failed status shows terminal error in stepper
  it("task detail stepper shows failed state for failed tasks", async () => {
    const task = makeTask({
      id: "90",
      status: "failed",
      result: "error: model load failed",
    });
    mockFetchResponses({
      activity: [],
      delegated: [task],
      assigned: [],
      task,
      agentStats: makeAgentStats(),
      reputation: makeReputation(),
      agentInfo: makeAgentInfo(),
    });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#90")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#90"));

    await waitFor(() => {
      expect(screen.getByText("Task Failed")).toBeInTheDocument();
    });
  });

  // 21. Task result viewer does not show when result is empty
  it("task detail does not show result viewer when result is empty", async () => {
    const task = makeTask({
      id: "100",
      status: "accepted",
      result: "",
    });
    mockFetchResponses({
      activity: [],
      delegated: [task],
      assigned: [],
      task,
      agentStats: makeAgentStats(),
      reputation: makeReputation(),
      agentInfo: makeAgentInfo(),
    });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#100")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#100"));

    await waitFor(() => {
      expect(screen.getByTestId("task-status-stepper")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("task-result-viewer")).not.toBeInTheDocument();
  });

  // 22. Checkpoint progress not shown when no checkpoints exist
  it("task detail does not show checkpoint progress when there are no checkpoints", async () => {
    const task = makeTask({
      id: "110",
      status: "accepted",
    });
    mockFetchResponses({
      activity: [],
      delegated: [task],
      assigned: [],
      task,
      agentStats: makeAgentStats(),
      reputation: makeReputation(),
      agentInfo: makeAgentInfo(),
    });

    renderTasks();

    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(
      "Enter your claw... address to view tasks",
    );
    await user.type(input, "claw1testaddr00000000000000000000000000000000");
    await user.click(screen.getByRole("button", { name: "Lookup" }));

    await user.click(screen.getByText(/Delegated/));

    await waitFor(() => {
      expect(screen.getByText("#110")).toBeInTheDocument();
    });

    await user.click(screen.getByText("#110"));

    await waitFor(() => {
      expect(screen.getByTestId("task-status-stepper")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("checkpoint-progress")).not.toBeInTheDocument();
  });
});
