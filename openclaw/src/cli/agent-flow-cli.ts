import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command } from "commander";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

type AgentFlowStage = "validate" | "connect" | "register" | "heartbeat" | "delegate" | "accept" | "complete" | "verify";

type AgentFlowResult = {
  ok: boolean;
  stage?: AgentFlowStage;
  error?: string;
  rpcUrl?: string;
  restUrl?: string;
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

type AgentFlowOptions = {
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
  rpcUrl?: string;
  prefix?: string;
  gasPrice?: string;
  mnemonic?: string;
  mnemonicFile?: string;
  pubkey?: string;
  delegateClawd?: boolean;
  json?: boolean;
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
};

type ClawChainClientConstructor = new (options: {
  rpcUrl?: string;
  mnemonic?: string;
  prefix?: string;
  gasPrice?: string;
}) => ClawChainClientLike;

export function registerAgentFlowCli(program: Command) {
  program
    .command("agent-flow")
    .description("Run core on-chain agent lifecycle (direct SDK path; optional clawd fallback)")
    .requiredOption("--assignee <address>", "task assignee bech32 address")
    .requiredOption("--description <text>", "task description")
    .option("--requirements <text>", "task requirements")
    .option("--skill-id <id>", "task skill ID (default: 0)", parseInt)
    .option("--budget <amount>", "task budget (e.g. 1000uclaw)")
    .option("--deadline-blocks <n>", "task deadline block delta (default: 0)", parseInt)
    .option("--endpoint <url>", "heartbeat/registration endpoint override")
    .option("--metadata <text>", "heartbeat metadata override")
    .option("--name <name>", "registration name override")
    .option("--rpc-url <url>", "chain RPC URL (default: clawd config or http://localhost:26657)")
    .option("--prefix <prefix>", "bech32 address prefix")
    .option("--gas-price <price>", "gas price, e.g. 0.025uclaw")
    .option("--mnemonic <words>", "mnemonic override (unsafe for shell history)")
    .option("--mnemonic-file <path>", "mnemonic file path (default: ~/.clawd/mnemonic.txt)")
    .option("--pubkey <value>", "agent pubkey override for registration")
    .option("--auto-accept", "auto-accept delegated task (requires signer == assignee)")
    .option("--auto-complete", "auto-complete delegated task (requires signer == assignee)")
    .option("--completion-result <text>", "result payload for --auto-complete")
    .option("--delegate-clawd", "force legacy delegation to clawd agent-flow")
    .option("--json", "output machine-readable lifecycle result")
    .addHelpText(
      "after",
      () =>
        `${theme.muted("Example:")} \`openclaw agent-flow --assignee claw1... --description "Summarize blocks" --json\`\n` +
        `${theme.muted("Docs:")} ${formatDocsLink("/cli/gateway", "docs.openclaw.ai/cli/gateway")}\n`,
    )
    .action(async (opts: AgentFlowOptions) => {
      const out = await runAgentFlow(opts);
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
      } else if (!out.ok) {
        console.error(`agent-flow failed${out.stage ? ` [${out.stage}]` : ""}: ${out.error ?? "unknown error"}`);
      } else {
        console.log("openclaw agent-flow\n");
        console.log(`  RPC URL:      ${out.rpcUrl ?? ""}`);
        console.log(`  REST URL:     ${out.restUrl ?? ""}`);
        console.log(`  From addr:    ${out.fromAddress ?? ""}`);
        console.log(`  Assignee:     ${out.assignee ?? ""}`);
        console.log("");
        console.log(`  Registration: ${out.alreadyRegistered ? "already registered" : "newly registered"}`);
        if (out.registerTxHash) {console.log(`  registerTxHash:  ${out.registerTxHash}`);}
        if (out.heartbeatTxHash) {console.log(`  heartbeatTxHash: ${out.heartbeatTxHash}`);}
        if (out.delegateTxHash) {console.log(`  delegateTxHash:  ${out.delegateTxHash}`);}
        if (out.acceptTxHash) {console.log(`  acceptTxHash:    ${out.acceptTxHash}`);}
        if (out.completeTxHash) {console.log(`  completeTxHash:  ${out.completeTxHash}`);}
        if (out.taskId != null) {console.log(`  taskId:          ${out.taskId}`);}
        if (out.verifiedTaskStatus) {console.log(`  verifiedStatus:  ${out.verifiedTaskStatus}`);}
      }

      if (!out.ok) {process.exitCode = 1;}
    });
}

