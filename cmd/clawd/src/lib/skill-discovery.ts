import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export type DiscoveredSkillExecutor = {
  filePath: string;
  skillName: string;
  skillId?: string;
  executorCommand?: string;
};

export function discoverSkillExecutors(roots: string[]): DiscoveredSkillExecutor[] {
  const files: string[] = [];
  for (const root of roots) {
    const abs = resolve(root);
    collectSkillFiles(abs, 0, 6, files);
  }

  const out: DiscoveredSkillExecutor[] = [];
  for (const filePath of files) {
    const raw = readFileSafe(filePath);
    if (!raw) continue;
    const skillName = parseSkillName(raw) ?? inferSkillNameFromPath(filePath);
    const skillId = parseSkillId(raw);
    const executorCommand = parseExecutorCommand(raw);
    out.push({
      filePath,
      skillName,
      skillId,
      executorCommand,
    });
  }
  return out;
}

function collectSkillFiles(dir: string, depth: number, maxDepth: number, out: string[]): void {
  if (depth > maxDepth) return;
  let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
  try {
    if (!statSync(dir).isDirectory()) return;
    entries = readdirSync(dir, { withFileTypes: true }) as Array<{
      name: string;
      isFile(): boolean;
      isDirectory(): boolean;
    }>;
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") {
      out.push(full);
      continue;
    }
    if (entry.isDirectory()) {
      collectSkillFiles(full, depth + 1, maxDepth, out);
    }
  }
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function parseSkillName(raw: string): string | undefined {
  const m = raw.match(/^\s*name\s*:\s*["']?([A-Za-z0-9._-]+)["']?\s*$/m);
  if (!m) return undefined;
  return m[1];
}

function parseSkillId(raw: string): string | undefined {
  const m = raw.match(/^\s*(?:skill_id|skill-id|skillId)\s*:\s*["']?(\d+)["']?\s*$/m);
  if (!m) return undefined;
  return m[1];
}

function parseExecutorCommand(raw: string): string | undefined {
  const m = raw.match(/^\s*(?:executor_command|executor-command|executorCommand)\s*:\s*["']?(.+?)["']?\s*$/m);
  if (!m) return undefined;
  return m[1].trim();
}

function inferSkillNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length >= 2) {
    return parts[parts.length - 2] || "unknown-skill";
  }
  return "unknown-skill";
}
