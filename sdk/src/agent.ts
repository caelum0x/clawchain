/**
 * ClawChainAgent – high-level agent abstraction.
 *
 * Combines the low-level ClawChainClient with the ProofGenerator to provide
 * a turnkey interface for OpenClaw AI agents:
 *
 *   1. Register on-chain
 *   2. Shield / unshield / private-transfer tokens
 *   3. Query balance and registration status
 *
 * Local state (commitments, blindings, secrets) is held in memory.
 */

import { randomBytes } from "node:crypto";
import { ClawChainClient } from "./client.js";
import { ProofGenerator } from "./proof.js";
import type {
  ClawChainAgentOptions,
  LocalCommitment,
  TxResult,
  MessagesResponse,
  ConversationResponse,
  MsgSubmitProposalParams,
  MsgVoteParams,
  MsgDepositParams,
  MsgListSkillParams,
  MsgDelistSkillParams,
  MsgPurchaseSkillParams,
  MsgCreateEscrowParams,
  MsgCompleteEscrowParams,
  MsgDisputeEscrowParams,
  MsgUpdateSkillParams,
  IBCShieldTransferParams,
  ProposalsResponse,
  ProposalInfo,
  SkillInfo,
  SkillsResponse,
  ReputationResponse,
  RatingsResponse,
  EndorsementsResponse,
  TopAgentsResponse,
  EscrowResponse,
  EscrowsResponse,
  SkillAnalyticsResponse,
  AgentStatsResponse,
  AgentActivityResponse,
  RecentActivityResponse,
  AgentParamsResponse,
  MsgDelegateTaskParams,
  MsgAcceptTaskParams,
  MsgCompleteTaskParams,
  TaskInfoResponse,
  TasksResponse,
} from "./types.js";
import { DEFAULT_DENOM } from "./constants.js";

/**
 * Compute a secp256k1 ECDH shared secret from a private key and a peer compressed pubkey hex.
 * Used by the agent messaging encryption path.
 */
export async function computeSharedSecretSecp256k1(
  privateKey: Uint8Array,
  peerCompressedPubkeyHex: string,
): Promise<Uint8Array> {
  const { createECDH } = await import("node:crypto");
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(privateKey));
  return new Uint8Array(ecdh.computeSecret(Buffer.from(peerCompressedPubkeyHex, "hex")));
}

/** Derive the compressed secp256k1 public key hex from a mnemonic. */
async function deriveCompressedPubkey(mnemonic: string): Promise<string> {
  const { Secp256k1, Slip10, Slip10Curve, stringToPath, Bip39 } = await import("@cosmjs/crypto");
  const seed = await Bip39.mnemonicToSeed(mnemonic as never);
  const hdPath = stringToPath("m/44'/118'/0'/0/0");
  const { privkey } = Slip10.derivePath(Slip10Curve.Secp256k1, seed, hdPath);
  const { pubkey } = await Secp256k1.makeKeypair(privkey);
  const compressed = Secp256k1.compressPubkey(pubkey);
  return Buffer.from(compressed).toString("hex");
}

export class ClawChainAgent {
  /** Human-readable agent name. */
  readonly name: string;

  private readonly client: ClawChainClient;
  private readonly proof: ProofGenerator;
  private readonly endpoint: string;
  private readonly mnemonic: string;
  private readonly supportedTools: string[];
  private readonly pricingHint: string;
  private readonly version: string;

  /** In-memory store of this agent's shielded commitments. */
  private commitments: LocalCommitment[] = [];

  /** Whether `initialize()` has been called. */
  private initialized = false;

