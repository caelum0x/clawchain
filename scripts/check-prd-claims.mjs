#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const prdPath = path.join(repoRoot, "prd.md");
const makefilePath = path.join(repoRoot, "Makefile");

const prd = fs.readFileSync(prdPath, "utf8");
const makefile = fs.readFileSync(makefilePath, "utf8");

const section =
  extractSection(prd, "## 9. Current Implementation Status", "## 10. Risks & Mitigations") ||
  extractSectionByHeader(prd, "## Component Maturity");
if (!section) {
  console.error("ERROR: unable to find PRD section 9 table.");
  process.exit(1);
}

const rows = parseStatusRows(section);
const makeTargets = parseMakeTargets(makefile);

const allFiles = walkRepo(repoRoot);
const failures = [];

for (const row of rows) {
  for (const ref of row.pathRefs) {
    const ok = ref.includes("*") ? globExists(ref, allFiles) : fs.existsSync(path.join(repoRoot, ref.slice(1)));
    if (!ok) {
      failures.push(`[path] ${row.component}: ${ref}`);
    }
  }

  for (const target of row.makeTargets) {
    if (!makeTargets.has(target)) {
      failures.push(`[make] ${row.component}: missing target "${target}"`);
    }
  }
}

if (failures.length > 0) {
  console.error("PRD claims check failed:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`PRD claims check passed (${rows.length} status rows validated).`);

function extractSection(text, startHeader, endHeader) {
  const start = text.indexOf(startHeader);
  const end = text.indexOf(endHeader);
  if (start < 0 || end < 0 || end <= start) return "";
  return text.slice(start, end);
}

function extractSectionByHeader(text, header) {
  const start = text.indexOf(header);
  if (start < 0) return "";
  const remaining = text.slice(start + header.length);
  const nextHeaderOffset = remaining.search(/\n##\s+/);
  if (nextHeaderOffset < 0) return text.slice(start);
  return text.slice(start, start + header.length + nextHeaderOffset);
}

function parseStatusRows(sectionText) {
  const out = [];
  const lines = sectionText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    if (trimmed.startsWith("| Component |")) continue;
    if (/^\|[-\s|]+\|$/.test(trimmed)) continue;

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 3) continue;

    const component = cells[0];
    const location = cells[2];
    const pathRefs = [...location.matchAll(/`(\/[^`]+)`/g)].map((m) => m[1]);
    const makeTargets = [...location.matchAll(/`Makefile`\s*\(`([^`]+)`\)/g)]
      .map((m) => m[1].trim())
      .map((t) => t.split(/\s+/)[0])
      .filter(Boolean);

    out.push({ component, pathRefs, makeTargets });
  }
  return out;
}

function parseMakeTargets(makefileText) {
  const targets = new Set();
  const regex = /^([A-Za-z0-9_.-]+):/gm;
  for (const match of makefileText.matchAll(regex)) {
    const name = match[1];
    if (name) targets.add(name);
  }
  return targets;
}

function walkRepo(root) {
  const out = [];
  const skip = new Set([".git", "node_modules", ".next", "dist", "coverage"]);
  const stack = [""];

  while (stack.length > 0) {
    const rel = stack.pop();
    const abs = path.join(root, rel);
    let entries = [];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const nextRel = path.join(rel, entry.name);
      const unixRel = nextRel.split(path.sep).join("/");
      const absoluteUnix = `/${unixRel}`;
      out.push(absoluteUnix);
      if (entry.isDirectory()) {
        stack.push(nextRel);
      }
    }
  }
  return out;
}

function globExists(pattern, allPaths) {
  const regex = globToRegex(pattern);
  return allPaths.some((p) => regex.test(p));
}

function globToRegex(globPattern) {
  const escaped = globPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const wildcarded = escaped.replace(/\*/g, "[^/]*");
  return new RegExp(`^${wildcarded}$`);
}
