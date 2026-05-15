import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOpenClawProviderProfile,
  ensureOpenClawProviderProfile,
  resolveOpenClawProviderConfigPath,
} from "./openclaw-provider-profile.js";
import type { ClawdConfig } from "./config.js";

const baseConfig: ClawdConfig = {
  chainId: "clawchain-1",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  nodeAutoStart: true,
  nodeHome: "/tmp/.clawchain",
  denom: "uclaw",
  prefix: "claw",
  gasPrice: "0.025uclaw",
  faucetEnabled: true,
  faucetPort: 8888,
  faucetUrl: "http://localhost:8888",
  seeds: "seed@1.2.3.4:26656",
  persistentPeers: "peer@2.3.4.5:26656",
  messagingEndpoint: "http://localhost:7777",
  autonomousLoopEnabled: true,
  autonomousLoopIntervalSeconds: 15,
  autonomousMaxPendingAcceptedTasks: 9,
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("openclaw provider profile", () => {
  it("builds provider-managed gateway and blockchain defaults without dropping user sections", () => {
    const result = buildOpenClawProviderProfile(
      {
        channels: {
          telegram: { enabled: true },
        },
        gateway: {
          auth: { token: "secret-token" },
        },
      },
      baseConfig,
      {
        profile: "clawd",
        stateDir: "/tmp/clawd-openclaw",
        rpcUrl: "http://localhost:26657",
        restUrl: "http://localhost:1317",
        messagingEndpoint: "http://localhost:7777",
        nodeBinary: "clawchaind",
      },
    );

    expect(result.channels).toEqual({
      telegram: { enabled: true },
    });
    expect(result.gateway).toMatchObject({
      mode: "local",
      bind: "loopback",
      reload: { mode: "hybrid" },
      auth: { token: "secret-token" },
    });
    expect(result.blockchain).toMatchObject({
      enabled: true,
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      autoRegister: true,
      messagingEndpoint: "http://localhost:7777",
      node: {
        autoStart: true,
        binaryPath: "clawchaind",
        home: "/tmp/.clawchain",
      },
      faucet: {
        enabled: true,
        port: 8888,
        url: "http://localhost:8888",
      },
      peers: {
        seeds: "seed@1.2.3.4:26656",
        persistentPeers: "peer@2.3.4.5:26656",
      },
      heartbeat: {
        enabled: true,
        includeNodeStatus: true,
      },
      autonomousLoop: {
        enabled: true,
        autoAcceptTasks: true,
        pollIntervalMs: 15000,
        maxConcurrentTasks: 9,
      },
    });
  });

  it("writes the canonical openclaw.json path and is idempotent for unchanged content", () => {
    const dir = mkdtempSync(join(tmpdir(), "clawd-openclaw-profile-"));
    tempDirs.push(dir);

    const first = ensureOpenClawProviderProfile(baseConfig, {
      profile: "clawd",
      stateDir: dir,
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      messagingEndpoint: "http://localhost:7777",
    });
    const second = ensureOpenClawProviderProfile(baseConfig, {
      profile: "clawd",
      stateDir: dir,
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      messagingEndpoint: "http://localhost:7777",
    });

    const configPath = resolveOpenClawProviderConfigPath(dir);
    const written = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;

    expect(first.path).toBe(configPath);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(written.gateway).toBeDefined();
    expect(written.blockchain).toBeDefined();
  });

  it("recovers by replacing invalid existing JSON with the provider profile", () => {
    const dir = mkdtempSync(join(tmpdir(), "clawd-openclaw-profile-"));
    tempDirs.push(dir);

    const configPath = resolveOpenClawProviderConfigPath(dir);
    writeFileSync(configPath, "{invalid json\n");

    const result = ensureOpenClawProviderProfile(baseConfig, {
      profile: "clawd",
      stateDir: dir,
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      messagingEndpoint: "http://localhost:7777",
    });

    const written = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    expect(result.changed).toBe(true);
    expect(written.blockchain).toBeDefined();
  });
});
