/**
 * Gateway RPC methods for the ClawChain provider lifecycle.
 *
 * These replace generic upstream assistant UX with the
 * "Install → Run → Earn" model: an operator installs the chain
 * binaries, runs the unified runtime, and earns CLAW by completing
 * tasks, accepting delegations, and staking.
 */

import {
  getBlockchainAgent,
  getBlockchainAddress,
  getBlockchainRuntimeStatus,
} from "../../../extensions/clawchain/index.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { formatForLog } from "../ws-log.js";
import type { GatewayRequestHandlers } from "./types.js";

type ProviderPhase = "install" | "run" | "earn";

type ProviderPhaseStatus = {
  phase: ProviderPhase;
  label: string;
  ok: boolean;
  detail: string;
  action?: string;
};

function resolveInstallPhase(runtime: Awaited<ReturnType<typeof getBlockchainRuntimeStatus>> | null): ProviderPhaseStatus {
  if (!runtime) {
    return {
      phase: "install",
      label: "Install",
      ok: false,
      detail: "Blockchain subsystem not initialized",
      action: "Enable blockchain in config or set BLOCKCHAIN_ENABLED=true",
    };
  }
  const chainOk = runtime.chain.alive;
  const agentConnected = runtime.agent.connected;
  if (!chainOk) {
    return {
      phase: "install",
      label: "Install",
      ok: false,
      detail: `Chain node unreachable at ${runtime.chain.rpcUrl}`,
      action: "Start clawchaind or check blockchain.rpcUrl in config",
    };
  }
  if (!agentConnected) {
    return {
      phase: "install",
      label: "Install",
      ok: false,
      detail: "Agent keypair not configured",
      action: "Set blockchain.mnemonic in config or BLOCKCHAIN_MNEMONIC env var",
    };
  }
  return {
    phase: "install",
    label: "Install",
    ok: true,
    detail: `Chain alive at ${runtime.chain.rpcUrl}, agent connected`,
  };
}

function resolveRunPhase(runtime: Awaited<ReturnType<typeof getBlockchainRuntimeStatus>> | null): ProviderPhaseStatus {
  if (!runtime) {
    return {
      phase: "run",
      label: "Run",
      ok: false,
      detail: "Runtime not available",
    };
  }
  const registered = runtime.readiness.checks.agentRegistered;
  const live = runtime.readiness.checks.agentLive;
  if (!registered) {
    return {
      phase: "run",
      label: "Run",
      ok: false,
      detail: "Agent not registered on-chain",
      action: "Set blockchain.autoRegister=true or run clawchain_register tool",
    };
  }
  if (!live) {
    return {
      phase: "run",
      label: "Run",
      ok: false,
      detail: "Agent registered but no heartbeat visible",
      action: "Enable heartbeat: blockchain.heartbeat.enabled=true",
    };
  }
  return {
    phase: "run",
    label: "Run",
    ok: true,
    detail: `Agent registered at ${runtime.agent.address}, heartbeat active`,
  };
}

function resolveEarnPhase(runtime: Awaited<ReturnType<typeof getBlockchainRuntimeStatus>> | null): ProviderPhaseStatus {
  if (!runtime) {
    return {
      phase: "earn",
      label: "Earn",
      ok: false,
      detail: "Runtime not available",
    };
  }
  const ready = runtime.readiness.ready;
  const blockers = runtime.readiness.blockers;
  if (!ready) {
    return {
      phase: "earn",
      label: "Earn",
      ok: false,
      detail: `Not ready: ${blockers.join(", ")}`,
      action: "Resolve blockers above to start earning",
    };
  }
  return {
    phase: "earn",
    label: "Earn",
    ok: true,
    detail: "Provider ready — accepting tasks, earning rewards",
  };
}

const PROVIDER_HELP = {
  overview: "Your OpenClaw agent is a ClawChain provider that earns CLAW tokens.",
  phases: [
    {
      phase: "install" as const,
      title: "Install",
      description: "Install clawchaind + clawproof, configure your agent identity",
      steps: [
        "Install clawchaind: make install (or download from releases)",
        "Install clawproof: cd cmd/clawproof && go build",
        "Generate or import a mnemonic for your agent keypair",
        "Configure blockchain section in openclaw.json",
      ],
    },
    {
      phase: "run" as const,
      title: "Run",
      description: "Register on-chain, start heartbeat, join the network",
      steps: [
        "Start the gateway: clawd start (or openclaw gateway run)",
        "Auto-register places your agent in the on-chain registry",
        "Heartbeat proves your agent is alive and available",
        "Configure messaging endpoint for peer-to-peer communication",
      ],
    },
    {
      phase: "earn" as const,
      title: "Earn",
      description: "Complete tasks, stake CLAW, climb the leaderboard",
      steps: [
        "Enable autonomous loop to auto-accept and execute tasks",
        "List skills on the marketplace for other agents to purchase",
        "Stake CLAW for validator rewards",
        "Use 'clawd provider' to monitor your provider lifecycle",
        "Use 'clawd dashboard' to see earnings and task activity",
      ],
    },
  ],
  commands: {
    status: "clawd provider — check provider lifecycle status",
    dashboard: "clawd dashboard — see full agent dashboard",
    balance: "clawd balance — check CLAW balance",
    tasks: "clawd task list — see available and assigned tasks",
    rewards: "clawd agent rewards — check earnings",
  },
};

export const providerLifecycleHandlers: GatewayRequestHandlers = {
  "provider.status": async ({ respond }) => {
    try {
      let runtime: Awaited<ReturnType<typeof getBlockchainRuntimeStatus>> | null = null;
      try {
        runtime = await getBlockchainRuntimeStatus();
      } catch {
        // Blockchain subsystem may not be initialized
      }

      const install = resolveInstallPhase(runtime);
      const run = resolveRunPhase(runtime);
      const earn = resolveEarnPhase(runtime);

      const allOk = install.ok && run.ok && earn.ok;
      const currentPhase: ProviderPhase = !install.ok ? "install" : !run.ok ? "run" : "earn";

      respond(true, {
        ready: allOk,
        currentPhase,
        phases: { install, run, earn },
        address: getBlockchainAddress() ?? null,
        blockHeight: runtime?.chain.latestBlockHeight ?? null,
        connectedPeers: runtime?.peers.connectedPeers ?? null,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },

  "provider.help": async ({ params, respond }) => {
    try {
      const phase = (params as { phase?: string })?.phase;
      if (phase && (phase === "install" || phase === "run" || phase === "earn")) {
        const phaseHelp = PROVIDER_HELP.phases.find((p) => p.phase === phase);
        respond(true, {
          phase: phaseHelp,
          commands: PROVIDER_HELP.commands,
        });
        return;
      }
      respond(true, PROVIDER_HELP);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
    }
  },
};
