import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveOpenClawPackageRootSync } from "../infra/openclaw-root.js";
import type { RuntimeEnv } from "../runtime.js";

type RuntimeCheck = {
  id: string;
  ok: boolean;
  level: "ok" | "warn" | "error";
  summary: string;
  detail?: string;
};

type DelegateCommand = {
  bin: string;
  args: string[];
  cwd?: string;
};

type RuntimeCheckState = {
  checks: RuntimeCheck[];
  localClawdDir: string | null;
  localClawdDist: string | null;
  localClawdPkg: string | null;
  clawdConfigPath: string;
  clawdMnemonicPath: string;
  hasClawdConfig: boolean;
  hasClawdMnemonic: boolean;
  hasLocalClawdPkg: boolean;
  hasLocalClawdDist: boolean;
  delegateCommand: DelegateCommand | null;
  readinessBlockers: string[];
};

type RuntimeRepair = {
  id: string;
  ok: boolean;
  summary: string;
  detail?: string;
};

export async function doctorRuntimeCommand(
  runtime: RuntimeEnv,
  opts: { json?: boolean; repair?: boolean } = {},
): Promise<{ ok: boolean; checks: RuntimeCheck[] }> {
  let state = collectRuntimeChecks();
  const repairs: RuntimeRepair[] = [];

  if (opts.repair) {
    if (state.hasLocalClawdPkg && !state.hasLocalClawdDist) {
      repairs.push(repairLocalClawdBuild(state.localClawdDir));
      state = collectRuntimeChecks();
    }

    if (!state.hasClawdConfig) {
      repairs.push(repairClawdConfig(state.clawdConfigPath));
      state = collectRuntimeChecks();
    }

    if (!state.hasClawdMnemonic) {
      repairs.push(repairClawdMnemonic(state.delegateCommand));
      state = collectRuntimeChecks();
    }

    if (state.readinessBlockers.length > 0) {
      repairs.push(...repairReadinessBlockers(state));
      state = collectRuntimeChecks();
    }
  }

  const checks = state.checks;
  const ok = checks.every((c) => c.level !== "error");

  if (opts.json) {
    runtime.log(JSON.stringify({
      ok,
      checks,
      repairs,
      readinessBlockers: state.readinessBlockers,
    }, null, 2));
    return { ok, checks };
  }

  runtime.log("OpenClaw runtime preflight");
  if (opts.repair) {
    runtime.log("Repair mode enabled.");
  }
  for (const check of checks) {
    const marker = check.level === "ok" ? "[OK]" : check.level === "warn" ? "[WARN]" : "[ERR]";
    runtime.log(`${marker} ${check.summary}`);
    if (check.detail) {
      runtime.log(`      ${check.detail}`);
    }
  }
  if (state.readinessBlockers.length > 0) {
    runtime.log("");
    runtime.log("Integrated readiness blockers");
    for (const blocker of state.readinessBlockers) {
      runtime.log(`  - ${blocker}`);
    }
  }
  if (repairs.length > 0) {
    runtime.log("");
    runtime.log("Repairs");
    for (const r of repairs) {
      runtime.log(`${r.ok ? "[OK]" : "[WARN]"} ${r.summary}`);
      if (r.detail) {
        runtime.log(`      ${r.detail}`);
      }
    }
  }
  runtime.log(ok ? "Runtime preflight passed." : "Runtime preflight found blocking errors.");
  return { ok, checks };
}

