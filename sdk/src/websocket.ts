/**
 * ClawWebSocket – Real-time event streaming via CometBFT WebSocket.
 *
 * Connects to a CometBFT node's WebSocket endpoint and provides typed
 * subscription methods for blocks, transactions, agent events, DEX swaps,
 * and privacy events. Includes auto-reconnect with exponential backoff
 * and heartbeat ping/pong keep-alive.
 *
 * Usage:
 *
 * ```ts
 * import { ClawWebSocket } from "@clawchain/sdk";
 *
 * const ws = new ClawWebSocket("ws://localhost:26657/websocket");
 * await ws.connect();
 *
 * ws.subscribeBlocks((block) => console.log("New block", block.height));
 * ws.subscribeAgentEvents((event) => console.log("Agent event", event));
 *
 * // Later:
 * ws.disconnect();
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Filter criteria for transaction subscriptions. */
export interface TxFilter {
  /** Filter by message type URL (e.g. "/clawchain.agent.v1.MsgRegisterAgent"). */
  type?: string;
  /** Filter by sender address. */
  sender?: string;
  /** Filter by recipient address. */
  recipient?: string;
}

/** A parsed transaction event from the ClawWebSocket stream. */
export interface StreamTxEvent {
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
  /** Message type URL (if determinable from events). */
  msgType: string;
  /** Raw events emitted by the transaction. */
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
}

/** A parsed block header event from the WebSocket stream. */
export interface BlockEvent {
  /** Block height. */
  height: number;
  /** Block hash (hex). */
  hash: string;
  /** ISO-8601 timestamp of the block. */
  time: string;
  /** Number of transactions in the block. */
  numTxs: number;
  /** Hex address of the block proposer. */
  proposer: string;
  /** Chain ID. */
  chainId: string;
}

/** An agent module event (register, heartbeat, task lifecycle). */
export interface AgentEvent {
  /** Agent event subtype: "register", "deregister", "heartbeat", "task_delegate", "task_accept", "task_complete", "action". */
  action: string;
  /** Agent address involved. */
  agentAddress: string;
  /** Block height where the event occurred. */
  height: number;
  /** Additional key-value attributes from the event. */
  attributes: Record<string, string>;
}

/** A DEX swap event parsed from on-chain events. */
export interface DexSwapEvent {
  /** Pool / pair contract address. */
  poolAddress: string;
  /** Sender who initiated the swap. */
  sender: string;
  /** Denom of the offered asset. */
  offerAsset: string;
  /** Amount offered (string integer). */
  offerAmount: string;
  /** Denom of the returned asset. */
  returnAsset: string;
  /** Amount returned (string integer). */
  returnAmount: string;
  /** Spread amount charged. */
  spreadAmount: string;
  /** Commission amount charged. */
  commissionAmount: string;
  /** Block height. */
  height: number;
}

/** A privacy module event (shield, unshield, private transfer). */
export interface PrivacyEvent {
  /** Privacy event subtype: "shield", "unshield", "private_transfer". */
  action: string;
  /** Creator / sender address. */
  sender: string;
  /** Amount involved (if applicable, in uclaw). */
  amount: string;
  /** Block height where the event occurred. */
  height: number;
  /** Additional key-value attributes from the event. */
  attributes: Record<string, string>;
}

/** Union of all typed ClawChain WebSocket events. */
export type ClawChainEvent =
  | { kind: "block"; data: BlockEvent }
  | { kind: "tx"; data: StreamTxEvent }
  | { kind: "agent"; data: AgentEvent }
  | { kind: "dex_swap"; data: DexSwapEvent }
  | { kind: "privacy"; data: PrivacyEvent };

/** Callback type for the generic event emitter. */
export type EventCallback = (event: ClawChainEvent) => void;

/** Connection state of the WebSocket. */
export type ConnectionState = "disconnected" | "connecting" | "connected";

// ---------------------------------------------------------------------------
// Agent event action names that map to CometBFT event attributes
// ---------------------------------------------------------------------------

const AGENT_ACTIONS = new Set([
  "register_agent",
  "deregister_agent",
  "agent_heartbeat",
  "delegate_task",
  "accept_task",
  "complete_task",
  "agent_action",
]);

const PRIVACY_ACTIONS = new Set([
  "shield",
  "unshield",
  "private_transfer",
  "batch_private_transfer",
]);

// ---------------------------------------------------------------------------
// ClawWebSocket
// ---------------------------------------------------------------------------

/**
 * Real-time event streaming client for CometBFT WebSocket.
 *
 * Manages the connection lifecycle, auto-reconnects on failure with
 * exponential backoff (1s -> 2s -> 4s -> ... -> 30s max), and sends
 * heartbeat pings every 30 seconds to keep the connection alive.
 */