async function runAgentFlow(options: AgentFlowOptions): Promise<AgentFlowResult> {
  if (options.delegateClawd || isTruthy(process.env.OPENCLAW_AGENT_FLOW_DELEGATE)) {
    const args = extractDelegatedArgs(process.argv);
    const code = await runDelegatedAgentFlow(args);
    return code === 0
      ? { ok: true }
      : { ok: false, stage: "validate", error: `delegated clawd flow exited with code ${code}` };
  }

  if (!options.assignee) {return fail("validate", "assignee is required");}
  if (!options.description) {return fail("validate", "description is required");}
  if (options.autoComplete && !options.completionResult) {
    return fail("validate", "--completion-result is required when --auto-complete is set");
  }

  const clawdCfg = loadClawdConfigMaybe();
  const rpcUrl = options.rpcUrl ?? clawdCfg.rpcUrl ?? process.env.CLAWCHAIN_RPC_URL ?? "http://localhost:26657";
  const restUrl = deriveRestUrl(rpcUrl);
  const endpoint = options.endpoint ?? clawdCfg.messagingEndpoint ?? "";
  const metadata = options.metadata ?? "";
  const name = options.name ?? clawdCfg.moniker ?? "openclaw-agent";

  const base: AgentFlowResult = {
    ok: false,
    rpcUrl,
    restUrl,
    assignee: options.assignee,
  };

  const mnemonicPath = options.mnemonicFile ?? join(homedir(), ".clawd", "mnemonic.txt");
  const mnemonic = options.mnemonic?.trim() || process.env.CLAWCHAIN_MNEMONIC?.trim() || readFileMaybe(mnemonicPath);
  if (!mnemonic) {
    return fail("validate", `mnemonic is required (set --mnemonic, CLAWCHAIN_MNEMONIC, or ${mnemonicPath})`, base);
  }

  const sdk = await loadSdkModule();
  if (!sdk) {
    return fail("connect", "Unable to load ClawChain SDK. Build sdk package or set CLAWCHAIN_SDK_ENTRY.", base);
  }

  const Client = sdk.ClawChainClient;
  const client = new Client({
    rpcUrl,
    mnemonic,
    prefix: options.prefix ?? process.env.CLAWCHAIN_PREFIX,
    gasPrice: options.gasPrice ?? process.env.CLAWCHAIN_GAS_PRICE,
  });

  try {
    await client.connect();
  } catch (err: unknown) {
    return fail("connect", asError(err), base);
  }

  try {
    const fromAddress = client.getAddress();
    base.fromAddress = fromAddress;

    const alreadyRegistered = await isRegistered(client, fromAddress);
    base.alreadyRegistered = alreadyRegistered;

    if (!alreadyRegistered) {
      const registerTx = await runTxWithRetry("register", () =>
        client.registerAgent({
          pubkey: options.pubkey ?? fromAddress,
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

    const heartbeatTx = await runTxWithRetry("heartbeat", () =>
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

    const delegateTx = await runTxWithRetry("delegate", () =>
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
      base.taskId = await resolveDelegatedTaskId(client, fromAddress, options.assignee, options.description);
    }

    const wantsAccept = options.autoAccept === true;
    const wantsComplete = options.autoComplete === true;

    if ((wantsAccept || wantsComplete) && options.assignee !== fromAddress) {
      return fail(
        wantsAccept ? "accept" : "complete",
        `autoAccept/autoComplete requires assignee (${options.assignee}) to equal signer address (${fromAddress})`,
        base,
      );
    }

    if ((wantsAccept || wantsComplete) && base.taskId == null) {
      return fail(
        wantsAccept ? "accept" : "complete",
        "task delegated but task_id was not found; cannot auto-accept/complete",
        base,
      );
    }

    if (wantsAccept) {
      const acceptTx = await runTxWithRetry("accept", () => client.acceptTask({ taskId: base.taskId! }));
      if (!isTxSuccess(acceptTx)) {
        return fail("accept", formatTxFailure("accept-task", acceptTx), {
          ...base,
          acceptTxHash: acceptTx.transactionHash,
        });
      }
      base.acceptTxHash = acceptTx.transactionHash;
    }

    if (wantsComplete) {
      const completeTx = await runTxWithRetry("complete", () =>
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

function isTxSuccess(tx: TxResult): boolean {
  return Number(tx.code ?? 1) === 0;
}

function shouldRetryTxFailure(errText: string): boolean {
  const text = errText.toLowerCase();
  return (
    text.includes("connection refused") ||
    text.includes("connection reset") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("eof") ||
    text.includes("unavailable") ||
    text.includes("i/o timeout")
  );
}

async function runTxWithRetry(op: string, fn: () => Promise<TxResult>): Promise<TxResult> {
  const attempts = 3;
  let last: TxResult | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const tx = await fn();
      if (isTxSuccess(tx)) {return tx;}
      last = tx;
      const retryable = shouldRetryTxFailure(tx.rawLog ?? "");
      if (!retryable || attempt === attempts) {return tx;}
    } catch (err: unknown) {
      const msg = asError(err);
      last = {
        transactionHash: "",
        code: 1,
        rawLog: `${op} execution error: ${msg}`,
        events: [],
      };
      if (!shouldRetryTxFailure(msg) || attempt === attempts) {
        return last;
      }
    }
    await sleep(1200 * attempt);
  }

  return (
    last ?? {
      transactionHash: "",
      code: 1,
      rawLog: `${op} failed: no attempts`,
      events: [],
    }
  );
}

function extractTaskId(tx: TxResult): number | undefined {
  for (const event of tx.events ?? []) {
    if (event.type !== "delegate_task") {continue;}
    for (const attr of event.attributes ?? []) {
      if (attr.key !== "task_id") {continue;}
      const parsed = Number.parseInt(attr.value ?? "", 10);
      if (Number.isFinite(parsed)) {return parsed;}
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
      .toSorted((a, b) => b.taskId - a.taskId)[0];
    return match?.taskId;
  } catch {
    return undefined;
  }
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
  return { ok: false, error: `task ${taskId} did not reach expected status "${expectedStatus}"` };
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
  const statusUrl = `${trimSlash(rpcUrl)}/status`;
  const res = await fetch(statusUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`status endpoint failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    result?: { sync_info?: { latest_block_height?: string } };
  };
  const rawHeight = data.result?.sync_info?.latest_block_height ?? "0";
  const height = Number.parseInt(rawHeight, 10);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("failed to parse latest_block_height");
  }
  return height;
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
    if (pkg?.ClawChainClient) {return pkg;}
  } catch {
    // continue to local fallback
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..", "..", "..");
  const candidates = [
    join(root, "sdk", "dist", "index.js"),
    join(root, "sdk", "src", "index.ts"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {continue;}
    try {
      return (await import(pathToFileURL(candidate).href)) as { ClawChainClient: ClawChainClientConstructor };
    } catch {
      // try next
    }
  }

  return null;
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

function loadClawdConfigMaybe(): { rpcUrl?: string; messagingEndpoint?: string; moniker?: string } {
  try {
    const path = join(homedir(), ".clawd", "clawd.json");
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as { rpcUrl?: string; messagingEndpoint?: string; moniker?: string };
    return data ?? {};
  } catch {
    return {};
  }
}

function readFileMaybe(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function formatTxFailure(op: string, tx: TxResult): string {
  const code = Number(tx.code ?? 1);
  const txhash = tx.transactionHash ?? "";
  const rawLog = tx.rawLog ?? "unknown error";
  return `${op} failed code=${code} txhash=${txhash} raw_log=${rawLog}`;
}

function fail(stage: AgentFlowStage, error: string, seed: Partial<AgentFlowResult> = {}): AgentFlowResult {
  return {
    ...seed,
    ok: false,
    stage,
    error,
  };
}

function asError(err: unknown): string {
  if (err instanceof Error) {return err.message;}
  return String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {return false;}
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function extractDelegatedArgs(argv: string[]): string[] {
  const index = argv.findIndex((part) => part === "agent-flow");
  if (index < 0) {return [];}
  return argv.slice(index + 1);
}

async function runDelegatedAgentFlow(args: string[]): Promise<number> {
  const explicitBin = process.env.CLAWD_BIN?.trim();
  if (explicitBin) {
    return spawnDelegated(explicitBin, ["agent-flow", ...args]);
  }

  const localClawdTs = resolveLocalClawdSrcMain();
  if (localClawdTs) {
    return spawnDelegated(process.execPath, ["--import", "tsx", localClawdTs, "agent-flow", ...args]);
  }

  const localClawdJs = resolveLocalClawdDistMain();
  if (localClawdJs) {
    return spawnDelegated(process.execPath, [localClawdJs, "agent-flow", ...args]);
  }

  return spawnDelegated("clawd", ["agent-flow", ...args]);
}

function resolveLocalClawdDistMain(): string | null {
  const dir = resolveLocalClawdDir();
  if (!dir) {return null;}
  const candidate = join(dir, "dist", "main.js");
  if (existsSync(candidate)) {return candidate;}
  return null;
}

function resolveLocalClawdDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = join(here, "..", "..", "..", "cmd", "clawd");
  if (existsSync(join(candidate, "package.json"))) {return candidate;}
  return null;
}

function resolveLocalClawdSrcMain(): string | null {
  const dir = resolveLocalClawdDir();
  if (!dir) {return null;}
  const candidate = join(dir, "src", "main.ts");
  const commanderDep = join(dir, "node_modules", "commander");
  if (existsSync(candidate) && existsSync(commanderDep)) {return candidate;}
  return null;
}

function spawnDelegated(bin: string, args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: "inherit",
      env: process.env,
      cwd,
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(
          `openclaw agent-flow: failed to start delegated runtime (${bin} not found). ` +
            "Build/install clawd first or set CLAWD_BIN.",
        );
      } else {
        console.error(`openclaw agent-flow: failed to start delegated runtime: ${String(err)}`);
      }
      resolve(1);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code ?? 0);
    });
  });
}
