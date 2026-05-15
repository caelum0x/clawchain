/**
 * `clawd doctor` — operator diagnostics for unified runtime.
 *
 * Checks chain RPC/REST, gateway, faucet, and messaging endpoint health.
 * Exits non-zero if critical checks fail.
 */

import { loadClawdConfig } from "../lib/config.js";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAWCHAIN_HOME } from "../lib/paths.js";
import { queryGatewayRuntimeStatus } from "../lib/openclaw-gateway.js";
import { evaluateProviderLifecycle } from "../lib/provider-lifecycle.js";
import {
  evaluateIntegratedReadiness,
  evaluateStartupLifecycle,
  type StartupLifecycleReport,
  type StartupLifecycleStage,
} from "../lib/readiness.js";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
  critical?: boolean;
  remediationHint?: string | null;
};

export async function runDoctor(opts: { json?: boolean } = {}): Promise<void> {
  const cfg = loadClawdConfig();
  const results: CheckResult[] = [];

  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = cfg.restUrl ?? deriveRestUrl(rpcUrl);
  const faucetUrl = cfg.faucetUrl;
  const messagingEndpoint = cfg.messagingEndpoint;

  results.push(await checkChainRpc(rpcUrl, cfg.chainId));
  results.push(await checkChainRest(restUrl));
  results.push(await checkPeerConnectivity(rpcUrl, cfg.seeds));
  results.push(await checkGateway());
  if (faucetUrl) results.push(await checkHttpEndpoint("Faucet", `${trimSlash(faucetUrl)}/faucet/status`, false));
  if (messagingEndpoint) {
    results.push(
      await checkHttpEndpoint(
        "Messaging endpoint",
        `${trimSlash(messagingEndpoint)}/agent/health`,
        false,
      ),
    );
  }
  if (cfg.agentAddress && cfg.agentAddress.trim().length > 0) {
    results.push(await checkAgentCapabilities(restUrl, cfg.agentAddress));
  } else {
    results.push({
      name: "On-chain agent capabilities metadata",
      ok: false,
      detail: "agentAddress missing; cannot verify supported_tools/pricing_hint/version",
      critical: false,
    });
  }
  results.push(await checkGenesis(cfg.nodeHome ?? CLAWCHAIN_HOME, cfg.genesisSha256));
  results.push(checkIncidentMode(cfg.incidentMode));
  results.push(await checkIntegratedReadiness());
  const checksWithHints = results.map((result) => ({
    ...result,
    remediationHint: getCheckRemediationHint(result, cfg.networkManifest),
  }));
  const lifecycle = await evaluateStartupLifecycleSafe();
  const providerLifecycle = await evaluateProviderLifecycle();
  const lifecycleStages = lifecycle.stages.map((stage) => ({
    ...stage,
    repairHint: stage.ok ? null : getLifecycleRepairHint(stage.stage, cfg.networkManifest),
  }));
  const lifecycleCompleted = lifecycle.completed;

  if (opts.json) {
    const failedCritical = results.some((r) => !r.ok && r.critical !== false);
    process.stdout.write(
      JSON.stringify(
        {
          ok: !failedCritical,
          chainId: cfg.chainId,
          rpcUrl,
          restUrl,
          faucetUrl: faucetUrl ?? null,
          messagingEndpoint: messagingEndpoint ?? null,
          checks: checksWithHints,
          lifecycle: {
            completed: lifecycleCompleted,
            currentStage: lifecycle.currentStage,
            blocker: lifecycle.blocker,
            stages: lifecycleStages,
          },
          providerLifecycle,
        },
        null,
        2,
      ) + "\n",
    );
    if (failedCritical) {
      process.exitCode = 1;
    }
    return;
  }

  console.log("clawd doctor\n");
  console.log(`  Chain ID: ${cfg.chainId}`);
  console.log(`  RPC URL:  ${rpcUrl}`);
  console.log(`  REST URL: ${restUrl}`);
  if (faucetUrl) console.log(`  Faucet:   ${faucetUrl}`);
  if (messagingEndpoint) console.log(`  Message:  ${messagingEndpoint}`);
  console.log("");

  for (const r of results) {
    const status = r.ok ? "OK " : "FAIL";
    console.log(`[${status}] ${r.name}: ${r.detail}`);
    const hint = getCheckRemediationHint(r, cfg.networkManifest);
    if (!r.ok && hint) {
      console.log(`      remediation: ${hint}`);
    }
  }
  console.log("");
  console.log("Startup lifecycle");
  for (const stage of lifecycleStages) {
    const status = stage.ok ? "OK " : "FAIL";
    console.log(`[${status}] ${stage.stage}: ${stage.detail}`);
    if (!stage.ok && stage.repairHint) {
      console.log(`      repair: ${stage.repairHint}`);
    }
  }
  console.log("");
  console.log("Provider lifecycle");
  console.log(
    `[${providerLifecycle.registration.ok ? "OK " : "FAIL"}] registration: ${providerLifecycle.registration.detail}`,
  );
  console.log(
    `[${providerLifecycle.heartbeat.ok ? "OK " : "FAIL"}] heartbeat: ${providerLifecycle.heartbeat.detail}`,
  );
  console.log(
    `[${providerLifecycle.recovery.ok ? "OK " : "FAIL"}] recovery: ${providerLifecycle.recovery.detail}`,
  );
  console.log(
    `[${providerLifecycle.rewards.ok ? "OK " : "FAIL"}] rewards: ${providerLifecycle.rewards.detail}`,
  );
  if (providerLifecycle.blockers.length > 0) {
    console.log("      blockers: " + providerLifecycle.blockers.join(" | "));
  }

  const failedCritical = results.some((r) => !r.ok && r.critical !== false);
  if (failedCritical) {
    process.exitCode = 1;
  }
}

