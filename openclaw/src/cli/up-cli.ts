import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

export function registerUpCli(program: Command) {
  program
    .command("up")
    .description("Start AI agent + ClawChain node runtime (delegates to clawd up)")
    .option("--require-ready", "fail startup unless integrated runtime+chain readiness passes")
    .option("--skip-ready-gate", "disable default readiness gating (for local dev/debug)")
    .option("--ready-timeout-seconds <seconds>", "readiness wait timeout in seconds (default: 120)", parseInt)
    .option("--json", "output machine-readable startup report")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .addHelpText(
      "after",
      () =>
        `${theme.muted("Notes:")} For full flags, run \`openclaw up -- --help\`\n` +
        `${theme.muted("Example:")} \`openclaw up --require-ready --ready-timeout-seconds 180\`\n` +
        `${theme.muted("Dev:")} \`openclaw up --skip-ready-gate\`\n` +
        `${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`,
    )
    .action(async () => {
      const releaseLock = acquireOpenClawBootstrapLockOrExit();
      const args = extractDelegatedArgsAfter(process.argv, "up");
      try {
        if (args.includes("--json")) {
          const out = await runDelegatedClawdUpJson(args);
          process.stdout.write(`${JSON.stringify(out.report, null, 2)}\n`);
          process.exit(out.code);
          return;
        }
        const code = await runDelegatedClawdUp(args);
        process.exit(code);
      } finally {
        releaseLock();
      }
    });
}

export async function runDelegatedClawdUp(args: string[]): Promise<number> {
  const invocation = await resolveDelegatedUpInvocation(args);
  return spawnDelegated(invocation.bin, invocation.args, invocation.cwd);
}

export async function runDelegatedClawdUpJson(
  args: string[],
): Promise<{ code: number; report: Record<string, unknown> }> {
  const invocation = await resolveDelegatedUpInvocation(args);
  const out = await spawnDelegatedCapture(invocation.bin, invocation.args, invocation.cwd);
  const parsed = parseTrailingJsonObject(out.stdout);
  if (parsed) {
    return { code: out.code, report: parsed };
  }
  return {
    code: out.code,
    report: {
      ok: false,
      stage: "delegate",
      error: "Failed to parse clawd up --json output",
      exitCode: out.code,
      stdout: out.stdout,
      stderr: out.stderr,
    },
  };
}

async function resolveDelegatedUpInvocation(args: string[]): Promise<{ bin: string; args: string[]; cwd?: string }> {
  const explicitBin = process.env.CLAWD_BIN?.trim();
  if (explicitBin) {
    return { bin: explicitBin, args: ["up", ...args] };
  }

  const localClawdTs = resolveLocalClawdSrcMain();
  if (localClawdTs) {
    return { bin: process.execPath, args: ["--import", "tsx", localClawdTs, "up", ...args] };
  }

  const localClawdJs = resolveLocalClawdDistMain();
  if (localClawdJs) {
    return { bin: process.execPath, args: [localClawdJs, "up", ...args] };
  }

  const localClawdDir = resolveLocalClawdDir();
  if (localClawdDir && !isTruthy(process.env.OPENCLAW_SKIP_CLAWD_BOOTSTRAP)) {
    const bootstrapped = await bootstrapLocalClawd(localClawdDir);
    if (bootstrapped) {
      const builtJs = resolveLocalClawdDistMain();
      if (builtJs) {
        return { bin: process.execPath, args: [builtJs, "up", ...args] };
      }
    }
  }

  return { bin: "clawd", args: ["up", ...args] };
}

function resolveLocalClawdDistMain(): string | null {
  const dir = resolveLocalClawdDir();
  if (!dir) {return null;}
  const candidate = join(dir, "dist", "main.js");
  if (existsSync(candidate)) {return candidate;}
  return null;
}

function resolveLocalClawdDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = join(here, "..", "..", "..", "cmd", "clawd");
  if (existsSync(join(candidate, "package.json"))) {return candidate;}
  return null;
}

function resolveLocalClawdSrcMain(): string | null {
  const dir = resolveLocalClawdDir();
  if (!dir) {return null;}
  const candidate = join(dir, "src", "main.ts");
  const commanderDep = join(dir, "node_modules", "commander");
  if (existsSync(candidate) && existsSync(commanderDep)) {return candidate;}
  return null;
}

export function extractDelegatedArgsAfter(argv: string[], token: string): string[] {
  const index = argv.findIndex((part) => part === token);
  if (index < 0) {return [];}
  return argv.slice(index + 1);
}

function spawnDelegated(
  bin: string,
  args: string[],
  cwd?: string,
  timeoutMs?: number,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: "inherit",
      env: process.env,
      cwd,
    });
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let killHandle: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        console.error(`openclaw up: command timed out after ${Math.floor(timeoutMs / 1000)}s: ${bin} ${args.join(" ")}`);
        child.kill("SIGTERM");
        killHandle = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000);
      }, timeoutMs);
    }

    child.on("error", (err) => {
      if (timeoutHandle) {clearTimeout(timeoutHandle);}
      if (killHandle) {clearTimeout(killHandle);}
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(
          `openclaw up: failed to start delegated runtime (${bin} not found). ` +
            "Build/install clawd first or set CLAWD_BIN.",
        );
      } else {
        console.error(`openclaw up: failed to start delegated runtime: ${String(err)}`);
      }
      resolve(1);
    });

    child.on("exit", (code, signal) => {
      if (timeoutHandle) {clearTimeout(timeoutHandle);}
      if (killHandle) {clearTimeout(killHandle);}
      if (timedOut) {
        resolve(124);
        return;
      }
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code ?? 0);
    });
  });
}

