import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationPrefs } from "../useNotificationPrefs";

describe("useNotificationPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns all-true defaults when no localStorage", () => {
    const { result } = renderHook(() => useNotificationPrefs());
    expect(result.current.prefs).toEqual({
      task: true,
      message: true,
      gpu: true,
      privacy: true,
      transaction: true,
      governance: true,
      validator: true,
      staking: true,
    });
  });

  it("toggleCategory flips a category and persists", () => {
    const { result } = renderHook(() => useNotificationPrefs());

    act(() => {
      result.current.toggleCategory("gpu");
    });

    expect(result.current.prefs.gpu).toBe(false);
    expect(result.current.prefs.task).toBe(true);

    const stored = JSON.parse(localStorage.getItem("claw-notification-prefs")!);
    expect(stored.gpu).toBe(false);
  });

  it("isEnabled returns correct value", () => {
    const { result } = renderHook(() => useNotificationPrefs());
    expect(result.current.isEnabled("task")).toBe(true);

    act(() => {
      result.current.toggleCategory("task");
    });

    expect(result.current.isEnabled("task")).toBe(false);
  });

  it("loads saved prefs from localStorage", () => {
    localStorage.setItem(
      "claw-notification-prefs",
      JSON.stringify({ task: false, message: true, gpu: false, privacy: true })
    );
    const { result } = renderHook(() => useNotificationPrefs());
    expect(result.current.prefs.task).toBe(false);
    expect(result.current.prefs.gpu).toBe(false);
    expect(result.current.prefs.message).toBe(true);
  });

  it("handles invalid JSON in localStorage gracefully", () => {
    localStorage.setItem("claw-notification-prefs", "not-json");
    const { result } = renderHook(() => useNotificationPrefs());
    expect(result.current.prefs).toEqual({
      task: true,
      message: true,
      gpu: true,
      privacy: true,
      transaction: true,
      governance: true,
      validator: true,
      staking: true,
    });
  });
});