async function checkChainRpc(rpcUrl: string, expectedChainId?: string): Promise<CheckResult> {
  const url = `${trimSlash(rpcUrl)}/status`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { name: "Chain RPC", ok: false, detail: `HTTP ${res.status} (${url})` };
    }
    const data = (await res.json()) as {
      result?: {
        node_info?: { network?: string };
        sync_info?: { latest_block_height?: string; catching_up?: boolean };
      };
    };
    const height = data.result?.sync_info?.latest_block_height ?? "?";
    const catchingUp = data.result?.sync_info?.catching_up;
    const network = data.result?.node_info?.network;
    if (expectedChainId && network && expectedChainId !== network) {
      return {
        name: "Chain RPC",
        ok: false,
        detail: `chain_id mismatch expected=${expectedChainId} got=${network}`,
      };
    }
    return {
      name: "Chain RPC",
      ok: true,
      detail:
        `chain_id=${network ?? "unknown"} ` +
        `height=${height} syncing=${String(catchingUp ?? "unknown")}`,
    };
  } catch (err) {
    return { name: "Chain RPC", ok: false, detail: `${String(err)} (${url})` };
  }
}

async function checkChainRest(restUrl: string): Promise<CheckResult> {
  const url = `${trimSlash(restUrl)}/cosmos/base/tendermint/v1beta1/syncing`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { name: "Chain REST", ok: false, detail: `HTTP ${res.status} (${url})` };
    }
    const data = (await res.json()) as { syncing?: boolean };
    return { name: "Chain REST", ok: true, detail: `syncing=${String(data.syncing ?? "unknown")}` };
  } catch (err) {
    return { name: "Chain REST", ok: false, detail: `${String(err)} (${url})` };
  }
}

