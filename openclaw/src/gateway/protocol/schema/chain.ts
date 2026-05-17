import { Type, type Static } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const ChainStatusParamsSchema = Type.Object({}, { additionalProperties: false });
export const RuntimeStatusParamsSchema = Type.Object({}, { additionalProperties: false });

const ChainAddressParamsSchema = Type.Object(
  {
    address: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

const ChainCoinSchema = Type.Object(
  {
    denom: NonEmptyString,
    amount: NonEmptyString,
  },
  { additionalProperties: false },
);

const ChainPaginationParamsSchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const ChainAgentsListParamsSchema = ChainPaginationParamsSchema;
export const ChainAgentListEntrySchema = Type.Object(
  {
    address: Type.String(),
    name: Type.String(),
    status: Type.String(),
    lastHeartbeat: Type.Union([Type.String(), Type.Null()]),
    capabilities: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);
export const ChainAgentsListResultSchema = Type.Object(
  {
    agents: Type.Array(ChainAgentListEntrySchema),
    count: Type.Integer({ minimum: 0 }),
    total: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ChainAgentsInfoParamsSchema = Type.Object(
  {
    address: NonEmptyString,
  },
  { additionalProperties: false },
);
export const ChainAgentDetailSchema = Type.Object(
  {
    address: Type.String(),
    name: Type.String(),
    registered: Type.Boolean(),
    reputation: Type.Number(),
    lastHeartbeat: Type.Union([Type.String(), Type.Null()]),
    skills: Type.Array(Type.String()),
    taskCount: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export const ChainAgentsInfoResultSchema = Type.Object(
  {
    agent: ChainAgentDetailSchema,
  },
  { additionalProperties: false },
);

export const ChainAgentsTasksParamsSchema = Type.Object(
  {
    address: Type.Optional(NonEmptyString),
    role: Type.Optional(Type.Union([Type.Literal("assignee"), Type.Literal("delegator")])),
    status: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export const ChainAgentTaskEntrySchema = Type.Object(
  {
    id: Type.String(),
    description: Type.String(),
    assignee: Type.String(),
    delegator: Type.String(),
    status: Type.String(),
    createdAt: Type.String(),
  },
  { additionalProperties: false },
);
export const ChainAgentsTasksResultSchema = Type.Object(
  {
    tasks: Type.Array(ChainAgentTaskEntrySchema),
    count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ChainAgentsDelegateParamsSchema = Type.Object(
  {
    assignee: NonEmptyString,
    description: NonEmptyString,
    budget: Type.Optional(Type.String()),
    requirements: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export const ChainAgentsDelegateResultSchema = Type.Object(
  {
    transactionHash: NonEmptyString,
    height: Type.Number(),
    code: Type.Number(),
    success: Type.Boolean(),
    taskId: Type.Union([Type.String(), Type.Null()]),
    assignee: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChainAgentsReputationParamsSchema = Type.Object(
  {
    address: NonEmptyString,
  },
  { additionalProperties: false },
);
export const ChainAgentReputationSchema = Type.Object(
  {
    score: Type.Number(),
    totalRatings: Type.Number(),
    avgRating: Type.Number(),
    endorsements: Type.Number(),
  },
  { additionalProperties: false },
);
export const ChainAgentsReputationResultSchema = Type.Object(
  {
    address: NonEmptyString,
    reputation: ChainAgentReputationSchema,
  },
  { additionalProperties: false },
);

export const ChainWalletBalanceParamsSchema = Type.Object(
  {
    address: Type.Optional(NonEmptyString),
    denom: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);
export const ChainWalletBalanceResultSchema = Type.Object(
  {
    address: NonEmptyString,
    balances: Type.Array(ChainCoinSchema),
    blockHeight: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

export const ChainWalletTransferParamsSchema = Type.Object(
  {
    recipient: NonEmptyString,
    amount: NonEmptyString,
    denom: Type.Optional(NonEmptyString),
    memo: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export const ChainWalletTransferResultSchema = Type.Object(
  {
    transactionHash: NonEmptyString,
    height: Type.Number(),
    code: Type.Number(),
    success: Type.Boolean(),
    recipient: NonEmptyString,
    amount: NonEmptyString,
    denom: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ChainWalletStakingDelegationsParamsSchema = ChainAddressParamsSchema;
export const ChainWalletDelegationSchema = Type.Object(
  {
    validatorAddress: NonEmptyString,
    shares: NonEmptyString,
    balance: ChainCoinSchema,
  },
  { additionalProperties: false },
);
export const ChainWalletStakingDelegationsResultSchema = Type.Object(
  {
    address: NonEmptyString,
    delegations: Type.Array(ChainWalletDelegationSchema),
  },
  { additionalProperties: false },
);

export const ChainWalletStakingRewardsParamsSchema = ChainAddressParamsSchema;
export const ChainWalletRewardEntrySchema = Type.Object(
  {
    validatorAddress: NonEmptyString,
    rewards: Type.Array(ChainCoinSchema),
  },
  { additionalProperties: false },
);
export const ChainWalletStakingRewardsResultSchema = Type.Object(
  {
    address: NonEmptyString,
    rewards: Type.Array(ChainWalletRewardEntrySchema),
    total: Type.Array(ChainCoinSchema),
  },
  { additionalProperties: false },
);

export const ChainWalletHistoryParamsSchema = Type.Object(
  {
    address: Type.Optional(NonEmptyString),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export const ChainWalletTransactionSchema = Type.Object(
  {
    hash: NonEmptyString,
    height: NonEmptyString,
    type: Type.String(),
    timestamp: Type.String(),
    success: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const ChainWalletHistoryResultSchema = Type.Object(
  {
    address: NonEmptyString,
    transactions: Type.Array(ChainWalletTransactionSchema),
    count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ChainContractsSchema = Type.Object({
  msgAgentHeartbeatTypeUrl: Type.String({ minLength: 1 }),
  restAgentLivenessPath: Type.String({ minLength: 1 }),
  restLiveAgentsPath: Type.String({ minLength: 1 }),
}, { additionalProperties: false });

export const ChainStatusResultSchema = Type.Object({
  connected: Type.Boolean(),
  address: Type.Union([Type.String(), Type.Null()]),
  balance: Type.Union([Type.String(), Type.Null()]),
  shieldedBalance: Type.Union([Type.String(), Type.Null()]),
  blockHeight: Type.Union([Type.Number(), Type.Null()]),
  contracts: ChainContractsSchema,
}, { additionalProperties: false });

export const RuntimeChainHealthSchema = Type.Object({
  rpcUrl: Type.String({ minLength: 1 }),
  alive: Type.Boolean(),
  latestBlockHeight: Type.Union([Type.Number(), Type.Null()]),
  catchingUp: Type.Union([Type.Boolean(), Type.Null()]),
  error: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const RuntimeNodeHealthSchema = Type.Object({
  managed: Type.Boolean(),
  external: Type.Boolean(),
  running: Type.Boolean(),
}, { additionalProperties: false });

export const RuntimeAgentHealthSchema = Type.Object({
  connected: Type.Boolean(),
  address: Type.Union([Type.String(), Type.Null()]),
  heartbeatEnabled: Type.Boolean(),
  heartbeatInFlight: Type.Boolean(),
}, { additionalProperties: false });

export const RuntimeMessagingHealthSchema = Type.Object({
  enabled: Type.Boolean(),
  endpoint: Type.Union([Type.String(), Type.Null()]),
  reachable: Type.Union([Type.Boolean(), Type.Null()]),
  error: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const RuntimeFaucetHealthSchema = Type.Object({
  enabled: Type.Boolean(),
  url: Type.Union([Type.String(), Type.Null()]),
  available: Type.Union([Type.Boolean(), Type.Null()]),
  error: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const RuntimePeerHealthSchema = Type.Object({
  rpcReachable: Type.Boolean(),
  connectedPeers: Type.Union([Type.Number(), Type.Null()]),
  sampleNodeIds: Type.Array(Type.String({ minLength: 1 })),
  error: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const RuntimeReadinessSchema = Type.Object({
  ready: Type.Boolean(),
  checks: Type.Object({
    chainReachable: Type.Boolean(),
    agentConnected: Type.Boolean(),
    agentRegistered: Type.Boolean(),
    agentLive: Type.Boolean(),
    messagingConfigured: Type.Boolean(),
    messagingReachable: Type.Boolean(),
    peersHealthy: Type.Boolean(),
  }, { additionalProperties: false }),
  blockers: Type.Array(Type.String({ minLength: 1 })),
}, { additionalProperties: false });

export const RuntimeStatusResultSchema = Type.Object({
  chain: RuntimeChainHealthSchema,
  node: RuntimeNodeHealthSchema,
  agent: RuntimeAgentHealthSchema,
  messaging: RuntimeMessagingHealthSchema,
  faucet: RuntimeFaucetHealthSchema,
  peers: RuntimePeerHealthSchema,
  contracts: ChainContractsSchema,
  readiness: RuntimeReadinessSchema,
}, { additionalProperties: false });

// ChainStatusParams, ChainContracts, ChainStatusResult, RuntimeStatusParams,
// and RuntimeStatusResult type aliases are exported from ./types.ts to avoid
// duplicate exports through the barrel file (schema.ts).
export type ChainAgentListEntry = Static<typeof ChainAgentListEntrySchema>;
export type ChainAgentDetail = Static<typeof ChainAgentDetailSchema>;
export type ChainAgentTaskEntry = Static<typeof ChainAgentTaskEntrySchema>;
export type ChainAgentReputation = Static<typeof ChainAgentReputationSchema>;
export type ChainCoin = Static<typeof ChainCoinSchema>;
export type ChainWalletDelegation = Static<typeof ChainWalletDelegationSchema>;
export type ChainWalletRewardEntry = Static<typeof ChainWalletRewardEntrySchema>;
export type ChainWalletTransaction = Static<typeof ChainWalletTransactionSchema>;
export type RuntimeChainHealth = Static<typeof RuntimeChainHealthSchema>;
export type RuntimeNodeHealth = Static<typeof RuntimeNodeHealthSchema>;
export type RuntimeAgentHealth = Static<typeof RuntimeAgentHealthSchema>;
export type RuntimeMessagingHealth = Static<typeof RuntimeMessagingHealthSchema>;
export type RuntimeFaucetHealth = Static<typeof RuntimeFaucetHealthSchema>;
export type RuntimePeerHealth = Static<typeof RuntimePeerHealthSchema>;
export type RuntimeReadiness = Static<typeof RuntimeReadinessSchema>;
