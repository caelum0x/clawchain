/**
 * Tests for `clawd skills` subcommands — list, publish, price, delist, sales.
 *
 * Tests read-only query commands by mocking fetch.
 * Tests transaction commands by mocking the signing client.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock config
vi.mock("../../lib/config.js", () => ({
  loadClawdConfig: vi.fn(() => ({
    chainId: "clawchain-1",
    rpcUrl: "http://localhost:26657",
    restUrl: "http://localhost:1317",
    nodeAutoStart: true,
    nodeHome: "",
    denom: "uclaw",
    prefix: "claw",
    gasPrice: "0.025uclaw",
  })),
}));

// Mock mnemonic
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(
    () =>
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  ),
  mnemonicFileExists: vi.fn(() => true),
}));

const mockSignAndBroadcast = vi.fn().mockResolvedValue({
  code: 0,
  transactionHash: "ABCD1234TXHASH",
  rawLog: "",
  events: [
    {
      type: "skill_listed",
      attributes: [{ key: "skill_id", value: "42" }],
    },
  ],
});

const mockDisconnect = vi.fn();

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: () =>
      Promise.resolve({
        getAccounts: () =>
          Promise.resolve([{ address: "claw1testprovider1234567890" }]),
      }),
  },
}));

vi.mock("@cosmjs/stargate", () => ({
  GasPrice: { fromString: () => ({}) },
  SigningStargateClient: {
    connectWithSigner: () =>
      Promise.resolve({
        signAndBroadcast: mockSignAndBroadcast,
        disconnect: mockDisconnect,
      }),
  },
}));

import {
  runSkillsList,
  runSkillsPublish,
  runSkillsPrice,
  runSkillsDelist,
  runSkillsSales,
} from "../skills.js";
import { runInventory } from "../inventory.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = globalThis.fetch;
  mockSignAndBroadcast.mockClear();
  mockSignAndBroadcast.mockResolvedValue({
    code: 0,
    transactionHash: "ABCD1234TXHASH",
    rawLog: "",
    events: [
      {
        type: "skill_listed",
        attributes: [{ key: "skill_id", value: "42" }],
      },
    ],
  });
  mockDisconnect.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runSkillsList()
// ---------------------------------------------------------------------------

describe("runSkillsList", () => {
  it("displays skills table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skills: [
            {
              id: 1,
              name: "Code Review",
              owner: "claw1owner12345678901234567890",
              category: "dev",
              price: "1000000",
              active: true,
              purchase_count: 15,
            },
            {
              id: 2,
              name: "Data Analysis",
              owner: "claw1owner99999999999999999999",
              category: "ml",
              price: "2500000",
              active: true,
              purchase_count: 42,
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runSkillsList({});

    const output = logs.join("\n");
    expect(output).toContain("Skills (2)");
    expect(output).toContain("Code Review");
    expect(output).toContain("Data Analysis");
    expect(output).toContain("1 CLAW");
    expect(output).toContain("2.5 CLAW");
  });

  it("shows message when no skills found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;

    await runSkillsList({});

    const output = logs.join("\n");
    expect(output).toContain("No skills found.");
  });

  it("uses owner endpoint when owner filter provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runSkillsList({ owner: "claw1myowner123" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/skills_by_owner/claw1myowner123");
  });

  it("uses category endpoint when category filter provided", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ skills: [] }),
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    await runSkillsList({ category: "ml" });

    const calledUrl = String((fetchSpy as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/skills/category/ml");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          skills: [{ id: 1, name: "TestSkill", price: "500000" }],
        }),
    }) as unknown as typeof fetch;

    await runSkillsList({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0].name).toBe("TestSkill");
  });
});

// ---------------------------------------------------------------------------
// runSkillsPublish()
// ---------------------------------------------------------------------------

describe("runSkillsPublish", () => {
  it("sends MsgListSkill and reports success", async () => {
    await runSkillsPublish({
      name: "My Skill",
      description: "Does great things",
      price: "5000000",
      category: "automation",
    });

    expect(mockSignAndBroadcast).toHaveBeenCalledOnce();
    const callArgs = mockSignAndBroadcast.mock.calls[0];
    const msgs = callArgs[1];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].typeUrl).toBe("/clawchain.marketplace.v1.MsgListSkill");
    expect(msgs[0].value.name).toBe("My Skill");
    expect(msgs[0].value.description).toBe("Does great things");
    expect(msgs[0].value.price).toBe("5000000");
    expect(msgs[0].value.category).toBe("automation");

    const output = logs.join("\n");
    expect(output).toContain("Skill published successfully.");
    expect(output).toContain("Skill ID:");
    expect(output).toContain("42");
    expect(output).toContain("ABCD1234TXHASH");
  });

  it("extracts skill_id from events", async () => {
    mockSignAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "TX999",
      rawLog: "",
      events: [
        {
          type: "skill_listed",
          attributes: [{ key: "skill_id", value: "77" }],
        },
      ],
    });

    await runSkillsPublish({
      name: "Event Skill",
      description: "Test",
      price: "1000000",
    });

    const output = logs.join("\n");
    expect(output).toContain("77");
  });

  it("disconnects signing client after publish", async () => {
    await runSkillsPublish({
      name: "Disconnect Test",
      description: "Test",
      price: "1000",
    });

    expect(mockDisconnect).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// runSkillsPrice()
// ---------------------------------------------------------------------------

describe("runSkillsPrice", () => {
  it("sends MsgUpdateSkill with new price", async () => {
    mockSignAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "TXPRICE",
      rawLog: "",
      events: [],
    });

    await runSkillsPrice({ skillId: "42", price: "10000000" });

    expect(mockSignAndBroadcast).toHaveBeenCalledOnce();
    const msgs = mockSignAndBroadcast.mock.calls[0][1];
    expect(msgs[0].typeUrl).toBe("/clawchain.marketplace.v1.MsgUpdateSkill");
    expect(msgs[0].value.skillId).toBe("42");
    expect(msgs[0].value.price).toBe("10000000");

    const output = logs.join("\n");
    expect(output).toContain("price updated");
    expect(output).toContain("10 CLAW");
    expect(output).toContain("TXPRICE");
  });
});

// ---------------------------------------------------------------------------
// runSkillsDelist()
// ---------------------------------------------------------------------------

describe("runSkillsDelist", () => {
  it("sends MsgDelistSkill", async () => {
    mockSignAndBroadcast.mockResolvedValueOnce({
      code: 0,
      transactionHash: "TXDELIST",
      rawLog: "",
      events: [],
    });

    await runSkillsDelist({ skillId: "99" });

    expect(mockSignAndBroadcast).toHaveBeenCalledOnce();
    const msgs = mockSignAndBroadcast.mock.calls[0][1];
    expect(msgs[0].typeUrl).toBe("/clawchain.marketplace.v1.MsgDelistSkill");
    expect(msgs[0].value.skillId).toBe("99");

    const output = logs.join("\n");
    expect(output).toContain("delisted");
    expect(output).toContain("TXDELIST");
  });
});

// ---------------------------------------------------------------------------
// runSkillsSales()
// ---------------------------------------------------------------------------

describe("runSkillsSales", () => {
  it("displays skill analytics from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          analytics: {
            skill_id: "42",
            total_revenue: "50000000",
            total_purchases: 25,
            revenue_by_period: [
              { period: "2026-03-01", revenue: "20000000", count: 10 },
              { period: "2026-03-08", revenue: "30000000", count: 15 },
            ],
          },
        }),
    }) as unknown as typeof fetch;

    await runSkillsSales({ skillId: "42" });

    const output = logs.join("\n");
    expect(output).toContain("Sales Analytics for Skill #42");
    expect(output).toContain("50 CLAW");
    expect(output).toContain("25");
    expect(output).toContain("2026-03-01");
    expect(output).toContain("2026-03-08");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          analytics: {
            skill_id: "42",
            total_revenue: "10000000",
            total_purchases: 5,
          },
        }),
    }) as unknown as typeof fetch;

    await runSkillsSales({ skillId: "42", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.total_revenue).toBe("10000000");
    expect(parsed.total_purchases).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// runInventory() — unified inventory aggregation
// ---------------------------------------------------------------------------

describe("runInventory", () => {
  it("aggregates all provider surfaces into a summary", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/skills_by_owner/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              skills: [
                { id: 1, name: "Skill A", price: "1000000", purchase_count: 10 },
                { id: 2, name: "Skill B", price: "2000000", purchase_count: 5 },
              ],
            }),
        });
      }

      if (urlStr.includes("/gpu_providers/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              provider: {
                address: "claw1testprovider1234567890",
                active: true,
                active_leases: 2,
              },
            }),
        });
      }

      if (urlStr.includes("/modelregistry/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              models: [
                { id: 1, name: "LLM-v1", access_count: 100 },
                { id: 2, name: "Vision-v1", access_count: 50 },
              ],
            }),
        });
      }

      if (urlStr.includes("/tasks/assignee/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tasks: [
                { id: 1, status: "completed", budget: "5000000" },
                { id: 2, status: "pending", budget: "3000000" },
              ],
            }),
        });
      }

      if (urlStr.includes("/compute/jobs")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              jobs: [
                { id: 1, status: "completed", earnings: "8000000" },
              ],
            }),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    }) as unknown as typeof fetch;

    await runInventory({});

    const output = logs.join("\n");
    expect(output).toContain("Provider Inventory");
    expect(output).toContain("Listed Skills:   2");
    expect(output).toContain("Registered:      Yes");
    expect(output).toContain("Active Leases:   2");
    expect(output).toContain("Hosted Models:   2");
    expect(output).toContain("Total Accesses:  150");
    expect(output).toContain("Completed:       1");
    expect(output).toContain("Pending:         1");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    ) as unknown as typeof fetch;

    await runInventory({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.address).toBe("claw1testprovider1234567890");
    expect(parsed.skills).toBeDefined();
    expect(parsed.gpu).toBeDefined();
    expect(parsed.models).toBeDefined();
    expect(parsed.tasks).toBeDefined();
    expect(parsed.totalEarningsUclaw).toBeDefined();
  });

  it("handles empty/failed fetches gracefully", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500 }),
    ) as unknown as typeof fetch;

    await runInventory({});

    const output = logs.join("\n");
    expect(output).toContain("Provider Inventory");
    expect(output).toContain("Listed Skills:   0");
    expect(output).toContain("Registered:      No");
    expect(output).toContain("Hosted Models:   0");
    expect(output).toContain("Completed:       0");
    expect(output).toContain("Pending:         0");
  });
});
