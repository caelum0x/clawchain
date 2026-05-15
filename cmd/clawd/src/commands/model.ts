/**
 * `clawd model` subcommands — list, query, register, providers, inference
 * for the model registry.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr, truncate } from "../lib/format.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

async function ensureSigner() {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

  if (!mnemonicFileExists()) {
    throw new Error('No mnemonic found. Run "clawd init" first.');
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("Failed to load mnemonic.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error("Failed to derive wallet account.");
  }

  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return { cfg, rpcUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// clawd model list
// ---------------------------------------------------------------------------

export type ModelListOptions = {
  json?: boolean;
  owner?: string;
};

export async function runModelList(opts: ModelListOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const params: string[] = [];
  if (opts.owner) params.push(`owner=${encodeURIComponent(opts.owner)}`);
  const qs = params.length > 0 ? `?${params.join("&")}` : "";

  const url = `${restUrl}/clawchain/modelregistry/v1/models${qs}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query models (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { models?: any[] };
    const models = data.models ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ models }, null, 2) + "\n");
      return;
    }

    if (models.length === 0) {
      console.log("No models found.");
      return;
    }

    const headers = ["ID", "Name", "Owner", "Version", "Access", "Price", "Status"];
    const rows = models.map((m: any) => [
      String(m.id ?? 0),
      truncate(String(m.name ?? ""), 30),
      shortAddr(m.owner ?? ""),
      String(m.version ?? m.model_version ?? "1"),
      String(m.access_type ?? m.accessType ?? ""),
      formatClaw(String(m.price_per_query ?? m.pricePerQuery ?? m.price ?? "0")),
      String(m.status ?? "active"),
    ]);

    console.log(`Models (${models.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query models: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd model query <modelId>
// ---------------------------------------------------------------------------

export type ModelQueryOptions = {
  modelId: string;
  json?: boolean;
};

export async function runModelQuery(opts: ModelQueryOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/modelregistry/v1/model/${encodeURIComponent(opts.modelId)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`Model ${opts.modelId} not found.`);
      } else {
        console.error(`Failed to query model (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { model?: any };
    const model = data.model ?? data;

    if (opts.json) {
      process.stdout.write(JSON.stringify(model, null, 2) + "\n");
      return;
    }

    console.log(`Model #${opts.modelId}\n`);
    console.log(`  Name:        ${model.name ?? "-"}`);
    console.log(`  Description: ${model.description ?? "-"}`);
    console.log(`  Owner:       ${model.owner ?? "-"}`);
    console.log(`  Version:     ${model.version ?? model.model_version ?? "-"}`);
    console.log(`  Access Type: ${model.access_type ?? model.accessType ?? "-"}`);
    console.log(`  Price:       ${formatClaw(String(model.price_per_query ?? model.pricePerQuery ?? model.price ?? "0"))}`);
    console.log(`  Endpoint:    ${model.endpoint ?? "-"}`);
    console.log(`  Status:      ${model.status ?? "active"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query model: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd model register
// ---------------------------------------------------------------------------

export type ModelRegisterOptions = {
  name: string;
  description?: string;
  modelType?: string;
  accessType?: string;
  pricePerQuery?: string;
  endpoint?: string;
};

export async function runModelRegister(opts: ModelRegisterOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Registering model "${opts.name}"...`);

  const msg = {
    typeUrl: "/clawchain.modelregistry.v1.MsgRegisterModel",
    value: {
      creator: account.address,
      name: opts.name,
      description: opts.description ?? "",
      modelType: opts.modelType ?? "",
      accessType: opts.accessType ?? "free",
      pricePerQuery: opts.pricePerQuery ?? "0",
      endpoint: opts.endpoint ?? "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Model registration failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    // Extract model_id from events
    let modelId = "unknown";
    for (const event of res.events ?? []) {
      if (event.type === "model_registered") {
        const attr = event.attributes.find(
          (a: { key: string }) => a.key === "model_id",
        );
        if (attr) {
          modelId = typeof attr.value === "string" ? attr.value : new TextDecoder().decode(attr.value);
          break;
        }
      }
    }

    console.log(`Model registered successfully.`);
    console.log(`  Model ID:    ${modelId}`);
    console.log(`  Name:        ${opts.name}`);
    console.log(`  Access:      ${opts.accessType ?? "free"}`);
    console.log(`  TxHash:      ${res.transactionHash}`);
  } catch (err) {
    console.error(`Model registration failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd model providers
// ---------------------------------------------------------------------------

export type ModelProvidersOptions = {
  modelId?: string;
  json?: boolean;
};

export async function runModelProviders(opts: ModelProvidersOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const params: string[] = [];
  if (opts.modelId) params.push(`model_id=${encodeURIComponent(opts.modelId)}`);
  const qs = params.length > 0 ? `?${params.join("&")}` : "";

  const url = `${restUrl}/clawchain/modelregistry/v1/inference_providers${qs}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query inference providers (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { providers?: any[] };
    const providers = data.providers ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ providers }, null, 2) + "\n");
      return;
    }

    if (providers.length === 0) {
      console.log("No inference providers found.");
      return;
    }

    const headers = ["Address", "Model", "Endpoint", "Price/Query", "Active"];
    const rows = providers.map((p: any) => [
      shortAddr(p.address ?? p.provider_address ?? ""),
      String(p.model_id ?? p.modelId ?? "-"),
      truncate(String(p.endpoint ?? ""), 40),
      formatClaw(String(p.price_per_query ?? p.pricePerQuery ?? "0")),
      String(p.active ?? true),
    ]);

    console.log(`Inference Providers (${providers.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query inference providers: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd model inference
// ---------------------------------------------------------------------------

export type ModelInferenceOptions = {
  modelId: string;
  input: string;
  maxFee?: string;
};

export async function runModelInference(opts: ModelInferenceOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Submitting inference request to model #${opts.modelId}...`);

  const msg = {
    typeUrl: "/clawchain.modelregistry.v1.MsgRequestInference",
    value: {
      creator: account.address,
      modelId: opts.modelId,
      input: opts.input,
      maxFee: opts.maxFee ?? "0",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Inference request failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    // Extract request_id from events
    let requestId = "unknown";
    for (const event of res.events ?? []) {
      if (event.type === "inference_requested") {
        const attr = event.attributes.find(
          (a: { key: string }) => a.key === "request_id",
        );
        if (attr) {
          requestId = typeof attr.value === "string" ? attr.value : new TextDecoder().decode(attr.value);
          break;
        }
      }
    }

    console.log(`Inference request submitted successfully.`);
    console.log(`  Request ID:  ${requestId}`);
    console.log(`  Model ID:    ${opts.modelId}`);
    console.log(`  Max Fee:     ${formatClaw(opts.maxFee ?? "0")}`);
    console.log(`  TxHash:      ${res.transactionHash}`);
  } catch (err) {
    console.error(`Inference request failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
