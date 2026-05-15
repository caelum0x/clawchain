/**
 * `clawd genesis` subcommands — genesis ceremony tooling for ClawChain.
 *
 * Inspect, audit, hash, and diff genesis files to support coordinated
 * network launches and upgrade ceremonies.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadClawdConfig } from "../lib/config.js";
import { table, formatClaw } from "../lib/format.js";
import { CLAWCHAIN_HOME } from "../lib/paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

type GenesisDoc = {
  chain_id: string;
  genesis_time: string;
  initial_height: string;
  app_state: Record<string, any>;
  consensus_params?: Record<string, any>;
  consensus?: Record<string, any>;
  validators?: any[];
};

type AccountEntry = {
  address: string;
  balance: string;
  type: "base" | "module" | "vesting";
};

type ValidatorEntry = {
  moniker: string;
  operatorAddress: string;
  consensusPubkey: string;
  selfDelegation: string;
  signaturePresent: boolean;
};

type ParamEntry = {
  module: string;
  param: string;
  value: string;
};

type DiffChange = {
  field: string;
  old: string;
  new: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveGenesisPath(fileOpt?: string): string {
  if (fileOpt) return fileOpt;
  const cfg = loadClawdConfig();
  const nodeHome = cfg.nodeHome || CLAWCHAIN_HOME;
  return join(nodeHome, "config", "genesis.json");
}

function loadGenesis(filePath: string): GenesisDoc {
  if (!existsSync(filePath)) {
    throw new Error(`Genesis file not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as GenesisDoc;
}

function safeStr(v: unknown): string {
  if (v === undefined || v === null) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function countAccounts(appState: Record<string, any>): number {
  const authAccounts =
    appState?.auth?.accounts ?? appState?.auth?.genesis_accounts ?? [];
  return Array.isArray(authAccounts) ? authAccounts.length : 0;
}

function countValidators(appState: Record<string, any>): number {
  const gentxs =
    appState?.genutil?.gen_txs ?? appState?.gentx?.gen_txs ?? [];
  return Array.isArray(gentxs) ? gentxs.length : 0;
}

function countAgents(appState: Record<string, any>): number {
  const agents = appState?.agent?.agents ?? appState?.agent?.agent_list ?? [];
  return Array.isArray(agents) ? agents.length : 0;
}

function countSkills(appState: Record<string, any>): number {
  const skills =
    appState?.marketplace?.skills ??
    appState?.marketplace?.skill_list ??
    [];
  return Array.isArray(skills) ? skills.length : 0;
}

function getTotalSupply(appState: Record<string, any>): string {
  const supply: Array<{ denom?: string; amount?: string }> =
    appState?.bank?.supply ?? [];
  if (!Array.isArray(supply) || supply.length === 0) return "-";
  const uclaw = supply.find((s) => s.denom === "uclaw");
  if (uclaw?.amount) return formatClaw(uclaw.amount);
  // Fallback: sum all
  const total = supply.reduce((acc, s) => acc + BigInt(s.amount ?? "0"), 0n);
  return formatClaw(total.toString());
}

function getStakingPool(appState: Record<string, any>): string {
  const pool = appState?.staking?.last_total_power;
  if (pool) return pool;
  const bondedTokens =
    appState?.staking?.pool?.bonded_tokens ??
    appState?.staking?.params?.bond_denom;
  return bondedTokens ? String(bondedTokens) : "-";
}

function getCommunityPool(appState: Record<string, any>): string {
  const pool =
    appState?.distribution?.fee_pool?.community_pool ??
    appState?.distribution?.params?.community_tax;
  if (Array.isArray(pool) && pool.length > 0) {
    const uclaw = pool.find((p: any) => p.denom === "uclaw");
    if (uclaw?.amount) return formatClaw(String(BigInt(Math.floor(Number(uclaw.amount)))));
    return safeStr(pool[0]?.amount);
  }
  return safeStr(pool);
}

function getPrivacyTreeState(appState: Record<string, any>): {
  root: string;
  size: string;
} {
  const privacy = appState?.privacy ?? {};
  const root = privacy?.merkle_root ?? privacy?.tree_root ?? "-";
  const size =
    privacy?.commitment_count ??
    privacy?.tree_size ??
    privacy?.commitments?.length ??
    "-";
  return { root: safeStr(root), size: safeStr(size) };
}

// ---------------------------------------------------------------------------
// 1. clawd genesis inspect
// ---------------------------------------------------------------------------

export type GenesisInspectOptions = {
  file?: string;
  json?: boolean;
};

export async function runGenesisInspect(opts: GenesisInspectOptions): Promise<void> {
  const filePath = resolveGenesisPath(opts.file);
  const genesis = loadGenesis(filePath);
  const appState = genesis.app_state ?? {};

  const accounts = countAccounts(appState);
  const validators = countValidators(appState);
  const agents = countAgents(appState);
  const skills = countSkills(appState);
  const totalSupply = getTotalSupply(appState);
  const stakingPool = getStakingPool(appState);
  const communityPool = getCommunityPool(appState);
  const privacyTree = getPrivacyTreeState(appState);

  // Module parameters summary
  const moduleParams = extractAllModuleParams(appState);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          file: filePath,
          chain_id: genesis.chain_id,
          genesis_time: genesis.genesis_time,
          initial_height: genesis.initial_height,
          counts: { accounts, validators, agents, skills },
          supply: {
            total: totalSupply,
            staking_pool: stakingPool,
            community_pool: communityPool,
          },
          privacy_tree: privacyTree,
          module_params: moduleParams,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Genesis Inspection\n");
  console.log(`  File:             ${filePath}`);
  console.log(`  Chain ID:         ${genesis.chain_id}`);
  console.log(`  Genesis Time:     ${genesis.genesis_time}`);
  console.log(`  Initial Height:   ${genesis.initial_height}`);
  console.log();
  console.log("  Counts:");
  console.log(`    Accounts:       ${accounts}`);
  console.log(`    Validators:     ${validators}`);
  console.log(`    Agents:         ${agents}`);
  console.log(`    Skills:         ${skills}`);
  console.log();
  console.log("  Supply:");
  console.log(`    Total:          ${totalSupply}`);
  console.log(`    Staking Pool:   ${stakingPool}`);
  console.log(`    Community Pool: ${communityPool}`);
  console.log();
  console.log("  Privacy Tree:");
  console.log(`    Root:           ${privacyTree.root}`);
  console.log(`    Size:           ${privacyTree.size}`);
  console.log();

  if (moduleParams.length > 0) {
    console.log("  Module Parameters:");
    const headers = ["Module", "Parameter", "Value"];
    const rows = moduleParams.map((p) => [p.module, p.param, p.value]);
    console.log(table(headers, rows));
  }

  console.log();
}

// ---------------------------------------------------------------------------
// 2. clawd genesis accounts
// ---------------------------------------------------------------------------

export type GenesisAccountsOptions = {
  file?: string;
  top?: number;
  json?: boolean;
};

export async function runGenesisAccounts(opts: GenesisAccountsOptions): Promise<void> {
  const filePath = resolveGenesisPath(opts.file);
  const genesis = loadGenesis(filePath);
  const appState = genesis.app_state ?? {};

  const accounts = parseGenesisAccounts(appState);

  // Sort by balance descending
  accounts.sort((a, b) => {
    const ba = BigInt(a.balance.replace(/[^0-9]/g, "") || "0");
    const bb = BigInt(b.balance.replace(/[^0-9]/g, "") || "0");
    if (bb > ba) return 1;
    if (bb < ba) return -1;
    return 0;
  });

  const limited = opts.top && opts.top > 0 ? accounts.slice(0, opts.top) : accounts;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          file: filePath,
          chain_id: genesis.chain_id,
          total_accounts: accounts.length,
          showing: limited.length,
          accounts: limited,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Genesis Accounts\n");
  console.log(`  File:       ${filePath}`);
  console.log(`  Chain ID:   ${genesis.chain_id}`);
  console.log(`  Total:      ${accounts.length} accounts`);
  if (opts.top) {
    console.log(`  Showing:    top ${limited.length}`);
  }
  console.log();

  if (limited.length === 0) {
    console.log("  No accounts found in genesis.\n");
    return;
  }

  const headers = ["Address", "Balance", "Type"];
  const rows = limited.map((a) => [a.address, a.balance, a.type]);
  console.log(table(headers, rows));
  console.log();
}

function parseGenesisAccounts(appState: Record<string, any>): AccountEntry[] {
  const entries: AccountEntry[] = [];

  // Parse auth accounts
  const authAccounts: any[] =
    appState?.auth?.accounts ?? appState?.auth?.genesis_accounts ?? [];

  // Build balance map from bank module
  const balances: any[] = appState?.bank?.balances ?? [];
  const balanceMap = new Map<string, string>();
  for (const b of balances) {
    const addr = b.address ?? "";
    const coins: any[] = b.coins ?? [];
    const uclaw = coins.find((c: any) => c.denom === "uclaw");
    if (uclaw?.amount) {
      balanceMap.set(addr, uclaw.amount);
    } else if (coins.length > 0) {
      // Sum all denoms as fallback
      const total = coins.reduce(
        (acc: bigint, c: any) => acc + BigInt(c.amount ?? "0"),
        0n,
      );
      balanceMap.set(addr, total.toString());
    }
  }

  for (const acct of authAccounts) {
    const typeUrl: string = acct["@type"] ?? acct.type ?? "";
    let address = acct.address ?? "";
    let acctType: AccountEntry["type"] = "base";

    if (typeUrl.includes("ModuleAccount") || typeUrl.includes("module_account")) {
      acctType = "module";
      address = acct.base_account?.address ?? acct.address ?? "";
    } else if (
      typeUrl.includes("Vesting") ||
      typeUrl.includes("vesting") ||
      typeUrl.includes("PeriodicVesting") ||
      typeUrl.includes("ContinuousVesting") ||
      typeUrl.includes("DelayedVesting")
    ) {
      acctType = "vesting";
      address =
        acct.base_vesting_account?.base_account?.address ??
        acct.base_account?.address ??
        acct.address ??
        "";
    } else {
      address = acct.address ?? acct.base_account?.address ?? "";
    }

    const rawBalance = balanceMap.get(address) ?? "0";
    entries.push({
      address,
      balance: formatClaw(rawBalance),
      type: acctType,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 3. clawd genesis validators
// ---------------------------------------------------------------------------

export type GenesisValidatorsOptions = {
  file?: string;
  json?: boolean;
};

export async function runGenesisValidators(opts: GenesisValidatorsOptions): Promise<void> {
  const filePath = resolveGenesisPath(opts.file);
  const genesis = loadGenesis(filePath);
  const appState = genesis.app_state ?? {};

  const gentxs: any[] =
    appState?.genutil?.gen_txs ?? appState?.gentx?.gen_txs ?? [];

  const validators: ValidatorEntry[] = [];

  for (const tx of gentxs) {
    const body = tx?.body ?? {};
    const messages: any[] = body.messages ?? [];
    const authInfo = tx?.auth_info ?? {};
    const signatures: string[] = tx?.signatures ?? [];

    // Find MsgCreateValidator message
    const createValMsg = messages.find(
      (m: any) =>
        (m["@type"] ?? "").includes("MsgCreateValidator") ||
        (m["@type"] ?? "").includes("staking/MsgCreateValidator"),
    );

    if (!createValMsg) continue;

    const moniker =
      createValMsg.description?.moniker ?? "unknown";
    const operatorAddress =
      createValMsg.validator_address ?? "";
    const pubkey =
      createValMsg.pubkey?.key ?? "-";
    const selfDelegation = createValMsg.value
      ? formatClaw(createValMsg.value.amount ?? "0")
      : "-";

    // Verify signature presence (non-empty and non-zero length)
    const signaturePresent =
      signatures.length > 0 &&
      signatures.some((s) => s.length > 0);

    validators.push({
      moniker,
      operatorAddress,
      consensusPubkey: pubkey,
      selfDelegation,
      signaturePresent,
    });
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          file: filePath,
          chain_id: genesis.chain_id,
          validator_count: validators.length,
          validators,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Genesis Validators\n");
  console.log(`  File:        ${filePath}`);
  console.log(`  Chain ID:    ${genesis.chain_id}`);
  console.log(`  Validators:  ${validators.length}`);
  console.log();

  if (validators.length === 0) {
    console.log("  No validators (gentxs) found in genesis.\n");
    return;
  }

  const headers = ["Moniker", "Operator Address", "Pubkey", "Self-Delegation", "Sig"];
  const rows = validators.map((v) => [
    v.moniker,
    v.operatorAddress,
    v.consensusPubkey.length > 20
      ? v.consensusPubkey.substring(0, 17) + "..."
      : v.consensusPubkey,
    v.selfDelegation,
    v.signaturePresent ? "OK" : "MISSING",
  ]);
  console.log(table(headers, rows));
  console.log();
}

// ---------------------------------------------------------------------------
// 4. clawd genesis module-params
// ---------------------------------------------------------------------------

export type GenesisModuleParamsOptions = {
  file?: string;
  json?: boolean;
};

export async function runGenesisModuleParams(opts: GenesisModuleParamsOptions): Promise<void> {
  const filePath = resolveGenesisPath(opts.file);
  const genesis = loadGenesis(filePath);
  const appState = genesis.app_state ?? {};

  const params = extractAllModuleParams(appState);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          file: filePath,
          chain_id: genesis.chain_id,
          params,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Genesis Module Parameters\n");
  console.log(`  File:       ${filePath}`);
  console.log(`  Chain ID:   ${genesis.chain_id}`);
  console.log();

  if (params.length === 0) {
    console.log("  No module parameters found.\n");
    return;
  }

  const headers = ["Module", "Parameter", "Value"];
  const rows = params.map((p) => [p.module, p.param, p.value]);
  console.log(table(headers, rows));
  console.log();
}

function extractAllModuleParams(appState: Record<string, any>): ParamEntry[] {
  const params: ParamEntry[] = [];

  // Agent module
  const agentParams = appState?.agent?.params;
  if (agentParams) {
    if (agentParams.heartbeat_interval !== undefined) {
      params.push({
        module: "agent",
        param: "heartbeat_interval",
        value: safeStr(agentParams.heartbeat_interval),
      });
    }
    if (agentParams.min_deposit !== undefined) {
      params.push({
        module: "agent",
        param: "min_deposit",
        value: safeStr(agentParams.min_deposit),
      });
    }
    if (agentParams.mining_rate !== undefined || agentParams.reward_per_block !== undefined) {
      params.push({
        module: "agent",
        param: "mining_rate",
        value: safeStr(agentParams.mining_rate ?? agentParams.reward_per_block),
      });
    }
    if (agentParams.max_agents !== undefined) {
      params.push({
        module: "agent",
        param: "max_agents",
        value: safeStr(agentParams.max_agents),
      });
    }
  }

  // Privacy module
  const privacyParams = appState?.privacy?.params;
  if (privacyParams) {
    if (privacyParams.tree_depth !== undefined) {
      params.push({
        module: "privacy",
        param: "tree_depth",
        value: safeStr(privacyParams.tree_depth),
      });
    }
    if (privacyParams.max_batch_size !== undefined || privacyParams.max_privacy_tx_per_block !== undefined) {
      params.push({
        module: "privacy",
        param: "max_batch_size",
        value: safeStr(privacyParams.max_batch_size ?? privacyParams.max_privacy_tx_per_block),
      });
    }
  }

  // Marketplace module
  const marketplaceParams = appState?.marketplace?.params;
  if (marketplaceParams) {
    if (marketplaceParams.min_skill_price !== undefined) {
      params.push({
        module: "marketplace",
        param: "min_skill_price",
        value: safeStr(marketplaceParams.min_skill_price),
      });
    }
    if (marketplaceParams.escrow_timeout !== undefined) {
      params.push({
        module: "marketplace",
        param: "escrow_timeout",
        value: safeStr(marketplaceParams.escrow_timeout),
      });
    }
  }

  // Governance module
  const govParams = appState?.gov?.params;
  if (govParams) {
    if (govParams.quorum !== undefined) {
      params.push({
        module: "governance",
        param: "quorum",
        value: safeStr(govParams.quorum),
      });
    }
    if (govParams.threshold !== undefined) {
      params.push({
        module: "governance",
        param: "threshold",
        value: safeStr(govParams.threshold),
      });
    }
    if (govParams.veto_threshold !== undefined) {
      params.push({
        module: "governance",
        param: "veto_threshold",
        value: safeStr(govParams.veto_threshold),
      });
    }
    const minDeposit = govParams.min_deposit;
    if (Array.isArray(minDeposit) && minDeposit.length > 0) {
      params.push({
        module: "governance",
        param: "min_deposit",
        value: `${minDeposit[0].amount ?? "0"} ${minDeposit[0].denom ?? ""}`.trim(),
      });
    }
    if (govParams.voting_period !== undefined) {
      params.push({
        module: "governance",
        param: "voting_period",
        value: safeStr(govParams.voting_period),
      });
    }
  }

  // Staking module
  const stakingParams = appState?.staking?.params;
  if (stakingParams) {
    if (stakingParams.unbonding_time !== undefined) {
      params.push({
        module: "staking",
        param: "unbonding_time",
        value: safeStr(stakingParams.unbonding_time),
      });
    }
    if (stakingParams.max_validators !== undefined) {
      params.push({
        module: "staking",
        param: "max_validators",
        value: safeStr(stakingParams.max_validators),
      });
    }
    if (stakingParams.bond_denom !== undefined) {
      params.push({
        module: "staking",
        param: "bond_denom",
        value: safeStr(stakingParams.bond_denom),
      });
    }
  }

  // Mint module
  const mintParams = appState?.mint?.params;
  if (mintParams) {
    if (mintParams.mint_denom !== undefined) {
      params.push({
        module: "mint",
        param: "mint_denom",
        value: safeStr(mintParams.mint_denom),
      });
    }
    if (mintParams.inflation_max !== undefined) {
      params.push({
        module: "mint",
        param: "inflation_max",
        value: safeStr(mintParams.inflation_max),
      });
    }
    if (mintParams.inflation_min !== undefined) {
      params.push({
        module: "mint",
        param: "inflation_min",
        value: safeStr(mintParams.inflation_min),
      });
    }
  }

  // Slashing module
  const slashingParams = appState?.slashing?.params;
  if (slashingParams) {
    if (slashingParams.signed_blocks_window !== undefined) {
      params.push({
        module: "slashing",
        param: "signed_blocks_window",
        value: safeStr(slashingParams.signed_blocks_window),
      });
    }
    if (slashingParams.slash_fraction_double_sign !== undefined) {
      params.push({
        module: "slashing",
        param: "slash_fraction_double_sign",
        value: safeStr(slashingParams.slash_fraction_double_sign),
      });
    }
    if (slashingParams.slash_fraction_downtime !== undefined) {
      params.push({
        module: "slashing",
        param: "slash_fraction_downtime",
        value: safeStr(slashingParams.slash_fraction_downtime),
      });
    }
  }

  // CosmWasm module
  const wasmParams = appState?.wasm?.params;
  if (wasmParams) {
    if (wasmParams.code_upload_access !== undefined) {
      const perm = wasmParams.code_upload_access.permission ?? "-";
      params.push({
        module: "wasm",
        param: "code_upload_access",
        value: safeStr(perm),
      });
    }
    if (wasmParams.max_wasm_code_size !== undefined) {
      params.push({
        module: "wasm",
        param: "max_wasm_code_size",
        value: safeStr(wasmParams.max_wasm_code_size),
      });
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// 5. clawd genesis hash
// ---------------------------------------------------------------------------

export type GenesisHashOptions = {
  file?: string;
  expected?: string;
  json?: boolean;
};

export async function runGenesisHash(opts: GenesisHashOptions): Promise<void> {
  const filePath = resolveGenesisPath(opts.file);

  if (!existsSync(filePath)) {
    console.error(`Genesis file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const raw = readFileSync(filePath);
  const sha256 = createHash("sha256").update(raw).digest("hex");

  let verified: boolean | null = null;
  if (opts.expected) {
    verified = sha256.toLowerCase() === opts.expected.toLowerCase();
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          file: filePath,
          sha256,
          expected: opts.expected ?? null,
          verified,
        },
        null,
        2,
      ) + "\n",
    );
    if (verified === false) process.exitCode = 1;
    return;
  }

  console.log("Genesis Hash\n");
  console.log(`  File:     ${filePath}`);
  console.log(`  SHA-256:  ${sha256}`);

  if (opts.expected) {
    console.log(`  Expected: ${opts.expected}`);
    if (verified) {
      console.log(`  Status:   MATCH`);
    } else {
      console.log(`  Status:   MISMATCH`);
      process.exitCode = 1;
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// 6. clawd genesis diff
// ---------------------------------------------------------------------------

export type GenesisDiffOptions = {
  old: string;
  new: string;
  json?: boolean;
};

export async function runGenesisDiff(opts: GenesisDiffOptions): Promise<void> {
  const oldGenesis = loadGenesis(opts.old);
  const newGenesis = loadGenesis(opts.new);

  const changes: DiffChange[] = [];

  // Compare top-level fields
  if (oldGenesis.chain_id !== newGenesis.chain_id) {
    changes.push({
      field: "chain_id",
      old: oldGenesis.chain_id,
      new: newGenesis.chain_id,
    });
  }

  if (oldGenesis.genesis_time !== newGenesis.genesis_time) {
    changes.push({
      field: "genesis_time",
      old: oldGenesis.genesis_time,
      new: newGenesis.genesis_time,
    });
  }

  if (oldGenesis.initial_height !== newGenesis.initial_height) {
    changes.push({
      field: "initial_height",
      old: oldGenesis.initial_height,
      new: newGenesis.initial_height,
    });
  }

  // Compare counts
  const oldAppState = oldGenesis.app_state ?? {};
  const newAppState = newGenesis.app_state ?? {};

  const oldAccountCount = countAccounts(oldAppState);
  const newAccountCount = countAccounts(newAppState);
  if (oldAccountCount !== newAccountCount) {
    changes.push({
      field: "accounts",
      old: String(oldAccountCount),
      new: String(newAccountCount),
    });
  }

  const oldValidatorCount = countValidators(oldAppState);
  const newValidatorCount = countValidators(newAppState);
  if (oldValidatorCount !== newValidatorCount) {
    changes.push({
      field: "validators",
      old: String(oldValidatorCount),
      new: String(newValidatorCount),
    });
  }

  const oldAgentCount = countAgents(oldAppState);
  const newAgentCount = countAgents(newAppState);
  if (oldAgentCount !== newAgentCount) {
    changes.push({
      field: "agents",
      old: String(oldAgentCount),
      new: String(newAgentCount),
    });
  }

  // Compare module parameters
  const oldParams = extractAllModuleParams(oldAppState);
  const newParams = extractAllModuleParams(newAppState);

  const oldParamMap = new Map<string, string>();
  for (const p of oldParams) {
    oldParamMap.set(`${p.module}.${p.param}`, p.value);
  }

  const newParamMap = new Map<string, string>();
  for (const p of newParams) {
    newParamMap.set(`${p.module}.${p.param}`, p.value);
  }

  // Changed or removed params
  for (const [key, oldVal] of oldParamMap) {
    const newVal = newParamMap.get(key);
    if (newVal === undefined) {
      changes.push({ field: `param:${key}`, old: oldVal, new: "(removed)" });
    } else if (oldVal !== newVal) {
      changes.push({ field: `param:${key}`, old: oldVal, new: newVal });
    }
  }

  // Added params
  for (const [key, newVal] of newParamMap) {
    if (!oldParamMap.has(key)) {
      changes.push({ field: `param:${key}`, old: "(absent)", new: newVal });
    }
  }

  // Compare total supply
  const oldSupply = getTotalSupply(oldAppState);
  const newSupply = getTotalSupply(newAppState);
  if (oldSupply !== newSupply) {
    changes.push({ field: "total_supply", old: oldSupply, new: newSupply });
  }

  // Compute hashes
  const oldRaw = readFileSync(opts.old);
  const newRaw = readFileSync(opts.new);
  const oldHash = createHash("sha256").update(oldRaw).digest("hex");
  const newHash = createHash("sha256").update(newRaw).digest("hex");

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          old_file: opts.old,
          new_file: opts.new,
          old_sha256: oldHash,
          new_sha256: newHash,
          identical: oldHash === newHash,
          change_count: changes.length,
          changes,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  console.log("Genesis Diff\n");
  console.log(`  Old:  ${opts.old}`);
  console.log(`  New:  ${opts.new}`);
  console.log();
  console.log(`  Old SHA-256:  ${oldHash}`);
  console.log(`  New SHA-256:  ${newHash}`);
  console.log(`  Identical:    ${oldHash === newHash ? "yes" : "no"}`);
  console.log();

  if (changes.length === 0) {
    console.log("  No differences found.\n");
    return;
  }

  console.log(`  ${changes.length} difference(s):\n`);

  const headers = ["Field", "Old", "New"];
  const rows = changes.map((c) => [
    c.field,
    c.old.length > 40 ? c.old.substring(0, 37) + "..." : c.old,
    c.new.length > 40 ? c.new.substring(0, 37) + "..." : c.new,
  ]);
  console.log(table(headers, rows));
  console.log();
}