export class ClawWebSocket {
  /** WebSocket endpoint URL. */
  private readonly url: string;

  /** Underlying WebSocket instance. */
  private ws: WebSocket | null = null;

  /** Current connection state. */
  private state: ConnectionState = "disconnected";

  /** Whether the user has explicitly requested a disconnect. */
  private intentionalDisconnect = false;

  /** JSONRPC request ID counter. */
  private requestId = 0;

  /** Reconnection attempt counter (reset on successful connect). */
  private reconnectAttempt = 0;

  /** Maximum reconnect delay in milliseconds. */
  private readonly maxReconnectDelay = 30_000;

  /** Base reconnect delay in milliseconds. */
  private readonly baseReconnectDelay = 1_000;

  /** Handle for the reconnection timer. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Handle for the heartbeat interval. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Heartbeat interval in milliseconds. */
  private readonly heartbeatInterval = 30_000;

  // -- Subscription state --

  /** Map of CometBFT query -> set of raw callbacks. */
  private subscriptions: Map<string, Set<(data: any) => void>> = new Map();

  /** Set of generic event listeners. */
  private eventListeners: Set<EventCallback> = new Set();

  /** Resolve function for the connect() promise. */
  private connectResolve: (() => void) | null = null;

  /** Reject function for the connect() promise. */
  private connectReject: ((err: Error) => void) | null = null;

