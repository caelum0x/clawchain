/**
 * @clawchain/sdk – TypeScript client SDK for ClawChain.
 *
 * This package provides everything an OpenClaw AI agent (Node.js process)
 * needs to interact with the ClawChain blockchain:
 *
 *   - ClawChainClient  – low-level RPC / REST client for queries and txs
 *   - ProofGenerator    – wrapper around the `clawproof` Go binary for ZK proofs
 *   - ClawChainAgent    – high-level agent abstraction combining the above
 *
 * Usage example:
 *
 * ```ts
 * import { ClawChainAgent } from "@clawchain/sdk";
 *
 * const agent = new ClawChainAgent({
 *   name: "my-agent",
 *   mnemonic: "your twelve word mnemonic ...",
 * });
 *
 * await agent.initialize();
 * await agent.register();
 * await agent.shieldTokens(1_000_000);
 * ```
 */

// Client
export { ClawChainClient } from "./client.js";

// Proof generator
export { ProofGenerator } from "./proof.js";

// High-level agent
export { ClawChainAgent } from "./agent.js";

// High-level provider manager
export { ProviderManager } from "./provider.js";
export type {
  ProviderInventory,
  ProviderEarnings,
  ProviderHealth,
} from "./provider.js";

// WalletConnect v2
export {
  ClawWalletConnect,
  CLAW_WC_METHODS,
  CLAW_WC_EVENTS,
  getClawNamespace,
  clawCAIP10,
} from "./walletconnect.js";

// viem-style ClawChain adapter (Cosmos/Tendermint/CosmWasm-backed, not EVM)
export { createClawViemClient } from "./viem.js";
export type {
  ClawViemAdapterOptions,
  ClawViemClient,
  ClawViemClientBackend,
  ClawViemReadContractRequest,
  ClawViemTransferRequest,
  ClawViemTx,
  ClawViemWatchEventRequest,
  ClawViemWatchTransactionsRequest,
  ClawViemWriteContractRequest,
} from "./viem.js";

// wagmi-style ClawChain adapter (Cosmos wallet connectors + chain def + actions)
export {
  defineClawChain,
  createKeplrConnector,
  createLeapConnector,
  createClawWagmiConfig,
  signingClientFromConnector,
  connect,
  disconnect,
  getAccount,
  getBalance,
  getBlockNumber,
  readContract,
  writeContract,
} from "./wagmi.js";
export type {
  ClawChainDefinition,
  ClawConnector,
  ClawWagmiConfig,
  ClawWagmiConfigOptions,
  InjectedCosmosWallet,
} from "./wagmi.js";

export type {
  ClawWalletConnectConfig,
  WalletConnectSession,
  SessionProposalPayload,
  SessionRequestPayload,
  ClawWCMethod,
  ClawWCEvent,
} from "./walletconnect.js";

// WebSocket event streaming
export { ClawWebSocket } from "./websocket.js";

export type {
  TxFilter,
  StreamTxEvent,
  BlockEvent,
  AgentEvent,
  DexSwapEvent,
  PrivacyEvent,
  ClawChainEvent,
  EventCallback,
  ConnectionState,
} from "./websocket.js";

// Analytics helpers
export {
  calculatePortfolioValue,
  calculateStakingAPR,
  calculateDexPoolAPY,
  aggregateTransactionHistory,
  calculatePnL,
  formatTokenAmount,
  estimateGasCost,
} from "./analytics.js";

export type {
  TokenBalance,
  PriceMap,
  PortfolioValuation,
  StakingMetrics,
  PoolMetrics,
  VolumeDataPoint,
  PoolSnapshot,
  AggregationPeriod,
  TxAggregate,
  TransactionRecord,
  PnLReport,
  GasEstimate,
} from "./analytics.js";

// Ecosystem packages registry
export {
  ECOSYSTEM_PACKAGES,
  getPackageInfo,
  listByCategory,
} from "./ecosystem.js";
export type { EcosystemPackage } from "./ecosystem.js";

