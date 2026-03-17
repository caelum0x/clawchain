#!/usr/bin/env node

import process from "node:process";

const args = new Set(process.argv.slice(2));
const requireReady = args.has("--require-ready");

const input = await readStdin();
const report = parseTrailingJsonObject(input);
if (!report) {
  fail("no JSON object found in command output");
}

if (typeof report !== "object" || report === null) {
  fail("report is not a JSON object");
}

if (report.ok !== true) {
  fail(`report.ok must be true (got ${String(report.ok)})`);
}

const steps = toObject(report.steps, "report.steps");
if (requireReady) {
  if (steps.readinessEnforced !== true) {
    fail(`steps.readinessEnforced must be true (got ${String(steps.readinessEnforced)})`);
  }
  if (steps.startupLifecyclePassed !== true) {
    fail(`steps.startupLifecyclePassed must be true (got ${String(steps.startupLifecyclePassed)})`);
  }
  if (steps.integratedReadinessPassed !== true) {
    fail(`steps.integratedReadinessPassed must be true (got ${String(steps.integratedReadinessPassed)})`);
  }
}

const autoBootstrap = toObject(report.autoBootstrap, "report.autoBootstrap");
if (autoBootstrap.attempted === true && autoBootstrap.ok !== true) {
  fail(`autoBootstrap.attempted=true but autoBootstrap.ok is ${String(autoBootstrap.ok)}`);
}

process.stdout.write("startup report assertion passed\n");
process.exit(0);

function toObject(value, label) {
  if (typeof value !== "object" || value === null) {
    fail(`${label} must be an object`);
  }
  return value;
}

function fail(message) {
  process.stderr.write(`up-report assertion failed: ${message}\n`);
  process.exit(1);
}

function parseTrailingJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;

  const direct = tryParse(trimmed);
  if (direct) return direct;

  const starts = [trimmed.lastIndexOf("\n{"), trimmed.lastIndexOf("{")]
    .filter((v, i, arr) => v >= 0 && arr.indexOf(v) === i)
    .map((v) => (trimmed[v] === "{" ? v : v + 1));

  for (const start of starts) {
    const candidate = trimmed.slice(start);
    const parsed = tryParse(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function tryParse(candidate) {
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
