/**
 * `clawd join` — configure this operator for an existing network.
 *
 * Sets RPC/REST, peers, faucet, and messaging endpoint in clawd config,
 * patches local CometBFT peer settings when node config exists, optionally
 * requests starter funds, and prints a shareable peer address.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadClawdConfig, writeClawdConfig } from "../lib/config.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";
import { configurePeers, getNodeId } from "../lib/peers.js";
import {
  parseTrustedManifestPubkeys,
  shouldRequireSignedManifest,
  verifyManifestSignatures,
} from "../lib/manifest-security.js";

export type JoinOptions = {
  fromManifest?: string;
  fromNodecard?: string;
  rpcUrl?: string;
  restUrl?: string;
  chainId?: string;
  seeds?: string;
  persistentPeers?: string;
  faucetUrl?: string;
  messagingEndpoint?: string;
  host?: string;
  requestFaucet?: boolean;
  syncGenesis?: boolean;
  requireSignedManifest?: boolean;
  manifestTrustedPubkeys?: string;
};

export async function runJoin(options: JoinOptions): Promise<void> {
  const manifestResult = await maybeLoadManifest(options.fromManifest, {
    requireSignedManifest: options.requireSignedManifest,
    manifestTrustedPubkeys: options.manifestTrustedPubkeys,
  });
  const manifest = manifestResult?.manifest ?? null;
  const nodecard = await maybeLoadNodecard(options.fromNodecard);
  const config = loadClawdConfig();
  const next = { ...config };

  const rpcUrl = options.rpcUrl ?? manifest?.endpoints?.rpc ?? nodecard?.endpoints?.rpc;
  const restUrl = options.restUrl ?? manifest?.endpoints?.rest ?? nodecard?.endpoints?.rest;
  const chainId = options.chainId ?? manifest?.chainId ?? nodecard?.chainId;
  const seeds =
    options.seeds ?? manifest?.seeds?.join(",") ?? (nodecard?.node?.p2p ? nodecard.node.p2p : undefined);
  const persistentPeers = options.persistentPeers;
  const faucetUrl = options.faucetUrl ?? manifest?.endpoints?.faucet ?? nodecard?.endpoints?.faucet ?? undefined;
  const messagingPort = config.messagingPort ?? 7777;
  const messagingEndpoint =
    options.messagingEndpoint ??
    nodecard?.endpoints?.messaging ??
    deriveMessagingEndpointFromHost(options.host, messagingPort);

  if (rpcUrl) next.rpcUrl = rpcUrl;
  if (restUrl) next.restUrl = restUrl;
  else if (rpcUrl) next.restUrl = deriveRestUrl(rpcUrl);
  if (chainId) next.chainId = chainId;
  if (seeds !== undefined) next.seeds = seeds;
  if (persistentPeers !== undefined) next.persistentPeers = persistentPeers;
  if (faucetUrl !== undefined) next.faucetUrl = faucetUrl;
  if (messagingEndpoint !== undefined) next.messagingEndpoint = messagingEndpoint;
  if (options.host) next.publicHost = options.host;
  if (options.fromManifest) next.networkManifest = options.fromManifest;
  if (manifestResult?.verification) {
    next.manifestSignatureRequired = manifestResult.verification.required;
    next.manifestSignatureVerified = manifestResult.verification.verified;
    next.manifestSignatureSignerPubkey = manifestResult.verification.signerPubkey;
    next.manifestSignatureVerifiedAt = new Date().toISOString();
    next.manifestSignatureDetail = manifestResult.verification.detail;
  }
  if (manifest?.genesis?.sha256) next.genesisSha256 = manifest.genesis.sha256;

  writeClawdConfig(next);

  const nodeHome = next.nodeHome || CLAWCHAIN_HOME;
  if (options.syncGenesis !== false && manifest?.genesis) {
    await syncGenesisFromManifest({
      manifest,
      source: options.fromManifest,
      nodeHome,
    });
  }
  const nodeCfgPath = join(nodeHome, "config", "config.toml");
  if (existsSync(nodeCfgPath) && (seeds !== undefined || persistentPeers !== undefined)) {
    try {
      configurePeers({
        seeds: next.seeds,
        persistentPeers: next.persistentPeers,
        nodeHome,
      });
      console.log("Updated local CometBFT peer settings in config.toml.");
    } catch (err) {
      console.warn(`Warning: failed to update local peer config.toml: ${String(err)}`);
    }
  }

  console.log("Join configuration saved.");
  console.log(`  Chain ID:            ${next.chainId}`);
  console.log(`  RPC URL:             ${next.rpcUrl}`);
  console.log(`  REST URL:            ${next.restUrl ?? deriveRestUrl(next.rpcUrl)}`);
  if (next.seeds) console.log(`  Seeds:               ${next.seeds}`);
  if (next.persistentPeers) console.log(`  Persistent peers:    ${next.persistentPeers}`);
  if (next.faucetUrl) console.log(`  Faucet URL:          ${next.faucetUrl}`);
  if (next.messagingEndpoint) console.log(`  Messaging endpoint:  ${next.messagingEndpoint}`);

  const nodeBin = next.nodeBinaryPath ?? process.env.CLAWCHAIND_PATH ?? "clawchaind";
  try {
    const nodeId = getNodeId(nodeBin, nodeHome);
    const host = options.host ?? "YOUR_PUBLIC_IP_OR_DNS";
    console.log(`  Share peer address:  ${nodeId}@${host}:26656`);
  } catch {
    console.log("  Share peer address:  (node not initialized yet; run `clawd init` first)");
  }

  if (options.requestFaucet) {
    const faucetUrl = next.faucetUrl;
    if (!faucetUrl) {
      console.warn("Skipped faucet request: no faucet URL configured.");
      return;
    }
    if (!next.agentAddress) {
      console.warn("Skipped faucet request: no agent address in config (run `clawd init`).");
      return;
    }
    await requestFaucet(faucetUrl, next.agentAddress);
  }
}

type JoinManifest = {
  chainId?: string;
  genesis?: {
    path?: string;
    sha256?: string;
    url?: string;
  };
  endpoints?: {
    rpc?: string;
    rest?: string;
    faucet?: string;
  };
  seeds?: string[];
  signatures?: Array<{
    pubkey?: string;
    signature?: string;
  }>;
};

type JoinNodecard = {
  chainId?: string;
  node?: {
    p2p?: string;
  };
  endpoints?: {
    rpc?: string;
    rest?: string;
    faucet?: string | null;
    messaging?: string | null;
  };
};

async function maybeLoadManifest(
  fromManifest: string | undefined,
  options: {
    requireSignedManifest?: boolean;
    manifestTrustedPubkeys?: string;
  },
): Promise<
  | {
      manifest: JoinManifest;
      verification: {
        required: boolean;
        verified: boolean;
        signerPubkey?: string;
        detail: string;
      };
    }
  | null
> {
  if (!fromManifest) return null;

  const requireSignature = shouldRequireSignedManifest({
    source: fromManifest,
    explicitRequire: options.requireSignedManifest,
  });

  try {
    let raw = "";
    if (/^https?:\/\//i.test(fromManifest)) {
      const res = await fetch(fromManifest, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      raw = await res.text();
    } else {
      raw = await readFile(fromManifest, "utf8");
    }
    const parsed = JSON.parse(raw) as JoinManifest;

    const trustedPubkeys = parseTrustedManifestPubkeys(options.manifestTrustedPubkeys);
    const verification = await verifyManifestSignatures({
      manifest: parsed,
      trustedPubkeys,
    });

    if (requireSignature && !verification.ok) {
      throw new Error(`manifest signature verification failed (${verification.detail})`);
    }

    return {
      manifest: parsed,
      verification: {
        required: requireSignature,
        verified: verification.ok,
        signerPubkey: verification.signerPubkey,
        detail: verification.ok
          ? verification.detail
          : requireSignature
            ? `required: ${verification.detail}`
            : `not required: ${verification.detail}`,
      },
    };
  } catch (err) {
    if (requireSignature) {
      throw err;
    }
    console.warn(`Warning: failed to load manifest ${fromManifest}: ${String(err)}`);
    return null;
  }
}

async function maybeLoadNodecard(fromNodecard?: string): Promise<JoinNodecard | null> {
  if (!fromNodecard) return null;
  try {
    let raw = "";
    if (/^https?:\/\//i.test(fromNodecard)) {
      const res = await fetch(fromNodecard, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      raw = await res.text();
    } else {
      raw = await readFile(fromNodecard, "utf8");
    }
    return JSON.parse(raw) as JoinNodecard;
  } catch (err) {
    console.warn(`Warning: failed to load nodecard ${fromNodecard}: ${String(err)}`);
    return null;
  }
}

async function syncGenesisFromManifest(params: {
  manifest: JoinManifest;
  source?: string;
  nodeHome: string;
}): Promise<void> {
  const { manifest, source, nodeHome } = params;
  const genesis = manifest.genesis;
  if (!genesis) return;

  const bytes = await loadGenesisBytes(source, genesis.url, genesis.path);
  if (!bytes) {
    console.warn("Warning: could not resolve genesis bytes from manifest.");
    return;
  }

  const actualSha = sha256Hex(bytes);
  if (genesis.sha256 && actualSha.toLowerCase() !== genesis.sha256.toLowerCase()) {
    console.warn(
      `Warning: genesis checksum mismatch (expected ${genesis.sha256}, got ${actualSha}). Skipping genesis write.`,
    );
    return;
  }

  const cfgDir = join(nodeHome, "config");
  const genesisPath = join(cfgDir, "genesis.json");
  await mkdir(cfgDir, { recursive: true });
  await writeFile(genesisPath, bytes);
  console.log(`  Genesis synced:       ${genesisPath}`);
  if (genesis.sha256) {
    console.log(`  Genesis SHA256:       ${actualSha}`);
  }
}

async function loadGenesisBytes(
  sourceManifest: string | undefined,
  explicitUrl: string | undefined,
  relativePath: string | undefined,
): Promise<Buffer | null> {
  if (explicitUrl) {
    return fetchBytes(explicitUrl);
  }

  if (!sourceManifest) return null;

  if (/^https?:\/\//i.test(sourceManifest)) {
    if (!relativePath) return null;
    try {
      const url = new URL(relativePath, sourceManifest).toString();
      return await fetchBytes(url);
    } catch {
      return null;
    }
  }

  if (!relativePath) return null;
  try {
    const resolvedPath = resolve(dirname(sourceManifest), relativePath);
    return await readFile(resolvedPath);
  } catch {
    return null;
  }
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function requestFaucet(faucetUrl: string, address: string): Promise<void> {
  console.log(`Requesting faucet funds from ${faucetUrl} for ${address}...`);
  try {
    const data = await requestFaucetWithFallback(faucetUrl, address);
    console.log(`Faucet success: ${String(data.amount)} ${String(data.denom)} (tx: ${String(data.txHash)})`);
  } catch (err) {
    console.warn(`Faucet request failed: ${String(err)}`);
  }
}

async function requestFaucetWithFallback(
  faucetUrl: string,
  address: string,
): Promise<Record<string, unknown>> {
  const base = faucetUrl.replace(/\/?$/, "");
  const endpoints = ["/faucet/request", "/send"];
  let lastError = "Unknown faucet error";

  for (const path of endpoints) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok) return data;
    lastError = String(data.error ?? `HTTP ${res.status}`);
    if (res.status !== 404) {
      break;
    }
  }

  throw new Error(lastError);
}

function deriveRestUrl(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function deriveMessagingEndpointFromHost(host: string | undefined, port: number): string | undefined {
  if (!host) return undefined;
  const trimmed = host.trim();
  if (!trimmed) return undefined;
  if (trimmed === "YOUR_PUBLIC_IP_OR_DNS") return undefined;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (!url.port) url.port = String(port);
      return url.toString().replace(/\/$/, "");
    } catch {
      return undefined;
    }
  }

  return `http://${trimmed}:${port}`;
}
