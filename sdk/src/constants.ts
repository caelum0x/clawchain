/**
 * Default configuration constants for the ClawChain SDK.
 */
import {
  PROTO_MSG_TYPE_URLS,
  PROTO_QUERY_HTTP_PATHS,
  PROTO_QUERY_HTTP_PREFIX_PATHS,
} from "./generated/proto-contracts.js";

/** Default Tendermint RPC endpoint. */
export const DEFAULT_RPC_URL = "http://localhost:26657";

/** Default gRPC endpoint. */
export const DEFAULT_GRPC_URL = "localhost:9090";

/** Default REST / LCD endpoint (Cosmos SDK API). */
export const DEFAULT_REST_URL = "http://localhost:1317";

/** Default Bech32 address prefix. */
export const DEFAULT_PREFIX = "claw";

/** Default base denomination. */
export const DEFAULT_DENOM = "uclaw";

/** Default gas price string. */
export const DEFAULT_GAS_PRICE = "0.025uclaw";

/** Default gas adjustment multiplier. */
export const DEFAULT_GAS_ADJUSTMENT = 1.4;

/** Default name of the clawproof binary. */
export const DEFAULT_PROOF_BINARY = "clawproof";

/** Default timeout for proof generation in milliseconds. */
export const DEFAULT_PROOF_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Custom type URLs for ClawChain modules
// ---------------------------------------------------------------------------

/** Type URL for MsgShield (privacy module). */
export const MSG_SHIELD_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.privacy.v1.MsgShield"];

/** Type URL for MsgPrivateTransfer (privacy module). */
export const MSG_PRIVATE_TRANSFER_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.privacy.v1.MsgPrivateTransfer"];

/** Type URL for MsgUnshield (privacy module). */
export const MSG_UNSHIELD_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.privacy.v1.MsgUnshield"];

/** Type URL for MsgRegisterAgent (agent module). */
export const MSG_REGISTER_AGENT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgRegisterAgent"];

/** Type URL for MsgAgentAction (agent module). */
export const MSG_AGENT_ACTION_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgAgentAction"];

/** Type URL for MsgAgentHeartbeat (agent module). */
export const MSG_AGENT_HEARTBEAT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgAgentHeartbeat"];

/** Type URL for MsgSubmitIntent (agent module). */
export const MSG_SUBMIT_INTENT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgSubmitIntent"];

/** Type URL for MsgRespondToIntent (agent module). */
export const MSG_RESPOND_TO_INTENT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgRespondToIntent"];

/** Type URL for MsgFinalizeIntent (agent module). */
export const MSG_FINALIZE_INTENT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgFinalizeIntent"];

/** Type URL for MsgDelegateTask (agent module). */
export const MSG_DELEGATE_TASK_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgDelegateTask"];

/** Type URL for MsgAcceptTask (agent module). */
export const MSG_ACCEPT_TASK_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgAcceptTask"];

/** Type URL for MsgCompleteTask (agent module). */
export const MSG_COMPLETE_TASK_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgCompleteTask"];

/** Type URL for MsgDeregisterAgent (agent module). */
export const MSG_DEREGISTER_AGENT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.agent.v1.MsgDeregisterAgent"];

/** Type URL for MsgRegisterViewKey (privacy module). */
export const MSG_REGISTER_VIEW_KEY_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.privacy.v1.MsgRegisterViewKey"];

// ---------------------------------------------------------------------------
// REST API paths (relative to LCD base URL)
// ---------------------------------------------------------------------------

/** REST path for the privacy module MerkleRoot query. */
export const REST_MERKLE_ROOT = PROTO_QUERY_HTTP_PATHS["clawchain.privacy.v1.Query.MerkleRoot"];

/** REST path template for the privacy module NullifierExists query. */
export const REST_NULLIFIER_EXISTS = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.privacy.v1.Query.NullifierExists"];

/** REST path template for the agent module Agent query. */
export const REST_AGENT = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.Agent"];

