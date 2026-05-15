import { useEffect, useRef, useCallback, useState } from "react";
import { chainConfig } from "../lib/config";

export interface ChainEvent {
  type: string;
  height: number;
  attributes: Record<string, string>;
}

interface UseChainEventsOptions {
  rpcUrl?: string;
  eventTypes?: string[];
  onEvent?: (event: ChainEvent) => void;
  enabled?: boolean;
}

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

/**
 * Hook that subscribes to CometBFT WebSocket transaction events and filters
 * them by event type. Auto-reconnects with exponential backoff on disconnect.
 */
export function useChainEvents(options: UseChainEventsOptions) {
  const {
    rpcUrl = chainConfig.rpcEndpoint.replace(/^https?:\/\//, ""),
    eventTypes = [],
    onEvent,
    enabled = true,
  } = options;

  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ChainEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const mountedRef = useRef(true);

  // Keep a stable ref for the callback so reconnects don't stale-close over it.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const eventTypesRef = useRef(eventTypes);
  eventTypesRef.current = eventTypes;

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    cleanup();

    // Build WebSocket URL from the RPC endpoint.
    let wsUrl: string;
    if (rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://")) {
      wsUrl = rpcUrl.replace(/\/?$/, "/websocket");
    } else if (rpcUrl.startsWith("http://")) {
      wsUrl = rpcUrl.replace("http://", "ws://").replace(/\/?$/, "/websocket");
    } else if (rpcUrl.startsWith("https://")) {
      wsUrl = rpcUrl.replace("https://", "wss://").replace(/\/?$/, "/websocket");
    } else {
      // Bare host:port
      wsUrl = `ws://${rpcUrl}/websocket`;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      reconnectAttempt.current = 0;

      // Subscribe to all Tx events — filtering happens client-side.
      const subMsg = {
        jsonrpc: "2.0",
        method: "subscribe",
        id: 1,
        params: { query: "tm.event='Tx'" },
      };
      ws.send(JSON.stringify(subMsg));
    };

    ws.onmessage = (msgEvent: MessageEvent) => {
      if (!mountedRef.current) return;

      let msg: any;
      try {
        msg = JSON.parse(msgEvent.data);
      } catch {
        return;
      }

      // CometBFT Tx event structure:
      // { result: { data: { value: { TxResult: { height, result: { events } } } } } }
      const txResult = msg?.result?.data?.value?.TxResult;
      if (!txResult || !txResult.height) return;

      const height = parseInt(txResult.height, 10) || 0;
      const events: any[] = txResult.result?.events ?? [];

      for (const event of events) {
        const eventType: string = event.type ?? "";

        // Filter by requested event types (empty list = accept all).
        const types = eventTypesRef.current;
        if (types.length > 0 && !types.includes(eventType)) continue;

        const attributes: Record<string, string> = {};
        for (const attr of event.attributes ?? []) {
          // CometBFT may base64-encode keys/values in some versions — try
          // decoding if the raw value looks like base64.
          const key = tryBase64Decode(attr.key ?? "");
          const value = tryBase64Decode(attr.value ?? "");
          attributes[key] = value;
        }

        const chainEvent: ChainEvent = { type: eventType, height, attributes };
        setLastEvent(chainEvent);
        onEventRef.current?.(chainEvent);
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror, which triggers reconnect.
    };
  }, [rpcUrl, cleanup]);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const attempt = reconnectAttempt.current;
    const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
    reconnectAttempt.current = attempt + 1;

    reconnectTimer.current = setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, delay);
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;

    if (enabled) {
      connect();
    } else {
      cleanup();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  return { connected, lastEvent };
}

/** Attempt to base64-decode a string; return original if it fails or looks plain. */
function tryBase64Decode(s: string): string {
  if (!s) return s;
  // Quick heuristic: if it already looks like a normal ASCII string, skip decoding.
  if (/^[\x20-\x7e]+$/.test(s) && !/^[A-Za-z0-9+/]+=*$/.test(s)) return s;
  try {
    const decoded = atob(s);
    // Only accept if the decoded result is printable.
    if (/^[\x20-\x7e]*$/.test(decoded) && decoded.length > 0) return decoded;
    return s;
  } catch {
    return s;
  }
}
