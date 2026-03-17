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

const required = [
  "fromAddress",
  "assignee",
  "seller",
  "heartbeatTxHash",
  "delegateTxHash",
  "messageTxHash",
  "purchaseTxHash",
  "escrowTxHash",
  "rateTxHash",
  "endorseTxHash",
];

for (const key of required) {
  const value = report[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(`report.${key} must be a non-empty string`);
  }
}

if (typeof report.skillId !== "undefined") {
  const n = Number(report.skillId);
  if (!Number.isFinite(n) || n < 0) {
    fail(`report.skillId must be a non-negative number (got ${String(report.skillId)})`);
  }
}

if (typeof report.taskId !== "undefined") {
  const n = Number(report.taskId);
  if (!Number.isFinite(n) || n < 0) {
    fail(`report.taskId must be a non-negative number (got ${String(report.taskId)})`);
  }
}

if (typeof report.escrowId !== "undefined") {
  const n = Number(report.escrowId);
  if (!Number.isFinite(n) || n < 0) {
    fail(`report.escrowId must be a non-negative number (got ${String(report.escrowId)})`);
  }
}

process.stdout.write("product-flow report assertion passed\n");
process.exit(0);

function fail(message) {
  process.stderr.write(`product-flow-report assertion failed: ${message}\n`);
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