/** REST path for the agent module Params query. */
export const REST_AGENT_PARAMS = PROTO_QUERY_HTTP_PATHS["clawchain.agent.v1.Query.Params"];

/** REST path for the agent module Intent query. */
export const REST_INTENT = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.Intent"];

/** REST path for the privacy module ViewKey query. */
export const REST_VIEW_KEY = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.privacy.v1.Query.ViewKey"];

/** REST path for the privacy module VerifyAmountProof query. */
export const REST_VERIFY_AMOUNT_PROOF = PROTO_QUERY_HTTP_PATHS["clawchain.privacy.v1.Query.VerifyAmountProof"];

/** REST path for the privacy module MerkleProof query. */
export const REST_MERKLE_PROOF = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.privacy.v1.Query.MerkleProof"];

/** REST path for the privacy module CommitmentIndex query. */
export const REST_COMMITMENT_INDEX = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.privacy.v1.Query.CommitmentIndex"];

/** REST path for the privacy module TreeStats query. */
export const REST_TREE_STATS = PROTO_QUERY_HTTP_PATHS["clawchain.privacy.v1.Query.TreeStats"];

/** REST path for the privacy module RootHistory query (query params: offset, limit). */
export const REST_ROOT_HISTORY = PROTO_QUERY_HTTP_PATHS["clawchain.privacy.v1.Query.RootHistory"];

/** Type URL for MsgBatchPrivateTransfer (privacy module). */
export const MSG_BATCH_PRIVATE_TRANSFER_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.privacy.v1.MsgBatchPrivateTransfer"];

// ---------------------------------------------------------------------------
// Messaging module type URLs
// ---------------------------------------------------------------------------

/** Type URL for MsgSendMessage (messaging module). */
export const MSG_SEND_MESSAGE_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.messaging.v1.MsgSendMessage"];

/** Type URL for MsgAckMessage (messaging module). */
export const MSG_ACK_MESSAGE_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.messaging.v1.MsgAckMessage"];

// ---------------------------------------------------------------------------
// Messaging module REST paths
// ---------------------------------------------------------------------------

/** REST path for querying messaging module params. */
export const REST_MESSAGING_PARAMS = PROTO_QUERY_HTTP_PATHS["clawchain.messaging.v1.Query.Params"];

/** REST path template for querying messages by address. */
export const REST_MESSAGES = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.messaging.v1.Query.Messages"];

/** REST path template for querying a conversation between two addresses. */
export const REST_CONVERSATION = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.messaging.v1.Query.Conversation"];

// ---------------------------------------------------------------------------
// Governance module type URLs (standard Cosmos SDK x/gov)
// ---------------------------------------------------------------------------

/** Type URL for MsgSubmitProposal (gov module). */
export const MSG_SUBMIT_PROPOSAL_TYPE_URL = "/cosmos.gov.v1.MsgSubmitProposal";

/** Type URL for MsgVote (gov module). */
export const MSG_VOTE_TYPE_URL = "/cosmos.gov.v1.MsgVote";

/** Type URL for MsgDeposit (gov module). */
export const MSG_DEPOSIT_TYPE_URL = "/cosmos.gov.v1.MsgDeposit";

// ---------------------------------------------------------------------------
// Governance module REST paths
// ---------------------------------------------------------------------------

/** REST path for querying governance proposals. */
export const REST_GOV_PROPOSALS = "/cosmos/gov/v1/proposals";

// ---------------------------------------------------------------------------
// Marketplace module type URLs
// ---------------------------------------------------------------------------

/** Type URL for MsgListSkill (marketplace module). */
export const MSG_LIST_SKILL_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgListSkill"];

/** Type URL for MsgDelistSkill (marketplace module). */
export const MSG_DELIST_SKILL_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgDelistSkill"];

/** Type URL for MsgPurchaseSkill (marketplace module). */
export const MSG_PURCHASE_SKILL_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgPurchaseSkill"];

// ---------------------------------------------------------------------------
// Marketplace module REST paths
// ---------------------------------------------------------------------------

