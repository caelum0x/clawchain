import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import {
  ChainAgentsListResultSchema,
  ChainWalletBalanceResultSchema,
  ChainStatusResultSchema,
  EventFrameSchema,
  HeartbeatEventPayloadSchema,
  ProviderDashboardResultSchema,
  ProviderHelpResultSchema,
  ProviderStatusResultSchema,
  ProtocolSchemas,
  RuntimeStatusResultSchema,
  ShutdownEventSchema,
  TickEventSchema,
} from "../schema.js";

describe("protocol contract registry coherence", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });

  it("exports chain + heartbeat contract schemas in ProtocolSchemas", () => {
    expect(ProtocolSchemas.ChainStatusResult).toBe(ChainStatusResultSchema);
    expect(ProtocolSchemas.RuntimeStatusResult).toBe(RuntimeStatusResultSchema);
    expect(ProtocolSchemas.ChainAgentsListResult).toBe(ChainAgentsListResultSchema);
    expect(ProtocolSchemas.ChainWalletBalanceResult).toBe(ChainWalletBalanceResultSchema);
    expect(ProtocolSchemas.ProviderStatusResult).toBe(ProviderStatusResultSchema);
    expect(ProtocolSchemas.ProviderHelpResult).toBe(ProviderHelpResultSchema);
    expect(ProtocolSchemas.ProviderDashboardResult).toBe(ProviderDashboardResultSchema);
    expect(ProtocolSchemas.HeartbeatEventPayload).toBe(HeartbeatEventPayloadSchema);
    expect(ProtocolSchemas.TickEvent).toBe(TickEventSchema);
    expect(ProtocolSchemas.ShutdownEvent).toBe(ShutdownEventSchema);
    expect(ProtocolSchemas.EventFrame).toBe(EventFrameSchema);
  });

  it("compiles registered schemas and validates representative payloads", () => {
    const validateChainStatus = ajv.compile(ProtocolSchemas.ChainStatusResult);
    const validateRuntimeStatus = ajv.compile(ProtocolSchemas.RuntimeStatusResult);
    const validateChainAgentsList = ajv.compile(ProtocolSchemas.ChainAgentsListResult);
    const validateChainWalletBalance = ajv.compile(ProtocolSchemas.ChainWalletBalanceResult);
    const validateProviderStatus = ajv.compile(ProtocolSchemas.ProviderStatusResult);
    const validateProviderHelp = ajv.compile(ProtocolSchemas.ProviderHelpResult);
    const validateProviderDashboard = ajv.compile(ProtocolSchemas.ProviderDashboardResult);
    const validateHeartbeat = ajv.compile(ProtocolSchemas.HeartbeatEventPayload);
    const validateTick = ajv.compile(ProtocolSchemas.TickEvent);
    const validateShutdown = ajv.compile(ProtocolSchemas.ShutdownEvent);

    expect(
      validateChainStatus({
        connected: true,
        address: "claw1agent",
        balance: "42",
        shieldedBalance: "7",
        blockHeight: 123,
        contracts: {
          msgAgentHeartbeatTypeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
          restAgentLivenessPath: "/clawchain/agent/v1/liveness",
          restLiveAgentsPath: "/clawchain/agent/v1/live",
        },
      }),
    ).toBe(true);

    expect(
      validateRuntimeStatus({
        chain: {
          rpcUrl: "http://localhost:26657",
          alive: true,
          latestBlockHeight: 123,
          catchingUp: false,
          error: null,
        },
        node: {
          managed: true,
          external: false,
          running: true,
        },
        agent: {
          connected: true,
          address: "claw1agent",
          heartbeatEnabled: true,
          heartbeatInFlight: false,
        },
        messaging: {
          enabled: true,
          endpoint: "http://localhost:7777",
          reachable: true,
          error: null,
        },
        faucet: {
          enabled: true,
          url: "http://localhost:8888",
          available: true,
          error: null,
        },
        peers: {
          rpcReachable: true,
          connectedPeers: 4,
          sampleNodeIds: ["node-a"],
          error: null,
        },
        contracts: {
          msgAgentHeartbeatTypeUrl: "/clawchain.agent.v1.MsgAgentHeartbeat",
          restAgentLivenessPath: "/clawchain/agent/v1/liveness",
          restLiveAgentsPath: "/clawchain/agent/v1/live",
        },
        readiness: {
          ready: true,
          checks: {
            chainReachable: true,
            agentConnected: true,
            agentRegistered: true,
            agentLive: true,
            messagingConfigured: true,
            messagingReachable: true,
            peersHealthy: true,
          },
          blockers: [],
        },
      }),
    ).toBe(true);

    expect(
      validateChainAgentsList({
        agents: [
          {
            address: "claw1agent",
            name: "Agent Alpha",
            status: "active",
            lastHeartbeat: "2026-03-08T00:00:00Z",
            capabilities: ["inference", "privacy"],
          },
        ],
        count: 1,
        total: 1,
      }),
    ).toBe(true);

    expect(
      validateChainWalletBalance({
        address: "claw1agent",
        balances: [{ denom: "uclaw", amount: "42" }],
        blockHeight: 123,
      }),
    ).toBe(true);

    expect(
      validateProviderStatus({
        ready: true,
        currentPhase: "earn",
        phases: {
          install: {
            phase: "install",
            label: "Install",
            ok: true,
            detail: "Chain alive at http://localhost:26657, agent connected",
          },
          run: {
            phase: "run",
            label: "Run",
            ok: true,
            detail: "Agent registered at claw1agent, heartbeat active",
          },
          earn: {
            phase: "earn",
            label: "Earn",
            ok: true,
            detail: "Provider ready - accepting tasks, earning rewards",
          },
        },
        address: "claw1agent",
        blockHeight: 123,
        connectedPeers: 4,
      }),
    ).toBe(true);

    expect(
      validateProviderHelp({
        overview: "Your OpenClaw agent is a ClawChain provider that earns CLAW tokens.",
        phases: [
          {
            phase: "install",
            title: "Install",
            description: "Install clawchaind + clawproof, configure your agent identity",
            steps: ["Install clawchaind"],
          },
        ],
        commands: {
          status: "clawd provider",
          dashboard: "clawd dashboard",
          balance: "clawd balance",
          tasks: "clawd task list",
          rewards: "clawd agent rewards",
        },
      }),
    ).toBe(true);

    expect(
      validateProviderDashboard({
        connected: true,
        address: "claw1agent",
        balance: "42",
        shieldedBalance: "7",
        blockHeight: 123,
        rewards: { total: "1000", pending: "25" },
        stats: {
          tasksCompleted: 9,
          tasksFailed: 1,
          tasksAccepted: 11,
          reputationScore: 4.8,
          successRate: 90,
        },
        network: {
          connectedPeers: 4,
          liveAgents: 12,
          chainAlive: true,
          catchingUp: false,
        },
        readiness: {
          ready: true,
          checks: {
            chainReachable: true,
            agentConnected: true,
            agentRegistered: true,
            agentLive: true,
            messagingConfigured: true,
            messagingReachable: true,
            peersHealthy: true,
          },
          blockers: [],
        },
        heartbeat: { enabled: true, inFlight: false },
        messaging: { enabled: true, reachable: true },
        faucet: { enabled: true, available: true },
      }),
    ).toBe(true);

    expect(
      validateHeartbeat({
        ts: Date.now(),
        status: "sent",
        indicatorType: "alert",
        channel: "web",
      }),
    ).toBe(true);
    expect(validateTick({ ts: Date.now() })).toBe(true);
    expect(validateShutdown({ reason: "service restart", restartExpectedMs: 5000 })).toBe(true);
  });
});
