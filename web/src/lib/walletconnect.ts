/**
 * Web-specific WalletConnect v2 integration for the ClawChain dashboard.
 *
 * Provides a singleton ClawWalletConnect instance configured for the web
 * dashboard acting as a **dApp** that connects to a user's Claw wallet
 * (browser extension or mobile).
 *
 * Sessions are persisted in localStorage by the underlying SignClient.
 */

import {
  ClawWalletConnect,
  type ClawWalletConnectConfig,
  type WalletConnectSession,
} from "@clawchain/sdk";
import { chainConfig } from "./config.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WalletConnect Cloud project ID. Replace with your real project ID. */
const WC_PROJECT_ID = "YOUR_WALLETCONNECT_PROJECT_ID";

const WC_CONFIG: ClawWalletConnectConfig = {
  projectId: WC_PROJECT_ID,
  metadata: {
    name: "ClawChain Dashboard",
    description: "ClawChain web explorer, marketplace and wallet dashboard",
    url: typeof window !== "undefined" ? window.location.origin : "https://clawchain.io",
    icons: [
      typeof window !== "undefined"
        ? `${window.location.origin}/claw.svg`
        : "https://clawchain.io/claw.svg",
    ],
  },
  chainId: chainConfig.chainId,
  rpcUrl: chainConfig.rpcEndpoint,
};

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let wcInstance: ClawWalletConnect | null = null;
let initPromise: Promise<ClawWalletConnect> | null = null;

/**
 * Get or create the WalletConnect singleton for the web dashboard.
 *
 * The instance is created once and reused for the lifetime of the page.
 */
export async function getWalletConnect(): Promise<ClawWalletConnect> {
  if (wcInstance) return wcInstance;

  // Prevent multiple concurrent initialisations
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const wc = new ClawWalletConnect(WC_CONFIG);
    await wc.init();
    wcInstance = wc;
    return wc;
  })();

  return initPromise;
}

/**
 * Destroy the WalletConnect singleton.
 */
export async function destroyWalletConnect(): Promise<void> {
  if (wcInstance) {
    await wcInstance.destroy();
    wcInstance = null;
    initPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Get the currently active sessions.
 *
 * Returns an empty array if WalletConnect is not yet initialised.
 */
export function getActiveSessions(): WalletConnectSession[] {
  if (!wcInstance) return [];
  return wcInstance.getSessions();
}

/**
 * Get the first connected wallet address, or null.
 */
export function getConnectedAddress(): string | null {
  const sessions = getActiveSessions();
  if (sessions.length === 0) return null;
  return sessions[0].accounts[0] ?? null;
}

/**
 * Check whether any session is currently active.
 */
export function isConnected(): boolean {
  return getActiveSessions().length > 0;
}

/**
 * Disconnect all active sessions.
 */
export async function disconnectAll(): Promise<void> {
  if (!wcInstance) return;

  const sessions = wcInstance.getSessions();
  for (const session of sessions) {
    try {
      await wcInstance.disconnect(session.topic);
    } catch {
      // Best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// dApp-side connection flow
// ---------------------------------------------------------------------------

/**
 * Generate a WalletConnect pairing URI that can be displayed as a QR code
 * for mobile wallet scanning.
 *
 * @returns The pairing URI string.
 */
export async function createPairingUri(): Promise<string> {
  const wc = await getWalletConnect();
  const client = (wc as any).client;

  if (!client) {
    throw new Error("WalletConnect not initialised");
  }

  // Create a new pairing
  const { uri } = await client.core.pairing.create();
  return uri;
}

/**
 * Connect to a wallet by creating a session proposal.
 *
 * In the web dashboard, this is used to initiate the connection to the
 * user's Claw wallet (mobile or extension).
 *
 * @param uri - Optional existing pairing URI. If not provided, creates new pairing.
 * @returns The connected session.
 */
export async function connectToWallet(
  uri?: string,
): Promise<WalletConnectSession | null> {
  const wc = await getWalletConnect();

  if (uri) {
    await wc.pair(uri);
  }

  // The session will be established after the wallet approves the proposal.
  // Poll for a new session.
  const startCount = wc.getSessions().length;

  return new Promise<WalletConnectSession | null>((resolve) => {
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes at 1 check/sec

    const interval = setInterval(() => {
      attempts++;
      const current = wc.getSessions();
      if (current.length > startCount) {
        clearInterval(interval);
        resolve(current[current.length - 1]);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        resolve(null);
      }
    }, 1000);
  });
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { WalletConnectSession };
