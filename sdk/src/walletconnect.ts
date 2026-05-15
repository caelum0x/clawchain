/**
 * ClawChain WalletConnect v2 Integration
 *
 * Provides WalletConnect v2 protocol support for connecting external dApps
 * to Claw wallets (browser extension and mobile). Uses the SignClient from
 * @walletconnect/sign-client with Cosmos chain namespaces.
 *
 * Supported methods:
 *   - cosmos_getAccounts
 *   - cosmos_signDirect
 *   - cosmos_signAmino
 */

import { SignClient } from "@walletconnect/sign-client";
import type { SignClientTypes, SessionTypes } from "@walletconnect/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for initialising the ClawChain WalletConnect provider. */
export interface ClawWalletConnectConfig {
  /** WalletConnect Cloud project ID (obtain from cloud.walletconnect.com). */
  projectId: string;
  /** Metadata describing the wallet or dApp. */
  metadata: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  /** ClawChain chain ID ("clawchain-1" for mainnet, "clawchain-testnet-1" for testnet). */
  chainId: string;
  /** RPC endpoint for the chain (e.g. "https://rpc.clawchain.io"). */
  rpcUrl: string;
}

// ---------------------------------------------------------------------------
// Session representation
// ---------------------------------------------------------------------------

/** Local representation of a WalletConnect session. */
export interface WalletConnectSession {
  /** Session topic used for all requests within this session. */
  topic: string;
  /** Peer metadata from the connected dApp or wallet. */
  peerMeta: {
    name: string;
    description: string;
    url: string;
    icons: string[];
  };
  /** Accounts (claw1... bech32 addresses) shared in this session. */
  accounts: string[];
  /** Chain ID the session was approved for. */
  chainId: string;
  /** Whether the session is currently connected. */
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Session proposal & request payloads
// ---------------------------------------------------------------------------

/** Payload surfaced to the wallet when a dApp proposes a new session. */
export interface SessionProposalPayload {
  id: number;
  params: SignClientTypes.EventArguments["session_proposal"]["params"];
}

/** Payload surfaced to the wallet when a dApp sends a sign request. */
export interface SessionRequestPayload {
  id: number;
  topic: string;
  params: {
    request: {
      method: string;
      params: unknown;
    };
    chainId: string;
  };
}

// ---------------------------------------------------------------------------
// Supported WalletConnect methods & events
// ---------------------------------------------------------------------------

/** Cosmos WalletConnect methods supported by ClawChain. */
export const CLAW_WC_METHODS = [
  "cosmos_getAccounts",
  "cosmos_signDirect",
  "cosmos_signAmino",
] as const;

/** Cosmos WalletConnect events supported by ClawChain. */
export const CLAW_WC_EVENTS = [
  "chainChanged",
  "accountsChanged",
] as const;

export type ClawWCMethod = (typeof CLAW_WC_METHODS)[number];
export type ClawWCEvent = (typeof CLAW_WC_EVENTS)[number];

// ---------------------------------------------------------------------------
// Namespace helper
// ---------------------------------------------------------------------------

/**
 * Build the required WalletConnect namespace for a given ClawChain chain ID.
 *
 * @param chainId - "clawchain-1" or "clawchain-testnet-1"
 * @returns A namespaces object suitable for session approval.
 */
export function getClawNamespace(chainId: string) {
  return {
    cosmos: {
      methods: [...CLAW_WC_METHODS],
      chains: [`cosmos:${chainId}`],
      events: [...CLAW_WC_EVENTS],
    },
  };
}

/**
 * Build a fully-qualified CAIP-10 account string for a ClawChain address.
 *
 * @param chainId - "clawchain-1" or "clawchain-testnet-1"
 * @param address - bech32 claw1... address
 */
export function clawCAIP10(chainId: string, address: string): string {
  return `cosmos:${chainId}:${address}`;
}

// ---------------------------------------------------------------------------
// Main WalletConnect class
// ---------------------------------------------------------------------------

/**
 * High-level WalletConnect v2 integration for ClawChain wallets.
 *
 * Usage (wallet side):
 * ```ts
 * const wc = new ClawWalletConnect({
 *   projectId: "YOUR_PROJECT_ID",
 *   metadata: { name: "Claw Wallet", ... },
 *   chainId: "clawchain-1",
 *   rpcUrl: "https://rpc.clawchain.io",
 * });
 *
 * await wc.init();
 * wc.onProposal(async (proposal) => { ... return true; });
 * wc.onSign(async (request) => { ... return signedBytes; });
 * await wc.pair(uri);
 * ```
 */
export class ClawWalletConnect {
  private client: InstanceType<typeof SignClient> | null = null;
  private config: ClawWalletConnectConfig;
  private sessions: Map<string, WalletConnectSession> = new Map();

  // Handlers provided by the wallet UI
  private onSessionProposal?: (
    proposal: SessionProposalPayload,
  ) => Promise<boolean>;
  private onSignRequest?: (request: SessionRequestPayload) => Promise<string>;
  private onSessionDeleted?: (topic: string) => void;