function spawnDelegatedCapture(
  bin: string,
  args: string[],
  cwd?: string,
  timeoutMs?: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let killHandle: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs && timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        stderr += `openclaw up: command timed out after ${Math.floor(timeoutMs / 1000)}s: ${bin} ${args.join(" ")}\n`;
        child.kill("SIGTERM");
        killHandle = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000);
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      if (timeoutHandle) {clearTimeout(timeoutHandle);}
      if (killHandle) {clearTimeout(killHandle);}
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}${String(err)}`,
      });
    });

    child.on("exit", (code, signal) => {
      if (timeoutHandle) {clearTimeout(timeoutHandle);}
      if (killHandle) {clearTimeout(killHandle);}
      if (timedOut) {
        resolve({ code: 124, stdout, stderr });
        return;
      }
      if (signal) {
        resolve({ code: 128, stdout, stderr });
        return;
      }
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function parseTrailingJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {return null;}

  const parseCandidate = (candidate: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(trimmed);
  if (direct) {return direct;}

  const starts = [trimmed.lastIndexOf("\n{"), trimmed.lastIndexOf("{")]
    .filter((v, i, arr) => v >= 0 && arr.indexOf(v) === i)
    .map((v) => (trimmed[v] === "{" ? v : v + 1));

  for (const start of starts) {
    const candidate = trimmed.slice(start);
    const parsed = parseCandidate(candidate);
    if (parsed) {return parsed;}
  }

  return null;
}

async function bootstrapLocalClawd(clawdDir: string): Promise<boolean> {
  const distMain = join(clawdDir, "dist", "main.js");
  if (existsSync(distMain)) {return true;}

  console.warn("openclaw up: local cmd/clawd build not found; bootstrapping local clawd...");
  const hasDeps = existsSync(join(clawdDir, "node_modules", "commander"));

  if (!hasDeps) {
    const installCode = await installClawdDeps(clawdDir);
    if (installCode !== 0) {
      console.error("openclaw up: failed to install cmd/clawd dependencies.");
      return false;
    }
  }

  const buildCode = await buildClawd(clawdDir);
  if (buildCode !== 0) {
    console.error("openclaw up: failed to build cmd/clawd.");
    return false;
  }

  return existsSync(distMain);
}

async function installClawdDeps(clawdDir: string): Promise<number> {
  // npm first for portability, pnpm fallback for workspace setups.
  const npmCode = await spawnDelegated(
    "npm",
    ["install", "--no-audit", "--no-fund"],
    clawdDir,
    8 * 60 * 1000,
  );
  if (npmCode === 0) {return 0;}

  console.warn("openclaw up: npm install failed/timed out; trying pnpm fallback...");
  return spawnDelegated(
    "pnpm",
    ["install"],
    clawdDir,
    8 * 60 * 1000,
  );
}

async function buildClawd(clawdDir: string): Promise<number> {
  const npmCode = await spawnDelegated(
    "npm",
    ["run", "build"],
    clawdDir,
    4 * 60 * 1000,
  );
  if (npmCode === 0) {return 0;}

  console.warn("openclaw up: npm build failed/timed out; trying pnpm fallback...");
  return spawnDelegated(
    "pnpm",
    ["run", "build"],
    clawdDir,
    4 * 60 * 1000,
  );
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {return false;}
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

type LockPayload = {
  pid: number;
  startedAt: number;
  command: string;
};

const OPENCLAW_UP_LOCK_PATH =
  process.env.OPENCLAW_UP_LOCK_PATH ??
  join(process.env.OPENCLAW_HOME ?? join(homedir(), ".openclaw"), "runtime-up.lock");
const OPENCLAW_UP_LOCK_STALE_MS = 30 * 60 * 1000;

export function acquireOpenClawBootstrapLockOrExit(commandLabel = "openclaw up"): () => void {
  mkdirSync(dirname(OPENCLAW_UP_LOCK_PATH), { recursive: true });
  const payload: LockPayload = {
    pid: process.pid,
    startedAt: Date.now(),
    command: commandLabel,
  };

  try {
    writeFileSync(OPENCLAW_UP_LOCK_PATH, JSON.stringify(payload, null, 2) + "\n", {
      encoding: "utf8",
      flag: "wx",
    });
    return () => releaseOpenClawUpLock();
  } catch {
    const existing = readOpenClawLockPayload();
    const now = Date.now();
    if (existing && isOpenClawLockLikelyStale(existing, now)) {
      releaseOpenClawUpLock();
      try {
        writeFileSync(OPENCLAW_UP_LOCK_PATH, JSON.stringify(payload, null, 2) + "\n", {
          encoding: "utf8",
          flag: "wx",
        });
        return () => releaseOpenClawUpLock();
      } catch {
        // fall through to error
      }
    }
    const detail = existing
      ? `lock held by pid=${existing.pid} (${existing.command}) started ${new Date(existing.startedAt).toISOString()}`
      : "lock file exists and could not be parsed";
    console.error(
      `${commandLabel}: another runtime bootstrap appears to be running. ${detail}\n` +
        `If stale, remove: ${OPENCLAW_UP_LOCK_PATH}`,
    );
    process.exit(1);
  }
}

function readOpenClawLockPayload(): LockPayload | null {
  try {
    const raw = readFileSync(OPENCLAW_UP_LOCK_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockPayload>;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.startedAt === "number" &&
      typeof parsed.command === "string"
    ) {
      return parsed as LockPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function isOpenClawLockLikelyStale(payload: LockPayload, now: number): boolean {
  if (now - payload.startedAt > OPENCLAW_UP_LOCK_STALE_MS) {return true;}
  try {
    process.kill(payload.pid, 0);
    return false;
  } catch {
    return true;
  }
}

function releaseOpenClawUpLock() {
  try {
    unlinkSync(OPENCLAW_UP_LOCK_PATH);
  } catch {
    // ignore
  }
}
