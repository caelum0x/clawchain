import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";
import { shortAddr, formatClaw } from "../lib/chain.ts";
import { chainConfig } from "../lib/config.ts";
import {
  isKeplrAvailable,
  connectKeplr,
  signAndBroadcast,
  WalletState,
} from "../lib/wallet.ts";

// --- Types ---

interface TaskBudget {
  amount: string;
  denom: string;
}

interface TaskCheckpoint {
  index: number;
  label: string;
  completed: boolean;
  timestamp: number;
}

interface Task {
  id: string;
  delegator: string;
  assignee: string;
  description: string;
  budget: TaskBudget;
  status: string;
  deadline: number;
  quality_tier: string;
  created_at: number;
  completed_at: number;
  result: string;
  checkpoints?: TaskCheckpoint[];
}

interface ActivityEntry {
  action: string;
  task_id: string;
  actor: string;
  timestamp: number;
  description: string;
}

interface AgentPerformance {
  address: string;
  name: string;
  intentsSubmitted: number;
  intentsResponded: number;
  intentsFinalized: number;
  intentsCancelled: number;
  lastActiveTime: number;
  totalRatings: number;
  avgRatingBps: number;
}

type Tab = "overview" | "delegated" | "assigned" | "detail";

// --- Status pipeline ---

const STATUS_STEPS = ["pending", "accepted", "in_progress", "completed"] as const;

function stepIndex(status: string): number {
  const s = status.toLowerCase();
  if (s === "failed" || s === "expired") return -1;
  const idx = STATUS_STEPS.indexOf(s as typeof STATUS_STEPS[number]);
  return idx >= 0 ? idx : 0;
}

// --- Helpers ---

const REST = chainConfig.restEndpoint;

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "pending":
      return "#eab308";
    case "accepted":
      return "#3b82f6";
    case "in_progress":
      return "#a855f7";
    case "completed":
      return "#22c55e";
    case "failed":
      return "#ef4444";
    case "expired":
      return "#ef4444";
    default:
      return "var(--text2)";
  }
}

function statusBg(status: string): string {
  switch (status.toLowerCase()) {
    case "pending":
      return "rgba(234,179,8,0.15)";
    case "accepted":
      return "rgba(59,130,246,0.15)";
    case "in_progress":
      return "rgba(168,85,247,0.15)";
    case "completed":
      return "rgba(34,197,94,0.15)";
    case "failed":
      return "rgba(239,68,68,0.15)";
    case "expired":
      return "rgba(239,68,68,0.15)";
    default:
      return "rgba(255,255,255,0.08)";
  }
}

