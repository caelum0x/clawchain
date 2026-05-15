import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChainEvents } from "../useChainEvents";

// ---------------------------------------------------------------------------
// Minimal WebSocket mock
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;

  url: string;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Store instance for test access
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // --- Helpers for tests ---

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }

  simulateError() {
    this.onerror?.({});
  }

  // Class-level tracking
  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
}

// Install into globalThis
const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.reset();
  (globalThis as any).WebSocket = MockWebSocket as any;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  (globalThis as any).WebSocket = originalWebSocket;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useChainEvents", () => {
  it("returns connected=false initially", () => {
    const { result } = renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657" }),
    );

    expect(result.current.connected).toBe(false);
    expect(result.current.lastEvent).toBeNull();
  });

  it("sets connected=true when WebSocket opens", () => {
    const { result } = renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657" }),
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it("sends a subscription message on open", () => {
    renderHook(() => useChainEvents({ rpcUrl: "localhost:26657" }));

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateOpen();
    });

    expect(ws.sentMessages).toHaveLength(1);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.method).toBe("subscribe");
    expect(msg.params.query).toBe("tm.event='Tx'");
  });

  it("calls onEvent when a valid chain event arrives", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useChainEvents({
        rpcUrl: "localhost:26657",
        onEvent,
      }),
    );

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        result: {
          data: {
            value: {
              TxResult: {
                height: "100",
                result: {
                  events: [
                    {
                      type: "delegate_task",
                      attributes: [
                        { key: "task_id", value: "42" },
                        { key: "assignee", value: "claw1abc" },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    const event = onEvent.mock.calls[0][0];
    expect(event.type).toBe("delegate_task");
    expect(event.height).toBe(100);
    expect(event.attributes.task_id).toBe("42");
    expect(event.attributes.assignee).toBe("claw1abc");
  });

  it("filters events by eventTypes when provided", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useChainEvents({
        rpcUrl: "localhost:26657",
        eventTypes: ["shield"],
        onEvent,
      }),
    );

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    // Send an event that does NOT match the filter
    act(() => {
      ws.simulateMessage({
        result: {
          data: {
            value: {
              TxResult: {
                height: "50",
                result: {
                  events: [{ type: "delegate_task", attributes: [] }],
                },
              },
            },
          },
        },
      });
    });

    expect(onEvent).not.toHaveBeenCalled();

    // Send an event that DOES match the filter
    act(() => {
      ws.simulateMessage({
        result: {
          data: {
            value: {
              TxResult: {
                height: "51",
                result: {
                  events: [{ type: "shield", attributes: [] }],
                },
              },
            },
          },
        },
      });
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].type).toBe("shield");
  });

  it("updates lastEvent on incoming events", () => {
    const { result } = renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657" }),
    );

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => {
      ws.simulateMessage({
        result: {
          data: {
            value: {
              TxResult: {
                height: "200",
                result: {
                  events: [{ type: "complete_task", attributes: [] }],
                },
              },
            },
          },
        },
      });
    });

    expect(result.current.lastEvent).not.toBeNull();
    expect(result.current.lastEvent!.type).toBe("complete_task");
    expect(result.current.lastEvent!.height).toBe(200);
  });

  it("sets connected=false when WebSocket closes", () => {
    const { result } = renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657" }),
    );

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());
    expect(result.current.connected).toBe(true);

    act(() => ws.simulateClose());
    expect(result.current.connected).toBe(false);
  });

  it("disconnects on unmount", () => {
    const { unmount } = renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657" }),
    );

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    unmount();

    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it("does not connect when enabled=false", () => {
    renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657", enabled: false }),
    );

    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("cleans up when enabled changes to false", () => {
    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useChainEvents({ rpcUrl: "localhost:26657", enabled }),
      { initialProps: { enabled: true } },
    );

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());
    expect(result.current.connected).toBe(true);

    rerender({ enabled: false });
    expect(result.current.connected).toBe(false);
  });

  it("ignores malformed JSON messages gracefully", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657", onEvent }),
    );

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    // Send raw non-JSON string
    act(() => {
      ws.onmessage?.({ data: "not-json" });
    });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores messages without TxResult", () => {
    const onEvent = vi.fn();
    renderHook(() =>
      useChainEvents({ rpcUrl: "localhost:26657", onEvent }),
    );

    const ws = MockWebSocket.instances[0];
    act(() => ws.simulateOpen());

    act(() => {
      ws.simulateMessage({ result: { data: {} } });
    });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("builds correct WebSocket URL from http:// RPC", () => {
    renderHook(() =>
      useChainEvents({ rpcUrl: "http://mynode:26657" }),
    );

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe("ws://mynode:26657/websocket");
  });

  it("builds correct WebSocket URL from https:// RPC", () => {
    renderHook(() =>
      useChainEvents({ rpcUrl: "https://mynode:26657" }),
    );

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe("wss://mynode:26657/websocket");
  });

  it("builds correct WebSocket URL from bare host:port", () => {
    renderHook(() =>
      useChainEvents({ rpcUrl: "mynode:26657" }),
    );

    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe("ws://mynode:26657/websocket");
  });
});