  /**
   * Create a new ClawWebSocket instance.
   *
   * @param url - CometBFT WebSocket endpoint (default: "ws://localhost:26657/websocket").
   */
  constructor(url: string = "ws://localhost:26657/websocket") {
    this.url = url;
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  /**
   * Open the WebSocket connection.
   *
   * Returns a promise that resolves once the connection is established,
   * or rejects if the initial connection fails.
   */
  connect(): Promise<void> {
    if (this.state === "connected") return Promise.resolve();
    if (this.state === "connecting") {
      return new Promise((resolve, reject) => {
        this.connectResolve = resolve;
        this.connectReject = reject;
      });
    }

    this.intentionalDisconnect = false;
    this.state = "connecting";

    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.openSocket();
    });
  }

  /**
   * Close the WebSocket connection and stop all reconnection attempts.
   * All subscriptions are preserved so they can be re-activated on a
   * subsequent `connect()` call.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cleanup();
    this.state = "disconnected";
  }

  /** Get the current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  // -----------------------------------------------------------------------
  // Typed subscription methods
  // -----------------------------------------------------------------------

  /**
   * Subscribe to new transactions, optionally filtered by type, sender,
   * or recipient.
   *
   * @param filterOrCallback - Either a TxFilter or a callback if no filter is needed.
   * @param callbackArg - Callback when a TxFilter is provided as the first argument.
   * @returns A function that removes this subscription when called.
   */
  subscribeTx(callback: (tx: StreamTxEvent) => void): () => void;
  subscribeTx(filter: TxFilter, callback: (tx: StreamTxEvent) => void): () => void;
  subscribeTx(
    filterOrCallback: TxFilter | ((tx: StreamTxEvent) => void),
    callbackArg?: (tx: StreamTxEvent) => void,
  ): () => void {
    const filter: TxFilter | undefined =
      typeof filterOrCallback === "function" ? undefined : filterOrCallback;
    const callback: (tx: StreamTxEvent) => void =
      typeof filterOrCallback === "function" ? filterOrCallback : callbackArg!;

    const query = "tm.event='Tx'";

    const wrapper = (data: any) => {
      const parsed = this.parseTxEvent(data);
      if (!parsed) return;

      // Apply filters
      if (filter?.type && parsed.msgType !== filter.type) return;
      if (filter?.sender && parsed.sender !== filter.sender) return;
      if (filter?.recipient && parsed.recipient !== filter.recipient) return;

      callback(parsed);
      this.emitEvent({ kind: "tx", data: parsed });
    };

    return this.addSubscription(query, wrapper);
  }

  /**
   * Subscribe to new blocks, emitting parsed block headers.
   *
   * @param callback - Called for each new block.
   * @returns A function that removes this subscription when called.
   */
  subscribeBlocks(callback: (block: BlockEvent) => void): () => void {
    const query = "tm.event='NewBlock'";

    const wrapper = (data: any) => {
      const parsed = this.parseBlockEvent(data);
      if (!parsed) return;

      callback(parsed);
      this.emitEvent({ kind: "block", data: parsed });
    };

    return this.addSubscription(query, wrapper);
  }

  /**
   * Subscribe to agent module events (register, deregister, heartbeat,
   * task delegation, task acceptance, task completion, agent action).
   *
   * @param callback - Called for each agent event.
   * @returns A function that removes this subscription when called.
   */
  subscribeAgentEvents(callback: (event: AgentEvent) => void): () => void {
    const query = "tm.event='Tx'";

    const wrapper = (data: any) => {
      const events = this.parseRawEvents(data);
      const height = this.extractHeight(data);

      for (const ev of events) {
        // Match agent module events by checking the message.action attribute
        // or the event type itself
        const action = this.extractAttribute(ev, "action") ?? ev.type;
        if (!AGENT_ACTIONS.has(action) && !ev.type.startsWith("clawchain.agent")) continue;

        const agentEvent: AgentEvent = {
          action: action.replace(/^(clawchain\.agent\.v1\.)/, ""),
          agentAddress: this.extractAttribute(ev, "creator") ??
            this.extractAttribute(ev, "agent_address") ??
            this.extractAttribute(ev, "sender") ??
            "",
          height,
          attributes: this.attributesToRecord(ev.attributes),
        };

        callback(agentEvent);
        this.emitEvent({ kind: "agent", data: agentEvent });
      }
    };

    return this.addSubscription(query, wrapper);
  }

  /**
   * Subscribe to DEX swap events, optionally filtered by pool address.
   *
   * @param poolAddressOrCallback - Pool address to filter, or callback if no filter.
   * @param callbackArg - Callback when a pool address is provided.
   * @returns A function that removes this subscription when called.
   */
  subscribeDexSwaps(callback: (event: DexSwapEvent) => void): () => void;
  subscribeDexSwaps(poolAddress: string, callback: (event: DexSwapEvent) => void): () => void;
  subscribeDexSwaps(
    poolAddressOrCallback: string | ((event: DexSwapEvent) => void),
    callbackArg?: (event: DexSwapEvent) => void,
  ): () => void {
    const poolAddress: string | undefined =
      typeof poolAddressOrCallback === "string" ? poolAddressOrCallback : undefined;
    const callback: (event: DexSwapEvent) => void =
      typeof poolAddressOrCallback === "function" ? poolAddressOrCallback : callbackArg!;

    const query = "tm.event='Tx'";

    const wrapper = (data: any) => {
      const events = this.parseRawEvents(data);
      const height = this.extractHeight(data);

      for (const ev of events) {
        // CosmWasm DEX swaps emit a "wasm" event with action="swap"
        if (ev.type !== "wasm" && ev.type !== "swap") continue;
        const action = this.extractAttribute(ev, "action");
        if (ev.type === "wasm" && action !== "swap") continue;

        const contractAddr = this.extractAttribute(ev, "_contract_address") ??
          this.extractAttribute(ev, "contract_address") ?? "";

        // Apply pool address filter
        if (poolAddress && contractAddr !== poolAddress) continue;

        const swapEvent: DexSwapEvent = {
          poolAddress: contractAddr,
          sender: this.extractAttribute(ev, "sender") ?? "",
          offerAsset: this.extractAttribute(ev, "offer_asset") ?? "",
          offerAmount: this.extractAttribute(ev, "offer_amount") ?? "0",
          returnAsset: this.extractAttribute(ev, "return_asset") ??
            this.extractAttribute(ev, "ask_asset") ?? "",
          returnAmount: this.extractAttribute(ev, "return_amount") ?? "0",
          spreadAmount: this.extractAttribute(ev, "spread_amount") ?? "0",
          commissionAmount: this.extractAttribute(ev, "commission_amount") ?? "0",
          height,
        };

        callback(swapEvent);
        this.emitEvent({ kind: "dex_swap", data: swapEvent });
      }
    };

    return this.addSubscription(query, wrapper);
  }

  /**
   * Subscribe to privacy module events (shield, unshield, private transfer).
   *
   * @param callback - Called for each privacy event.
   * @returns A function that removes this subscription when called.
   */
  subscribePrivacyEvents(callback: (event: PrivacyEvent) => void): () => void {
    const query = "tm.event='Tx'";

    const wrapper = (data: any) => {
      const events = this.parseRawEvents(data);
      const height = this.extractHeight(data);

      for (const ev of events) {
        const action = this.extractAttribute(ev, "action") ?? ev.type;
        if (!PRIVACY_ACTIONS.has(action) && !ev.type.startsWith("clawchain.privacy")) continue;

        const privacyEvent: PrivacyEvent = {
          action: action.replace(/^(clawchain\.privacy\.v1\.)/, ""),
          sender: this.extractAttribute(ev, "creator") ??
            this.extractAttribute(ev, "sender") ?? "",
          amount: this.extractAttribute(ev, "amount") ?? "0",
          height,
          attributes: this.attributesToRecord(ev.attributes),
        };

        callback(privacyEvent);
        this.emitEvent({ kind: "privacy", data: privacyEvent });
      }
    };

    return this.addSubscription(query, wrapper);
  }

  // -----------------------------------------------------------------------
  // Generic event emitter
  // -----------------------------------------------------------------------

  /**
   * Register a listener for all typed ClawChain events.
   *
   * @param callback - Called with every parsed event from any subscription.
   * @returns A function that removes this listener when called.
   */
  onEvent(callback: EventCallback): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  /**
   * Remove a previously registered event listener.
   *
   * @param callback - The exact callback reference passed to `onEvent`.
   */
  removeListener(callback: EventCallback): void {
    this.eventListeners.delete(callback);
  }

  /** Remove all event listeners and subscriptions. */
  removeAllListeners(): void {
    this.eventListeners.clear();
    this.subscriptions.clear();
  }

  // -----------------------------------------------------------------------
  // Internal: WebSocket management
  // -----------------------------------------------------------------------

  /** Open the raw WebSocket and wire up handlers. */
  private openSocket(): void {
    try {
      const ws = new WebSocket(this.url);

      ws.onopen = () => {
        this.ws = ws;
        this.state = "connected";
        this.reconnectAttempt = 0;

        // Start heartbeat
        this.startHeartbeat();

        // Re-subscribe all existing subscriptions after (re)connect
        for (const query of this.subscriptions.keys()) {
          this.sendSubscribe(query);
        }

        // Resolve the connect() promise
        if (this.connectResolve) {
          this.connectResolve();
          this.connectResolve = null;
          this.connectReject = null;
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event);
      };

      ws.onclose = () => {
        this.ws = null;
        this.stopHeartbeat();

        if (this.state === "connecting" && this.connectReject) {
          this.connectReject(new Error("WebSocket connection failed"));
          this.connectResolve = null;
          this.connectReject = null;
        }

        this.state = "disconnected";

        if (!this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so reconnection is handled there.
      };
    } catch (err) {
      this.state = "disconnected";
      if (this.connectReject) {
        this.connectReject(err instanceof Error ? err : new Error(String(err)));
        this.connectResolve = null;
        this.connectReject = null;
      }
    }
  }

  /** Handle an incoming WebSocket message. */
  private handleMessage(event: MessageEvent): void {
    try {
      const msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

      // Ignore pong responses and subscription acknowledgements
      if (!msg?.result?.data) return;

      const eventType: string = msg.result.data?.type ?? "";
      const eventValue: unknown = msg.result.data?.value ?? {};

      // Dispatch to all matching subscriptions
      for (const [query, callbacks] of this.subscriptions.entries()) {
        if (this.eventMatchesQuery(eventType, query)) {
          for (const cb of callbacks) {
            try {
              cb({ type: eventType, value: eventValue, raw: msg });
            } catch {
              // Ignore callback errors to prevent one bad listener from
              // breaking all others.
            }
          }
        }
      }
    } catch {
      // Ignore parse errors on malformed messages.
    }
  }

  /** Check if a CometBFT event type matches a subscription query. */
  private eventMatchesQuery(eventType: string, query: string): boolean {
    if (query.includes("NewBlock") && eventType.includes("new_block")) return true;
    if (query.includes("Tx") && eventType.includes("tx")) return true;
    // Default: deliver — finer filtering is done in the typed callbacks
    return true;
  }

  /** Send a JSONRPC subscribe message over the WebSocket. */
  private sendSubscribe(query: string): void {
    if (!this.ws || this.ws.readyState !== 1 /* OPEN */) return;
    this.requestId++;
    const msg = {
      jsonrpc: "2.0",
      method: "subscribe",
      id: this.requestId,
      params: { query },
    };
    this.ws.send(JSON.stringify(msg));
  }

  /** Add a callback for a CometBFT subscription query. */
  private addSubscription(query: string, callback: (data: any) => void): () => void {
    if (!this.subscriptions.has(query)) {
      this.subscriptions.set(query, new Set());
    }
    this.subscriptions.get(query)!.add(callback);

    // If already connected, subscribe immediately
    this.sendSubscribe(query);

    return () => {
      const callbacks = this.subscriptions.get(query);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(query);
        }
      }
    };
  }

  // -----------------------------------------------------------------------
  // Internal: Reconnection
  // -----------------------------------------------------------------------

  /** Schedule a reconnection with exponential backoff (1s, 2s, 4s, ..., max 30s). */
  private scheduleReconnect(): void {
    if (this.subscriptions.size === 0 && this.eventListeners.size === 0) return;

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempt),
      this.maxReconnectDelay,
    );
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.state = "connecting";
      this.openSocket();
    }, delay);
  }

  // -----------------------------------------------------------------------
  // Internal: Heartbeat
  // -----------------------------------------------------------------------

  /** Start the heartbeat ping interval (every 30s). */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1 /* OPEN */) {
        // Send a JSON-RPC health check; CometBFT responds to "health" method
        this.requestId++;
        const ping = {
          jsonrpc: "2.0",
          method: "health",
          id: this.requestId,
          params: {},
        };
        this.ws.send(JSON.stringify(ping));
      }
    }, this.heartbeatInterval);
  }

  /** Stop the heartbeat interval. */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: Cleanup
  // -----------------------------------------------------------------------

  /** Close the WebSocket and cancel any pending timers. */
  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors.
      }
      this.ws = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal: CometBFT event parsing helpers
  // -----------------------------------------------------------------------

  /** Emit a typed event to all generic listeners. */
  private emitEvent(event: ClawChainEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors.
      }
    }
  }

  /** Parse a raw WebSocket data payload into a StreamTxEvent, or null if unparseable. */
  private parseTxEvent(data: any): StreamTxEvent | null {
    const txResult = data.value?.TxResult ?? data.value?.tx_result ?? data.value ?? {};
    const result = txResult.result ?? {};

    const events = this.parseEventsArray(result.events);

    let sender = "";
    let recipient = "";
    let msgType = "";

    for (const ev of events) {
      for (const attr of ev.attributes) {
        if (attr.key === "sender" && !sender) sender = attr.value;
        if (attr.key === "recipient" && !recipient) recipient = attr.value;
        if (attr.key === "action" && !msgType) msgType = attr.value;
      }
    }

    return {
      hash: txResult.hash ?? "",
      height: parseInt(txResult.height ?? "0", 10),
      code: result.code ?? 0,
      sender,
      recipient,
      msgType,
      events,
    };
  }

  /** Parse a raw WebSocket data payload into a BlockEvent, or null if unparseable. */
  private parseBlockEvent(data: any): BlockEvent | null {
    const block = data.value?.block ?? data.value?.data?.value?.block ?? {};
    const header = block.header ?? {};

    return {
      height: parseInt(header.height ?? "0", 10),
      hash: data.value?.block_id?.hash ?? header.app_hash ?? "",
      time: header.time ?? "",
      numTxs: parseInt(header.num_txs ?? block.data?.txs?.length ?? "0", 10),
      proposer: header.proposer_address ?? "",
      chainId: header.chain_id ?? "",
    };
  }

  /** Extract raw events from a CometBFT transaction result payload. */
  private parseRawEvents(
    data: any,
  ): Array<{ type: string; attributes: Array<{ key: string; value: string }> }> {
    const txResult = data.value?.TxResult ?? data.value?.tx_result ?? data.value ?? {};
    const result = txResult.result ?? {};
    return this.parseEventsArray(result.events);
  }

  /** Extract the block height from a CometBFT transaction result payload. */
  private extractHeight(data: any): number {
    const txResult = data.value?.TxResult ?? data.value?.tx_result ?? data.value ?? {};
    return parseInt(txResult.height ?? "0", 10);
  }

  /** Normalize a raw events array into typed objects. */
  private parseEventsArray(
    rawEvents: any[] | undefined,
  ): Array<{ type: string; attributes: Array<{ key: string; value: string }> }> {
    if (!Array.isArray(rawEvents)) return [];
    return rawEvents.map((e: any) => ({
      type: e.type ?? "",
      attributes: Array.isArray(e.attributes)
        ? e.attributes.map((a: any) => ({
            key: typeof a.key === "string" ? a.key : "",
            value: typeof a.value === "string" ? a.value : "",
          }))
        : [],
    }));
  }

  /** Extract a single attribute value from an event by key. */
  private extractAttribute(
    event: { attributes: Array<{ key: string; value: string }> },
    key: string,
  ): string | undefined {
    for (const attr of event.attributes) {
      if (attr.key === key) return attr.value;
    }
    return undefined;
  }

  /** Convert an event's attributes array to a Record. */
  private attributesToRecord(
    attributes: Array<{ key: string; value: string }>,
  ): Record<string, string> {
    const record: Record<string, string> = {};
    for (const attr of attributes) {
      if (attr.key) record[attr.key] = attr.value;
    }
    return record;
  }
}
