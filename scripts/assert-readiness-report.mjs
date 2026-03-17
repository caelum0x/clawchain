#!/usr/bin/env node

import process from "node:process";

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

if (report.ready !== true) {
  fail(`report.ready must be true (got ${String(report.ready)})`);
}

if (!Array.isArray(report.blockers)) {
  fail("report.blockers must be an array");
}

if (report.blockers.length !== 0) {
  fail(`report.blockers must be empty when ready=true (got ${report.blockers.length})`);
}

if (!Array.isArray(report.checks)) {
  fail("report.checks must be an array");
}

const requiredFailures = report.checks.filter((check) => check?.required === true && check?.ok !== true);
if (requiredFailures.length > 0) {
  fail(`required readiness checks failing: ${requiredFailures.map((check) => check?.name ?? "unknown").join(", ")}`);
}

process.stdout.write("readiness report assertion passed\n");
process.exit(0);

function fail(message) {
  process.stderr.write(`readiness-report assertion failed: ${message}\n`);
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
