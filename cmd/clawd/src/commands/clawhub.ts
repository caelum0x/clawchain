/**
 * `clawd clawhub` subcommands — validate, search, install, publish, list skills.
 *
 * Provides a local quality gate for skill publishing and integrates with the
 * ClawHub registry for search/install/publish operations.
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, relative, basename } from "node:path";
import { loadClawdConfig } from "../lib/config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLAWHUB_REGISTRY = process.env.CLAWHUB_REGISTRY ?? "https://clawhub.com";
const DEFAULT_SKILLS_DIR = process.env.CLAWHUB_WORKDIR ?? join(process.cwd(), "skills");

const VALID_CATEGORIES = [
  "productivity",
  "coding",
  "research",
  "creative",
  "data",
  "communication",
  "finance",
  "utility",
] as const;

const BLOCKED_PACKAGES = [
  "event-stream",
  "flatmap-stream",
  "ua-parser-js",
  "coa",
  "rc",
  "colors",
  "faker",
  "node-ipc",
  "peacenotwar",
] as const;

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;
const MAX_TOTAL_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 1 * 1024 * 1024;

const SECURITY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\beval\s*\(/, label: "eval()" },
  { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/, label: "require('child_process')" },
  { pattern: /\bfs\.writeFileSync\s*\(/, label: "fs.writeFileSync to arbitrary path" },
];

const HANDLER_EXTENSIONS = [".ts", ".js", ".mjs", ".cjs"];

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function red(s: string): string { return `${RED}${s}${RESET}`; }
function green(s: string): string { return `${GREEN}${s}${RESET}`; }
function yellow(s: string): string { return `${YELLOW}${s}${RESET}`; }
function cyan(s: string): string { return `${CYAN}${s}${RESET}`; }
function bold(s: string): string { return `${BOLD}${s}${RESET}`; }
function dim(s: string): string { return `${DIM}${s}${RESET}`; }

// ---------------------------------------------------------------------------
// Shared validation logic (mirrors clawhub-validator.ts in the extension)
// ---------------------------------------------------------------------------

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

interface SkillManifest {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  category?: string;
  [key: string]: unknown;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function readJsonFile(filePath: string): unknown | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isHandlerFile(filePath: string): boolean {
  return HANDLER_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

function validateSkillDir(skillPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  const absPath = resolve(skillPath);

  if (!existsSync(absPath)) {
    return { valid: false, errors: [`Skill directory not found: ${absPath}`], warnings: [], score: 0 };
  }

  let dirStat;
  try {
    dirStat = statSync(absPath);
  } catch {
    return { valid: false, errors: [`Cannot stat skill path: ${absPath}`], warnings: [], score: 0 };
  }
  if (!dirStat.isDirectory()) {
    return { valid: false, errors: [`Path is not a directory: ${absPath}`], warnings: [], score: 0 };
  }

  // Manifest
  const manifestJsonPath = join(absPath, "manifest.json");
  const skillJsonPath = join(absPath, "skill.json");
  let manifestPath: string | null = null;

  if (existsSync(manifestJsonPath)) {
    manifestPath = manifestJsonPath;
  } else if (existsSync(skillJsonPath)) {
    manifestPath = skillJsonPath;
  }

  if (!manifestPath) {
    errors.push("Missing required file: manifest.json (or skill.json)");
    score -= 30;
  }

  let manifest: SkillManifest | null = null;
  if (manifestPath) {
    const parsed = readJsonFile(manifestPath);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors.push(`Invalid JSON in ${basename(manifestPath)}`);
      score -= 20;
    } else {
      manifest = parsed as SkillManifest;
    }
  }

  if (manifest) {
    if (typeof manifest.name !== "string" || manifest.name.length < 3 || manifest.name.length > 50) {
      errors.push("Manifest 'name' must be a string between 3 and 50 characters");
      score -= 10;
    }
    if (typeof manifest.version !== "string" || !SEMVER_RE.test(manifest.version)) {
      errors.push("Manifest 'version' must be a valid semver string (e.g., 1.0.0)");
      score -= 10;
    }
    if (typeof manifest.description !== "string" || manifest.description.length === 0) {
      errors.push("Manifest 'description' is required and must be a non-empty string");
      score -= 5;
    }
    if (typeof manifest.author !== "string" || manifest.author.length === 0) {
      errors.push("Manifest 'author' is required and must be a non-empty string");
      score -= 5;
    }
    if (typeof manifest.category !== "string") {
      errors.push("Manifest 'category' is required");
      score -= 5;
    } else if (!(VALID_CATEGORIES as readonly string[]).includes(manifest.category)) {
      errors.push(
        `Manifest 'category' must be one of: ${VALID_CATEGORIES.join(", ")} (got: "${manifest.category}")`,
      );
      score -= 5;
    }
  }

  // Handler files
  const allFiles = walkDir(absPath);
  const handlerFiles = allFiles.filter((f) => isHandlerFile(f));

  if (handlerFiles.length === 0) {
    errors.push("No handler files found (expected at least one .ts, .js, .mjs, or .cjs file)");
    score -= 15;
  }

  // Size limits
  let totalSize = 0;
  for (const filePath of allFiles) {
    try {
      const st = statSync(filePath);
      totalSize += st.size;
      if (st.size > MAX_SINGLE_FILE_BYTES) {
        const relName = relative(absPath, filePath);
        errors.push(`File exceeds 1 MB limit: ${relName} (${(st.size / 1024 / 1024).toFixed(2)} MB)`);
        score -= 10;
      }
    } catch { /* skip */ }
  }

  if (totalSize > MAX_TOTAL_SIZE_BYTES) {
    errors.push(`Total skill size exceeds 5 MB limit (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    score -= 15;
  }

  // Security scan
  const sourceFiles = allFiles.filter((f) => isHandlerFile(f));
  for (const srcFile of sourceFiles) {
    try {
      const content = readFileSync(srcFile, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const { pattern, label } of SECURITY_PATTERNS) {
          if (pattern.test(line)) {
            errors.push(`Security violation in ${relative(absPath, srcFile)}:${i + 1} — ${label}`);
            score -= 10;
          }
        }
      }
    } catch { /* skip */ }
  }

  // Dependency blocklist
  const packageJsonPath = join(absPath, "package.json");
  if (existsSync(packageJsonPath)) {
    const pkgJson = readJsonFile(packageJsonPath);
    if (pkgJson && typeof pkgJson === "object" && !Array.isArray(pkgJson)) {
      const pkg = pkgJson as Record<string, unknown>;
      const deps = {
        ...(typeof pkg.dependencies === "object" && pkg.dependencies !== null
          ? (pkg.dependencies as Record<string, string>)
          : {}),
        ...(typeof pkg.devDependencies === "object" && pkg.devDependencies !== null
          ? (pkg.devDependencies as Record<string, string>)
          : {}),
      };
      for (const blocked of BLOCKED_PACKAGES) {
        if (blocked in deps) {
          errors.push(`Blocked dependency found: ${blocked}`);
          score -= 10;
        }
      }
    }
  }

  // README recommended
  if (!existsSync(join(absPath, "README.md")) && !existsSync(join(absPath, "readme.md"))) {
    warnings.push("README.md is recommended for discoverability");
    score -= 3;
  }

  score = Math.max(0, Math.min(100, score));

  return { valid: errors.length === 0, errors, warnings, score };
}

// ---------------------------------------------------------------------------
// clawd clawhub validate <path>
// ---------------------------------------------------------------------------

export type ClawHubValidateOptions = {
  path: string;
  json?: boolean;
};

export async function runClawHubValidate(opts: ClawHubValidateOptions): Promise<void> {
  const result = validateSkillDir(opts.path);

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  console.log(bold(`\nClawHub Skill Validation: ${resolve(opts.path)}\n`));

  // Score bar
  const scoreColor = result.score >= 80 ? green : result.score >= 50 ? yellow : red;
  console.log(`  Score: ${scoreColor(String(result.score))} / 100`);

  // Errors
  if (result.errors.length > 0) {
    console.log(`\n  ${red("Errors")} (${result.errors.length}):`);
    for (const err of result.errors) {
      console.log(`    ${red("✗")} ${err}`);
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log(`\n  ${yellow("Warnings")} (${result.warnings.length}):`);
    for (const warn of result.warnings) {
      console.log(`    ${yellow("!")} ${warn}`);
    }
  }

  // Summary
  console.log();
  if (result.valid) {
    console.log(`  ${green("PASS")} — Skill is ready for publishing.`);
  } else {
    console.log(`  ${red("FAIL")} — Fix the errors above before publishing.`);
  }
  console.log();

  if (!result.valid) {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// clawd clawhub search <query>
// ---------------------------------------------------------------------------

export type ClawHubSearchOptions = {
  query: string;
  json?: boolean;
};

export async function runClawHubSearch(opts: ClawHubSearchOptions): Promise<void> {
  const url = `${CLAWHUB_REGISTRY}/api/v1/skills/search?q=${encodeURIComponent(opts.query)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`ClawHub search failed (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { skills?: Array<{ name?: string; version?: string; description?: string; author?: string; downloads?: number }> };
    const skills = data.skills ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ skills }, null, 2) + "\n");
      return;
    }

    if (skills.length === 0) {
      console.log(`No skills found matching "${opts.query}".`);
      return;
    }

    console.log(bold(`\nClawHub Search: "${opts.query}" (${skills.length} results)\n`));

    for (const skill of skills) {
      console.log(`  ${cyan(skill.name ?? "unknown")} ${dim(`v${skill.version ?? "?"}`)}  by ${skill.author ?? "unknown"}`);
      console.log(`    ${skill.description ?? ""}`);
      if (skill.downloads !== undefined) {
        console.log(`    ${dim(`${skill.downloads} downloads`)}`);
      }
      console.log();
    }
  } catch (err) {
    console.error(`ClawHub search failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd clawhub install <name>
// ---------------------------------------------------------------------------

export type ClawHubInstallOptions = {
  name: string;
  version?: string;
  dir?: string;
};

export async function runClawHubInstall(opts: ClawHubInstallOptions): Promise<void> {
  const skillsDir = opts.dir ? resolve(opts.dir) : DEFAULT_SKILLS_DIR;
  const versionParam = opts.version ? `?version=${encodeURIComponent(opts.version)}` : "";
  const url = `${CLAWHUB_REGISTRY}/api/v1/skills/${encodeURIComponent(opts.name)}/download${versionParam}`;

  console.log(`Installing skill "${opts.name}"${opts.version ? ` v${opts.version}` : ""}...`);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      console.error(`Failed to download skill "${opts.name}" (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as {
      skill?: { name?: string; version?: string; files?: Array<{ path: string; content: string }> };
    };

    if (!data.skill?.files || data.skill.files.length === 0) {
      console.error("Skill package contains no files.");
      process.exit(1);
    }

    const targetDir = join(skillsDir, data.skill.name ?? opts.name);
    mkdirSync(targetDir, { recursive: true });

    for (const file of data.skill.files) {
      const filePath = join(targetDir, file.path);
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, file.content, "utf-8");
    }

    console.log(green(`Installed "${data.skill.name ?? opts.name}" v${data.skill.version ?? "latest"} to ${targetDir}`));
  } catch (err) {
    console.error(`Failed to install skill: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd clawhub publish <path>
// ---------------------------------------------------------------------------

export type ClawHubPublishOptions = {
  path: string;
};

export async function runClawHubPublish(opts: ClawHubPublishOptions): Promise<void> {
  const absPath = resolve(opts.path);

  // Step 1: Validate
  console.log("Validating skill...\n");
  const result = validateSkillDir(absPath);

  if (!result.valid) {
    console.log(red("Validation failed. Fix the following errors before publishing:\n"));
    for (const err of result.errors) {
      console.log(`  ${red("✗")} ${err}`);
    }
    console.log();
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      console.log(`  ${yellow("!")} ${warn}`);
    }
    console.log();
  }

  console.log(`Validation passed (score: ${result.score}/100). Publishing...\n`);

  // Step 2: Read manifest
  const manifestPath = existsSync(join(absPath, "manifest.json"))
    ? join(absPath, "manifest.json")
    : join(absPath, "skill.json");
  const manifest = readJsonFile(manifestPath) as SkillManifest;

  // Step 3: Collect files
  const allFiles = walkDir(absPath);
  const files = allFiles.map((f) => ({
    path: relative(absPath, f),
    content: readFileSync(f, "utf-8"),
  }));

  // Step 4: Upload
  const url = `${CLAWHUB_REGISTRY}/api/v1/skills/publish`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        category: manifest.category,
        files,
        score: result.score,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Publish failed (HTTP ${res.status}): ${body}`);
      process.exit(1);
    }

    const data = (await res.json()) as { published?: boolean; url?: string };
    console.log(green(`Published "${manifest.name}" v${manifest.version} successfully!`));
    if (data.url) {
      console.log(`  View at: ${cyan(data.url)}`);
    }
  } catch (err) {
    console.error(`Publish failed: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd clawhub list
// ---------------------------------------------------------------------------

export type ClawHubListOptions = {
  dir?: string;
  json?: boolean;
};

export async function runClawHubList(opts: ClawHubListOptions): Promise<void> {
  const skillsDir = opts.dir ? resolve(opts.dir) : DEFAULT_SKILLS_DIR;

  if (!existsSync(skillsDir)) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ skills: [] }, null, 2) + "\n");
    } else {
      console.log("No skills directory found. No skills installed.");
    }
    return;
  }

  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch {
    console.error(`Cannot read skills directory: ${skillsDir}`);
    process.exit(1);
    return;
  }

  const skills: Array<{ name: string; version: string; description: string; path: string }> = [];

  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    try {
      if (!statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    // Try to read manifest
    let manifest: SkillManifest | null = null;
    for (const fname of ["manifest.json", "skill.json"]) {
      const mpath = join(entryPath, fname);
      if (existsSync(mpath)) {
        manifest = readJsonFile(mpath) as SkillManifest | null;
        break;
      }
    }

    skills.push({
      name: manifest?.name ?? entry,
      version: manifest?.version ?? "unknown",
      description: manifest?.description ?? "",
      path: entryPath,
    });
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ skills }, null, 2) + "\n");
    return;
  }

  if (skills.length === 0) {
    console.log("No skills installed.");
    return;
  }

  console.log(bold(`\nInstalled Skills (${skills.length})\n`));
  for (const skill of skills) {
    console.log(`  ${cyan(skill.name)} ${dim(`v${skill.version}`)}`);
    if (skill.description) {
      console.log(`    ${skill.description}`);
    }
    console.log(`    ${dim(skill.path)}`);
    console.log();
  }
}