function collectRuntimeChecks(): RuntimeCheckState {
  const checks: RuntimeCheck[] = [];
  const openclawRoot = resolveOpenClawPackageRootSync({
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    cwd: process.cwd(),
  });
  const repoRoot = openclawRoot ? resolve(openclawRoot, "..") : null;
  const localClawdDir = repoRoot ? join(repoRoot, "cmd", "clawd") : null;
  const localClawdDist = localClawdDir ? join(localClawdDir, "dist", "main.js") : null;
  const localClawdPkg = localClawdDir ? join(localClawdDir, "package.json") : null;
  const clawchainManifest = openclawRoot
    ? join(openclawRoot, "extensions", "clawchain", "openclaw.plugin.json")
    : null;

  checks.push({
    id: "openclaw-root",
    ok: Boolean(openclawRoot),
    level: openclawRoot ? "ok" : "error",
    summary: openclawRoot ? `openclaw root resolved: ${openclawRoot}` : "openclaw package root not resolved",
    detail: openclawRoot
      ? undefined
      : "Run from the OpenClaw repo or use installed OpenClaw CLI binaries.",
  });

  checks.push({
    id: "clawchain-plugin-manifest",
    ok: Boolean(clawchainManifest && existsSync(clawchainManifest)),
    level: clawchainManifest && existsSync(clawchainManifest) ? "ok" : "error",
    summary:
      clawchainManifest && existsSync(clawchainManifest)
        ? `clawchain plugin manifest found: ${clawchainManifest}`
        : "clawchain plugin manifest missing",
    detail:
      clawchainManifest && !existsSync(clawchainManifest)
        ? `Expected: ${clawchainManifest}`
        : undefined,
  });

  const explicitClawdBin = process.env.CLAWD_BIN?.trim() || null;
  const hasLocalClawdPkg = Boolean(localClawdPkg && existsSync(localClawdPkg));
  const hasLocalClawdDist = Boolean(localClawdDist && existsSync(localClawdDist));
  let delegateCommand: DelegateCommand | null = null;
  let readinessBlockers: string[] = [];

  if (explicitClawdBin) {
    const probe = spawnSync(explicitClawdBin, ["--version"], {
      stdio: "pipe",
      timeout: 4000,
      encoding: "utf8",
    });
    checks.push({
      id: "clawd-binary",
      ok: probe.status === 0,
      level: probe.status === 0 ? "ok" : "error",
      summary:
        probe.status === 0
          ? `CLAWD_BIN is executable: ${explicitClawdBin}`
          : `CLAWD_BIN failed to execute: ${explicitClawdBin}`,
      detail: probe.status === 0 ? undefined : (probe.stderr?.trim() || probe.error?.message),
    });
    if (probe.status === 0) {
      delegateCommand = { bin: explicitClawdBin, args: [] };
    }
  } else {
    if (hasLocalClawdDist) {
      checks.push({
        id: "clawd-delegate",
        ok: true,
        level: "ok",
        summary: `local clawd dist available: ${localClawdDist}`,
      });
      delegateCommand = { bin: process.execPath, args: [localClawdDist!] };
    } else {
      const pathProbe = spawnSync("clawd", ["--version"], {
        stdio: "pipe",
        timeout: 4000,
        encoding: "utf8",
      });
      const pathOk = pathProbe.status === 0;
      checks.push({
        id: "clawd-delegate",
        ok: pathOk || hasLocalClawdPkg,
        level: pathOk ? "ok" : hasLocalClawdPkg ? "warn" : "error",
        summary: pathOk
          ? "clawd binary available on PATH"
          : hasLocalClawdPkg
            ? "local cmd/clawd found but dist missing (openclaw up will bootstrap)"
            : "no clawd binary on PATH and no local cmd/clawd checkout found",
        detail: pathOk
          ? undefined
          : hasLocalClawdPkg
            ? `Expected dist output: ${localClawdDist}`
            : (pathProbe.stderr?.trim() || pathProbe.error?.message),
      });
      if (pathOk) {
        delegateCommand = { bin: "clawd", args: [] };
      }
    }
  }

  const clawdHome = process.env.CLAWD_HOME ?? join(homedir(), ".clawd");
  const clawdConfigPath = join(clawdHome, "clawd.json");
  const clawdMnemonicPath = join(clawdHome, "mnemonic.enc");

  const hasClawdConfig = existsSync(clawdConfigPath);
  if (hasClawdConfig) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(readFileSync(clawdConfigPath, "utf8")) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    const hasChainId = typeof parsed?.chainId === "string" && parsed.chainId.trim().length > 0;
    const hasRpc = typeof parsed?.rpcUrl === "string" && parsed.rpcUrl.trim().length > 0;
    checks.push({
      id: "clawd-config",
      ok: Boolean(parsed && hasChainId && hasRpc),
      level: parsed && hasChainId && hasRpc ? "ok" : "warn",
      summary:
        parsed && hasChainId && hasRpc
          ? `clawd config ready: ${clawdConfigPath}`
          : "clawd config missing required fields (chainId/rpcUrl)",
      detail: parsed ? undefined : `Failed to parse ${clawdConfigPath}`,
    });
  } else {
    checks.push({
      id: "clawd-config",
      ok: false,
      level: "warn",
      summary: "clawd config not found",
      detail: `Expected at ${clawdConfigPath}. Run: clawd init`,
    });
  }

  checks.push({
    id: "clawd-mnemonic",
    ok: existsSync(clawdMnemonicPath),
    level: existsSync(clawdMnemonicPath) ? "ok" : "warn",
    summary: existsSync(clawdMnemonicPath)
      ? `clawd mnemonic found: ${clawdMnemonicPath}`
      : "clawd mnemonic missing",
    detail: existsSync(clawdMnemonicPath) ? undefined : "Run: clawd init",
  });

  if (delegateCommand) {
    const probe = runSync(
      delegateCommand.bin,
      [...delegateCommand.args, "readiness", "--json"],
      delegateCommand.cwd,
      15_000,
    );
    if (probe.ok) {
      checks.push({
        id: "integrated-readiness",
        ok: true,
        level: "ok",
        summary: "integrated runtime+chain readiness passed",
      });
    } else {
      const parsed = parseReadinessProbe(probe.stdout);
      readinessBlockers = parsed.blockers;
      checks.push({
        id: "integrated-readiness",
        ok: false,
        level: "warn",
        summary: "integrated runtime+chain readiness has blockers",
        detail:
          readinessBlockers.length > 0
            ? readinessBlockers.map((b) => `- ${b}`).join("\n")
            : (parsed.detail ?? probe.detail),
      });
    }
  } else {
    checks.push({
      id: "integrated-readiness",
      ok: false,
      level: "warn",
      summary: "integrated runtime+chain readiness unavailable",
      detail: "No clawd command available to execute readiness probe.",
    });
  }

  return {
    checks,
    localClawdDir,
    localClawdDist,
    localClawdPkg,
    clawdConfigPath,
    clawdMnemonicPath,
    hasClawdConfig,
    hasClawdMnemonic: existsSync(clawdMnemonicPath),
    hasLocalClawdPkg,
    hasLocalClawdDist,
    delegateCommand,
    readinessBlockers,
  };
}