/** REST path for querying marketplace skills. */
export const REST_MARKETPLACE_SKILLS = PROTO_QUERY_HTTP_PATHS["clawchain.marketplace.v1.Query.Skills"];

/** REST path for querying a skill by ID. */
export const REST_MARKETPLACE_SKILL = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.Skill"];

// ---------------------------------------------------------------------------
// IBC privacy metadata
// ---------------------------------------------------------------------------

/** Key used in ICS-20 memo field to trigger auto-shielding on the receiver chain. */
export const IBC_PRIVACY_MEMO_KEY = "clawchain_privacy";

/** Key used in ICS-20 memo field for cross-chain agent discovery. */
export const IBC_AGENT_MEMO_KEY = "clawchain_agent";

// ---------------------------------------------------------------------------
// Reputation module type URLs
// ---------------------------------------------------------------------------

/** Type URL for MsgRateAgent (reputation module). */
export const MSG_RATE_AGENT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.reputation.v1.MsgRateAgent"];

/** Type URL for MsgEndorseAgent (reputation module). */
export const MSG_ENDORSE_AGENT_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.reputation.v1.MsgEndorseAgent"];

// ---------------------------------------------------------------------------
// Reputation module REST paths
// ---------------------------------------------------------------------------

/** REST path for querying an agent's reputation. */
export const REST_REPUTATION = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.reputation.v1.Query.Reputation"];

/** REST path for querying ratings for an agent. */
export const REST_RATINGS = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.reputation.v1.Query.Ratings"];

/** REST path for querying endorsements for an agent. */
export const REST_ENDORSEMENTS = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.reputation.v1.Query.Endorsements"];

/** REST path for querying top agents by reputation. */
export const REST_TOP_AGENTS = PROTO_QUERY_HTTP_PATHS["clawchain.reputation.v1.Query.TopAgents"];

// ---------------------------------------------------------------------------
// Escrow module type URLs (marketplace extension)
// ---------------------------------------------------------------------------

/** Type URL for MsgCreateEscrow (marketplace module). */
export const MSG_CREATE_ESCROW_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgCreateEscrow"];

/** Type URL for MsgCompleteEscrow (marketplace module). */
export const MSG_COMPLETE_ESCROW_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgCompleteEscrow"];

/** Type URL for MsgCompleteMilestone (marketplace module). */
export const MSG_COMPLETE_MILESTONE_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgCompleteMilestone"];

/** Type URL for MsgDisputeEscrow (marketplace module). */
export const MSG_DISPUTE_ESCROW_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgDisputeEscrow"];

/** Type URL for MsgResolveDispute (marketplace module). */
export const MSG_RESOLVE_DISPUTE_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgResolveDispute"];

/** Type URL for MsgUpdateSkill (marketplace module). */
export const MSG_UPDATE_SKILL_TYPE_URL = PROTO_MSG_TYPE_URLS["clawchain.marketplace.v1.MsgUpdateSkill"];

// ---------------------------------------------------------------------------
// Escrow & skill versioning REST paths (marketplace extension)
// ---------------------------------------------------------------------------

/** REST path for querying a single escrow by ID. */
export const REST_ESCROW = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.Escrow"];

/** REST path for querying escrows by address. */
export const REST_ESCROWS = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.Escrows"];

/** REST path for querying a dispute by escrow ID. */
export const REST_DISPUTE = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.Dispute"];

/** REST path for querying skills by category. */
export const REST_SKILLS_BY_CATEGORY = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.SkillsByCategory"];

/** REST path for querying skills by owner. */
export const REST_SKILLS_BY_OWNER = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.SkillsByOwner"];

/** REST path for searching skills. */
export const REST_SKILL_SEARCH = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.SkillSearch"];

/** REST path for querying skill analytics. */
export const REST_SKILL_ANALYTICS = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.marketplace.v1.Query.SkillAnalytics"];

