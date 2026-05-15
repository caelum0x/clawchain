/**
 * `clawd bootstrap` — one-command operator onboarding flow.
 *
 * Order:
 * 1) install-node (config + optional service)
 * 2) join (manifest/explicit network config)
 * 3) optional faucet request
 * 4) doctor checks
 */

import { runDoctor } from "./doctor.js";
import { runInstallNode } from "./install-node.js";
import { runJoin } from "./join.js";
import { waitForIntegratedReadiness } from "../lib/readiness.js";

export type BootstrapOptions = {
  fromManifest?: string;
  fromNodecard?: string;
  chainId?: string;
  rpcUrl?: string;
  restUrl?: string;
  seeds?: string;
  persistentPeers?: string;
  faucetUrl?: string;
  messagingEndpoint?: string;
  host?: string;
  noSyncGenesis?: boolean;
  requestFaucet?: boolean;
  requireSignedManifest?: boolean;
  manifestTrustedPubkeys?: string;
  binaryPath?: string;
  nodeHome?: string;
  serviceName?: string;
  buildLocal?: boolean;
  noService?: boolean;
  noStartNow?: boolean;
  requireReady?: boolean;
  readyTimeoutSeconds?: number;
};

export async function runBootstrap(options: BootstrapOptions): Promise<void> {
  console.log("clawd bootstrap: install-node -> join -> doctor\n");

  await runInstallNode({
    binaryPath: options.binaryPath,
    nodeHome: options.nodeHome,
    serviceName: options.serviceName,
    buildLocal: options.buildLocal,
    noService: options.noService,
    startNow: options.noStartNow ? false : true,
  });

  console.log("");

  await runJoin({
    fromManifest: options.fromManifest,
    fromNodecard: options.fromNodecard,
    chainId: options.chainId,
    rpcUrl: options.rpcUrl,
    restUrl: options.restUrl,
    seeds: options.seeds,
    persistentPeers: options.persistentPeers,
    faucetUrl: options.faucetUrl,
    messagingEndpoint: options.messagingEndpoint,
    host: options.host,
    syncGenesis: options.noSyncGenesis ? false : true,
    requestFaucet: options.requestFaucet,
    requireSignedManifest: options.requireSignedManifest,
    manifestTrustedPubkeys: options.manifestTrustedPubkeys,
  });

  console.log("");
  await runDoctor();

  if (options.requireReady) {
    const timeoutSeconds = Math.max(10, options.readyTimeoutSeconds ?? 120);
    console.log("");
    console.log(`clawd bootstrap: waiting for integrated readiness (timeout: ${timeoutSeconds}s)...`);
    const report = await waitForIntegratedReadiness(timeoutSeconds, {
      intervalMs: 5000,
      onPending: (pending) => {
        const blockers = pending.blockers.map((b) => `${b.name}: ${b.detail}`).join(" | ");
        console.log(`clawd bootstrap: readiness pending -> ${blockers}`);
      },
    });
    if (!report.ready) {
      const blockers = report.blockers.map((b) => `${b.name}: ${b.detail}`).join(" | ");
      throw new Error(`bootstrap readiness timed out after ${timeoutSeconds}s. blockers: ${blockers}`);
    }
    console.log("clawd bootstrap: integrated readiness passed.");
  }
}
