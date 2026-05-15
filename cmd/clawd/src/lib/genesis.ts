/**
 * Genesis helpers — add genesis accounts, create gentxs, collect gentxs.
 *
 * These wrap `clawchaind genesis` subcommands so that `clawd init` can
 * produce a genesis file with a funded validator.
 */

import { execFileSync } from "node:child_process";

export type AddGenesisAccountOptions = {
  nodeBin: string;
  nodeHome: string;
  address: string;
  /** Coin string, e.g. "100000000uclaw". */
  coins: string;
};

/**
 * Add a genesis account with an initial token allocation.
 */
export function addGenesisAccount(options: AddGenesisAccountOptions): void {
  execFileSync(
    options.nodeBin,
    [
      "genesis", "add-genesis-account",
      options.address,
      options.coins,
      "--home", options.nodeHome,
    ],
    { stdio: "pipe" },
  );
}

export type CreateGenesisTxOptions = {
  nodeBin: string;
  nodeHome: string;
  keyName: string;
  /** Stake amount string, e.g. "70000000uclaw". */
  stakeAmount: string;
  chainId: string;
};

/**
 * Create a genesis validator transaction (gentx).
 */
export function createGenesisTx(options: CreateGenesisTxOptions): void {
  execFileSync(
    options.nodeBin,
    [
      "genesis", "gentx",
      options.keyName,
      options.stakeAmount,
      "--chain-id", options.chainId,
      "--home", options.nodeHome,
      "--keyring-backend", "test",
    ],
    { stdio: "pipe" },
  );
}

export type CollectGenesisTxsOptions = {
  nodeBin: string;
  nodeHome: string;
};

/**
 * Collect all gentxs into the genesis file.
 */
export function collectGenesisTxs(options: CollectGenesisTxsOptions): void {
  execFileSync(
    options.nodeBin,
    ["genesis", "collect-gentxs", "--home", options.nodeHome],
    { stdio: "pipe" },
  );
}