  constructor(options: ClawChainAgentOptions) {
    this.name = options.name;
    this.endpoint = options.endpoint ?? "";
    this.mnemonic = options.mnemonic;
    this.supportedTools = options.supportedTools ?? [];
    this.pricingHint = options.pricingHint ?? "";
    this.version = options.version ?? "";

    this.client = new ClawChainClient({
      rpcUrl: options.rpcUrl,
      grpcUrl: options.grpcUrl,
      mnemonic: options.mnemonic,
      prefix: options.prefix,
    });

    this.proof = new ProofGenerator({
      binaryPath: options.proofBinaryPath,
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Connect to the chain and (optionally) run the trusted setup for proofs.
   *
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    await this.client.connect();
    this.initialized = true;
  }

  /** Disconnect from the chain and clear local state. */
  async shutdown(): Promise<void> {
    await this.client.disconnect();
    this.commitments = [];
    this.initialized = false;
  }

  /** Return the agent's on-chain bech32 address. */
  getAddress(): string {
    return this.client.getAddress();
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  /**
   * Register this agent on-chain with the agent module.
   *
   * Derives the actual secp256k1 compressed public key (33 bytes hex)
   * from the mnemonic so other agents can use it for ECIES encryption.
   */
  async register(params?: {
    supportedTools?: string[];
    pricingHint?: string;
    version?: string;
  }): Promise<TxResult> {
    this.ensureInitialized();

    let pubkey: string;
    try {
      pubkey = await deriveCompressedPubkey(this.mnemonic);
    } catch {
      // Fallback to address if key derivation fails
      pubkey = this.client.getAddress();
    }

    const result = await this.client.registerAgent({
      pubkey,
      endpoint: this.endpoint,
      name: this.name,
      supportedTools: params?.supportedTools ?? this.supportedTools,
      pricingHint: params?.pricingHint ?? this.pricingHint,
      version: params?.version ?? this.version,
    });

    return result;
  }

  /**
   * Check whether this agent is already registered on-chain.
   */
  async isRegistered(): Promise<boolean> {
    this.ensureInitialized();
    try {
      const info = await this.client.getAgent(this.client.getAddress());
      return info.registered;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Balance
  // -----------------------------------------------------------------------

  /**
   * Query the agent's on-chain (transparent) balance.
   *
   * @param denom - Token denomination (default: "uclaw").
   * @returns Balance as a string.
   */
  async checkBalance(denom: string = DEFAULT_DENOM): Promise<string> {
    this.ensureInitialized();
    return this.client.getBalance(this.client.getAddress(), denom);
  }

  /**
   * Return the total shielded balance based on local unspent commitments.
   */
  getShieldedBalance(): bigint {
    return this.commitments
      .filter((c) => !c.spent)
      .reduce((sum, c) => sum + BigInt(c.amount), 0n);
  }

  // -----------------------------------------------------------------------
  // Shield
  // -----------------------------------------------------------------------

  /**
   * Shield tokens into the private pool.
   *
   * Generates a random blinding factor, builds the commitment off-chain,
   * stores it locally, then broadcasts MsgShield.
   *
   * @param amount - Amount to shield (in base denomination units).
   * @param denom  - Token denomination (default: "uclaw").
   */
  async shieldTokens(amount: number | bigint, denom: string = DEFAULT_DENOM): Promise<TxResult> {
    this.ensureInitialized();

    const amountStr = amount.toString();
    const blinding = randomBytes(16).toString("hex");

    // Generate commitment and secret off-chain.
    const shieldData = await this.proof.generateShieldData(amountStr, blinding);

    // Broadcast the shield transaction.
    const result = await this.client.shield({
      amount,
      coins: denom,
    });

    if (result.code === 0) {
      // Persist the commitment locally so we can spend it later.
      this.commitments.push({
        commitment: shieldData.commitment,
        amount: amountStr,
        blinding: shieldData.blinding,
        secret: shieldData.secret,
        spent: false,
      });
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Private transfer
  // -----------------------------------------------------------------------

  /**
   * Perform a private transfer to another agent.
   *
   * Selects two unspent commitments from local state (or pads with a
   * zero-value commitment), generates a ZK proof, and broadcasts
   * MsgPrivateTransfer.
   *
   * @param recipientAgent - The recipient ClawChainAgent instance (used to
   *                         derive a new commitment for the recipient).
   * @param amount         - Amount to transfer.
   */
  async privateTransfer(recipientAgent: ClawChainAgent, amount: number | bigint): Promise<TxResult> {
    this.ensureInitialized();

    const transferAmount = BigInt(amount);

    // Select unspent commitments that cover the transfer amount.
    const selected = this.selectCommitments(transferAmount);
    if (!selected) {
      throw new Error(
        `ClawChainAgent: insufficient shielded balance for transfer of ${transferAmount}`,
      );
    }

    const [input0, input1] = selected;
    const totalInput = BigInt(input0.amount) + BigInt(input1.amount);
    const change = totalInput - transferAmount;

    // Generate new commitments for recipient and change.
    const recipientBlinding = randomBytes(16).toString("hex");
    const changeBlinding = randomBytes(16).toString("hex");

    const recipientCommitment = await this.proof.generateCommitment(
      transferAmount.toString(),
      recipientBlinding,
    );
    const changeCommitment = await this.proof.generateCommitment(
      change.toString(),
      changeBlinding,
    );

    // Fetch the current Merkle root.
    const root = await this.client.getMerkleRoot();

    // Generate the transfer proof.
    const proofResult = await this.proof.generateTransferProof({
      oldCommitments: [input0.commitment, input1.commitment],
      oldBlindings: [input0.blinding, input1.blinding],
      oldSecrets: [input0.secret, input1.secret],
      oldAmounts: [input0.amount, input1.amount],
      newAmounts: [transferAmount.toString(), change.toString()],
      newBlindings: [recipientBlinding, changeBlinding],
      merklePaths: [[], []], // Merkle paths would be fetched from chain in production
      merklePathIndices: [[], []],
      root,
    });

    // Generate nullifiers for the old commitments.
    const nullifier0 = await this.proof.generateNullifier(input0.secret, input0.commitment);
    const nullifier1 = await this.proof.generateNullifier(input1.secret, input1.commitment);

    // Broadcast the private transfer.
    const result = await this.client.privateTransfer({
      oldCommitments: `${input0.commitment},${input1.commitment}`,
      newCommitments: `${recipientCommitment.commitment},${changeCommitment.commitment}`,
      nullifiers: `${nullifier0.nullifier},${nullifier1.nullifier}`,
      root,
      proof: proofResult.proof,
    });

    if (result.code === 0) {
      // Mark old commitments as spent.
      input0.spent = true;
      input1.spent = true;

      // Store the change commitment locally.
      if (change > 0n) {
        this.commitments.push({
          commitment: changeCommitment.commitment,
          amount: change.toString(),
          blinding: changeBlinding,
          secret: input0.secret, // Reuse secret for change output
          spent: false,
        });
      }

      // Add the recipient's commitment to their local state.
      recipientAgent.addCommitment({
        commitment: recipientCommitment.commitment,
        amount: transferAmount.toString(),
        blinding: recipientBlinding,
        secret: recipientBlinding, // Recipient uses their blinding as secret
        spent: false,
      });
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Unshield
  // -----------------------------------------------------------------------

  /**
   * Unshield tokens – withdraw from the shielded pool back to a transparent
   * address.
   *
   * @param amount    - Amount to unshield.
   * @param recipient - Bech32 address to receive the tokens.  Defaults to
   *                    this agent's own address.
   */
  async unshieldTokens(
    amount: number | bigint,
    recipient?: string,
  ): Promise<TxResult> {
    this.ensureInitialized();

    const unshieldAmount = BigInt(amount);
    const recipientAddr = recipient ?? this.client.getAddress();

    // Find a commitment with sufficient value.
    const commitment = this.commitments.find(
      (c) => !c.spent && BigInt(c.amount) >= unshieldAmount,
    );
    if (!commitment) {
      throw new Error(
        `ClawChainAgent: no unspent commitment with sufficient balance for unshield of ${unshieldAmount}`,
      );
    }

    // Generate the nullifier.
    const nullifierData = await this.proof.generateNullifier(
      commitment.secret,
      commitment.commitment,
    );

    // Fetch Merkle root.
    const root = await this.client.getMerkleRoot();

    // Generate the unshield proof.
    const proofResult = await this.proof.generateUnshieldProof({
      commitment: commitment.commitment,
      amount: unshieldAmount.toString(),
      blinding: commitment.blinding,
      secret: commitment.secret,
      merklePath: [],  // Would be fetched from chain in production
      merklePathIndices: [],
      root,
    });

    // Broadcast the unshield transaction.
    const result = await this.client.unshield({
      commitment: commitment.commitment,
      nullifier: nullifierData.nullifier,
      proof: proofResult.proof,
      amount: unshieldAmount,
      recipient: recipientAddr,
      root,
    });

    if (result.code === 0) {
      commitment.spent = true;

      // If we only unshielded part of the commitment we would need to create
      // a change commitment.  For simplicity, this implementation assumes the
      // full commitment value is unshielded.  A production SDK would handle
      // partial unshields with a change output.
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Coordination
  // -----------------------------------------------------------------------

  /**
   * Submit a multi-agent coordination intent.
   */
  async submitIntent(
    intentType: string,
    description: string,
    payload: string,
    minResponses: number = 1,
  ): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.submitIntent({
      intentType,
      description,
      payload,
      minResponses,
    });
  }

  /**
   * Respond to a coordination intent from another agent.
   */
  async respondToIntent(
    intentId: number,
    accepted: boolean,
    payload: string = "",
  ): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.respondToIntent({
      intentId,
      accepted,
      payload,
    });
  }

  /**
   * Finalize or cancel a coordination intent.
   */
  async finalizeIntent(
    intentId: number,
    cancel: boolean = false,
  ): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.finalizeIntent({
      intentId,
      cancel,
    });
  }

  // -----------------------------------------------------------------------
  // Token transfers
  // -----------------------------------------------------------------------

  /**
   * Send tokens to another address.
   *
   * @param recipient - Bech32 address of the recipient.
   * @param amount    - Amount to send (as string, e.g. "1000000").
   * @param denom     - Token denomination (default: "uclaw").
   */
  async sendTokens(
    recipient: string,
    amount: string,
    denom: string = DEFAULT_DENOM,
  ): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.sendTokens(recipient, amount, denom);
  }

  // -----------------------------------------------------------------------
  // On-chain messaging
  // -----------------------------------------------------------------------

  /**
   * Send an encrypted message on-chain via the messaging module.
   *
   * @param recipient  - Bech32 address of the recipient.
   * @param ciphertext - Base64-encoded ciphertext.
   * @param nonce      - Nonce string for the encryption.
   */
  async sendOnChainMessage(
    recipient: string,
    ciphertext: string,
    nonce: string,
  ): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.sendOnChainMessage({ recipient, ciphertext, nonce });
  }

  /**
   * Acknowledge receipt of an on-chain message.
   */
  async ackMessage(messageId: number): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.ackMessage({ messageId });
  }

  /**
   * Query on-chain messages for a given address.
   */
  async getOnChainMessages(address?: string): Promise<MessagesResponse> {
    this.ensureInitialized();
    return this.client.getMessages(address ?? this.client.getAddress());
  }

  /**
   * Query on-chain conversation between this agent and another address.
   */
  async getOnChainConversation(peerAddress: string): Promise<ConversationResponse> {
    this.ensureInitialized();
    return this.client.getConversation(this.client.getAddress(), peerAddress);
  }

  // -----------------------------------------------------------------------
  // Governance
  // -----------------------------------------------------------------------

  /**
   * Submit a governance proposal.
   */
  async submitProposal(params: MsgSubmitProposalParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.submitProposal(params);
  }

  /**
   * Vote on a governance proposal.
   */
  async vote(params: MsgVoteParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.vote(params);
  }

  /**
   * Deposit tokens on a governance proposal.
   */
  async deposit(params: MsgDepositParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.deposit(params);
  }

  /**
   * Query governance proposals.
   */
  async getProposals(status?: string): Promise<ProposalsResponse> {
    this.ensureInitialized();
    return this.client.getProposals(status);
  }

  /**
   * Query a specific governance proposal by ID.
   */
  async getProposal(proposalId: number): Promise<ProposalInfo> {
    this.ensureInitialized();
    return this.client.getProposal(proposalId);
  }

  // -----------------------------------------------------------------------
  // Marketplace
  // -----------------------------------------------------------------------

  /**
   * List a skill on the marketplace.
   */
  async listSkill(params: MsgListSkillParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.listSkill(params);
  }

  /**
   * Delist a skill from the marketplace.
   */
  async delistSkill(params: MsgDelistSkillParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.delistSkill(params);
  }

  /**
   * Purchase a skill from the marketplace.
   */
  async purchaseSkill(params: MsgPurchaseSkillParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.purchaseSkill(params);
  }

  /**
   * Query all marketplace skills.
   */
  async getSkills(): Promise<SkillsResponse> {
    this.ensureInitialized();
    return this.client.getSkills();
  }

  /**
   * Query a specific marketplace skill by ID.
   */
  async getSkill(skillId: number): Promise<SkillInfo> {
    this.ensureInitialized();
    return this.client.getSkill(skillId);
  }

  /**
   * Update a listed skill (auto-increments version).
   */
  async updateSkill(params: MsgUpdateSkillParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.updateSkill(params);
  }

  /**
   * Search skills by name/description/tags.
   */
  async searchSkills(query: string): Promise<SkillsResponse> {
    this.ensureInitialized();
    return this.client.searchSkills(query);
  }

  /**
   * Query analytics for a skill.
   */
  async getSkillAnalytics(skillId: number): Promise<SkillAnalyticsResponse> {
    this.ensureInitialized();
    return this.client.getSkillAnalytics(skillId);
  }

  // -----------------------------------------------------------------------
  // Reputation
  // -----------------------------------------------------------------------

  /**
   * Rate an agent (requires prior purchase from that agent).
   */
  async rateAgent(agentAddress: string, skillId: number, score: number, comment?: string): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.rateAgent({ agentAddress, skillId, score, comment });
  }

  /**
   * Endorse another registered agent.
   */
  async endorseAgent(agentAddress: string, reason: string): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.endorseAgent({ agentAddress, reason });
  }

  /**
   * Query this agent's own reputation.
   */
  async getMyReputation(): Promise<ReputationResponse> {
    this.ensureInitialized();
    return this.client.getReputation(this.client.getAddress());
  }

  /**
   * Query any agent's reputation.
   */
  async getReputation(address: string): Promise<ReputationResponse> {
    this.ensureInitialized();
    return this.client.getReputation(address);
  }

  /**
   * Query ratings for an agent.
   */
  async getRatings(address: string): Promise<RatingsResponse> {
    this.ensureInitialized();
    return this.client.getRatings(address);
  }

  /**
   * Query endorsements for an agent.
   */
  async getEndorsements(address: string): Promise<EndorsementsResponse> {
    this.ensureInitialized();
    return this.client.getEndorsements(address);
  }

  /**
   * Query top agents by reputation score.
   */
  async getTopAgents(limit?: number): Promise<TopAgentsResponse> {
    this.ensureInitialized();
    return this.client.getTopAgents(limit);
  }

  // -----------------------------------------------------------------------
  // Escrow
  // -----------------------------------------------------------------------

  /**
   * Create an escrow agreement for a skill purchase.
   */
  async createEscrow(params: MsgCreateEscrowParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.createEscrow(params);
  }

  /**
   * Complete an escrow (buyer confirms delivery).
   */
  async completeEscrow(params: MsgCompleteEscrowParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.completeEscrow(params);
  }

  /**
   * Dispute an escrow agreement.
   */
  async disputeEscrow(params: MsgDisputeEscrowParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.disputeEscrow(params);
  }

  /**
   * Query an escrow by ID.
   */
  async getEscrow(escrowId: number): Promise<EscrowResponse> {
    this.ensureInitialized();
    return this.client.getEscrow(escrowId);
  }

  /**
   * Query escrows for this agent (as buyer or seller).
   */
  async getMyEscrows(): Promise<EscrowsResponse> {
    this.ensureInitialized();
    return this.client.getEscrows(this.client.getAddress());
  }

  // -----------------------------------------------------------------------
  // Agent Activity & Stats
  // -----------------------------------------------------------------------

  /**
   * Query this agent's aggregate stats.
   */
  async getMyStats(): Promise<AgentStatsResponse> {
    this.ensureInitialized();
    return this.client.getAgentStats(this.client.getAddress());
  }

  /**
   * Query activity events for this agent.
   */
  async getMyActivity(limit?: number, offset?: number): Promise<AgentActivityResponse> {
    this.ensureInitialized();
    return this.client.getAgentActivity(this.client.getAddress(), limit, offset);
  }

  /**
   * Query recent global activity events.
   */
  async getRecentActivity(limit?: number): Promise<RecentActivityResponse> {
    this.ensureInitialized();
    return this.client.getRecentActivity(limit);
  }

  /**
   * Query on-chain agent policy params.
   */
  async getAgentParams(): Promise<AgentParamsResponse> {
    this.ensureInitialized();
    return this.client.getAgentParams();
  }

  // -----------------------------------------------------------------------
  // Task Delegation
  // -----------------------------------------------------------------------

  /**
   * Delegate a task to another agent.
   */
  async delegateTask(params: MsgDelegateTaskParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.delegateTask(params);
  }

  /**
   * Accept a task delegated to this agent.
   */
  async acceptTask(taskId: number): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.acceptTask({ taskId });
  }

  /**
   * Complete a task with a result.
   */
  async completeTask(taskId: number, result: string): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.completeTask({ taskId, result });
  }

  /**
   * Deregister this agent and withdraw deposit.
   */
  async deregister(): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.deregisterAgent();
  }

