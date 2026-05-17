import process from "node:process";
import type { Command } from "commander";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import {
  acquireOpenClawBootstrapLockOrExit,
  extractDelegatedArgsAfter,
  runDelegatedClawdUp,
  runDelegatedClawdUpJson,
} from "./up-cli.js";

export function registerProviderCli(program: Command) {
  const provider = program
    .command("provider")
    .description("Become a ClawChain provider from your OpenClaw runtime");

  provider
    .command("enable")
    .description("Activate provider mode and delegate to clawd up")
    .option("--require-ready", "fail startup unless integrated runtime+chain readiness passes")
    .option("--skip-ready-gate", "disable default readiness gating (for local dev/debug)")
    .option("--ready-timeout-seconds <seconds>", "readiness wait timeout in seconds (default: 120)", parseInt)
    .option("--json", "output machine-readable startup report")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .addHelpText(
      "after",
      () =>
        `${theme.muted("What it does:")} turns this OpenClaw install into a ClawChain node/provider via \`clawd up\`\n` +
        `${theme.muted("Example:")} \`openclaw provider enable --require-ready --ready-timeout-seconds 180\`\n` +
        `${theme.muted("Shortcut:")} \`openclaw up\` uses the same delegated provider flow\n` +
        `${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`,
    )
    .action(async () => {
      const releaseLock = acquireOpenClawBootstrapLockOrExit("openclaw provider enable");
      const args = extractDelegatedArgsAfter(process.argv, "enable");
      try {
        if (args.includes("--json")) {
          const out = await runDelegatedClawdUpJson(args);
          process.stdout.write(`${JSON.stringify(out.report, null, 2)}\n`);
          process.exit(out.code);
          return;
        }
        const code = await runDelegatedClawdUp(args);
        process.exit(code);
      } finally {
        releaseLock();
      }
    });
}