async function checkGateway(): Promise<CheckResult> {
  const runtime = await queryGatewayRuntimeStatus();
  if (runtime) {
    const ready = runtime.readiness?.ready === true;
    const blockers = runtime.readiness?.blockers ?? [];
    const detailParts = [
      `ready=${ready}`,
      runtime.agent?.connected !== undefined ? `agentConnected=${runtime.agent.connected}` : null,
      runtime.peers?.connectedPeers !== undefined && runtime.peers?.connectedPeers !== null
        ? `peers=${runtime.peers.connectedPeers}`
        : null,
      blockers.length > 0 ? `blockers=${blockers.join(" | ")}` : null,
    ].filter(Boolean);
    return {
      name: "Gateway",
      ok: ready,
      detail: detailParts.join(" "),
    };
  }

  const candidates = [
    process.env.OPENCLAW_GATEWAY_URL ?? "http://localhost:18789",
    "http://localhost:3000",
  ];
  for (const base of candidates) {
    const url = `${trimSlash(base)}/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return { name: "Gateway", ok: true, detail: `reachable at ${base}` };
      }
    } catch {
      // try next candidate
    }
  }
  return { name: "Gateway", ok: false, detail: "not reachable on :18789 or :3000" };
}

async function checkHttpEndpoint(
  name: string,
  url: string,
  critical: boolean,
): Promise<CheckResult> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { name, ok: false, detail: `HTTP ${res.status} (${url})`, critical };
    }
    return { name, ok: true, detail: `reachable (${url})`, critical };
  } catch (err) {
    return { name, ok: false, detail: `${String(err)} (${url})`, critical };
  }
}

async function checkPeerConnectivity(rpcUrl: string, configuredSeeds?: string): Promise<CheckResult> {
  const url = `${trimSlash(rpcUrl)}/net_info`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "Peer connectivity",
        ok: false,
        detail: `RPC net_info unavailable (HTTP ${res.status})`,
        critical: false,
      };
    }
    const data = (await res.json()) as {
      result?: {
        n_peers?: string;
      };
    };
    const nPeers = Number.parseInt(data.result?.n_peers ?? "0", 10);
    if (Number.isFinite(nPeers) && nPeers > 0) {
      return {
        name: "Peer connectivity",
        ok: true,
        detail: `connected_peers=${nPeers}`,
        critical: false,
      };
    }
    if (configuredSeeds && configuredSeeds.trim() !== "") {
      return {
        name: "Peer connectivity",
        ok: false,
        detail: "0 connected peers (seeds configured; check networking/firewall)",
        critical: false,
      };
    }
    return {
      name: "Peer connectivity",
      ok: true,
      detail: "0 connected peers (no seeds configured)",
      critical: false,
    };
  } catch (err) {
    return {
      name: "Peer connectivity",
      ok: false,
      detail: `net_info failed: ${String(err)}`,
      critical: false,
    };
  }
}

async function checkGenesis(nodeHome: string, expectedSha?: string): Promise<CheckResult> {
  const genesisPath = join(nodeHome, "config", "genesis.json");
  if (!existsSync(genesisPath)) {
    return {
      name: "Genesis file",
      ok: false,
      detail: `missing at ${genesisPath}`,
      critical: false,
    };
  }
  try {
    const bytes = await readFile(genesisPath);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (expectedSha && sha.toLowerCase() !== expectedSha.toLowerCase()) {
      return {
        name: "Genesis checksum",
        ok: false,
        detail: `mismatch expected=${expectedSha} got=${sha}`,
      };
    }
    return {
      name: "Genesis checksum",
      ok: true,
      detail: expectedSha ? `verified (${sha})` : `present (${sha})`,
      critical: false,
    };
  } catch (err) {
    return {
      name: "Genesis file",
      ok: false,
      detail: `read failed: ${String(err)}`,
      critical: false,
    };
  }
}

async function checkIntegratedReadiness(): Promise<CheckResult> {
  try {
    const report = await evaluateIntegratedReadiness();
    if (report.ready) {
      return {
        name: "Integrated readiness",
        ok: true,
        detail: "runtime+chain gates passed",
        critical: false,
      };
    }
    const blockers = report.blockers.map((b) => `${b.name}: ${b.detail}`).join(" | ");
    return {
      name: "Integrated readiness",
      ok: false,
      detail: blockers || "unknown blockers",
      critical: false,
    };
  } catch (err) {
    return {
      name: "Integrated readiness",
      ok: false,
      detail: String(err),
      critical: false,
    };
  }
}

async function checkAgentCapabilities(restUrl: string, agentAddress: string): Promise<CheckResult> {
  const url = `${trimSlash(restUrl)}/clawchain/agent/v1/agent/${encodeURIComponent(agentAddress)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return {
        name: "On-chain agent capabilities metadata",
        ok: false,
        detail: `HTTP ${res.status} (${url})`,
        critical: false,
      };
    }

    const raw = (await res.json()) as {
      registered?: boolean;
      supportedTools?: string[];
      supported_tools?: string[];
      pricingHint?: string;
      pricing_hint?: string;
      version?: string;
    };

    if (!raw.registered) {
      return {
        name: "On-chain agent capabilities metadata",
        ok: false,
        detail: "agent is not registered",
        critical: false,
      };
    }

    const supportedTools = (raw.supportedTools ?? raw.supported_tools ?? [])
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const sortedUnique = [...new Set([...supportedTools].sort((a, b) => a.localeCompare(b)))];
    const deterministic =
      supportedTools.length === sortedUnique.length &&
      supportedTools.every((t, i) => t === sortedUnique[i]);

    const pricingHint = (raw.pricingHint ?? raw.pricing_hint ?? "").trim();
    const version = (raw.version ?? "").trim();

    if (!deterministic) {
      return {
        name: "On-chain agent capabilities metadata",
        ok: false,
        detail: "supported_tools is not deterministic (must be sorted and unique)",
        critical: false,
      };
    }

    if (pricingHint.length === 0 || version.length === 0) {
      return {
        name: "On-chain agent capabilities metadata",
        ok: false,
        detail:
          `capabilities=${supportedTools.length} pricingHint=${pricingHint.length > 0} version=${version.length > 0}`,
        critical: false,
      };
    }

    return {
      name: "On-chain agent capabilities metadata",
      ok: true,
      detail: `capabilities=${supportedTools.length} pricingHint=true version=${version}`,
      critical: false,
    };
  } catch (err) {
    return {
      name: "On-chain agent capabilities metadata",
      ok: false,
      detail: String(err),
      critical: false,
    };
  }
}

