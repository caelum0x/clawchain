/**
 * `clawd product-flow` — strict end-to-end product lifecycle:
 * register -> heartbeat -> delegate -> message -> purchase -> escrow -> rate -> endorse.
 */

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";

export type ProductFlowOptions = {
  assignee: string;
  taskDescription: string;
  messageCiphertext: string;
  skillId: number;
  messageRecipient?: string;
  messageNonce?: string;
  escrowDescription?: string;
  deadlineBlocks?: number;
  milestones?: number;
  ratingScore?: number;
  ratingComment?: string;
  endorsementReason?: string;
  endpoint?: string;
  metadata?: string;
  name?: string;
  json?: boolean;
};

type ProductFlowStage =
  | "validate"
  | "connect"
  | "register"
  | "heartbeat"
  | "delegate"
  | "message"
  | "purchase"
  | "escrow"
  | "rate"
  | "endorse"
  | "verify";

export type ProductFlowResult = {
  ok: boolean;
  stage?: ProductFlowStage;
  error?: string;
  chainId?: string;
  rpcUrl?: string;
  restUrl?: string;
  fromKey?: string;
  fromAddress?: string;
  assignee?: string;
  seller?: string;
  alreadyRegistered?: boolean;
  registerTxHash?: string;
  heartbeatTxHash?: string;
  delegateTxHash?: string;
  messageTxHash?: string;
  purchaseTxHash?: string;
  escrowTxHash?: string;
  rateTxHash?: string;
  endorseTxHash?: string;
  taskId?: number;
  escrowId?: number;
};

type TxResult = {
  transactionHash: string;
  code: number;
  rawLog: string;
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
};

type AgentInfoResponse = { registered?: boolean };
type TaskInfoResponse = { found: boolean; taskId: number; status: string; assigneeAddress: string; description: string };
type SkillInfoResponse = { id: number; owner: string; active: boolean; name: string };
type EscrowInfoResponse = { found: boolean };
type MessageResponse = { messageId: number };

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
  agentHeartbeat(params: { nodeHeight: number; endpoint?: string; metadata?: string }): Promise<TxResult>;
  delegateTask(params: { assignee: string; description: string }): Promise<TxResult>;
  sendOnChainMessage(params: { recipient: string; ciphertext: string; nonce: string }): Promise<TxResult>;
  getSkill(skillId: number): Promise<SkillInfoResponse>;
  purchaseSkill(params: { skillId: number }): Promise<TxResult>;
  createEscrow(params: { skillId: number; description: string; deadlineBlocks: number; milestones?: number }): Promise<TxResult>;
  getEscrow(escrowId: number): Promise<EscrowInfoResponse>;
  rateAgent(params: { agentAddress: string; skillId: number; score: number; comment?: string }): Promise<TxResult>;
  endorseAgent(params: { agentAddress: string; reason: string }): Promise<TxResult>;
  getTask(taskId: number): Promise<TaskInfoResponse>;
};

type ClawChainClientConstructor = new (options: {
  rpcUrl?: string;
  mnemonic?: string;
  prefix?: string;
  gasPrice?: string;
}) => ClawChainClientLike;