function repairLocalClawdBuild(localClawdDir: string | null): RuntimeRepair {
  if (!localClawdDir) {
    return {
      id: "repair-clawd-build",
      ok: false,
      summary: "Cannot repair clawd build (local cmd/clawd not found).",
    };
  }

  const installNpm = runSync("npm", ["install", "--no-audit", "--no-fund"], localClawdDir, 8 * 60_000);
  if (!installNpm.ok) {
    runSync("pnpm", ["install"], localClawdDir, 8 * 60_000);
  }

  const buildNpm = runSync("npm", ["run", "build"], localClawdDir, 4 * 60_000);
  if (!buildNpm.ok) {
    const buildPnpm = runSync("pnpm", ["run", "build"], localClawdDir, 4 * 60_000);
    return {
      id: "repair-clawd-build",
      ok: buildPnpm.ok,
      summary: buildPnpm.ok ? "Rebuilt local cmd/clawd." : "Failed to rebuild local cmd/clawd.",
      detail: buildPnpm.detail ?? buildNpm.detail,
    };
  }

  return {
    id: "repair-clawd-build",
    ok: true,
    summary: "Rebuilt local cmd/clawd.",
  };
}

function repairClawdConfig(clawdConfigPath: string): RuntimeRepair {
  try {
    mkdirSync(dirname(clawdConfigPath), { recursive: true });
    const nodeHome = join(process.env.HOME ?? homedir(), ".clawchain");
    const defaultConfig = {
      chainId: "clawchain-1",
      rpcUrl: "http://localhost:26657",
      restUrl: "http://localhost:1317",
      nodeAutoStart: true,
      nodeHome,
      denom: "uclaw",
      prefix: "claw",
      gasPrice: "0.025uclaw",
    };
    writeFileSync(clawdConfigPath, JSON.stringify(defaultConfig, null, 2) + "\n", "utf8");
    return {
      id: "repair-clawd-config",
      ok: true,
      summary: "Created default clawd config.",
      detail: clawdConfigPath,
    };
  } catch (err) {
    return {
      id: "repair-clawd-config",
      ok: false,
      summary: "Failed to write default clawd config.",
      detail: String(err),
    };
  }
}