// ---------------------------------------------------------------------------
// Agent activity REST paths (agent extension)
// ---------------------------------------------------------------------------

/** REST path for querying agent activity. */
export const REST_AGENT_ACTIVITY = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.AgentActivity"];

/** REST path for querying agent stats. */
export const REST_AGENT_STATS = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.AgentStats"];

/** REST path for querying recent global activity. */
export const REST_RECENT_ACTIVITY = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.RecentActivity"];

/** REST path for querying agent liveness (heartbeat). */
export const REST_AGENT_LIVENESS = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.AgentLiveness"];

/** REST path for querying live agents (with recent heartbeats). */
export const REST_LIVE_AGENTS = PROTO_QUERY_HTTP_PATHS["clawchain.agent.v1.Query.LiveAgents"];

/** REST path for querying a task by ID. */
export const REST_TASK = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.Task"];

/** REST path for querying tasks by delegator. */
export const REST_TASKS_BY_DELEGATOR = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.TasksByDelegator"];

/** REST path for querying tasks by assignee. */
export const REST_TASKS_BY_ASSIGNEE = PROTO_QUERY_HTTP_PREFIX_PATHS["clawchain.agent.v1.Query.TasksByAssignee"];

// ---------------------------------------------------------------------------
// GPU Compute Marketplace REST paths
// ---------------------------------------------------------------------------

/** REST path for querying compute resources. */
export const REST_COMPUTE_RESOURCES = "/clawchain/marketplace/v1/compute_resources";

/** REST path prefix for querying a single compute resource. */
export const REST_COMPUTE_RESOURCE = "/clawchain/marketplace/v1/compute_resource";

/** REST path prefix for querying compute leases. */
export const REST_COMPUTE_LEASES = "/clawchain/marketplace/v1/compute_leases";

/** Type URL for MsgListComputeResource (marketplace module). */
export const MSG_LIST_COMPUTE_RESOURCE_TYPE_URL = "/clawchain.marketplace.v1.MsgListComputeResource";

/** Type URL for MsgLeaseComputeResource (marketplace module). */
export const MSG_LEASE_COMPUTE_RESOURCE_TYPE_URL = "/clawchain.marketplace.v1.MsgLeaseComputeResource";

/** Type URL for MsgReleaseComputeResource (marketplace module). */
export const MSG_RELEASE_COMPUTE_RESOURCE_TYPE_URL = "/clawchain.marketplace.v1.MsgReleaseComputeResource";

/** Type URL for MsgSubmitComputeJob (marketplace module). */
export const MSG_SUBMIT_COMPUTE_JOB_TYPE_URL = "/clawchain.marketplace.v1.MsgSubmitComputeJob";

/** Type URL for MsgUpdateJobStatus (marketplace module). */
export const MSG_UPDATE_JOB_STATUS_TYPE_URL = "/clawchain.marketplace.v1.MsgUpdateJobStatus";

/** Type URL for MsgUpdateGPUMetrics (marketplace module). */
export const MSG_UPDATE_GPU_METRICS_TYPE_URL = "/clawchain.marketplace.v1.MsgUpdateGPUMetrics";

/** REST path for querying compute jobs. */
export const REST_COMPUTE_JOBS = "/clawchain/marketplace/v1/compute_jobs";

/** REST path prefix for querying a single compute job by ID. */
export const REST_COMPUTE_JOB = "/clawchain/marketplace/v1/compute_job";

/** REST path prefix for querying provider stats. */
export const REST_PROVIDER_STATS = "/clawchain/marketplace/v1/provider_stats";

/** REST path for listing GPU providers. */
export const REST_GPU_PROVIDERS = "/clawchain/marketplace/v1/gpu_providers";

// ---------------------------------------------------------------------------
// Agent Negotiation type URLs & REST paths
// ---------------------------------------------------------------------------

/** Type URL for MsgProposeNegotiation (agent module). */
export const MSG_PROPOSE_NEGOTIATION_TYPE_URL = "/clawchain.agent.v1.MsgProposeNegotiation";

