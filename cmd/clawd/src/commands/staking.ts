/**
 * `clawd staking` subcommands — delegate, undelegate, redelegate, rewards, validators.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, formatClaw, shortAddr } from "../lib/format.js";

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
// clawd staking validators
// ---------------------------------------------------------------------------

export type StakingValidatorsOptions = {
  status?: string;
  json?: boolean;
};

export async function runStakingValidators(opts: StakingValidatorsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const statusFilter = opts.status ?? "BOND_STATUS_BONDED";
  const url = `${restUrl}/cosmos/staking/v1beta1/validators?status=${statusFilter}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query validators (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { validators?: any[] };
    const validators = data.validators ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ validators }, null, 2) + "\n");
      return;
    }

    if (validators.length === 0) {
      console.log("No validators found.");
      return;
    }

    const headers = ["#", "Moniker", "Operator", "Tokens", "Commission", "Status"];
    const rows = validators
      .sort((a: any, b: any) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0))
      .map((v: any, i: number) => [
        String(i + 1),
        v.description?.moniker ?? "unknown",
        shortAddr(v.operator_address ?? ""),
        formatClaw(v.tokens ?? "0"),
        ((Number(v.commission?.commission_rates?.rate ?? 0) * 100).toFixed(1)) + "%",
        v.status === "BOND_STATUS_BONDED" ? "Bonded" : "Unbonded",
      ]);

    console.log(`Validators (${validators.length})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query validators: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd staking delegations
// ---------------------------------------------------------------------------

export type StakingDelegationsOptions = {
  address?: string;
  json?: boolean;
};

export async function runStakingDelegations(opts: StakingDelegationsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let address = opts.address;
  if (!address) {
    if (!mnemonicFileExists()) {
      console.error('No address provided and no mnemonic. Run "clawd init" first.');
      process.exit(1);
    }
    const mnemonic = loadMnemonic();
    if (!mnemonic) { process.exit(1); return; }
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: cfg.prefix ?? "claw" });
    const [account] = await wallet.getAccounts();
    address = account!.address;
  }

  const url = `${restUrl}/cosmos/staking/v1beta1/delegations/${encodeURIComponent(address)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query delegations (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { delegation_responses?: any[] };
    const delegations = data.delegation_responses ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ delegations }, null, 2) + "\n");
      return;
    }

    if (delegations.length === 0) {
      console.log(`No delegations found for ${shortAddr(address)}.`);
      return;
    }

    const headers = ["Validator", "Shares", "Balance"];
    const rows = delegations.map((d: any) => [
      shortAddr(d.delegation?.validator_address ?? ""),
      Number(d.delegation?.shares ?? 0).toFixed(0),
      formatClaw(d.balance?.amount ?? "0"),
    ]);

    console.log(`Delegations for ${shortAddr(address)}\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query delegations: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd staking delegate
// ---------------------------------------------------------------------------

export type StakingDelegateOptions = {
  validator: string;
  amount: string;
};

export async function runStakingDelegate(opts: StakingDelegateOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureSigner();

  const amount = opts.amount;
  console.log(`Delegating ${formatClaw(amount)} to ${shortAddr(opts.validator)}...`);

  const msg = {
    typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
    value: {
      delegatorAddress: account.address,
      validatorAddress: opts.validator,
      amount: { denom, amount },
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Delegation failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Delegated ${formatClaw(amount)} to ${shortAddr(opts.validator)}.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Delegation failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd staking undelegate
// ---------------------------------------------------------------------------

export type StakingUndelegateOptions = {
  validator: string;
  amount: string;
};

export async function runStakingUndelegate(opts: StakingUndelegateOptions): Promise<void> {
  const { account, signingClient, denom } = await ensureSigner();

  const amount = opts.amount;
  console.log(`Undelegating ${formatClaw(amount)} from ${shortAddr(opts.validator)}...`);

  const msg = {
    typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
    value: {
      delegatorAddress: account.address,
      validatorAddress: opts.validator,
      amount: { denom, amount },
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Undelegation failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Undelegated ${formatClaw(amount)} from ${shortAddr(opts.validator)}.`);
    console.log(`  Unbonding period applies. TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Undelegation failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd staking rewards
// ---------------------------------------------------------------------------

export type StakingRewardsOptions = {
  address?: string;
  json?: boolean;
};

export async function runStakingRewards(opts: StakingRewardsOptions): Promise<void> {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  let address = opts.address;
  if (!address) {
    if (!mnemonicFileExists()) {
      console.error('No address provided and no mnemonic. Run "clawd init" first.');
      process.exit(1);
    }
    const mnemonic = loadMnemonic();
    if (!mnemonic) { process.exit(1); return; }
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: cfg.prefix ?? "claw" });
    const [account] = await wallet.getAccounts();
    address = account!.address;
  }

  const url = `${restUrl}/cosmos/distribution/v1beta1/delegators/${encodeURIComponent(address)}/rewards`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query rewards (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { rewards?: any[]; total?: any[] };
    const rewards = data.rewards ?? [];
    const total = data.total ?? [];

    if (opts.json) {
      process.stdout.write(JSON.stringify({ rewards, total }, null, 2) + "\n");
      return;
    }

    console.log(`Staking Rewards for ${shortAddr(address)}\n`);

    if (rewards.length === 0) {
      console.log("  No pending rewards.");
    } else {
      for (const r of rewards) {
        const valAddr = r.validator_address ?? "";
        const coins = (r.reward ?? []) as { denom: string; amount: string }[];
        const clawReward = coins.find((c) => c.denom === "uclaw");
        console.log(`  ${shortAddr(valAddr)}: ${clawReward ? formatClaw(clawReward.amount.split(".")[0]) : "0 CLAW"}`);
      }
    }

    const totalClaw = (total as { denom: string; amount: string }[]).find((c) => c.denom === "uclaw");
    console.log(`\n  Total: ${totalClaw ? formatClaw(totalClaw.amount.split(".")[0]) : "0 CLAW"}`);
    console.log();
  } catch (err) {
    console.error(`Failed to query rewards: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd staking claim-rewards
// ---------------------------------------------------------------------------

export type StakingClaimRewardsOptions = {
  validator?: string;
};

export async function runStakingClaimRewards(opts: StakingClaimRewardsOptions): Promise<void> {
  const { account, signingClient, cfg } = await ensureSigner();
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(cfg.rpcUrl ?? "http://localhost:26657")).replace(/\/+$/, "");

  let validators: string[] = [];

  if (opts.validator) {
    validators = [opts.validator];
  } else {
    // Fetch all delegations to claim from all validators
    try {
      const url = `${restUrl}/cosmos/staking/v1beta1/delegations/${encodeURIComponent(account.address)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) {
        const data = (await res.json()) as { delegation_responses?: any[] };
        validators = (data.delegation_responses ?? []).map(
          (d: any) => d.delegation?.validator_address as string,
        ).filter(Boolean);
      }
    } catch {
      /* fallthrough */
    }
  }

  if (validators.length === 0) {
    console.log("No delegations found to claim rewards from.");
    return;
  }

  console.log(`Claiming rewards from ${validators.length} validator(s)...`);

  const msgs = validators.map((valAddr) => ({
    typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
    value: {
      delegatorAddress: account.address,
      validatorAddress: valAddr,
    },
  }));

  try {
    const res = await signingClient.signAndBroadcast(account.address, msgs, "auto");
    if (res.code !== 0) {
      console.error(`Claim failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Rewards claimed from ${validators.length} validator(s).`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Claim failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
