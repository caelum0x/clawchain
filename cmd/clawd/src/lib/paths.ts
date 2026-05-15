/**
 * Standard paths for clawd and clawchain data directories.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Root config/data directory for clawd (~/.clawd). */
export const CLAWD_HOME = process.env.CLAWD_HOME ?? join(homedir(), ".clawd");

/** Dedicated OpenClaw profile name when launched under clawd. */
export const CLAWD_OPENCLAW_PROFILE = process.env.CLAWD_OPENCLAW_PROFILE ?? "clawd";

/** Dedicated OpenClaw mutable state directory owned by clawd. */
export const CLAWD_OPENCLAW_STATE_DIR =
  process.env.CLAWD_OPENCLAW_STATE_DIR ?? join(CLAWD_HOME, "openclaw");

/** Canonical OpenClaw config file path inside the clawd-owned state dir. */
export const CLAWD_OPENCLAW_CONFIG_PATH = join(CLAWD_OPENCLAW_STATE_DIR, "openclaw.json");

/** Root data directory for the clawchain node (~/.clawchain). */
export const CLAWCHAIN_HOME = process.env.CLAWCHAIN_HOME ?? join(homedir(), ".clawchain");

/** Path to the clawd config file. */
export const CLAWD_CONFIG_PATH = join(CLAWD_HOME, "clawd.json");

/** Path to the encrypted mnemonic file. */
export const CLAWD_MNEMONIC_PATH = join(CLAWD_HOME, "mnemonic.enc");