/** Type URL for MsgCounterNegotiation (agent module). */
export const MSG_COUNTER_NEGOTIATION_TYPE_URL = "/clawchain.agent.v1.MsgCounterNegotiation";

/** Type URL for MsgAcceptNegotiation (agent module). */
export const MSG_ACCEPT_NEGOTIATION_TYPE_URL = "/clawchain.agent.v1.MsgAcceptNegotiation";

/** Type URL for MsgRejectNegotiation (agent module). */
export const MSG_REJECT_NEGOTIATION_TYPE_URL = "/clawchain.agent.v1.MsgRejectNegotiation";

/** REST path prefix for querying a negotiation by ID. */
export const REST_NEGOTIATION = "/clawchain/agent/v1/negotiation";

/** REST path prefix for querying negotiations by agent address. */
export const REST_NEGOTIATIONS_BY_AGENT = "/clawchain/agent/v1/negotiations";

// ---------------------------------------------------------------------------
// Model Registry module type URLs & REST paths
// ---------------------------------------------------------------------------

/** REST path for querying all models. */
export const REST_MODELS = "/clawchain/modelregistry/v1/models";

/** REST path prefix for querying a single model by ID. */
export const REST_MODEL = "/clawchain/modelregistry/v1/model";

/** REST path prefix for querying model versions. */
export const REST_MODEL_VERSIONS = "/clawchain/modelregistry/v1/model/versions";

/** Type URL for MsgRegisterModel (modelregistry module). */
export const MSG_REGISTER_MODEL_TYPE_URL = "/clawchain.modelregistry.v1.MsgRegisterModel";

/** Type URL for MsgPurchaseModelAccess (modelregistry module). */
export const MSG_PURCHASE_MODEL_ACCESS_TYPE_URL = "/clawchain.modelregistry.v1.MsgPurchaseModelAccess";

/** Type URL for MsgRateModel (modelregistry module). */
export const MSG_RATE_MODEL_TYPE_URL = "/clawchain.modelregistry.v1.MsgRateModel";

// ---------------------------------------------------------------------------
// Inference Marketplace type URLs & REST paths
// ---------------------------------------------------------------------------

/** Type URL for MsgSubmitInferenceJob (modelregistry module). */
export const MSG_SUBMIT_INFERENCE_JOB_TYPE_URL = "/clawchain.modelregistry.v1.MsgSubmitInferenceJob";

/** Type URL for MsgCompleteInferenceJob (modelregistry module). */
export const MSG_COMPLETE_INFERENCE_JOB_TYPE_URL = "/clawchain.modelregistry.v1.MsgCompleteInferenceJob";

/** Type URL for MsgStartInferenceJob (modelregistry module). */
export const MSG_START_INFERENCE_JOB_TYPE_URL = "/clawchain.modelregistry.v1.MsgStartInferenceJob";

/** Type URL for MsgFailInferenceJob (modelregistry module). */
export const MSG_FAIL_INFERENCE_JOB_TYPE_URL = "/clawchain.modelregistry.v1.MsgFailInferenceJob";

/** Type URL for MsgRegisterInferenceProvider (modelregistry module). */
export const MSG_REGISTER_INFERENCE_PROVIDER_TYPE_URL = "/clawchain.modelregistry.v1.MsgRegisterInferenceProvider";

/** Type URL for MsgSetInferencePricing (modelregistry module). */
export const MSG_SET_INFERENCE_PRICING_TYPE_URL = "/clawchain.modelregistry.v1.MsgSetInferencePricing";

/** Type URL for MsgInferenceProviderHeartbeat (modelregistry module). */
export const MSG_INFERENCE_PROVIDER_HEARTBEAT_TYPE_URL = "/clawchain.modelregistry.v1.MsgInferenceProviderHeartbeat";

/** REST path for querying an inference job by ID. */
export const REST_INFERENCE_JOB = "/clawchain/modelregistry/v1/inference_job";