  constructor(config: ClawWalletConnectConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Initialise the underlying SignClient and bind internal event handlers. */
  async init(): Promise<void> {
    this.client = await SignClient.init({
      projectId: this.config.projectId,
      metadata: this.config.metadata,
    });

    // --- Event: session_proposal -------------------------------------------
    this.client.on("session_proposal", async (event: SignClientTypes.EventArguments["session_proposal"]) => {
      if (!this.onSessionProposal) {
        // Auto-reject if no handler is registered
        await this.reject(event.id, "No proposal handler registered");
        return;
      }

      const approved = await this.onSessionProposal({
        id: event.id,
        params: event.params,
      });

      if (!approved) {
        await this.reject(event.id, "User rejected");
      }
      // If approved, the caller is expected to call `approve()` with accounts.
    });

    // --- Event: session_request -------------------------------------------
    this.client.on("session_request", async (event: SignClientTypes.EventArguments["session_request"]) => {
      await this.handleSessionRequest(event);
    });

    // --- Event: session_delete --------------------------------------------
    this.client.on("session_delete", (event: SignClientTypes.EventArguments["session_delete"]) => {
      this.sessions.delete(event.topic);
      this.onSessionDeleted?.(event.topic);
    });

    // Hydrate sessions that survived a restart
    this.hydrateExistingSessions();
  }

  /** Clean up resources. */
  async destroy(): Promise<void> {
    // Disconnect all active sessions
    const topics = [...this.sessions.keys()];
    for (const topic of topics) {
      try {
        await this.disconnect(topic);
      } catch {
        // Best-effort cleanup
      }
    }
    this.client = null;
    this.sessions.clear();
  }

  // -----------------------------------------------------------------------
  // Pairing & session management
  // -----------------------------------------------------------------------

  /**
   * Pair with a dApp by scanning / pasting its WalletConnect URI.
   *
   * This triggers a `session_proposal` event which is forwarded to the
   * registered `onProposal` handler.
   */
  async pair(uri: string): Promise<void> {
    this.assertInitialised();
    await this.client!.core.pairing.pair({ uri });
  }

  /**
   * Approve a pending session proposal.
   *
   * @param proposalId - The proposal ID from the `session_proposal` event.
   * @param accounts   - Array of bech32 claw1... addresses to expose.
   * @returns The accepted session.
   */
  async approve(
    proposalId: number,
    accounts: string[],
  ): Promise<WalletConnectSession> {
    this.assertInitialised();

    const { chainId } = this.config;
    const caipAccounts = accounts.map((addr) => clawCAIP10(chainId, addr));

    const { acknowledged } = await this.client!.approve({
      id: proposalId,
      namespaces: {
        cosmos: {
          accounts: caipAccounts,
          methods: [...CLAW_WC_METHODS],
          events: [...CLAW_WC_EVENTS],
        },
      },
    });

    const session = await acknowledged();

    const wcSession = this.sessionFromWC(session, accounts);
    this.sessions.set(session.topic, wcSession);
    return wcSession;
  }

  /**
   * Reject a pending session proposal.
   *
   * @param proposalId - The proposal ID from the `session_proposal` event.
   * @param reason     - Human-readable reason shown to the dApp.
   */
  async reject(proposalId: number, reason = "User rejected"): Promise<void> {
    this.assertInitialised();

    await this.client!.reject({
      id: proposalId,
      reason: {
        code: 5000,
        message: reason,
      },
    });
  }

  /**
   * Disconnect an active session.
   *
   * @param topic - The session topic to disconnect.
   */
  async disconnect(topic: string): Promise<void> {
    this.assertInitialised();

    await this.client!.disconnect({
      topic,
      reason: {
        code: 6000,
        message: "User disconnected",
      },
    });

    this.sessions.delete(topic);
  }

  /** Return all active sessions. */
  getSessions(): WalletConnectSession[] {
    return [...this.sessions.values()];
  }

  /** Return a specific session by topic, or undefined. */
  getSession(topic: string): WalletConnectSession | undefined {
    return this.sessions.get(topic);
  }

  // -----------------------------------------------------------------------
  // Handler registration
  // -----------------------------------------------------------------------

  /**
   * Register a handler for incoming session proposals.
   *
   * The handler receives the proposal payload and should return `true` if the
   * user approves (the caller should then call `approve()` with accounts) or
   * `false` to reject.
   */
  onProposal(
    handler: (proposal: SessionProposalPayload) => Promise<boolean>,
  ): void {
    this.onSessionProposal = handler;
  }

  /**
   * Register a handler for incoming sign requests.
   *
   * The handler receives the request payload (method + params) and should
   * return the signed result as a hex or base64 string, depending on the
   * method.
   */
  onSign(handler: (request: SessionRequestPayload) => Promise<string>): void {
    this.onSignRequest = handler;
  }

  /**
   * Register a handler called when a session is deleted by the peer.
   */
  onDelete(handler: (topic: string) => void): void {
    this.onSessionDeleted = handler;
  }

  // -----------------------------------------------------------------------
  // dApp-side helpers (request methods)
  // -----------------------------------------------------------------------

  /**
   * Request accounts from the connected wallet (dApp side).
   *
   * @param topic - Active session topic.
   * @returns Array of account objects with address and algo.
   */
  async requestAccounts(
    topic: string,
  ): Promise<Array<{ address: string; algo: string; pubkey: string }>> {
    this.assertInitialised();

    const result = await this.client!.request<
      Array<{ address: string; algo: string; pubkey: string }>
    >({
      topic,
      chainId: `cosmos:${this.config.chainId}`,
      request: {
        method: "cosmos_getAccounts",
        params: {},
      },
    });

    return result;
  }

  /**
   * Request a signDirect signature from the connected wallet (dApp side).
   *
   * @param topic      - Active session topic.
   * @param signerAddr - The signer's bech32 address.
   * @param signDoc    - The sign doc to sign (protobuf-encoded).
   * @returns Signature result.
   */
  async requestSignDirect(
    topic: string,
    signerAddr: string,
    signDoc: {
      bodyBytes: string;
      authInfoBytes: string;
      chainId: string;
      accountNumber: string;
    },
  ): Promise<{ signature: string; signed: typeof signDoc }> {
    this.assertInitialised();

    return this.client!.request({
      topic,
      chainId: `cosmos:${this.config.chainId}`,
      request: {
        method: "cosmos_signDirect",
        params: {
          signerAddress: signerAddr,
          signDoc,
        },
      },
    });
  }

  /**
   * Request a signAmino signature from the connected wallet (dApp side).
   *
   * @param topic      - Active session topic.
   * @param signerAddr - The signer's bech32 address.
   * @param signDoc    - The Amino sign doc.
   * @returns Signature result.
   */
  async requestSignAmino(
    topic: string,
    signerAddr: string,
    signDoc: {
      chain_id: string;
      account_number: string;
      sequence: string;
      fee: { amount: Array<{ denom: string; amount: string }>; gas: string };
      msgs: Array<{ type: string; value: unknown }>;
      memo: string;
    },
  ): Promise<{ signature: string; signed: typeof signDoc }> {
    this.assertInitialised();

    return this.client!.request({
      topic,
      chainId: `cosmos:${this.config.chainId}`,
      request: {
        method: "cosmos_signAmino",
        params: {
          signerAddress: signerAddr,
          signDoc,
        },
      },
    });
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Route an incoming session_request to the registered sign handler,
   * then respond to the relay.
   */
  private async handleSessionRequest(
    event: SignClientTypes.EventArguments["session_request"],
  ): Promise<void> {
    const { id, topic, params } = event;
    const { method } = params.request;

    try {
      // For cosmos_getAccounts, respond directly with session accounts
      if (method === "cosmos_getAccounts") {
        const session = this.sessions.get(topic);
        if (!session) {
          throw new Error("Session not found");
        }
        const accounts = session.accounts.map((addr) => ({
          address: addr,
          algo: "secp256k1",
          pubkey: "", // Wallet should fill this from its keystore
        }));
        await this.client!.respond({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result: accounts,
          },
        });
        return;
      }

      // For sign methods, delegate to the registered handler
      if (
        method === "cosmos_signDirect" ||
        method === "cosmos_signAmino"
      ) {
        if (!this.onSignRequest) {
          throw new Error("No sign handler registered");
        }

        const result = await this.onSignRequest({
          id,
          topic,
          params,
        });

        await this.client!.respond({
          topic,
          response: {
            id,
            jsonrpc: "2.0",
            result,
          },
        });
        return;
      }

      // Unknown method
      throw new Error(`Unsupported method: ${method}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.client!.respond({
        topic,
        response: {
          id,
          jsonrpc: "2.0",
          error: {
            code: 5000,
            message,
          },
        },
      });
    }
  }

  /** Convert a WC session to our local representation. */
  private sessionFromWC(
    session: SessionTypes.Struct,
    accounts: string[],
  ): WalletConnectSession {
    const peer = session.peer.metadata;
    return {
      topic: session.topic,
      peerMeta: {
        name: peer.name,
        description: peer.description,
        url: peer.url,
        icons: peer.icons,
      },
      accounts,
      chainId: this.config.chainId,
      connected: true,
    };
  }

  /** Hydrate sessions that survived a page reload / app restart. */
  private hydrateExistingSessions(): void {
    if (!this.client) return;

    const existing = this.client.session.getAll();
    for (const session of existing) {
      // Extract claw addresses from CAIP-10 accounts
      const clawAccounts = (
        session.namespaces?.cosmos?.accounts ?? []
      )
        .map((caip10: string) => {
          // Format: cosmos:clawchain-1:claw1abc...
          const parts = caip10.split(":");
          return parts.length === 3 ? parts[2] : "";
        })
        .filter((addr: string) => addr.startsWith("claw"));

      this.sessions.set(
        session.topic,
        this.sessionFromWC(session, clawAccounts),
      );
    }
  }

  /** Guard that throws if init() has not been called. */
  private assertInitialised(): void {
    if (!this.client) {
      throw new Error(
        "ClawWalletConnect not initialised. Call init() first.",
      );
    }
  }
}
