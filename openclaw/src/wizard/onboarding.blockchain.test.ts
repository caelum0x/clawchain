import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { WizardPrompter } from "./prompts.js";

// Mock detectBinary so we don't hit the filesystem
vi.mock("../commands/onboard-helpers.js", () => ({
  detectBinary: vi.fn().mockResolvedValue(true),
}));

function createMockPrompter(responses: Record<string, unknown> = {}): WizardPrompter {
  const callCounts: Record<string, number> = {};
  function track(method: string) {
    callCounts[method] = (callCounts[method] ?? 0) + 1;
  }

  return {
    intro: vi.fn().mockResolvedValue(undefined),
    outro: vi.fn().mockResolvedValue(undefined),
    note: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockImplementation(async (params: { message: string }) => {
      track("select");
      const key = params.message;
      if (key in responses) {return responses[key];}
      // Return first option value
      return "local";
    }),
    multiselect: vi.fn().mockResolvedValue([]),
    text: vi.fn().mockImplementation(async (params: { message: string; initialValue?: string }) => {
      track("text");
      const key = params.message;
      if (key in responses) {return responses[key];}
      return params.initialValue ?? "";
    }),
    confirm: vi.fn().mockImplementation(async (params: { message: string; initialValue?: boolean }) => {
      track("confirm");
      const key = params.message;
      if (key in responses) {return responses[key];}
      return params.initialValue ?? true;
    }),
    progress: vi.fn().mockReturnValue({
      update: vi.fn(),
      stop: vi.fn(),
    }),
  };
}

function createMockRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  } as unknown as import("../runtime.js").RuntimeEnv;
}

