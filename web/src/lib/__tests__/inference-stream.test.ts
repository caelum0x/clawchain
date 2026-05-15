import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useInferenceStream } from "../inference-stream";

// ---------------------------------------------------------------------------
// Mock EventSource
// ---------------------------------------------------------------------------

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = MockEventSource.CONNECTING;
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  // --- Test helpers ---

  simulateOpen() {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.({});
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.onerror?.({});
  }

  static instances: MockEventSource[] = [];
  static reset() {
    MockEventSource.instances = [];
  }
}

const originalEventSource = globalThis.EventSource;

beforeEach(() => {
  MockEventSource.reset();
  (globalThis as any).EventSource = MockEventSource as any;
});

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as any).EventSource = originalEventSource;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useInferenceStream", () => {
  it("returns idle status when no jobId", () => {
    const { result } = renderHook(() => useInferenceStream(null));

    expect(result.current.status).toBe("idle");
    expect(result.current.tokens).toBe("");
    expect(result.current.txHash).toBe("");
    expect(result.current.tokensUsed).toBe(0);
    expect(result.current.error).toBe("");
    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.stop).toBe("function");
  });

  it("start() with null jobId does not create EventSource", () => {
    const { result } = renderHook(() => useInferenceStream(null));

    act(() => {
      result.current.start();
    });

    expect(MockEventSource.instances).toHaveLength(0);
    expect(result.current.status).toBe("idle");
  });

  it("start() creates EventSource and sets status to connecting", () => {
    const { result } = renderHook(() => useInferenceStream("job-42"));

    act(() => {
      result.current.start();
    });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("/stream/job-42");
    expect(result.current.status).toBe("connecting");
  });

  it("sets status to streaming on open", () => {
    const { result } = renderHook(() => useInferenceStream("job-1"));

    act(() => {
      result.current.start();
    });

    const es = MockEventSource.instances[0];
    act(() => {
      es.simulateOpen();
    });

    expect(result.current.status).toBe("streaming");
  });

  it("accumulates partial tokens", () => {
    const { result } = renderHook(() => useInferenceStream("job-1"));

    act(() => {
      result.current.start();
    });

    const es = MockEventSource.instances[0];
    act(() => es.simulateOpen());

    act(() => {
      es.simulateMessage({ type: "partial", data: "Hello" });
    });

    act(() => {
      es.simulateMessage({ type: "partial", data: " World" });
    });

    expect(result.current.tokens).toBe("Hello World");
    expect(result.current.status).toBe("streaming");
  });

  it("handles complete event with tx_hash and tokens_used", () => {
    const { result } = renderHook(() => useInferenceStream("job-2"));

    act(() => {
      result.current.start();
    });

    const es = MockEventSource.instances[0];
    act(() => es.simulateOpen());

    act(() => {
      es.simulateMessage({
        type: "complete",
        data: "Final output",
        tx_hash: "ABCDEF123456",
        tokens_used: 42,
      });
    });

    expect(result.current.status).toBe("complete");
    expect(result.current.tokens).toBe("Final output");
    expect(result.current.txHash).toBe("ABCDEF123456");
    expect(result.current.tokensUsed).toBe(42);
    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it("handles error event from stream", () => {
    const { result } = renderHook(() => useInferenceStream("job-3"));

    act(() => {
      result.current.start();
    });

    const es = MockEventSource.instances[0];
    act(() => es.simulateOpen());

    act(() => {
      es.simulateMessage({ type: "error", data: "Model overloaded" });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Model overloaded");
    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it("handles connection error (onerror)", () => {
    const { result } = renderHook(() => useInferenceStream("job-4"));

    act(() => {
      result.current.start();
    });

    const es = MockEventSource.instances[0];
    // Simulate onerror while still CONNECTING (not CLOSED)
    es.readyState = MockEventSource.OPEN;
    act(() => {
      es.simulateError();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("Connection to inference sidecar lost");
  });

  it("stop() closes the EventSource", () => {
    const { result } = renderHook(() => useInferenceStream("job-5"));

    act(() => {
      result.current.start();
    });

    const es = MockEventSource.instances[0];

    act(() => {
      result.current.stop();
    });

    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it("cleans up EventSource on unmount", () => {
    const { result, unmount } = renderHook(() => useInferenceStream("job-6"));

    act(() => {
      result.current.start();
    });

    const es = MockEventSource.instances[0];

    unmount();

    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it("resets state when start() is called again", () => {
    const { result } = renderHook(() => useInferenceStream("job-7"));

    // First run
    act(() => {
      result.current.start();
    });

    const es1 = MockEventSource.instances[0];
    act(() => es1.simulateOpen());
    act(() => {
      es1.simulateMessage({ type: "partial", data: "first" });
    });

    expect(result.current.tokens).toBe("first");

    // Second start resets
    act(() => {
      result.current.start();
    });

    expect(result.current.tokens).toBe("");
    expect(result.current.status).toBe("connecting");
  });
});