/** REST path for querying inference jobs (with optional model_id and status filters). */
export const REST_INFERENCE_JOBS = "/clawchain/modelregistry/v1/inference_jobs";

/** REST path for querying an inference provider by address. */
export const REST_INFERENCE_PROVIDER = "/clawchain/modelregistry/v1/inference_provider";

/** REST path for querying all inference providers (with optional model_id filter). */
export const REST_INFERENCE_PROVIDERS = "/clawchain/modelregistry/v1/inference_providers";

/** REST path for querying inference pricing for a model. */
export const REST_INFERENCE_PRICING = "/clawchain/modelregistry/v1/inference_pricing";

// ---------------------------------------------------------------------------
// Param Governance module (clawgovernance) type URLs & REST paths
// ---------------------------------------------------------------------------

/** Type URL for MsgSubmitParamProposal (clawgovernance module). */
export const MSG_SUBMIT_PARAM_PROPOSAL_TYPE_URL = "/clawchain.clawgovernance.v1.MsgSubmitParamProposal";

/** Type URL for MsgCastVote (clawgovernance module). */
export const MSG_CAST_PARAM_VOTE_TYPE_URL = "/clawchain.clawgovernance.v1.MsgCastVote";

/** REST path for querying parameter governance proposals. */
export const REST_PARAM_PROPOSALS = "/clawchain/governance/v1/proposals";

/** REST path prefix for querying a specific parameter governance proposal. */
export const REST_PARAM_PROPOSAL = "/clawchain/governance/v1/proposal";

// ---------------------------------------------------------------------------
// Supported agent action types
// ---------------------------------------------------------------------------

/** Action types the agent module accepts. */
export const SUPPORTED_ACTION_TYPES = ["transfer", "coordinate", "query", "heartbeat"] as const;

export type ActionType = (typeof SUPPORTED_ACTION_TYPES)[number];

/** Numeric vote option values matching cosmos.gov.v1.VoteOption enum. */
export const VOTE_OPTION_MAP: Record<string, number> = {
  yes: 1,
  abstain: 2,
  no: 3,
  no_with_veto: 4,
};

// ---------------------------------------------------------------------------
// Staking REST endpoints
// ---------------------------------------------------------------------------

/** REST path for querying staking validators. */
export const REST_STAKING_VALIDATORS = "/cosmos/staking/v1beta1/validators";

/** REST path for querying staking delegations. */
export const REST_STAKING_DELEGATIONS = "/cosmos/staking/v1beta1/delegations";

/** REST path for querying distribution rewards. */
export const REST_STAKING_REWARDS = "/cosmos/distribution/v1beta1/delegators";

// ---------------------------------------------------------------------------
// IBC REST endpoints
// ---------------------------------------------------------------------------

/** REST path for querying IBC channels. */
export const REST_IBC_CHANNELS = "/ibc/core/channel/v1/channels";

/** REST path for querying IBC connections. */
export const REST_IBC_CONNECTIONS = "/ibc/core/connection/v1/connections";

/** REST path for querying IBC client states. */
export const REST_IBC_CLIENTS = "/ibc/core/client/v1/client_states";

/** REST path for querying IBC denom traces. */
export const REST_IBC_DENOM_TRACES = "/ibc/apps/transfer/v1/denom_traces";

/** REST path for querying remote agents via IBC. */
export const REST_IBC_REMOTE_AGENTS = "/clawchain/agent/v1/remote_agents";

// ---------------------------------------------------------------------------
// Staking tx type URLs
// ---------------------------------------------------------------------------

/** Type URL for MsgDelegate (staking module). */
export const MSG_DELEGATE_TYPE_URL = "/cosmos.staking.v1beta1.MsgDelegate";

/** Type URL for MsgUndelegate (staking module). */
export const MSG_UNDELEGATE_TYPE_URL = "/cosmos.staking.v1beta1.MsgUndelegate";

