/**
 * `clawd readiness` — strict integrated product readiness checks.
 */

import { evaluateIntegratedReadiness } from "../lib/readiness.js";

export async function runReadiness(opts: { json?: boolean } = {}): Promise<void> {
  const report = await evaluateIntegratedReadiness();

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      ok: report.ready,
      ready: report.ready,
      chainId: report.chainId,
      agentAddress: report.agentAddress,
      rpcUrl: report.rpcUrl,
      restUrl: report.restUrl,
      messagingEndpoint: report.messagingEndpoint,
      checks: report.checks,
      blockers: report.blockers,
    }, null, 2) + "\n");
    if (!report.ready) {
      process.exitCode = 1;
    }
    return;
  }

  console.log("clawd readiness\n");
  console.log(`  Chain ID:         ${report.chainId}`);
  console.log(`  Agent address:    ${report.agentAddress ?? "(missing in config)"}`);
  console.log(`  RPC URL:          ${report.rpcUrl}`);
  console.log(`  REST URL:         ${report.restUrl}`);
  if (report.messagingEndpoint) {
    console.log(`  Messaging URL:    ${report.messagingEndpoint}`);
  }
  console.log("");

  for (const check of report.checks) {
    const status = check.ok ? "OK " : "FAIL";
    const required = check.required ? "required" : "advisory";
    console.log(`[${status}] ${check.name} (${required}): ${check.detail}`);
  }

  console.log("");
  console.log(`Readiness: ${report.ready ? "READY" : "NOT READY"}`);

  if (!report.ready) {
    console.log("Blockers:");
    for (const blocker of report.blockers) {
      console.log(`  - ${blocker.name}: ${blocker.detail}`);
    }
    process.exitCode = 1;
  }
}
