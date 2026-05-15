/**
 * Tests for CLI output formatting utilities.
 */
import { describe, it, expect } from "vitest";
import { table, formatClaw, shortAddr, formatTime, truncate } from "../format.js";

// ---------------------------------------------------------------------------
// table()
// ---------------------------------------------------------------------------

describe("table", () => {
  it("renders headers and rows with aligned columns", () => {
    const out = table(["Name", "Value"], [["alpha", "100"], ["beta", "2"]]);
    const lines = out.split("\n");
    // Header row, separator, two data rows
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Value");
    // Separator is dashes and plus signs
    expect(lines[1]).toMatch(/^[-+]+$/);
    expect(lines[2]).toContain("alpha");
    expect(lines[2]).toContain("100");
    expect(lines[3]).toContain("beta");
    expect(lines[3]).toContain("2");
  });

  it("returns just joined headers when rows are empty", () => {
    const out = table(["A", "B", "C"], []);
    expect(out).toBe("A  B  C");
  });

  it("pads columns to the widest cell", () => {
    const out = table(["ID", "Description"], [["1", "short"], ["2", "a much longer description"]]);
    const lines = out.split("\n");
    // All data rows should have the same length
    expect(lines[2].length).toBe(lines[3].length);
  });

  it("handles missing cells gracefully", () => {
    // Row with fewer cells than headers
    const out = table(["A", "B", "C"], [["x"]]);
    const lines = out.split("\n");
    expect(lines).toHaveLength(3); // header + separator + 1 row
    expect(lines[2]).toContain("x");
  });

  it("handles single column", () => {
    const out = table(["Only"], [["first"], ["second"]]);
    expect(out).toContain("Only");
    expect(out).toContain("first");
    expect(out).toContain("second");
  });
});

// ---------------------------------------------------------------------------
// formatClaw()
// ---------------------------------------------------------------------------

describe("formatClaw", () => {
  it("formats whole CLAW amounts", () => {
    expect(formatClaw("1000000")).toBe("1 CLAW");
    expect(formatClaw("5000000")).toBe("5 CLAW");
  });

  it("formats fractional CLAW amounts", () => {
    expect(formatClaw("1500000")).toBe("1.5 CLAW");
    expect(formatClaw("1234567")).toBe("1.234567 CLAW");
  });

  it("strips trailing zeros from fractions", () => {
    expect(formatClaw("1100000")).toBe("1.1 CLAW");
    expect(formatClaw("2010000")).toBe("2.01 CLAW");
  });

  it("handles zero", () => {
    expect(formatClaw("0")).toBe("0 CLAW");
  });

  it("handles empty string", () => {
    expect(formatClaw("")).toBe("0 CLAW");
  });

  it("handles large amounts", () => {
    expect(formatClaw("1000000000000")).toBe("1000000 CLAW");
  });

  it("handles amounts less than 1 CLAW", () => {
    expect(formatClaw("500000")).toBe("0.5 CLAW");
    expect(formatClaw("1")).toBe("0.000001 CLAW");
  });
});

// ---------------------------------------------------------------------------
// shortAddr()
// ---------------------------------------------------------------------------

describe("shortAddr", () => {
  it("truncates long addresses", () => {
    const addr = "claw1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu";
    const short = shortAddr(addr);
    expect(short).toBe("claw1qypqx...zv7xu");
    expect(short.length).toBeLessThan(addr.length);
  });

  it("returns short addresses unchanged", () => {
    const addr = "claw1short";
    expect(shortAddr(addr)).toBe(addr);
  });

  it("returns addresses at the boundary unchanged", () => {
    // 15 characters exactly
    const addr = "abcdefghijklmno";
    expect(shortAddr(addr)).toBe(addr);
  });

  it("truncates addresses longer than 15 characters", () => {
    const addr = "abcdefghijklmnop"; // 16 chars
    const short = shortAddr(addr);
    expect(short).toContain("...");
    expect(short.startsWith("abcdefghij")).toBe(true);
    expect(short.endsWith("lmnop")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatTime()
// ---------------------------------------------------------------------------

describe("formatTime", () => {
  it("returns dash for zero timestamp", () => {
    expect(formatTime(0)).toBe("-");
  });

  it("handles unix seconds", () => {
    // 2024-01-01T00:00:00Z = 1704067200
    const result = formatTime(1704067200);
    expect(result).toBe("2024-01-01T00:00:00.000Z");
  });

  it("handles unix milliseconds", () => {
    const result = formatTime(1704067200000);
    expect(result).toBe("2024-01-01T00:00:00.000Z");
  });

  it("distinguishes seconds from milliseconds at the boundary", () => {
    // Values < 1e12 are treated as seconds
    const asSeconds = formatTime(999999999999); // just under 1e12
    expect(asSeconds).toContain("T");
    // Values >= 1e12 are treated as milliseconds
    const asMs = formatTime(1000000000000); // exactly 1e12
    expect(asMs).toContain("T");
  });
});

// ---------------------------------------------------------------------------
// truncate()
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns strings at maxLen unchanged", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("handles maxLen of 3 (minimum for ellipsis)", () => {
    expect(truncate("abcdef", 3)).toBe("...");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});
