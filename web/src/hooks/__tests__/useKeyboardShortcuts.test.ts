import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import useKeyboardShortcuts, { KB_EVENTS } from "../useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches focus-search on Ctrl+K", () => {
    renderHook(() => useKeyboardShortcuts());
    const handler = vi.fn();
    window.addEventListener(KB_EVENTS.FOCUS_SEARCH, handler);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
    );

    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(KB_EVENTS.FOCUS_SEARCH, handler);
  });

  it("dispatches focus-search on Cmd+K (metaKey)", () => {
    renderHook(() => useKeyboardShortcuts());
    const handler = vi.fn();
    window.addEventListener(KB_EVENTS.FOCUS_SEARCH, handler);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );

    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(KB_EVENTS.FOCUS_SEARCH, handler);
  });

  it("dispatches escape on Escape key", () => {
    renderHook(() => useKeyboardShortcuts());
    const handler = vi.fn();
    window.addEventListener(KB_EVENTS.ESCAPE, handler);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );

    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(KB_EVENTS.ESCAPE, handler);
  });

  it("does not dispatch on regular keys", () => {
    renderHook(() => useKeyboardShortcuts());
    const focusHandler = vi.fn();
    const escapeHandler = vi.fn();
    window.addEventListener(KB_EVENTS.FOCUS_SEARCH, focusHandler);
    window.addEventListener(KB_EVENTS.ESCAPE, escapeHandler);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true })
    );

    expect(focusHandler).not.toHaveBeenCalled();
    expect(escapeHandler).not.toHaveBeenCalled();
    window.removeEventListener(KB_EVENTS.FOCUS_SEARCH, focusHandler);
    window.removeEventListener(KB_EVENTS.ESCAPE, escapeHandler);
  });

  it("cleans up listener on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    const handler = vi.fn();
    window.addEventListener(KB_EVENTS.ESCAPE, handler);

    unmount();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(KB_EVENTS.ESCAPE, handler);
  });
});
