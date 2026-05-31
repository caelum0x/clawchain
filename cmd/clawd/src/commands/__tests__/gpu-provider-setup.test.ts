/**
 * Tests for `clawd gpu-provider setup` and `clawd gpu-provider detect-hardware`.
 *
 * Mocks child_process.execSync for GPU detection / Docker checks, and
 * globalThis.fetch for chain connectivity / balance checks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

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

vi.mock("../../lib/mnemonic.js", () => ({
  loadMnemonic: vi.fn(() => "test mnemonic placeholder"),
  mnemonicFileExists: vi.fn(() => false),
}));

// Mock execSync — will be configured per-test.
// Explicit `: string` return type prevents TS from inferring `never` (the body only
// throws), which would otherwise reject every per-test `mockImplementation` returning a string.
const execSyncMock = vi.fn((_cmd: string): string => {
  throw new Error("command not found");
});

vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => execSyncMock(args[0] as string),
}));

// Mock writeFileSync to avoid touching disk
const writeFileSyncMock = vi.fn();
vi.mock("node:fs", () => ({
  writeFileSync: (...args: unknown[]) => writeFileSyncMock(...args),
}));

// Mock @cosmjs modules to avoid real crypto
vi.mock("@cosmjs/proto-signing", () => ({
  DirectSecp256k1HdWallet: {
    fromMnemonic: vi.fn().mockResolvedValue({
      getAccounts: vi.fn().mockResolvedValue([
        { address: "claw1testaddr1234567890abcdef" },
      ]),
    }),
  },
}));

vi.mock("@cosmjs/stargate", () => ({
  GasPrice: { fromString: vi.fn() },
  SigningStargateClient: { connectWithSigner: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  detectNvidiaGpus,
  detectAmdGpus,
  detectAppleGpus,
  detectAllGpus,
  runDetectHardware,
  checkChainConnectivity,
  checkAccountBalance,
  checkDockerAvailability,
  generateConfigToml,
  runGpuProviderSetup,
} from "../gpu-provider.js";

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

let logs: string[];
let errors: string[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  logs = [];
  errors = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  originalFetch = globalThis.fetch;
  execSyncMock.mockReset();
  execSyncMock.mockImplementation(() => {
    throw new Error("command not found");
  });
  writeFileSyncMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// detectNvidiaGpus()
// ---------------------------------------------------------------------------

describe("detectNvidiaGpus", () => {
  it("parses nvidia-smi CSV output", () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("nvidia-smi")) {
        return "NVIDIA A100-SXM4-80GB, 81920, 535.129.03\nNVIDIA A100-SXM4-80GB, 81920, 535.129.03";
      }
      throw new Error("unknown cmd");
    });

    const gpus = detectNvidiaGpus();
    expect(gpus).toHaveLength(2);
    expect(gpus[0].vendor).toBe("nvidia");
    expect(gpus[0].model).toBe("NVIDIA A100-SXM4-80GB");
    expect(gpus[0].vram_mb).toBe(81920);
    expect(gpus[0].driver_version).toBe("535.129.03");
  });

  it("returns empty array when nvidia-smi is not available", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("command not found");
    });

    const gpus = detectNvidiaGpus();
    expect(gpus).toEqual([]);
  });

  it("returns empty array when nvidia-smi returns empty output", () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("nvidia-smi")) return "";
      throw new Error("unknown cmd");
    });

    const gpus = detectNvidiaGpus();
    expect(gpus).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectAmdGpus()
// ---------------------------------------------------------------------------

describe("detectAmdGpus", () => {
  it("parses rocm-smi CSV output", () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("rocm-smi")) {
        return "device, Card series, Card model, Card vendor, VRAM Total\n0, Radeon RX 7900 XTX, 0x744c, AMD, 25769803776";
      }
      throw new Error("unknown cmd");
    });

    const gpus = detectAmdGpus();
    expect(gpus).toHaveLength(1);
    expect(gpus[0].vendor).toBe("amd");
    expect(gpus[0].model).toBe("Radeon RX 7900 XTX");
    expect(gpus[0].vram_mb).toBe(24576); // 25769803776 / 1024 / 1024
  });

  it("returns empty array when rocm-smi is not available", () => {
    const gpus = detectAmdGpus();
    expect(gpus).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectAppleGpus()
// ---------------------------------------------------------------------------

describe("detectAppleGpus", () => {
  it("parses system_profiler output", () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("system_profiler")) {
        return `
Graphics/Displays:
    Apple M2 Max:
      Chipset Model: Apple M2 Max
      Type: GPU
      Bus: Built-In
      Total Number of Cores: 38
      Vendor: Apple (0x106b)
      Metal Support: Metal 3
      VRAM (Dynamic, Max): 96 GB
        `;
      }
      throw new Error("unknown cmd");
    });

    const gpus = detectAppleGpus();
    expect(gpus).toHaveLength(1);
    expect(gpus[0].vendor).toBe("apple");
    expect(gpus[0].model).toBe("Apple M2 Max");
    expect(gpus[0].vram_mb).toBe(98304); // 96 * 1024
    expect(gpus[0].driver_version).toBe("macOS");
  });

  it("returns empty array when system_profiler is not available", () => {
    const gpus = detectAppleGpus();
    expect(gpus).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectAllGpus()
// ---------------------------------------------------------------------------

describe("detectAllGpus", () => {
  it("combines GPUs from all vendors", () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("nvidia-smi")) {
        return "NVIDIA RTX 4090, 24576, 545.29.06";
      }
      if (cmd.startsWith("rocm-smi")) {
        throw new Error("not available");
      }
      if (cmd.startsWith("system_profiler")) {
        throw new Error("not available");
      }
      throw new Error("unknown");
    });

    const result = detectAllGpus();
    expect(result.detected).toBe(true);
    expect(result.gpus).toHaveLength(1);
    expect(result.gpus[0].vendor).toBe("nvidia");
  });

  it("returns detected=false when no GPUs found", () => {
    const result = detectAllGpus();
    expect(result.detected).toBe(false);
    expect(result.gpus).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runDetectHardware()
// ---------------------------------------------------------------------------

describe("runDetectHardware", () => {
  it("prints detected GPUs in table format", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("nvidia-smi")) {
        return "NVIDIA A100-SXM4-80GB, 81920, 535.129.03";
      }
      throw new Error("not available");
    });

    await runDetectHardware({});

    const output = logs.join("\n");
    expect(output).toContain("Detected GPU Hardware");
    expect(output).toContain("NVIDIA");
    expect(output).toContain("A100");
    expect(output).toContain("80 GB");
    expect(output).toContain("535.129.03");
  });

  it("prints no-GPU message when nothing detected", async () => {
    await runDetectHardware({});

    const output = logs.join("\n");
    expect(output).toContain("No GPU hardware detected.");
  });

  it("outputs JSON when --json flag is set", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("nvidia-smi")) {
        return "NVIDIA RTX 4090, 24576, 545.29.06";
      }
      throw new Error("not available");
    });

    await runDetectHardware({ json: true });

    const output = stdoutSpy.join("");
    const parsed = JSON.parse(output);
    expect(parsed.detected).toBe(true);
    expect(parsed.gpus).toHaveLength(1);
    expect(parsed.gpus[0].vendor).toBe("nvidia");
    expect(parsed.gpus[0].model).toBe("NVIDIA RTX 4090");
    expect(parsed.gpus[0].vram_mb).toBe(24576);
  });
});

// ---------------------------------------------------------------------------
// checkChainConnectivity()
// ---------------------------------------------------------------------------

describe("checkChainConnectivity", () => {
  it("returns ok when chain responds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          default_node_info: {
            network: "clawchain-1",
            moniker: "test-node",
            version: "0.38.21",
          },
        }),
    }) as unknown as typeof fetch;

    const result = await checkChainConnectivity("http://localhost:1317");
    expect(result.ok).toBe(true);
    expect(result.nodeInfo?.network).toBe("clawchain-1");
    expect(result.nodeInfo?.moniker).toBe("test-node");
    expect(result.nodeInfo?.version).toBe("0.38.21");
  });

  it("returns error on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as unknown as typeof fetch;

    const result = await checkChainConnectivity("http://localhost:1317");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
  });

  it("returns error on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("ECONNREFUSED"),
    ) as unknown as typeof fetch;

    const result = await checkChainConnectivity("http://localhost:1317");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// checkAccountBalance()
// ---------------------------------------------------------------------------

describe("checkAccountBalance", () => {
  it("returns sufficient when balance >= 1 CLAW", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          balances: [
            { denom: "uclaw", amount: "5000000" }, // 5 CLAW
          ],
        }),
    }) as unknown as typeof fetch;

    const result = await checkAccountBalance(
      "http://localhost:1317",
      "claw1test",
      "uclaw",
    );
    expect(result.ok).toBe(true);
    expect(result.balanceUclaw).toBe("5000000");
    expect(result.sufficient).toBe(true);
  });

  it("warns when balance < 1 CLAW", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          balances: [
            { denom: "uclaw", amount: "500000" }, // 0.5 CLAW
          ],
        }),
    }) as unknown as typeof fetch;

    const result = await checkAccountBalance(
      "http://localhost:1317",
      "claw1test",
      "uclaw",
    );
    expect(result.ok).toBe(true);
    expect(result.sufficient).toBe(false);
  });

  it("returns 0 balance when denom not found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          balances: [
            { denom: "uatom", amount: "100000" },
          ],
        }),
    }) as unknown as typeof fetch;

    const result = await checkAccountBalance(
      "http://localhost:1317",
      "claw1test",
      "uclaw",
    );
    expect(result.ok).toBe(true);
    expect(result.balanceUclaw).toBe("0");
    expect(result.sufficient).toBe(false);
  });

  it("handles HTTP errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    const result = await checkAccountBalance(
      "http://localhost:1317",
      "claw1test",
      "uclaw",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("ECONNREFUSED"),
    ) as unknown as typeof fetch;

    const result = await checkAccountBalance(
      "http://localhost:1317",
      "claw1test",
      "uclaw",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// checkDockerAvailability()
// ---------------------------------------------------------------------------

describe("checkDockerAvailability", () => {
  it("returns ok with version when Docker is available", () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("docker info")) return "24.0.7";
      throw new Error("unknown cmd");
    });

    const result = checkDockerAvailability();
    expect(result.ok).toBe(true);
    expect(result.version).toBe("24.0.7");
  });

  it("returns error when Docker is not available", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("command not found: docker");
    });

    const result = checkDockerAvailability();
    expect(result.ok).toBe(false);
    expect(result.error).toContain("command not found");
  });
});

// ---------------------------------------------------------------------------
// generateConfigToml()
// ---------------------------------------------------------------------------

describe("generateConfigToml", () => {
  it("generates valid TOML config with detected GPU info", () => {
    const config = generateConfigToml({
      restUrl: "http://localhost:1317",
      rpcUrl: "http://localhost:26657",
      chainId: "clawchain-1",
      denom: "uclaw",
      providerName: "test-provider",
      providerAddress: "claw1testaddr123",
      gpus: [
        { vendor: "nvidia", model: "NVIDIA A100", vram_mb: 81920, driver_version: "535.129.03" },
      ],
      dockerEnabled: true,
    });

    expect(config).toContain('rest_url = "http://localhost:1317"');
    expect(config).toContain('rpc_url = "http://localhost:26657"');
    expect(config).toContain('chain_id = "clawchain-1"');
    expect(config).toContain('denom = "uclaw"');
    expect(config).toContain('name = "test-provider"');
    expect(config).toContain('address = "claw1testaddr123"');
    expect(config).toContain("docker_enabled = true");
    expect(config).toContain("NVIDIA A100 (80 GB)");
    expect(config).toContain("[chain]");
    expect(config).toContain("[provider]");
    expect(config).toContain("[jobs]");
    expect(config).toContain("[events]");
    expect(config).toContain("[heartbeat]");
    expect(config).toContain("[metrics]");
    expect(config).toContain("[dantegpu]");
  });

  it("handles no detected GPUs", () => {
    const config = generateConfigToml({
      restUrl: "http://localhost:1317",
      rpcUrl: "http://localhost:26657",
      chainId: "clawchain-1",
      denom: "uclaw",
      providerName: "empty-provider",
      providerAddress: "",
      gpus: [],
      dockerEnabled: false,
    });

    expect(config).toContain("none detected");
    expect(config).toContain("docker_enabled = false");
  });

  it("formats small VRAM as MB", () => {
    const config = generateConfigToml({
      restUrl: "http://localhost:1317",
      rpcUrl: "http://localhost:26657",
      chainId: "clawchain-1",
      denom: "uclaw",
      providerName: "test",
      providerAddress: "",
      gpus: [
        { vendor: "nvidia", model: "GPU-Small", vram_mb: 512, driver_version: "1.0" },
      ],
      dockerEnabled: true,
    });

    expect(config).toContain("GPU-Small (512 MB)");
  });
});

// ---------------------------------------------------------------------------
// runGpuProviderSetup() — full wizard flow
// ---------------------------------------------------------------------------

describe("runGpuProviderSetup", () => {
  it("runs full wizard with --skip-checks and writes config", async () => {
    // Mock GPU detection
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("nvidia-smi")) {
        return "NVIDIA RTX 4090, 24576, 545.29.06";
      }
      if (cmd.startsWith("docker info")) {
        return "24.0.7";
      }
      throw new Error("not available");
    });

    await runGpuProviderSetup({
      skipChecks: true,
      output: "/tmp/test-config.toml",
      name: "test-provider",
    });

    const output = logs.join("\n");

    // Wizard header
    expect(output).toContain("ClawChain GPU Provider");
    expect(output).toContain("Setup Wizard");

    // Step 1: GPU detection
    expect(output).toContain("[1/6] Detecting GPU hardware");
    expect(output).toContain("Found 1 GPU(s)");
    expect(output).toContain("NVIDIA RTX 4090");

    // Steps 2-3: skipped
    expect(output).toContain("skipped (--skip-checks)");

    // Step 4: Docker
    expect(output).toContain("[4/6] Checking Docker availability");
    expect(output).toContain("Docker is available");
    expect(output).toContain("24.0.7");

    // Step 5: Config
    expect(output).toContain("[5/6] Generating configuration");
    expect(output).toContain("/tmp/test-config.toml");

    // Config was written
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    expect(writeFileSyncMock.mock.calls[0][0]).toBe("/tmp/test-config.toml");
    const writtenContent = writeFileSyncMock.mock.calls[0][1] as string;
    expect(writtenContent).toContain('name = "test-provider"');
    expect(writtenContent).toContain("NVIDIA RTX 4090");

    // Step 6: summary
    expect(output).toContain("[6/6] Registration summary");
    expect(output).toContain("[OK]");
  });

  it("runs wizard without --skip-checks and warns on chain failure", async () => {
    // No GPUs, no Docker
    execSyncMock.mockImplementation(() => {
      throw new Error("not available");
    });

    // Chain connectivity fails
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error("ECONNREFUSED"),
    ) as unknown as typeof fetch;

    await runGpuProviderSetup({
      output: "/tmp/fail-config.toml",
    });

    const output = logs.join("\n");

    // Step 1: no GPUs
    expect(output).toContain("No GPU hardware detected");

    // Step 2: chain connectivity fails
    expect(output).toContain("Warning: Could not connect to chain");

    // Step 3: no wallet (mock returns false for mnemonicFileExists)
    expect(output).toContain("No wallet found");

    // Step 4: Docker not available
    expect(output).toContain("Docker is not available");

    // Step 6: summary shows failures
    expect(output).toContain("[!!]");
    expect(output).toContain("Some checks did not pass");
  });

  it("uses default config.toml path when --output is not set", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("docker info")) return "24.0.7";
      throw new Error("not available");
    });

    await runGpuProviderSetup({ skipChecks: true });

    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    expect(writeFileSyncMock.mock.calls[0][0]).toBe("config.toml");
  });

  it("applies --rest-url and --rpc-url overrides", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("docker info")) return "24.0.7";
      throw new Error("not available");
    });

    await runGpuProviderSetup({
      skipChecks: true,
      restUrl: "http://custom:1317",
      rpcUrl: "http://custom:26657",
      output: "/tmp/custom-config.toml",
    });

    const writtenContent = writeFileSyncMock.mock.calls[0][1] as string;
    expect(writtenContent).toContain('rest_url = "http://custom:1317"');
    expect(writtenContent).toContain('rpc_url = "http://custom:26657"');
  });

  it("handles writeFileSync errors gracefully", async () => {
    execSyncMock.mockImplementation((cmd: string) => {
      if (cmd.startsWith("docker info")) return "24.0.7";
      throw new Error("not available");
    });
    writeFileSyncMock.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    await runGpuProviderSetup({ skipChecks: true, output: "/root/config.toml" });

    const output = logs.join("\n");
    expect(output).toContain("Error writing config");
    expect(output).toContain("EACCES");
  });
});
