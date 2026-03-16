/**
 * ClawChain SDK Type Definitions
 *
 * Types derived from the chain's protobuf definitions:
 *   - clawchain.privacy.v1 (tx.proto, query.proto)
 *   - clawchain.agent.v1   (tx.proto, query.proto)
 */

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/** Options passed to ClawChainClient constructor. */
export interface ClawChainClientOptions {
  /** Tendermint RPC endpoint (default: http://localhost:26657). */
  rpcUrl?: string;
  /** gRPC endpoint (default: localhost:9090). */
  grpcUrl?: string;
  /** BIP-39 mnemonic for signing transactions. Optional for read-only usage. */
  mnemonic?: string;
  /** Address prefix (default: "cosmos"). */
  prefix?: string;
  /** Gas price string, e.g. "0.025uclaw". */
  gasPrice?: string;
}

// ---------------------------------------------------------------------------
// Privacy module – messages
// ---------------------------------------------------------------------------

/** MsgShield – deposit tokens into the shielded pool. */
export interface MsgShieldParams {
  /** Amount in base denomination units (uint64). */
  amount: bigint | number;
  /** Coin denomination to shield (default: "uclaw"). */
  coins?: string;
}

/** MsgPrivateTransfer – transfer inside the shielded pool with ZK proof. */
export interface MsgPrivateTransferParams {
  /** Comma-separated hex-encoded old commitment hashes. */
  oldCommitments: string;
  /** Comma-separated hex-encoded new commitment hashes. */
  newCommitments: string;
  /** Comma-separated hex-encoded nullifier hashes (exactly 2). */
  nullifiers: string;
  /** Hex-encoded Merkle root the proof was generated against. */
  root: string;
  /** Hex-encoded Groth16 proof bytes. */
  proof: string;
}

/** MsgUnshield – withdraw tokens from the shielded pool with ZK proof. */
export interface MsgUnshieldParams {
  /** Hex-encoded commitment being spent. */
  commitment: string;
  /** Hex-encoded nullifier for double-spend protection. */
  nullifier: string;
  /** Hex-encoded Groth16 proof bytes. */
  proof: string;
  /** Amount to withdraw (uint64). */
  amount: bigint | number;
  /** Bech32 recipient address. If empty the creator receives the funds. */
  recipient?: string;
  /** Hex-encoded Merkle root the proof was generated against. */
  root: string;
}

// ---------------------------------------------------------------------------
// Agent module – messages
// ---------------------------------------------------------------------------

/** MsgRegisterAgent – register an AI agent on-chain. */
export interface MsgRegisterAgentParams {
  /** Public key (hex or base64). */
  pubkey: string;
  /** HTTP(S) endpoint other agents can reach this agent at. */
  endpoint: string;
  /** Human-readable agent name. */
  name: string;
  /** Deterministic sorted unique list of declared tool IDs/capabilities. */
  supportedTools?: string[];
  /** Optional pricing hint metadata (typically JSON). */
  pricingHint?: string;
  /** Agent runtime/version identifier. */
  version?: string;
}

/** MsgAgentAction – record an agent action on-chain. */
export interface MsgAgentActionParams {
  /** Action type: "transfer" | "coordinate" | "query". */
  actionType: string;
  /** JSON-encoded action payload. */
  payload: string;
  /** Optional proof for the action. */
  proof?: string;
}

/** MsgAgentHeartbeat – send an on-chain liveness signal. */
export interface MsgAgentHeartbeatParams {
  /** Current block height observed by the agent's local node. */
  nodeHeight: number;
  /** Agent's RPC endpoint for peer discovery. */
  endpoint?: string;
  /** Free-form metadata JSON (node mode, version, etc.). */
  metadata?: string;
}

/** MsgDelegateTask – delegate a task to another agent. */
export interface MsgDelegateTaskParams {
  /** Bech32 address of the agent to assign the task to. */
  assignee: string;
  /** Description of the task. */
  description: string;
  /** Requirements for completing the task. */
  requirements?: string;
  /** Skill ID relevant to this task (0 = none). */
  skillId?: number;
  /** Budget for the task (e.g. "1000uclaw"). */
  budget?: string;
  /** Number of blocks until the task deadline. */
  deadlineBlocks?: number;
}

/** MsgAcceptTask – accept a delegated task. */
export interface MsgAcceptTaskParams {
  /** ID of the task to accept. */
  taskId: number;
}

/** MsgCompleteTask – complete a task with a result. */
export interface MsgCompleteTaskParams {
  /** ID of the task to complete. */
  taskId: number;
  /** Result / deliverable of the completed task. */
  result: string;
}

/** MsgDeregisterAgent – deregister an agent and withdraw deposit. */
export interface MsgDeregisterAgentParams {}

// ---------------------------------------------------------------------------
// Privacy module – query responses
// ---------------------------------------------------------------------------

/** Response from the MerkleRoot query. */
export interface MerkleRootResponse {
  root: string;
}

/** Response from the NullifierExists query. */
export interface NullifierExistsResponse {
  exists: boolean;
}

// ---------------------------------------------------------------------------
// Agent module – query responses
// ---------------------------------------------------------------------------

/** MsgRegisterViewKey – register a view key for selective disclosure. */
export interface MsgRegisterViewKeyParams {
  /** Hex-encoded commitment hash. */
  commitmentHex: string;
  /** Encrypted note data. */
  encryptedNote: string;
}

/** Response from the ViewKey query. */
export interface ViewKeyResponse {
  encryptedNote: string;
  found: boolean;
}

/** Response from the VerifyAmountProof query. */
export interface VerifyAmountProofResponse {
  valid: boolean;
}

/** Response from the MerkleProof query. */
export interface MerkleProofResponse {
  leafIndex: number;
  path: string[];
  indices: number[];
  root: string;
  found: boolean;
}

/** Response from the CommitmentIndex query. */
export interface CommitmentIndexResponse {
  leafIndex: number;
  found: boolean;
}

/** Response from the TreeStats query. */
export interface TreeStatsResponse {
  leafCount: number;
  currentRoot: string;
  treeDepth: number;
}

/** Response from the RootHistory query. */
export interface RootHistoryResponse {
  roots: string[];
  nextOffset: number;
  total: number;
}

/** A single transfer entry within a batch private transfer. */
export interface BatchTransferEntry {
  oldCommitments: string;
  newCommitments: string;
  nullifiers: string;
  root: string;
  proof: string;
}

/** MsgBatchPrivateTransfer – batch multiple private transfers. */
export interface MsgBatchPrivateTransferParams {
  transfers: BatchTransferEntry[];
}

