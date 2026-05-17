/**
 * @clawchain/mobile-ui — Shared ClawChain UI components and hooks
 * for React Native (Expo) and web.
 */

// Hooks
export { useBalance, type UseBalanceOptions, type UseBalanceResult } from "./hooks/useBalance.js";
export {
  usePrivacyShield,
  type UsePrivacyShieldOptions,
  type UsePrivacyShieldResult,
} from "./hooks/usePrivacyShield.js";
export {
  useGovernanceProposals,
  type UseGovernanceProposalsOptions,
  type UseGovernanceProposalsResult,
  type ProposalStatus,
} from "./hooks/useGovernanceProposals.js";

// Screens
export { GovernanceScreen } from "./screens/GovernanceScreen.js";
export { AgentDashboard } from "./screens/AgentDashboard.js";
export { PrivacyShield } from "./screens/PrivacyShield.js";
export { DexSwap } from "./screens/DexSwap.js";
export { TaskManager } from "./screens/TaskManager.js";
export { Faucet } from "./screens/Faucet.js";

// Services
export {
  ClawChainMobileApi,
  clawchainApi,
  DEFAULT_CONFIG,
  TESTNET_CONFIG,
  LOCAL_CONFIG,
  type ChainConfig,
  type CoinBalance,
  type GovernanceProposal,
  type ProposalVote,
  type AgentInfo,
  type ShieldResult,
  type PushNotificationToken,
  type NotificationPreferences,
} from "./services/clawchain-api.js";

export {
  pushNotificationService,
  getStubService,
  type PushNotificationService,
  type PushNotification,
  type NotificationCategory,
} from "./services/push-notifications.js";
