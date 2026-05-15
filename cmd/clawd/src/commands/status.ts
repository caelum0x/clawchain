/**
 * `clawd status` — check chain heartbeat, peer count, and gateway health.
 */

import { loadClawdConfig } from "../lib/config.js";
import { queryGatewayRuntimeStatus } from "../lib/openclaw-gateway.js";
import { evaluateProviderLifecycle } from "../lib/provider-lifecycle.js";

export async function runStatus(): Promise<void> {
  const config = loadClawdConfig();

  console.log("ClawChain Status\n");

  // Check chain node
  const rpcUrl = config.rpcUrl || "http://localhost:26657";
  console.log(`Chain Node (${rpcUrl}):`);

  try {
    const statusUrl = `${rpcUrl.replace(/\/?$/, "")}/status`;
    const res = await fetch(statusUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.log(`  Status:  DOWN (HTTP ${res.status})`);
    } else {
      const data = (await res.json()) as {
        result?: {
          node_info?: { moniker?: string; network?: string };
          sync_info?: {
            latest_block_height?: string;
            latest_block_time?: string;
            catching_up?: boolean;
          };
        };
      };
      const nodeInfo = data.result?.node_info;
      const syncInfo = data.result?.sync_info;

      console.log("  Status:  UP");
      if (nodeInfo?.moniker) console.log(`  Moniker: ${nodeInfo.moniker}`);
      if (nodeInfo?.network) console.log(`  Network: ${nodeInfo.network}`);
      if (syncInfo?.latest_block_height) console.log(`  Height:  ${syncInfo.latest_block_height}`);
      if (syncInfo?.latest_block_time) console.log(`  Time:    ${syncInfo.latest_block_time}`);
      if (syncInfo?.catching_up !== undefined) console.log(`  Syncing: ${syncInfo.catching_up}`);
    }
  } catch (err) {
    console.log(`  Status:  DOWN (${String(err)})`);
  }

  // Check peer count via net_info
  console.log("\nPeer Discovery:");
  try {
    const netInfoUrl = `${rpcUrl.replace(/\/?$/, "")}/net_info`;
    const res = await fetch(netInfoUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as {
        result?: {
          n_peers?: string;
          peers?: Array<{
            node_info?: { moniker?: string; id?: string };
            remote_ip?: string;
          }>;
        };
      };
      const nPeers = data.result?.n_peers ?? "0";
      console.log(`  Connected peers: ${nPeers}`);

      const peers = data.result?.peers;
      if (peers && peers.length > 0) {
        for (const peer of peers.slice(0, 10)) {
          const id = peer.node_info?.id ?? "unknown";
          const moniker = peer.node_info?.moniker ?? "";
          const ip = peer.remote_ip ?? "";
          console.log(`    - ${id.substring(0, 8)}... ${moniker} (${ip})`);
        }
        if (peers.length > 10) {
          console.log(`    ... and ${peers.length - 10} more`);
        }
      }
    } else {
      console.log("  Could not query peer info.");
    }
  } catch {
    console.log("  Could not query peer info (node not reachable).");
  }

  // Check gateway/runtime health via runtime.status first, then fall back to HTTP /health.
  console.log("\nGateway:");
  const runtime = await queryGatewayRuntimeStatus();
  if (runtime) {
    const ready = runtime.readiness?.ready === true;
    const gatewayUp = runtime.chain?.alive === true || runtime.agent?.connected === true;
    console.log(`  Status:  ${gatewayUp ? "UP" : "DEGRADED"}`);
    console.log(`  Ready:   ${ready}`);
    if (runtime.agent?.address) console.log(`  Agent:   ${runtime.agent.address}`);
    if (runtime.peers?.connectedPeers !== undefined && runtime.peers?.connectedPeers !== null) {
      console.log(`  Peers:   ${runtime.peers.connectedPeers}`);
    }
    if (runtime.messaging?.endpoint) {
      console.log(`  Msg URL: ${runtime.messaging.endpoint}`);
      if (runtime.messaging.reachable !== undefined && runtime.messaging.reachable !== null) {
        console.log(`  Msg OK:  ${runtime.messaging.reachable}`);
      }
    }
    if (runtime.readiness?.blockers && runtime.readiness.blockers.length > 0) {
      console.log(`  Blockers:${runtime.readiness.blockers.join(" | ")}`);
    }
  } else {
    const gatewayCandidates = [
      process.env.OPENCLAW_GATEWAY_URL ?? "http://localhost:18789",
      "http://localhost:3000",
    ];
    let gatewayHealthy = false;
    for (const gatewayUrl of gatewayCandidates) {
      if (gatewayHealthy) break;
      console.log(`  Probe:   ${gatewayUrl}`);
      try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          console.log("  Status:  UP");
          gatewayHealthy = true;
        } else {
          console.log(`  Status:  DOWN (HTTP ${res.status})`);
        }
      } catch {
        console.log("  Status:  DOWN (not reachable)");
      }
    }
  }

  const lifecycle = await evaluateProviderLifecycle();
  console.log("\nProvider Lifecycle:");
  console.log(`  Registration: ${lifecycle.registration.ok} (${lifecycle.registration.detail})`);
  console.log(`  Heartbeat:    ${lifecycle.heartbeat.ok} (${lifecycle.heartbeat.detail})`);
  console.log(`  Recovery:     ${lifecycle.recovery.ok} (${lifecycle.recovery.detail})`);
  console.log(`  Rewards:      ${lifecycle.rewards.ok} (${lifecycle.rewards.detail})`);

  // Print config summary
  console.log("\nConfig:");
  console.log(`  Chain ID:   ${config.chainId}`);
  console.log(`  Node home:  ${config.nodeHome || "(default)"}`);
  console.log(`  REST URL:   ${config.restUrl || "(default)"}`);
  console.log(`  Auto-start: ${config.nodeAutoStart}`);
  if (config.agentAddress) {
    console.log(`  Agent:      ${config.agentAddress}`);
  }
  if (config.seeds) {
    console.log(`  Seeds:      ${config.seeds}`);
  }
  if (config.persistentPeers) {
    console.log(`  Peers:      ${config.persistentPeers}`);
  }
  if (config.incidentMode?.active) {
    console.log(`  Incident:   ACTIVE (${config.incidentMode.reason ?? "operator-triggered"})`);
  } else {
    console.log("  Incident:   inactive");
  }
  console.log();
}
