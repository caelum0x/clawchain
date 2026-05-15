import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

import {
  getTokenDenom,
  isNativeAsset,
  isNativeAssetInfo,
} from "modules/common";

import { Pool } from "modules/pool";

type Coin = {
  denom: string;
  amount: { toString(): string };
};

type CreateProvideMsgsOptions = {
  pool: Pool;
  coin1: Coin;
  coin2: Coin;
  contract: string;
  slippage: string;
  autoStake: boolean;
};

export const createProvideMsgs = (
  options: CreateProvideMsgsOptions,
  sender: string
): EncodeObject[] => {
  const { contract, pool, coin1, coin2, slippage, autoStake } = options;

  const assets = (pool.assets || []).map((asset) => ({
    info: asset.info,
    amount:
      getTokenDenom(asset.info) === coin1.denom
        ? coin1.amount.toString()
        : coin2.amount.toString(),
  }));

  const coins = assets
    .filter((asset) => isNativeAsset(asset.info))
    .map((asset) => ({
      denom: getTokenDenom(asset.info),
      amount: String(asset.amount),
    }));

  const allowanceMsgs = assets.reduce<EncodeObject[]>((acc, asset) => {
    if (isNativeAssetInfo(asset.info)) {
      return acc;
    }

    return [
      ...acc,
      createExecuteMsg(sender, asset.info.token.contract_addr, {
        increase_allowance: {
          amount: asset.amount,
          spender: contract,
        },
      }),
    ];
  }, []);

  const executeMsg = {
    provide_liquidity: {
      assets,
      slippage_tolerance: slippage,
      auto_stake: autoStake,
    },
  };

  const msg = createExecuteMsg(sender, contract, executeMsg, coins);

  return [...allowanceMsgs, msg];
};

export default createProvideMsgs;
