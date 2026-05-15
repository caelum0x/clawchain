import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    agentAddress: "claw1agent123456789012345678",
  })),
}));

const evaluateProviderLifecycleMock = vi.hoisted(() =>
  vi.fn(async () => makeLifecycleReport()),
);

vi.mock("../../lib/provider-lifecycle.js", () => ({
  evaluateProviderLifecycle: evaluateProviderLifecycleMock,
}));

import { runProviderStatus } from "../provider.js";

let logs: string[];

function makeLifecycleReport(overrides: Record<string, unknown> = {}): any {
  return {
    chainId: "clawchain-1",
    agentAddress: "claw1agent123456789012345678",
    ready: true,
    blockers: [],
    registration: { ok: true, detail: "registered via gateway", source: "gateway" },
    heartbeat: { ok: true, detail: "live via gateway", source: "gateway" },
    recovery: {
      ok: true,
      detail: "no locally tracked tasks",
      source: "local",
      trackedTaskCount: 0,
      actions: [],
      resumableTaskIds: [],
      cleanupTaskIds: [],
    },
    rewards: {
      ok: true,
      detail: "agent=42 staking=1",
      source: "gateway",
      agentRewardsUclaw: "42",
      stakingRewards: [{ denom: "uclaw", amount: "7" }],
    },
    ...overrides,
  };
}

beforeEach(() => {
  logs = [];
  evaluateProviderLifecycleMock.mockReset();
  evaluateProviderLifecycleMock.mockResolvedValue(makeLifecycleReport());
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runProviderStatus", () => {
  it("prints a pretty provider lifecycle summary", async () => {
    await runProviderStatus();

    const output = logs.join("\n");
    expect(output).toContain("Provider Status");
    expect(output).toContain("Chain ID:      clawchain-1");
    expect(output).toContain("Agent:         claw1agent123456789012345678");
    expect(output).toContain("Ready:         true");
    expect(output).toContain("Registration:  true (registered via gateway)");
    expect(output).toContain("Reward total:  42 uclaw");
    expect(output).toContain("Staking lines: 1");
  });

  it("prints JSON when requested", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });

    await runProviderStatus({ out: "json" });

    const parsed = JSON.parse(writes.join(""));
    expect(parsed.chainId).toBe("clawchain-1");
    expect(parsed.agentAddress).toBe("claw1agent123456789012345678");
    expect(parsed.ready).toBe(true);
    expect(parsed.registration.detail).toBe("registered via gateway");
    expect(parsed.rewards.agentRewardsUclaw).toBe("42");
    expect(parsed.rewards.stakingRewards).toHaveLength(1);
  });

  it("prints blockers in pretty output when lifecycle is degraded", async () => {
    evaluateProviderLifecycleMock.mockResolvedValue(makeLifecycleReport({
      ready: false,
      blockers: ["heartbeat: not live", "rewards: unavailable"],
      heartbeat: { ok: false, detail: "not live via runtime.status", source: "gateway" },
      recovery: {
        ok: true,
        detail: "tracked=1 resumable=1 cleanup=0",
        source: "local",
        trackedTaskCount: 1,
        actions: [{ action: "resume", taskId: 7 }],
        resumableTaskIds: [7],
        cleanupTaskIds: [],
      },
      rewards: {
        ok: false,
        detail: "wallet rewards unavailable",
        source: "unavailable",
        agentRewardsUclaw: null,
        stakingRewards: [],
      },
    }));

    await runProviderStatus();

    const output = logs.join("\n");
    expect(output).toContain("Ready:         false");
    expect(output).toContain("Blockers:      heartbeat: not live | rewards: unavailable");
  });
});
