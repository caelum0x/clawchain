import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import useTheme from "../useTheme";

const STORAGE_KEY = "clawchain-theme";

// jsdom does not provide matchMedia — set up a polyfill for all tests.
function installMatchMedia(matches = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    installMatchMedia(false); // prefers dark
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns theme and toggleTheme", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current).toHaveProperty("theme");
    expect(result.current).toHaveProperty("toggleTheme");
    expect(typeof result.current.toggleTheme).toBe("function");
  });

  it("defaults to dark theme when no preference saved", () => {
    installMatchMedia(false); // prefers dark

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("dark");
  });

  it("toggles between dark and light", () => {
    const { result } = renderHook(() => useTheme());

    const initialTheme = result.current.theme;

    act(() => {
      result.current.toggleTheme();
    });

    const toggledTheme = result.current.theme;
    expect(toggledTheme).not.toBe(initialTheme);

    // Toggle back
    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe(initialTheme);
  });

  it("persists to localStorage on toggle", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    const storedValue = localStorage.getItem(STORAGE_KEY);
    expect(storedValue).toBeTruthy();
    expect(["dark", "light"]).toContain(storedValue);
    expect(storedValue).toBe(result.current.theme);
  });

  it("reads persisted theme from localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "light");

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe("light");
  });

  it("applies data-theme attribute to documentElement for light mode", () => {
    localStorage.setItem(STORAGE_KEY, "light");

    renderHook(() => useTheme());

    expect(
      document.documentElement.getAttribute("data-theme"),
    ).toBe("light");
  });

  it("removes data-theme attribute for dark mode", () => {
    localStorage.setItem(STORAGE_KEY, "dark");

    renderHook(() => useTheme());

    expect(
      document.documentElement.getAttribute("data-theme"),
    ).toBeNull();
  });
});
