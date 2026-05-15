/**
 * `clawd keys` — forwards all arguments to `clawchaind keys --home <chainHome>`.
 */

import { execFileSync } from "node:child_process";
import { loadClawdConfig } from "../lib/config.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

export function runKeys(args: string[]): void {
  const config = loadClawdConfig();
  const nodeBin = process.env.CLAWCHAIND_PATH ?? "clawchaind";
  const home = config.nodeHome || CLAWCHAIN_HOME;

  const fullArgs = ["keys", "--home", home, "--keyring-backend", "test", ...args];

  try {
    execFileSync(nodeBin, fullArgs, { stdio: "inherit" });
  } catch (err) {
    // execFileSync throws on non-zero exit; the child already printed to stderr
    process.exit(1);
  }
}
