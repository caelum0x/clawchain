/**
 * ClawChainClient – low-level client for interacting with ClawChain.
 *
 * Uses @cosmjs/stargate for transaction signing / broadcasting and REST
 * queries for the custom privacy and agent modules.
 */

import {
  SigningStargateClient,
  StargateClient,
  GasPrice,
  type DeliverTxResponse,
} from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet, type OfflineSigner, Registry } from "@cosmjs/proto-signing";
import type {
  ClawChainClientOptions,
  MsgShieldParams,
  MsgPrivateTransferParams,
  MsgUnshieldParams,
  MsgRegisterAgentParams,
  MsgAgentActionParams,
  MsgRegisterViewKeyParams,
  MsgSubmitIntentParams,
  MsgRespondToIntentParams,
  MsgFinalizeIntentParams,
  MsgBatchPrivateTransferParams,
  MsgSendMessageParams,
  MsgAckMessageParams,
  MsgSubmitProposalParams,
  MsgVoteParams,
  MsgDepositParams,
  MsgListSkillParams,
  MsgDelistSkillParams,
  MsgPurchaseSkillParams,
  MsgRateAgentParams,
  MsgEndorseAgentParams,
  MsgCreateEscrowParams,
  MsgCompleteEscrowParams,
  MsgCompleteMilestoneParams,
  MsgDisputeEscrowParams,
  MsgUpdateSkillParams,
  IBCTransferParams,
  IBCShieldTransferParams,
  IBCDelegateTaskParams,
  ProposalsResponse,
  ProposalInfo,
  SkillInfo,
  SkillsResponse,
  MerkleRootResponse,
  NullifierExistsResponse,
  AgentInfoResponse,
  AgentParamsResponse,
  IntentInfoResponse,
  ViewKeyResponse,
  VerifyAmountProofResponse,
  MerkleProofResponse,
  CommitmentIndexResponse,
  TreeStatsResponse,
  RootHistoryResponse,
  MessagesResponse,
  ConversationResponse,
  ReputationResponse,
  RatingsResponse,
  EndorsementsResponse,
  TopAgentsResponse,
  EscrowResponse,
  EscrowsResponse,
  DisputeResponse,
  SkillAnalyticsResponse,
  AgentStatsResponse,
  AgentActivityResponse,
  RecentActivityResponse,
  MsgAgentHeartbeatParams,
  MsgDelegateTaskParams,
  MsgAcceptTaskParams,
  MsgCompleteTaskParams,
  AgentLivenessResponse,
  LiveAgentsResponse,
  TaskInfoResponse,
  TasksResponse,
  TxResult,
  TxEvent,
  ComputeResourceInput,
  ComputeResource,
  ComputeLease,
  ComputeResourcesResponse,
  ComputeResourceResponse,
  ComputeLeasesResponse,
  MsgProposeNegotiationParams,
  MsgCounterNegotiationParams,
  MsgAcceptNegotiationParams,
  MsgRejectNegotiationParams,
  Negotiation,
  NegotiationTerms,
  NegotiationResponse,
  NegotiationsResponse,
  ModelInput,
  ModelRecord,
  ModelVersion,
  ModelsResponse,
  ModelResponse,
  ModelVersionsResponse,
  ComputeJobInput,
  ComputeJob,
  ComputeJobResponse,
  ComputeJobsResponse,
  GPUMetrics,
  ProviderStats,
  ProviderStatsResponse,
  GPUProvider,
  GPUProvidersResponse,
  GPUProviderResponse,
  InferenceJob,
  InferenceJobResponse,
  InferenceJobsResponse,
  InferenceProvider,
  InferenceProviderResponse,
  InferenceProvidersResponse,
  InferencePricing,
  InferencePricingResponse,
  MsgSubmitInferenceJobParams,
  MsgCompleteInferenceJobParams,
  MsgRegisterInferenceProviderParams,
  MsgSetInferencePricingParams,
  ParamProposalInfo,
  ParamVoteInfo,
  ValidatorsResponse,
  ValidatorInfo,
  DelegationsResponse,
  DelegationInfo,
  StakingRewardsResponse,
  RewardInfo,
  MsgStakingDelegateParams,
  MsgStakingUndelegateParams,
  MsgWithdrawRewardsParams,
  IBCChannelsResponse,
  IBCChannelInfo,
  IBCConnectionsResponse,
  IBCConnectionInfo,
  IBCClientsResponse,
  IBCClientInfo,
  IBCDenomTracesResponse,
  IBCDenomTrace,
  IBCRemoteAgentsResponse,
  IBCRemoteAgent,
  MsgCheckpointTaskParams,
  TaskCheckpointResponse,
  RewardLeaderboardEntry,
  RewardLeaderboardResponse,
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
  DexPairInfo,
  DexPoolResponse,
  DexSimulationResponse,
  DexReverseSimulationResponse,
  DexAsset,
  DexAssetInfo,
  SwapParams,
  LiquidityParams,
  PoolInfo,
  PairType,
  AssetInfo,
  Unsubscribe,
  BlockInfo,
  WsTxEvent,
  ChainEvent,
  PortfolioSummary,
  AgentEarnings,
  LeaderboardEntry,
  OracleExchangeRateResponse,
  OracleExchangeRatesResponse,
  OracleTobinTaxResponse,
  OracleParamsResponse,
  OracleActivesResponse,
  OracleVoteTargetsResponse,
  OracleFeederResponse,
  OracleMissCounterResponse,
  OracleAggregatePrevoteResponse,
  OracleAggregatePrevotesResponse,
  OracleAggregateVoteResponse,
  OracleAggregateVotesResponse,
} from "./types.js";
import {
  DEFAULT_RPC_URL,
  DEFAULT_GRPC_URL,
  DEFAULT_PREFIX,
  DEFAULT_GAS_PRICE,
  DEFAULT_REST_URL,
  DEFAULT_DENOM,
  MSG_SHIELD_TYPE_URL,
  MSG_PRIVATE_TRANSFER_TYPE_URL,
  MSG_UNSHIELD_TYPE_URL,
  MSG_REGISTER_AGENT_TYPE_URL,
  MSG_AGENT_ACTION_TYPE_URL,
  MSG_REGISTER_VIEW_KEY_TYPE_URL,
  MSG_SUBMIT_INTENT_TYPE_URL,
  MSG_RESPOND_TO_INTENT_TYPE_URL,
  MSG_FINALIZE_INTENT_TYPE_URL,
  MSG_BATCH_PRIVATE_TRANSFER_TYPE_URL,
  MSG_SEND_MESSAGE_TYPE_URL,
  MSG_ACK_MESSAGE_TYPE_URL,
  MSG_SUBMIT_PROPOSAL_TYPE_URL,
  MSG_VOTE_TYPE_URL,
  MSG_DEPOSIT_TYPE_URL,
  MSG_LIST_SKILL_TYPE_URL,
  MSG_DELIST_SKILL_TYPE_URL,
  MSG_PURCHASE_SKILL_TYPE_URL,
  REST_GOV_PROPOSALS,
  REST_MARKETPLACE_SKILLS,
  REST_MARKETPLACE_SKILL,
  VOTE_OPTION_MAP,
  IBC_PRIVACY_MEMO_KEY,
  IBC_AGENT_MEMO_KEY,
  REST_MERKLE_ROOT,
  REST_NULLIFIER_EXISTS,
  REST_AGENT,
  REST_AGENT_PARAMS,
  REST_INTENT,
  REST_VIEW_KEY,
  REST_VERIFY_AMOUNT_PROOF,
  REST_MERKLE_PROOF,
  REST_COMMITMENT_INDEX,
  REST_TREE_STATS,
  REST_ROOT_HISTORY,
  REST_MESSAGES,
  REST_CONVERSATION,
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
  MSG_AGENT_HEARTBEAT_TYPE_URL,
  MSG_DELEGATE_TASK_TYPE_URL,
  MSG_ACCEPT_TASK_TYPE_URL,
  MSG_COMPLETE_TASK_TYPE_URL,
  MSG_DEREGISTER_AGENT_TYPE_URL,
  REST_AGENT_LIVENESS,
  REST_LIVE_AGENTS,
  REST_TASK,
  REST_TASKS_BY_DELEGATOR,
  REST_TASKS_BY_ASSIGNEE,
  REST_COMPUTE_RESOURCES,
  REST_COMPUTE_RESOURCE,
  REST_COMPUTE_LEASES,
  MSG_LIST_COMPUTE_RESOURCE_TYPE_URL,
  MSG_LEASE_COMPUTE_RESOURCE_TYPE_URL,
  MSG_RELEASE_COMPUTE_RESOURCE_TYPE_URL,
  MSG_PROPOSE_NEGOTIATION_TYPE_URL,
  MSG_COUNTER_NEGOTIATION_TYPE_URL,
  MSG_ACCEPT_NEGOTIATION_TYPE_URL,
  MSG_REJECT_NEGOTIATION_TYPE_URL,
  REST_NEGOTIATION,
  REST_NEGOTIATIONS_BY_AGENT,
  REST_MODELS,
  REST_MODEL,
  REST_MODEL_VERSIONS,
  MSG_REGISTER_MODEL_TYPE_URL,
  MSG_PURCHASE_MODEL_ACCESS_TYPE_URL,
  MSG_RATE_MODEL_TYPE_URL,
  MSG_SUBMIT_INFERENCE_JOB_TYPE_URL,
  MSG_COMPLETE_INFERENCE_JOB_TYPE_URL,
  MSG_START_INFERENCE_JOB_TYPE_URL,
  MSG_FAIL_INFERENCE_JOB_TYPE_URL,
  MSG_REGISTER_INFERENCE_PROVIDER_TYPE_URL,
  MSG_SET_INFERENCE_PRICING_TYPE_URL,
  MSG_INFERENCE_PROVIDER_HEARTBEAT_TYPE_URL,
  REST_INFERENCE_JOB,
  REST_INFERENCE_JOBS,
  REST_INFERENCE_PROVIDER,
  REST_INFERENCE_PROVIDERS,
  REST_INFERENCE_PRICING,
  MSG_SUBMIT_COMPUTE_JOB_TYPE_URL,
  MSG_UPDATE_JOB_STATUS_TYPE_URL,
  MSG_UPDATE_GPU_METRICS_TYPE_URL,
  REST_COMPUTE_JOBS,
  REST_COMPUTE_JOB,
  REST_PROVIDER_STATS,
  REST_GPU_PROVIDERS,
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
  MSG_WITHDRAW_REWARDS_TYPE_URL,
  MSG_CHECKPOINT_TASK_TYPE_URL,
  MSG_STORE_CODE_TYPE_URL,
  MSG_INSTANTIATE_CONTRACT_TYPE_URL,
  MSG_EXECUTE_CONTRACT_TYPE_URL,
  MSG_MIGRATE_CONTRACT_TYPE_URL,
  REST_WASM_CODES,
  REST_WASM_CODE,
  REST_WASM_CONTRACT,
  REST_WASM_CONTRACT_HISTORY_SUFFIX,
  REST_WASM_CONTRACT_SMART_SUFFIX,
  REST_WASM_CODE_CONTRACTS_SUFFIX,
  REST_AGENT_REWARDS,
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
} from "./constants.js";

// ---------------------------------------------------------------------------
// Protobuf-compatible message encoders
// ---------------------------------------------------------------------------

/**
 * Minimal protobuf encoders for ClawChain custom messages.
 *
 * @cosmjs/stargate expects each message type to provide `encode(value).finish()`
 * that returns a Uint8Array.  We hand-roll the protobuf wire encoding here so
 * the SDK does not need generated protobuf-ts stubs.
 */

/** Encode a varint (used for protobuf wire format). */
function encodeVarint(value: number | bigint): Uint8Array {
  const bytes: number[] = [];
  let v = typeof value === "bigint" ? value : BigInt(value);
  if (v < 0n) v = 0n;
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (v > 0n);
  if (bytes.length === 0) bytes.push(0);
  return new Uint8Array(bytes);
}

/** Encode a length-delimited field (tag | LEN | bytes). */
function encodeLengthDelimited(fieldNumber: number, data: Uint8Array): Uint8Array {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const len = encodeVarint(data.length);
  const result = new Uint8Array(tag.length + len.length + data.length);
  result.set(tag, 0);
  result.set(len, tag.length);
  result.set(data, tag.length + len.length);
  return result;
}

/** Encode a string field. */
function encodeString(fieldNumber: number, value: string): Uint8Array {
  if (!value) return new Uint8Array(0);
  const encoded = new TextEncoder().encode(value);
  return encodeLengthDelimited(fieldNumber, encoded);
}

/** Encode a repeated string field as repeated length-delimited entries. */
function encodeRepeatedString(fieldNumber: number, values: string[]): Uint8Array {
  if (!values || values.length === 0) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  for (const value of values) {
    if (!value) continue;
    parts.push(encodeString(fieldNumber, value));
  }
  return concat(...parts);
}

/** Encode a uint64 varint field (tag | VARINT). */
function encodeUint64(fieldNumber: number, value: bigint | number): Uint8Array {
  const v = typeof value === "bigint" ? value : BigInt(value);
  if (v === 0n) return new Uint8Array(0);
  const tag = encodeVarint((fieldNumber << 3) | 0);
  const val = encodeVarint(v);
  const result = new Uint8Array(tag.length + val.length);
  result.set(tag, 0);
  result.set(val, tag.length);
  return result;
}

/** Concatenate multiple Uint8Arrays. */
function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// -- Message encoders -------------------------------------------------------

function encodeMsgShield(msg: { creator: string; amount: bigint | number; coins: string }): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.amount),
    encodeString(3, msg.coins),
  );
}

function encodeMsgPrivateTransfer(msg: {
  creator: string;
  oldCommitments: string;
  newCommitments: string;
  nullifiers: string;
  root: string;
  proof: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.oldCommitments),
    encodeString(3, msg.newCommitments),
    encodeString(4, msg.nullifiers),
    encodeString(5, msg.root),
    encodeString(6, msg.proof),
  );
}

function encodeMsgUnshield(msg: {
  creator: string;
  commitment: string;
  nullifier: string;
  proof: string;
  amount: bigint | number;
  recipient: string;
  root: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.commitment),
    encodeString(3, msg.nullifier),
    encodeString(4, msg.proof),
    encodeUint64(5, msg.amount),
    encodeString(6, msg.recipient),
    encodeString(7, msg.root),
  );
}

function encodeMsgRegisterAgent(msg: {
  creator: string;
  pubkey: string;
  endpoint: string;
  name: string;
  supportedTools: string[];
  pricingHint: string;
  version: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.pubkey),
    encodeString(3, msg.endpoint),
    encodeString(4, msg.name),
    encodeRepeatedString(5, msg.supportedTools),
    encodeString(6, msg.pricingHint),
    encodeString(7, msg.version),
  );
}

function encodeMsgAgentAction(msg: {
  creator: string;
  actionType: string;
  payload: string;
  proof: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.actionType),
    encodeString(3, msg.payload),
    encodeString(4, msg.proof),
  );
}

function encodeMsgAgentHeartbeat(msg: {
  creator: string;
  nodeHeight: bigint | number;
  endpoint: string;
  metadata: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.nodeHeight),
    encodeString(3, msg.endpoint),
    encodeString(4, msg.metadata),
  );
}

// -- Task delegation message encoders -----------------------------------------

function encodeMsgDelegateTask(msg: {
  creator: string;
  assignee: string;
  description: string;
  requirements: string;
  skillId: bigint | number;
  budget: string;
  deadlineBlocks: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.assignee),
    encodeString(3, msg.description),
    encodeString(4, msg.requirements),
    encodeUint64(5, msg.skillId),
    encodeString(6, msg.budget),
    encodeUint64(7, msg.deadlineBlocks),
  );
}

function encodeMsgAcceptTask(msg: {
  creator: string;
  taskId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.taskId),
  );
}

function encodeMsgCompleteTask(msg: {
  creator: string;
  taskId: bigint | number;
  result: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.taskId),
    encodeString(3, msg.result),
  );
}

function encodeMsgDeregisterAgent(msg: {
  creator: string;
}): Uint8Array {
  return concat(encodeString(1, msg.creator));
}

// -- Negotiation message encoders ---------------------------------------------

function encodeMsgProposeNegotiation(msg: {
  creator: string;
  counterparty: string;
  description: string;
  requirements: string;
  skillId: bigint | number;
  budget: string;
  deadlineBlocks: bigint | number;
  maxRounds: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.counterparty),
    encodeString(3, msg.description),
    encodeString(4, msg.requirements),
    encodeUint64(5, msg.skillId),
    encodeString(6, msg.budget),
    encodeUint64(7, msg.deadlineBlocks),
    encodeUint64(8, msg.maxRounds),
  );
}

function encodeMsgCounterNegotiation(msg: {
  creator: string;
  negotiationId: bigint | number;
  newBudget: string;
  newDeadline: bigint | number;
  message: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.negotiationId),
    encodeString(3, msg.newBudget),
    encodeUint64(4, msg.newDeadline),
    encodeString(5, msg.message),
  );
}

function encodeMsgAcceptNegotiation(msg: {
  creator: string;
  negotiationId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.negotiationId),
  );
}

function encodeMsgRejectNegotiation(msg: {
  creator: string;
  negotiationId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.negotiationId),
  );
}

// -- Model Registry message encoders ------------------------------------------

function encodeMsgRegisterModel(msg: {
  creator: string;
  name: string;
  description: string;
  framework: string;
  architecture: string;
  parameterCount: string;
  license: string;
  tags: string[];
  storageType: string;
  storageUri: string;
  checksumSha256: string;
  sizeBytes: bigint | number;
  accessType: string;
  pricePerQueryUclaw: string;
  priceOneTimeUclaw: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.name),
    encodeString(3, msg.description),
    encodeString(4, msg.framework),
    encodeString(5, msg.architecture),
    encodeString(6, msg.parameterCount),
    encodeString(7, msg.license),
    encodeRepeatedString(8, msg.tags),
    encodeString(9, msg.storageType),
    encodeString(10, msg.storageUri),
    encodeString(11, msg.checksumSha256),
    encodeUint64(12, msg.sizeBytes),
    encodeString(13, msg.accessType),
    encodeString(14, msg.pricePerQueryUclaw),
    encodeString(15, msg.priceOneTimeUclaw),
  );
}

function encodeMsgPurchaseModelAccess(msg: {
  creator: string;
  modelId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.modelId),
  );
}

function encodeMsgRateModel(msg: {
  creator: string;
  modelId: bigint | number;
  rating: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.modelId),
    encodeUint64(3, msg.rating),
  );
}

function encodeMsgRegisterViewKey(msg: {
  creator: string;
  commitmentHex: string;
  encryptedNote: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.commitmentHex),
    encodeString(3, msg.encryptedNote),
  );
}

