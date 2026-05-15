/**
 * Tests for `clawd release-summary` — release evidence display.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockFileExists = false;
let mockFileContent = "";

vi.mock("node:fs", () => ({
  existsSync: () => mockFileExists,
}));

vi.mock("node:fs/promises", () => ({
  readFile: () => {
    if (!mockFileExists) return Promise.reject(new Error("not found"));
    return Promise.resolve(mockFileContent);
  },
}));

import { runReleaseSummary } from "../release-summary.js";

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  mockFileExists = false;
  mockFileContent = "";
});

// ---------------------------------------------------------------------------
// runReleaseSummary()
// ---------------------------------------------------------------------------

describe("runReleaseSummary", () => {
  it("throws when evidence file is missing", async () => {
    mockFileExists = false;

    await expect(runReleaseSummary()).rejects.toThrow("missing");
  });

  it("displays release evidence when file exists", async () => {
    mockFileExists = true;
    mockFileContent = JSON.stringify({
      generated_at_utc: "2026-03-07T00:00:00Z",
      overall_status: "passed",
      inputs: { manifest: "testnet/manifest.json", host: "node1.example.com" },
      gates: {
        unit_tests: "passed",
        integration_tests: "passed",
        security_scan: "passed",
      },
    });

    await runReleaseSummary();

    const output = logs.join("\n");
    expect(output).toContain("clawd release-summary");
    expect(output).toContain("Generated: 2026-03-07T00:00:00Z");
    expect(output).toContain("Overall: passed");
    expect(output).toContain("Manifest: testnet/manifest.json");
    expect(output).toContain("Host:     node1.example.com");
    expect(output).toContain("unit_tests: passed");
    expect(output).toContain("integration_tests: passed");
  });

  it("sets exitCode=1 when overall status is not passed", async () => {
    mockFileExists = true;
    mockFileContent = JSON.stringify({
      overall_status: "failed",
      gates: { unit_tests: "passed", security_scan: "failed" },
    });

    await runReleaseSummary();

    expect(process.exitCode).toBe(1);
  });

  it("does not set exitCode when overall status is passed", async () => {
    mockFileExists = true;
    mockFileContent = JSON.stringify({
      overall_status: "passed",
      gates: { unit_tests: "passed" },
    });

    await runReleaseSummary();

    expect(process.exitCode).toBeUndefined();
  });

  it("filters to failed gates when --failedOnly is set", async () => {
    mockFileExists = true;
    mockFileContent = JSON.stringify({
      overall_status: "failed",
      gates: {
        unit_tests: "passed",
        security_scan: "failed",
        linting: "not_recorded",
      },
    });

    await runReleaseSummary({ failedOnly: true });

    const output = logs.join("\n");
    expect(output).toContain("security_scan: failed");
    expect(output).not.toContain("unit_tests: passed");
    expect(output).not.toContain("linting: not_recorded");
  });

  it("shows 'No gates to display' when all filtered out", async () => {
    mockFileExists = true;
    mockFileContent = JSON.stringify({
      overall_status: "passed",
      gates: { unit_tests: "passed" },
    });

    await runReleaseSummary({ failedOnly: true });

    const output = logs.join("\n");
    expect(output).toContain("No gates to display.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    mockFileExists = true;
    mockFileContent = JSON.stringify({
      generated_at_utc: "2026-03-07T00:00:00Z",
      overall_status: "passed",
      inputs: { manifest: "m.json" },
      gates: { unit_tests: "passed" },
    });

    await runReleaseSummary({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.generated_at_utc).toBe("2026-03-07T00:00:00Z");
    expect(parsed.overall_status).toBe("passed");
    expect(parsed.gates.unit_tests).toBe("passed");
  });

  it("sets exitCode=1 in JSON mode when not passed", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    mockFileExists = true;
    mockFileContent = JSON.stringify({
      overall_status: "failed",
      gates: {},
    });

    await runReleaseSummary({ json: true });

    expect(process.exitCode).toBe(1);
  });
});
