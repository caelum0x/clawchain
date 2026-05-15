/**
 * Tests for `clawd deploy-profile` — deployment configuration generator.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runDeployProfile } from "../deploy-profile.js";

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
});

// ---------------------------------------------------------------------------
// Local profile
// ---------------------------------------------------------------------------

describe("deploy-profile local", () => {
  it("generates a shell script and clawd.json config", async () => {
    await runDeployProfile({ target: "local" });

    const output = logs.join("\n");
    expect(output).toContain("# --- clawd.json ---");
    expect(output).toContain("# --- start-local.sh ---");
    expect(output).toContain("clawchaind start --home ~/.clawchain");
    expect(output).toContain("clawd up");
    expect(output).toContain('"chainId": "clawchain-1"');
  });
});

// ---------------------------------------------------------------------------
// VPS profile
// ---------------------------------------------------------------------------

describe("deploy-profile vps", () => {
  it("generates systemd services and nginx config", async () => {
    await runDeployProfile({ target: "vps" });

    const output = logs.join("\n");
    expect(output).toContain("# --- clawchaind.service ---");
    expect(output).toContain("# --- clawd.service ---");
    expect(output).toContain("# --- nginx-clawchain.conf ---");
    expect(output).toContain("# --- setup-firewall.sh ---");
    expect(output).toContain("[Unit]");
    expect(output).toContain("ExecStart=/usr/local/bin/clawchaind start");
    expect(output).toContain("upstream clawchain_rpc");
    expect(output).toContain("ufw allow 26656/tcp");
  });
});

// ---------------------------------------------------------------------------
// Docker profile
// ---------------------------------------------------------------------------

describe("deploy-profile docker", () => {
  it("generates a docker-compose YAML with service definitions", async () => {
    await runDeployProfile({ target: "docker" });

    const output = logs.join("\n");
    expect(output).toContain("# --- docker-compose.clawchain.yml ---");
    expect(output).toContain("services:");
    expect(output).toContain("clawchain:");
    expect(output).toContain("clawd:");
    expect(output).toContain("claw-faucet:");
    expect(output).toContain("healthcheck:");
    expect(output).toContain("clawnet:");
  });
});

// ---------------------------------------------------------------------------
// K8s profile
// ---------------------------------------------------------------------------

describe("deploy-profile k8s", () => {
  it("generates namespace, deployment, service, and configmap manifests", async () => {
    await runDeployProfile({ target: "k8s" });

    const output = logs.join("\n");
    expect(output).toContain("# --- namespace.yaml ---");
    expect(output).toContain("# --- configmap.yaml ---");
    expect(output).toContain("# --- deployment.yaml ---");
    expect(output).toContain("# --- service.yaml ---");
    expect(output).toContain("kind: Namespace");
    expect(output).toContain("kind: Deployment");
    expect(output).toContain("kind: Service");
    expect(output).toContain("kind: ConfigMap");
  });
});

// ---------------------------------------------------------------------------
// Custom options
// ---------------------------------------------------------------------------

describe("deploy-profile custom options", () => {
  it("applies custom moniker and chainId", async () => {
    await runDeployProfile({
      target: "local",
      moniker: "my-validator",
      chainId: "clawchain-testnet-42",
    });

    const output = logs.join("\n");
    expect(output).toContain('"moniker": "my-validator"');
    expect(output).toContain('"chainId": "clawchain-testnet-42"');
    expect(output).toContain("my-validator");
    expect(output).toContain("clawchain-testnet-42");
  });

  it("applies custom ports", async () => {
    await runDeployProfile({
      target: "docker",
      rpcPort: "36657",
      restPort: "2317",
    });

    const output = logs.join("\n");
    expect(output).toContain("36657:26657");
    expect(output).toContain("2317:1317");
  });
});

// ---------------------------------------------------------------------------
// JSON output mode
// ---------------------------------------------------------------------------

describe("deploy-profile JSON output", () => {
  it("outputs structured JSON with target and files array", async () => {
    const stdoutSpy: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdoutSpy.push(String(chunk));
      return true;
    });

    await runDeployProfile({ target: "local", json: true });

    const parsed = JSON.parse(stdoutSpy.join(""));
    expect(parsed.target).toBe("local");
    expect(parsed.files).toBeInstanceOf(Array);
    expect(parsed.files.length).toBeGreaterThanOrEqual(2);
    expect(parsed.files.map((f: any) => f.name)).toContain("clawd.json");
    expect(parsed.files.map((f: any) => f.name)).toContain("start-local.sh");
  });
});