function encodeMsgBatchPrivateTransfer(msg: {
  creator: string;
  transfers: Array<{
    oldCommitments: string;
    newCommitments: string;
    nullifiers: string;
    root: string;
    proof: string;
  }>;
}): Uint8Array {
  const parts: Uint8Array[] = [encodeString(1, msg.creator)];
  for (const transfer of msg.transfers) {
    const entryBytes = concat(
      encodeString(1, transfer.oldCommitments),
      encodeString(2, transfer.newCommitments),
      encodeString(3, transfer.nullifiers),
      encodeString(4, transfer.root),
      encodeString(5, transfer.proof),
    );
    parts.push(encodeLengthDelimited(2, entryBytes));
  }
  return concat(...parts);
}

function encodeMsgSubmitIntent(msg: {
  creator: string;
  intentType: string;
  description: string;
  payload: string;
  minResponses: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.intentType),
    encodeString(3, msg.description),
    encodeString(4, msg.payload),
    encodeUint64(5, msg.minResponses),
  );
}

function encodeMsgRespondToIntent(msg: {
  creator: string;
  intentId: bigint | number;
  accepted: boolean;
  payload: string;
}): Uint8Array {
  const acceptedBytes = msg.accepted
    ? (() => {
        const tag = encodeVarint((3 << 3) | 0);
        const val = encodeVarint(1);
        const result = new Uint8Array(tag.length + val.length);
        result.set(tag, 0);
        result.set(val, tag.length);
        return result;
      })()
    : new Uint8Array(0);
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.intentId),
    acceptedBytes,
    encodeString(4, msg.payload),
  );
}

function encodeMsgFinalizeIntent(msg: {
  creator: string;
  intentId: bigint | number;
  cancel: boolean;
}): Uint8Array {
  const cancelBytes = msg.cancel
    ? (() => {
        const tag = encodeVarint((3 << 3) | 0);
        const val = encodeVarint(1);
        const result = new Uint8Array(tag.length + val.length);
        result.set(tag, 0);
        result.set(val, tag.length);
        return result;
      })()
    : new Uint8Array(0);
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.intentId),
    cancelBytes,
  );
}

function encodeMsgSendMessage(msg: {
  sender: string;
  recipient: string;
  ciphertext: string;
  nonce: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.sender),
    encodeString(2, msg.recipient),
    encodeString(3, msg.ciphertext),
    encodeString(4, msg.nonce),
  );
}

function encodeMsgAckMessage(msg: {
  creator: string;
  messageId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.messageId),
  );
}

// -- Governance message encoders ---------------------------------------------

/** Encode a Coin message (denom=1, amount=2). */
function encodeCoin(coin: { denom: string; amount: string }): Uint8Array {
  return concat(
    encodeString(1, coin.denom),
    encodeString(2, coin.amount),
  );
}

/** Encode a bool varint field. */
function encodeBool(fieldNumber: number, value: boolean): Uint8Array {
  if (!value) return new Uint8Array(0);
  const tag = encodeVarint((fieldNumber << 3) | 0);
  const val = encodeVarint(1);
  const result = new Uint8Array(tag.length + val.length);
  result.set(tag, 0);
  result.set(val, tag.length);
  return result;
}

function encodeMsgSubmitProposal(msg: {
  proposer: string;
  title: string;
  summary: string;
  metadata: string;
  initialDeposit: Array<{ denom: string; amount: string }>;
  expedited: boolean;
}): Uint8Array {
  const parts: Uint8Array[] = [];
  // field 2: repeated Coin initial_deposit
  for (const coin of msg.initialDeposit) {
    parts.push(encodeLengthDelimited(2, encodeCoin(coin)));
  }
  parts.push(encodeString(3, msg.proposer));   // field 3: proposer
  parts.push(encodeString(4, msg.metadata));    // field 4: metadata
  parts.push(encodeString(5, msg.title));       // field 5: title
  parts.push(encodeString(6, msg.summary));     // field 6: summary
  parts.push(encodeBool(7, msg.expedited));     // field 7: expedited
  return concat(...parts);
}

function encodeMsgVote(msg: {
  proposalId: bigint | number;
  voter: string;
  option: number;
  metadata: string;
}): Uint8Array {
  return concat(
    encodeUint64(1, msg.proposalId),
    encodeString(2, msg.voter),
    encodeUint64(3, msg.option),
    encodeString(4, msg.metadata),
  );
}

function encodeMsgDeposit(msg: {
  proposalId: bigint | number;
  depositor: string;
  amount: Array<{ denom: string; amount: string }>;
}): Uint8Array {
  const parts: Uint8Array[] = [
    encodeUint64(1, msg.proposalId),
    encodeString(2, msg.depositor),
  ];
  for (const coin of msg.amount) {
    parts.push(encodeLengthDelimited(3, encodeCoin(coin)));
  }
  return concat(...parts);
}

// -- Marketplace message encoders ---------------------------------------------

function encodeMsgListSkill(msg: {
  creator: string;
  name: string;
  description: string;
  price: string;
  denom: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.name),
    encodeString(3, msg.description),
    encodeString(4, msg.price),
    encodeString(5, msg.denom),
  );
}

function encodeMsgDelistSkill(msg: {
  creator: string;
  skillId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.skillId),
  );
}

function encodeMsgPurchaseSkill(msg: {
  creator: string;
  skillId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.skillId),
  );
}

// -- Reputation message encoders ---------------------------------------------

function encodeMsgRateAgent(msg: {
  creator: string;
  agentAddress: string;
  skillId: bigint | number;
  score: bigint | number;
  comment: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.agentAddress),
    encodeUint64(3, msg.skillId),
    encodeUint64(4, msg.score),
    encodeString(5, msg.comment),
  );
}

function encodeMsgEndorseAgent(msg: {
  creator: string;
  agentAddress: string;
  reason: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeString(2, msg.agentAddress),
    encodeString(3, msg.reason),
  );
}

// -- Escrow message encoders -------------------------------------------------

function encodeMsgCreateEscrow(msg: {
  creator: string;
  skillId: bigint | number;
  deadlineBlocks: bigint | number;
  description: string;
  milestones: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.skillId),
    encodeUint64(3, msg.deadlineBlocks),
    encodeString(4, msg.description),
    encodeUint64(5, msg.milestones),
  );
}

function encodeMsgCompleteEscrow(msg: {
  creator: string;
  escrowId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.escrowId),
  );
}

function encodeMsgCompleteMilestone(msg: {
  creator: string;
  escrowId: bigint | number;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.escrowId),
  );
}

function encodeMsgDisputeEscrow(msg: {
  creator: string;
  escrowId: bigint | number;
  reason: string;
}): Uint8Array {
  return concat(
    encodeString(1, msg.creator),
    encodeUint64(2, msg.escrowId),
    encodeString(3, msg.reason),
  );
}

// -- Skill versioning message encoders ----------------------------------------

function encodeMsgUpdateSkill(msg: {
  creator: string;
  skillId: bigint | number;
  description: string;
  price: string;
  category: string;
  tags: string[];
  dependencies: Array<bigint | number>;
}): Uint8Array {
  const parts: Uint8Array[] = [
    encodeString(1, msg.creator),
    encodeUint64(2, msg.skillId),
    encodeString(3, msg.description),
    encodeString(4, msg.price),
    encodeString(5, msg.category),
  ];
  for (const tag of msg.tags) {
    parts.push(encodeString(6, tag));
  }
  if (msg.dependencies.length > 0) {
    const depBytes: Uint8Array[] = msg.dependencies.map((d) => encodeVarint(typeof d === "bigint" ? d : BigInt(d)));
    const totalLen = depBytes.reduce((sum, b) => sum + b.length, 0);
    const packed = new Uint8Array(totalLen);
    let off = 0;
    for (const b of depBytes) {
      packed.set(b, off);
      off += b.length;
    }
    parts.push(encodeLengthDelimited(7, packed));
  }
  return concat(...parts);
}

// -- CosmWasm message encoders ------------------------------------------------

function encodeMsgStoreCode(msg: {
  sender: string;
  wasmByteCode: Uint8Array;
}): Uint8Array {
  return concat(
    encodeString(1, msg.sender),
    encodeLengthDelimited(2, msg.wasmByteCode),
  );
}

function encodeMsgInstantiateContract(msg: {
  sender: string;
  admin: string;
  codeId: bigint | number;
  label: string;
  msg: Uint8Array;
  funds: Array<{ denom: string; amount: string }>;
}): Uint8Array {
  const parts: Uint8Array[] = [
    encodeString(1, msg.sender),
    encodeString(2, msg.admin),
    encodeUint64(3, msg.codeId),
    encodeString(4, msg.label),
    encodeLengthDelimited(5, msg.msg),
  ];
  for (const coin of msg.funds) {
    parts.push(encodeLengthDelimited(6, encodeCoin(coin)));
  }
  return concat(...parts);
}

function encodeMsgExecuteContract(msg: {
  sender: string;
  contract: string;
  msg: Uint8Array;
  funds: Array<{ denom: string; amount: string }>;
}): Uint8Array {
  const parts: Uint8Array[] = [
    encodeString(1, msg.sender),
    encodeString(2, msg.contract),
    encodeLengthDelimited(3, msg.msg),
  ];
  for (const coin of msg.funds) {
    parts.push(encodeLengthDelimited(5, encodeCoin(coin)));
  }
  return concat(...parts);
}