  /**
   * Query a task by ID.
   */
  async getTask(taskId: number): Promise<TaskInfoResponse> {
    this.ensureInitialized();
    return this.client.getTask(taskId);
  }

  /**
   * Query tasks this agent has delegated.
   */
  async getMyDelegatedTasks(): Promise<TasksResponse> {
    this.ensureInitialized();
    return this.client.getTasksByDelegator(this.client.getAddress());
  }

  /**
   * Query tasks assigned to this agent.
   */
  async getMyAssignedTasks(): Promise<TasksResponse> {
    this.ensureInitialized();
    return this.client.getTasksByAssignee(this.client.getAddress());
  }

  // -----------------------------------------------------------------------
  // IBC Cross-chain Privacy
  // -----------------------------------------------------------------------

  /**
   * Send tokens via IBC with auto-shielding on the destination chain.
   *
   * The IBC privacy middleware on the receiving ClawChain will automatically
   * shield the tokens into the privacy pool upon receipt.
   */
  async ibcShieldTransfer(params: IBCShieldTransferParams): Promise<TxResult> {
    this.ensureInitialized();
    return this.client.ibcShieldTransfer(params);
  }

  // -----------------------------------------------------------------------
  // P2P Messaging
  // -----------------------------------------------------------------------

  /**
   * Send an encrypted message to another agent.
   *
   * Looks up the recipient's on-chain agent info (pubkey + endpoint),
   * encrypts the message with ECIES (secp256k1 ECDH + AES-256-GCM),
   * signs it, and POSTs to the recipient's messaging endpoint.
   *
   * @param recipientAddress - Bech32 address of the recipient agent.
   * @param body             - Plaintext message body.
   */
  async sendMessage(
    recipientAddress: string,
    body: string,
  ): Promise<{ received: boolean; id?: string }> {
    this.ensureInitialized();

    // Look up recipient agent info
    const agentInfo = await this.client.getAgent(recipientAddress);
    if (!agentInfo.registered || !agentInfo.pubkey || !agentInfo.endpoint) {
      throw new Error(
        `ClawChainAgent.sendMessage: recipient ${recipientAddress} is not registered or missing pubkey/endpoint`,
      );
    }

    // Derive private key from mnemonic
    const { Secp256k1, Slip10, Slip10Curve, stringToPath, Bip39, sha256 } = await import("@cosmjs/crypto");
    const { createCipheriv, createHmac, randomBytes: cryptoRandomBytes } = await import("node:crypto");

    const seed = await Bip39.mnemonicToSeed(this.mnemonic as never);
    const hdPath = stringToPath("m/44'/118'/0'/0/0");
    const { privkey } = Slip10.derivePath(Slip10Curve.Secp256k1, seed, hdPath);
    const privateKeyHex = Buffer.from(privkey).toString("hex");

    // ECIES encrypt
    const ephemeralPrivKey = cryptoRandomBytes(32);
    const { pubkey: ephemeralPubKey } = await Secp256k1.makeKeypair(ephemeralPrivKey);
    const compressedEphemeral = Secp256k1.compressPubkey(ephemeralPubKey);
    const recipientPubkey = Buffer.from(agentInfo.pubkey, "hex");
    // Real secp256k1 ECDH shared secret: eph_priv * recipient_pub.
    const sharedMaterial = await computeSharedSecretSecp256k1(
      ephemeralPrivKey,
      recipientPubkey.toString("hex"),
    );
    const aesKey = createHmac("sha256", Buffer.from("clawchain-ecies")).update(sharedMaterial).digest();
    const iv = cryptoRandomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(body, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ciphertextBuf = Buffer.concat([Buffer.from(compressedEphemeral), iv, encrypted, tag]);
    const ciphertext = ciphertextBuf.toString("base64");

    // Sign the ciphertext
    const hash = sha256(new TextEncoder().encode(ciphertext));
    const sig = await Secp256k1.createSignature(hash, Buffer.from(privateKeyHex, "hex"));
    const signature = Buffer.from([...sig.r(32), ...sig.s(32)]).toString("hex");

    const message = {
      from: this.client.getAddress(),
      to: recipientAddress,
      ciphertext,
      signature,
      timestamp: Date.now(),
    };

    const url = `${agentInfo.endpoint.replace(/\/?$/, "")}/agent/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Message delivery failed: HTTP ${res.status} – ${text}`);
    }

