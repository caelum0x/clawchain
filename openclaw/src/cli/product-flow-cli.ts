import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

export function registerProductFlowCli(program: Command) {
  program
    .command("product-flow")
    .description("Run end-to-end product lifecycle (delegates to clawd product-flow)")
    .option("--json", "output machine-readable lifecycle report")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .addHelpText(
      "after",
      () =>
        `${theme.muted("Notes:")} For full flags, run \`openclaw product-flow -- --help\`\n` +
        `${theme.muted("Example:")} \`openclaw product-flow --assignee claw1... --task-description "Deliver report" --message-ciphertext base64:... --skill-id 1 --json\`\n` +
        `${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`,
    )
    .action(async () => {
      const args = extractDelegatedArgs(process.argv);
      if (args.includes("--json")) {
        const out = await runDelegatedProductFlowJson(args);
        process.stdout.write(`${JSON.stringify(out.report, null, 2)}\n`);
        process.exit(out.code);
        return;
      }
      const code = await runDelegatedProductFlow(args);
      process.exit(code);
    });
}

async function runDelegatedProductFlow(args: string[]): Promise<number> {
  const invocation = await resolveDelegatedProductFlowInvocation(args);
  return spawnDelegated(invocation.bin, invocation.args, invocation.cwd);
}

async function runDelegatedProductFlowJson(
  args: string[],
): Promise<{ code: number; report: Record<string, unknown> }> {
  const invocation = await resolveDelegatedProductFlowInvocation(args);
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
      error: "Failed to parse clawd product-flow --json output",
      exitCode: out.code,
      stdout: out.stdout,
      stderr: out.stderr,
    },
  };
}

async function resolveDelegatedProductFlowInvocation(
  args: string[],
): Promise<{ bin: string; args: string[]; cwd?: string }> {
  const explicitBin = process.env.CLAWD_BIN?.trim();
  if (explicitBin) {
    return { bin: explicitBin, args: ["product-flow", ...args] };
  }

  const localClawdTs = resolveLocalClawdSrcMain();
  if (localClawdTs) {
    return { bin: process.execPath, args: ["--import", "tsx", localClawdTs, "product-flow", ...args] };
  }

  const localClawdJs = resolveLocalClawdDistMain();
  if (localClawdJs) {
    return { bin: process.execPath, args: [localClawdJs, "product-flow", ...args] };
  }

  return { bin: "clawd", args: ["product-flow", ...args] };
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

function extractDelegatedArgs(argv: string[]): string[] {
  const index = argv.findIndex((part) => part === "product-flow");
  if (index < 0) {return [];}
  return argv.slice(index + 1);
}

function spawnDelegated(bin: string, args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: "inherit",
      env: process.env,
      cwd,
    });
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(
          `openclaw product-flow: failed to start delegated runtime (${bin} not found). ` +
            "Build/install clawd first or set CLAWD_BIN.",
        );
      } else {
        console.error(`openclaw product-flow: failed to start delegated runtime: ${String(err)}`);
      }
      resolve(1);
    });
    child.on("exit", (code, signal) => {
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
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      cwd,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}${String(err)}`,
      });
    });

    child.on("exit", (code, signal) => {
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
