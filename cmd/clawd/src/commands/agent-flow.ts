/**
 * `clawd agent-flow` — execute core agent lifecycle:
 * register -> heartbeat -> delegate -> (optional) accept -> (optional) complete.
 */

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";

export type AgentFlowOptions = {
  assignee: string;
  description: string;
  requirements?: string;
  skillId?: number;
  budget?: string;
  deadlineBlocks?: number;
  endpoint?: string;
  metadata?: string;
  name?: string;
  autoAccept?: boolean;
  autoComplete?: boolean;
  completionResult?: string;
  json?: boolean;
};

type AgentFlowStage = "validate" | "connect" | "register" | "heartbeat" | "delegate" | "accept" | "complete" | "verify";

export type AgentFlowResult = {
  ok: boolean;
  stage?: AgentFlowStage;
  error?: string;
  chainId?: string;
  rpcUrl?: string;
  restUrl?: string;
  fromKey?: string;
  fromAddress?: string;
  assignee?: string;
  alreadyRegistered?: boolean;
  registerTxHash?: string;
  heartbeatTxHash?: string;
  delegateTxHash?: string;
  acceptTxHash?: string;
  completeTxHash?: string;
  taskId?: number;
  nodeHeight?: number;
  verifiedTaskStatus?: string;
};

export type AgentBootstrapOptions = {
  endpoint?: string;
  metadata?: string;
  name?: string;
};

type TxResult = {
  transactionHash: string;
  code: number;
  rawLog: string;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
};

type TaskInfoResponse = {
  found: boolean;
  status: string;
  taskId: number;
  delegatorAddress: string;
  assigneeAddress: string;
  description: string;
};

type TasksResponse = {
  tasks: TaskInfoResponse[];
};

type AgentInfoResponse = {
  registered?: boolean;
};

type AgentLivenessResponse = {
  found?: boolean;
  liveness?: { heartbeatCount?: number };
};

type ClawChainClientLike = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getAddress(): string;
  getAgent(address: string): Promise<AgentInfoResponse>;
  registerAgent(params: {
    pubkey: string;
    endpoint: string;
    name: string;
    supportedTools?: string[];
    pricingHint?: string;
    version?: string;
  }): Promise<TxResult>;
  agentHeartbeat(params: {
    nodeHeight: number;
    endpoint?: string;
    metadata?: string;
  }): Promise<TxResult>;
  delegateTask(params: {
    assignee: string;
    description: string;
    requirements?: string;
    skillId?: number;
    budget?: string;
    deadlineBlocks?: number;
  }): Promise<TxResult>;
  acceptTask(params: { taskId: number }): Promise<TxResult>;
  completeTask(params: { taskId: number; result: string }): Promise<TxResult>;
  getTask(taskId: number): Promise<TaskInfoResponse>;
  getTasksByDelegator(address: string): Promise<TasksResponse>;
  getAgentLiveness(address: string): Promise<AgentLivenessResponse>;
};

type ClawChainClientConstructor = new (options: {
  rpcUrl?: string;
  mnemonic?: string;
  prefix?: string;
  gasPrice?: string;
}) => ClawChainClientLike;

export async function runAgentFlow(options: AgentFlowOptions): Promise<void> {
  const out = await executeAgentFlow(options);
  if (options.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    if (!out.ok) process.exitCode = 1;
    return;
  }

  if (!out.ok) {
    console.error(`agent-flow failed${out.stage ? ` [${out.stage}]` : ""}: ${out.error ?? "unknown error"}`);
    process.exit(1);
  }

  console.log("clawd agent-flow\n");
  console.log(`  Chain ID:    ${out.chainId}`);
  console.log(`  RPC URL:     ${out.rpcUrl}`);
  console.log(`  REST URL:    ${out.restUrl}`);
  console.log(`  From key:    ${out.fromKey}`);
  console.log(`  From addr:   ${out.fromAddress}`);
  console.log(`  Assignee:    ${out.assignee}`);
  console.log("");
  console.log(`  Registration: ${out.alreadyRegistered ? "already registered" : "newly registered"}`);
  if (out.registerTxHash) console.log(`  registerTxHash: ${out.registerTxHash}`);
  console.log(`  heartbeatTxHash: ${out.heartbeatTxHash ?? ""}`);
  console.log(`  delegateTxHash:  ${out.delegateTxHash ?? ""}`);
  if (out.acceptTxHash) console.log(`  acceptTxHash:    ${out.acceptTxHash}`);
  if (out.completeTxHash) console.log(`  completeTxHash:  ${out.completeTxHash}`);
  if (out.taskId != null) console.log(`  taskId:          ${out.taskId}`);
  if (out.verifiedTaskStatus) console.log(`  verifiedStatus:  ${out.verifiedTaskStatus}`);
}

