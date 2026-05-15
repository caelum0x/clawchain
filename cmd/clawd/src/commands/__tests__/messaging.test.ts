/**
 * Tests for `clawd messaging` subcommands -- inbox, sent, read.
 *
 * Tests read-only query commands by mocking fetch.
 * Skips send/ack (they require signing client).
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

// Mock mnemonic and wallet derivation for inbox/sent/read (they call ensureSigner)
vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic"),
  mnemonicFileExists: vi.fn(() => true),
}));

vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: () =>
      Promise.resolve({
        getAccounts: () =>
          Promise.resolve([{ address: "claw1myaddress1234567890123" }]),
      }),
  },
}));

vi.mock("@cosmjs/stargate", () => ({
  GasPrice: { fromString: () => ({}) },
  SigningStargateClient: {
    connectWithSigner: () =>
      Promise.resolve({
        signAndBroadcast: vi.fn(),
        disconnect: vi.fn(),
      }),
  },
}));

import {
  runMessagingInbox,
  runMessagingSent,
  runMessagingRead,
} from "../messaging.js";

let logs: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// runMessagingInbox()
// ---------------------------------------------------------------------------

describe("runMessagingInbox", () => {
  it("displays inbox messages table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          messages: [
            {
              id: "1",
              sender: "claw1sender12345678901234567",
              recipient: "claw1myaddress1234567890123",
              ciphertext: "Hello from the other side",
              timestamp: "1709800000",
              acknowledged: false,
            },
            {
              id: "2",
              sender: "claw1another1234567890123456",
              recipient: "claw1myaddress1234567890123",
              ciphertext: "Second message content",
              timestamp: "1709900000",
              acknowledged: true,
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingInbox({});

    const output = logs.join("\n");
    expect(output).toContain("Inbox (2 messages)");
    expect(output).toContain("Hello from the other side");
    expect(output).toContain("Second message content");
    expect(output).toContain("yes");
    expect(output).toContain("no");
  });

  it("shows empty inbox message when no messages match", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          messages: [
            {
              id: "1",
              sender: "claw1myaddress1234567890123",
              recipient: "claw1other12345678901234567",
              ciphertext: "I sent this",
              timestamp: "1709800000",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingInbox({});

    const output = logs.join("\n");
    expect(output).toContain("Inbox is empty.");
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
          messages: [
            {
              id: "1",
              sender: "claw1sender12345678901234567",
              recipient: "claw1myaddress1234567890123",
              ciphertext: "Test",
              timestamp: "1709800000",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingInbox({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.messages).toBeDefined();
    expect(Array.isArray(parsed.messages)).toBe(true);
  });

  it("handles 404 gracefully for inbox", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as unknown as typeof fetch;

    await runMessagingInbox({});

    const output = logs.join("\n");
    expect(output).toContain("No messages found.");
  });
});

// ---------------------------------------------------------------------------
// runMessagingSent()
// ---------------------------------------------------------------------------

describe("runMessagingSent", () => {
  it("displays sent messages table from REST API", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          messages: [
            {
              id: "10",
              sender: "claw1myaddress1234567890123",
              recipient: "claw1recipient123456789012345",
              ciphertext: "Outgoing message",
              timestamp: "1709800000",
              acknowledged: false,
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingSent({});

    const output = logs.join("\n");
    expect(output).toContain("Sent (1 message)");
    expect(output).toContain("Outgoing message");
  });

  it("shows no sent messages when list is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          messages: [
            {
              id: "1",
              sender: "claw1other12345678901234567",
              recipient: "claw1myaddress1234567890123",
              ciphertext: "incoming only",
              timestamp: "1709800000",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingSent({});

    const output = logs.join("\n");
    expect(output).toContain("No sent messages.");
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
          messages: [
            {
              id: "10",
              sender: "claw1myaddress1234567890123",
              recipient: "claw1dest123456789012345678",
              ciphertext: "Hello",
              timestamp: "1709800000",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingSent({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.messages).toBeDefined();
    expect(parsed.messages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// runMessagingRead()
// ---------------------------------------------------------------------------

describe("runMessagingRead", () => {
  it("displays full message detail by ID", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          messages: [
            {
              id: "42",
              sender: "claw1sender12345678901234567",
              recipient: "claw1myaddress1234567890123",
              ciphertext: "Full message body here",
              timestamp: "1709800000",
              block_height: "5000",
              acknowledged: true,
              nonce: "abc123",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingRead({ messageId: "42" });

    const output = logs.join("\n");
    expect(output).toContain("Message #42");
    expect(output).toContain("From:");
    expect(output).toContain("To:");
    expect(output).toContain("Block:        5000");
    expect(output).toContain("Acknowledged: yes");
    expect(output).toContain("Full message body here");
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
          messages: [
            {
              id: "42",
              sender: "claw1sender12345678901234567",
              ciphertext: "test content",
            },
          ],
        }),
    }) as unknown as typeof fetch;

    await runMessagingRead({ messageId: "42", json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe("42");
    expect(parsed.ciphertext).toBe("test content");
  });
});
