import { renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import useDocTitle from "../useDocTitle";

describe("useDocTitle", () => {
  beforeEach(() => {
    document.title = "ClawChain";
  });

  it("sets document.title to 'Title | ClawChain'", () => {
    renderHook(() => useDocTitle("Explorer"));
    expect(document.title).toBe("Explorer | ClawChain");
  });

  it("sets just 'ClawChain' when title is empty", () => {
    renderHook(() => useDocTitle(""));
    expect(document.title).toBe("ClawChain");
  });

  it("restores previous title on unmount", () => {
    document.title = "Original";
    const { unmount } = renderHook(() => useDocTitle("Test"));
    expect(document.title).toBe("Test | ClawChain");
    unmount();
    expect(document.title).toBe("Original");
  });

  it("updates when title prop changes", () => {
    const { rerender } = renderHook(({ title }) => useDocTitle(title), {
      initialProps: { title: "Page A" },
    });
    expect(document.title).toBe("Page A | ClawChain");
    rerender({ title: "Page B" });
    expect(document.title).toBe("Page B | ClawChain");
  });
});
