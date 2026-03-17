#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const policy = [
  { workflow: ".github/workflows/prd-verify.yml", workflowName: "PRD Verify", jobId: "prd-verify" },
  { workflow: ".github/workflows/lint.yml", workflowName: "Lint", jobId: "golangci" },
  { workflow: ".github/workflows/go-unit.yml", workflowName: "Unit tests", jobId: "tests" },
];

const docPath = path.join(repoRoot, "docs", "branch-protection.md");
const doc = safeRead(docPath);
const failures = [];

for (const entry of policy) {
  const workflowPath = path.join(repoRoot, entry.workflow);
  const text = safeRead(workflowPath);
  if (!text) {
    failures.push(`missing workflow file: ${entry.workflow}`);
    continue;
  }

  if (!new RegExp(`^name:\\s*${escapeRegExp(entry.workflowName)}\\s*$`, "m").test(text)) {
    failures.push(`workflow name mismatch in ${entry.workflow} (expected: ${entry.workflowName})`);
  }

  if (!new RegExp(`^\\s{0,2}${escapeRegExp(entry.jobId)}:\\s*$`, "m").test(text)) {
    failures.push(`job id missing in ${entry.workflow} (expected: ${entry.jobId})`);
  }

  const requiredCheck = `${entry.workflowName} / ${entry.jobId}`;
  if (!doc.includes(requiredCheck)) {
    failures.push(`branch protection doc missing required check entry: ${requiredCheck}`);
  }
}

if (failures.length > 0) {
  console.error("Branch protection policy check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`Branch protection policy check passed (${policy.length} required checks).`);

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
