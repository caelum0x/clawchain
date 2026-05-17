import {
  getBlockchainAgent,
  getBlockchainAddress,
} from "../../../extensions/clawchain/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentListEntry {
  address: string;
  name: string;
  status: string;
  lastHeartbeat: string | null;
  capabilities: string[];
}

interface AgentDetail {
  address: string;
  name: string;
  registered: boolean;
  reputation: number;
  lastHeartbeat: string | null;
  skills: string[];
  taskCount: number;
}

interface TaskEntry {
  id: string;
  description: string;
  assignee: string;
  delegator: string;
  status: string;
  createdAt: string;
}

interface ReputationInfo {
  score: number;
  totalRatings: number;
  avgRating: number;
  endorsements: number;
}

// ---------------------------------------------------------------------------
// LCD endpoint helper
// ---------------------------------------------------------------------------

const DEFAULT_LCD_ENDPOINT = "http://localhost:1317";

async function lcdFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${DEFAULT_LCD_ENDPOINT}${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`LCD request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const chainAgentHandlers: GatewayRequestHandlers = {
  /**
   * chain.agents.list — List live agents on the network.
   *
   * params: { limit?: number, offset?: number }
   */
  "chain.agents.list": async ({ params, respond }) => {
    try {
      const limit =
        typeof params.limit === "number" && params.limit > 0
          ? Math.min(params.limit, 100)
          : 20;
      const offset =
        typeof params.offset === "number" && params.offset >= 0
          ? params.offset
          : 0;

      const data = await lcdFetch<{
        agents?: Array<{
          address?: string;
          name?: string;
          status?: string;
          last_heartbeat?: string;
          capabilities?: string[];
        }>;
        pagination?: { total?: string };
      }>(
        `/clawchain/agent/v1/live?pagination.limit=${limit}&pagination.offset=${offset}`,
      );

      const rawAgents = Array.isArray(data.agents) ? data.agents : [];
      const agents: AgentListEntry[] = rawAgents.map((a) => ({
        address: a.address ?? "",
        name: a.name ?? "",
        status: a.status ?? "unknown",
        lastHeartbeat: a.last_heartbeat ?? null,
        capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
      }));

      const total =
        typeof data.pagination?.total === "string"
          ? parseInt(data.pagination.total, 10)
          : agents.length;

      respond(true, { agents, count: agents.length, total });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)),
      );
    }
  },

  /**
   * chain.agents.info — Get detailed info about a specific agent.
   *
   * params: { address: string }
   */
  "chain.agents.info": async ({ params, respond }) => {
    try {
      const address = typeof params.address === "string" ? params.address : "";
      if (!address) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_PARAMS, "address is required"),
        );
        return;
      }

      const agent = getBlockchainAgent();
      const client = agent
        ? (
            agent as unknown as {
              client: {
                getAgent: (addr: string) => Promise<{
                  registered?: boolean;
                  agent?: {
                    name?: string;
                    reputation?: number;
                    skills?: string[];
                    task_count?: number;
                  };
                }>;
                getAgentLiveness: (addr: string) => Promise<{
                  found?: boolean;
                  liveness?: { lastHeartbeat?: string };
                }>;
              };
            }
          ).client
        : null;

      let detail: AgentDetail;

      if (client) {
        const [agentInfo, livenessInfo] = await Promise.all([
          client.getAgent(address).catch(() => ({
            registered: false,
            agent: undefined,
          })),
          client.getAgentLiveness(address).catch(() => ({
            found: false,
            liveness: undefined,
          })),
        ]);

        detail = {
          address,
          name: agentInfo.agent?.name ?? "",
          registered: agentInfo.registered ?? false,
          reputation: agentInfo.agent?.reputation ?? 0,
          lastHeartbeat: livenessInfo.liveness?.lastHeartbeat ?? null,
          skills: Array.isArray(agentInfo.agent?.skills)
            ? agentInfo.agent.skills
            : [],
          taskCount: agentInfo.agent?.task_count ?? 0,
        };
      } else {
        // Fallback to LCD REST query
        const data = await lcdFetch<{
          agent?: {
            name?: string;
            registered?: boolean;
            reputation?: number;
            last_heartbeat?: string;
            skills?: string[];
            task_count?: number;
          };
        }>(`/clawchain/agent/v1/agent/${address}`);

        detail = {
          address,
          name: data.agent?.name ?? "",
          registered: data.agent?.registered ?? false,
          reputation: data.agent?.reputation ?? 0,
          lastHeartbeat: data.agent?.last_heartbeat ?? null,
          skills: Array.isArray(data.agent?.skills)
            ? data.agent.skills
            : [],
          taskCount: data.agent?.task_count ?? 0,
        };
      }

      respond(true, { agent: detail });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)),
      );
    }
  },

  /**
   * chain.agents.tasks — Query tasks (assigned or delegated).
   *
   * params: { address?: string, role?: "assignee" | "delegator", status?: string }
   */
  "chain.agents.tasks": async ({ params, respond }) => {
    try {
      const address =
        typeof params.address === "string"
          ? params.address
          : getBlockchainAddress();
      const role =
        typeof params.role === "string" &&
        (params.role === "assignee" || params.role === "delegator")
          ? params.role
          : "assignee";
      const status =
        typeof params.status === "string" ? params.status : undefined;

      if (!address) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_PARAMS,
            "address is required (or agent must be connected)",
          ),
        );
        return;
      }

      const queryPath =
        role === "delegator"
          ? `/clawchain/agent/v1/tasks_by_delegator/${address}`
          : `/clawchain/agent/v1/tasks_by_assignee/${address}`;

      const url = status ? `${queryPath}?status=${status}` : queryPath;

      const data = await lcdFetch<{
        tasks?: Array<{
          id?: string;
          description?: string;
          assignee?: string;
          delegator?: string;
          status?: string;
          created_at?: string;
        }>;
      }>(url);

      const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
      const tasks: TaskEntry[] = rawTasks.map((t) => ({
        id: t.id ?? "",
        description: t.description ?? "",
        assignee: t.assignee ?? "",
        delegator: t.delegator ?? "",
        status: t.status ?? "unknown",
        createdAt: t.created_at ?? "",
      }));

      respond(true, { tasks, count: tasks.length });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)),
      );
    }
  },

  /**
   * chain.agents.delegate — Delegate a task to another agent.
   *
   * params: { assignee: string, description: string, budget?: string, requirements?: string }
   */
  "chain.agents.delegate": async ({ params, respond }) => {
    try {
      const assignee =
        typeof params.assignee === "string" ? params.assignee : "";
      const description =
        typeof params.description === "string" ? params.description : "";

      if (!assignee) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_PARAMS, "assignee is required"),
        );
        return;
      }
      if (!description) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_PARAMS, "description is required"),
        );
        return;
      }

      const agent = getBlockchainAgent();
      const address = getBlockchainAddress();

      if (!agent || !address) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.UNAVAILABLE,
            "blockchain agent is not connected",
          ),
        );
        return;
      }

      const client = (
        agent as unknown as {
          client: {
            delegateTask: (msg: {
              delegator: string;
              assignee: string;
              description: string;
              budget?: string;
              requirements?: string;
            }) => Promise<{
              transactionHash: string;
              height: number;
              code: number;
              rawLog?: string;
              taskId?: string;
            }>;
          };
        }
      ).client;

      const budget =
        typeof params.budget === "string" ? params.budget : undefined;
      const requirements =
        typeof params.requirements === "string"
          ? params.requirements
          : undefined;

      const result = await client.delegateTask({
        delegator: address,
        assignee,
        description,
        budget,
        requirements,
      });

      respond(true, {
        transactionHash: result.transactionHash,
        height: result.height,
        code: result.code,
        success: result.code === 0,
        taskId: result.taskId ?? null,
        assignee,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)),
      );
    }
  },

  /**
   * chain.agents.reputation — Query agent reputation/trust score.
   *
   * params: { address: string }
   */
  "chain.agents.reputation": async ({ params, respond }) => {
    try {
      const address = typeof params.address === "string" ? params.address : "";
      if (!address) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_PARAMS, "address is required"),
        );
        return;
      }

      const data = await lcdFetch<{
        reputation?: {
          score?: number;
          total_ratings?: number;
          avg_rating?: number;
          endorsements?: number;
        };
      }>(`/clawchain/reputation/v1/score/${address}`);

      const reputation: ReputationInfo = {
        score: data.reputation?.score ?? 0,
        totalRatings: data.reputation?.total_ratings ?? 0,
        avgRating: data.reputation?.avg_rating ?? 0,
        endorsements: data.reputation?.endorsements ?? 0,
      };

      respond(true, { address, reputation });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)),
      );
    }
  },
};
