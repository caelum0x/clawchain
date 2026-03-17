#!/usr/bin/env node
import { spawn } from "node:child_process";

async function main() {
  const input = await readStdin();
  let payload;
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    process.stderr.write("invalid JSON payload on stdin\n");
    process.exit(1);
  }

  const req = normalizeRequirements(payload?.requirements);
  const command = resolveCommand(payload, req);
  if (!command) {
    process.stderr.write(
      "missing executor command (requirements.executor.command / requirements.skill.command / CLAWD_SKILL_COMMAND_MAP_JSON)\n",
    );
    process.exit(2);
  }

  const timeoutMs = Number(process.env.CLAWD_SKILL_EXECUTOR_TIMEOUT_MS || 90000);
  const result = await runShellCommand(command, payload, timeoutMs);
  const output = {
    result: result.stdout.trim() || `executor_ok: ${command}`,
    meta: {
      command,
      stderr: result.stderr.trim(),
      exitCode: result.code,
    },
  };
  process.stdout.write(JSON.stringify(output));
}

function normalizeRequirements(v) {
  if (v && typeof v === "object") return v;
  if (typeof v === "string" && v.trim()) {
    try {
      return JSON.parse(v);
    } catch {
      return { text: v };
    }
  }
  return {};
}

function resolveCommand(payload, req) {
  const direct = String(req?.executor?.command || "").trim();
  if (direct) return direct;
  const skillCmd = String(req?.skill?.command || "").trim();
  if (skillCmd) return skillCmd;

  const skillId = String(payload?.skillId ?? "").trim();
  if (!skillId) return "";
  const mapRaw = String(process.env.CLAWD_SKILL_COMMAND_MAP_JSON || "").trim();
  if (!mapRaw) return "";
  try {
    const parsed = JSON.parse(mapRaw);
    return String(parsed?.[skillId] || "").trim();
  } catch {
    return "";
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
    });
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
}

function runShellCommand(command, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL || "zsh";
    const child = spawn(shell, ["-lc", command], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`executor timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`executor failed (code=${code}): ${stderr.trim()}`));
        return;
      }
      resolve({ stdout, stderr, code });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
