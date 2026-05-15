/**
 * clawd completion — output shell completion scripts for bash, zsh, or fish.
 *
 * Usage:
 *   clawd completion bash   # outputs bash completion script
 *   clawd completion zsh    # outputs zsh completion script
 *   clawd completion fish   # outputs fish completion script
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SUPPORTED_SHELLS = ["bash", "zsh", "fish"] as const;
type Shell = (typeof SUPPORTED_SHELLS)[number];

function getCompletionsDir(): string {
  // Works from both src/ (dev via tsx) and dist/ (compiled)
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);
  // From src/commands/ or dist/commands/ -> ../../completions/
  return resolve(thisDir, "..", "..", "completions");
}

function shellFileName(shell: Shell): string {
  switch (shell) {
    case "bash":
      return "clawd.bash";
    case "zsh":
      return "clawd.zsh";
    case "fish":
      return "clawd.fish";
  }
}

export function runCompletion(shell: string): void {
  const normalized = shell.trim().toLowerCase();

  if (!SUPPORTED_SHELLS.includes(normalized as Shell)) {
    console.error(
      `Unknown shell: "${shell}". Supported shells: ${SUPPORTED_SHELLS.join(", ")}`,
    );
    process.exit(1);
  }

  const completionsDir = getCompletionsDir();
  const filePath = resolve(completionsDir, shellFileName(normalized as Shell));

  try {
    const content = readFileSync(filePath, "utf-8");
    process.stdout.write(content);
  } catch (err) {
    console.error(`Failed to read completion script at ${filePath}: ${String(err)}`);
    process.exit(1);
  }
}
