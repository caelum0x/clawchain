import { Type } from "@sinclair/typebox";
import { RuntimeReadinessSchema } from "./chain.js";

export const ProviderPhaseSchema = Type.Union([
  Type.Literal("install"),
  Type.Literal("run"),
  Type.Literal("earn"),
]);

export const ProviderStatusParamsSchema = Type.Object({}, { additionalProperties: false });
export const ProviderDashboardParamsSchema = Type.Object({}, { additionalProperties: false });

export const ProviderHelpParamsSchema = Type.Object(
  {
    phase: Type.Optional(ProviderPhaseSchema),
  },
  { additionalProperties: false },
);

export const ProviderPhaseStatusSchema = Type.Object(
  {
    phase: ProviderPhaseSchema,
    label: Type.String({ minLength: 1 }),
    ok: Type.Boolean(),
    detail: Type.String(),
    action: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const ProviderStatusResultSchema = Type.Object(
  {
    ready: Type.Boolean(),
    currentPhase: ProviderPhaseSchema,
    phases: Type.Object(
      {
        install: ProviderPhaseStatusSchema,
        run: ProviderPhaseStatusSchema,
        earn: ProviderPhaseStatusSchema,
      },
      { additionalProperties: false },
    ),
    address: Type.Union([Type.String(), Type.Null()]),
    blockHeight: Type.Union([Type.Number(), Type.Null()]),
    connectedPeers: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const ProviderHelpPhaseSchema = Type.Object(
  {
    phase: ProviderPhaseSchema,
    title: Type.String({ minLength: 1 }),
    description: Type.String(),
    steps: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export const ProviderHelpCommandsSchema = Type.Object(
  {
    status: Type.String(),
    dashboard: Type.String(),
    balance: Type.String(),
    tasks: Type.String(),
    rewards: Type.String(),
  },
  { additionalProperties: false },
);

export const ProviderHelpResultSchema = Type.Union([
  Type.Object(
    {
      overview: Type.String(),
      phases: Type.Array(ProviderHelpPhaseSchema),
      commands: ProviderHelpCommandsSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      phase: Type.Union([ProviderHelpPhaseSchema, Type.Null()]),
      commands: ProviderHelpCommandsSchema,
    },
    { additionalProperties: false },
  ),
]);

const ProviderRewardsSchema = Type.Object(
  {
    total: Type.String(),
    pending: Type.String(),
  },
  { additionalProperties: false },
);

const ProviderStatsSchema = Type.Object(
  {
    tasksCompleted: Type.Number(),
    tasksFailed: Type.Number(),
    tasksAccepted: Type.Number(),
    reputationScore: Type.Number(),
    successRate: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

const ProviderNetworkSchema = Type.Object(
  {
    connectedPeers: Type.Union([Type.Number(), Type.Null()]),
    liveAgents: Type.Union([Type.Number(), Type.Null()]),
    chainAlive: Type.Boolean(),
    catchingUp: Type.Union([Type.Boolean(), Type.Null()]),
  },
  { additionalProperties: false },
);

const ProviderHeartbeatSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    inFlight: Type.Boolean(),
  },
  { additionalProperties: false },
);

const ProviderMessagingSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    reachable: Type.Union([Type.Boolean(), Type.Null()]),
  },
  { additionalProperties: false },
);

const ProviderFaucetSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    available: Type.Union([Type.Boolean(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const ProviderDashboardResultSchema = Type.Object(
  {
    connected: Type.Boolean(),
    address: Type.Union([Type.String(), Type.Null()]),
    balance: Type.Union([Type.String(), Type.Null()]),
    shieldedBalance: Type.Union([Type.String(), Type.Null()]),
    blockHeight: Type.Union([Type.Number(), Type.Null()]),
    rewards: Type.Union([ProviderRewardsSchema, Type.Null()]),
    stats: Type.Union([ProviderStatsSchema, Type.Null()]),
    network: Type.Union([ProviderNetworkSchema, Type.Null()]),
    readiness: Type.Union([RuntimeReadinessSchema, Type.Null()]),
    heartbeat: Type.Optional(ProviderHeartbeatSchema),
    messaging: Type.Optional(ProviderMessagingSchema),
    faucet: Type.Optional(ProviderFaucetSchema),
  },
  { additionalProperties: false },
);
