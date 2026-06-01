/**
 * wagmi-style actions for the ModelVault CosmWasm contract.
 *
 * These thin wrappers route through the existing wagmi adapter (`./wagmi.ts`) —
 * reads go through `readContract`, writes through `writeContract` (wallet-signed
 * by the active connector). A React app wires these into its own hooks; the
 * `read*`/`write*` names mirror wagmi's `readContract`/`writeContract` actions
 * and the contract's snake_case msg surface.
 *
 * No `react`/`wagmi`/`eth_*` dependency — same posture as `./wagmi.ts`.
 */
import { readContract, writeContract, type ClawWagmiConfig } from "./wagmi.js";
import { DEFAULT_DENOM } from "./constants.js";
import type { ClawViemTx } from "./viem.js";
import type {
  Quote,
  TradeSide,
  VaultConfig,
  VaultPool,
  VaultPoolInfo,
  VaultStakeInfo,
} from "./model-vault.js";

// ---------------------------------------------------------------------------
// Reads (CosmWasm smart queries via the wagmi config's readContract)
// ---------------------------------------------------------------------------

/** Read vault config (`{"config":{}}`). */
export async function readModelVaultConfig(
  config: ClawWagmiConfig,
  contract: string,
): Promise<VaultConfig> {
  return (await readContract(config, {
    address: contract,
    functionName: "config",
  })) as VaultConfig;
}

/** Read curve reserves/inventory (`{"pool":{}}`). */
export async function readModelVaultPool(
  config: ClawWagmiConfig,
  contract: string,
): Promise<VaultPool> {
  return (await readContract(config, {
    address: contract,
    functionName: "pool",
  })) as VaultPool;
}

/** Read dividend-pool aggregate state (`{"pool_info":{}}`). */
export async function readModelVaultPoolInfo(
  config: ClawWagmiConfig,
  contract: string,
): Promise<VaultPoolInfo> {
  return (await readContract(config, {
    address: contract,
    functionName: "pool_info",
  })) as VaultPoolInfo;
}

/** Read pure constant-product quote (`{"quote":{"side":...,"amount":...}}`). */
export async function readModelVaultQuote(
  config: ClawWagmiConfig,
  contract: string,
  args: { side: TradeSide; amount: string },
): Promise<Quote> {
  return (await readContract(config, {
    address: contract,
    functionName: "quote",
    args: { side: args.side, amount: args.amount },
  })) as Quote;
}

/** Read a single address' stake + live claimable (`{"stake_info":{"address":...}}`). */
export async function readModelVaultStakeInfo(
  config: ClawWagmiConfig,
  contract: string,
  address: string,
): Promise<VaultStakeInfo> {
  return (await readContract(config, {
    address: contract,
    functionName: "stake_info",
    args: { address },
  })) as VaultStakeInfo;
}

// ---------------------------------------------------------------------------
// Writes (wallet-signed MsgExecuteContract via the wagmi config's writeContract)
// ---------------------------------------------------------------------------

/** `buy{}` — attach `reserve` of the reserve denom, receive model tokens. */
export async function writeModelVaultBuy(
  config: ClawWagmiConfig,
  contract: string,
  args: { reserve: string; reserveDenom?: string },
): Promise<ClawViemTx> {
  return writeContract(config, {
    address: contract,
    functionName: "buy",
    funds: [{ denom: args.reserveDenom ?? DEFAULT_DENOM, amount: args.reserve }],
  });
}

/** `sell{}` — attach `amount` of the model denom, receive reserve coins. */
export async function writeModelVaultSell(
  config: ClawWagmiConfig,
  contract: string,
  args: { amount: string; modelDenom: string },
): Promise<ClawViemTx> {
  return writeContract(config, {
    address: contract,
    functionName: "sell",
    funds: [{ denom: args.modelDenom, amount: args.amount }],
  });
}

/** `stake{}` — stake `amount` model tokens into the dividend pool. */
export async function writeModelVaultStake(
  config: ClawWagmiConfig,
  contract: string,
  args: { amount: string; modelDenom: string },
): Promise<ClawViemTx> {
  return writeContract(config, {
    address: contract,
    functionName: "stake",
    funds: [{ denom: args.modelDenom, amount: args.amount }],
  });
}

/** `unstake{amount}` — withdraw `amount` of previously staked model tokens. */
export async function writeModelVaultUnstake(
  config: ClawWagmiConfig,
  contract: string,
  args: { amount: string },
): Promise<ClawViemTx> {
  return writeContract(config, {
    address: contract,
    functionName: "unstake",
    args: { amount: args.amount },
  });
}

/** `claim_rewards{}` — claim accrued reserve-denom dividends. */
export async function writeModelVaultClaim(
  config: ClawWagmiConfig,
  contract: string,
): Promise<ClawViemTx> {
  return writeContract(config, {
    address: contract,
    functionName: "claim_rewards",
  });
}

/** `distribute_revenue{}` — distribute attached reserve revenue across stakers. */
export async function writeModelVaultDistributeRevenue(
  config: ClawWagmiConfig,
  contract: string,
  args: { revenue: string; reserveDenom?: string },
): Promise<ClawViemTx> {
  return writeContract(config, {
    address: contract,
    functionName: "distribute_revenue",
    funds: [{ denom: args.reserveDenom ?? DEFAULT_DENOM, amount: args.revenue }],
  });
}
