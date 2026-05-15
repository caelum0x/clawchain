import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useCopyClipboard from "../useCopyClipboard";

describe("useCopyClipboard", () => {
  beforeEach(() => {
    const mockClipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });
  });

  it("starts with copied=false", () => {
    const { result } = renderHook(() => useCopyClipboard());
    expect(result.current[0]).toBe(false);
  });

  it("sets copied=true after copying", async () => {
    const { result } = renderHook(() => useCopyClipboard());
    await act(async () => {
      result.current[1]("hello");
    });
    expect(result.current[0]).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });

  it("resets copied after timeout", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyClipboard(500));

    await act(async () => {
      result.current[1]("test");
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current[0]).toBe(false);

    vi.useRealTimers();
  });

  it("handles clipboard write failure gracefully", async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("denied"),
    );
    const { result } = renderHook(() => useCopyClipboard());

    await act(async () => {
      result.current[1]("test");
    });
    // Should not throw, copied stays false
    expect(result.current[0]).toBe(false);
  });
});
