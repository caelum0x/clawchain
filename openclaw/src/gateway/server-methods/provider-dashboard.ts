/**
 * Gateway RPC method: provider.dashboard
 *
 * Aggregates all provider KPIs into a single response for the
 * "Earn" phase of the Install → Run → Earn lifecycle.
 * Combines chain status, agent metrics, task activity,
 * balance, and readiness into one snapshot.
 */

import {
  getBlockchainAgent,
  getBlockchainAddress,
  getBlockchainRuntimeStatus,
  getBlockchainShieldedBalance,
} from "../../../extensions/clawchain/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

type AgentClient = {
  getBalance: (addr: string) => Promise<{ amount: string }>;
  getLatestBlockHeight: () => Promise<number>;
  queryAgentRewards?: (addr: string) => Promise<{ totalRewards: string; pendingRewards: string }>;
  queryAgentStats?: (addr: string) => Promise<{
    tasksCompleted: number;
    tasksFailed: number;
    tasksAccepted: number;
    reputationScore: number;
  }>;
  queryLiveAgents?: () => Promise<{ agents: { address: string }[] }>;
};

function extractClient(agent: unknown): AgentClient | null {
  const a = agent as { client?: AgentClient } | null;
  return a?.client ?? null;
}

export const providerDashboardHandlers: GatewayRequestHandlers = {
  "provider.dashboard": async ({ respond }) => {
    try {
      const agent = getBlockchainAgent();
      const address = getBlockchainAddress();
      const shieldedBalance = getBlockchainShieldedBalance();

      if (!agent || !address) {
        respond(true, {
          connected: false,
          address: null,
          balance: null,
          shieldedBalance: null,
          blockHeight: null,
          rewards: null,
          stats: null,
          network: null,
          readiness: null,
        });
        return;
      }

      const client = extractClient(agent);

      // Fetch data in parallel for performance
      const [runtimeResult, balanceResult, rewardsResult, statsResult, liveAgentsResult] =
        await Promise.allSettled([
          getBlockchainRuntimeStatus(),
          client?.getBalance(address),
          client?.queryAgentRewards?.(address),
          client?.queryAgentStats?.(address),
          client?.queryLiveAgents?.(),
        ]);

      const runtime =
        runtimeResult.status === "fulfilled" ? runtimeResult.value : null;
      const balance =
        balanceResult.status === "fulfilled" ? balanceResult.value?.amount ?? null : null;
      const rewards =
        rewardsResult.status === "fulfilled" && rewardsResult.value
          ? rewardsResult.value
          : null;
      const stats =
        statsResult.status === "fulfilled" && statsResult.value
          ? statsResult.value
          : null;
      const liveAgents =
        liveAgentsResult.status === "fulfilled" && liveAgentsResult.value
          ? liveAgentsResult.value.agents.length
          : null;

      respond(true, {
        connected: true,
        address,
        balance,
        shieldedBalance,
        blockHeight: runtime?.chain.latestBlockHeight ?? null,
        rewards: rewards
          ? {
              total: rewards.totalRewards,
              pending: rewards.pendingRewards,
            }
          : null,
        stats: stats
          ? {
              tasksCompleted: stats.tasksCompleted,
              tasksFailed: stats.tasksFailed,
              tasksAccepted: stats.tasksAccepted,
              reputationScore: stats.reputationScore,
              successRate:
                stats.tasksCompleted + stats.tasksFailed > 0
                  ? Math.round(
                      (stats.tasksCompleted / (stats.tasksCompleted + stats.tasksFailed)) * 100,
                    )
                  : null,
            }
          : null,
        network: {
          connectedPeers: runtime?.peers.connectedPeers ?? null,
          liveAgents,
          chainAlive: runtime?.chain.alive ?? false,
          catchingUp: runtime?.chain.catchingUp ?? null,
        },
        readiness: runtime?.readiness ?? null,
        heartbeat: {
          enabled: runtime?.agent.heartbeatEnabled ?? false,
          inFlight: runtime?.agent.heartbeatInFlight ?? false,
        },
        messaging: {
          enabled: runtime?.messaging.enabled ?? false,
          reachable: runtime?.messaging.reachable ?? null,
        },
        faucet: {
          enabled: runtime?.faucet.enabled ?? false,
          available: runtime?.faucet.available ?? null,
        },
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