async function evaluateStartupLifecycleSafe(): Promise<StartupLifecycleReport> {
  try {
    return await evaluateStartupLifecycle();
  } catch (err) {
    const detail = String(err);
    return {
      completed: false,
      currentStage: "chain_connect",
      blocker: detail,
      readiness: {
        chainId: "unknown",
        agentAddress: null,
        rpcUrl: "unknown",
        restUrl: "unknown",
        messagingEndpoint: null,
        checks: [],
        blockers: [],
        ready: false,
      },
      stages: [
        { stage: "identity_init", ok: false, detail },
        { stage: "chain_connect", ok: false, detail },
        { stage: "register", ok: false, detail },
        { stage: "heartbeat", ok: false, detail },
        { stage: "messaging", ok: false, detail },
      ],
    };
  }
}

function getLifecycleRepairHint(
  stage: StartupLifecycleStage,
  networkManifest?: string,
): string {
  switch (stage) {
    case "identity_init":
      return "Run: clawd init --skip-setup";
    case "chain_connect":
      if (networkManifest && networkManifest.trim().length > 0) {
        return `Run: clawd join --from-manifest ${networkManifest} --no-sync-genesis`;
      }
      return "Run: clawd join --from-manifest <manifest-url-or-path>";
    case "register":
      return "Run: clawd up --require-ready (auto-register enabled), then re-run doctor";
    case "heartbeat":
      return "Wait one heartbeat interval, ensure chain RPC is reachable, then run: clawd readiness";
    case "messaging":
      return "Set messaging endpoint via join host: clawd join --host <public-host> and ensure messaging server port is open";
    default:
      return "Run: clawd readiness";
  }
}

