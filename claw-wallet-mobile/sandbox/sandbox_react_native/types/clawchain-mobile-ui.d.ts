/**
 * Type declarations for @clawchain/mobile-ui.
 *
 * This declaration file allows the sandbox app to import from the
 * workspace package without TSC needing to resolve react-native
 * from the package's directory.
 */

declare module "@clawchain/mobile-ui" {
  import type { ComponentType } from "react";

  // ── Chain config types ──

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

  export const DEFAULT_CONFIG: ChainConfig;
  export const TESTNET_CONFIG: ChainConfig;
  export const LOCAL_CONFIG: ChainConfig;

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

  // ── Shield types ──

  export interface ShieldResult {
    txHash: string;
    simulated: boolean;
  }

  // ── Notification types ──

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

  export type NotificationCategory = "transaction" | "governance" | "agent" | "price";

  export interface PushNotification {
    id: string;
    title: string;
    body: string;
    category: NotificationCategory;
    data: Record<string, string>;
    timestamp: number;
    read: boolean;
  }

  // ── API client ──

  export class ClawChainMobileApi {
    constructor(config?: ChainConfig);
    setConfig(config: ChainConfig): void;
    getConfig(): ChainConfig;
    getBalance(address: string): Promise<CoinBalance[]>;
    getShieldedBalance(address: string): Promise<string>;
    shield(address: string, amount: string): Promise<ShieldResult>;
    unshield(address: string, amount: string): Promise<ShieldResult>;
    getProposals(status?: string): Promise<GovernanceProposal[]>;
    getProposal(proposalId: string): Promise<GovernanceProposal | null>;
    getProposalVotes(proposalId: string): Promise<ProposalVote[]>;
    voteOnProposal(proposalId: string, option: string, voter: string): Promise<ShieldResult>;
    getAgents(): Promise<AgentInfo[]>;
    getAgent(address: string): Promise<AgentInfo | null>;
  }

  export const clawchainApi: ClawChainMobileApi;

  // ── Push notification service ──

  export interface PushNotificationService {
    registerForPushNotifications(address: string, platform: "ios" | "android" | "web"): Promise<PushNotificationToken>;
    unregisterPushNotifications(address: string): Promise<void>;
    getPreferences(address: string): Promise<NotificationPreferences>;
    setPreferences(address: string, prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
    getNotifications(address: string, limit?: number): Promise<PushNotification[]>;
    markAsRead(notificationId: string): Promise<void>;
    markAllAsRead(address: string): Promise<void>;
    getUnreadCount(address: string): Promise<number>;
  }

  export const pushNotificationService: PushNotificationService;
  export function getStubService(): PushNotificationService & { simulateNotification: (address: string, notification: Omit<PushNotification, "id" | "timestamp" | "read">) => void };

  // ── Hooks ──

  export interface UseBalanceOptions {
    address: string | null;
    denom?: string;
    decimals?: number;
    refreshInterval?: number;
  }

  export interface UseBalanceResult {
    balanceRaw: string;
    balance: string;
    allBalances: CoinBalance[];
    shieldedBalanceRaw: string;
    shieldedBalance: string;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  }

  export function useBalance(options: UseBalanceOptions): UseBalanceResult;

  export interface UsePrivacyShieldOptions {
    address: string | null;
    onSuccess?: (result: ShieldResult, operation: "shield" | "unshield") => void;
    onError?: (error: Error, operation: "shield" | "unshield") => void;
  }

  export interface UsePrivacyShieldResult {
    shield: (amount: string) => Promise<ShieldResult>;
    unshield: (amount: string) => Promise<ShieldResult>;
    isLoading: boolean;
    lastResult: ShieldResult | null;
    error: string | null;
  }

  export function usePrivacyShield(options: UsePrivacyShieldOptions): UsePrivacyShieldResult;

  export type ProposalStatus = "all" | "voting" | "passed" | "rejected" | "executed";

  export interface UseGovernanceProposalsOptions {
    status?: ProposalStatus;
    refreshInterval?: number;
  }

  export interface UseGovernanceProposalsResult {
    proposals: GovernanceProposal[];
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    getProposal: (id: string) => Promise<GovernanceProposal | null>;
    getVotes: (proposalId: string) => Promise<ProposalVote[]>;
    vote: (proposalId: string, option: string, voter: string) => Promise<ShieldResult>;
  }

  export function useGovernanceProposals(options?: UseGovernanceProposalsOptions): UseGovernanceProposalsResult;

  // ── Screen components ──

  export const GovernanceScreen: ComponentType<{
    voterAddress?: string;
    colorScheme?: "light" | "dark";
  }>;

  export const AgentDashboard: ComponentType<{
    colorScheme?: "light" | "dark";
  }>;

  export const PrivacyShield: ComponentType<{
    address: string | null;
    colorScheme?: "light" | "dark";
  }>;

  export const DexSwap: ComponentType<{
    address?: string | null;
    colorScheme?: "light" | "dark";
  }>;

  export const TaskManager: ComponentType<{
    address?: string | null;
    colorScheme?: "light" | "dark";
  }>;

  export const Faucet: ComponentType<{
    address?: string | null;
    faucetUrl?: string;
    colorScheme?: "light" | "dark";
  }>;
}
