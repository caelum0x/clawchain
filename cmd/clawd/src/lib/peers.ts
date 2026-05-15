/**
 * Peer discovery helpers for CometBFT config.toml.
 *
 * Patches `seeds` and `persistent_peers` lines in the CometBFT config
 * so nodes can discover each other via the built-in PEX reactor.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export type ConfigurePeersOptions = {
  /** Comma-separated seed node addresses (nodeID@host:port). */
  seeds?: string;
  /** Comma-separated persistent peer addresses (nodeID@host:port). */
  persistentPeers?: string;
  /** Path to the chain node home directory (e.g. ~/.clawchain). */
  nodeHome: string;
};

/**
 * Patch the CometBFT config.toml to set seed and persistent peer addresses.
 *
 * Also sets `addr_book_strict = false` for private/testnet IPs.
 */
export function configurePeers(options: ConfigurePeersOptions): void {
  const configPath = join(options.nodeHome, "config", "config.toml");
  let config = readFileSync(configPath, "utf-8");

  if (options.seeds !== undefined) {
    config = config.replace(
      /^seeds\s*=\s*".*"$/m,
      `seeds = "${options.seeds}"`,
    );
  }

  if (options.persistentPeers !== undefined) {
    config = config.replace(
      /^persistent_peers\s*=\s*".*"$/m,
      `persistent_peers = "${options.persistentPeers}"`,
    );
  }

  // Allow private/testnet IPs
  config = config.replace(
    /^addr_book_strict\s*=\s*true$/m,
    "addr_book_strict = false",
  );

  writeFileSync(configPath, config);
}

/**
 * Get the CometBFT node ID by running `clawchaind comet show-node-id`.
 */
export function getNodeId(nodeBin: string, nodeHome: string): string {
  const output = execFileSync(
    nodeBin,
    ["comet", "show-node-id", "--home", nodeHome],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  return output.toString().trim();
}