function getCheckRemediationHint(
  check: CheckResult,
  networkManifest?: string,
): string | null {
  if (check.ok) {
    return null;
  }

  switch (check.name) {
    case "Chain RPC":
      return [
        networkManifest && networkManifest.trim().length > 0
          ? `Run: clawd join --from-manifest ${networkManifest} --no-sync-genesis, then clawd readiness`
          : "Run: clawd join --from-manifest <manifest-url-or-path>, then clawd readiness",
        "EMERGENCY: If the chain process is unresponsive, force-restart with:",
        "  sudo systemctl stop clawchaind && sleep 2 && sudo systemctl start clawchaind",
        "  journalctl -u clawchaind -f --no-pager  # monitor recovery",
        "If the process is stuck (zombie/deadlock), escalate to a hard kill:",
        "  sudo pkill -9 -x clawchaind && sleep 3 && sudo systemctl start clawchaind",
      ].join("\n");
    case "Chain REST":
      return "Verify REST endpoint in config and run: clawd status";
    case "Peer connectivity":
      return [
        "Run: clawd peers auto-maintain --from-manifest <manifest-url-or-path>",
        "EMERGENCY: If peer count is 0 and the node is isolated, inject seed peers directly:",
        "  clawchaind config set config p2p.seeds '<node-id>@<ip>:26656,<node-id>@<ip>:26656' --home ~/.clawchain",
        "  sudo systemctl restart clawchaind",
        "To force-add a persistent peer immediately:",
        "  clawchaind config set config p2p.persistent_peers '<node-id>@<ip>:26656' --home ~/.clawchain",
        "  sudo systemctl restart clawchaind",
      ].join("\n");
    case "Gateway":
      return "Run: clawd up --require-ready or verify OpenClaw gateway process";
    case "Faucet":
      return "Run: clawd faucet request --from <faucet-url>";
    case "Messaging endpoint":
      return "Run: clawd join --host <public-host> and ensure messaging port is reachable";
    case "On-chain agent capabilities metadata":
      return "Run: clawd up --require-ready to auto-register capabilities, then clawd doctor --json";
    case "Genesis file":
    case "Genesis checksum":
      return networkManifest && networkManifest.trim().length > 0
        ? `Run: clawd join --from-manifest ${networkManifest}`
        : "Run: clawd join --from-manifest <manifest-url-or-path>";
    case "Incident mode":
      return [
        "Run: clawd incident exit (or --no-restore-peers), then clawd doctor --json",
        "EMERGENCY HALT: To immediately halt the validator and enter safe mode:",
        "  sudo systemctl stop clawchaind",
        "  clawd incident enter --reason 'emergency halt - <describe reason>'",
        "EMERGENCY RESUME: To resume operations after incident resolution:",
        "  clawd incident exit",
        "  sudo systemctl start clawchaind",
        "  clawd doctor --json  # verify all checks pass before re-enabling signing",
        "If peer state is corrupted, resume without restoring peers:",
        "  clawd incident exit --no-restore-peers",
        "  clawd peers sync-manifest --from-manifest <manifest-url-or-path>",
        "  sudo systemctl start clawchaind",
      ].join("\n");
    case "Backup status":
      return [
        "Run: ./scripts/verify-backup-restore.sh to verify backup integrity.",
        "If no recent backup exists, create one immediately:",
        "  ./scripts/backup-state.sh",
        "  ./scripts/verify-backup-restore.sh",
        "To restore from a verified backup:",
        "  make restore BACKUP=<path-to-backup-tarball>",
        "EMERGENCY: If validator keys are missing or corrupted:",
        "  sudo systemctl stop clawchaind",
        "  ./scripts/restore-state.sh <backup-tarball>",
        "  ./scripts/verify-backup-restore.sh <backup-tarball>",
        "  sudo systemctl start clawchaind",
        "See docs/key-rotation-failover-runbook.md for key rotation and failover procedures.",
      ].join("\n");
    case "Integrated readiness":
      return "Run: clawd readiness --json and resolve listed blockers";
    default:
      return "Run: clawd readiness";
  }
}

function trimSlash(v: string): string {
  return v.replace(/\/+$/, "");
}

function deriveRestUrl(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function checkIncidentMode(
  incident:
    | {
        active?: boolean;
        reason?: string;
        enteredAt?: string;
      }
    | undefined,
): CheckResult {
  if (!incident?.active) {
    return {
      name: "Incident mode",
      ok: true,
      detail: "inactive",
      critical: false,
    };
  }
  return {
    name: "Incident mode",
    ok: false,
    detail: `active reason=${incident.reason ?? "operator-triggered"} enteredAt=${incident.enteredAt ?? "unknown"}`,
    critical: false,
  };
}