/** Type URL for MsgBeginRedelegate (staking module). */
export const MSG_REDELEGATE_TYPE_URL = "/cosmos.staking.v1beta1.MsgBeginRedelegate";

/** Type URL for MsgWithdrawDelegatorReward (distribution module). */
export const MSG_WITHDRAW_REWARDS_TYPE_URL = "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward";

// ---------------------------------------------------------------------------
// Agent rewards REST endpoints
// ---------------------------------------------------------------------------

/** REST path for querying agent cumulative rewards. */
export const REST_AGENT_REWARDS = "/clawchain/agent/v1/rewards";

// ---------------------------------------------------------------------------
// Task checkpoint type URL
// ---------------------------------------------------------------------------

/** Type URL for MsgCheckpointTask (agent module — crash recovery). */
export const MSG_CHECKPOINT_TASK_TYPE_URL = "/clawchain.agent.v1.MsgCheckpointTask";

// ---------------------------------------------------------------------------
// Negotiation type URLs
// ---------------------------------------------------------------------------

/** Type URL for MsgCounterPropose (agent negotiation). */
export const MSG_COUNTER_PROPOSE_TYPE_URL = "/clawchain.agent.v1.MsgCounterPropose";

// ---------------------------------------------------------------------------
// CosmWasm (wasm) module type URLs
// ---------------------------------------------------------------------------

/** Type URL for MsgStoreCode (wasm module). */
export const MSG_STORE_CODE_TYPE_URL = "/cosmwasm.wasm.v1.MsgStoreCode";

/** Type URL for MsgInstantiateContract (wasm module). */
export const MSG_INSTANTIATE_CONTRACT_TYPE_URL = "/cosmwasm.wasm.v1.MsgInstantiateContract";

/** Type URL for MsgExecuteContract (wasm module). */
export const MSG_EXECUTE_CONTRACT_TYPE_URL = "/cosmwasm.wasm.v1.MsgExecuteContract";

/** Type URL for MsgMigrateContract (wasm module). */
export const MSG_MIGRATE_CONTRACT_TYPE_URL = "/cosmwasm.wasm.v1.MsgMigrateContract";

// ---------------------------------------------------------------------------
// CosmWasm (wasm) module REST paths
// ---------------------------------------------------------------------------

/** REST path for listing all uploaded contract codes. */
export const REST_WASM_CODES = "/cosmwasm/wasm/v1/code";

/** REST path prefix for querying a specific code by ID. */
export const REST_WASM_CODE = "/cosmwasm/wasm/v1/code";

/** REST path prefix for querying a contract by address. */
export const REST_WASM_CONTRACT = "/cosmwasm/wasm/v1/contract";

/** REST path suffix for querying contract history. */
export const REST_WASM_CONTRACT_HISTORY_SUFFIX = "history";

/** REST path suffix for smart queries against a contract. */
export const REST_WASM_CONTRACT_SMART_SUFFIX = "smart";

/** REST path suffix for listing contracts by code ID. */
export const REST_WASM_CODE_CONTRACTS_SUFFIX = "contracts";

// ---------------------------------------------------------------------------
// Oracle module REST paths
// ---------------------------------------------------------------------------

/** REST path prefix for querying a single oracle price by denom pair. */
export const REST_ORACLE_PRICE = "/clawchain/oracle/v1/price";

/** REST path for querying all oracle prices. */
export const REST_ORACLE_PRICES = "/clawchain/oracle/v1/prices";

/** REST path prefix for querying oracle price history by denom pair. */
export const REST_ORACLE_PRICE_HISTORY = "/clawchain/oracle/v1/price_history";

/** REST path for querying oracle module params. */
export const REST_ORACLE_PARAMS = "/clawchain/oracle/v1/params";

/** REST path prefix for querying the feeder delegate for a validator. */
export const REST_ORACLE_FEEDER = "/clawchain/oracle/v1/feeder";

/** REST path prefix for querying the miss counter for a validator. */
export const REST_ORACLE_MISS = "/clawchain/oracle/v1/miss";
