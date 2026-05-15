import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToastProvider, useToast } from "../useToast";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws if used outside ToastProvider", () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useToast());
    }).toThrow("useToast must be used within a ToastProvider");
    spy.mockRestore();
  });

  it("addToast creates a toast with unique ID", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id1: string;
    let id2: string;

    act(() => {
      id1 = result.current.addToast({ type: "success", title: "First" });
      id2 = result.current.addToast({ type: "info", title: "Second" });
    });

    expect(id1!).toBeTruthy();
    expect(id2!).toBeTruthy();
    expect(id1!).not.toBe(id2!);
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0].title).toBe("First");
    expect(result.current.toasts[1].title).toBe("Second");
  });

  it("removeToast removes the toast", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id: string;
    act(() => {
      id = result.current.addToast({ type: "success", title: "Test", duration: 0 });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      result.current.removeToast(id!);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it("updateToast changes toast properties", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id: string;
    act(() => {
      id = result.current.addToast({ type: "loading", title: "Loading..." });
    });

    expect(result.current.toasts[0].type).toBe("loading");
    expect(result.current.toasts[0].title).toBe("Loading...");

    act(() => {
      result.current.updateToast(id!, {
        type: "success",
        title: "Done!",
        message: "Completed successfully",
        txHash: "ABC123",
      });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe("success");
    expect(result.current.toasts[0].title).toBe("Done!");
    expect(result.current.toasts[0].message).toBe("Completed successfully");
    expect(result.current.toasts[0].txHash).toBe("ABC123");
    // ID stays the same
    expect(result.current.toasts[0].id).toBe(id!);
  });

  it("auto-dismiss after duration", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.addToast({ type: "success", title: "Quick", duration: 2000 });
    });

    expect(result.current.toasts).toHaveLength(1);

    // Not dismissed yet at 1999ms
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.toasts).toHaveLength(1);

    // Dismissed at 2000ms
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("uses default 5000ms duration for non-loading toasts", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.addToast({ type: "info", title: "Default duration" });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("loading toasts don't auto-dismiss", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.addToast({ type: "loading", title: "Processing..." });
    });

    expect(result.current.toasts).toHaveLength(1);

    // Even after a long time, still there
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe("loading");
  });

  it("loading toast auto-dismisses after update to non-loading type", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id: string;
    act(() => {
      id = result.current.addToast({ type: "loading", title: "Loading..." });
    });

    // Update from loading to success
    act(() => {
      result.current.updateToast(id!, { type: "success", title: "Done!" });
    });

    expect(result.current.toasts).toHaveLength(1);

    // Should now auto-dismiss after default 5000ms
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("max 5 toasts limit — oldest dismissed when limit hit", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      for (let i = 1; i <= 6; i++) {
        result.current.addToast({ type: "info", title: `Toast ${i}`, duration: 0 });
      }
    });

    expect(result.current.toasts).toHaveLength(5);
    // The first toast should have been removed, keeping toasts 2-6
    expect(result.current.toasts[0].title).toBe("Toast 2");
    expect(result.current.toasts[4].title).toBe("Toast 6");
  });

  it("duration 0 prevents auto-dismiss", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.addToast({ type: "success", title: "Permanent", duration: 0 });
    });

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current.toasts).toHaveLength(1);
  });

  it("addToast returns a string ID", () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    let id: string;
    act(() => {
      id = result.current.addToast({ type: "success", title: "Test" });
    });

    expect(typeof id!).toBe("string");
    expect(id!.length).toBeGreaterThan(0);
  });
});
