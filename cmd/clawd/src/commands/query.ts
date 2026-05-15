/**
 * `clawd query` subcommands -- block, tx, account, supply, validators.
 *
 * Standard chain query commands that every Cosmos blockchain ships.
 */

import { loadClawdConfig } from "../lib/config.js";
import { table, formatClaw, shortAddr } from "../lib/format.js";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

function getEndpoints() {
  const cfg = loadClawdConfig();
  const rpcUrl = (cfg.rpcUrl ?? "http://localhost:26657").replace(/\/+$/, "");
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");
  return { cfg, rpcUrl, restUrl };
}

// ---------------------------------------------------------------------------
// clawd query block
// ---------------------------------------------------------------------------

export type QueryBlockOptions = {
  height?: string;
  json?: boolean;
};

export async function runQueryBlock(opts: QueryBlockOptions): Promise<void> {
  const { rpcUrl } = getEndpoints();

  const heightParam = opts.height ? `?height=${encodeURIComponent(opts.height)}` : "";
  const url = `${rpcUrl}/block${heightParam}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query block (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as {
      result?: {
        block_id?: { hash?: string };
        block?: {
          header?: {
            height?: string;
            time?: string;
            proposer_address?: string;
            app_hash?: string;
          };
          data?: {
            txs?: string[];
          };
        };
      };
    };

    const block = data.result?.block;
    const blockId = data.result?.block_id;
    const header = block?.header;
    const txs = block?.data?.txs ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(data.result, null, 2) + "\n");
      return;
    }

    console.log("Block Info\n");
    console.log(`  Height:   ${header?.height ?? "unknown"}`);
    console.log(`  Hash:     ${blockId?.hash ?? "unknown"}`);
    console.log(`  Time:     ${header?.time ?? "unknown"}`);
    console.log(`  Proposer: ${header?.proposer_address ?? "unknown"}`);
    console.log(`  Tx Count: ${txs.length}`);
    console.log(`  App Hash: ${header?.app_hash ?? "unknown"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query block: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd query tx
// ---------------------------------------------------------------------------

export type QueryTxOptions = {
  hash: string;
  json?: boolean;
};

/**
 * Decode a tx message into a human-readable summary line.
 */
function decodeTxMessage(msg: { "@type"?: string; [key: string]: unknown }): string {
  const typeUrl = msg["@type"] ?? "unknown";

  if (typeUrl.endsWith("MsgSend")) {
    const from = (msg.from_address ?? msg.fromAddress ?? "") as string;
    const to = (msg.to_address ?? msg.toAddress ?? "") as string;
    const amounts = msg.amount as Array<{ denom?: string; amount?: string }> | undefined;
    const amountStr = amounts?.map((a) => formatClaw(a.amount ?? "0")).join(", ") ?? "?";
    return `Send ${amountStr} from ${shortAddr(String(from))} to ${shortAddr(String(to))}`;
  }

  if (typeUrl.endsWith("MsgDelegate")) {
    const delegator = (msg.delegator_address ?? msg.delegatorAddress ?? "") as string;
    const validator = (msg.validator_address ?? msg.validatorAddress ?? "") as string;
    const amt = msg.amount as { denom?: string; amount?: string } | undefined;
    return `Delegate ${amt ? formatClaw(amt.amount ?? "0") : "?"} from ${shortAddr(String(delegator))} to ${shortAddr(String(validator))}`;
  }

  if (typeUrl.endsWith("MsgUndelegate")) {
    const delegator = (msg.delegator_address ?? msg.delegatorAddress ?? "") as string;
    const validator = (msg.validator_address ?? msg.validatorAddress ?? "") as string;
    const amt = msg.amount as { denom?: string; amount?: string } | undefined;
    return `Undelegate ${amt ? formatClaw(amt.amount ?? "0") : "?"} from ${shortAddr(String(delegator))} to ${shortAddr(String(validator))}`;
  }

  if (typeUrl.endsWith("MsgVote")) {
    const voter = (msg.voter ?? "") as string;
    const proposalId = (msg.proposal_id ?? msg.proposalId ?? "") as string;
    const option = (msg.option ?? "") as string | number;
    return `Vote by ${shortAddr(String(voter))} on proposal #${proposalId} option=${option}`;
  }

  if (typeUrl.endsWith("MsgShield")) {
    const sender = (msg.sender ?? msg.creator ?? "") as string;
    const amt = (msg.amount ?? "") as string;
    return `Shield ${amt ? formatClaw(amt) : "?"} by ${shortAddr(String(sender))}`;
  }

  // Default: show typeUrl + raw JSON
  const shortType = typeUrl.split(".").pop() ?? typeUrl;
  const { "@type": _type, ...rest } = msg;
  return `${shortType}: ${JSON.stringify(rest)}`;
}

export async function runQueryTx(opts: QueryTxOptions): Promise<void> {
  const { restUrl } = getEndpoints();

  const url = `${restUrl}/cosmos/tx/v1beta1/txs/${encodeURIComponent(opts.hash)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query tx (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as {
      tx_response?: {
        txhash?: string;
        height?: string;
        code?: number;
        gasUsed?: string;
        gasWanted?: string;
        gas_used?: string;
        gas_wanted?: string;
        timestamp?: string;
      };
      tx?: {
        body?: {
          messages?: Array<{ "@type"?: string; [key: string]: unknown }>;
        };
      };
    };

    const txResp = data.tx_response;
    const messages = data.tx?.body?.messages ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + "\n");
      return;
    }

    const code = txResp?.code ?? -1;
    const gasUsed = txResp?.gasUsed ?? txResp?.gas_used ?? "0";
    const gasWanted = txResp?.gasWanted ?? txResp?.gas_wanted ?? "0";

    console.log("Transaction Info\n");
    console.log(`  Hash:      ${txResp?.txhash ?? opts.hash}`);
    console.log(`  Height:    ${txResp?.height ?? "unknown"}`);
    console.log(`  Status:    ${code === 0 ? "Success" : `Failed (code=${code})`}`);
    console.log(`  Gas:       ${gasUsed} / ${gasWanted}`);
    console.log(`  Timestamp: ${txResp?.timestamp ?? "unknown"}`);

    if (messages.length > 0) {
      console.log(`\n  Messages (${messages.length}):`);
      for (let i = 0; i < messages.length; i++) {
        console.log(`    [${i}] ${decodeTxMessage(messages[i])}`);
      }
    }

    console.log();
  } catch (err) {
    console.error(`Failed to query tx: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd query account
// ---------------------------------------------------------------------------

export type QueryAccountOptions = {
  address: string;
  json?: boolean;
};

export async function runQueryAccount(opts: QueryAccountOptions): Promise<void> {
  const { restUrl } = getEndpoints();
  const address = opts.address;

  // Collect all data in parallel
  const [accountRes, balancesRes, delegationsRes, agentRes, reputationRes] = await Promise.allSettled([
    fetch(`${restUrl}/cosmos/auth/v1beta1/accounts/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(`${restUrl}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(`${restUrl}/cosmos/staking/v1beta1/delegations/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(`${restUrl}/clawchain/agent/v1/agent/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(`${restUrl}/clawchain/reputation/v1/reputation/${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(8_000),
    }),
  ]);

  // Parse responses safely
  type AnyJson = Record<string, unknown>;
  async function parseOk(result: PromiseSettledResult<Response>): Promise<AnyJson | null> {
    if (result.status !== "fulfilled" || !result.value.ok) return null;
    try {
      return (await result.value.json()) as AnyJson;
    } catch {
      return null;
    }
  }

  const accountData = await parseOk(accountRes);
  const balancesData = await parseOk(balancesRes);
  const delegationsData = await parseOk(delegationsRes);
  const agentData = await parseOk(agentRes);
  const reputationData = await parseOk(reputationRes);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { account: accountData, balances: balancesData, delegations: delegationsData, agent: agentData, reputation: reputationData },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  // --- Account info ---
  const acct = (accountData?.account ?? {}) as AnyJson;
  const accountNumber = acct.account_number ?? acct.accountNumber ?? "unknown";
  const sequence = acct.sequence ?? "0";

  console.log("Account Info\n");
  console.log(`  Address:        ${address}`);
  console.log(`  Account Number: ${String(accountNumber)}`);
  console.log(`  Sequence:       ${String(sequence)}`);

  // --- Balances ---
  const balances = (balancesData?.balances ?? []) as Array<{ denom?: string; amount?: string }>;
  console.log("\n  Balances:");
  if (balances.length === 0) {
    console.log("    (none)");
  } else {
    for (const b of balances) {
      if (b.denom === "uclaw") {
        console.log(`    ${formatClaw(b.amount ?? "0")} (${b.amount ?? "0"} uclaw)`);
      } else {
        console.log(`    ${b.amount ?? "0"} ${b.denom ?? "unknown"}`);
      }
    }
  }

  // --- Delegations ---
  const delegations = (delegationsData?.delegation_responses ?? []) as Array<{
    delegation?: { validator_address?: string; shares?: string };
    balance?: { amount?: string };
  }>;
  console.log("\n  Delegations:");
  if (delegations.length === 0) {
    console.log("    (none)");
  } else {
    for (const d of delegations) {
      const valAddr = d.delegation?.validator_address ?? "unknown";
      const amount = d.balance?.amount ?? "0";
      console.log(`    ${shortAddr(valAddr)}: ${formatClaw(amount)}`);
    }
  }

  // --- Agent status ---
  const agent = agentData?.agent as AnyJson | undefined;
  console.log("\n  Agent Status:");
  if (agent) {
    const status = (agent.status ?? "unknown") as string;
    const skills = (agent.skills ?? []) as string[];
    console.log(`    Registered: yes`);
    console.log(`    Status:     ${status}`);
    if (skills.length > 0) {
      console.log(`    Skills:     ${skills.join(", ")}`);
    }
  } else {
    console.log("    Registered: no");
  }

  // --- Reputation ---
  const reputation = reputationData?.reputation as AnyJson | undefined;
  console.log("\n  Reputation:");
  if (reputation) {
    const score = (reputation.score ?? reputation.reputation_score ?? "0") as string;
    const tasksDone = (reputation.tasks_completed ?? reputation.tasksCompleted ?? "0") as string;
    console.log(`    Score:           ${score}`);
    console.log(`    Tasks Completed: ${tasksDone}`);
  } else {
    console.log("    (no reputation data)");
  }

  console.log();
}

// ---------------------------------------------------------------------------
// clawd query supply
// ---------------------------------------------------------------------------

export type QuerySupplyOptions = {
  json?: boolean;
};

export async function runQuerySupply(opts: QuerySupplyOptions): Promise<void> {
  const { restUrl } = getEndpoints();

  const [supplyRes, poolRes, inflationRes, communityRes] = await Promise.allSettled([
    fetch(`${restUrl}/cosmos/bank/v1beta1/supply`, { signal: AbortSignal.timeout(8_000) }),
    fetch(`${restUrl}/cosmos/staking/v1beta1/pool`, { signal: AbortSignal.timeout(8_000) }),
    fetch(`${restUrl}/cosmos/mint/v1beta1/inflation`, { signal: AbortSignal.timeout(8_000) }),
    fetch(`${restUrl}/cosmos/distribution/v1beta1/community_pool`, { signal: AbortSignal.timeout(8_000) }),
  ]);

  type AnyJson = Record<string, unknown>;
  async function parseOk(result: PromiseSettledResult<Response>): Promise<AnyJson | null> {
    if (result.status !== "fulfilled" || !result.value.ok) return null;
    try {
      return (await result.value.json()) as AnyJson;
    } catch {
      return null;
    }
  }

  const supplyData = await parseOk(supplyRes);
  const poolData = await parseOk(poolRes);
  const inflationData = await parseOk(inflationRes);
  const communityData = await parseOk(communityRes);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ supply: supplyData, pool: poolData, inflation: inflationData, community_pool: communityData }, null, 2) + "\n",
    );
    return;
  }

  // --- Total Supply ---
  const supplies = (supplyData?.supply ?? []) as Array<{ denom?: string; amount?: string }>;
  const clawSupply = supplies.find((s) => s.denom === "uclaw");

  console.log("Chain Supply\n");
  console.log(`  Total Supply: ${clawSupply ? formatClaw(clawSupply.amount ?? "0") : "(unknown)"}`);
  if (supplies.length > 1) {
    for (const s of supplies) {
      if (s.denom === "uclaw") continue;
      console.log(`                ${s.amount ?? "0"} ${s.denom ?? "unknown"}`);
    }
  }

  // --- Staking Pool ---
  const pool = (poolData?.pool ?? {}) as AnyJson;
  const bondedTokens = (pool.bonded_tokens ?? pool.bondedTokens ?? "0") as string;
  const notBondedTokens = (pool.not_bonded_tokens ?? pool.notBondedTokens ?? "0") as string;
  console.log(`\n  Bonded:       ${formatClaw(bondedTokens)}`);
  console.log(`  Unbonded:     ${formatClaw(notBondedTokens)}`);

  // --- Inflation ---
  const inflation = inflationData?.inflation as string | undefined;
  if (inflation) {
    const inflationPct = (parseFloat(inflation) * 100).toFixed(2);
    console.log(`\n  Inflation:    ${inflationPct}%`);
  } else {
    console.log(`\n  Inflation:    (unknown)`);
  }

  // --- Community Pool ---
  const communityPool = (communityData?.pool ?? []) as Array<{ denom?: string; amount?: string }>;
  const communityClawRaw = communityPool.find((c) => c.denom === "uclaw");
  console.log(
    `  Community:    ${communityClawRaw ? formatClaw(communityClawRaw.amount?.split(".")[0] ?? "0") : "(unknown)"}`,
  );

  console.log();
}

// ---------------------------------------------------------------------------
// clawd query validators
// ---------------------------------------------------------------------------

export type QueryValidatorsOptions = {
  json?: boolean;
};

export async function runQueryValidators(opts: QueryValidatorsOptions): Promise<void> {
  const { restUrl } = getEndpoints();

  const url = `${restUrl}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query validators (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { validators?: Array<Record<string, unknown>> };
    const validators = data.validators ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ validators }, null, 2) + "\n");
      return;
    }

    if (validators.length === 0) {
      console.log("No bonded validators found.");
      return;
    }

    const sorted = validators.sort(
      (a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0),
    );

    const headers = ["#", "Moniker", "Operator", "Tokens", "Commission", "Status"];
    const rows = sorted.map((v, i) => {
      const desc = v.description as { moniker?: string } | undefined;
      const comm = v.commission as {
        commission_rates?: { rate?: string };
      } | undefined;
      return [
        String(i + 1),
        desc?.moniker ?? "unknown",
        shortAddr(String(v.operator_address ?? "")),
        formatClaw(String(v.tokens ?? "0")),
        (Number(comm?.commission_rates?.rate ?? 0) * 100).toFixed(1) + "%",
        v.status === "BOND_STATUS_BONDED" ? "Bonded" : "Unbonded",
      ];
    });

    console.log(`Validators (${validators.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query validators: ${String(err)}`);
    process.exit(1);
  }
}
