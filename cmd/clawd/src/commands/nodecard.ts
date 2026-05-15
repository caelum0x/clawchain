/**
 * `clawd nodecard` — print a shareable node descriptor.
 *
 * Produces JSON with chain/network metadata, peer endpoint, and optional
 * service URLs (RPC/REST/faucet/messaging).
 */

import { getNodeId } from "../lib/peers.js";
import { loadClawdConfig } from "../lib/config.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type NodecardOptions = {
  host?: string;
  p2pPort?: number;
  rpcUrl?: string;
  restUrl?: string;
  faucetUrl?: string;
  messagingEndpoint?: string;
  out?: "json" | "pretty";
  writePath?: string;
};

export function runNodecard(options: NodecardOptions): void {
  const cfg = loadClawdConfig();

  const host = options.host ?? cfg.publicHost ?? "YOUR_PUBLIC_IP_OR_DNS";
  const p2pPort = options.p2pPort ?? 26656;
  const rpcUrl = options.rpcUrl ?? cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = options.restUrl ?? cfg.restUrl ?? deriveRestUrl(rpcUrl);
  const faucetUrl = options.faucetUrl ?? cfg.faucetUrl;
  const messagingEndpoint = options.messagingEndpoint ?? cfg.messagingEndpoint;

  const nodeBin = cfg.nodeBinaryPath ?? process.env.CLAWCHAIND_PATH ?? "clawchaind";
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;

  let nodeId = "UNKNOWN_NODE_ID";
  try {
    nodeId = getNodeId(nodeBin, nodeHome);
  } catch {
    // keep placeholder if node isn't initialized/reachable
  }

  const card = {
    generatedAtUtc: new Date().toISOString(),
    chainId: cfg.chainId,
    node: {
      moniker: cfg.moniker ?? null,
      nodeId,
      p2p: `${nodeId}@${host}:${p2pPort}`,
      host,
      p2pPort,
    },
    endpoints: {
      rpc: rpcUrl,
      rest: restUrl,
      faucet: faucetUrl ?? null,
      messaging: messagingEndpoint ?? null,
    },
  };

  if (options.writePath) {
    const payload = JSON.stringify(card, null, 2) + "\n";
    mkdirSync(dirname(options.writePath), { recursive: true });
    writeFileSync(options.writePath, payload);
    if ((options.out ?? "json") === "pretty") {
      console.log(`  wrote:     ${options.writePath}`);
    }
  }

  if ((options.out ?? "json") === "pretty") {
    console.log("clawd nodecard");
    console.log(`  chain:     ${card.chainId}`);
    console.log(`  node id:   ${card.node.nodeId}`);
    console.log(`  peer:      ${card.node.p2p}`);
    console.log(`  rpc:       ${card.endpoints.rpc}`);
    console.log(`  rest:      ${card.endpoints.rest}`);
    if (card.endpoints.faucet) console.log(`  faucet:    ${card.endpoints.faucet}`);
    if (card.endpoints.messaging) console.log(`  messaging: ${card.endpoints.messaging}`);
    return;
  }

  console.log(JSON.stringify(card, null, 2));
}

function deriveRestUrl(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}