    return (await res.json()) as { received: boolean; id?: string };
  }

  // -----------------------------------------------------------------------
  // Local state helpers
  // -----------------------------------------------------------------------

  /** Expose local unspent commitments (read-only copy). */
  getCommitments(): ReadonlyArray<Readonly<LocalCommitment>> {
    return this.commitments.map((c) => ({ ...c }));
  }

  /** Add a commitment received from another agent. */
  addCommitment(commitment: LocalCommitment): void {
    this.commitments.push({ ...commitment });
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Select exactly two unspent commitments whose combined value covers
   * the requested amount.  If only one commitment is needed, a zero-value
   * dummy commitment is generated for the second slot.
   *
   * @returns A tuple of two commitments, or `null` if insufficient balance.
   */
  private selectCommitments(
    amount: bigint,
  ): [LocalCommitment, LocalCommitment] | null {
    const unspent = this.commitments
      .filter((c) => !c.spent)
      .sort((a, b) => {
        // Sort descending by amount so we try bigger commitments first.
        const diff = BigInt(b.amount) - BigInt(a.amount);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });

    // Try to find a single commitment that covers the amount.
    for (const c of unspent) {
      if (BigInt(c.amount) >= amount) {
        // Use a zero-value dummy for the second input.
        const dummy: LocalCommitment = {
          commitment: "0".repeat(64),
          amount: "0",
          blinding: "0".repeat(64),
          secret: "0".repeat(64),
          spent: false,
        };
        return [c, dummy];
      }
    }

    // Try pairs of commitments.
    for (let i = 0; i < unspent.length; i++) {
      for (let j = i + 1; j < unspent.length; j++) {
        const combined = BigInt(unspent[i].amount) + BigInt(unspent[j].amount);
        if (combined >= amount) {
          return [unspent[i], unspent[j]];
        }
      }
    }

    return null;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "ClawChainAgent: not initialized. Call initialize() first.",
      );
    }
  }
}