function repairClawdMnemonic(delegate: DelegateCommand | null): RuntimeRepair {
  if (!delegate) {
    return {
      id: "repair-clawd-mnemonic",
      ok: false,
      summary: "Cannot repair mnemonic (clawd delegate command unavailable).",
    };
  }
  const result = runSync(delegate.bin, [...delegate.args, "init", "--skip-setup"], delegate.cwd, 4 * 60_000);
  return {
    id: "repair-clawd-mnemonic",
    ok: result.ok,
    summary: result.ok
      ? "Ran clawd init --skip-setup to generate mnemonic/config."
      : "Failed to run clawd init --skip-setup for mnemonic repair.",
    detail: result.detail,
  };
}

function repairReadinessBlockers(state: RuntimeCheckState): RuntimeRepair[] {
  const repairs: RuntimeRepair[] = [];

  const needsAgentAddress =
    state.readinessBlockers.some((b) =>
      b.includes("agentAddress is missing in clawd config"),
    );

  const needsManifestRejoin =
    state.readinessBlockers.some((b) =>
      b.startsWith("Chain RPC:") ||
      b.startsWith("Chain REST:") ||
      b.startsWith("Peer connectivity:"),
    );

  const needsMessagingEndpoint =
    state.readinessBlockers.some((b) =>
      b.includes("Messaging endpoint: messagingEndpoint is missing in clawd config"),
    );

  if (needsAgentAddress) {
    repairs.push(repairAgentAddressFromKeyring(state.delegateCommand, state.clawdConfigPath));
  }

  if (needsManifestRejoin) {
    repairs.push(repairJoinFromManifest(state.delegateCommand, state.clawdConfigPath));
  }

  if (needsMessagingEndpoint) {
    repairs.push(repairMessagingEndpointFromConfig(state.clawdConfigPath));
  }

  if (repairs.length === 0) {
    repairs.push({
      id: "repair-readiness",
      ok: false,
      summary: "No automatic repair available for current integrated readiness blockers.",
      detail: state.readinessBlockers.join(" | "),
    });
  }

  return repairs;
}