// Constants
export {
  DEFAULT_RPC_URL,
  DEFAULT_GRPC_URL,
  DEFAULT_REST_URL,
  DEFAULT_PREFIX,
  DEFAULT_DENOM,
  DEFAULT_GAS_PRICE,
  DEFAULT_GAS_ADJUSTMENT,
  DEFAULT_PROOF_BINARY,
  DEFAULT_PROOF_TIMEOUT_MS,
  MSG_SHIELD_TYPE_URL,
  MSG_PRIVATE_TRANSFER_TYPE_URL,
  MSG_UNSHIELD_TYPE_URL,
  MSG_REGISTER_AGENT_TYPE_URL,
  MSG_AGENT_ACTION_TYPE_URL,
  MSG_AGENT_HEARTBEAT_TYPE_URL,
  MSG_SEND_MESSAGE_TYPE_URL,
  MSG_ACK_MESSAGE_TYPE_URL,
  REST_MERKLE_ROOT,
  REST_NULLIFIER_EXISTS,
  REST_ROOT_HISTORY,
  REST_AGENT,
  REST_AGENT_PARAMS,
  REST_MESSAGES,
  REST_CONVERSATION,
  SUPPORTED_ACTION_TYPES,
  type ActionType,
  MSG_SUBMIT_PROPOSAL_TYPE_URL,
  MSG_VOTE_TYPE_URL,
  MSG_DEPOSIT_TYPE_URL,
  REST_GOV_PROPOSALS,
  VOTE_OPTION_MAP,
  MSG_LIST_SKILL_TYPE_URL,
  MSG_DELIST_SKILL_TYPE_URL,
  MSG_PURCHASE_SKILL_TYPE_URL,
  REST_MARKETPLACE_SKILLS,
  REST_MARKETPLACE_SKILL,
  IBC_PRIVACY_MEMO_KEY,
  IBC_AGENT_MEMO_KEY,
  MSG_RATE_AGENT_TYPE_URL,
  MSG_ENDORSE_AGENT_TYPE_URL,
  MSG_CREATE_ESCROW_TYPE_URL,
  MSG_COMPLETE_ESCROW_TYPE_URL,
  MSG_COMPLETE_MILESTONE_TYPE_URL,
  MSG_DISPUTE_ESCROW_TYPE_URL,
  MSG_UPDATE_SKILL_TYPE_URL,
  REST_REPUTATION,
  REST_RATINGS,
  REST_ENDORSEMENTS,
  REST_TOP_AGENTS,
  REST_ESCROW,
  REST_ESCROWS,
  REST_DISPUTE,
  REST_SKILLS_BY_CATEGORY,
  REST_SKILLS_BY_OWNER,
  REST_SKILL_SEARCH,
  REST_SKILL_ANALYTICS,
  REST_AGENT_ACTIVITY,
  REST_AGENT_STATS,
  REST_RECENT_ACTIVITY,
  REST_AGENT_LIVENESS,
  REST_LIVE_AGENTS,
  MSG_DELEGATE_TASK_TYPE_URL,
  MSG_ACCEPT_TASK_TYPE_URL,
  MSG_COMPLETE_TASK_TYPE_URL,
  REST_TASK,
  REST_TASKS_BY_DELEGATOR,
  REST_TASKS_BY_ASSIGNEE,
  REST_COMPUTE_RESOURCES,
  REST_COMPUTE_JOB,
  REST_COMPUTE_JOBS,
  REST_STAKING_VALIDATORS,
  REST_STAKING_DELEGATIONS,
  REST_STAKING_REWARDS,
  REST_IBC_CHANNELS,
  REST_IBC_CONNECTIONS,
  REST_IBC_CLIENTS,
  REST_IBC_DENOM_TRACES,
  REST_IBC_REMOTE_AGENTS,
  MSG_DELEGATE_TYPE_URL,
  MSG_UNDELEGATE_TYPE_URL,
  MSG_REDELEGATE_TYPE_URL,
  MSG_WITHDRAW_REWARDS_TYPE_URL,
  REST_AGENT_REWARDS,
  MSG_CHECKPOINT_TASK_TYPE_URL,
  MSG_COUNTER_PROPOSE_TYPE_URL,
  MSG_STORE_CODE_TYPE_URL,
  MSG_INSTANTIATE_CONTRACT_TYPE_URL,
  MSG_EXECUTE_CONTRACT_TYPE_URL,
  MSG_MIGRATE_CONTRACT_TYPE_URL,
  REST_WASM_CODES,
  REST_WASM_CODE,
  REST_WASM_CONTRACT,
  REST_GPU_PROVIDERS,
  REST_ORACLE_EXCHANGE_RATE,
  REST_ORACLE_EXCHANGE_RATES,
  REST_ORACLE_TOBIN_TAX,
  REST_ORACLE_TOBIN_TAXES,
  REST_ORACLE_ACTIVES,
  REST_ORACLE_VOTE_TARGETS,
  REST_ORACLE_PARAMS,
  REST_ORACLE_FEEDER,
  REST_ORACLE_MISS,
  REST_ORACLE_AGGREGATE_PREVOTE,
  REST_ORACLE_AGGREGATE_PREVOTES,
  REST_ORACLE_AGGREGATE_VOTE,
  REST_ORACLE_AGGREGATE_VOTES,
  MSG_PROPOSE_NEGOTIATION_TYPE_URL,
  MSG_COUNTER_NEGOTIATION_TYPE_URL,
  MSG_ACCEPT_NEGOTIATION_TYPE_URL,
  MSG_REJECT_NEGOTIATION_TYPE_URL,
  REST_NEGOTIATION,
  REST_NEGOTIATIONS_BY_AGENT,
} from "./constants.js";

