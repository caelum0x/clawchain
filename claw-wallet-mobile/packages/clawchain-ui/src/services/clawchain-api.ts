/**
 * ClawChain REST API client for mobile wallet.
 *
 * Wraps the ClawChain REST endpoints for balance, privacy (shield/unshield),
 * governance proposals, and agent queries. All methods are read-only queries
 * unless otherwise noted. Transaction-signing methods return simulated stubs
 * because the sandbox wallet does not hold real private keys (see AGENTS.md
 * for the MPC/TSS key management architecture).
 */

export interface ChainConfig {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bech32Prefix: string;
  denom: string;
  displayDenom: string;
  decimals: number;
}

export const DEFAULT_CONFIG: ChainConfig = {
  chainId: "clawchain-1",
  chainName: "ClawChain",
  rpc: "https://rpc.clawchain.io",
  rest: "https://api.clawchain.io",
  bech32Prefix: "claw",
  denom: "uclaw",
  displayDenom: "CLAW",
  decimals: 6,
};

export const TESTNET_CONFIG: ChainConfig = {
  chainId: "clawchain-testnet-1",
  chainName: "ClawChain Testnet",
  rpc: "https://rpc-testnet.clawchain.io",
  rest: "https://api-testnet.clawchain.io",
  bech32Prefix: "claw",
  denom: "uclaw",
  displayDenom: "CLAW",
  decimals: 6,
};

export const LOCAL_CONFIG: ChainConfig = {
  chainId: "clawchain-local",
  chainName: "ClawChain Local",
  rpc: "http://localhost:26657",
  rest: "http://localhost:1317",
  bech32Prefix: "claw",
  denom: "uclaw",
  displayDenom: "CLAW",
  decimals: 6,
};

// ── Balance types ──

export interface CoinBalance {
  denom: string;
  amount: string;
}

// ── Governance types ──

export interface GovernanceProposal {
  id: string;
  title: string;
  summary: string;
  status: string;
  proposer: string;
  submitTime: string;
  votingEndTime: string;
  yesVotes: string;
  noVotes: string;
  abstainVotes: string;
  vetoVotes: string;
  totalDeposit: CoinBalance[];
}

export interface ProposalVote {
  voter: string;
  option: string;
  proposalId: string;
}

// ── Agent types ──

export interface AgentInfo {
  address: string;
  name: string;
  status: string;
  endpoint: string;
  capabilities: string[];
  rewardsEarned: string;
  tasksCompleted: number;
  registeredAt: string;
}

// ── Privacy types ──

export interface ShieldResult {
  txHash: string;
  simulated: boolean;
}

// ── Push notification types ──

export interface PushNotificationToken {
  token: string;
  platform: "ios" | "android" | "web";
  address: string;
}

export interface NotificationPreferences {
  transactions: boolean;
  governance: boolean;
  agentAlerts: boolean;
  priceAlerts: boolean;
}

// ── API Client ──

export class ClawChainMobileApi {
  private config: ChainConfig;