/** MsgSubmitIntent – submit a multi-agent coordination intent. */
export interface MsgSubmitIntentParams {
  /** Intent type: "joint_transfer" | "data_share" | "consensus_vote". */
  intentType: string;
  /** Human-readable description. */
  description: string;
  /** JSON-encoded intent payload. */
  payload: string;
  /** Minimum number of responses required. */
  minResponses?: number;
}

/** MsgRespondToIntent – respond to a coordination intent. */
export interface MsgRespondToIntentParams {
  /** ID of the intent to respond to. */
  intentId: number;
  /** Whether to accept or reject the intent. */
  accepted: boolean;
  /** JSON-encoded response payload. */
  payload?: string;
}

/** MsgFinalizeIntent – finalize or cancel a coordination intent. */
export interface MsgFinalizeIntentParams {
  /** ID of the intent to finalize. */
  intentId: number;
  /** Set to true to cancel instead of finalize. */
  cancel?: boolean;
}

/** Response from the Intent query. */
export interface IntentInfoResponse {
  found: boolean;
  id: number;
  creatorAddress: string;
  description: string;
  intentType: string;
  payload: string;
  status: string;
  minResponses: number;
}

/** Response from the Agent query. */
export interface AgentInfoResponse {
  name: string;
  pubkey: string;
  endpoint: string;
  registered: boolean;
  supportedTools?: string[];
  pricingHint?: string;
  version?: string;
  /** Deposit held by the module account (uclaw). */
  depositAmount?: string;
}

/** Response from the agent Params query. */
export interface AgentParamsResponse {
  params: {
    maxHeartbeatGapBlocks: number;
    maxActionsPerBlock: number;
    minHeartbeatIntervalBlocks: number;
    maxIntentsPerBlock: number;
    maxTasksPerBlock: number;
    maxPayloadBytes: number;
    minAgentDepositUclaw: number;
    depositSlashPerPenaltyBps: number;
    minTaskBudgetUclaw: number;
    highImpactMinDepositUclaw: number;
    standardTaskMinBudgetUclaw: number;
    expeditedTaskMinBudgetUclaw: number;
    expeditedTaskMaxDeadlineBlocks: number;
  };
}

/** Response from the Task query. */
export interface TaskInfoResponse {
  found: boolean;
  taskId: number;
  delegatorAddress: string;
  assigneeAddress: string;
  description: string;
  requirements: string;
  skillId: number;
  budget: string;
  deadlineBlocks: number;
  status: string;
  result: string;
  createdAt: number;
  completedAt: number;
}

/** Response from the TasksByDelegator or TasksByAssignee query. */
export interface TasksResponse {
  tasks: TaskInfoResponse[];
}

/** Response from the AgentLiveness query. */
export interface AgentLivenessResponse {
  found: boolean;
  liveness: {
    agentAddress: string;
    lastHeartbeatHeight: number;
    lastHeartbeatTime: number;
    reportedNodeHeight: number;
    endpoint: string;
    metadata: string;
    heartbeatCount: number;
  };
}

/** A single entry in the LiveAgents response. */
export interface LiveAgentEntry {
  address: string;
  name: string;
  endpoint: string;
  liveness: {
    agentAddress: string;
    lastHeartbeatHeight: number;
    lastHeartbeatTime: number;
    reportedNodeHeight: number;
    endpoint: string;
    metadata: string;
    heartbeatCount: number;
  };
}

/** Response from the LiveAgents query. */
export interface LiveAgentsResponse {
  agents: LiveAgentEntry[];
  pagination?: {
    nextKey?: string;
    total?: string;
  };
}

// ---------------------------------------------------------------------------
// Transaction result
// ---------------------------------------------------------------------------

/** Standardised result returned by all mutation methods. */
export interface TxResult {
  /** Transaction hash. */
  transactionHash: string;
  /** Block height the tx was included in. */
  height: number;
  /** Cosmos SDK result code (0 = success). */
  code: number;
  /** Raw log / error message when code != 0. */
  rawLog: string;
  /** Gas used by the transaction. */
  gasUsed: number;
  /** Gas requested for the transaction. */
  gasWanted: number;
  /** Parsed events emitted by the transaction. */
  events: TxEvent[];
}

/** A single event from a transaction result. */
export interface TxEvent {
  type: string;
  attributes: Array<{ key: string; value: string }>;
}

// ---------------------------------------------------------------------------
// Proof generator types
// ---------------------------------------------------------------------------

/** Configuration for the ProofGenerator wrapper. */
export interface ProofGeneratorOptions {
  /** Absolute path to the clawproof binary. */
  binaryPath?: string;
  /** Working directory for the binary (e.g. where keys are stored). */
  workDir?: string;
  /** Timeout in milliseconds for proof generation (default: 60 000). */
  timeoutMs?: number;
}

/** Output of the commitment generation command. */
export interface CommitmentOutput {
  commitment: string;
  amount: string;
  blinding: string;
}

/** Output of the nullifier generation command. */
export interface NullifierOutput {
  nullifier: string;
  secret: string;
  commitment: string;
}

/** Output of the shield data generation command. */
export interface ShieldDataOutput {
  commitment: string;
  amount: string;
  blinding: string;
  secret: string;
}

/** Parameters for unshield proof generation. */
export interface UnshieldProofParams {
  commitment: string;
  amount: string;
  blinding: string;
  secret: string;
  merklePath: string[];
  merklePathIndices: number[];
  root: string;
}

/** Parameters for transfer proof generation. */
export interface TransferProofParams {
  oldCommitments: [string, string];
  oldBlindings: [string, string];
  oldSecrets: [string, string];
  oldAmounts: [string, string];
  newAmounts: [string, string];
  newBlindings: [string, string];
  merklePaths: [string[], string[]];
  merklePathIndices: [number[], number[]];
  root: string;
}

/** Output of any proof generation command. */
export interface ProofOutput {
  proof: string;
  publicInputs: string[];
}

// ---------------------------------------------------------------------------
// Agent abstraction types
// ---------------------------------------------------------------------------

/** Configuration for the high-level ClawChainAgent. */
export interface ClawChainAgentOptions {
  /** Human-readable agent name. */
  name: string;
  /** BIP-39 mnemonic for the agent's key. */
  mnemonic: string;
  /** Tendermint RPC URL (default: http://localhost:26657). */
  rpcUrl?: string;
  /** gRPC URL (default: localhost:9090). */
  grpcUrl?: string;
  /** Absolute path to the clawproof binary (default: "clawproof"). */
  proofBinaryPath?: string;
  /** Address prefix (default: "cosmos"). */
  prefix?: string;
  /** HTTP(S) endpoint where this agent is reachable. */
  endpoint?: string;
  /** Port for the agent messaging server (default: 7777). */
  messagingPort?: number;
  /** Declared capability/tool IDs to publish when registering. */
  supportedTools?: string[];
  /** Optional pricing hint metadata (typically JSON). */
  pricingHint?: string;
  /** Agent runtime/version identifier to publish during registration. */
  version?: string;
}