export async function runProductFlow(options: ProductFlowOptions): Promise<void> {
  const out = await executeProductFlow(options);
  if (options.json) {
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    if (!out.ok) process.exitCode = 1;
    return;
  }

  if (!out.ok) {
    console.error(`product-flow failed${out.stage ? ` [${out.stage}]` : ""}: ${out.error ?? "unknown error"}`);
    process.exit(1);
  }

  console.log("clawd product-flow\n");
  console.log(`  Chain ID:    ${out.chainId}`);
  console.log(`  RPC URL:     ${out.rpcUrl}`);
  console.log(`  REST URL:    ${out.restUrl}`);
  console.log(`  From key:    ${out.fromKey}`);
  console.log(`  From addr:   ${out.fromAddress}`);
  console.log(`  Assignee:    ${out.assignee}`);
  console.log(`  Seller:      ${out.seller}`);
  console.log("");
  console.log(`  Registration: ${out.alreadyRegistered ? "already registered" : "newly registered"}`);
  if (out.registerTxHash) console.log(`  registerTxHash:  ${out.registerTxHash}`);
  if (out.heartbeatTxHash) console.log(`  heartbeatTxHash: ${out.heartbeatTxHash}`);
  if (out.delegateTxHash) console.log(`  delegateTxHash:  ${out.delegateTxHash}`);
  if (out.messageTxHash) console.log(`  messageTxHash:   ${out.messageTxHash}`);
  if (out.purchaseTxHash) console.log(`  purchaseTxHash:  ${out.purchaseTxHash}`);
  if (out.escrowTxHash) console.log(`  escrowTxHash:    ${out.escrowTxHash}`);
  if (out.rateTxHash) console.log(`  rateTxHash:      ${out.rateTxHash}`);
  if (out.endorseTxHash) console.log(`  endorseTxHash:   ${out.endorseTxHash}`);
  if (out.taskId != null) console.log(`  taskId:          ${out.taskId}`);
  if (out.escrowId != null) console.log(`  escrowId:        ${out.escrowId}`);
}