  constructor(config: ChainConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  setConfig(config: ChainConfig): void {
    this.config = config;
  }

  getConfig(): ChainConfig {
    return this.config;
  }

  // ── Balance queries ──

  async getBalance(address: string): Promise<CoinBalance[]> {
    try {
      const res = await fetch(
        `${this.config.rest}/cosmos/bank/v1beta1/balances/${address}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.balances ?? []) as CoinBalance[];
    } catch {
      return [];
    }
  }

  async getShieldedBalance(address: string): Promise<string> {
    try {
      const res = await fetch(
        `${this.config.rest}/clawchain/privacy/v1/shielded_balance/${address}`
      );
      if (!res.ok) return "0";
      const data = await res.json();
      return (data.balance as string) ?? "0";
    } catch {
      return "0";
    }
  }

  // ── Privacy operations (sandbox stubs) ──

  async shield(address: string, amount: string): Promise<ShieldResult> {
    // Sandbox mode: real MsgShield signing requires MPC/TSS backend.
    return { txHash: `SIMULATED-shield-${Date.now()}`, simulated: true };
  }

  async unshield(address: string, amount: string): Promise<ShieldResult> {
    // Sandbox mode: real MsgUnshield requires ZK proof + MPC/TSS signing.
    return { txHash: `SIMULATED-unshield-${Date.now()}`, simulated: true };
  }

  // ── Governance queries ──

  async getProposals(status?: string): Promise<GovernanceProposal[]> {
    try {
      let url = `${this.config.rest}/clawchain/governance/v1/proposals`;
      if (status) {
        url += `?status=${encodeURIComponent(status)}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.proposals ?? [];
      return raw.map(parseProposal);
    } catch {
      return [];
    }
  }

  async getProposal(proposalId: string): Promise<GovernanceProposal | null> {
    try {
      const res = await fetch(
        `${this.config.rest}/clawchain/governance/v1/proposal/${proposalId}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return parseProposal(data.proposal ?? data);
    } catch {
      return null;
    }
  }

  async getProposalVotes(proposalId: string): Promise<ProposalVote[]> {
    try {
      const res = await fetch(
        `${this.config.rest}/clawchain/governance/v1/proposal/${proposalId}/votes`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.votes ?? []) as ProposalVote[];
    } catch {
      return [];
    }
  }

  async voteOnProposal(
    _proposalId: string,
    _option: string,
    _voter: string
  ): Promise<ShieldResult> {
    // Sandbox mode: real voting requires MPC/TSS signing.
    return { txHash: `SIMULATED-vote-${Date.now()}`, simulated: true };
  }

  // ── Agent queries ──

  async getAgents(): Promise<AgentInfo[]> {
    try {
      const res = await fetch(
        `${this.config.rest}/clawchain/agent/v1/live_agents`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.agents ?? [];
      return raw.map(parseAgent);
    } catch {
      return [];
    }
  }

  async getAgent(address: string): Promise<AgentInfo | null> {
    try {
      const res = await fetch(
        `${this.config.rest}/clawchain/agent/v1/agent/${address}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return parseAgent(data.agent ?? data);
    } catch {
      return null;
    }
  }
}

// ── Parsers ──

function parseProposal(raw: Record<string, unknown>): GovernanceProposal {
  return {
    id: String(raw.id ?? raw.proposal_id ?? "0"),
    title: String(raw.title ?? ""),
    summary: String(raw.summary ?? raw.description ?? ""),
    status: String(raw.status ?? "unknown"),
    proposer: String(raw.proposer ?? ""),
    submitTime: String(raw.submit_time ?? ""),
    votingEndTime: String(raw.voting_end_time ?? ""),
    yesVotes: String(raw.yes_votes ?? "0"),
    noVotes: String(raw.no_votes ?? "0"),
    abstainVotes: String(raw.abstain_votes ?? "0"),
    vetoVotes: String(raw.veto_votes ?? "0"),
    totalDeposit: Array.isArray(raw.total_deposit)
      ? (raw.total_deposit as CoinBalance[])
      : [],
  };
}

function parseAgent(raw: Record<string, unknown>): AgentInfo {
  return {
    address: String(raw.address ?? raw.agent_address ?? ""),
    name: String(raw.name ?? ""),
    status: String(raw.status ?? "unknown"),
    endpoint: String(raw.endpoint ?? ""),
    capabilities: Array.isArray(raw.capabilities)
      ? (raw.capabilities as string[])
      : typeof raw.capabilities === "string"
        ? (raw.capabilities as string).split(",")
        : [],
    rewardsEarned: String(raw.rewards_earned ?? raw.cumulative_rewards ?? "0"),
    tasksCompleted: Number(raw.tasks_completed ?? 0),
    registeredAt: String(raw.registered_at ?? raw.created_at ?? ""),
  };
}

// Singleton instance
export const clawchainApi = new ClawChainMobileApi();