function encodeMsgMigrateContract(msg: {
  sender: string;
  contract: string;
  codeId: bigint | number;
  msg: Uint8Array;
}): Uint8Array {
  return concat(
    encodeString(1, msg.sender),
    encodeString(2, msg.contract),
    encodeUint64(3, msg.codeId),
    encodeLengthDelimited(4, msg.msg),
  );
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

/** Create a cosmjs Registry with all ClawChain custom message types registered. */
function createClawChainRegistry(): Registry {
  const registry = new Registry();

  registry.register(MSG_SHIELD_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgShield(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_PRIVATE_TRANSFER_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgPrivateTransfer(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_UNSHIELD_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgUnshield(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_REGISTER_AGENT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgRegisterAgent(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_AGENT_ACTION_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgAgentAction(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_REGISTER_VIEW_KEY_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgRegisterViewKey(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_BATCH_PRIVATE_TRANSFER_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgBatchPrivateTransfer(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_SUBMIT_INTENT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgSubmitIntent(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_RESPOND_TO_INTENT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgRespondToIntent(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_FINALIZE_INTENT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgFinalizeIntent(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_SEND_MESSAGE_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgSendMessage(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_ACK_MESSAGE_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgAckMessage(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_SUBMIT_PROPOSAL_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgSubmitProposal(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_VOTE_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgVote(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_DEPOSIT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgDeposit(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_LIST_SKILL_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgListSkill(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_DELIST_SKILL_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgDelistSkill(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_PURCHASE_SKILL_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgPurchaseSkill(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_RATE_AGENT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgRateAgent(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_ENDORSE_AGENT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgEndorseAgent(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_CREATE_ESCROW_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgCreateEscrow(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_COMPLETE_ESCROW_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgCompleteEscrow(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_COMPLETE_MILESTONE_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgCompleteMilestone(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_DISPUTE_ESCROW_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgDisputeEscrow(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_UPDATE_SKILL_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgUpdateSkill(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_AGENT_HEARTBEAT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgAgentHeartbeat(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_DELEGATE_TASK_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgDelegateTask(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_ACCEPT_TASK_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgAcceptTask(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_COMPLETE_TASK_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgCompleteTask(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_DEREGISTER_AGENT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgDeregisterAgent(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_PROPOSE_NEGOTIATION_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgProposeNegotiation(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_COUNTER_NEGOTIATION_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgCounterNegotiation(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_ACCEPT_NEGOTIATION_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgAcceptNegotiation(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_REJECT_NEGOTIATION_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgRejectNegotiation(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_REGISTER_MODEL_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgRegisterModel(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_PURCHASE_MODEL_ACCESS_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgPurchaseModelAccess(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_RATE_MODEL_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgRateModel(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  // -- CosmWasm message registrations ------------------------------------------

  registry.register(MSG_STORE_CODE_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgStoreCode(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_INSTANTIATE_CONTRACT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgInstantiateContract(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_EXECUTE_CONTRACT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgExecuteContract(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  registry.register(MSG_MIGRATE_CONTRACT_TYPE_URL, {
    encode: (msg: any) => ({ finish: () => encodeMsgMigrateContract(msg) }),
    decode: (_: Uint8Array) => ({}),
    fromPartial: (obj: any) => obj,
  } as any);

  return registry;
}

// ---------------------------------------------------------------------------
// Helper: DeliverTxResponse -> TxResult
// ---------------------------------------------------------------------------

function toTxResult(res: DeliverTxResponse): TxResult {
  const events: TxEvent[] = (res.events ?? []).map((e) => ({
    type: e.type,
    attributes: e.attributes.map((a) => ({
      key: typeof a.key === "string" ? a.key : new TextDecoder().decode(a.key),
      value: typeof a.value === "string" ? a.value : new TextDecoder().decode(a.value),
    })),
  }));

  return {
    transactionHash: res.transactionHash,
    height: res.height,
    code: res.code,
    rawLog: res.rawLog ?? "",
    gasUsed: Number(res.gasUsed),
    gasWanted: Number(res.gasWanted),
    events,
  };
}

// ---------------------------------------------------------------------------
// CosmWasm helpers
// ---------------------------------------------------------------------------

/** Parse an access config from the REST response. */
function parseAccessConfig(raw: any): WasmAccessConfig {
  if (!raw) return { permission: "Everybody" };
  const perm = raw.permission ?? "";
  let permission: WasmAccessConfig["permission"] = "Everybody";
  if (perm === "ACCESS_TYPE_NOBODY" || perm === "Nobody") permission = "Nobody";
  else if (perm === "ACCESS_TYPE_ONLY_ADDRESS" || perm === "OnlyAddress") permission = "OnlyAddress";
  else if (perm === "ACCESS_TYPE_EVERYBODY" || perm === "Everybody") permission = "Everybody";
  else if (perm === "ACCESS_TYPE_ANY_OF_ADDRESSES" || perm === "AnyOfAddresses") permission = "AnyOfAddresses";
  const addresses = raw.addresses ?? (raw.address ? [raw.address] : undefined);
  return {
    permission,
    addresses,
  };
}

/** Parse a history operation string from the REST response. */
function parseHistoryOperation(raw: any): "Init" | "Migrate" | "Genesis" {
  const s = String(raw ?? "");
  if (s === "CONTRACT_CODE_HISTORY_OPERATION_TYPE_INIT" || s === "Init") return "Init";
  if (s === "CONTRACT_CODE_HISTORY_OPERATION_TYPE_MIGRATE" || s === "Migrate") return "Migrate";
  if (s === "CONTRACT_CODE_HISTORY_OPERATION_TYPE_GENESIS" || s === "Genesis") return "Genesis";
  return "Init";
}

/** Try to parse a JSON string; return raw object if it fails or if already an object. */
function tryParseJson(raw: any): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(typeof raw === "string" ? raw : atob(String(raw)));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// ClawChainClient
// ---------------------------------------------------------------------------

export class ClawChainClient {
  private readonly rpcUrl: string;
  private readonly grpcUrl: string;
  private readonly restUrl: string;
  private readonly prefix: string;
  private readonly gasPriceStr: string;
  private mnemonic: string | undefined;
  private externalSigner: OfflineSigner | undefined;

  private queryClient: StargateClient | null = null;
  private signingClient: SigningStargateClient | null = null;
  private wallet: DirectSecp256k1HdWallet | null = null;
  private signerAddress: string | null = null;

  // WebSocket subscription state
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private wsSubscriptions: Map<string, Set<(data: any) => void>> = new Map();
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsReconnectAttempt = 0;
  private wsMaxReconnectAttempt = 10;
  private wsBaseDelay = 1000;
  private wsConnecting = false;
  private wsRequestId = 0;

  constructor(options: ClawChainClientOptions = {}) {
    this.rpcUrl = options.rpcUrl ?? DEFAULT_RPC_URL;
    this.grpcUrl = options.grpcUrl ?? DEFAULT_GRPC_URL;
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
    this.gasPriceStr = options.gasPrice ?? DEFAULT_GAS_PRICE;
    this.mnemonic = options.mnemonic;
    this.externalSigner = options.offlineSigner;

    // Derive the REST URL from the RPC URL by switching to port 1317.
    try {
      const url = new URL(this.rpcUrl);
      this.restUrl = `${url.protocol}//${url.hostname}:1317`;
    } catch {
      this.restUrl = DEFAULT_REST_URL;
    }

    // Derive WebSocket URL from the RPC URL.
    try {
      const url = new URL(this.rpcUrl);
      const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
      this.wsUrl = `${wsProto}//${url.host}/websocket`;
    } catch {
      this.wsUrl = "ws://localhost:26657/websocket";
    }
  }

  // -----------------------------------------------------------------------
  // Connection
  // -----------------------------------------------------------------------

  /**
   * Establish connections to the chain.
   *
   * If a mnemonic was provided, a signing client is created so the client
   * can broadcast transactions.  Otherwise only a read-only query client
   * is available.
   */
  async connect(): Promise<void> {
    this.queryClient = await StargateClient.connect(this.rpcUrl);

    // An external offline signer (e.g. from a browser wallet) takes precedence
    // over a mnemonic, enabling wallet-signed txs without exposing a seed phrase.
    const signer: OfflineSigner | null = this.externalSigner
      ? this.externalSigner
      : this.mnemonic
        ? await DirectSecp256k1HdWallet.fromMnemonic(this.mnemonic, { prefix: this.prefix })
        : null;

    if (signer) {
      if (signer instanceof DirectSecp256k1HdWallet) {
        this.wallet = signer;
      }
      const [account] = await signer.getAccounts();
      if (!account) {
        throw new Error("ClawChainClient: failed to derive account from signer");
      }
      this.signerAddress = account.address;

      const registry = createClawChainRegistry();
      this.signingClient = await SigningStargateClient.connectWithSigner(this.rpcUrl, signer, {
        registry,
        gasPrice: GasPrice.fromString(this.gasPriceStr),
      });
    }
  }

  /** Disconnect from the chain and release resources. */
  async disconnect(): Promise<void> {
    this.queryClient?.disconnect();
    this.signingClient?.disconnect();
    this.queryClient = null;
    this.signingClient = null;
    this.wallet = null;
    this.signerAddress = null;
  }

  /** Return the signer's bech32 address, if connected with a mnemonic. */
  getAddress(): string {
    if (!this.signerAddress) {
      throw new Error("ClawChainClient: not connected or no mnemonic provided");
    }
    return this.signerAddress;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /**
   * Query the balance of an address for a given denomination.
   *
   * @param address - Bech32 address to query.
   * @param denom   - Token denomination (default: "uclaw").
   * @returns The balance as a string (e.g. "1000000").
   */
  async getBalance(address: string, denom: string = DEFAULT_DENOM): Promise<string> {
    this.ensureQueryClient();
    const coin = await this.queryClient!.getBalance(address, denom);
    return coin.amount;
  }

  /**
   * Query agent info via the REST API.
   *
   * @param address - Bech32 address of the agent.
   */
  async getAgent(address: string): Promise<AgentInfoResponse> {
    const url = `${this.restUrl}${REST_AGENT}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getAgent: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as AgentInfoResponse;
    return data;
  }

  /**
   * Query agent module policy params via REST API.
   */
  async getAgentParams(): Promise<AgentParamsResponse> {
    const url = `${this.restUrl}${REST_AGENT_PARAMS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getAgentParams: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as {
      params?: Record<string, string | number>;
    };
    const p = data.params ?? {};
    const asNum = (value: string | number | undefined) => Number(value ?? 0);
    return {
      params: {
        maxHeartbeatGapBlocks: asNum(p.max_heartbeat_gap_blocks as string | number | undefined),
        maxActionsPerBlock: asNum(p.max_actions_per_block as string | number | undefined),
        minHeartbeatIntervalBlocks: asNum(p.min_heartbeat_interval_blocks as string | number | undefined),
        maxIntentsPerBlock: asNum(p.max_intents_per_block as string | number | undefined),
        maxTasksPerBlock: asNum(p.max_tasks_per_block as string | number | undefined),
        maxPayloadBytes: asNum(p.max_payload_bytes as string | number | undefined),
        minAgentDepositUclaw: asNum(p.min_agent_deposit_uclaw as string | number | undefined),
        depositSlashPerPenaltyBps: asNum(p.deposit_slash_per_penalty_bps as string | number | undefined),
        minTaskBudgetUclaw: asNum(p.min_task_budget_uclaw as string | number | undefined),
        highImpactMinDepositUclaw: asNum(p.high_impact_min_deposit_uclaw as string | number | undefined),
        standardTaskMinBudgetUclaw: asNum(p.standard_task_min_budget_uclaw as string | number | undefined),
        expeditedTaskMinBudgetUclaw: asNum(p.expedited_task_min_budget_uclaw as string | number | undefined),
        expeditedTaskMaxDeadlineBlocks: asNum(p.expedited_task_max_deadline_blocks as string | number | undefined),
      },
    };
  }

  /**
   * Query the current Merkle root of the shielded pool.
   */
  async getMerkleRoot(): Promise<string> {
    const url = `${this.restUrl}${REST_MERKLE_ROOT}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getMerkleRoot: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as MerkleRootResponse;
    return data.root;
  }

  /**
   * Check whether a nullifier has already been recorded on-chain.
   *
   * @param nullifier - Hex-encoded nullifier.
   */
  async nullifierExists(nullifier: string): Promise<boolean> {
    const url = `${this.restUrl}${REST_NULLIFIER_EXISTS}/${encodeURIComponent(nullifier)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.nullifierExists: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as NullifierExistsResponse;
    return data.exists;
  }

  /**
   * Query a view key (encrypted note) by commitment hex.
   */
  async getViewKey(commitmentHex: string): Promise<ViewKeyResponse> {
    const url = `${this.restUrl}${REST_VIEW_KEY}/${encodeURIComponent(commitmentHex)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getViewKey: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ViewKeyResponse;
  }

  /**
   * Verify a ZK proof that a commitment contains a given amount.
   */
  async verifyAmountProof(
    commitmentHex: string,
    amount: number,
    proof: string,
  ): Promise<VerifyAmountProofResponse> {
    const url = `${this.restUrl}${REST_VERIFY_AMOUNT_PROOF}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitment_hex: commitmentHex,
        amount,
        proof,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.verifyAmountProof: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as VerifyAmountProofResponse;
  }

  /**
   * Query a Merkle proof for a given commitment.
   */
  async getMerkleProof(commitmentHex: string): Promise<MerkleProofResponse> {
    const url = `${this.restUrl}${REST_MERKLE_PROOF}/${encodeURIComponent(commitmentHex)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getMerkleProof: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as MerkleProofResponse;
  }

  /**
   * Query the leaf index for a given commitment.
   */
  async getCommitmentIndex(commitmentHex: string): Promise<CommitmentIndexResponse> {
    const url = `${this.restUrl}${REST_COMMITMENT_INDEX}/${encodeURIComponent(commitmentHex)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getCommitmentIndex: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as CommitmentIndexResponse;
  }

  /**
   * Query Merkle tree statistics (leaf count, root, depth).
   */
  async getTreeStats(): Promise<TreeStatsResponse> {
    const url = `${this.restUrl}${REST_TREE_STATS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getTreeStats: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as TreeStatsResponse;
  }

  /**
   * Query historical Merkle roots using query params.
   *
   * Endpoint: GET /clawchain/privacy/v1/root_history?offset=&limit=
   */
  async getRootHistory(offset = 0, limit = 50): Promise<RootHistoryResponse> {
    const qp = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    const url = `${this.restUrl}${REST_ROOT_HISTORY}?${qp.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getRootHistory: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as RootHistoryResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – Privacy module (view keys)
  // -----------------------------------------------------------------------

  /**
   * Register a view key for selective disclosure.
   */
  async registerViewKey(params: MsgRegisterViewKeyParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_REGISTER_VIEW_KEY_TYPE_URL,
      value: {
        creator,
        commitmentHex: params.commitmentHex,
        encryptedNote: params.encryptedNote,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Query a coordination intent by ID.
   */
  async getIntent(intentId: number): Promise<IntentInfoResponse> {
    const url = `${this.restUrl}${REST_INTENT}/${intentId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getIntent: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as IntentInfoResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – Agent module
  // -----------------------------------------------------------------------

  /**
   * Register an AI agent on-chain.
   */
  async registerAgent(params: MsgRegisterAgentParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_REGISTER_AGENT_TYPE_URL,
      value: {
        creator,
        pubkey: params.pubkey,
        endpoint: params.endpoint,
        name: params.name,
        supportedTools: params.supportedTools ?? [],
        pricingHint: params.pricingHint ?? "",
        version: params.version ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Submit an agent action on-chain.
   */
  async agentAction(params: MsgAgentActionParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_AGENT_ACTION_TYPE_URL,
      value: {
        creator,
        actionType: params.actionType,
        payload: params.payload,
        proof: params.proof ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Send an on-chain heartbeat liveness signal.
   */
  async agentHeartbeat(params: MsgAgentHeartbeatParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_AGENT_HEARTBEAT_TYPE_URL,
      value: {
        creator,
        nodeHeight: BigInt(params.nodeHeight),
        endpoint: params.endpoint ?? "",
        metadata: params.metadata ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Submit a multi-agent coordination intent.
   */
  async submitIntent(params: MsgSubmitIntentParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_SUBMIT_INTENT_TYPE_URL,
      value: {
        creator,
        intentType: params.intentType,
        description: params.description,
        payload: params.payload,
        minResponses: BigInt(params.minResponses ?? 1),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Respond to a coordination intent.
   */
  async respondToIntent(params: MsgRespondToIntentParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_RESPOND_TO_INTENT_TYPE_URL,
      value: {
        creator,
        intentId: BigInt(params.intentId),
        accepted: params.accepted,
        payload: params.payload ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Finalize or cancel a coordination intent.
   */
  async finalizeIntent(params: MsgFinalizeIntentParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_FINALIZE_INTENT_TYPE_URL,
      value: {
        creator,
        intentId: BigInt(params.intentId),
        cancel: params.cancel ?? false,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Transactions – Privacy module
  // -----------------------------------------------------------------------

  /**
   * Shield tokens – deposit into the shielded pool.
   */
  async shield(params: MsgShieldParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_SHIELD_TYPE_URL,
      value: {
        creator,
        amount: typeof params.amount === "bigint" ? params.amount : BigInt(params.amount),
        coins: params.coins ?? DEFAULT_DENOM,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Private transfer – move tokens within the shielded pool using a ZK proof.
   */
  async privateTransfer(params: MsgPrivateTransferParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_PRIVATE_TRANSFER_TYPE_URL,
      value: {
        creator,
        oldCommitments: params.oldCommitments,
        newCommitments: params.newCommitments,
        nullifiers: params.nullifiers,
        root: params.root,
        proof: params.proof,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Unshield tokens – withdraw from the shielded pool using a ZK proof.
   */
  async unshield(params: MsgUnshieldParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_UNSHIELD_TYPE_URL,
      value: {
        creator,
        commitment: params.commitment,
        nullifier: params.nullifier,
        proof: params.proof,
        amount: typeof params.amount === "bigint" ? params.amount : BigInt(params.amount),
        recipient: params.recipient ?? "",
        root: params.root,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Batch private transfer – submit multiple private transfers in a single transaction.
   */
  async batchPrivateTransfer(params: MsgBatchPrivateTransferParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_BATCH_PRIVATE_TRANSFER_TYPE_URL,
      value: {
        creator,
        transfers: params.transfers,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Governance module
  // -----------------------------------------------------------------------

  /**
   * Query governance proposals.
   *
   * @param status - Optional status filter (e.g. "PROPOSAL_STATUS_VOTING_PERIOD").
   */
  async getProposals(status?: string): Promise<ProposalsResponse> {
    let url = `${this.restUrl}${REST_GOV_PROPOSALS}`;
    if (status) {
      const statusCode =
        status === "voting_period" ? "2" :
        status === "deposit_period" ? "1" :
        status === "passed" ? "3" :
        status === "rejected" ? "4" :
        status;
      url += `?proposal_status=${encodeURIComponent(statusCode)}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getProposals: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ProposalsResponse;
  }

  /**
   * Query a specific governance proposal by ID.
   */
  async getProposal(proposalId: number): Promise<ProposalInfo> {
    const url = `${this.restUrl}${REST_GOV_PROPOSALS}/${proposalId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getProposal: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    return (data.proposal ?? data) as ProposalInfo;
  }

  // -----------------------------------------------------------------------
  // Queries – Param Governance module (clawgovernance)
  // -----------------------------------------------------------------------

  /**
   * Query parameter governance proposals from the clawgovernance module.
   *
   * @param status - Optional status filter: "voting", "passed", "rejected", "executed".
   */
  async getParamProposals(status?: string): Promise<{ proposals: ParamProposalInfo[] }> {
    let url = `${this.restUrl}/clawchain/governance/v1/proposals`;
    if (status) {
      url += `?status=${encodeURIComponent(status)}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getParamProposals: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as { proposals: ParamProposalInfo[] };
  }

  /**
   * Query a specific parameter governance proposal by ID.
   */
  async getParamProposal(proposalId: number): Promise<ParamProposalInfo> {
    const url = `${this.restUrl}/clawchain/governance/v1/proposal/${proposalId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getParamProposal: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    return (data.proposal ?? data) as ParamProposalInfo;
  }

  /**
   * Query votes for a parameter governance proposal.
   */
  async getParamProposalVotes(proposalId: number): Promise<{ votes: ParamVoteInfo[] }> {
    const url = `${this.restUrl}/clawchain/governance/v1/proposal/${proposalId}/votes`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getParamProposalVotes: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as { votes: ParamVoteInfo[] };
  }

  /**
   * Submit a parameter change proposal to the clawgovernance module.
   */
  async submitParamProposal(params: {
    title: string;
    description: string;
    module: string;
    paramKey: string;
    proposedValue: string;
    deposit: string;
  }): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    const msg = {
      typeUrl: "/clawchain.clawgovernance.v1.MsgSubmitParamProposal",
      value: {
        creator: sender,
        title: params.title,
        description: params.description,
        module: params.module,
        param_key: params.paramKey,
        proposed_value: params.proposedValue,
        deposit: params.deposit,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Cast a vote on a parameter governance proposal.
   *
   * @param proposalId - ID of the proposal.
   * @param option - "yes", "no", or "abstain".
   */
  async castParamVote(proposalId: number, option: string): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    const msg = {
      typeUrl: "/clawchain.clawgovernance.v1.MsgCastVote",
      value: {
        creator: sender,
        proposal_id: proposalId,
        option,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Messaging module
  // -----------------------------------------------------------------------

  /**
   * Query on-chain messages for a given address (as sender or recipient).
   */
  async getMessages(address: string): Promise<MessagesResponse> {
    const url = `${this.restUrl}${REST_MESSAGES}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getMessages: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as MessagesResponse;
  }

  /**
   * Query on-chain conversation between two addresses.
   */
  async getConversation(addressA: string, addressB: string): Promise<ConversationResponse> {
    const url = `${this.restUrl}${REST_CONVERSATION}/${encodeURIComponent(addressA)}/${encodeURIComponent(addressB)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getConversation: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ConversationResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – Messaging module
  // -----------------------------------------------------------------------

  /**
   * Send an encrypted on-chain message to another agent.
   */
  async sendOnChainMessage(params: MsgSendMessageParams): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    const msg = {
      typeUrl: MSG_SEND_MESSAGE_TYPE_URL,
      value: {
        sender,
        recipient: params.recipient,
        ciphertext: params.ciphertext,
        nonce: params.nonce,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Acknowledge receipt of an on-chain message.
   */
  async ackMessage(params: MsgAckMessageParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_ACK_MESSAGE_TYPE_URL,
      value: {
        creator,
        messageId: BigInt(params.messageId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Transactions – Governance module
  // -----------------------------------------------------------------------

  /**
   * Submit a governance proposal (text-only, no inner messages).
   */
  async submitProposal(params: MsgSubmitProposalParams): Promise<TxResult> {
    this.ensureSigningClient();
    const proposer = this.signerAddress!;

    const msg = {
      typeUrl: MSG_SUBMIT_PROPOSAL_TYPE_URL,
      value: {
        proposer,
        title: params.title,
        summary: params.summary,
        metadata: params.metadata ?? "",
        initialDeposit: params.initialDeposit,
        expedited: params.expedited ?? false,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(proposer, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Vote on a governance proposal.
   */
  async vote(params: MsgVoteParams): Promise<TxResult> {
    this.ensureSigningClient();
    const voter = this.signerAddress!;

    const optionNum = VOTE_OPTION_MAP[params.option] ?? 0;

    const msg = {
      typeUrl: MSG_VOTE_TYPE_URL,
      value: {
        proposalId: BigInt(params.proposalId),
        voter,
        option: optionNum,
        metadata: params.metadata ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(voter, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Deposit tokens on a governance proposal.
   */
  async deposit(params: MsgDepositParams): Promise<TxResult> {
    this.ensureSigningClient();
    const depositor = this.signerAddress!;

    const msg = {
      typeUrl: MSG_DEPOSIT_TYPE_URL,
      value: {
        proposalId: BigInt(params.proposalId),
        depositor,
        amount: params.amount,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(depositor, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Marketplace module
  // -----------------------------------------------------------------------

  /**
   * Query all marketplace skills.
   */
  async getSkills(): Promise<SkillsResponse> {
    const url = `${this.restUrl}${REST_MARKETPLACE_SKILLS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getSkills: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as SkillsResponse;
  }

  /**
   * Query a specific marketplace skill by ID.
   */
  async getSkill(skillId: number): Promise<SkillInfo> {
    const url = `${this.restUrl}${REST_MARKETPLACE_SKILL}/${skillId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getSkill: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    return (data.skill ?? data) as SkillInfo;
  }

  // -----------------------------------------------------------------------
  // Transactions – Marketplace module
  // -----------------------------------------------------------------------

  /**
   * List a skill on the marketplace.
   */
  async listSkill(params: MsgListSkillParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_LIST_SKILL_TYPE_URL,
      value: {
        creator,
        name: params.name,
        description: params.description,
        price: params.price,
        denom: params.denom ?? DEFAULT_DENOM,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Delist a skill from the marketplace.
   */
  async delistSkill(params: MsgDelistSkillParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_DELIST_SKILL_TYPE_URL,
      value: {
        creator,
        skillId: BigInt(params.skillId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Purchase a skill from the marketplace.
   */
  async purchaseSkill(params: MsgPurchaseSkillParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_PURCHASE_SKILL_TYPE_URL,
      value: {
        creator,
        skillId: BigInt(params.skillId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Reputation module
  // -----------------------------------------------------------------------

  /** Query an agent's reputation. */
  async getReputation(address: string): Promise<ReputationResponse> {
    const url = `${this.restUrl}${REST_REPUTATION}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getReputation: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ReputationResponse;
  }

  /** Query ratings for an agent. */
  async getRatings(address: string): Promise<RatingsResponse> {
    const url = `${this.restUrl}${REST_RATINGS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getRatings: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as RatingsResponse;
  }

  /** Query endorsements for an agent. */
  async getEndorsements(address: string): Promise<EndorsementsResponse> {
    const url = `${this.restUrl}${REST_ENDORSEMENTS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getEndorsements: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as EndorsementsResponse;
  }

  /** Query top agents by reputation score. */
  async getTopAgents(limit: number = 10): Promise<TopAgentsResponse> {
    const url = `${this.restUrl}${REST_TOP_AGENTS}?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getTopAgents: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as TopAgentsResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – Reputation module
  // -----------------------------------------------------------------------

  /** Rate an agent (requires prior purchase). */
  async rateAgent(params: MsgRateAgentParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_RATE_AGENT_TYPE_URL,
      value: {
        creator,
        agentAddress: params.agentAddress,
        skillId: BigInt(params.skillId),
        score: BigInt(params.score),
        comment: params.comment ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Endorse another registered agent. */
  async endorseAgent(params: MsgEndorseAgentParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_ENDORSE_AGENT_TYPE_URL,
      value: {
        creator,
        agentAddress: params.agentAddress,
        reason: params.reason,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Escrow (marketplace extension)
  // -----------------------------------------------------------------------

  /** Query a single escrow agreement by ID. */
  async getEscrow(escrowId: number): Promise<EscrowResponse> {
    const url = `${this.restUrl}${REST_ESCROW}/${escrowId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getEscrow: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as EscrowResponse;
  }

  /** Query escrows by address (as buyer or seller). */
  async getEscrows(address: string): Promise<EscrowsResponse> {
    const url = `${this.restUrl}${REST_ESCROWS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getEscrows: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as EscrowsResponse;
  }

  /** Query a dispute by escrow ID. */
  async getDispute(escrowId: number): Promise<DisputeResponse> {
    const url = `${this.restUrl}${REST_DISPUTE}/${escrowId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getDispute: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as DisputeResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – Escrow (marketplace extension)
  // -----------------------------------------------------------------------

  /** Create an escrow agreement for a skill. */
  async createEscrow(params: MsgCreateEscrowParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_CREATE_ESCROW_TYPE_URL,
      value: {
        creator,
        skillId: BigInt(params.skillId),
        deadlineBlocks: BigInt(params.deadlineBlocks),
        description: params.description,
        milestones: BigInt(params.milestones ?? 0),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Complete an escrow (buyer confirms delivery). */
  async completeEscrow(params: MsgCompleteEscrowParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_COMPLETE_ESCROW_TYPE_URL,
      value: {
        creator,
        escrowId: BigInt(params.escrowId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Complete a milestone in an escrow. */
  async completeMilestone(params: MsgCompleteMilestoneParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_COMPLETE_MILESTONE_TYPE_URL,
      value: {
        creator,
        escrowId: BigInt(params.escrowId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Dispute an escrow agreement. */
  async disputeEscrow(params: MsgDisputeEscrowParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_DISPUTE_ESCROW_TYPE_URL,
      value: {
        creator,
        escrowId: BigInt(params.escrowId),
        reason: params.reason,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Skill versioning & analytics (marketplace extension)
  // -----------------------------------------------------------------------

  /** Query skills by category. */
  async getSkillsByCategory(category: string): Promise<SkillsResponse> {
    const url = `${this.restUrl}${REST_SKILLS_BY_CATEGORY}/${encodeURIComponent(category)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getSkillsByCategory: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as SkillsResponse;
  }

  /** Query skills by owner address. */
  async getSkillsByOwner(owner: string): Promise<SkillsResponse> {
    const url = `${this.restUrl}${REST_SKILLS_BY_OWNER}/${encodeURIComponent(owner)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getSkillsByOwner: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as SkillsResponse;
  }

  /** Search skills by name/description/tags. */
  async searchSkills(query: string): Promise<SkillsResponse> {
    const url = `${this.restUrl}${REST_SKILL_SEARCH}/${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.searchSkills: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as SkillsResponse;
  }

  /** Query analytics for a skill. */
  async getSkillAnalytics(skillId: number): Promise<SkillAnalyticsResponse> {
    const url = `${this.restUrl}${REST_SKILL_ANALYTICS}/${skillId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getSkillAnalytics: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as SkillAnalyticsResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – Skill versioning (marketplace extension)
  // -----------------------------------------------------------------------

  /** Update a listed skill (auto-increments version). */
  async updateSkill(params: MsgUpdateSkillParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_UPDATE_SKILL_TYPE_URL,
      value: {
        creator,
        skillId: BigInt(params.skillId),
        description: params.description ?? "",
        price: params.price ?? "",
        category: params.category ?? "",
        tags: params.tags ?? [],
        dependencies: (params.dependencies ?? []).map((d) => BigInt(d)),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Agent activity (agent extension)
  // -----------------------------------------------------------------------

  /** Query activity events for a specific agent. */
  async getAgentActivity(address: string, limit: number = 50, offset: number = 0): Promise<AgentActivityResponse> {
    const qp = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const url = `${this.restUrl}${REST_AGENT_ACTIVITY}/${encodeURIComponent(address)}?${qp.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getAgentActivity: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as AgentActivityResponse;
  }

  /** Query aggregate stats for an agent. */
  async getAgentStats(address: string): Promise<AgentStatsResponse> {
    const url = `${this.restUrl}${REST_AGENT_STATS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getAgentStats: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as AgentStatsResponse;
  }

  /** Query recent global activity events. */
  async getRecentActivity(limit: number = 50): Promise<RecentActivityResponse> {
    const url = `${this.restUrl}${REST_RECENT_ACTIVITY}?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getRecentActivity: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as RecentActivityResponse;
  }

  /** Query agent liveness (heartbeat) status. */
  async getAgentLiveness(address: string): Promise<AgentLivenessResponse> {
    const url = `${this.restUrl}${REST_AGENT_LIVENESS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getAgentLiveness: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as AgentLivenessResponse;
  }

  /**
   * Query all currently live agents (those with recent heartbeats within the
   * configured max_heartbeat_gap_blocks window).
   */
  async getLiveAgents(): Promise<LiveAgentsResponse> {
    const url = `${this.restUrl}${REST_LIVE_AGENTS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getLiveAgents: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as LiveAgentsResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – IBC cross-chain privacy
  // -----------------------------------------------------------------------

  /**
   * Send a basic IBC token transfer (ICS-20 MsgTransfer).
   *
   * @param params - IBC transfer parameters.
   */
  async ibcTransfer(params: IBCTransferParams): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    // Default timeout: 10 minutes from now (in nanoseconds)
    const defaultTimeoutNs = BigInt(Date.now() + 10 * 60 * 1000) * 1_000_000n;
    const timeoutTimestamp = params.timeoutTimestamp ?? defaultTimeoutNs;

    const msg = {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel: params.sourceChannel,
        token: {
          denom: params.denom,
          amount: params.amount,
        },
        sender,
        receiver: params.receiver,
        timeoutHeight: params.timeoutHeight
          ? { revisionNumber: 0n, revisionHeight: BigInt(params.timeoutHeight) }
          : { revisionNumber: 0n, revisionHeight: 0n },
        timeoutTimestamp,
        memo: params.memo ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Delegate a task to a remote agent via IBC.
   *
   * Sends an ICS-20 transfer with the task delegation metadata in the memo
   * field. The receiving chain's agent IBC middleware creates the task.
   *
   * @param params - Task delegation parameters.
   */
  async ibcDelegateTask(params: IBCDelegateTaskParams): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    const budgetAmount = params.budget.replace(/[^0-9]/g, "") || "1";
    const denom = params.denom ?? DEFAULT_DENOM;

    const memo = JSON.stringify({
      [IBC_AGENT_MEMO_KEY]: {
        action: "delegate_task",
        task: {
          assignee: params.assignee,
          description: params.description,
          requirements: params.requirements ?? "",
          budget: params.budget,
          deadline_blocks: params.deadlineBlocks ?? 200,
        },
      },
    });

    const defaultTimeoutNs = BigInt(Date.now() + 10 * 60 * 1000) * 1_000_000n;
    const timeoutTimestamp = params.timeoutTimestamp ?? defaultTimeoutNs;

    const msg = {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel: params.sourceChannel,
        token: {
          denom,
          amount: budgetAmount,
        },
        sender,
        receiver: params.assignee,
        timeoutHeight: { revisionNumber: 0n, revisionHeight: 0n },
        timeoutTimestamp,
        memo,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Send tokens via IBC with optional auto-shielding on the destination chain.
   *
   * Uses the standard ICS-20 MsgTransfer with a privacy memo that instructs
   * the ClawChain IBC middleware on the receiving chain to auto-shield the
   * tokens into the privacy pool.
   *
   * @param params - IBC transfer parameters including channel, amount, and receiver.
   */
  async ibcShieldTransfer(params: IBCShieldTransferParams): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    // Build the privacy memo
    const autoShield = params.autoShield !== false; // default true
    const memo = JSON.stringify({
      [IBC_PRIVACY_MEMO_KEY]: { auto_shield: autoShield },
    });

    // Default timeout: 10 minutes from now (in nanoseconds)
    const defaultTimeoutNs = BigInt(Date.now() + 10 * 60 * 1000) * 1_000_000n;
    const timeoutTimestamp = params.timeoutTimestamp ?? defaultTimeoutNs;

    const msg = {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel: params.sourceChannel,
        token: {
          denom: params.denom,
          amount: params.amount,
        },
        sender,
        receiver: params.receiver,
        timeoutHeight: params.timeoutHeight
          ? { revisionNumber: 0n, revisionHeight: BigInt(params.timeoutHeight) }
          : { revisionNumber: 0n, revisionHeight: 0n },
        timeoutTimestamp,
        memo,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Transactions – Token transfers
  // -----------------------------------------------------------------------

  /**
   * Send tokens from the signer to a recipient address.
   *
   * @param recipient - Bech32 recipient address.
   * @param amount    - Amount to send (as string, e.g. "1000000").
   * @param denom     - Token denomination (default: "uclaw").
   */
  async sendTokens(
    recipient: string,
    amount: string,
    denom: string = DEFAULT_DENOM,
  ): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    const res = await this.signingClient!.sendTokens(
      sender,
      recipient,
      [{ denom, amount }],
      "auto",
    );
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Transactions – Task delegation (agent module)
  // -----------------------------------------------------------------------

  /** Delegate a task to another agent. */
  async delegateTask(params: MsgDelegateTaskParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_DELEGATE_TASK_TYPE_URL,
      value: {
        creator,
        assignee: params.assignee,
        description: params.description,
        requirements: params.requirements ?? "",
        skillId: BigInt(params.skillId ?? 0),
        budget: params.budget ?? "",
        deadlineBlocks: BigInt(params.deadlineBlocks ?? 0),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Accept a delegated task. */
  async acceptTask(params: MsgAcceptTaskParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_ACCEPT_TASK_TYPE_URL,
      value: {
        creator,
        taskId: BigInt(params.taskId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Complete a task with a result. */
  async completeTask(params: MsgCompleteTaskParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_COMPLETE_TASK_TYPE_URL,
      value: {
        creator,
        taskId: BigInt(params.taskId),
        result: params.result,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Deregister an agent and withdraw its deposit.
   */
  async deregisterAgent(): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_DEREGISTER_AGENT_TYPE_URL,
      value: {
        creator,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Task delegation (agent module)
  // -----------------------------------------------------------------------

  /** Query a task by ID. */
  async getTask(taskId: number): Promise<TaskInfoResponse> {
    const url = `${this.restUrl}${REST_TASK}/${taskId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getTask: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as TaskInfoResponse;
  }

  /** Query tasks delegated by an address. */
  async getTasksByDelegator(address: string): Promise<TasksResponse> {
    const url = `${this.restUrl}${REST_TASKS_BY_DELEGATOR}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getTasksByDelegator: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as TasksResponse;
  }

  /** Query tasks assigned to an address. */
  async getTasksByAssignee(address: string): Promise<TasksResponse> {
    const url = `${this.restUrl}${REST_TASKS_BY_ASSIGNEE}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getTasksByAssignee: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as TasksResponse;
  }

  // -----------------------------------------------------------------------
  // Queries – Agent mining rewards
  // -----------------------------------------------------------------------

  /** Query cumulative agent mining rewards for an address. */
  async getAgentRewards(address: string): Promise<{ address: string; cumulativeRewards: string; denom: string }> {
    const url = `${this.restUrl}/clawchain/agent/v1/rewards/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getAgentRewards: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      address: (data.address as string) || address,
      cumulativeRewards: (data.cumulative_rewards as string) || (data.cumulativeRewards as string) || "0",
      denom: (data.denom as string) || "uclaw",
    };
  }

  // -----------------------------------------------------------------------
  // Transactions – Skill purchase with task tracking
  // -----------------------------------------------------------------------

  /**
   * Purchase a skill and track the auto-created task.
   * Returns the transaction hash and, if available, the auto-created task ID
   * extracted from the transaction events.
   */
  async purchaseAndTrackSkill(skillId: number): Promise<{ txHash: string; taskId?: number }> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_PURCHASE_SKILL_TYPE_URL,
      value: {
        creator,
        skillId: BigInt(skillId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract task_id from events if available.
    let taskId: number | undefined;
    for (const event of txResult.events) {
      if (event.type === "purchase_skill" || event.type === "skill_task_created") {
        const taskAttr = event.attributes.find(
          (a) => a.key === "task_id",
        );
        if (taskAttr) {
          taskId = parseInt(taskAttr.value, 10);
          break;
        }
      }
    }

    return { txHash: txResult.transactionHash, taskId };
  }

  // -----------------------------------------------------------------------
  // Queries -- IBC cross-chain agent discovery
  // -----------------------------------------------------------------------

  /** Query all remote agents discovered via IBC announcements. */
  async getRemoteAgents(): Promise<Array<{ chainId: string; address: string; name: string; endpoint: string; tools: string[] }>> {
    const url = `${this.restUrl}/clawchain/agent/v1/remote_agents`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getRemoteAgents: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const agents = (data.agents as Array<Record<string, unknown>>) ?? [];
    return agents.map((a) => ({
      chainId: (a.chain_id as string) || (a.chainId as string) || "",
      address: (a.address as string) || "",
      name: (a.name as string) || "",
      endpoint: (a.endpoint as string) || "",
      tools: (a.tools as string[]) || [],
    }));
  }

  // -----------------------------------------------------------------------
  // Transactions -- IBC agent discovery
  // -----------------------------------------------------------------------

  /**
   * Send an IBC transfer with agent discovery memo to discover agents on a
   * remote chain. This sends a minimal token transfer with a special memo
   * that the agent IBC middleware on the remote chain will intercept.
   *
   * @param channelId    - IBC channel to the target chain.
   * @param capabilities - Tool/capability filter for the discovery request.
   */
  async discoverAgentsIBC(
    channelId: string,
    capabilities: string[] = [],
  ): Promise<{ transactionHash: string }> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    const memo = JSON.stringify({
      [IBC_AGENT_MEMO_KEY]: {
        action: "discover",
        capabilities,
        max_results: 10,
      },
    });

    // Default timeout: 10 minutes from now (in nanoseconds)
    const defaultTimeoutNs = BigInt(Date.now() + 10 * 60 * 1000) * 1_000_000n;

    const msg = {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel: channelId,
        token: {
          denom: DEFAULT_DENOM,
          amount: "1", // minimal amount for discovery ping
        },
        sender,
        receiver: sender, // self-addressed for discovery
        timeoutHeight: { revisionNumber: 0n, revisionHeight: 0n },
        timeoutTimestamp: defaultTimeoutNs,
        memo,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return { transactionHash: res.transactionHash };
  }

  // -----------------------------------------------------------------------
  // Transactions -- IBC task delegation
  // -----------------------------------------------------------------------

  /**
   * Delegate a task to a ClawChain agent on a remote chain via IBC transfer
   * with a task delegation memo. The transfer amount serves as the task budget.
   *
   * @param channelId      - IBC channel to the target chain.
   * @param assignee       - Bech32 address of the agent to assign the task to.
   * @param description    - Description of the task to delegate.
   * @param budget         - Budget for the task (e.g. "1000000uclaw").
   * @param deadlineBlocks - Optional deadline in blocks (default: 200).
   * @param requirements   - Optional requirements string.
   * @param skillId        - Optional skill ID.
   */
  async delegateTaskIBC(
    channelId: string,
    assignee: string,
    description: string,
    budget: string,
    deadlineBlocks?: number,
    requirements?: string,
    skillId?: number,
  ): Promise<TxResult> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    // Parse the budget to extract amount and denom.
    const amountMatch = budget.match(/^(\d+)(.*)$/);
    const amount = amountMatch ? amountMatch[1] : budget;
    const denom = amountMatch && amountMatch[2] ? amountMatch[2] : DEFAULT_DENOM;

    const taskReq: Record<string, unknown> = {
      description,
      assignee,
      budget,
      deadline_blocks: deadlineBlocks ?? 200,
    };
    if (requirements) taskReq.requirements = requirements;
    if (skillId !== undefined) taskReq.skill_id = skillId;

    const memo = JSON.stringify({
      [IBC_AGENT_MEMO_KEY]: {
        action: "delegate_task",
        task: taskReq,
      },
    });

    // Default timeout: 10 minutes from now (in nanoseconds)
    const defaultTimeoutNs = BigInt(Date.now() + 10 * 60 * 1000) * 1_000_000n;

    const msg = {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel: channelId,
        token: {
          denom,
          amount,
        },
        sender,
        receiver: assignee,
        timeoutHeight: { revisionNumber: 0n, revisionHeight: 0n },
        timeoutTimestamp: defaultTimeoutNs,
        memo,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Query a task result on a remote chain via IBC. Sends a minimal token
   * transfer with a query_task memo; the result comes back in the
   * acknowledgement.
   *
   * @param channelId - IBC channel to the target chain.
   * @param taskId    - ID of the task to query.
   */
  async queryTaskIBC(
    channelId: string,
    taskId: number,
  ): Promise<{ taskId: number; status: string; result: string }> {
    this.ensureSigningClient();
    const sender = this.signerAddress!;

    const memo = JSON.stringify({
      [IBC_AGENT_MEMO_KEY]: {
        action: "query_task",
        task_result: { task_id: taskId },
      },
    });

    // Default timeout: 10 minutes from now (in nanoseconds)
    const defaultTimeoutNs = BigInt(Date.now() + 10 * 60 * 1000) * 1_000_000n;

    const msg = {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel: channelId,
        token: {
          denom: DEFAULT_DENOM,
          amount: "1", // minimal amount for query ping
        },
        sender,
        receiver: sender, // self-addressed for query
        timeoutHeight: { revisionNumber: 0n, revisionHeight: 0n },
        timeoutTimestamp: defaultTimeoutNs,
        memo,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    // The actual task result will be returned in the IBC acknowledgement
    // which the relayer processes. Here we return the tx result and the
    // caller can parse the ack from events.
    return {
      taskId,
      status: res.code === 0 ? "query_sent" : "failed",
      result: res.transactionHash,
    };
  }

  // -----------------------------------------------------------------------
  // Queries – GPU Compute Marketplace
  // -----------------------------------------------------------------------

  /** Query all compute resources, optionally filtering to only available ones. */
  async getComputeResources(onlyAvailable?: boolean): Promise<ComputeResourcesResponse> {
    const qs = onlyAvailable ? "?only_available=true" : "";
    const url = `${this.restUrl}${REST_COMPUTE_RESOURCES}${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getComputeResources: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ComputeResourcesResponse;
  }

  /** Query a single compute resource by ID. */
  async getComputeResource(resourceId: number): Promise<ComputeResourceResponse> {
    const url = `${this.restUrl}${REST_COMPUTE_RESOURCE}/${resourceId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getComputeResource: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ComputeResourceResponse;
  }

  /** Query compute leases for a given address (or all if omitted). */
  async getComputeLeases(address?: string): Promise<ComputeLeasesResponse> {
    const addrPart = address ? `/${encodeURIComponent(address)}` : "";
    const url = `${this.restUrl}${REST_COMPUTE_LEASES}${addrPart}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getComputeLeases: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ComputeLeasesResponse;
  }

  // -----------------------------------------------------------------------
  // Transactions – GPU Compute Marketplace
  // -----------------------------------------------------------------------

  /** List a GPU compute resource on the marketplace. */
  async listComputeResource(resource: ComputeResourceInput): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_LIST_COMPUTE_RESOURCE_TYPE_URL,
      value: {
        creator,
        name: resource.name,
        description: resource.description,
        gpuModel: resource.gpuModel,
        gpuCount: resource.gpuCount,
        vramGb: resource.vramGb,
        cpuCores: resource.cpuCores,
        ramGb: resource.ramGb,
        storageGb: resource.storageGb,
        pricePerHourUclaw: resource.pricePerHourUclaw,
        minLeaseHours: resource.minLeaseHours,
        maxLeaseHours: resource.maxLeaseHours ?? 0,
        region: resource.region ?? "",
        endpoint: resource.endpoint,
        tags: resource.tags ?? [],
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Lease a GPU compute resource. */
  async leaseComputeResource(resourceId: number, hours: number): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_LEASE_COMPUTE_RESOURCE_TYPE_URL,
      value: {
        creator,
        resourceId: BigInt(resourceId),
        hours: BigInt(hours),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Release (end) a GPU compute lease. */
  async releaseComputeResource(leaseId: number): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_RELEASE_COMPUTE_RESOURCE_TYPE_URL,
      value: {
        creator,
        leaseId: BigInt(leaseId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – GPU Compute Jobs & Provider Stats
  // -----------------------------------------------------------------------

  /** Query compute jobs by address and/or resource ID. */
  async getComputeJobs(address?: string, resourceId?: number): Promise<ComputeJobsResponse> {
    const params: string[] = [];
    if (address) params.push(`address=${encodeURIComponent(address)}`);
    if (resourceId !== undefined) params.push(`resource_id=${resourceId}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    const url = `${this.restUrl}${REST_COMPUTE_JOBS}${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getComputeJobs: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ComputeJobsResponse;
  }

  /** Query a single compute job by ID. */
  async getComputeJob(jobId: string | number): Promise<ComputeJobResponse> {
    const url = `${this.restUrl}${REST_COMPUTE_JOB}/${encodeURIComponent(String(jobId))}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getComputeJob: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ComputeJobResponse;
  }

  /** Query aggregate stats for a compute provider. */
  async getProviderStats(address: string): Promise<ProviderStatsResponse> {
    const url = `${this.restUrl}${REST_PROVIDER_STATS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getProviderStats: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as ProviderStatsResponse;
  }

  /**
   * List all registered GPU providers, optionally filtering by active status.
   *
   * Queries the marketplace module REST endpoint for GPU providers.
   */
  async listGPUProviders(activeOnly?: boolean): Promise<GPUProvidersResponse> {
    const qs = activeOnly ? "?active=true" : "";
    const url = `${this.restUrl}${REST_GPU_PROVIDERS}${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.listGPUProviders: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as GPUProvidersResponse;
  }

  /**
   * Get a single GPU provider's details by address.
   */
  async getGPUProvider(address: string): Promise<GPUProviderResponse> {
    const url = `${this.restUrl}${REST_GPU_PROVIDERS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getGPUProvider: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as GPUProviderResponse;
  }

  /**
   * Submit a GPU compute job. High-level wrapper around submitComputeJob.
   *
   * This is an alias for submitComputeJob with a simpler interface for the
   * common case of submitting a job with minimal parameters.
   */
  async submitGPUJob(params: {
    resourceId: number;
    leaseId: number;
    name: string;
    jobType?: string;
    executionType?: string;
    dockerImage?: string;
    scriptContent?: string;
    inputDataUri?: string;
    outputDataUri?: string;
    params?: string;
  }): Promise<{ txHash: string; jobId?: number }> {
    return this.submitComputeJob(params.resourceId, params.leaseId, {
      name: params.name,
      jobType: params.jobType,
      executionType: params.executionType,
      dockerImage: params.dockerImage,
      scriptContent: params.scriptContent,
      inputDataUri: params.inputDataUri,
      outputDataUri: params.outputDataUri,
      params: params.params,
    });
  }

  /**
   * Get the status of a GPU compute job by ID.
   *
   * This is an alias for getComputeJob that returns a simpler response
   * focused on GPU job lifecycle status.
   */
  async getGPUJobStatus(jobId: number | string): Promise<ComputeJobResponse> {
    return this.getComputeJob(jobId);
  }

  // -----------------------------------------------------------------------
  // Transactions – GPU Compute Jobs & Metrics
  // -----------------------------------------------------------------------

  /** Submit a GPU compute job to a leased resource. */
  async submitComputeJob(resourceId: number, leaseId: number, job: ComputeJobInput): Promise<{ txHash: string; jobId?: number }> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_SUBMIT_COMPUTE_JOB_TYPE_URL,
      value: {
        creator,
        resourceId: BigInt(resourceId),
        leaseId: BigInt(leaseId),
        name: job.name,
        jobType: job.jobType ?? "general",
        executionType: job.executionType ?? "docker",
        dockerImage: job.dockerImage ?? "",
        scriptContent: job.scriptContent ?? "",
        inputDataUri: job.inputDataUri ?? "",
        outputDataUri: job.outputDataUri ?? "",
        params: job.params ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract job_id from events
    let jobId: number | undefined;
    for (const event of txResult.events) {
      if (event.type === "submit_compute_job") {
        const attr = event.attributes.find((a) => a.key === "job_id");
        if (attr) {
          jobId = parseInt(attr.value, 10);
          break;
        }
      }
    }

    return { txHash: txResult.transactionHash, jobId };
  }

  /** Update GPU metrics for a compute resource (provider heartbeat). */
  async updateGPUMetrics(resourceId: number, metrics: GPUMetrics): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_UPDATE_GPU_METRICS_TYPE_URL,
      value: {
        creator,
        resourceId: BigInt(resourceId),
        utilizationGpu: metrics.utilizationGpu,
        utilizationMem: metrics.utilizationMem,
        temperature: metrics.temperature,
        powerDrawWatts: metrics.powerDrawWatts,
        memoryUsedMb: BigInt(metrics.memoryUsedMb),
        memoryTotalMb: BigInt(metrics.memoryTotalMb),
        isHealthy: metrics.isHealthy,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Transactions – Agent Negotiation
  // -----------------------------------------------------------------------

  /** Propose a negotiation with another agent. */
  async proposeNegotiation(params: MsgProposeNegotiationParams): Promise<{ txHash: string; negotiationId?: number }> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_PROPOSE_NEGOTIATION_TYPE_URL,
      value: {
        creator,
        counterparty: params.counterparty,
        description: params.description,
        requirements: params.requirements ?? "",
        skillId: BigInt(params.skillId ?? 0),
        budget: params.budget,
        deadlineBlocks: BigInt(params.deadlineBlocks),
        maxRounds: BigInt(params.maxRounds ?? 5),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract negotiation_id from events.
    let negotiationId: number | undefined;
    for (const event of txResult.events) {
      if (event.type === "negotiation_proposed") {
        const attr = event.attributes.find((a) => a.key === "negotiation_id");
        if (attr) {
          negotiationId = parseInt(attr.value, 10);
          break;
        }
      }
    }

    return { txHash: txResult.transactionHash, negotiationId };
  }

  /** Counter-propose different terms on an existing negotiation. */
  async counterNegotiation(params: MsgCounterNegotiationParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_COUNTER_NEGOTIATION_TYPE_URL,
      value: {
        creator,
        negotiationId: BigInt(params.negotiationId),
        newBudget: params.newBudget,
        newDeadline: BigInt(params.newDeadline),
        message: params.message ?? "",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Accept the current terms of a negotiation and create a task. */
  async acceptNegotiation(params: MsgAcceptNegotiationParams): Promise<{ txHash: string; taskId?: number }> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_ACCEPT_NEGOTIATION_TYPE_URL,
      value: {
        creator,
        negotiationId: BigInt(params.negotiationId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract task_id from events.
    let taskId: number | undefined;
    for (const event of txResult.events) {
      if (event.type === "negotiation_accepted") {
        const attr = event.attributes.find((a) => a.key === "task_id");
        if (attr) {
          taskId = parseInt(attr.value, 10);
          break;
        }
      }
    }

    return { txHash: txResult.transactionHash, taskId };
  }

  /** Reject a negotiation. */
  async rejectNegotiation(params: MsgRejectNegotiationParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_REJECT_NEGOTIATION_TYPE_URL,
      value: {
        creator,
        negotiationId: BigInt(params.negotiationId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Agent Negotiation
  // -----------------------------------------------------------------------

  /** Query negotiations for an agent address (or all if omitted). */
  async getNegotiations(address?: string): Promise<Negotiation[]> {
    const addrPart = address ? `/${encodeURIComponent(address)}` : "";
    const url = `${this.restUrl}${REST_NEGOTIATIONS_BY_AGENT}${addrPart}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getNegotiations: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as NegotiationsResponse;
    return data.negotiations ?? [];
  }

  /** Query a single negotiation by ID. */
  async getNegotiation(id: number): Promise<Negotiation> {
    const url = `${this.restUrl}${REST_NEGOTIATION}/${id}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getNegotiation: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as NegotiationResponse;
    return data.negotiation;
  }

  // -----------------------------------------------------------------------
  // Convenience – Agent Negotiation (high-level wrappers)
  // -----------------------------------------------------------------------

  /**
   * Submit a new negotiation to a counterparty using structured terms.
   *
   * This is a convenience wrapper around {@link proposeNegotiation} that
   * accepts a {@link NegotiationTerms} object instead of flat parameters.
   */
  async submitNegotiation(
    counterparty: string,
    terms: NegotiationTerms,
  ): Promise<{ txHash: string; negotiationId?: number }> {
    return this.proposeNegotiation({
      counterparty,
      description: terms.description,
      budget: terms.price,
      deadlineBlocks: terms.duration,
      requirements: JSON.stringify({ quality_tier: terms.quality_tier }),
    });
  }

  /**
   * Respond to an existing negotiation — accept, reject, or counter-propose.
   *
   * When {@link accept} is `true` the negotiation is accepted and a task is
   * created.  When `false` and {@link counterTerms} is provided the response
   * is a counter-proposal; otherwise the negotiation is rejected.
   */
  async respondToNegotiation(
    negotiationId: number,
    accept: boolean,
    counterTerms?: NegotiationTerms,
  ): Promise<TxResult> {
    if (accept) {
      const result = await this.acceptNegotiation({ negotiationId });
      return {
        transactionHash: result.txHash,
        code: 0,
        rawLog: "",
        gasUsed: 0,
        gasWanted: 0,
        height: 0,
        events: [],
      };
    }
    if (counterTerms) {
      return this.counterNegotiation({
        negotiationId,
        newBudget: counterTerms.price,
        newDeadline: counterTerms.duration,
        message: counterTerms.description,
      });
    }
    return this.rejectNegotiation({ negotiationId });
  }

  // -----------------------------------------------------------------------
  // Queries – Model Registry
  // -----------------------------------------------------------------------

  /** Query all models, optionally filtering by framework or free access. */
  async getModels(framework?: string, onlyFree?: boolean): Promise<ModelRecord[]> {
    const params: string[] = [];
    if (framework) params.push(`framework=${encodeURIComponent(framework)}`);
    if (onlyFree) params.push("only_free=true");
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    const url = `${this.restUrl}${REST_MODELS}${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getModels: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as ModelsResponse;
    return data.models ?? [];
  }

  /** Query a single model by ID. */
  async getModel(modelId: number): Promise<ModelRecord> {
    const url = `${this.restUrl}${REST_MODEL}/${modelId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getModel: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as ModelResponse;
    return data.model;
  }

  /** Query all versions for a model. */
  async getModelVersions(modelId: number): Promise<ModelVersion[]> {
    const url = `${this.restUrl}${REST_MODEL_VERSIONS}/${modelId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getModelVersions: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as ModelVersionsResponse;
    return data.versions ?? [];
  }

  // -----------------------------------------------------------------------
  // Transactions – Model Registry
  // -----------------------------------------------------------------------

  /** Register a new AI model on-chain. */
  async registerModel(model: ModelInput): Promise<{ txHash: string; modelId?: number }> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_REGISTER_MODEL_TYPE_URL,
      value: {
        creator,
        name: model.name,
        description: model.description,
        framework: model.framework,
        architecture: model.architecture,
        parameterCount: model.parameterCount,
        license: model.license,
        tags: model.tags ?? [],
        storageType: model.storageType,
        storageUri: model.storageUri,
        checksumSha256: model.checksumSha256,
        sizeBytes: BigInt(model.sizeBytes),
        accessType: model.accessType,
        pricePerQueryUclaw: model.pricePerQueryUclaw ?? "0",
        priceOneTimeUclaw: model.priceOneTimeUclaw ?? "0",
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract model_id from events if available.
    let modelId: number | undefined;
    for (const event of txResult.events) {
      if (event.type === "model_registered") {
        const attr = event.attributes.find((a) => a.key === "model_id");
        if (attr) {
          modelId = parseInt(attr.value, 10);
          break;
        }
      }
    }

    return { txHash: txResult.transactionHash, modelId };
  }

  /** Purchase access to a model. */
  async purchaseModelAccess(modelId: number): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_PURCHASE_MODEL_ACCESS_TYPE_URL,
      value: {
        creator,
        modelId: BigInt(modelId),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Rate a model (1-5 stars). */
  async rateModel(modelId: number, rating: number): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    if (rating < 1 || rating > 5) {
      throw new Error("ClawChainClient.rateModel: rating must be between 1 and 5");
    }

    const msg = {
      typeUrl: MSG_RATE_MODEL_TYPE_URL,
      value: {
        creator,
        modelId: BigInt(modelId),
        rating: BigInt(rating),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Inference Marketplace
  // -----------------------------------------------------------------------

  /** Query an inference job by ID. */
  async getInferenceJob(jobId: number): Promise<InferenceJob> {
    const url = `${this.restUrl}${REST_INFERENCE_JOB}/${jobId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getInferenceJob: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as InferenceJobResponse;
    return data.job;
  }

  /** Query inference jobs, optionally filtered by model ID and/or status. */
  async getInferenceJobs(modelId?: number, status?: string): Promise<InferenceJob[]> {
    const params: string[] = [];
    if (modelId !== undefined) params.push(`model_id=${modelId}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    const qs = params.length > 0 ? `?${params.join("&")}` : "";
    const url = `${this.restUrl}${REST_INFERENCE_JOBS}${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getInferenceJobs: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as InferenceJobsResponse;
    return data.jobs ?? [];
  }

  /** Query an inference provider by address. */
  async getInferenceProvider(address: string): Promise<InferenceProvider> {
    const url = `${this.restUrl}${REST_INFERENCE_PROVIDER}/${address}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getInferenceProvider: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as InferenceProviderResponse;
    return data.provider;
  }

  /** Query all inference providers, optionally filtered by model ID. */
  async getInferenceProviders(modelId?: number): Promise<InferenceProvider[]> {
    const qs = modelId !== undefined ? `?model_id=${modelId}` : "";
    const url = `${this.restUrl}${REST_INFERENCE_PROVIDERS}${qs}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getInferenceProviders: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as InferenceProvidersResponse;
    return data.providers ?? [];
  }

  /** Query inference pricing for a model. */
  async getInferencePricing(modelId: number): Promise<InferencePricing> {
    const url = `${this.restUrl}${REST_INFERENCE_PRICING}/${modelId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getInferencePricing: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as InferencePricingResponse;
    return data.pricing;
  }

  // -----------------------------------------------------------------------
  // Transactions – Inference Marketplace
  // -----------------------------------------------------------------------

  /** Register as an inference provider for one or more models. */
  async registerInferenceProvider(params: MsgRegisterInferenceProviderParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_REGISTER_INFERENCE_PROVIDER_TYPE_URL,
      value: {
        creator,
        modelIds: params.modelIds.map((id) => BigInt(id)),
        maxConcurrent: BigInt(params.maxConcurrent ?? 1),
        endpoint: params.endpoint,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Set inference pricing for a model (only model owner). */
  async setInferencePricing(params: MsgSetInferencePricingParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_SET_INFERENCE_PRICING_TYPE_URL,
      value: {
        creator,
        modelId: BigInt(params.modelId),
        pricePerToken: params.pricePerToken,
        pricePerQuery: params.pricePerQuery,
        minPayment: params.minPayment,
        maxTokens: BigInt(params.maxTokens ?? 4096),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /** Submit an inference job to a model. Escrowed payment in uclaw. */
  async submitInferenceJob(params: MsgSubmitInferenceJobParams): Promise<{ txHash: string; jobId?: number }> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_SUBMIT_INFERENCE_JOB_TYPE_URL,
      value: {
        creator,
        modelId: BigInt(params.modelId),
        modelVersion: BigInt(params.modelVersion ?? 0),
        input: params.input,
        maxTokens: BigInt(params.maxTokens ?? 1024),
        temperature: params.temperature ?? "0.7",
        payment: params.payment,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract job_id from events if available.
    let jobId: number | undefined;
    for (const event of txResult.events) {
      if (event.type === "submit_inference_job") {
        const attr = event.attributes.find((a) => a.key === "job_id");
        if (attr) {
          jobId = parseInt(attr.value, 10);
          break;
        }
      }
    }

    return { txHash: txResult.transactionHash, jobId };
  }

  /** Complete an inference job with the output (provider-side). */
  async completeInferenceJob(params: MsgCompleteInferenceJobParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_COMPLETE_INFERENCE_JOB_TYPE_URL,
      value: {
        creator,
        jobId: BigInt(params.jobId),
        output: params.output,
        tokensUsed: BigInt(params.tokensUsed),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – Staking module
  // -----------------------------------------------------------------------

  /**
   * Query staking validators.
   *
   * @param status - Optional bond status filter (e.g. "BOND_STATUS_BONDED").
   */
  async getValidators(status?: string): Promise<ValidatorsResponse> {
    let url = `${this.restUrl}${REST_STAKING_VALIDATORS}`;
    if (status) {
      url += `?status=${encodeURIComponent(status)}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getValidators: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { validators?: any[] };
    const validators: ValidatorInfo[] = (data.validators ?? []).map((v: any) => ({
      operatorAddress: v.operator_address ?? "",
      moniker: v.description?.moniker ?? "",
      tokens: v.tokens ?? "0",
      commission: v.commission?.commission_rates?.rate ?? "0",
      status: v.status ?? "",
      jailed: v.jailed ?? false,
    }));
    return { validators };
  }

  /**
   * Query staking delegations for an address.
   *
   * @param address - Bech32 delegator address.
   */
  async getDelegations(address: string): Promise<DelegationsResponse> {
    const url = `${this.restUrl}${REST_STAKING_DELEGATIONS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getDelegations: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { delegation_responses?: any[] };
    const delegations: DelegationInfo[] = (data.delegation_responses ?? []).map((d: any) => ({
      validatorAddress: d.delegation?.validator_address ?? "",
      shares: d.delegation?.shares ?? "0",
      balance: {
        denom: d.balance?.denom ?? DEFAULT_DENOM,
        amount: d.balance?.amount ?? "0",
      },
    }));
    return { delegations };
  }

  /**
   * Query pending staking rewards for an address.
   *
   * @param address - Bech32 delegator address.
   */
  async getStakingRewards(address: string): Promise<StakingRewardsResponse> {
    const url = `${this.restUrl}${REST_STAKING_REWARDS}/${encodeURIComponent(address)}/rewards`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getStakingRewards: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { rewards?: any[]; total?: any[] };
    const rewards: RewardInfo[] = (data.rewards ?? []).map((r: any) => ({
      validatorAddress: r.validator_address ?? "",
      reward: (r.reward ?? []).map((c: any) => ({
        denom: c.denom ?? DEFAULT_DENOM,
        amount: c.amount ?? "0",
      })),
    }));
    const total = (data.total ?? []).map((c: any) => ({
      denom: c.denom ?? DEFAULT_DENOM,
      amount: c.amount ?? "0",
    }));
    return { rewards, total };
  }

  // -----------------------------------------------------------------------
  // Transactions – Staking module
  // -----------------------------------------------------------------------

  /**
   * Delegate tokens to a validator.
   */
  async stakingDelegate(params: MsgStakingDelegateParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;
    const denom = params.denom ?? DEFAULT_DENOM;

    const msg = {
      typeUrl: MSG_DELEGATE_TYPE_URL,
      value: {
        delegatorAddress: creator,
        validatorAddress: params.validatorAddress,
        amount: { denom, amount: params.amount },
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Undelegate tokens from a validator.
   */
  async stakingUndelegate(params: MsgStakingUndelegateParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;
    const denom = params.denom ?? DEFAULT_DENOM;

    const msg = {
      typeUrl: MSG_UNDELEGATE_TYPE_URL,
      value: {
        delegatorAddress: creator,
        validatorAddress: params.validatorAddress,
        amount: { denom, amount: params.amount },
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Withdraw delegation rewards from a validator.
   */
  async withdrawRewards(params: MsgWithdrawRewardsParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_WITHDRAW_REWARDS_TYPE_URL,
      value: {
        delegatorAddress: creator,
        validatorAddress: params.validatorAddress,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  // -----------------------------------------------------------------------
  // Queries – IBC module
  // -----------------------------------------------------------------------

  /**
   * Query IBC channels.
   */
  async getIBCChannels(): Promise<IBCChannelsResponse> {
    const url = `${this.restUrl}${REST_IBC_CHANNELS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getIBCChannels: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { channels?: any[] };
    const channels: IBCChannelInfo[] = (data.channels ?? []).map((ch: any) => ({
      channelId: ch.channel_id ?? "",
      portId: ch.port_id ?? "",
      state: ch.state ?? "",
      counterpartyChannelId: ch.counterparty?.channel_id ?? "",
      counterpartyPortId: ch.counterparty?.port_id ?? "",
      connectionHops: ch.connection_hops ?? [],
    }));
    return { channels };
  }

  /**
   * Query IBC connections.
   */
  async getIBCConnections(): Promise<IBCConnectionsResponse> {
    const url = `${this.restUrl}${REST_IBC_CONNECTIONS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getIBCConnections: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { connections?: any[] };
    const connections: IBCConnectionInfo[] = (data.connections ?? []).map((c: any) => ({
      id: c.id ?? "",
      clientId: c.client_id ?? "",
      state: c.state ?? "",
      counterpartyConnectionId: c.counterparty?.connection_id ?? "",
      counterpartyClientId: c.counterparty?.client_id ?? "",
    }));
    return { connections };
  }

  /**
   * Query IBC light clients.
   */
  async getIBCClients(): Promise<IBCClientsResponse> {
    const url = `${this.restUrl}${REST_IBC_CLIENTS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getIBCClients: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { client_states?: any[] };
    const clients: IBCClientInfo[] = (data.client_states ?? []).map((cs: any) => ({
      clientId: cs.client_id ?? "",
      clientType: cs.client_state?.["@type"] ?? "",
      chainId: cs.client_state?.chain_id ?? "",
    }));
    return { clients };
  }

  /**
   * Query IBC denom traces.
   */
  async getIBCDenomTraces(): Promise<IBCDenomTracesResponse> {
    const url = `${this.restUrl}${REST_IBC_DENOM_TRACES}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getIBCDenomTraces: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { denom_traces?: any[] };
    const denomTraces: IBCDenomTrace[] = (data.denom_traces ?? []).map((dt: any) => ({
      path: dt.path ?? "",
      baseDenom: dt.base_denom ?? "",
    }));
    return { denomTraces };
  }

  /**
   * Query remote agents discovered via IBC.
   */
  async getIBCRemoteAgents(): Promise<IBCRemoteAgentsResponse> {
    const url = `${this.restUrl}${REST_IBC_REMOTE_AGENTS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getIBCRemoteAgents: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { agents?: any[] };
    const agents: IBCRemoteAgent[] = (data.agents ?? []).map((a: any) => ({
      agentAddress: a.agent_address ?? "",
      name: a.name ?? "",
      sourceChain: a.source_chain ?? "",
      channelId: a.channel_id ?? "",
      capabilities: a.capabilities ?? [],
    }));
    return { agents };
  }

  // -----------------------------------------------------------------------
  // Task checkpoint (crash recovery)
  // -----------------------------------------------------------------------

  /**
   * Submit a progress checkpoint for an accepted task. Only the assigned
   * agent can checkpoint. The checkpoint data must be valid JSON and
   * percentComplete must be 0-100.
   */
  async checkpointTask(params: MsgCheckpointTaskParams): Promise<TxResult> {
    this.ensureSigningClient();
    const creator = this.signerAddress!;

    const msg = {
      typeUrl: MSG_CHECKPOINT_TASK_TYPE_URL,
      value: {
        creator,
        taskId: BigInt(params.taskId),
        checkpointData: params.checkpointData,
        percentComplete: params.percentComplete,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(creator, [msg], "auto");
    return toTxResult(res);
  }

  /**
   * Query the stored checkpoint for a task.
   */
  async getTaskCheckpoint(taskId: number): Promise<TaskCheckpointResponse> {
    const url = `${this.restUrl}/clawchain/agent/v1/task_checkpoint/${taskId}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) return { checkpoint: "", found: false };
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getTaskCheckpoint: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as any;
    return {
      checkpoint: data.checkpoint || "",
      found: Boolean(data.checkpoint),
    };
  }

  // -----------------------------------------------------------------------
  // Reward leaderboard
  // -----------------------------------------------------------------------

  /**
   * Fetch the agent reward leaderboard by querying all live agents
   * and their cumulative rewards, sorted by rewards descending.
   */
  async getRewardLeaderboard(limit = 50): Promise<RewardLeaderboardResponse> {
    const agents = await this.getLiveAgents();
    const entries: RewardLeaderboardEntry[] = [];

    const results = await Promise.allSettled(
      (agents.agents || []).map(async (agent) => {
        const rewards = await this.getAgentRewards(agent.address);
        return {
          address: agent.address,
          name: agent.name || "Unknown",
          cumulativeRewards: rewards.cumulativeRewards,
        };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        entries.push(result.value);
      }
    }

    entries.sort((a, b) => {
      const aVal = BigInt(a.cumulativeRewards || "0");
      const bVal = BigInt(b.cumulativeRewards || "0");
      if (bVal > aVal) return 1;
      if (bVal < aVal) return -1;
      return 0;
    });

    return { entries: entries.slice(0, limit) };
  }

  // -----------------------------------------------------------------------
  // CosmWasm smart contract queries
  // -----------------------------------------------------------------------

  /**
   * List all uploaded contract codes.
   */
  async getContractCodes(): Promise<WasmCodeInfo[]> {
    const url = `${this.restUrl}${REST_WASM_CODES}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getContractCodes: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { code_infos?: any[] };
    return (data.code_infos ?? []).map((ci: any) => ({
      codeId: Number(ci.code_id ?? 0),
      creator: ci.creator ?? "",
      dataHash: ci.data_hash ?? "",
      instantiatePermission: parseAccessConfig(ci.instantiate_permission),
    }));
  }

  /**
   * Get info about a specific code ID.
   */
  async getCodeInfo(codeId: number): Promise<WasmCodeInfo> {
    const url = `${this.restUrl}${REST_WASM_CODE}/${codeId}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getCodeInfo: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { code_info?: any };
    const ci = data.code_info ?? {};
    return {
      codeId: Number(ci.code_id ?? codeId),
      creator: ci.creator ?? "",
      dataHash: ci.data_hash ?? "",
      instantiatePermission: parseAccessConfig(ci.instantiate_permission),
    };
  }

  /**
   * Get contract info by address.
   */
  async getContractInfo(contractAddress: string): Promise<WasmContractInfo> {
    const url = `${this.restUrl}${REST_WASM_CONTRACT}/${encodeURIComponent(contractAddress)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getContractInfo: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { contract_info?: any; address?: string };
    const ci = data.contract_info ?? {};
    return {
      address: data.address ?? contractAddress,
      codeId: Number(ci.code_id ?? 0),
      creator: ci.creator ?? "",
      admin: ci.admin ?? "",
      label: ci.label ?? "",
      created: ci.created
        ? { blockHeight: Number(ci.created.block_height ?? 0), txIndex: Number(ci.created.tx_index ?? 0) }
        : undefined,
    };
  }

  /**
   * Get contract history (instantiations, migrations).
   */
  async getContractHistory(contractAddress: string): Promise<WasmContractHistoryEntry[]> {
    const url = `${this.restUrl}${REST_WASM_CONTRACT}/${encodeURIComponent(contractAddress)}/${REST_WASM_CONTRACT_HISTORY_SUFFIX}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getContractHistory: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { entries?: any[] };
    return (data.entries ?? []).map((e: any) => ({
      operation: parseHistoryOperation(e.operation),
      codeId: Number(e.code_id ?? 0),
      msg: tryParseJson(e.msg),
    }));
  }

  /**
   * List all contracts instantiated from a code ID.
   */
  async getContractsByCode(codeId: number): Promise<string[]> {
    const url = `${this.restUrl}${REST_WASM_CODE}/${codeId}/${REST_WASM_CODE_CONTRACTS_SUFFIX}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getContractsByCode: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { contracts?: string[] };
    return data.contracts ?? [];
  }

  /**
   * Query contract state (read-only, no gas).
   * The queryMsg is JSON-encoded and base64-encoded for the REST endpoint.
   */
  async queryContract(contractAddress: string, queryMsg: Record<string, unknown>): Promise<unknown> {
    const queryData = btoa(JSON.stringify(queryMsg));
    const url = `${this.restUrl}${REST_WASM_CONTRACT}/${encodeURIComponent(contractAddress)}/${REST_WASM_CONTRACT_SMART_SUFFIX}/${queryData}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.queryContract: HTTP ${res.status} – ${body}`);
    }
    const data = (await res.json()) as { data?: unknown };
    return data.data;
  }

  // -----------------------------------------------------------------------
  // CosmWasm smart contract transactions
  // -----------------------------------------------------------------------

  /**
   * Upload a WASM contract binary. Returns the code ID.
   */
  async uploadContract(
    senderAddress: string,
    wasmBytecode: Uint8Array,
    _instantiatePermission?: WasmAccessConfig,
  ): Promise<WasmUploadResult> {
    this.ensureSigningClient();
    const sender = senderAddress || this.signerAddress!;

    const msg = {
      typeUrl: MSG_STORE_CODE_TYPE_URL,
      value: {
        sender,
        wasmByteCode: wasmBytecode,
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract code_id from events
    let codeId = 0;
    for (const event of txResult.events) {
      if (event.type === "store_code") {
        const attr = event.attributes.find((a) => a.key === "code_id");
        if (attr) codeId = Number(attr.value);
      }
    }

    return {
      codeId,
      transactionHash: txResult.transactionHash,
      height: txResult.height,
      gasUsed: txResult.gasUsed,
    };
  }

  /**
   * Instantiate a contract from uploaded code.
   */
  async instantiateContract(
    senderAddress: string,
    codeId: number,
    initMsg: Record<string, unknown>,
    label: string,
    options?: WasmInstantiateOptions,
  ): Promise<WasmInstantiateResult> {
    this.ensureSigningClient();
    const sender = senderAddress || this.signerAddress!;

    const msg = {
      typeUrl: MSG_INSTANTIATE_CONTRACT_TYPE_URL,
      value: {
        sender,
        admin: options?.admin ?? "",
        codeId: BigInt(codeId),
        label,
        msg: new TextEncoder().encode(JSON.stringify(initMsg)),
        funds: (options?.funds ?? []).map((f) => ({ denom: f.denom, amount: f.amount })),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    const txResult = toTxResult(res);

    // Extract contract address from events
    let contractAddress = "";
    for (const event of txResult.events) {
      if (event.type === "instantiate") {
        const attr = event.attributes.find((a) => a.key === "_contract_address");
        if (attr) contractAddress = attr.value;
      }
    }

    return {
      contractAddress,
      transactionHash: txResult.transactionHash,
      height: txResult.height,
      gasUsed: txResult.gasUsed,
    };
  }

  /**
   * Execute a message on a contract.
   */
  async executeContract(
    senderAddress: string,
    contractAddress: string,
    execMsg: Record<string, unknown>,
    funds?: WasmCoin[],
  ): Promise<WasmExecuteResult> {
    this.ensureSigningClient();
    const sender = senderAddress || this.signerAddress!;

    const msg = {
      typeUrl: MSG_EXECUTE_CONTRACT_TYPE_URL,
      value: {
        sender,
        contract: contractAddress,
        msg: new TextEncoder().encode(JSON.stringify(execMsg)),
        funds: (funds ?? []).map((f) => ({ denom: f.denom, amount: f.amount })),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    const txResult = toTxResult(res);

    return {
      transactionHash: txResult.transactionHash,
      height: txResult.height,
      gasUsed: txResult.gasUsed,
      events: txResult.events,
    };
  }

  /**
   * Migrate a contract to a new code version.
   */
  async migrateContract(
    senderAddress: string,
    contractAddress: string,
    newCodeId: number,
    migrateMsg: Record<string, unknown>,
  ): Promise<WasmMigrateResult> {
    this.ensureSigningClient();
    const sender = senderAddress || this.signerAddress!;

    const msg = {
      typeUrl: MSG_MIGRATE_CONTRACT_TYPE_URL,
      value: {
        sender,
        contract: contractAddress,
        codeId: BigInt(newCodeId),
        msg: new TextEncoder().encode(JSON.stringify(migrateMsg)),
      },
    };

    const res = await this.signingClient!.signAndBroadcast(sender, [msg], "auto");
    const txResult = toTxResult(res);

    return {
      transactionHash: txResult.transactionHash,
      height: txResult.height,
      gasUsed: txResult.gasUsed,
    };
  }

  // -----------------------------------------------------------------------
  // DEX / AMM queries (Astroport-style CosmWasm DEX)
  // -----------------------------------------------------------------------

  /**
   * Query factory contract for trading pairs.
   */
  async queryFactoryPairs(
    factoryAddr: string,
    startAfter?: [unknown, unknown],
    limit?: number,
  ): Promise<DexPairInfo[]> {
    const queryMsg: Record<string, unknown> = {
      pairs: {
        ...(startAfter !== undefined && { start_after: startAfter }),
        ...(limit !== undefined && { limit }),
      },
    };
    const data = (await this.queryContract(factoryAddr, queryMsg)) as {
      pairs?: DexPairInfo[];
    };
    return data?.pairs ?? [];
  }

  /**
   * Query a pair contract for pool balances and total LP supply.
   */
  async queryPoolState(pairAddr: string): Promise<DexPoolResponse> {
    const data = (await this.queryContract(pairAddr, {
      pool: {},
    })) as DexPoolResponse;
    return data;
  }

  /**
   * Simulate a swap (forward) — returns return_amount, spread, commission.
   */
  async simulateSwap(
    pairAddr: string,
    offerAsset: DexAsset,
  ): Promise<DexSimulationResponse> {
    const data = (await this.queryContract(pairAddr, {
      simulation: { offer_asset: offerAsset },
    })) as DexSimulationResponse;
    return data;
  }

  /**
   * Reverse-simulate a swap — given desired output, returns required offer.
   */
  async reverseSimulateSwap(
    pairAddr: string,
    askAsset: DexAsset,
  ): Promise<DexReverseSimulationResponse> {
    const data = (await this.queryContract(pairAddr, {
      reverse_simulation: { ask_asset: askAsset },
    })) as DexReverseSimulationResponse;
    return data;
  }

  /**
   * Query router contract configuration.
   */
  async queryRouterConfig(routerAddr: string): Promise<Record<string, unknown>> {
    const data = (await this.queryContract(routerAddr, {
      config: {},
    })) as Record<string, unknown>;
    return data;
  }

  // -----------------------------------------------------------------------
  // DEX / AMM transactions (Astroport-style CosmWasm DEX)
  // -----------------------------------------------------------------------

  /**
   * Execute a token swap on a DEX pair contract.
   *
   * Builds an Astroport-compatible `{"swap": {...}}` execute message and
   * attaches native funds when the offered token is a native denomination.
   */
  async swap(
    senderAddress: string,
    pairAddress: string,
    offerAsset: string,
    amount: string,
    maxSpread?: string,
  ): Promise<WasmExecuteResult> {
    if (!pairAddress) throw new Error("swap: pairAddress is required");
    if (!offerAsset) throw new Error("swap: offerAsset is required");
    if (!amount || amount === "0") throw new Error("swap: amount must be > 0");

    const execMsg = {
      swap: {
        offer_asset: {
          info: { native_token: { denom: offerAsset } } as DexAssetInfo,
          amount,
        },
        max_spread: maxSpread ?? "0.005",
      },
    };

    const funds: WasmCoin[] = [{ denom: offerAsset, amount }];

    return this.executeContract(senderAddress, pairAddress, execMsg, funds);
  }

  /**
   * Provide liquidity to a DEX pair contract.
   *
   * Builds an Astroport-compatible `{"provide_liquidity": {...}}` message,
   * attaches native funds for all native token assets.
   */
  async addLiquidity(
    senderAddress: string,
    pairAddress: string,
    assets: Array<{ denom: string; amount: string }>,
    slippageTolerance?: string,
  ): Promise<WasmExecuteResult> {
    if (!pairAddress) throw new Error("addLiquidity: pairAddress is required");
    if (!assets || assets.length === 0) throw new Error("addLiquidity: at least one asset is required");

    const dexAssets: DexAsset[] = assets.map((a) => ({
      info: { native_token: { denom: a.denom } } as DexAssetInfo,
      amount: a.amount,
    }));

    const execMsg = {
      provide_liquidity: {
        assets: dexAssets,
        slippage_tolerance: slippageTolerance ?? "0.01",
      },
    };

    // Attach all native token amounts as funds
    const funds: WasmCoin[] = assets.map((a) => ({
      denom: a.denom,
      amount: a.amount,
    }));

    return this.executeContract(senderAddress, pairAddress, execMsg, funds);
  }

  /**
   * Remove liquidity from a DEX pair by sending LP tokens back.
   *
   * For CW20 LP tokens this builds a CW20 `{"send": {...}}` message that
   * forwards the tokens to the pair contract with a `{"withdraw_liquidity": {}}`
   * hook.
   */
  async removeLiquidity(
    senderAddress: string,
    pairAddress: string,
    lpTokenAddress: string,
    lpAmount: string,
  ): Promise<WasmExecuteResult> {
    if (!pairAddress) throw new Error("removeLiquidity: pairAddress is required");
    if (!lpTokenAddress) throw new Error("removeLiquidity: lpTokenAddress is required");
    if (!lpAmount || lpAmount === "0") throw new Error("removeLiquidity: lpAmount must be > 0");

    // CW20 send to pair contract with withdraw_liquidity hook
    const execMsg = {
      send: {
        contract: pairAddress,
        amount: lpAmount,
        msg: btoa(JSON.stringify({ withdraw_liquidity: {} })),
      },
    };

    // Execute on the LP token contract (CW20), not the pair
    return this.executeContract(senderAddress, lpTokenAddress, execMsg);
  }

  /**
   * Create a new liquidity pool via the factory contract.
   *
   * Builds an Astroport-compatible `{"create_pair": {...}}` message.
   * Returns the new pair contract address extracted from transaction events.
   */
  async createPool(
    senderAddress: string,
    factoryAddress: string,
    assetInfos: [AssetInfo, AssetInfo],
    pairType: PairType,
  ): Promise<{ pairAddress: string; transactionHash: string; height: number; gasUsed: number }> {
    if (!factoryAddress) throw new Error("createPool: factoryAddress is required");
    if (!assetInfos || assetInfos.length !== 2) throw new Error("createPool: exactly 2 assetInfos are required");

    const execMsg = {
      create_pair: {
        pair_type: pairType,
        asset_infos: assetInfos,
      },
    };

    const result = await this.executeContract(senderAddress, factoryAddress, execMsg);

    // Extract new pair address from wasm events
    let pairAddress = "";
    for (const event of result.events) {
      if (event.type === "wasm") {
        const attr = event.attributes.find(
          (a) => a.key === "pair_contract_addr" || a.key === "_contract_address",
        );
        if (attr) {
          pairAddress = attr.value;
          break;
        }
      }
    }

    return {
      pairAddress,
      transactionHash: result.transactionHash,
      height: result.height,
      gasUsed: result.gasUsed,
    };
  }

  /**
   * Query pool liquidity — returns reserves and total LP supply.
   */
  async queryPoolLiquidity(pairAddress: string): Promise<PoolInfo> {
    if (!pairAddress) throw new Error("queryPoolLiquidity: pairAddress is required");
    const data = (await this.queryContract(pairAddress, {
      pool: {},
    })) as DexPoolResponse;
    return {
      assets: data.assets,
      totalShare: data.total_share,
    };
  }

  // -----------------------------------------------------------------------
  // WebSocket subscriptions
  // -----------------------------------------------------------------------

  /**
   * Ensure the CometBFT WebSocket connection is open.
   * If already connected or connecting, this is a no-op.
   * Handles reconnection with exponential backoff on close/error.
   */
  private ensureWebSocket(): void {
    if (this.ws && (this.ws.readyState === 0 /* CONNECTING */ || this.ws.readyState === 1 /* OPEN */)) {
      return;
    }
    if (this.wsConnecting) return;
    this.wsConnecting = true;

    const ws = new WebSocket(this.wsUrl);

    ws.onopen = () => {
      this.ws = ws;
      this.wsConnecting = false;
      this.wsReconnectAttempt = 0;

      // Re-subscribe all existing subscriptions after reconnect
      for (const query of this.wsSubscriptions.keys()) {
        this.wsSendSubscribe(query);
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!msg?.result?.data) return;

        const eventType = msg.result.data?.type ?? "";
        const eventValue = msg.result.data?.value ?? {};

        // Dispatch to all matching subscriptions
        for (const [query, callbacks] of this.wsSubscriptions.entries()) {
          if (this.wsEventMatchesQuery(eventType, eventValue, query)) {
            for (const cb of callbacks) {
              try {
                cb({ type: eventType, value: eventValue, raw: msg });
              } catch {
                // ignore callback errors
              }
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.wsConnecting = false;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
      this.wsConnecting = false;
    };
  }

  /** Schedule a reconnection with exponential backoff. */
  private scheduleReconnect(): void {
    if (this.wsSubscriptions.size === 0) return;
    if (this.wsReconnectAttempt >= this.wsMaxReconnectAttempt) return;

    const delay = this.wsBaseDelay * Math.pow(2, this.wsReconnectAttempt);
    this.wsReconnectAttempt++;

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.ensureWebSocket();
    }, delay);
  }

  /** Send a JSONRPC subscribe message over the WebSocket. */
  private wsSendSubscribe(query: string): void {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.wsRequestId++;
    const msg = {
      jsonrpc: "2.0",
      method: "subscribe",
      id: this.wsRequestId,
      params: { query },
    };
    this.ws.send(JSON.stringify(msg));
  }

  /** Check if a CometBFT event matches a subscription query. */
  private wsEventMatchesQuery(eventType: string, _value: any, query: string): boolean {
    // CometBFT queries like "tm.event='NewBlock'" or "tm.event='Tx'"
    if (query.includes("NewBlock") && eventType.includes("new_block")) return true;
    if (query.includes("Tx") && eventType.includes("tx")) return true;
    // Custom event type matching
    if (query.includes("message.action") || query.includes("message.module")) {
      return true; // broad match; finer filtering is done in the callbacks
    }
    return true; // default: deliver all events to all subscriptions
  }

  /**
   * Subscribe to new block events.
   *
   * @param callback - Called for each new block.
   * @returns An unsubscribe function.
   */
  subscribeNewBlock(callback: (block: BlockInfo) => void): Unsubscribe {
    const query = "tm.event='NewBlock'";

    const wrapper = (data: any) => {
      const block = data.value?.block ?? data.value?.data?.value?.block ?? {};
      const header = block.header ?? {};
      const info: BlockInfo = {
        height: parseInt(header.height ?? "0", 10),
        hash: data.value?.block_id?.hash ?? header.app_hash ?? "",
        time: header.time ?? "",
        numTxs: parseInt(header.num_txs ?? block.data?.txs?.length ?? "0", 10),
        proposer: header.proposer_address ?? "",
      };
      callback(info);
    };

    return this.addSubscription(query, wrapper);
  }

  /**
   * Subscribe to transaction events filtered by address.
   *
   * @param address - Bech32 address to filter by (sender or recipient).
   * @param callback - Called for each matching transaction.
   * @returns An unsubscribe function.
   */
  subscribeTx(address: string, callback: (tx: WsTxEvent) => void): Unsubscribe {
    const query = "tm.event='Tx'";

    const wrapper = (data: any) => {
      const txResult = data.value?.TxResult ?? data.value?.tx_result ?? data.value ?? {};
      const result = txResult.result ?? {};
      const events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> = (result.events ?? []).map(
        (e: any) => ({
          type: e.type ?? "",
          attributes: (e.attributes ?? []).map((a: any) => ({
            key: typeof a.key === "string" ? a.key : "",
            value: typeof a.value === "string" ? a.value : "",
          })),
        }),
      );

      // Extract sender/recipient from events
      let sender = "";
      let recipient = "";
      for (const ev of events) {
        for (const attr of ev.attributes) {
          if (attr.key === "sender" && !sender) sender = attr.value;
          if (attr.key === "recipient" && !recipient) recipient = attr.value;
        }
      }

      // Filter by address
      if (address && sender !== address && recipient !== address) return;

      const txEvent: WsTxEvent = {
        hash: txResult.hash ?? "",
        height: parseInt(txResult.height ?? "0", 10),
        code: result.code ?? 0,
        sender,
        recipient,
        events,
      };
      callback(txEvent);
    };

    return this.addSubscription(query, wrapper);
  }

  /**
   * Subscribe to specific chain event types.
   *
   * @param eventType - Event type to filter (e.g. "transfer", "agent_registered", "wasm").
   * @param callback - Called for each matching event.
   * @returns An unsubscribe function.
   */
  subscribeEvent(eventType: string, callback: (event: ChainEvent) => void): Unsubscribe {
    const query = "tm.event='Tx'";

    const wrapper = (data: any) => {
      const txResult = data.value?.TxResult ?? data.value?.tx_result ?? data.value ?? {};
      const result = txResult.result ?? {};
      const height = parseInt(txResult.height ?? "0", 10);

      for (const ev of result.events ?? []) {
        if (ev.type !== eventType) continue;
        const attributes: Record<string, string> = {};
        for (const attr of ev.attributes ?? []) {
          const key = typeof attr.key === "string" ? attr.key : "";
          const value = typeof attr.value === "string" ? attr.value : "";
          if (key) attributes[key] = value;
        }
        const chainEvent: ChainEvent = {
          type: ev.type,
          attributes,
          height,
        };
        callback(chainEvent);
      }
    };

    return this.addSubscription(query, wrapper);
  }

  /** Add a subscription callback for a given CometBFT query. */
  private addSubscription(query: string, callback: (data: any) => void): Unsubscribe {
    if (!this.wsSubscriptions.has(query)) {
      this.wsSubscriptions.set(query, new Set());
    }
    this.wsSubscriptions.get(query)!.add(callback);

    this.ensureWebSocket();
    this.wsSendSubscribe(query);

    return () => {
      const callbacks = this.wsSubscriptions.get(query);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.wsSubscriptions.delete(query);
        }
      }
      // If no subscriptions remain, close the WebSocket
      if (this.wsSubscriptions.size === 0) {
        this.cleanupWebSocket();
      }
    };
  }

  /** Close the WebSocket and clean up all subscription state. */
  unsubscribeAll(): void {
    this.wsSubscriptions.clear();
    this.cleanupWebSocket();
  }

  /** Internal: close WS and cancel reconnect timers. */
  private cleanupWebSocket(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.wsReconnectAttempt = 0;
    this.wsConnecting = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  // -----------------------------------------------------------------------
  // Portfolio analytics
  // -----------------------------------------------------------------------

  /**
   * Get an aggregated portfolio summary for an address.
   *
   * Fetches balances, delegations, rewards, escrows, and tasks in parallel
   * and aggregates the totals.
   *
   * @param address - Bech32 address.
   */
  async getPortfolioSummary(address: string): Promise<PortfolioSummary> {
    // Fetch all data in parallel — each call uses REST so no query client needed
    const [balanceResult, delegationsResult, rewardsResult, escrowsResult, tasksResult] =
      await Promise.allSettled([
        this.fetchBalance(address),
        this.fetchDelegationsTotal(address),
        this.fetchRewardsTotal(address),
        this.fetchEscrowLocked(address),
        this.fetchTaskBudgets(address),
      ]);

    const available = balanceResult.status === "fulfilled" ? balanceResult.value : "0";
    const staked = delegationsResult.status === "fulfilled" ? delegationsResult.value : "0";
    const rewards = rewardsResult.status === "fulfilled" ? rewardsResult.value : "0";
    const escrowLocked = escrowsResult.status === "fulfilled" ? escrowsResult.value : "0";
    const taskBudgets = tasksResult.status === "fulfilled" ? tasksResult.value : "0";

    const totalValue = String(
      BigInt(available) + BigInt(staked) + BigInt(rewards) + BigInt(escrowLocked) + BigInt(taskBudgets),
    );

    return { address, available, staked, rewards, escrowLocked, taskBudgets, totalValue };
  }

  /** Fetch uclaw balance via REST. */
  private async fetchBalance(address: string): Promise<string> {
    const url = `${this.restUrl}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}/by_denom?denom=${DEFAULT_DENOM}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { balance?: { amount?: string } };
    return data.balance?.amount ?? "0";
  }

  /** Sum delegation amounts via REST. */
  private async fetchDelegationsTotal(address: string): Promise<string> {
    const url = `${this.restUrl}${REST_STAKING_DELEGATIONS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { delegation_responses?: any[] };
    let total = 0n;
    for (const d of data.delegation_responses ?? []) {
      const amount = d.balance?.amount ?? "0";
      total += BigInt(amount);
    }
    return total.toString();
  }

  /** Sum pending rewards via REST. */
  private async fetchRewardsTotal(address: string): Promise<string> {
    const url = `${this.restUrl}${REST_STAKING_REWARDS}/${encodeURIComponent(address)}/rewards`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { total?: any[] };
    let total = 0n;
    for (const coin of data.total ?? []) {
      if (coin.denom === DEFAULT_DENOM || !coin.denom) {
        // Rewards are often fractional strings like "500.000000"; truncate to integer
        const intPart = String(coin.amount ?? "0").split(".")[0];
        total += BigInt(intPart || "0");
      }
    }
    return total.toString();
  }

  /** Sum locked escrow amounts where address is buyer with active status. */
  private async fetchEscrowLocked(address: string): Promise<string> {
    const url = `${this.restUrl}${REST_ESCROWS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { escrows?: any[] };
    let total = 0n;
    for (const e of data.escrows ?? []) {
      if (e.buyer === address && (e.status === "active" || e.status === "pending")) {
        total += BigInt(e.amount ?? "0");
      }
    }
    return total.toString();
  }

  /** Sum budgets of active tasks delegated by this address. */
  private async fetchTaskBudgets(address: string): Promise<string> {
    const url = `${this.restUrl}${REST_TASKS_BY_DELEGATOR}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { tasks?: any[] };
    let total = 0n;
    for (const t of data.tasks ?? []) {
      if (t.status === "pending" || t.status === "accepted" || t.status === "in_progress") {
        // Budget strings may include denom like "1000uclaw"; parse digits only
        const amt = String(t.budget ?? "0").replace(/[^0-9]/g, "");
        total += BigInt(amt || "0");
      }
    }
    return total.toString();
  }

  /**
   * Get agent earnings breakdown.
   *
   * Aggregates earnings from multiple sources:
   * - Task rewards (completed tasks as assignee)
   * - Skill sales (marketplace)
   * - Staking rewards
   * - Compute provider fees
   *
   * @param address - Bech32 address of the agent.
   */
  async getAgentEarnings(address: string): Promise<AgentEarnings> {
    const [taskResult, skillResult, stakingResult, computeResult] =
      await Promise.allSettled([
        this.fetchTaskEarnings(address),
        this.fetchSkillSales(address),
        this.fetchRewardsTotal(address),
        this.fetchComputeFees(address),
      ]);

    const taskRewards = taskResult.status === "fulfilled" ? taskResult.value : "0";
    const skillSales = skillResult.status === "fulfilled" ? skillResult.value : "0";
    const stakingRewards = stakingResult.status === "fulfilled" ? stakingResult.value : "0";
    const computeFees = computeResult.status === "fulfilled" ? computeResult.value : "0";

    const total = String(
      BigInt(taskRewards) + BigInt(skillSales) + BigInt(stakingRewards) + BigInt(computeFees),
    );

    return { address, taskRewards, skillSales, stakingRewards, computeFees, total };
  }

  /** Sum budgets of completed tasks where this address was the assignee. */
  private async fetchTaskEarnings(address: string): Promise<string> {
    const url = `${this.restUrl}${REST_TASKS_BY_ASSIGNEE}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { tasks?: any[] };
    let total = 0n;
    for (const t of data.tasks ?? []) {
      if (t.status === "completed") {
        const amt = String(t.budget ?? "0").replace(/[^0-9]/g, "");
        total += BigInt(amt || "0");
      }
    }
    return total.toString();
  }

  /** Sum skill sale revenue for the given address from marketplace analytics. */
  private async fetchSkillSales(address: string): Promise<string> {
    const url = `${this.restUrl}${REST_SKILLS_BY_OWNER}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { skills?: any[] };
    let total = 0n;
    for (const s of data.skills ?? []) {
      // Each skill's purchase_count * price gives approximate revenue
      const price = BigInt(String(s.price ?? "0").replace(/[^0-9]/g, "") || "0");
      const count = BigInt(s.purchaseCount ?? s.purchase_count ?? 0);
      total += price * count;
    }
    return total.toString();
  }

  /** Sum compute provider revenue. */
  private async fetchComputeFees(address: string): Promise<string> {
    const url = `${this.restUrl}${REST_PROVIDER_STATS}/${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return "0";
    const data = (await res.json()) as { stats?: { totalRevenue?: string } };
    return data.stats?.totalRevenue ?? "0";
  }

  /**
   * Get a leaderboard of agents sorted by the given metric.
   *
   * @param type  - Metric type: "reputation", "earnings", or "tasks".
   * @param limit - Maximum entries to return (default: 10).
   */
  async getLeaderboard(
    type: "reputation" | "earnings" | "tasks",
    limit: number = 10,
  ): Promise<LeaderboardEntry[]> {
    switch (type) {
      case "reputation":
        return this.fetchReputationLeaderboard(limit);
      case "earnings":
        return this.fetchEarningsLeaderboard(limit);
      case "tasks":
        return this.fetchTasksLeaderboard(limit);
      default:
        return [];
    }
  }

  /** Build a reputation leaderboard from the top agents endpoint. */
  private async fetchReputationLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const url = `${this.restUrl}${REST_TOP_AGENTS}?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { agents?: any[] };
    return (data.agents ?? []).slice(0, limit).map((a: any, i: number) => ({
      rank: i + 1,
      address: a.agentAddress ?? a.agent_address ?? "",
      name: a.name ?? "",
      score: String(a.avgRatingBps ?? a.avg_rating_bps ?? 0),
      metric: "reputation",
    }));
  }

  /** Build an earnings leaderboard from the agent rewards endpoint. */
  private async fetchEarningsLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const url = `${this.restUrl}${REST_AGENT_REWARDS}?limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: any[] };
    return (data.entries ?? []).slice(0, limit).map((e: any, i: number) => ({
      rank: i + 1,
      address: e.address ?? "",
      name: e.name ?? "",
      score: e.cumulativeRewards ?? e.cumulative_rewards ?? "0",
      metric: "earnings",
    }));
  }

  /** Build a tasks leaderboard from the recent activity endpoint. */
  private async fetchTasksLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
    const url = `${this.restUrl}${REST_TOP_AGENTS}?limit=${limit}&sort=tasks`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { agents?: any[] };
    return (data.agents ?? []).slice(0, limit).map((a: any, i: number) => ({
      rank: i + 1,
      address: a.agentAddress ?? a.agent_address ?? "",
      name: a.name ?? "",
      score: String(
        (a.intentsCreated ?? a.intents_created ?? 0) + (a.intentsCompleted ?? a.intents_completed ?? 0),
      ),
      metric: "tasks",
    }));
  }

  // -----------------------------------------------------------------------
  // Chain health & diagnostics
  // -----------------------------------------------------------------------

  /**
   * Query overall chain health: node info, sync status, validators, peers.
   */
  async chainHealth(): Promise<{
    nodeInfo: { moniker: string; network: string; version: string };
    syncInfo: { latestBlockHeight: string; latestBlockTime: string; catchingUp: boolean };
    validatorCount: number;
    peerCount: number;
  }> {
    const [statusRes, validatorsRes] = await Promise.all([
      fetch(`${this.rpcUrl}/status`).then((r) => r.json()) as Promise<any>,
      fetch(`${this.restUrl}${REST_STAKING_VALIDATORS}?status=BOND_STATUS_BONDED&pagination.limit=1`).then((r) => r.json()).catch(() => null) as Promise<any>,
    ]);
    const result = statusRes.result ?? statusRes;
    const ni = result.node_info ?? {};
    const si = result.sync_info ?? {};
    return {
      nodeInfo: {
        moniker: ni.moniker ?? "",
        network: ni.network ?? "",
        version: ni.version ?? "",
      },
      syncInfo: {
        latestBlockHeight: si.latest_block_height ?? "0",
        latestBlockTime: si.latest_block_time ?? "",
        catchingUp: si.catching_up ?? false,
      },
      validatorCount: validatorsRes?.pagination?.total ? parseInt(validatorsRes.pagination.total, 10) : 0,
      peerCount: parseInt(ni.other?.n_peers ?? "0", 10),
    };
  }

  /**
   * Query network topology: peers, connections.
   */
  async getNetworkTopology(): Promise<{
    peerId: string;
    listenAddr: string;
    nPeers: number;
    peers: Array<{ nodeId: string; remoteIp: string; isOutbound: boolean }>;
  }> {
    const res: any = await fetch(`${this.rpcUrl}/net_info`).then((r) => r.json());
    const result = res.result ?? res;
    return {
      peerId: result.node_info?.id ?? result.listening ?? "",
      listenAddr: result.node_info?.listen_addr ?? result.listeners?.[0] ?? "",
      nPeers: parseInt(result.n_peers ?? "0", 10),
      peers: (result.peers ?? []).map((p: any) => ({
        nodeId: p.node_info?.id ?? "",
        remoteIp: p.remote_ip ?? "",
        isOutbound: p.is_outbound ?? false,
      })),
    };
  }

  /**
   * Query genesis metadata from the chain.
   */
  async getGenesisMetadata(): Promise<{
    chainId: string;
    genesisTime: string;
    initialHeight: string;
    moduleList: string[];
  }> {
    const res: any = await fetch(`${this.restUrl}/cosmos/base/tendermint/v1beta1/node_info`).then((r) => r.json());
    const nodeInfo = res.default_node_info ?? res.node_info ?? {};
    const chainId = nodeInfo.network ?? "";

    let moduleList: string[] = [];
    try {
      const gRes: any = await fetch(`${this.rpcUrl}/genesis?limit=1`).then((r) => r.json());
      const genesis = gRes.result?.genesis ?? gRes;
      const appState = genesis.app_state ?? {};
      moduleList = Object.keys(appState).sort();
      return {
        chainId,
        genesisTime: genesis.genesis_time ?? "",
        initialHeight: genesis.initial_height ?? "1",
        moduleList,
      };
    } catch {
      return { chainId, genesisTime: "", initialHeight: "1", moduleList };
    }
  }

  /**
   * Query params for a specific module.
   */
  async getModuleParams(module: string): Promise<Record<string, unknown>> {
    const endpoints: Record<string, string> = {
      agent: "/clawchain/agent/v1/params",
      privacy: "/clawchain/privacy/v1/params",
      marketplace: "/clawchain/marketplace/v1/params",
      staking: "/cosmos/staking/v1beta1/params",
      governance: "/cosmos/gov/v1/params",
      mint: "/cosmos/mint/v1beta1/params",
      slashing: "/cosmos/slashing/v1beta1/params",
      bank: "/cosmos/bank/v1beta1/params",
    };
    const path = endpoints[module];
    if (!path) throw new Error(`Unknown module: ${module}`);
    const res: any = await fetch(`${this.restUrl}${path}`).then((r) => r.json());
    return res.params ?? res;
  }

  /**
   * Ping RPC and REST endpoints, return latency and status.
   */
  async getServiceHealth(): Promise<{
    rpc: { reachable: boolean; latencyMs: number; error?: string };
    rest: { reachable: boolean; latencyMs: number; error?: string };
  }> {
    const check = async (url: string) => {
      const start = Date.now();
      try {
        await fetch(url, { signal: AbortSignal.timeout(5000) });
        return { reachable: true, latencyMs: Date.now() - start };
      } catch (e: any) {
        return { reachable: false, latencyMs: Date.now() - start, error: e.message };
      }
    };
    const [rpc, rest] = await Promise.all([
      check(`${this.rpcUrl}/health`),
      check(`${this.restUrl}/cosmos/base/tendermint/v1beta1/node_info`),
    ]);
    return { rpc, rest };
  }

  // -----------------------------------------------------------------------
  // Queries – Provider monitoring
  // -----------------------------------------------------------------------

  /**
   * Query provider metrics for an agent: tasks completed, success rate,
   * average response time, and uptime.
   */
  async getProviderMetrics(address: string): Promise<{
    address: string;
    tasksCompleted: number;
    successRate: number;
    avgResponseTimeMs: number;
    uptimePercent: number;
  }> {
    const url = `${this.restUrl}/clawchain/agent/v1/agent_stats/${encodeURIComponent(address)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ClawChainClient.getProviderMetrics: HTTP ${res.status} – ${body}`);
      }
      const data = (await res.json()) as any;
      const stats = data.stats ?? data;
      return {
        address,
        tasksCompleted: Number(stats.tasks_completed ?? stats.tasksCompleted ?? 0),
        successRate: Number(stats.success_rate ?? stats.successRate ?? 0),
        avgResponseTimeMs: Number(stats.avg_response_time_ms ?? stats.avgResponseTimeMs ?? 0),
        uptimePercent: Number(stats.uptime_percent ?? stats.uptimePercent ?? 0),
      };
    } catch (e: any) {
      if (e.message?.startsWith("ClawChainClient.getProviderMetrics")) throw e;
      return { address, tasksCompleted: 0, successRate: 0, avgResponseTimeMs: 0, uptimePercent: 0 };
    }
  }

  /**
   * Query reputation score changes over time for an agent.
   *
   * @param address - The agent's bech32 address.
   * @param limit   - Maximum number of history entries to return (default: 20).
   */
  async getReputationHistory(address: string, limit?: number): Promise<{
    address: string;
    history: Array<{ timestamp: string; score: number; delta: number; reason: string }>;
  }> {
    const paginationLimit = limit || 20;
    const url = `${this.restUrl}/clawchain/reputation/v1/history/${encodeURIComponent(address)}?pagination.limit=${paginationLimit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ClawChainClient.getReputationHistory: HTTP ${res.status} – ${body}`);
      }
      const data = (await res.json()) as any;
      const entries = data.history ?? data.entries ?? [];
      return {
        address,
        history: entries.map((e: any) => ({
          timestamp: e.timestamp ?? e.time ?? "",
          score: Number(e.score ?? e.reputation_score ?? 0),
          delta: Number(e.delta ?? e.score_delta ?? 0),
          reason: e.reason ?? e.event_type ?? "",
        })),
      };
    } catch (e: any) {
      if (e.message?.startsWith("ClawChainClient.getReputationHistory")) throw e;
      return { address, history: [] };
    }
  }

  /**
   * Get a summary of escrows for an address, including counts and totals
   * as both buyer and seller.
   */
  async getEscrowSummary(address: string): Promise<{
    address: string;
    totalEscrows: number;
    asBuyer: number;
    asSeller: number;
    activeCount: number;
    completedCount: number;
    disputedCount: number;
    totalLockedAmount: string;
  }> {
    const url = `${this.restUrl}/clawchain/marketplace/v1/escrows?participant=${encodeURIComponent(address)}&pagination.limit=100`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ClawChainClient.getEscrowSummary: HTTP ${res.status} – ${body}`);
      }
      const data = (await res.json()) as any;
      const escrows: any[] = data.escrows ?? [];
      let asBuyer = 0;
      let asSeller = 0;
      let activeCount = 0;
      let completedCount = 0;
      let disputedCount = 0;
      let totalLocked = 0n;

      for (const e of escrows) {
        const buyer = e.buyer ?? e.buyer_address ?? "";
        const seller = e.seller ?? e.seller_address ?? "";
        if (buyer === address) asBuyer++;
        if (seller === address) asSeller++;

        const status = (e.status ?? "").toLowerCase();
        if (status === "active" || status === "pending") activeCount++;
        else if (status === "completed") completedCount++;
        else if (status === "disputed") disputedCount++;

        if (status === "active" || status === "pending") {
          const amt = String(e.amount ?? e.total_amount ?? "0").replace(/[^0-9]/g, "");
          totalLocked += BigInt(amt || "0");
        }
      }

      return {
        address,
        totalEscrows: escrows.length,
        asBuyer,
        asSeller,
        activeCount,
        completedCount,
        disputedCount,
        totalLockedAmount: totalLocked.toString(),
      };
    } catch (e: any) {
      if (e.message?.startsWith("ClawChainClient.getEscrowSummary")) throw e;
      return {
        address,
        totalEscrows: 0,
        asBuyer: 0,
        asSeller: 0,
        activeCount: 0,
        completedCount: 0,
        disputedCount: 0,
        totalLockedAmount: "0",
      };
    }
  }

  /**
   * Get task history for an agent, returning completed and in-progress tasks.
   *
   * @param address - The agent's bech32 address.
   * @param limit   - Maximum number of tasks to return (default: 50).
   */
  async getTaskHistory(address: string, limit?: number): Promise<{
    address: string;
    tasks: Array<{
      taskId: string;
      delegator: string;
      status: string;
      budget: string;
      description: string;
      createdAt: string;
      completedAt: string;
    }>;
    totalCount: number;
  }> {
    const paginationLimit = limit || 50;
    const url = `${this.restUrl}/clawchain/agent/v1/tasks_by_assignee/${encodeURIComponent(address)}?pagination.limit=${paginationLimit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ClawChainClient.getTaskHistory: HTTP ${res.status} – ${body}`);
      }
      const data = (await res.json()) as any;
      const rawTasks: any[] = data.tasks ?? [];
      const tasks = rawTasks.map((t: any) => ({
        taskId: String(t.task_id ?? t.taskId ?? t.id ?? ""),
        delegator: t.delegator ?? t.delegator_address ?? "",
        status: t.status ?? "unknown",
        budget: String(t.budget ?? "0"),
        description: t.description ?? t.desc ?? "",
        createdAt: t.created_at ?? t.createdAt ?? "",
        completedAt: t.completed_at ?? t.completedAt ?? "",
      }));
      const totalCount = data.pagination?.total
        ? Number(data.pagination.total)
        : tasks.length;
      return { address, tasks, totalCount };
    } catch (e: any) {
      if (e.message?.startsWith("ClawChainClient.getTaskHistory")) throw e;
      return { address, tasks: [], totalCount: 0 };
    }
  }

  /**
   * Get an agent's network position including rank, percentile, and tier.
   * Fetches the agent info and computes position relative to the network.
   */
  async getNetworkPosition(address: string): Promise<{
    address: string;
    rank: number;
    percentile: number;
    tier: string;
    reputationScore: number;
    totalAgents: number;
  }> {
    try {
      // Fetch agent info and top agents list in parallel
      const [agentRes, topRes] = await Promise.all([
        fetch(`${this.restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(address)}`).then((r) => r.json()) as Promise<any>,
        fetch(`${this.restUrl}/clawchain/reputation/v1/top_agents?pagination.limit=1000`).then((r) => r.json()).catch(() => null) as Promise<any>,
      ]);

      const agent = agentRes.agent ?? agentRes;
      const reputationScore = Number(
        agent.reputation_score ?? agent.reputationScore ?? agent.avg_rating_bps ?? agent.avgRatingBps ?? 0,
      );

      const agents: any[] = topRes?.agents ?? [];
      const totalAgents = agents.length || 1;

      // Find this agent's rank in the sorted list
      let rank = 0;
      for (let i = 0; i < agents.length; i++) {
        const addr = agents[i].agent_address ?? agents[i].agentAddress ?? agents[i].address ?? "";
        if (addr === address) {
          rank = i + 1;
          break;
        }
      }
      // If not found in the list, place at the end
      if (rank === 0) rank = totalAgents;

      const percentile = totalAgents > 1
        ? Math.round(((totalAgents - rank) / (totalAgents - 1)) * 100)
        : 100;

      // Determine tier based on percentile
      let tier: string;
      if (percentile >= 90) tier = "diamond";
      else if (percentile >= 75) tier = "gold";
      else if (percentile >= 50) tier = "silver";
      else if (percentile >= 25) tier = "bronze";
      else tier = "iron";

      return { address, rank, percentile, tier, reputationScore, totalAgents };
    } catch (e: any) {
      return { address, rank: 0, percentile: 0, tier: "unknown", reputationScore: 0, totalAgents: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Queries – Oracle module (Terra-forked v1beta1)
  // -----------------------------------------------------------------------

  /**
   * Query the exchange rate for a single denom.
   *
   * @param denom - Denom identifier, e.g. "uusd".
   */
  async getOracleExchangeRate(denom: string): Promise<OracleExchangeRateResponse> {
    const url = `${this.restUrl}${REST_ORACLE_EXCHANGE_RATE}/${encodeURIComponent(denom)}/exchange_rate`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleExchangeRate: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleExchangeRateResponse;
  }

  /**
   * Query all current exchange rates.
   */
  async getOracleExchangeRates(): Promise<OracleExchangeRatesResponse> {
    const url = `${this.restUrl}${REST_ORACLE_EXCHANGE_RATES}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleExchangeRates: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleExchangeRatesResponse;
  }

  /**
   * Query the tobin tax for a single denom.
   *
   * @param denom - Denom identifier, e.g. "uusd".
   */
  async getOracleTobinTax(denom: string): Promise<OracleTobinTaxResponse> {
    const url = `${this.restUrl}${REST_ORACLE_TOBIN_TAX}/${encodeURIComponent(denom)}/tobin_tax`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleTobinTax: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleTobinTaxResponse;
  }

  /**
   * Query all tobin taxes.
   */
  async getOracleTobinTaxes(): Promise<OracleExchangeRatesResponse> {
    const url = `${this.restUrl}${REST_ORACLE_TOBIN_TAXES}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleTobinTaxes: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleExchangeRatesResponse;
  }

  /**
   * Query active denoms that the oracle is tracking.
   */
  async getOracleActives(): Promise<OracleActivesResponse> {
    const url = `${this.restUrl}${REST_ORACLE_ACTIVES}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleActives: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleActivesResponse;
  }

  /**
   * Query vote target denoms.
   */
  async getOracleVoteTargets(): Promise<OracleVoteTargetsResponse> {
    const url = `${this.restUrl}${REST_ORACLE_VOTE_TARGETS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleVoteTargets: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleVoteTargetsResponse;
  }

  /**
   * Query oracle module parameters.
   */
  async getOracleParams(): Promise<OracleParamsResponse> {
    const url = `${this.restUrl}${REST_ORACLE_PARAMS}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleParams: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleParamsResponse;
  }

  /**
   * Query the feeder delegation for a validator.
   *
   * @param validator - Bech32 validator address.
   */
  async getOracleFeederDelegation(validator: string): Promise<OracleFeederResponse> {
    const url = `${this.restUrl}${REST_ORACLE_FEEDER}/${encodeURIComponent(validator)}/feeder`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleFeederDelegation: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleFeederResponse;
  }

  /**
   * Query the miss counter for a validator's oracle votes.
   *
   * @param validator - Bech32 validator address.
   */
  async getOracleMissCounter(validator: string): Promise<OracleMissCounterResponse> {
    const url = `${this.restUrl}${REST_ORACLE_MISS}/${encodeURIComponent(validator)}/miss`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleMissCounter: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleMissCounterResponse;
  }

  /**
   * Query the aggregate prevote for a specific validator.
   *
   * @param validator - Bech32 validator address.
   */
  async getOracleAggregatePrevote(validator: string): Promise<OracleAggregatePrevoteResponse> {
    const url = `${this.restUrl}${REST_ORACLE_AGGREGATE_PREVOTE}/${encodeURIComponent(validator)}/aggregate_prevote`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleAggregatePrevote: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleAggregatePrevoteResponse;
  }

  /**
   * Query all aggregate prevotes.
   */
  async getOracleAggregatePrevotes(): Promise<OracleAggregatePrevotesResponse> {
    const url = `${this.restUrl}${REST_ORACLE_AGGREGATE_PREVOTES}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleAggregatePrevotes: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleAggregatePrevotesResponse;
  }

  /**
   * Query the aggregate vote for a specific validator.
   *
   * @param validator - Bech32 validator address.
   */
  async getOracleAggregateVote(validator: string): Promise<OracleAggregateVoteResponse> {
    const url = `${this.restUrl}${REST_ORACLE_AGGREGATE_VOTE}/${encodeURIComponent(validator)}/aggregate_vote`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleAggregateVote: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleAggregateVoteResponse;
  }

  /**
   * Query all aggregate votes.
   */
  async getOracleAggregateVotes(): Promise<OracleAggregateVotesResponse> {
    const url = `${this.restUrl}${REST_ORACLE_AGGREGATE_VOTES}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ClawChainClient.getOracleAggregateVotes: HTTP ${res.status} – ${body}`);
    }
    return (await res.json()) as OracleAggregateVotesResponse;
  }

  // -----------------------------------------------------------------------
  // Internal guards
  // -----------------------------------------------------------------------

  private ensureQueryClient(): void {
    if (!this.queryClient) {
      throw new Error(
        "ClawChainClient: not connected. Call connect() before querying.",
      );
    }
  }

  private ensureSigningClient(): void {
    if (!this.signingClient || !this.signerAddress) {
      throw new Error(
        "ClawChainClient: signing client not available. " +
          "Provide a mnemonic and call connect() before sending transactions.",
      );
    }
  }
}