async function executeProductFlow(options: ProductFlowOptions): Promise<ProductFlowResult> {
  if (!options.assignee) return fail("validate", "assignee is required");
  if (!options.taskDescription) return fail("validate", "task-description is required");
  if (!options.messageCiphertext) return fail("validate", "message-ciphertext is required");
  if (options.skillId == null || options.skillId < 0) return fail("validate", "skill-id must be non-negative");

  const cfg = loadClawdConfig();
  const chainId = cfg.chainId;
  const rpcUrl = normalizeLocalhostUrl(cfg.rpcUrl ?? "http://127.0.0.1:26657");
  const restUrl = normalizeLocalhostUrl(cfg.restUrl ?? deriveRestUrl(rpcUrl));
  const keyName = "agent";
  const endpoint = options.endpoint ?? cfg.messagingEndpoint ?? "";
  const metadata = options.metadata ?? "";
  const name = options.name ?? cfg.moniker ?? "clawd-agent";

  const base: ProductFlowResult = {
    ok: false,
    chainId,
    rpcUrl,
    restUrl,
    fromKey: keyName,
    assignee: options.assignee,
  };

  if (!mnemonicFileExists()) return fail("validate", 'No mnemonic found. Run "clawd init" first.', base);
  const mnemonic = loadMnemonic();
  if (!mnemonic) return fail("validate", "Failed to load mnemonic.", base);

  const sdk = await loadSdkModule();
  if (!sdk) {
    return fail("connect", "Unable to load ClawChain SDK. Build sdk package or set CLAWCHAIN_SDK_ENTRY.", base);
  }

  const Client = sdk.ClawChainClient;
  const client = new Client({
    rpcUrl,
    mnemonic,
    prefix: process.env.CLAWCHAIN_PREFIX ?? cfg.prefix ?? "claw",
    gasPrice: process.env.CLAWCHAIN_GAS_PRICE ?? cfg.gasPrice,
  });

  try {
    await client.connect();
  } catch (err: unknown) {
    const message = asError(err);
    if (message.includes("fetch failed")) {
      return fail(
        "connect",
        `${message} (hint: check RPC at ${rpcUrl}; if using localhost, prefer 127.0.0.1 and ensure node is running)`,
        base,
      );
    }
    return fail("connect", message, base);
  }

  let stage: ProductFlowStage = "connect";
  try {
    const address = client.getAddress();
    base.fromAddress = address;

    stage = "validate";
    const skill = await client.getSkill(options.skillId);
    if (!skill?.owner) return fail("validate", `skill ${options.skillId} not found`, base);
    base.seller = skill.owner;

    const alreadyRegistered = await isRegistered(client, address);
    base.alreadyRegistered = alreadyRegistered;
    if (!alreadyRegistered) {
      const pubkey = await deriveCompressedPubkey(mnemonic);
      stage = "register";
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

    stage = "heartbeat";
    const nodeHeight = await fetchNodeHeight(rpcUrl);
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

    stage = "delegate";
    const delegateTx = await runTxWithRetry("delegate-task", () =>
      client.delegateTask({
        assignee: options.assignee,
        description: options.taskDescription,
      }),
    );
    if (!isTxSuccess(delegateTx)) {
      return fail("delegate", formatTxFailure("delegate-task", delegateTx), {
        ...base,
        delegateTxHash: delegateTx.transactionHash,
      });
    }
    base.delegateTxHash = delegateTx.transactionHash;
    base.taskId = extractNumericAttr(delegateTx, ["task_id", "taskId"]);

    stage = "message";
    const messageTx = await runTxWithRetry("send-message", () =>
      client.sendOnChainMessage({
        recipient: options.messageRecipient ?? options.assignee,
        ciphertext: options.messageCiphertext,
        nonce: options.messageNonce ?? `nonce-${Date.now()}`,
      }),
    );
    if (!isTxSuccess(messageTx)) {
      return fail("message", formatTxFailure("send-message", messageTx), {
        ...base,
        messageTxHash: messageTx.transactionHash,
      });
    }
    base.messageTxHash = messageTx.transactionHash;

    stage = "purchase";
    const purchaseTx = await runTxWithRetry("purchase-skill", () =>
      client.purchaseSkill({ skillId: options.skillId }),
    );
    if (!isTxSuccess(purchaseTx)) {
      return fail("purchase", formatTxFailure("purchase-skill", purchaseTx), {
        ...base,
        purchaseTxHash: purchaseTx.transactionHash,
      });
    }
    base.purchaseTxHash = purchaseTx.transactionHash;

    stage = "escrow";
    const escrowTx = await runTxWithRetry("create-escrow", () =>
      client.createEscrow({
        skillId: options.skillId,
        description: options.escrowDescription ?? options.taskDescription,
        deadlineBlocks: options.deadlineBlocks ?? 100,
        milestones: options.milestones ?? 1,
      }),
    );
    if (!isTxSuccess(escrowTx)) {
      return fail("escrow", formatTxFailure("create-escrow", escrowTx), {
        ...base,
        escrowTxHash: escrowTx.transactionHash,
      });
    }
    base.escrowTxHash = escrowTx.transactionHash;
    base.escrowId = extractNumericAttr(escrowTx, ["escrow_id", "escrowId"]);

    stage = "rate";
    const rateTx = await runTxWithRetry("rate-agent", () =>
      client.rateAgent({
        agentAddress: skill.owner,
        skillId: options.skillId,
        score: options.ratingScore ?? 5,
        comment: options.ratingComment ?? "completed product flow",
      }),
    );
    if (!isTxSuccess(rateTx)) {
      return fail("rate", formatTxFailure("rate-agent", rateTx), {
        ...base,
        rateTxHash: rateTx.transactionHash,
      });
    }
    base.rateTxHash = rateTx.transactionHash;

    stage = "endorse";
    const endorseTx = await runTxWithRetry("endorse-agent", () =>
      client.endorseAgent({
        agentAddress: skill.owner,
        reason: options.endorsementReason ?? "successful delivery in product flow",
      }),
    );
    if (!isTxSuccess(endorseTx)) {
      return fail("endorse", formatTxFailure("endorse-agent", endorseTx), {
        ...base,
        endorseTxHash: endorseTx.transactionHash,
      });
    }
    base.endorseTxHash = endorseTx.transactionHash;

    stage = "verify";
    if (base.taskId != null) {
      const taskOk = await waitForTaskFound(client, base.taskId);
      if (!taskOk) return fail("verify", `task ${base.taskId} not queryable after delegation`, base);
    }
    if (base.escrowId != null) {
      const escrowOk = await waitForEscrowFound(client, base.escrowId);
      if (!escrowOk) return fail("verify", `escrow ${base.escrowId} not queryable after creation`, base);
    }

    return { ...base, ok: true };
  } catch (err: unknown) {
    return fail(stage, asError(err), base);
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
    // fallback to local
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..", "..", "..", "..");
  const candidates = [join(root, "sdk", "dist", "index.js"), join(root, "sdk", "src", "index.ts")];

  for (const candidate of candidates) {
    try {
      const mod = (await import(pathToFileURL(candidate).href)) as { ClawChainClient: ClawChainClientConstructor };
      if (mod?.ClawChainClient) return mod;
    } catch {
      // keep trying
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
    lower.includes("i/o timeout") ||
    lower.includes("must wait") ||
    lower.includes("too frequently")
  );
}

async function runTxWithRetry(opName: string, fn: () => Promise<TxResult>): Promise<TxResult> {
  const maxAttempts = 6;
  let last: TxResult = { transactionHash: "", code: 1, rawLog: `${opName} failed: no attempts`, events: [] };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const tx = await fn();
      if (isTxSuccess(tx)) return tx;
      last = tx;
      const retryText = tx.rawLog ?? "";
      if (!shouldRetryText(retryText) || attempt === maxAttempts) return tx;
      await sleep(nextRetryDelayMs(retryText, attempt));
      continue;
    } catch (err: unknown) {
      const message = asError(err);
      last = { transactionHash: "", code: 1, rawLog: `${opName} execution error: ${message}`, events: [] };
      if (!shouldRetryText(message) || attempt === maxAttempts) return last;
      await sleep(nextRetryDelayMs(message, attempt));
      continue;
    }
  }

  return last;
}

function nextRetryDelayMs(text: string, attempt: number): number {
  const mustWaitMatch = text.match(/must wait\s+(\d+)\s+more blocks/i);
  if (mustWaitMatch) {
    const blocks = Number.parseInt(mustWaitMatch[1] ?? "0", 10);
    if (Number.isFinite(blocks) && blocks > 0) {
      // Local chain block cadence is ~5s; add a small buffer.
      return blocks * 5500;
    }
  }
  return 1200 * attempt;
}

async function isRegistered(client: ClawChainClientLike, address: string): Promise<boolean> {
  try {
    const out = (await client.getAgent(address)) as Record<string, unknown> | null | undefined;
    if (!out || typeof out !== "object") return false;
    if ("registered" in out) return Boolean(out.registered);
    // Some query surfaces return the agent record directly without a `registered` wrapper.
    return Boolean(out.address || out.name || out.pubkey || out.endpoint);
  } catch {
    return false;
  }
}

async function fetchNodeHeight(rpcUrl: string): Promise<number> {
  const statusA = await fetchNodeStatus(rpcUrl);
  if (statusA.catchingUp) {
    throw new Error(`node is still catching up at height ${statusA.height}; wait for full sync before running product flow`);
  }

  // Avoid running the lifecycle against a halted chain where txs won't commit.
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
  const data = (await res.json()) as { result?: { sync_info?: { latest_block_height?: string; catching_up?: boolean } } };
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

async function waitForTaskFound(client: ClawChainClientLike, taskId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const task = await client.getTask(taskId);
      if (task.found) return true;
    } catch {
      // keep polling
    }
    await sleep(800);
  }
  return false;
}

async function waitForEscrowFound(client: ClawChainClientLike, escrowId: number): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const escrow = await client.getEscrow(escrowId);
      if (escrow.found) return true;
    } catch {
      // keep polling
    }
    await sleep(800);
  }
  return false;
}

function extractNumericAttr(tx: TxResult, keys: string[]): number | undefined {
  const keySet = new Set(keys);
  for (const event of tx.events ?? []) {
    for (const attr of event.attributes ?? []) {
      if (!keySet.has(attr.key)) continue;
      const parsed = Number.parseInt(attr.value ?? "", 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
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

function normalizeLocalhostUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    return url;
  }
  return url;
}

function trimSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function asError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function fail(stage: ProductFlowStage, error: string, seed: Partial<ProductFlowResult> = {}): ProductFlowResult {
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