// ---------------------------------------------------------------------------
// Messaging types
// ---------------------------------------------------------------------------

/** Wire format for encrypted agent-to-agent messages. */
export interface AgentMessage {
  /** Sender's bech32 address. */
  from: string;
  /** Recipient's bech32 address. */
  to: string;
  /** Base64-encoded ECIES ciphertext. */
  ciphertext: string;
  /** Hex-encoded secp256k1 signature over the ciphertext. */
  signature: string;
  /** Unix timestamp (ms). */
  timestamp: number;
}

/** Decrypted message after processing. */
export interface DecryptedMessage {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Messaging module – messages
// ---------------------------------------------------------------------------

/** MsgSendMessage – send an encrypted on-chain message. */
export interface MsgSendMessageParams {
  /** Bech32 address of the recipient. */
  recipient: string;
  /** Base64-encoded ciphertext. */
  ciphertext: string;
  /** Nonce for the encryption (hex or base64). */
  nonce: string;
}

/** MsgAckMessage – acknowledge receipt of an on-chain message. */
export interface MsgAckMessageParams {
  /** ID of the message to acknowledge. */
  messageId: number;
}

// ---------------------------------------------------------------------------
// Messaging module – query responses
// ---------------------------------------------------------------------------

/** A single on-chain message record. */
export interface OnChainMessage {
  id: number;
  sender: string;
  recipient: string;
  ciphertext: string;
  nonce: string;
  acknowledged: boolean;
  createdAt: number;
}

/** Response from the Messages query. */
export interface MessagesResponse {
  messages: OnChainMessage[];
}

/** Response from the Conversation query. */
export interface ConversationResponse {
  messages: OnChainMessage[];
}

// ---------------------------------------------------------------------------
// Governance module – types
// ---------------------------------------------------------------------------

/** Vote option for governance proposals. */
export type VoteOption = "yes" | "abstain" | "no" | "no_with_veto";

/** MsgSubmitProposal – submit a governance proposal (text-only, no inner messages). */
export interface MsgSubmitProposalParams {
  /** Proposal title. */
  title: string;
  /** Proposal summary / description. */
  summary: string;
  /** Optional metadata (e.g. IPFS hash). */
  metadata?: string;
  /** Initial deposit coins. */
  initialDeposit: Array<{ denom: string; amount: string }>;
  /** Whether the proposal is expedited. */
  expedited?: boolean;
}

/** MsgVote – vote on a governance proposal. */
export interface MsgVoteParams {
  /** ID of the proposal to vote on. */
  proposalId: number;
  /** Vote option. */
  option: VoteOption;
  /** Optional metadata. */
  metadata?: string;
}

/** MsgDeposit – deposit tokens on a governance proposal. */
export interface MsgDepositParams {
  /** ID of the proposal to deposit on. */
  proposalId: number;
  /** Deposit coins. */
  amount: Array<{ denom: string; amount: string }>;
}

/** On-chain governance proposal info (LCD response format). */
export interface ProposalInfo {
  id: string;
  title: string;
  summary: string;
  status: string;
  proposer: string;
  submit_time: string;
  voting_start_time: string;
  voting_end_time: string;
  total_deposit: Array<{ denom: string; amount: string }>;
  metadata: string;
}

/** Response from the Proposals query. */
export interface ProposalsResponse {
  proposals: ProposalInfo[];
}

// ---------------------------------------------------------------------------
// Param Governance module (clawgovernance) – types
// ---------------------------------------------------------------------------

/** Parameter change proposal status. */
export type ParamProposalStatus = "voting" | "passed" | "rejected" | "executed";

/** Parameter change vote option. */
export type ParamVoteOption = "yes" | "no" | "abstain";

/** On-chain parameter change proposal info. */
export interface ParamProposalInfo {
  proposal_id: number;
  title: string;
  description: string;
  module: string;
  param_key: string;
  proposed_value: string;
  proposer: string;
  deposit: Array<{ denom: string; amount: string }>;
  status: ParamProposalStatus;
  voting_end_block: number;
  yes_votes: string;
  no_votes: string;
  abstain_votes: string;
  created_at: number;
}

/** Vote on a parameter change proposal. */
export interface ParamVoteInfo {
  proposal_id: number;
  voter: string;
  option: ParamVoteOption;
  weight: string;
}

// ---------------------------------------------------------------------------
// Marketplace module – types
// ---------------------------------------------------------------------------

/** MsgListSkill – list an agent skill on the marketplace. */
export interface MsgListSkillParams {
  /** Skill name. */
  name: string;
  /** Skill description. */
  description: string;
  /** Price in base denomination units. */
  price: string;
  /** Token denomination (default: "uclaw"). */
  denom?: string;
}

/** MsgDelistSkill – remove a skill from the marketplace. */
export interface MsgDelistSkillParams {
  /** ID of the skill to delist. */
  skillId: number;
}

/** MsgPurchaseSkill – purchase access to a skill. */
export interface MsgPurchaseSkillParams {
  /** ID of the skill to purchase. */
  skillId: number;
}

/** On-chain skill listing info. */
export interface SkillInfo {
  id: number;
  owner: string;
  name: string;
  description: string;
  price: string;
  denom: string;
  active: boolean;
  purchaseCount: number;
}

/** Response from the Skills query. */
export interface SkillsResponse {
  skills: SkillInfo[];
}

// ---------------------------------------------------------------------------
// IBC cross-chain types
// ---------------------------------------------------------------------------

/** Parameters for a basic IBC token transfer. */
export interface IBCTransferParams {
  /** IBC channel ID on the source chain (e.g. "channel-0"). */
  sourceChannel: string;
  /** Token denomination to transfer. */
  denom: string;
  /** Amount to transfer (as string). */
  amount: string;
  /** Bech32 receiver address on the destination chain. */
  receiver: string;
  /** Optional memo string for the transfer. */
  memo?: string;
  /** Timeout height on the destination chain. 0 = use timestamp instead. */
  timeoutHeight?: number;
  /** Timeout timestamp in nanoseconds. Default: 10 minutes from now. */
  timeoutTimestamp?: bigint;
}

/** Parameters for an IBC transfer with optional auto-shielding on the destination. */
export interface IBCShieldTransferParams {
  /** IBC channel ID on the source chain (e.g. "channel-0"). */
  sourceChannel: string;
  /** Token denomination to transfer. */
  denom: string;
  /** Amount to transfer (as string). */
  amount: string;
  /** Bech32 receiver address on the destination chain. */
  receiver: string;
  /** Timeout height on the destination chain. 0 = use timestamp instead. */
  timeoutHeight?: number;
  /** Timeout timestamp in nanoseconds. Default: 10 minutes from now. */
  timeoutTimestamp?: bigint;
  /** Whether to auto-shield on the receiving chain. Default: true. */
  autoShield?: boolean;
}

/** Parameters for delegating a task to a remote agent via IBC. */
export interface IBCDelegateTaskParams {
  /** IBC channel ID on the source chain (e.g. "channel-0"). */
  sourceChannel: string;
  /** Assignee agent address on the destination chain. */
  assignee: string;
  /** Task description. */
  description: string;
  /** Task budget (e.g. "1000000uclaw"). */
  budget: string;
  /** Budget denom for the IBC transfer. Defaults to "uclaw". */
  denom?: string;
  /** Deadline in blocks (default: 200). */
  deadlineBlocks?: number;
  /** Task requirements string. */
  requirements?: string;
  /** Timeout timestamp in nanoseconds. Default: 10 minutes from now. */
  timeoutTimestamp?: bigint;
}

// ---------------------------------------------------------------------------
// Agent abstraction types (continued)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reputation module – messages
// ---------------------------------------------------------------------------

/** MsgRateAgent – rate an agent after purchasing from them. */
export interface MsgRateAgentParams {
  /** Bech32 address of the agent to rate. */
  agentAddress: string;
  /** Skill ID the rating is for. */
  skillId: number;
  /** Score from 1 to 5. */
  score: number;
  /** Optional comment. */
  comment?: string;
}

/** MsgEndorseAgent – endorse another registered agent. */
export interface MsgEndorseAgentParams {
  /** Bech32 address of the agent to endorse. */
  agentAddress: string;
  /** Reason for the endorsement. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Reputation module – query responses
// ---------------------------------------------------------------------------

/** On-chain reputation record for an agent. */
export interface ReputationInfo {
  agentAddress: string;
  totalRatings: number;
  ratingSum: number;
  avgRatingBps: number;
  intentsCreated: number;
  intentsCompleted: number;
  skillPurchases: number;
  endorsements: number;
  lastUpdated: number;
  uptimeScoreBps: number;
  heartbeatSlaPenalties: number;
  heartbeatSlaRecoveries: number;
  taskSlaOnTimeCount: number;
  taskSlaLateCount: number;
  taskSlaPenaltyBpsTotal: number;
  taskSlaRewardBpsTotal: number;
}

/** Response from the Reputation query. */
export interface ReputationResponse {
  reputation: ReputationInfo;
  found: boolean;
}

/** A single rating record. */
export interface RatingInfo {
  id: number;
  rater: string;
  ratedAgent: string;
  skillId: number;
  score: number;
  comment: string;
  blockHeight: number;
}

/** Response from the Ratings query. */
export interface RatingsResponse {
  ratings: RatingInfo[];
}

/** A single endorsement record. */
export interface EndorsementInfo {
  id: number;
  endorser: string;
  endorsed: string;
  reason: string;
  blockHeight: number;
}

/** Response from the Endorsements query. */
export interface EndorsementsResponse {
  endorsements: EndorsementInfo[];
}

/** Response from the TopAgents query. */
export interface TopAgentsResponse {
  agents: ReputationInfo[];
}

// ---------------------------------------------------------------------------
// Escrow module – messages (marketplace extension)
// ---------------------------------------------------------------------------

/** MsgCreateEscrow – create an escrow for a skill purchase. */
export interface MsgCreateEscrowParams {
  /** Skill ID to create escrow for. */
  skillId: number;
  /** Number of blocks until escrow expires. */
  deadlineBlocks: number;
  /** Description of the work to be done. */
  description: string;
  /** Number of milestones (0 = single delivery). */
  milestones?: number;
}

/** MsgCompleteEscrow – buyer confirms delivery, funds released. */
export interface MsgCompleteEscrowParams {
  /** ID of the escrow to complete. */
  escrowId: number;
}

/** MsgCompleteMilestone – buyer confirms one milestone. */
export interface MsgCompleteMilestoneParams {
  /** ID of the escrow. */
  escrowId: number;
}

/** MsgDisputeEscrow – either party opens a dispute. */
export interface MsgDisputeEscrowParams {
  /** ID of the escrow to dispute. */
  escrowId: number;
  /** Reason for the dispute. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Escrow module – query responses
// ---------------------------------------------------------------------------

/** On-chain escrow agreement info. */
export interface EscrowInfo {
  id: number;
  skillId: number;
  buyer: string;
  seller: string;
  amount: string;
  denom: string;
  status: string;
  description: string;
  deadlineBlock: number;
  createdAt: number;
  completedAt: number;
  milestones: number;
  milestonesComplete: number;
}

/** Response from the Escrow query. */
export interface EscrowResponse {
  escrow: EscrowInfo;
  found: boolean;
}

/** Response from the Escrows query. */
export interface EscrowsResponse {
  escrows: EscrowInfo[];
}

/** On-chain dispute info. */
export interface DisputeInfo {
  escrowId: number;
  initiator: string;
  reason: string;
  status: string;
  createdAt: number;
  resolvedAt: number;
}

/** Response from the Dispute query. */
export interface DisputeResponse {
  dispute: DisputeInfo;
  found: boolean;
}

// ---------------------------------------------------------------------------
// Skill versioning – messages (marketplace extension)
// ---------------------------------------------------------------------------

/** MsgUpdateSkill – update a listed skill (auto-increments version). */
export interface MsgUpdateSkillParams {
  /** ID of the skill to update. */
  skillId: number;
  /** Updated description. */
  description?: string;
  /** Updated price. */
  price?: string;
  /** Category for the skill. */
  category?: string;
  /** Tags for discoverability. */
  tags?: string[];
  /** Dependency skill IDs. */
  dependencies?: number[];
}

// ---------------------------------------------------------------------------
// Skill versioning – query responses
// ---------------------------------------------------------------------------

/** Response from the SkillAnalytics query. */
export interface SkillAnalyticsInfo {
  skillId: number;
  totalRevenue: string;
  purchaseCount: number;
  avgRating: number;
  versionCount: number;
}

/** Response from the SkillAnalytics query. */
export interface SkillAnalyticsResponse {
  analytics: SkillAnalyticsInfo;
}

// ---------------------------------------------------------------------------
// Agent activity – query responses
// ---------------------------------------------------------------------------

/** Aggregate stats for an agent. */
export interface AgentStatsInfo {
  agentAddress: string;
  totalActions: number;
  actionsByType: Record<string, number>;
  intentsCreated: number;
  intentsFinalized: number;
  firstActiveBlock: number;
  lastActiveBlock: number;
}

/** Response from the AgentStats query. */
export interface AgentStatsResponse {
  stats: AgentStatsInfo;
  found: boolean;
}

/** A single agent action event. */
export interface AgentActionRecord {
  creator: string;
  actionType: string;
  payload: string;
  blockHeight: number;
}

/** Response from the AgentActivity query. */
export interface AgentActivityResponse {
  activities: AgentActionRecord[];
}

/** Response from the RecentActivity query. */
export interface RecentActivityResponse {
  activities: AgentActionRecord[];
}

// ---------------------------------------------------------------------------
// Agent abstraction types (continued)
// ---------------------------------------------------------------------------

/** Local in-memory record of a shielded commitment owned by the agent. */
export interface LocalCommitment {
  /** Hex-encoded commitment hash. */
  commitment: string;
  /** Amount in base denomination units. */
  amount: string;
  /** Hex-encoded blinding factor. */
  blinding: string;
  /** Hex-encoded secret. */
  secret: string;
  /** Whether this commitment has been spent (nullified). */
  spent: boolean;
  /** Leaf index in the on-chain Merkle tree (if known). */
  leafIndex?: number;
}

// ---------------------------------------------------------------------------
// GPU Compute Marketplace types
// ---------------------------------------------------------------------------

/** Input for listing a GPU compute resource. */
export interface ComputeResourceInput {
  name: string;
  description: string;
  gpuModel: string;
  gpuCount: number;
  vramGb: number;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  pricePerHourUclaw: string;
  minLeaseHours: number;
  maxLeaseHours?: number;
  region?: string;
  endpoint: string;
  tags?: string[];
}

/** On-chain compute resource info. */
export interface ComputeResource {
  id: number;
  owner: string;
  name: string;
  description: string;
  gpuModel: string;
  gpuCount: number;
  vramGb: number;
  cpuCores: number;
  ramGb: number;
  storageGb: number;
  pricePerHourUclaw: string;
  minLeaseHours: number;
  maxLeaseHours: number;
  active: boolean;
  currentLessee: string;
  leaseExpiresAt: number;
  region: string;
  endpoint: string;
  tags: string[];
  totalLeases: number;
  totalRevenue: string;
  blockHeight: number;
  timestamp: number;
}

/** On-chain compute lease info. */
export interface ComputeLease {
  id: number;
  resourceId: number;
  lessee: string;
  provider: string;
  startBlock: number;
  endBlock: number;
  totalCostUclaw: string;
  status: string;           // "active", "completed", "expired", "cancelled", "settled"
  escrowId?: number;
}

/** Response from the ComputeResources query. */
export interface ComputeResourcesResponse {
  resources: ComputeResource[];
}

/** Response from the ComputeResource query. */
export interface ComputeResourceResponse {
  resource: ComputeResource;
}

/** Response from the ComputeLeases query. */
export interface ComputeLeasesResponse {
  leases: ComputeLease[];
}

/** Real-time GPU health/performance metrics. */
export interface GPUMetrics {
  utilizationGpu: number;  // 0-100%
  utilizationMem: number;  // 0-100%
  temperature: number;     // Celsius
  powerDrawWatts: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  isHealthy: boolean;
  updatedAt: number;
}

/** A GPU compute job submitted by a consumer. */
export interface ComputeJob {
  id: number;
  resourceId: number;
  leaseId: number;
  submitter: string;
  provider: string;
  name: string;
  jobType: string;          // "ai-training", "inference", "rendering", "general"
  executionType: string;    // "docker", "script"
  dockerImage?: string;
  scriptContent?: string;
  inputDataUri?: string;
  outputDataUri?: string;
  gpuType: string;
  gpuCount: number;
  status: string;           // "pending", "running", "completed", "failed", "cancelled"
  result?: string;
  resultHash?: string;      // SHA256 hash of result for proof of computation
  errorMessage?: string;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  params?: string;
}

/** Input for submitting a compute job. */
export interface ComputeJobInput {
  name: string;
  jobType?: string;
  executionType?: string;
  dockerImage?: string;
  scriptContent?: string;
  inputDataUri?: string;
  outputDataUri?: string;
  params?: string;
}

/** Per-period usage record for billing. */
export interface UsageRecord {
  leaseId: number;
  resourceId: number;
  periodStart: number;
  periodEnd: number;
  avgGpuUtil: number;
  avgMemUtil: number;
  avgPowerDraw: number;
  periodCostUclaw: string;
}

/** Aggregate provider performance stats. */
export interface ProviderStats {
  address: string;
  totalResources: number;
  activeLeases: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalRevenue: string;
  avgRating: number;        // 0-500
  uptimeBlocks: number;
  lastHeartbeat: number;
}

/** Response from the ComputeJob query (single job). */
export interface ComputeJobResponse {
  job: ComputeJob;
}

/** Response from the ComputeJobs query. */
export interface ComputeJobsResponse {
  jobs: ComputeJob[];
}

/** Response from the ProviderStats query. */
export interface ProviderStatsResponse {
  stats: ProviderStats;
}

/** A registered GPU compute provider. */
export interface GPUProvider {
  address: string;
  name: string;
  gpuModel: string;
  vramGb: number;
  gpuCount: number;
  cudaCores: number;
  pricePerHourUclaw: string;
  active: boolean;
  utilization: number;
  activeLeases: number;
  totalJobsCompleted: number;
  uptimeSeconds: number;
  registeredAt: string;
}

/** Response from the GPU providers listing. */
export interface GPUProvidersResponse {
  providers: GPUProvider[];
}

/** Response from a single GPU provider query. */
export interface GPUProviderResponse {
  provider: GPUProvider;
}

// ---------------------------------------------------------------------------
// Agent Negotiation types
// ---------------------------------------------------------------------------

/** A single negotiation round (proposal or counter-proposal). */
export interface NegotiationRound {
  round: number;
  proposer: string;
  budget: string;
  deadline: number;
  message?: string;
  height: number;
}

/** On-chain negotiation between two agents. */
export interface Negotiation {
  id: number;
  initiator: string;
  counterparty: string;
  description: string;
  requirements: string;
  skillId?: number;
  proposedBudget: string;
  proposedDeadline: number;
  status: string;
  round: number;
  maxRounds: number;
  lastProposer: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  history: NegotiationRound[];
}

/** Response from the Negotiation query. */
export interface NegotiationResponse {
  negotiation: Negotiation;
  found: boolean;
}

/** Response from the Negotiations query. */
export interface NegotiationsResponse {
  negotiations: Negotiation[];
}

/** Parameters for proposing a negotiation. */
export interface MsgProposeNegotiationParams {
  /** Bech32 address of the counterparty agent. */
  counterparty: string;
  /** Task description. */
  description: string;
  /** Structured requirements (JSON). */
  requirements?: string;
  /** Optional marketplace skill ID. */
  skillId?: number;
  /** Proposed budget (e.g. "1000uclaw"). */
  budget: string;
  /** Proposed deadline in blocks. */
  deadlineBlocks: number;
  /** Max negotiation rounds before auto-expire (default 5). */
  maxRounds?: number;
}

// ---------------------------------------------------------------------------
// Model Registry module – types
// ---------------------------------------------------------------------------

/** Input for registering a new AI model on-chain. */
export interface ModelInput {
  name: string;
  description: string;
  framework: string;
  architecture: string;
  parameterCount: string;
  license: string;
  tags?: string[];
  storageType: string;
  storageUri: string;
  checksumSha256: string;
  sizeBytes: number;
  accessType: string;
  pricePerQueryUclaw?: string;
  priceOneTimeUclaw?: string;
}

/** On-chain model record. */
export interface ModelRecord {
  id: number;
  owner: string;
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
  sizeBytes: number;
  accessType: string;
  pricePerQueryUclaw: string;
  priceOneTimeUclaw: string;
  active: boolean;
  currentVersion: number;
  totalDownloads: number;
  totalRevenue: string;
  rating: number;
  ratingCount: number;
  createdAt: number;
  updatedAt: number;
}

/** On-chain model version record. */
export interface ModelVersion {
  id: number;
  modelId: number;
  version: number;
  storageUri: string;
  checksumSha256: string;
  sizeBytes: number;
  changelog: string;
  createdAt: number;
}

/** Response from the Models query. */
export interface ModelsResponse {
  models: ModelRecord[];
}

/** Response from the Model query. */
export interface ModelResponse {
  model: ModelRecord;
}

/** Response from the ModelVersions query. */
export interface ModelVersionsResponse {
  versions: ModelVersion[];
}

// ---------------------------------------------------------------------------
// Inference Marketplace types
// ---------------------------------------------------------------------------

/** An inference job submitted to a model provider. */
export interface InferenceJob {
  jobId: number;
  modelId: number;
  modelVersion: number;
  requester: string;
  provider: string;
  input: string;
  output: string;
  status: string;       // "pending", "running", "completed", "failed", "timeout"
  maxTokens: number;
  temperature: string;
  payment: string;      // uclaw amount escrowed
  gasUsed: number;
  createdAt: number;
  startedAt: number;
  completedAt: number;
  timeoutBlock: number;
  errorMsg: string;
}

/** An inference provider that can serve model inference requests. */
export interface InferenceProvider {
  address: string;
  modelIds: number[];
  maxConcurrent: number;
  activeJobs: number;
  totalJobs: number;
  totalEarnings: string;
  avgLatencyMs: number;
  endpoint: string;
  isOnline: boolean;
  lastHeartbeat: number;
}

/** Inference pricing configuration for a model. */
export interface InferencePricing {
  modelId: number;
  pricePerToken: string;
  pricePerQuery: string;
  minPayment: string;
  maxTokens: number;
}

/** Response from the InferenceJob query. */
export interface InferenceJobResponse {
  job: InferenceJob;
}

/** Response from the InferenceJobs query. */
export interface InferenceJobsResponse {
  jobs: InferenceJob[];
}

/** Response from the InferenceProvider query. */
export interface InferenceProviderResponse {
  provider: InferenceProvider;
}

/** Response from the InferenceProviders query. */
export interface InferenceProvidersResponse {
  providers: InferenceProvider[];
}

/** Response from the InferencePricing query. */
export interface InferencePricingResponse {
  pricing: InferencePricing;
}

/** Parameters for submitting an inference job. */
export interface MsgSubmitInferenceJobParams {
  modelId: number;
  input: string;
  maxTokens?: number;
  temperature?: string;
  payment: string;
  modelVersion?: number;
}

/** Parameters for completing an inference job (provider-side). */
export interface MsgCompleteInferenceJobParams {
  jobId: number;
  output: string;
  tokensUsed: number;
}

/** Parameters for registering as an inference provider. */
export interface MsgRegisterInferenceProviderParams {
  modelIds: number[];
  maxConcurrent?: number;
  endpoint: string;
}

/** Parameters for setting inference pricing on a model. */
export interface MsgSetInferencePricingParams {
  modelId: number;
  pricePerToken: string;
  pricePerQuery: string;
  minPayment: string;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Staking types
// ---------------------------------------------------------------------------

/** Validator info from the staking module. */
export interface ValidatorInfo {
  operatorAddress: string;
  moniker: string;
  tokens: string;
  commission: string;
  status: string;
  jailed: boolean;
}

/** Response from the Validators query. */
export interface ValidatorsResponse {
  validators: ValidatorInfo[];
}

/** Delegation info for a delegator. */
export interface DelegationInfo {
  validatorAddress: string;
  shares: string;
  balance: { denom: string; amount: string };
}

/** Response from the Delegations query. */
export interface DelegationsResponse {
  delegations: DelegationInfo[];
}

/** Reward info from the distribution module. */
export interface RewardInfo {
  validatorAddress: string;
  reward: { denom: string; amount: string }[];
}

/** Response from the StakingRewards query. */
export interface StakingRewardsResponse {
  rewards: RewardInfo[];
  total: { denom: string; amount: string }[];
}

/** Parameters for MsgDelegate (staking module). */
export interface MsgStakingDelegateParams {
  validatorAddress: string;
  amount: string;
  denom?: string;
}

/** Parameters for MsgUndelegate (staking module). */
export interface MsgStakingUndelegateParams {
  validatorAddress: string;
  amount: string;
  denom?: string;
}

/** Parameters for MsgWithdrawDelegatorReward (distribution module). */
export interface MsgWithdrawRewardsParams {
  validatorAddress: string;
}

// ---------------------------------------------------------------------------
// IBC types
// ---------------------------------------------------------------------------

/** IBC channel info. */
export interface IBCChannelInfo {
  channelId: string;
  portId: string;
  state: string;
  counterpartyChannelId: string;
  counterpartyPortId: string;
  connectionHops: string[];
}

/** Response from the IBC Channels query. */
export interface IBCChannelsResponse {
  channels: IBCChannelInfo[];
}

/** IBC connection info. */
export interface IBCConnectionInfo {
  id: string;
  clientId: string;
  state: string;
  counterpartyConnectionId: string;
  counterpartyClientId: string;
}

/** Response from the IBC Connections query. */
export interface IBCConnectionsResponse {
  connections: IBCConnectionInfo[];
}

/** IBC client info. */
export interface IBCClientInfo {
  clientId: string;
  clientType: string;
  chainId: string;
}

/** Response from the IBC Clients query. */
export interface IBCClientsResponse {
  clients: IBCClientInfo[];
}

/** IBC denom trace. */
export interface IBCDenomTrace {
  path: string;
  baseDenom: string;
}

/** Response from the IBC DenomTraces query. */
export interface IBCDenomTracesResponse {
  denomTraces: IBCDenomTrace[];
}

/** IBC remote agent info. */
export interface IBCRemoteAgent {
  agentAddress: string;
  name: string;
  sourceChain: string;
  channelId: string;
  capabilities: string[];
}

/** Response from the IBC RemoteAgents query. */
export interface IBCRemoteAgentsResponse {
  agents: IBCRemoteAgent[];
}

/** Parameters for countering a negotiation. */
export interface MsgCounterNegotiationParams {
  /** Negotiation ID to counter. */
  negotiationId: number;
  /** New proposed budget. */
  newBudget: string;
  /** New proposed deadline in blocks. */
  newDeadline: number;
  /** Optional message explaining the counter. */
  message?: string;
}

/** Parameters for accepting a negotiation. */
export interface MsgAcceptNegotiationParams {
  /** Negotiation ID to accept. */
  negotiationId: number;
}

/** Parameters for rejecting a negotiation. */
export interface MsgRejectNegotiationParams {
  /** Negotiation ID to reject. */
  negotiationId: number;
}

// ---------------------------------------------------------------------------
// Task checkpoint types
// ---------------------------------------------------------------------------

/** Parameters for checkpointing task progress (crash recovery). */
export interface MsgCheckpointTaskParams {
  /** Task ID to checkpoint. */
  taskId: number;
  /** JSON checkpoint data. */
  checkpointData: string;
  /** Percent complete (0-100). */
  percentComplete: number;
}

/** Response from querying a task checkpoint. */
export interface TaskCheckpointResponse {
  /** The raw JSON checkpoint blob stored on-chain. */
  checkpoint: string;
  /** Whether a checkpoint exists for this task. */
  found: boolean;
}

// ---------------------------------------------------------------------------
// Reward leaderboard types
// ---------------------------------------------------------------------------

/** An entry in the agent reward leaderboard. */
export interface RewardLeaderboardEntry {
  /** Agent address. */
  address: string;
  /** Agent name. */
  name: string;
  /** Cumulative rewards in uclaw. */
  cumulativeRewards: string;
}

/** Response from the reward leaderboard query. */
export interface RewardLeaderboardResponse {
  /** Sorted list of agents by cumulative rewards (descending). */
  entries: RewardLeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// CosmWasm smart contract types
// ---------------------------------------------------------------------------

/** Access permission configuration for contract instantiation. */
export interface WasmAccessConfig {
  permission: "Nobody" | "OnlyAddress" | "Everybody" | "AnyOfAddresses";
  addresses?: string[];
}

/** Result from uploading a WASM contract binary. */
export interface WasmUploadResult {
  codeId: number;
  transactionHash: string;
  height: number;
  gasUsed: number;
}

/** Options for contract instantiation. */
export interface WasmInstantiateOptions {
  admin?: string;
  funds?: WasmCoin[];
}

/** Result from instantiating a contract. */
export interface WasmInstantiateResult {
  contractAddress: string;
  transactionHash: string;
  height: number;
  gasUsed: number;
}

/** Result from executing a contract message. */
export interface WasmExecuteResult {
  transactionHash: string;
  height: number;
  gasUsed: number;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

/** Result from migrating a contract to a new code version. */
export interface WasmMigrateResult {
  transactionHash: string;
  height: number;
  gasUsed: number;
}

/** Information about an uploaded contract code. */
export interface WasmCodeInfo {
  codeId: number;
  creator: string;
  dataHash: string;
  instantiatePermission: WasmAccessConfig;
}

/** Information about a contract instance. */
export interface WasmContractInfo {
  address: string;
  codeId: number;
  creator: string;
  admin: string;
  label: string;
  created?: { blockHeight: number; txIndex: number };
}

/** A single entry in a contract's history. */
export interface WasmContractHistoryEntry {
  operation: "Init" | "Migrate" | "Genesis";
  codeId: number;
  msg: Record<string, unknown>;
}

/** A coin amount used in contract interactions. */
export interface WasmCoin {
  denom: string;
  amount: string;
}

// ---------------------------------------------------------------------------
// DEX / AMM types (Astroport-style CosmWasm DEX)
// ---------------------------------------------------------------------------

/** Identifies a token — either native or CW20. */
export type DexAssetInfo =
  | { native_token: { denom: string } }
  | { token: { contract_addr: string } };

/** An asset with its info and amount. */
export interface DexAsset {
  info: DexAssetInfo;
  amount: string;
}

/** A trading pair returned by the factory. */
export interface DexPairInfo {
  asset_infos: [DexAssetInfo, DexAssetInfo];
  contract_addr: string;
  liquidity_token: string;
  pair_type?: Record<string, unknown>;
}

/** Pool state (balances + total LP share). */
export interface DexPoolResponse {
  assets: [DexAsset, DexAsset];
  total_share: string;
}

/** Result of a forward swap simulation. */
export interface DexSimulationResponse {
  return_amount: string;
  spread_amount: string;
  commission_amount: string;
}

/** Result of a reverse swap simulation. */
export interface DexReverseSimulationResponse {
  offer_amount: string;
  spread_amount: string;
  commission_amount: string;
}

// ---------------------------------------------------------------------------
// DEX / AMM transaction types
// ---------------------------------------------------------------------------

/** Pool pair type for creating pools. */
export type PairType =
  | { xyk: Record<string, never> }
  | { stable: Record<string, never> }
  | { concentrated: Record<string, never> };

/** Identifies a token for pool creation — same as DexAssetInfo but named for clarity. */
export type AssetInfo = DexAssetInfo;

/** Parameters for a DEX swap. */
export interface SwapParams {
  /** Sender address that signs the transaction. */
  senderAddress: string;
  /** Pair contract address. */
  pairAddress: string;
  /** Denom (native) or CW20 contract address of the offered token. */
  offerAsset: string;
  /** Amount to swap (as string, integer base units). */
  amount: string;
  /** Maximum spread tolerance (default "0.005" = 0.5%). */
  maxSpread?: string;
}

/** Parameters for providing liquidity. */
export interface LiquidityParams {
  /** Sender address that signs the transaction. */
  senderAddress: string;
  /** Pair contract address. */
  pairAddress: string;
  /** Assets to deposit into the pool. */
  assets: Array<{ denom: string; amount: string }>;
  /** Slippage tolerance (default "0.01" = 1%). */
  slippageTolerance?: string;
}

/** Pool information returned by queryPoolLiquidity. */
export interface PoolInfo {
  /** The two assets in the pool with their reserves. */
  assets: [DexAsset, DexAsset];
  /** Total LP token supply. */
  totalShare: string;
}

// ---------------------------------------------------------------------------
// WebSocket subscription types
// ---------------------------------------------------------------------------

/** Callback cleanup handle — call to unsubscribe. */
export type Unsubscribe = () => void;

/** Block information delivered by subscribeNewBlock. */
export interface BlockInfo {
  /** Block height. */
  height: number;
  /** Block hash (hex). */
  hash: string;
  /** ISO-8601 timestamp of the block. */
  time: string;
  /** Number of transactions in the block. */
  numTxs: number;
  /** Bech32 address of the block proposer. */
  proposer: string;
}

/** Transaction event delivered by subscribeTx. */
export interface WsTxEvent {
  /** Transaction hash (hex). */
  hash: string;
  /** Block height the transaction was included in. */
  height: number;
  /** Result code (0 = success). */
  code: number;
  /** Sender address (if determinable from events). */
  sender: string;
  /** Recipient address (if determinable from events). */
  recipient: string;
  /** Events emitted by the transaction. */
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

/** A generic chain event delivered by subscribeEvent. */
export interface ChainEvent {
  /** Event type (e.g. "transfer", "agent_registered"). */
  type: string;
  /** Key-value attributes from the event. */
  attributes: Record<string, string>;
  /** Block height where the event occurred. */
  height: number;
  /** ISO-8601 timestamp (if available). */
  time?: string;
}

// ---------------------------------------------------------------------------
// Portfolio analytics types
// ---------------------------------------------------------------------------

/** Aggregated portfolio summary for an address. */
export interface PortfolioSummary {
  /** Address this summary is for. */
  address: string;
  /** Available (liquid) balance in uclaw. */
  available: string;
  /** Total staked (delegated) in uclaw. */
  staked: string;
  /** Pending staking rewards in uclaw. */
  rewards: string;
  /** Amount locked in active escrows as buyer. */
  escrowLocked: string;
  /** Sum of budgets for active tasks delegated by this address. */
  taskBudgets: string;
  /** Total portfolio value in uclaw (available + staked + rewards + escrowLocked + taskBudgets). */
  totalValue: string;
}

/** Breakdown of agent earnings. */
export interface AgentEarnings {
  /** Address of the agent. */
  address: string;
  /** Earnings from completed tasks. */
  taskRewards: string;
  /** Earnings from skill sales on the marketplace. */
  skillSales: string;
  /** Earnings from staking rewards. */
  stakingRewards: string;
  /** Earnings from GPU compute provider fees. */
  computeFees: string;
  /** Total of all earnings. */
  total: string;
}

/** A single entry in a leaderboard. */
export interface LeaderboardEntry {
  /** Rank (1-based). */
  rank: number;
  /** Agent address. */
  address: string;
  /** Agent name (if registered). */
  name: string;
  /** Score value (interpretation depends on leaderboard type). */
  score: string;
  /** Metric type ("reputation" | "earnings" | "tasks"). */
  metric: string;
}

// ---------------------------------------------------------------------------
// Chain health & diagnostics types
// ---------------------------------------------------------------------------

/** Node identity and version information. */
export interface NodeInfo {
  /** Moniker (human-readable name) of the node. */
  moniker: string;
  /** Network / chain ID the node belongs to. */
  network: string;
  /** Software version string. */
  version: string;
}

/** Sync status of the node. */
export interface SyncInfo {
  /** Latest block height known to the node. */
  latestBlockHeight: string;
  /** ISO-8601 timestamp of the latest block. */
  latestBlockTime: string;
  /** Whether the node is still catching up with the network. */
  catchingUp: boolean;
}

/** Aggregated chain health status. */
export interface ChainHealthStatus {
  /** Node identity and version. */
  nodeInfo: NodeInfo;
  /** Sync / block progress. */
  syncInfo: SyncInfo;
  /** Number of bonded validators. */
  validatorCount: number;
}

/** Information about a connected peer. */
export interface PeerInfo {
  /** Node ID (hex-encoded ed25519 pubkey hash). */
  nodeId: string;
  /** Remote IP address of the peer. */
  remoteIp: string;
  /** Whether this is an outbound connection. */
  isOutbound: boolean;
}

/** Network topology snapshot. */
export interface NetworkTopology {
  /** This node's peer ID. */
  peerId: string;
  /** Address the node is listening on. */
  listenAddr: string;
  /** Number of connected peers. */
  nPeers: number;
  /** Details of each connected peer. */
  peers: PeerInfo[];
}

/** Genesis metadata for the chain. */
export interface GenesisInfo {
  /** Chain identifier. */
  chainId: string;
  /** ISO-8601 genesis time. */
  genesisTime: string;
  /** Initial block height (usually "1"). */
  initialHeight: string;
  /** List of module names present in the genesis app_state. */
  moduleList: string[];
}

/** Health status of a single endpoint. */
export interface EndpointHealth {
  /** URL that was probed. */
  url: string;
  /** Whether the endpoint responded successfully. */
  ok: boolean;
  /** Round-trip latency in milliseconds (-1 if unreachable). */
  latencyMs: number;
  /** HTTP status code, or 0 if the request failed entirely. */
  statusCode: number;
}

/** Aggregated health report for the RPC and REST endpoints. */
export interface ServiceHealthReport {
  /** Health of the Tendermint RPC endpoint. */
  rpc: EndpointHealth;
  /** Health of the Cosmos REST / LCD endpoint. */
  rest: EndpointHealth;
  /** ISO-8601 timestamp when the check was performed. */
  checkedAt: string;
}