function formatTimestamp(ts: number): string {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function formatDeadline(ts: number): string {
  if (!ts) return "-";
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = d.getTime() - now;
  if (diff < 0) return `${d.toLocaleDateString()} (expired)`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h remaining`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h remaining`;
}

function formatBudget(budget: TaskBudget): string {
  if (!budget || !budget.amount) return "0 CLAW";
  if (budget.denom === "uclaw") return formatClaw(budget.amount);
  return `${budget.amount} ${budget.denom}`;
}

function isJsonString(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

// --- API functions ---

async function fetchTasksByDelegator(address: string): Promise<Task[]> {
  try {
    const resp = await fetch(
      `${REST}/clawchain/agent/v1/tasks_by_delegator/${address}`
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.tasks ?? []).map(parseTask);
  } catch {
    return [];
  }
}

async function fetchTasksByAssignee(address: string): Promise<Task[]> {
  try {
    const resp = await fetch(
      `${REST}/clawchain/agent/v1/tasks_by_assignee/${address}`
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.tasks ?? []).map(parseTask);
  } catch {
    return [];
  }
}

async function fetchTask(id: string): Promise<Task | null> {
  try {
    const resp = await fetch(`${REST}/clawchain/agent/v1/task/${id}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    return parseTask(data.task ?? data);
  } catch {
    return null;
  }
}

async function fetchRecentActivity(): Promise<ActivityEntry[]> {
  try {
    const resp = await fetch(`${REST}/clawchain/agent/v1/recent_activity`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.activities ?? data.activity ?? []).map((a: any) => ({
      action: a.action ?? "",
      task_id: a.task_id ?? a.taskId ?? "",
      actor: a.actor ?? a.address ?? "",
      timestamp: a.timestamp ?? a.created_at ?? 0,
      description: a.description ?? "",
    }));
  } catch {
    return [];
  }
}

async function fetchAgentPerformance(
  address: string
): Promise<AgentPerformance | null> {
  try {
    const [statsResp, reputationResp, agentResp] = await Promise.all([
      fetch(`${REST}/clawchain/agent/v1/stats/${address}`).catch(() => null),
      fetch(`${REST}/clawchain/reputation/v1/reputation/${address}`).catch(
        () => null
      ),
      fetch(`${REST}/clawchain/agent/v1/agent/${address}`).catch(() => null),
    ]);

    const stats =
      statsResp && statsResp.ok ? await statsResp.json() : { stats: {} };
    const reputation =
      reputationResp && reputationResp.ok
        ? await reputationResp.json()
        : { reputation: {} };
    const agent =
      agentResp && agentResp.ok ? await agentResp.json() : { agent: {} };

    const s = stats.stats ?? stats;
    const r = reputation.reputation ?? reputation;
    const a = agent.agent ?? agent;

    return {
      address,
      name: a.name ?? a.agent_name ?? "",
      intentsSubmitted: Number(s.intents_submitted ?? s.intentsSubmitted ?? 0),
      intentsResponded: Number(s.intents_responded ?? s.intentsResponded ?? 0),
      intentsFinalized: Number(s.intents_finalized ?? s.intentsFinalized ?? 0),
      intentsCancelled: Number(s.intents_cancelled ?? s.intentsCancelled ?? 0),
      lastActiveTime: Number(
        s.last_active_time ?? s.lastActiveTime ?? 0
      ),
      totalRatings: Number(r.total_ratings ?? r.totalRatings ?? 0),
      avgRatingBps: Number(r.avg_rating_bps ?? r.avgRatingBps ?? 0),
    };
  } catch {
    return null;
  }
}

function parseTask(t: any): Task {
  const budget = t.budget ?? {};
  const rawCheckpoints = t.checkpoints ?? t.checkpoint_list ?? [];
  const checkpoints: TaskCheckpoint[] = Array.isArray(rawCheckpoints)
    ? rawCheckpoints.map((cp: any, i: number) => ({
        index: cp.index ?? i,
        label: cp.label ?? cp.description ?? `Checkpoint ${i + 1}`,
        completed: cp.completed ?? cp.done ?? false,
        timestamp: cp.timestamp ?? cp.completed_at ?? 0,
      }))
    : [];

  return {
    id: t.id ?? t.task_id ?? "0",
    delegator: t.delegator ?? t.delegator_address ?? "",
    assignee: t.assignee ?? t.assignee_address ?? "",
    description: t.description ?? "",
    budget: {
      amount: budget.amount ?? t.budget_amount ?? "0",
      denom: budget.denom ?? t.budget_denom ?? "uclaw",
    },
    status: t.status ?? "unknown",
    deadline: t.deadline ?? 0,
    quality_tier: t.quality_tier ?? t.qualityTier ?? "",
    created_at: t.created_at ?? t.createdAt ?? 0,
    completed_at: t.completed_at ?? t.completedAt ?? 0,
    result: t.result ?? "",
    checkpoints: checkpoints.length > 0 ? checkpoints : undefined,
  };
}

// --- Sub-components ---

function TaskStatusStepper({ status }: { status: string }) {
  const current = stepIndex(status);
  const isFailed = status.toLowerCase() === "failed";
  const isExpired = status.toLowerCase() === "expired";
  const isTerminalError = isFailed || isExpired;

  return (
    <div data-testid="task-status-stepper" style={{ marginTop: "1.5rem" }}>
      <h4 style={{ marginBottom: "0.75rem" }}>Execution Pipeline</h4>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          position: "relative",
        }}
      >
        {STATUS_STEPS.map((step, i) => {
          const isActive = i === current;
          const isComplete = !isTerminalError && i < current;
          const isPast = isComplete || isActive;
          const dotColor = isActive
            ? statusColor(step)
            : isComplete
            ? "#22c55e"
            : "rgba(255,255,255,0.2)";
          const labelColor = isPast ? "var(--text1)" : "var(--text2)";

          return (
            <div
              key={step}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
              }}
            >
              {/* Connector line before dot */}
              {i > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "50%",
                    width: "100%",
                    height: "3px",
                    background: isComplete || isActive
                      ? statusColor(STATUS_STEPS[Math.min(i, current)])
                      : "rgba(255,255,255,0.1)",
                    zIndex: 0,
                  }}
                />
              )}
              {/* Dot */}
              <div
                style={{
                  width: isActive ? "26px" : "20px",
                  height: isActive ? "26px" : "20px",
                  borderRadius: "50%",
                  background: dotColor,
                  border: isActive
                    ? `3px solid ${statusColor(step)}`
                    : "2px solid transparent",
                  boxShadow: isActive
                    ? `0 0 8px ${statusColor(step)}50`
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1,
                  transition: "all 0.2s ease",
                }}
              >
                {isComplete && (
                  <span style={{ color: "#fff", fontSize: "11px", fontWeight: 700 }}>
                    &#10003;
                  </span>
                )}
              </div>
              {/* Label */}
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: isActive ? 700 : 500,
                  color: labelColor,
                  textTransform: "capitalize",
                }}
              >
                {step.replace("_", " ")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Terminal error state */}
      {isTerminalError && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
            fontSize: "0.85rem",
            fontWeight: 600,
            display: "inline-block",
          }}
        >
          {isFailed ? "Task Failed" : "Task Expired"}
        </div>
      )}
    </div>
  );
}

function CheckpointProgress({
  checkpoints,
}: {
  checkpoints: TaskCheckpoint[];
}) {
  const total = checkpoints.length;
  const completed = checkpoints.filter((c) => c.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div data-testid="checkpoint-progress" style={{ marginTop: "1.5rem" }}>
      <h4 style={{ marginBottom: "0.75rem" }}>
        Checkpoint Progress ({completed}/{total})
      </h4>

      {/* Progress bar */}
      <div
        style={{
          width: "100%",
          height: "10px",
          borderRadius: "5px",
          background: "rgba(255,255,255,0.1)",
          overflow: "hidden",
          marginBottom: "1rem",
        }}
      >
        <div
          data-testid="checkpoint-bar"
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: "5px",
            background:
              percent === 100
                ? "#22c55e"
                : "linear-gradient(90deg, #3b82f6, #a855f7)",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Checkpoint list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {checkpoints.map((cp) => (
          <div
            key={cp.index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.375rem 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "4px",
                background: cp.completed
                  ? "rgba(34,197,94,0.2)"
                  : "rgba(255,255,255,0.08)",
                border: cp.completed
                  ? "1.5px solid #22c55e"
                  : "1.5px solid rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: "10px",
                color: "#22c55e",
              }}
            >
              {cp.completed ? "\u2713" : ""}
            </div>
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontWeight: 500,
                  color: cp.completed ? "var(--text1)" : "var(--text2)",
                }}
              >
                {cp.label}
              </span>
            </div>
            {cp.completed && cp.timestamp > 0 && (
              <div style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                {formatTimestamp(cp.timestamp)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentPerformanceCard({
  perf,
}: {
  perf: AgentPerformance;
}) {
  const totalIntents =
    perf.intentsSubmitted +
    perf.intentsResponded +
    perf.intentsFinalized +
    perf.intentsCancelled;
  const completionRate =
    totalIntents > 0
      ? Math.round((perf.intentsFinalized / Math.max(1, perf.intentsFinalized + perf.intentsCancelled)) * 100)
      : 0;
  const avgRating = perf.avgRatingBps > 0 ? (perf.avgRatingBps / 100).toFixed(1) : null;

  return (
    <div data-testid="agent-performance" style={{ marginTop: "1.5rem" }}>
      <h4 style={{ marginBottom: "0.75rem" }}>
        Agent Performance
        {perf.name && (
          <span
            style={{
              marginLeft: "0.5rem",
              fontWeight: 400,
              fontSize: "0.85rem",
              color: "var(--text2)",
            }}
          >
            ({perf.name})
          </span>
        )}
      </h4>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: "0.25rem" }}
          >
            Completion Rate
          </div>
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: completionRate >= 80 ? "#22c55e" : completionRate >= 50 ? "#eab308" : "#ef4444",
            }}
          >
            {completionRate}%
          </div>
        </div>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: "0.25rem" }}
          >
            Tasks Finalized
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            {perf.intentsFinalized}
          </div>
        </div>

        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: "0.25rem" }}
          >
            Tasks Cancelled
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#ef4444" }}>
            {perf.intentsCancelled}
          </div>
        </div>

        {avgRating !== null && (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text2)",
                marginBottom: "0.25rem",
              }}
            >
              Avg Rating
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#eab308" }}>
              {avgRating}/100
            </div>
          </div>
        )}

        {perf.totalRatings > 0 && (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text2)",
                marginBottom: "0.25rem",
              }}
            >
              Total Ratings
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              {perf.totalRatings}
            </div>
          </div>
        )}

        {perf.lastActiveTime > 0 && (
          <div
            style={{
              padding: "0.75rem",
              borderRadius: "0.5rem",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text2)",
                marginBottom: "0.25rem",
              }}
            >
              Last Active
            </div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {formatTimestamp(perf.lastActiveTime)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskResultViewer({ result }: { result: string }) {
  const [expanded, setExpanded] = useState(false);
  const isJson = isJsonString(result);
  const formatted = isJson ? tryFormatJson(result) : result;

  return (
    <div data-testid="task-result-viewer" style={{ marginTop: "1.5rem" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontSize: "1rem",
          fontWeight: 600,
          color: "var(--text1)",
          marginBottom: expanded ? "0.75rem" : 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            fontSize: "0.8rem",
          }}
        >
          &#9654;
        </span>
        Task Result {isJson && <span style={{ fontSize: "0.75rem", color: "var(--text2)", fontWeight: 400 }}>(JSON)</span>}
      </button>

      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.3)",
            padding: "1rem",
            borderRadius: "0.5rem",
            border: "1px solid rgba(255,255,255,0.08)",
            maxHeight: "400px",
            overflow: "auto",
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: "monospace",
              fontSize: "0.85rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              color: isJson ? "#a5f3fc" : "var(--text1)",
              lineHeight: 1.5,
            }}
          >
            {formatted}
          </pre>
        </div>
      )}
    </div>
  );
}

// --- Component ---

export default function Tasks() {
  useDocTitle("Tasks");
  const { id: routeId } = useParams<{ id: string }>();

  const [tab, setTab] = useState<Tab>(routeId ? "detail" : "overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Address state
  const [addressInput, setAddressInput] = useState("");
  const [userAddress, setUserAddress] = useState("");

  // Data state
  const [delegatedTasks, setDelegatedTasks] = useState<Task[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [agentPerf, setAgentPerf] = useState<AgentPerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Wallet state
  const [wallet, setWallet] = useState<WalletState | null>(null);

  // New task form
  const [showNewTask, setShowNewTask] = useState(false);
  const [newAssignee, setNewAssignee] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [newDeadlineHours, setNewDeadlineHours] = useState("24");
  const [newQualityTier, setNewQualityTier] = useState("standard");
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Action status
  const [actionStatus, setActionStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Load recent activity on mount
  useEffect(() => {
    loadRecentActivity();
  }, []);

  // If route has an id, load task detail
  useEffect(() => {
    if (routeId) {
      setTab("detail");
      loadTaskDetail(routeId);
    }
  }, [routeId]);

  // Load user data when address changes
  useEffect(() => {
    if (userAddress) {
      loadUserTasks(userAddress);
    }
  }, [userAddress]);

  // Load agent performance when detail task changes
  useEffect(() => {
    if (detailTask?.assignee) {
      loadAgentPerformance(detailTask.assignee);
    } else {
      setAgentPerf(null);
    }
  }, [detailTask?.assignee]);

  async function loadRecentActivity() {
    const activity = await fetchRecentActivity();
    setRecentActivity(activity.slice(0, 10));
  }

  async function loadUserTasks(address: string) {
    setLoading(true);
    setError(null);
    try {
      const [delegated, assigned] = await Promise.all([
        fetchTasksByDelegator(address),
        fetchTasksByAssignee(address),
      ]);
      setDelegatedTasks(delegated);
      setAssignedTasks(assigned);
    } catch {
      setError("Failed to load tasks for this address.");
    }
    setLoading(false);
  }

  async function loadTaskDetail(taskId: string) {
    setLoading(true);
    setError(null);
    const task = await fetchTask(taskId);
    if (task) {
      setDetailTask(task);
    } else {
      setError(`Task #${taskId} not found.`);
    }
    setLoading(false);
  }

  async function loadAgentPerformance(address: string) {
    setPerfLoading(true);
    const perf = await fetchAgentPerformance(address);
    setAgentPerf(perf);
    setPerfLoading(false);
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = addressInput.trim();
    if (trimmed) {
      setUserAddress(trimmed);
    }
  }

  function handleViewTask(taskId: string) {
    setTab("detail");
    loadTaskDetail(taskId);
  }

  function handleBackToList() {
    setDetailTask(null);
    setAgentPerf(null);
    setTab("delegated");
  }

  async function handleConnect() {
    try {
      const state = await connectKeplr();
      setWallet(state);
      setAddressInput(state.address);
      setUserAddress(state.address);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleNewTaskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet?.address) return;
    setSubmitting(true);
    setSubmitStatus(null);

    try {
      const budgetUclaw = String(
        Math.floor(parseFloat(newBudget) * 1_000_000)
      );
      const deadlineTimestamp = Math.floor(
        Date.now() / 1000 + parseInt(newDeadlineHours) * 3600
      );

      const msg = {
        type: "clawchain/agent/MsgDelegateTask",
        value: {
          delegator: wallet.address,
          assignee: newAssignee,
          description: newDescription,
          budget: { amount: budgetUclaw, denom: "uclaw" },
          deadline: String(deadlineTimestamp),
          quality_tier: newQualityTier,
        },
      };

      const result = await signAndBroadcast(
        wallet.address,
        [msg],
        "Delegate task via web dashboard"
      );

      if (result.code === 0) {
        setSubmitStatus({
          type: "success",
          msg: `Task delegated! Tx: ${result.txHash}`,
        });
        setNewAssignee("");
        setNewDescription("");
        setNewBudget("");
        setNewDeadlineHours("24");
        setNewQualityTier("standard");
        setShowNewTask(false);
        if (userAddress) loadUserTasks(userAddress);
      } else {
        setSubmitStatus({
          type: "error",
          msg: `Transaction failed (code ${result.code})`,
        });
      }
    } catch (e: any) {
      setSubmitStatus({ type: "error", msg: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptTask(taskId: string) {
    if (!wallet?.address) {
      setActionStatus({
        type: "error",
        msg: "Connect your wallet first to accept tasks.",
      });
      return;
    }
    setActionStatus(null);

    try {
      const msg = {
        type: "clawchain/agent/MsgAcceptTask",
        value: {
          assignee: wallet.address,
          task_id: taskId,
        },
      };

      const result = await signAndBroadcast(
        wallet.address,
        [msg],
        `Accept task #${taskId}`
      );

      if (result.code === 0) {
        setActionStatus({
          type: "success",
          msg: `Task #${taskId} accepted! Tx: ${result.txHash}`,
        });
        if (userAddress) loadUserTasks(userAddress);
      } else {
        setActionStatus({
          type: "error",
          msg: `Transaction failed (code ${result.code})`,
        });
      }
    } catch (e: any) {
      setActionStatus({ type: "error", msg: e.message });
    }
  }

  async function handleCompleteTask(taskId: string) {
    if (!wallet?.address) {
      setActionStatus({
        type: "error",
        msg: "Connect your wallet first to complete tasks.",
      });
      return;
    }

    const resultText = prompt(
      `Enter result/proof for task #${taskId}:`,
      ""
    );
    if (resultText === null) return;

    setActionStatus(null);

    try {
      const msg = {
        type: "clawchain/agent/MsgCompleteTask",
        value: {
          assignee: wallet.address,
          task_id: taskId,
          result: resultText,
        },
      };

      const result = await signAndBroadcast(
        wallet.address,
        [msg],
        `Complete task #${taskId}`
      );

      if (result.code === 0) {
        setActionStatus({
          type: "success",
          msg: `Task #${taskId} completed! Tx: ${result.txHash}`,
        });
        if (userAddress) loadUserTasks(userAddress);
      } else {
        setActionStatus({
          type: "error",
          msg: `Transaction failed (code ${result.code})`,
        });
      }
    } catch (e: any) {
      setActionStatus({ type: "error", msg: e.message });
    }
  }

  // Derived stats
  const allTasks = [...delegatedTasks, ...assignedTasks];
  const uniqueTasks = new Map<string, Task>();
  for (const t of allTasks) uniqueTasks.set(t.id, t);
  const totalTasks = uniqueTasks.size;
  const pendingCount = [...uniqueTasks.values()].filter(
    (t) => t.status.toLowerCase() === "pending"
  ).length;
  const activeCount = [...uniqueTasks.values()].filter(
    (t) =>
      t.status.toLowerCase() === "accepted" ||
      t.status.toLowerCase() === "in_progress"
  ).length;
  const completedCount = [...uniqueTasks.values()].filter(
    (t) => t.status.toLowerCase() === "completed"
  ).length;
  const failedCount = [...uniqueTasks.values()].filter(
    (t) =>
      t.status.toLowerCase() === "failed" ||
      t.status.toLowerCase() === "expired"
  ).length;

  return (
    <div>
      <h1 className="page-title">Task Delegation</h1>
      <p className="page-subtitle">
        Delegate tasks to AI agents, track progress, and manage task completion.
      </p>

      {/* Address lookup */}
      <div
        className="card"
        style={{ marginBottom: "1.5rem", maxWidth: "600px" }}
      >
        <form
          onSubmit={handleLookup}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter your claw... address to view tasks"
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button className="btn btn-primary" type="submit">
            Lookup
          </button>
          {!wallet?.connected && (
            <button
              type="button"
              className="btn"
              onClick={handleConnect}
              disabled={!isKeplrAvailable()}
            >
              {isKeplrAvailable() ? "Connect" : "No Keplr"}
            </button>
          )}
        </form>
        {userAddress && (
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.85rem",
              color: "var(--text2)",
            }}
          >
            Viewing: <strong>{shortAddr(userAddress)}</strong>
            {wallet?.connected && " (connected)"}
          </p>
        )}
      </div>

      {error && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background: "rgba(239,68,68,0.15)",
            color: "#ef4444",
          }}
        >
          {error}
        </div>
      )}

      {actionStatus && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            background:
              actionStatus.type === "success"
                ? "rgba(34,197,94,0.15)"
                : "rgba(239,68,68,0.15)",
            color:
              actionStatus.type === "success" ? "#22c55e" : "#ef4444",
          }}
        >
          {actionStatus.msg}
        </div>
      )}

      {/* Tab buttons */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "2rem",
          flexWrap: "wrap",
        }}
      >
        <button
          className={`btn ${tab === "overview" ? "btn-primary" : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview
        </button>
        <button
          className={`btn ${tab === "delegated" ? "btn-primary" : ""}`}
          onClick={() => setTab("delegated")}
        >
          Delegated ({delegatedTasks.length})
        </button>
        <button
          className={`btn ${tab === "assigned" ? "btn-primary" : ""}`}
          onClick={() => setTab("assigned")}
        >
          Assigned ({assignedTasks.length})
        </button>
        {detailTask && (
          <button
            className={`btn ${tab === "detail" ? "btn-primary" : ""}`}
            onClick={() => setTab("detail")}
          >
            Task #{detailTask.id}
          </button>
        )}
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Loading tasks...</p>
        </div>
      )}

      {/* Overview Tab */}
      {tab === "overview" && !loading && (
        <>
          {!userAddress ? (
            <div className="card">
              <p>
                Enter your address above to view your task overview, or connect
                your wallet.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1rem",
                marginBottom: "2rem",
              }}
            >
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Total Tasks
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  {totalTasks}
                </div>
              </div>
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Pending
                </div>
                <div
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#eab308",
                  }}
                >
                  {pendingCount}
                </div>
              </div>
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Active
                </div>
                <div
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#3b82f6",
                  }}
                >
                  {activeCount}
                </div>
              </div>
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Completed
                </div>
                <div
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#22c55e",
                  }}
                >
                  {completedCount}
                </div>
              </div>
              <div className="card">
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                    marginBottom: "0.25rem",
                  }}
                >
                  Failed/Expired
                </div>
                <div
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#ef4444",
                  }}
                >
                  {failedCount}
                </div>
              </div>
            </div>
          )}

          {/* Recent Activity Feed */}
          <div className="card">
            <h3 style={{ marginBottom: "1rem" }}>Recent Activity</h3>
            {recentActivity.length === 0 ? (
              <p style={{ color: "var(--text2)" }}>
                No recent task activity found.
              </p>
            ) : (
              <div>
                {recentActivity.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.5rem 0",
                      borderBottom:
                        i < recentActivity.length - 1
                          ? "1px solid rgba(255,255,255,0.08)"
                          : "none",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {a.action}
                        {a.task_id && (
                          <>
                            {" "}
                            <span
                              style={{
                                cursor: "pointer",
                                color: "var(--accent)",
                              }}
                              onClick={() => handleViewTask(a.task_id)}
                            >
                              #{a.task_id}
                            </span>
                          </>
                        )}
                      </div>
                      <div
                        style={{ fontSize: "0.8rem", color: "var(--text2)" }}
                      >
                        {a.description}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div
                        className="mono"
                        style={{ fontSize: 12, color: "var(--text2)" }}
                      >
                        {a.actor ? shortAddr(a.actor) : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text2)" }}>
                        {formatTimestamp(a.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delegated Tab */}
      {tab === "delegated" && !loading && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
            }}
          >
            <p className="page-subtitle" style={{ margin: 0 }}>
              Tasks you have delegated to agents.
            </p>
            {wallet?.connected && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowNewTask(!showNewTask);
                  setSubmitStatus(null);
                }}
              >
                {showNewTask ? "Cancel" : "New Task"}
              </button>
            )}
          </div>

          {/* New Task Form */}
          {showNewTask && wallet?.connected && (
            <div
              className="card"
              style={{ marginBottom: "1.5rem", maxWidth: "600px" }}
            >
              <h3 style={{ marginBottom: "1rem" }}>Delegate New Task</h3>
              <form onSubmit={handleNewTaskSubmit}>
                <div style={{ marginBottom: "1rem" }}>
                  <label>Assignee Address *</label>
                  <input
                    type="text"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    placeholder="claw1..."
                    required
                    style={{ width: "100%", padding: "0.5rem" }}
                  />
                </div>
                <div style={{ marginBottom: "1rem" }}>
                  <label>Description *</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Describe the task for the agent..."
                    rows={3}
                    required
                    style={{ width: "100%", padding: "0.5rem" }}
                  />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <label>Budget (CLAW) *</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      value={newBudget}
                      onChange={(e) => setNewBudget(e.target.value)}
                      placeholder="100"
                      required
                      style={{ width: "100%", padding: "0.5rem" }}
                    />
                  </div>
                  <div>
                    <label>Deadline (hours) *</label>
                    <input
                      type="number"
                      min="1"
                      value={newDeadlineHours}
                      onChange={(e) => setNewDeadlineHours(e.target.value)}
                      required
                      style={{ width: "100%", padding: "0.5rem" }}
                    />
                  </div>
                  <div>
                    <label>Quality Tier</label>
                    <select
                      value={newQualityTier}
                      onChange={(e) => setNewQualityTier(e.target.value)}
                      style={{ width: "100%", padding: "0.5rem" }}
                    >
                      <option value="basic">Basic</option>
                      <option value="standard">Standard</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowNewTask(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Delegate Task"}
                  </button>
                </div>
              </form>

              {submitStatus && (
                <div
                  style={{
                    marginTop: "1rem",
                    padding: "0.75rem",
                    borderRadius: "0.5rem",
                    background:
                      submitStatus.type === "success"
                        ? "rgba(34,197,94,0.15)"
                        : "rgba(239,68,68,0.15)",
                    color:
                      submitStatus.type === "success"
                        ? "#22c55e"
                        : "#ef4444",
                  }}
                >
                  {submitStatus.msg}
                </div>
              )}
            </div>
          )}

          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view delegated tasks.</p>
            </div>
          ) : delegatedTasks.length === 0 ? (
            <div className="card">
              <p>No delegated tasks found for this address.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Assignee</th>
                    <th>Description</th>
                    <th>Budget</th>
                    <th>Status</th>
                    <th>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {delegatedTasks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <span
                          style={{
                            cursor: "pointer",
                            color: "var(--accent)",
                            fontWeight: 600,
                          }}
                          onClick={() => handleViewTask(t.id)}
                        >
                          #{t.id}
                        </span>
                      </td>
                      <td>
                        <Link to={`/explorer/account/${t.assignee}`}>
                          {shortAddr(t.assignee || "-")}
                        </Link>
                      </td>
                      <td>
                        <div
                          style={{
                            maxWidth: "250px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.description || "-"}
                        </div>
                      </td>
                      <td>{formatBudget(t.budget)}</td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: "9999px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: statusColor(t.status),
                            background: statusBg(t.status),
                          }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td
                        style={{ fontSize: "0.85rem", color: "var(--text2)" }}
                      >
                        {formatDeadline(t.deadline)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Assigned Tab */}
      {tab === "assigned" && !loading && (
        <>
          <p className="page-subtitle" style={{ marginBottom: "1rem" }}>
            Tasks assigned to you by delegators.
          </p>

          {!userAddress ? (
            <div className="card">
              <p>Enter your address above to view assigned tasks.</p>
            </div>
          ) : assignedTasks.length === 0 ? (
            <div className="card">
              <p>No assigned tasks found for this address.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Delegator</th>
                    <th>Description</th>
                    <th>Budget</th>
                    <th>Status</th>
                    <th>Deadline</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedTasks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <span
                          style={{
                            cursor: "pointer",
                            color: "var(--accent)",
                            fontWeight: 600,
                          }}
                          onClick={() => handleViewTask(t.id)}
                        >
                          #{t.id}
                        </span>
                      </td>
                      <td>
                        <Link to={`/explorer/account/${t.delegator}`}>
                          {shortAddr(t.delegator || "-")}
                        </Link>
                      </td>
                      <td>
                        <div
                          style={{
                            maxWidth: "250px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.description || "-"}
                        </div>
                      </td>
                      <td>{formatBudget(t.budget)}</td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: "9999px",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: statusColor(t.status),
                            background: statusBg(t.status),
                          }}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td
                        style={{ fontSize: "0.85rem", color: "var(--text2)" }}
                      >
                        {formatDeadline(t.deadline)}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {t.status.toLowerCase() === "pending" && (
                            <button
                              className="btn"
                              style={{
                                fontSize: "0.8rem",
                                color: "#3b82f6",
                              }}
                              onClick={() => handleAcceptTask(t.id)}
                            >
                              Accept
                            </button>
                          )}
                          {(t.status.toLowerCase() === "accepted" ||
                            t.status.toLowerCase() === "in_progress") && (
                            <button
                              className="btn"
                              style={{
                                fontSize: "0.8rem",
                                color: "#22c55e",
                              }}
                              onClick={() => handleCompleteTask(t.id)}
                            >
                              Complete
                            </button>
                          )}
                          {(t.status.toLowerCase() === "completed" ||
                            t.status.toLowerCase() === "expired" ||
                            t.status.toLowerCase() === "failed") && (
                            <span
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--text2)",
                              }}
                            >
                              -
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Task Detail View */}
      {tab === "detail" && !loading && (
        <>
          <button
            className="btn"
            style={{ marginBottom: "1rem" }}
            onClick={handleBackToList}
          >
            Back to Tasks
          </button>

          {!detailTask ? (
            <div className="card">
              <p>No task selected. Click a task ID to view details.</p>
            </div>
          ) : (
            <div className="card" style={{ maxWidth: "800px" }}>
              <h3 style={{ marginBottom: "1rem" }}>
                Task #{detailTask.id}
                <span
                  style={{
                    marginLeft: "0.75rem",
                    display: "inline-block",
                    padding: "2px 10px",
                    borderRadius: "9999px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: statusColor(detailTask.status),
                    background: statusBg(detailTask.status),
                    verticalAlign: "middle",
                  }}
                >
                  {detailTask.status}
                </span>
              </h3>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: "0.5rem 1rem",
                  lineHeight: 1.8,
                }}
              >
                <div style={{ color: "var(--text2)", fontWeight: 600 }}>
                  Delegator
                </div>
                <div>
                  <Link to={`/explorer/account/${detailTask.delegator}`}>
                    {detailTask.delegator || "-"}
                  </Link>
                </div>

                <div style={{ color: "var(--text2)", fontWeight: 600 }}>
                  Assignee
                </div>
                <div>
                  {detailTask.assignee ? (
                    <Link to={`/explorer/account/${detailTask.assignee}`}>
                      {detailTask.assignee}
                    </Link>
                  ) : (
                    "-"
                  )}
                </div>

                <div style={{ color: "var(--text2)", fontWeight: 600 }}>
                  Description
                </div>
                <div>{detailTask.description || "-"}</div>

                <div style={{ color: "var(--text2)", fontWeight: 600 }}>
                  Budget
                </div>
                <div>{formatBudget(detailTask.budget)}</div>

                <div style={{ color: "var(--text2)", fontWeight: 600 }}>
                  Quality Tier
                </div>
                <div>
                  {detailTask.quality_tier ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: "9999px",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        background: "rgba(139,92,246,0.15)",
                        color: "#8b5cf6",
                      }}
                    >
                      {detailTask.quality_tier}
                    </span>
                  ) : (
                    "-"
                  )}
                </div>

                <div style={{ color: "var(--text2)", fontWeight: 600 }}>
                  Deadline
                </div>
                <div>{formatDeadline(detailTask.deadline)}</div>

                <div style={{ color: "var(--text2)", fontWeight: 600 }}>
                  Created
                </div>
                <div>{formatTimestamp(detailTask.created_at)}</div>

                {detailTask.completed_at > 0 && (
                  <>
                    <div
                      style={{ color: "var(--text2)", fontWeight: 600 }}
                    >
                      Completed
                    </div>
                    <div>{formatTimestamp(detailTask.completed_at)}</div>
                  </>
                )}
              </div>

              {/* Status Stepper */}
              <TaskStatusStepper status={detailTask.status} />

              {/* Checkpoint Progress */}
              {detailTask.checkpoints && detailTask.checkpoints.length > 0 && (
                <CheckpointProgress checkpoints={detailTask.checkpoints} />
              )}

              {/* Agent Performance */}
              {detailTask.assignee && (
                <>
                  {perfLoading ? (
                    <div style={{ marginTop: "1.5rem" }}>
                      <h4 style={{ marginBottom: "0.5rem" }}>
                        Agent Performance
                      </h4>
                      <p
                        style={{
                          color: "var(--text2)",
                          fontSize: "0.85rem",
                        }}
                      >
                        Loading agent stats...
                      </p>
                    </div>
                  ) : agentPerf ? (
                    <AgentPerformanceCard perf={agentPerf} />
                  ) : null}
                </>
              )}

              {/* Task Result Viewer */}
              {detailTask.result && (
                <TaskResultViewer result={detailTask.result} />
              )}

              {/* Legacy Timeline (kept for backward compat) */}
              <h4 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>
                Status Timeline
              </h4>
              <div
                style={{
                  borderLeft: "2px solid rgba(255,255,255,0.15)",
                  paddingLeft: "1rem",
                  marginLeft: "0.5rem",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    paddingBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "-1.35rem",
                      top: "0.25rem",
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background: "#eab308",
                    }}
                  />
                  <div style={{ fontWeight: 600 }}>Created</div>
                  <div
                    style={{ fontSize: "0.8rem", color: "var(--text2)" }}
                  >
                    {formatTimestamp(detailTask.created_at)}
                  </div>
                </div>

                {(detailTask.status === "accepted" ||
                  detailTask.status === "in_progress" ||
                  detailTask.status === "completed") && (
                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-1.35rem",
                        top: "0.25rem",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#3b82f6",
                      }}
                    />
                    <div style={{ fontWeight: 600 }}>Accepted</div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text2)",
                      }}
                    >
                      Accepted by {shortAddr(detailTask.assignee)}
                    </div>
                  </div>
                )}

                {(detailTask.status === "in_progress" ||
                  detailTask.status === "completed") && (
                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-1.35rem",
                        top: "0.25rem",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#a855f7",
                      }}
                    />
                    <div style={{ fontWeight: 600 }}>In Progress</div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text2)",
                      }}
                    >
                      Agent is executing the task
                    </div>
                  </div>
                )}

                {detailTask.status === "completed" && (
                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-1.35rem",
                        top: "0.25rem",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#22c55e",
                      }}
                    />
                    <div style={{ fontWeight: 600 }}>Completed</div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text2)",
                      }}
                    >
                      {formatTimestamp(detailTask.completed_at)}
                    </div>
                  </div>
                )}

                {detailTask.status === "failed" && (
                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-1.35rem",
                        top: "0.25rem",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#ef4444",
                      }}
                    />
                    <div style={{ fontWeight: 600 }}>Failed</div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text2)",
                      }}
                    >
                      Task execution failed
                    </div>
                  </div>
                )}

                {detailTask.status === "expired" && (
                  <div
                    style={{
                      position: "relative",
                      paddingBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-1.35rem",
                        top: "0.25rem",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background: "#ef4444",
                      }}
                    />
                    <div style={{ fontWeight: 600 }}>Expired</div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text2)",
                      }}
                    >
                      Deadline passed: {formatTimestamp(detailTask.deadline)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