// Types – re-export everything
export type {
  // Client options
  ClawChainClientOptions,
  // Privacy messages
  MsgShieldParams,
  MsgPrivateTransferParams,
  MsgUnshieldParams,
  // Agent messages
  MsgRegisterAgentParams,
  MsgAgentActionParams,
  MsgAgentHeartbeatParams,
  // Query responses
  MerkleRootResponse,
  NullifierExistsResponse,
  RootHistoryResponse,
  AgentInfoResponse,
  AgentParamsResponse,
  AgentLivenessResponse,
  LiveAgentEntry,
  LiveAgentsResponse,
  // Transaction result
  TxResult,
  TxEvent,
  // Proof types
  ProofGeneratorOptions,
  CommitmentOutput,
  NullifierOutput,
  ShieldDataOutput,
  UnshieldProofParams,
  TransferProofParams,
  ProofOutput,
  // Agent types
  ClawChainAgentOptions,
  LocalCommitment,
  // Messaging types (P2P)
  AgentMessage,
  DecryptedMessage,
  // Messaging types (on-chain)
  MsgSendMessageParams,
  MsgAckMessageParams,
  OnChainMessage,
  MessagesResponse,
  ConversationResponse,
  // Governance types
  VoteOption,
  MsgSubmitProposalParams,
  MsgVoteParams,
  MsgDepositParams,
  ProposalInfo,
  ProposalsResponse,
  // Marketplace types
  MsgListSkillParams,
  MsgDelistSkillParams,
  MsgPurchaseSkillParams,
  SkillInfo,
  SkillsResponse,
  // IBC cross-chain types
  IBCTransferParams,
  IBCShieldTransferParams,
  IBCDelegateTaskParams,
  // Reputation types
  MsgRateAgentParams,
  MsgEndorseAgentParams,
  ReputationInfo,
  ReputationResponse,
  RatingInfo,
  RatingsResponse,
  EndorsementInfo,
  EndorsementsResponse,
  TopAgentsResponse,
  // Escrow types
  MsgCreateEscrowParams,
  MsgCompleteEscrowParams,
  MsgCompleteMilestoneParams,
  MsgDisputeEscrowParams,
  EscrowInfo,
  EscrowResponse,
  EscrowsResponse,
  DisputeInfo,
  DisputeResponse,
  // Skill versioning types
  MsgUpdateSkillParams,
  SkillAnalyticsInfo,
  SkillAnalyticsResponse,
  // Agent activity types
  AgentStatsInfo,
  AgentStatsResponse,
  AgentActionRecord,
  AgentActivityResponse,
  RecentActivityResponse,
  // Task delegation types
  MsgDelegateTaskParams,
  MsgAcceptTaskParams,
  MsgCompleteTaskParams,
  TaskInfoResponse,
  TasksResponse,
  // Staking types
  ValidatorInfo,
  ValidatorsResponse,
  DelegationInfo,
  DelegationsResponse,
  RewardInfo,
  StakingRewardsResponse,
  MsgStakingDelegateParams,
  MsgStakingUndelegateParams,
  MsgWithdrawRewardsParams,
  // IBC types
  IBCChannelInfo,
  IBCChannelsResponse,
  IBCConnectionInfo,
  IBCConnectionsResponse,
  IBCClientInfo,
  IBCClientsResponse,
  IBCDenomTrace,
  IBCDenomTracesResponse,
  IBCRemoteAgent,
  IBCRemoteAgentsResponse,
  // Task checkpoint types
  MsgCheckpointTaskParams,
  TaskCheckpointResponse,
  // Reward leaderboard types
  RewardLeaderboardEntry,
  RewardLeaderboardResponse,
  // GPU Compute types
  ComputeResourceInput,
  ComputeResource,
  ComputeResourceResponse,
  ComputeResourcesResponse,
  ComputeLease,
  ComputeLeasesResponse,
  ComputeJobInput,
  ComputeJob,
  ComputeJobResponse,
  ComputeJobsResponse,
  ProviderStats,
  ProviderStatsResponse,
  // GPU Provider types
  GPUProvider,
  GPUProvidersResponse,
  GPUProviderResponse,
  // CosmWasm types
  WasmAccessConfig,
  WasmUploadResult,
  WasmInstantiateOptions,
  WasmInstantiateResult,
  WasmExecuteResult,
  WasmMigrateResult,
  WasmCodeInfo,
  WasmContractInfo,
  WasmContractHistoryEntry,
  WasmCoin,
  // DEX types
  DexAssetInfo,
  DexAsset,
  DexPairInfo,
  DexPoolResponse,
  DexSimulationResponse,
  DexReverseSimulationResponse,
  // DEX transaction types
  PairType,
  AssetInfo,
  SwapParams,
  LiquidityParams,
  PoolInfo,
  // WebSocket subscription types
  Unsubscribe,
  BlockInfo,
  WsTxEvent,
  ChainEvent,
  // Portfolio analytics types
  PortfolioSummary,
  AgentEarnings,
  LeaderboardEntry,
  // Negotiation types
  NegotiationTerms,
  NegotiationRound,
  Negotiation,
  NegotiationResponse,
  NegotiationsResponse,
  MsgProposeNegotiationParams,
  MsgCounterNegotiationParams,
  MsgAcceptNegotiationParams,
  MsgRejectNegotiationParams,
  // Oracle module types (Terra-forked v1beta1)
  OracleExchangeRateItem,
  OracleExchangeRateResponse,
  OracleExchangeRatesResponse,
  OracleTobinTaxResponse,
  OracleWhitelistEntry,
  OracleParamsData,
  OracleParamsResponse,
  OracleActivesResponse,
  OracleVoteTargetsResponse,
  OracleFeederResponse,
  OracleMissCounterResponse,
  OracleExchangeRateTuple,
  OracleAggregatePrevote,
  OracleAggregatePrevoteResponse,
  OracleAggregatePrevotesResponse,
  OracleAggregateVote,
  OracleAggregateVoteResponse,
  OracleAggregateVotesResponse,
} from "./types.js";