describe("setupBlockchain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("quickstart with no existing config returns defaults", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter();
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "quickstart", prompter, runtime });

    // quickstart with no existing blockchain skips (existingEnabled is false)
    expect(result.skipped).toBe(true);
    expect(result.nextConfig.blockchain).toBeUndefined();
  });

  it("quickstart with existing enabled config keeps defaults", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter();
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {
      blockchain: { enabled: true, rpcUrl: "http://my-node:26657" },
    };

    const result = await setupBlockchain(cfg, { flow: "quickstart", prompter, runtime });

    expect(result.skipped).toBe(false);
    expect(result.nextConfig.blockchain?.enabled).toBe(true);
    expect(result.nextConfig.blockchain?.rpcUrl).toBe("http://my-node:26657");
    expect(result.nextConfig.blockchain?.denom).toBe("uclaw");
    expect(result.nextConfig.blockchain?.autoRegister).toBe(true);
  });

  it("advanced flow — user declines blockchain", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.skipped).toBe(true);
  });

  it("advanced flow — local network full config", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Network": "local",
      "Auto-start clawchaind when the gateway starts?": true,
      "Agent identity (keypair)": "env",
      "Auto-register agent on-chain at startup?": true,
      "Enable periodic heartbeat (proves liveness)?": true,
      "Run a local faucet server? (for development)": true,
      "Enable autonomous task loop? (discover + accept + execute tasks)": true,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.skipped).toBe(false);
    const bc = result.nextConfig.blockchain!;
    expect(bc.enabled).toBe(true);
    expect(bc.rpcUrl).toBe("http://localhost:26657");
    expect(bc.restUrl).toBe("http://localhost:1317");
    expect(bc.node?.autoStart).toBe(true);
    expect(bc.autoRegister).toBe(true);
    expect(bc.heartbeat?.enabled).toBe(true);
    expect(bc.faucet?.enabled).toBe(true);
    expect(bc.autonomousLoop?.enabled).toBe(true);
    expect(bc.denom).toBe("uclaw");
    expect(bc.prefix).toBe("claw");
  });

  it("advanced flow — testnet sets correct URLs", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Network": "testnet",
      "Agent identity (keypair)": "skip",
      "Auto-register agent on-chain at startup?": false,
      "Enable periodic heartbeat (proves liveness)?": false,
      "Enable autonomous task loop? (discover + accept + execute tasks)": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.skipped).toBe(false);
    expect(result.nextConfig.blockchain?.rpcUrl).toBe("https://rpc.testnet.clawchain.io:443");
    expect(result.nextConfig.blockchain?.restUrl).toBe("https://api.testnet.clawchain.io:443");
  });

  it("advanced flow — custom URLs", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Network": "custom",
      "RPC URL": "http://custom-rpc:26657",
      "REST/LCD URL": "http://custom-rest:1317",
      "Agent identity (keypair)": "skip",
      "Auto-register agent on-chain at startup?": false,
      "Enable periodic heartbeat (proves liveness)?": false,
      "Enable autonomous task loop? (discover + accept + execute tasks)": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.nextConfig.blockchain?.rpcUrl).toBe("http://custom-rpc:26657");
    expect(result.nextConfig.blockchain?.restUrl).toBe("http://custom-rest:1317");
  });

  it("advanced flow — generate mnemonic", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Network": "local",
      "Auto-start clawchaind when the gateway starts?": false,
      "Agent identity (keypair)": "generate",
      "I have saved the mnemonic securely": true,
      "Auto-register agent on-chain at startup?": true,
      "Enable periodic heartbeat (proves liveness)?": true,
      "Run a local faucet server? (for development)": false,
      "Enable autonomous task loop? (discover + accept + execute tasks)": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.nextConfig.blockchain?.mnemonic).toBeDefined();
    // Generated mnemonic should be 24 words
    const words = result.nextConfig.blockchain!.mnemonic!.split(" ");
    expect(words.length).toBe(24);
  });

  it("advanced flow — import mnemonic", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const testMnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Network": "local",
      "Auto-start clawchaind when the gateway starts?": false,
      "Agent identity (keypair)": "import",
      "Enter 24-word mnemonic": testMnemonic,
      "Auto-register agent on-chain at startup?": true,
      "Enable periodic heartbeat (proves liveness)?": true,
      "Run a local faucet server? (for development)": false,
      "Enable autonomous task loop? (discover + accept + execute tasks)": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.nextConfig.blockchain?.mnemonic).toBe(testMnemonic);
  });

  it("preserves existing config fields not touched by wizard", async () => {
    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Network": "local",
      "Auto-start clawchaind when the gateway starts?": false,
      "Agent identity (keypair)": "skip",
      "Auto-register agent on-chain at startup?": true,
      "Enable periodic heartbeat (proves liveness)?": true,
      "Run a local faucet server? (for development)": false,
      "Enable autonomous task loop? (discover + accept + execute tasks)": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {
      blockchain: {
        enabled: true,
        proofBinaryPath: "/usr/local/bin/clawproof",
        keysDir: "/home/agent/.clawkeys",
        messagingEndpoint: "http://my-agent:7777",
        peers: { seeds: "abc@1.2.3.4:26656" },
      },
    };

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.nextConfig.blockchain?.proofBinaryPath).toBe("/usr/local/bin/clawproof");
    expect(result.nextConfig.blockchain?.keysDir).toBe("/home/agent/.clawkeys");
    expect(result.nextConfig.blockchain?.messagingEndpoint).toBe("http://my-agent:7777");
    expect(result.nextConfig.blockchain?.peers?.seeds).toBe("abc@1.2.3.4:26656");
  });

  it("shows note about binaries not being found", async () => {
    const { detectBinary } = await import("../commands/onboard-helpers.js");
    (detectBinary as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Neither binary found. Continue anyway? (you can install later)": true,
      "Network": "local",
      "Agent identity (keypair)": "skip",
      "Auto-register agent on-chain at startup?": false,
      "Enable periodic heartbeat (proves liveness)?": false,
      "Enable autonomous task loop? (discover + accept + execute tasks)": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    // Should have shown the prerequisites note
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining("clawchaind: not found"),
      "Prerequisites",
    );
    expect(result.skipped).toBe(false);

    // Restore mock
    (detectBinary as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  it("user declines when binaries not found", async () => {
    const { detectBinary } = await import("../commands/onboard-helpers.js");
    (detectBinary as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { setupBlockchain } = await import("./onboarding.blockchain.js");
    const prompter = createMockPrompter({
      "Enable ClawChain blockchain integration?": true,
      "Neither binary found. Continue anyway? (you can install later)": false,
    });
    const runtime = createMockRuntime();
    const cfg: OpenClawConfig = {};

    const result = await setupBlockchain(cfg, { flow: "advanced", prompter, runtime });

    expect(result.skipped).toBe(true);

    // Restore mock
    (detectBinary as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });
});