function repairAgentAddressFromKeyring(
  delegate: DelegateCommand | null,
  clawdConfigPath: string,
): RuntimeRepair {
  if (!delegate) {
    return {
      id: "repair-agent-address",
      ok: false,
      summary: "Cannot repair agentAddress (clawd delegate command unavailable).",
    };
  }

  try {
    if (!existsSync(clawdConfigPath)) {
      return {
        id: "repair-agent-address",
        ok: false,
        summary: "Cannot repair agentAddress (clawd config missing).",
        detail: clawdConfigPath,
      };
    }

    const raw = readFileSync(clawdConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const existing =
      typeof parsed.agentAddress === "string" ? parsed.agentAddress.trim() : "";
    if (existing.length > 0) {
      return {
        id: "repair-agent-address",
        ok: true,
        summary: "agentAddress already configured.",
        detail: existing,
      };
    }

    const keyRes = runSync(
      delegate.bin,
      [...delegate.args, "keys", "show", "agent", "-a"],
      delegate.cwd,
      20_000,
    );
    if (!keyRes.ok) {
      return {
        id: "repair-agent-address",
        ok: false,
        summary: "Failed to read agent address from local keyring.",
        detail: keyRes.detail,
      };
    }

    const address = (keyRes.stdout ?? "").trim();
    if (address.length === 0) {
      return {
        id: "repair-agent-address",
        ok: false,
        summary: "Local keyring returned empty agent address.",
      };
    }

    parsed.agentAddress = address;
    writeFileSync(clawdConfigPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    return {
      id: "repair-agent-address",
      ok: true,
      summary: "Recovered and saved agentAddress from local keyring.",
      detail: address,
    };
  } catch (err) {
    return {
      id: "repair-agent-address",
      ok: false,
      summary: "Failed to repair agentAddress from local keyring.",
      detail: String(err),
    };
  }
}

function repairJoinFromManifest(
  delegate: DelegateCommand | null,
  clawdConfigPath: string,
): RuntimeRepair {
  if (!delegate) {
    return {
      id: "repair-join-from-manifest",
      ok: false,
      summary: "Cannot apply manifest rejoin repair (clawd delegate command unavailable).",
    };
  }

  try {
    if (!existsSync(clawdConfigPath)) {
      return {
        id: "repair-join-from-manifest",
        ok: false,
        summary: "Cannot apply manifest rejoin repair (clawd config missing).",
        detail: clawdConfigPath,
      };
    }

    const raw = readFileSync(clawdConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const manifest =
      typeof parsed.networkManifest === "string" ? parsed.networkManifest.trim() : "";
    if (manifest.length === 0) {
      return {
        id: "repair-join-from-manifest",
        ok: false,
        summary: "No networkManifest found in clawd config for endpoint/seed repair.",
      };
    }

    const joinRes = runSync(
      delegate.bin,
      [...delegate.args, "join", "--from-manifest", manifest, "--no-sync-genesis"],
      delegate.cwd,
      60_000,
    );
    return {
      id: "repair-join-from-manifest",
      ok: joinRes.ok,
      summary: joinRes.ok
        ? "Re-applied join config from networkManifest."
        : "Failed to re-apply join config from networkManifest.",
      detail: joinRes.ok ? manifest : joinRes.detail,
    };
  } catch (err) {
    return {
      id: "repair-join-from-manifest",
      ok: false,
      summary: "Failed to apply manifest-based readiness repair.",
      detail: String(err),
    };
  }
}

function repairMessagingEndpointFromConfig(clawdConfigPath: string): RuntimeRepair {
  try {
    if (!existsSync(clawdConfigPath)) {
      return {
        id: "repair-messaging-endpoint",
        ok: false,
        summary: "Cannot derive messaging endpoint (clawd config missing).",
        detail: clawdConfigPath,
      };
    }

    const raw = readFileSync(clawdConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const existing = typeof parsed.messagingEndpoint === "string" ? parsed.messagingEndpoint.trim() : "";
    if (existing.length > 0) {
      return {
        id: "repair-messaging-endpoint",
        ok: true,
        summary: "Messaging endpoint already configured.",
        detail: existing,
      };
    }

    const messagingPort =
      typeof parsed.messagingPort === "number" && Number.isFinite(parsed.messagingPort)
        ? parsed.messagingPort
        : 7777;
    const publicHost = typeof parsed.publicHost === "string" ? parsed.publicHost.trim() : "";
    const endpoint = deriveMessagingEndpoint(publicHost, messagingPort);
    parsed.messagingEndpoint = endpoint;
    writeFileSync(clawdConfigPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");

    return {
      id: "repair-messaging-endpoint",
      ok: true,
      summary: "Derived and saved messaging endpoint in clawd config.",
      detail: endpoint,
    };
  } catch (err) {
    return {
      id: "repair-messaging-endpoint",
      ok: false,
      summary: "Failed to derive messaging endpoint from clawd config.",
      detail: String(err),
    };
  }
}

function deriveMessagingEndpoint(hostValue: string, port: number): string {
  if (hostValue.length === 0) {
    return `http://localhost:${port}`;
  }
  if (!hostValue.includes("://")) {
    return `http://${hostValue}:${port}`;
  }
  try {
    const url = new URL(hostValue);
    if (url.port) {
      return `${url.protocol}//${url.host}`;
    }
    return `${url.protocol}//${url.hostname}:${port}`;
  } catch {
    return `http://localhost:${port}`;
  }
}

function runSync(
  bin: string,
  args: string[],
  cwd?: string,
  timeoutMs: number = 10_000,
): { ok: boolean; detail?: string; stdout?: string } {
  const out = spawnSync(bin, args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
    timeout: timeoutMs,
  });
  const ok = out.status === 0;
  if (ok) {
    return { ok: true, stdout: out.stdout?.toString() ?? "" };
  }
  return {
    ok: false,
    stdout: out.stdout?.toString() ?? "",
    detail: out.stderr?.trim() || out.stdout?.trim() || out.error?.message || `exit=${out.status}`,
  };
}

function parseReadinessProbe(raw?: string): { blockers: string[]; detail?: string } {
  if (!raw || raw.trim().length === 0) {
    return { blockers: [] };
  }
  try {
    const parsed = JSON.parse(raw) as {
      blockers?: Array<{ name?: string; detail?: string }>;
    };
    const blockers = (parsed.blockers ?? [])
      .map((b) => `${b.name ?? "unknown"}: ${b.detail ?? ""}`.trim())
      .filter((b) => b.length > 0);
    return { blockers };
  } catch {
    return {
      blockers: [],
      detail: raw.trim(),
    };
  }
}
