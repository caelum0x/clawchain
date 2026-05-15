/**
 * `clawd checksums` subcommands — generate, verify, show SHA-256 checksums
 * for release binaries in the build directory.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadClawdConfig } from "../lib/config.js";
import { table } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHECKSUMS_FILENAME = "checksums.txt";

/** Files to skip when scanning the build directory. */
const SKIP_FILES = new Set([CHECKSUMS_FILENAME, ".gitkeep", ".gitignore", ".DS_Store"]);

/**
 * Compute SHA-256 hex digest for a file.
 */
function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

/**
 * Parse a GNU coreutils-style checksums file.
 * Each line: `<hex-hash>  <filename>`
 */
function parseChecksumsFile(content: string): Array<{ hash: string; filename: string }> {
  const entries: Array<{ hash: string; filename: string }> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    // GNU coreutils format: two spaces between hash and filename
    const match = trimmed.match(/^([0-9a-f]{64})\s{2}(.+)$/);
    if (match) {
      entries.push({ hash: match[1], filename: match[2] });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// clawd checksums generate
// ---------------------------------------------------------------------------

export type ChecksumsGenerateOptions = {
  outputDir?: string;
  json?: boolean;
};

export async function runChecksumsGenerate(opts: ChecksumsGenerateOptions): Promise<void> {
  const _cfg = loadClawdConfig();
  const outputDir = path.resolve(opts.outputDir ?? "./build");

  if (!fs.existsSync(outputDir)) {
    console.error(`Build directory not found: ${outputDir}`);
    process.exit(1);
  }

  const stat = fs.statSync(outputDir);
  if (!stat.isDirectory()) {
    console.error(`Not a directory: ${outputDir}`);
    process.exit(1);
  }

  // Collect files (non-recursive, skip metadata files)
  const entries = fs.readdirSync(outputDir).filter((name) => {
    if (SKIP_FILES.has(name)) return false;
    const filePath = path.join(outputDir, name);
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  });

  entries.sort();

  if (entries.length === 0) {
    console.error(`No files found in ${outputDir}.`);
    process.exit(1);
  }

  // Compute checksums
  const results: Array<{ filename: string; hash: string }> = [];
  for (const filename of entries) {
    const filePath = path.join(outputDir, filename);
    const hash = sha256File(filePath);
    results.push({ filename, hash });
  }

  // Write checksums.txt in GNU coreutils format
  const checksumsPath = path.join(outputDir, CHECKSUMS_FILENAME);
  const lines = results.map((r) => `${r.hash}  ${r.filename}`);
  fs.writeFileSync(checksumsPath, lines.join("\n") + "\n", "utf-8");

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          outputDir,
          checksumsFile: checksumsPath,
          files: results,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Checksums Generated\n");
  console.log(`  Directory: ${outputDir}`);
  console.log(`  Output:    ${checksumsPath}`);
  console.log(`  Files:     ${results.length}\n`);

  const headers = ["File", "SHA-256"];
  const rows = results.map((r) => [r.filename, r.hash]);
  console.log(table(headers, rows));
  console.log();
}

// ---------------------------------------------------------------------------
// clawd checksums verify
// ---------------------------------------------------------------------------

export type ChecksumsVerifyOptions = {
  file?: string;
  json?: boolean;
};

export async function runChecksumsVerify(opts: ChecksumsVerifyOptions): Promise<void> {
  const _cfg = loadClawdConfig();
  const checksumsPath = path.resolve(opts.file ?? `./build/${CHECKSUMS_FILENAME}`);

  if (!fs.existsSync(checksumsPath)) {
    console.error(`Checksums file not found: ${checksumsPath}`);
    console.error('Run "clawd checksums generate" first.');
    process.exit(1);
  }

  const content = fs.readFileSync(checksumsPath, "utf-8");
  const entries = parseChecksumsFile(content);

  if (entries.length === 0) {
    console.error(`No checksum entries found in ${checksumsPath}.`);
    process.exit(1);
  }

  const baseDir = path.dirname(checksumsPath);
  const results: Array<{
    filename: string;
    expected: string;
    actual: string | null;
    status: "PASS" | "FAIL" | "MISSING";
  }> = [];

  let allPassed = true;

  for (const entry of entries) {
    const filePath = path.join(baseDir, entry.filename);

    if (!fs.existsSync(filePath)) {
      results.push({
        filename: entry.filename,
        expected: entry.hash,
        actual: null,
        status: "MISSING",
      });
      allPassed = false;
      continue;
    }

    const actual = sha256File(filePath);
    const passed = actual === entry.hash;
    if (!passed) allPassed = false;

    results.push({
      filename: entry.filename,
      expected: entry.hash,
      actual,
      status: passed ? "PASS" : "FAIL",
    });
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          checksumsFile: checksumsPath,
          allPassed,
          results,
        },
        null,
        2,
      ) + "\n",
    );
    if (!allPassed) process.exit(1);
    return;
  }

  console.log("Checksum Verification\n");
  console.log(`  File: ${checksumsPath}\n`);

  const headers = ["Status", "File", "Expected", "Actual"];
  const rows = results.map((r) => [
    r.status,
    r.filename,
    r.expected.slice(0, 16) + "...",
    r.actual ? r.actual.slice(0, 16) + "..." : "(missing)",
  ]);
  console.log(table(headers, rows));

  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const missingCount = results.filter((r) => r.status === "MISSING").length;

  console.log();
  console.log(`  Passed:  ${passCount}/${results.length}`);
  if (failCount > 0) console.log(`  Failed:  ${failCount}`);
  if (missingCount > 0) console.log(`  Missing: ${missingCount}`);
  console.log();

  if (!allPassed) {
    console.error("Verification FAILED.");
    process.exit(1);
  }

  console.log("All checksums verified.");
}

// ---------------------------------------------------------------------------
// clawd checksums show
// ---------------------------------------------------------------------------

export type ChecksumsShowOptions = {
  file?: string;
  json?: boolean;
};

export async function runChecksumsShow(opts: ChecksumsShowOptions): Promise<void> {
  const _cfg = loadClawdConfig();
  const checksumsPath = path.resolve(opts.file ?? `./build/${CHECKSUMS_FILENAME}`);

  if (!fs.existsSync(checksumsPath)) {
    console.error(`Checksums file not found: ${checksumsPath}`);
    console.error('Run "clawd checksums generate" first.');
    process.exit(1);
  }

  const content = fs.readFileSync(checksumsPath, "utf-8");
  const entries = parseChecksumsFile(content);

  if (entries.length === 0) {
    console.error(`No checksum entries found in ${checksumsPath}.`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          checksumsFile: checksumsPath,
          entries,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Release Checksums\n");
  console.log(`  File: ${checksumsPath}\n`);

  const headers = ["File", "SHA-256"];
  const rows = entries.map((e) => [e.filename, e.hash]);
  console.log(table(headers, rows));
  console.log();
}