export async function runAgentBootstrap(options: AgentBootstrapOptions = {}): Promise<AgentFlowResult> {
  return executeAgentBootstrap(options);
}

async function executeAgentFlow(options: AgentFlowOptions): Promise<AgentFlowResult> {
  if (!options.assignee) {
    return fail("validate", "assignee is required");
  }
  if (!options.description) {
    return fail("validate", "description is required");
  }
  if (options.autoComplete && !options.completionResult) {
    return fail("validate", "--completion-result is required when --auto-complete is set");
  }

  const cfg = loadClawdConfig();
  const chainId = cfg.chainId;
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = cfg.restUrl ?? deriveRestUrl(rpcUrl);
  const keyName = "agent";
  const endpoint = options.endpoint ?? cfg.messagingEndpoint ?? "";
  const metadata = options.metadata ?? "";
  const name = options.name ?? cfg.moniker ?? "clawd-agent";

  const base: AgentFlowResult = {
    ok: false,
    chainId,
    rpcUrl,
    restUrl,
    fromKey: keyName,
    assignee: options.assignee,
  };

  if (!mnemonicFileExists()) {
    return fail("validate", 'No mnemonic found. Run "clawd init" first.', base);
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    return fail("validate", "Failed to load mnemonic.", base);
  }

  const sdk = await loadSdkModule();
  if (!sdk) {
    return fail("connect", "Unable to load ClawChain SDK. Build sdk package or set CLAWCHAIN_SDK_ENTRY.", base);
  }

  const Client = sdk.ClawChainClient;
  const client = new Client({
    rpcUrl,
    mnemonic,
    prefix: process.env.CLAWCHAIN_PREFIX,
    gasPrice: process.env.CLAWCHAIN_GAS_PRICE,
  });

  try {
    await client.connect();
  } catch (err: unknown) {
    return fail("connect", asError(err), base);
  }

  try {
    const address = client.getAddress();
    base.fromAddress = address;

    const alreadyRegistered = await isRegistered(client, address);
    base.alreadyRegistered = alreadyRegistered;

    if (!alreadyRegistered) {
      const pubkey = await deriveCompressedPubkey(mnemonic);
      const registerTx = await runTxWithRetry("register-agent", () =>
        client.registerAgent({
          pubkey,
          endpoint,
          name,
        }),
      );
      if (!isTxSuccess(registerTx)) {
        return fail("register", formatTxFailure("register-agent", registerTx), {
          ...base,
          registerTxHash: registerTx.transactionHash,
        });
      }
      base.registerTxHash = registerTx.transactionHash;
    }

    let nodeHeight: number;
    try {
      nodeHeight = await fetchNodeHeight(rpcUrl);
      base.nodeHeight = nodeHeight;
    } catch (err: unknown) {
      return fail("heartbeat", `failed to fetch node height: ${asError(err)}`, base);
    }

    const heartbeatTx = await runTxWithRetry("agent-heartbeat", () =>
      client.agentHeartbeat({
        nodeHeight,
        endpoint,
        metadata,
      }),
    );
    if (!isTxSuccess(heartbeatTx)) {
      return fail("heartbeat", formatTxFailure("agent-heartbeat", heartbeatTx), {
        ...base,
        heartbeatTxHash: heartbeatTx.transactionHash,
      });
    }
    base.heartbeatTxHash = heartbeatTx.transactionHash;

    const delegateTx = await runTxWithRetry("delegate-task", () =>
      client.delegateTask({
        assignee: options.assignee,
        description: options.description,
        requirements: options.requirements ?? "",
        skillId: options.skillId ?? 0,
        budget: options.budget ?? "",
        deadlineBlocks: options.deadlineBlocks ?? 0,
      }),
    );
    if (!isTxSuccess(delegateTx)) {
      return fail("delegate", formatTxFailure("delegate-task", delegateTx), {
        ...base,
        delegateTxHash: delegateTx.transactionHash,
      });
    }
    base.delegateTxHash = delegateTx.transactionHash;
    base.taskId = extractTaskId(delegateTx);
    if (base.taskId == null) {
      base.taskId = await resolveDelegatedTaskId(client, address, options.assignee, options.description);
    }

    const wantsAccept = options.autoAccept === true;
    const wantsComplete = options.autoComplete === true;
    if (wantsAccept || wantsComplete) {
      if (options.assignee !== address) {
        return fail(
          wantsAccept ? "accept" : "complete",
          `autoAccept/autoComplete requires assignee (${options.assignee}) to equal signer address (${address})`,
          base,
        );
      }
      if (base.taskId == null) {
        return fail(
          wantsAccept ? "accept" : "complete",
          "Task delegated but task_id was not found; cannot auto-accept/complete.",
          base,
        );
      }
    }

    if (wantsAccept) {
      const acceptTx = await runTxWithRetry("accept-task", () => client.acceptTask({ taskId: base.taskId! }));
      if (!isTxSuccess(acceptTx)) {
        return fail("accept", formatTxFailure("accept-task", acceptTx), {
          ...base,
          acceptTxHash: acceptTx.transactionHash,
        });
      }
      base.acceptTxHash = acceptTx.transactionHash;
    }

    if (wantsComplete) {
      const completeTx = await runTxWithRetry("complete-task", () =>
        client.completeTask({ taskId: base.taskId!, result: options.completionResult! }),
      );
      if (!isTxSuccess(completeTx)) {
        return fail("complete", formatTxFailure("complete-task", completeTx), {
          ...base,
          completeTxHash: completeTx.transactionHash,
        });
      }
      base.completeTxHash = completeTx.transactionHash;
    }

    if (base.taskId != null) {
      const expectedStatus = wantsComplete ? "completed" : wantsAccept ? "accepted" : "pending";
      const verified = await waitForTaskStatus(client, base.taskId, expectedStatus);
      if (!verified.ok) {
        return fail("verify", verified.error, base);
      }
      base.verifiedTaskStatus = verified.status;
    }

    return { ...base, ok: true };
  } catch (err: unknown) {
    return fail("connect", asError(err), base);
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

async function executeAgentBootstrap(options: AgentBootstrapOptions): Promise<AgentFlowResult> {
  const cfg = loadClawdConfig();
  const chainId = cfg.chainId;
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = cfg.restUrl ?? deriveRestUrl(rpcUrl);
  const keyName = "agent";
  const endpoint = options.endpoint ?? cfg.messagingEndpoint ?? "";
  const metadata = options.metadata ?? "";
  const name = options.name ?? cfg.moniker ?? "clawd-agent";

  const base: AgentFlowResult = {
    ok: false,
    chainId,
    rpcUrl,
    restUrl,
    fromKey: keyName,
  };

  if (!mnemonicFileExists()) {
    return fail("validate", 'No mnemonic found. Run "clawd init" first.', base);
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    return fail("validate", "Failed to load mnemonic.", base);
  }

  const sdk = await loadSdkModule();
  if (!sdk) {
    return fail("connect", "Unable to load ClawChain SDK. Build sdk package or set CLAWCHAIN_SDK_ENTRY.", base);
  }

  const Client = sdk.ClawChainClient;
  const client = new Client({
    rpcUrl,
    mnemonic,
    prefix: process.env.CLAWCHAIN_PREFIX,
    gasPrice: process.env.CLAWCHAIN_GAS_PRICE,
  });

  try {
    await client.connect();
  } catch (err: unknown) {
    return fail("connect", asError(err), base);
  }

  try {
    const address = client.getAddress();
    base.fromAddress = address;

    const alreadyRegistered = await isRegistered(client, address);
    base.alreadyRegistered = alreadyRegistered;
    if (!alreadyRegistered) {
      const pubkey = await deriveCompressedPubkey(mnemonic);
      const registerTx = await runTxWithRetry("register-agent", () =>
        client.registerAgent({
          pubkey,
          endpoint,
          name,
        }),
      );
      if (!isTxSuccess(registerTx)) {
        return fail("register", formatTxFailure("register-agent", registerTx), {
          ...base,
          registerTxHash: registerTx.transactionHash,
        });
      }
      base.registerTxHash = registerTx.transactionHash;
    }

    const nodeHeight = await fetchNodeHeight(rpcUrl);
    base.nodeHeight = nodeHeight;

    const heartbeatTx = await runTxWithRetry("agent-heartbeat", () =>
      client.agentHeartbeat({
        nodeHeight,
        endpoint,
        metadata,
      }),
    );
    if (!isTxSuccess(heartbeatTx)) {
      return fail("heartbeat", formatTxFailure("agent-heartbeat", heartbeatTx), {
        ...base,
        heartbeatTxHash: heartbeatTx.transactionHash,
      });
    }
    base.heartbeatTxHash = heartbeatTx.transactionHash;

    const verified = await waitForLiveness(client, address);
    if (!verified.ok) {
      return fail("verify", verified.error, base);
    }
    base.verifiedTaskStatus = "heartbeat_live";

    return { ...base, ok: true };
  } catch (err: unknown) {
    return fail("connect", asError(err), base);
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

async function loadSdkModule(): Promise<{ ClawChainClient: ClawChainClientConstructor } | null> {
  const explicit = process.env.CLAWCHAIN_SDK_ENTRY?.trim();
  if (explicit) {
    try {
      return (await import(pathToFileURL(explicit).href)) as { ClawChainClient: ClawChainClientConstructor };
    } catch {
      return null;
    }
  }

  try {
    const pkgName = "@clawchain/sdk";
    const pkg = (await import(pkgName)) as { ClawChainClient: ClawChainClientConstructor };
    if (pkg?.ClawChainClient) return pkg;
  } catch {
    // continue to local fallback
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..", "..", "..", "..");
  const candidates = [
    join(root, "sdk", "dist", "index.js"),
    join(root, "sdk", "src", "index.ts"),
  ];

  for (const candidate of candidates) {
    try {
      const mod = (await import(pathToFileURL(candidate).href)) as { ClawChainClient: ClawChainClientConstructor };
      if (mod?.ClawChainClient) return mod;
    } catch {
      // try next
    }
  }

  return null;
}

function isTxSuccess(tx: TxResult): boolean {
  return Number(tx.code ?? 1) === 0;
}

function shouldRetryText(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("connection refused") ||
    lower.includes("connection reset") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("eof") ||
    lower.includes("unavailable") ||
    lower.includes("i/o timeout")
  );
}

async function runTxWithRetry(opName: string, fn: () => Promise<TxResult>): Promise<TxResult> {
  const maxAttempts = 3;
  let last: TxResult = {
    transactionHash: "",
    code: 1,
    rawLog: `${opName} failed: no attempts`,
    events: [],
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const tx = await fn();
      if (isTxSuccess(tx)) return tx;
      last = tx;
      if (!shouldRetryText(tx.rawLog ?? "") || attempt === maxAttempts) return tx;
    } catch (err: unknown) {
      const message = asError(err);
      last = {
        transactionHash: "",
        code: 1,
        rawLog: `${opName} execution error: ${message}`,
        events: [],
      };
      if (!shouldRetryText(message) || attempt === maxAttempts) return last;
    }
    await sleep(1200 * attempt);
  }

  return last;
}

async function isRegistered(client: ClawChainClientLike, address: string): Promise<boolean> {
  try {
    const out = await client.getAgent(address);
    return Boolean(out.registered);
  } catch {
    return false;
  }
}

async function fetchNodeHeight(rpcUrl: string): Promise<number> {
  const statusA = await fetchNodeStatus(rpcUrl);
  if (statusA.catchingUp) {
    throw new Error(`node is still catching up at height ${statusA.height}; wait for full sync before running agent flow`);
  }

  // Ensure block production is actually progressing before submitting txs.
  await sleep(2_500);
  const statusB = await fetchNodeStatus(rpcUrl);
  if (!statusB.catchingUp && statusB.height <= statusA.height) {
    throw new Error(`node appears stalled at height ${statusB.height} (no block production)`);
  }

  return statusB.height;
}

async function fetchNodeStatus(rpcUrl: string): Promise<{ height: number; catchingUp: boolean }> {
  const statusUrl = `${trimSlash(rpcUrl)}/status`;
  const res = await fetch(statusUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`status endpoint failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    result?: { sync_info?: { latest_block_height?: string; catching_up?: boolean } };
  };
  const rawHeight = data.result?.sync_info?.latest_block_height ?? "0";
  const height = Number.parseInt(rawHeight, 10);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("failed to parse latest_block_height");
  }
  return {
    height,
    catchingUp: Boolean(data.result?.sync_info?.catching_up),
  };
}

async function waitForTaskStatus(
  client: ClawChainClientLike,
  taskId: number,
  expectedStatus: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const attempts = 8;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const task = await client.getTask(taskId);
      if (task.found && task.status === expectedStatus) {
        return { ok: true, status: task.status };
      }
    } catch {
      // keep polling
    }
    await sleep(800);
  }
  return {
    ok: false,
    error: `task ${taskId} did not reach expected status "${expectedStatus}"`,
  };
}

async function waitForLiveness(
  client: ClawChainClientLike,
  address: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const attempts = 8;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const data = await client.getAgentLiveness(address);
      const count = data.liveness?.heartbeatCount ?? 0;
      if (data.found && count > 0) return { ok: true };
    } catch {
      // keep polling
    }
    await sleep(800);
  }
  return { ok: false, error: "agent liveness did not become healthy after heartbeat tx" };
}

function extractTaskId(tx: TxResult): number | undefined {
  for (const event of tx.events ?? []) {
    if (event.type !== "delegate_task") continue;
    for (const attr of event.attributes ?? []) {
      if (attr.key !== "task_id") continue;
      const parsed = Number.parseInt(attr.value ?? "", 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

async function resolveDelegatedTaskId(
  client: ClawChainClientLike,
  delegator: string,
  assignee: string,
  description: string,
): Promise<number | undefined> {
  try {
    const resp = await client.getTasksByDelegator(delegator);
    const match = (resp.tasks ?? [])
      .filter((t) => t.assigneeAddress === assignee && t.description === description)
      .sort((a, b) => b.taskId - a.taskId)[0];
    return match?.taskId;
  } catch {
    return undefined;
  }
}

async function deriveCompressedPubkey(mnemonic: string): Promise<string> {
  const { Secp256k1, Slip10, Slip10Curve, stringToPath, Bip39, EnglishMnemonic } = await import("@cosmjs/crypto");
  const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(mnemonic));
  const hdPath = stringToPath("m/44'/118'/0'/0/0");
  const { privkey } = Slip10.derivePath(Slip10Curve.Secp256k1, seed, hdPath);
  const { pubkey } = await Secp256k1.makeKeypair(privkey);
  const compressed = Secp256k1.compressPubkey(pubkey);
  return Buffer.from(compressed).toString("hex");
}

function deriveRestUrl(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function trimSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function asError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function fail(stage: AgentFlowStage, error: string, seed: Partial<AgentFlowResult> = {}): AgentFlowResult {
  return {
    ...seed,
    ok: false,
    stage,
    error,
  };
}

function formatTxFailure(op: string, tx: TxResult): string {
  const code = Number(tx.code ?? 1);
  const txhash = tx.transactionHash ?? "";
  const rawLog = tx.rawLog ?? "unknown error";
  return `${op} failed code=${code} txhash=${txhash} raw_log=${rawLog}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
