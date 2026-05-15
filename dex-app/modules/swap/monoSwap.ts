import { toBase64 } from "libs/terra";
import { createExecuteMsg } from "libs/cosmjs";
import { EncodeObject } from "@cosmjs/proto-signing";

import {
  isNativeAsset,
  toAsset,
  createAsset,
  Route,
} from "modules/common";

type GetQueryParams = {
  client: any;
  swapRoute: Route[];
  token: string;
  amount: string;
  reverse?: boolean;
};

export const simulate = ({
  client,
  swapRoute,
  token,
  amount,
  reverse = false,
}: GetQueryParams) => {
  if (swapRoute[0] == null) {
    return null;
  }

  const { contract_addr } = swapRoute[0];

  if (reverse) {
    return client?.queryContractSmart(contract_addr, {
      reverse_simulation: {
        ask_asset: toAsset({ token, amount }),
      },
    });
  }

  return client?.queryContractSmart(contract_addr, {
    simulation: {
      offer_asset: toAsset({ token, amount }),
    },
  });
};

type CreateSwapMsgsOpts = {
  swapRoute: Route[];
  token: string;
  amount: string;
  slippage: string;
  price: string;
};

export const createSwapMsgs = (
  { swapRoute, token, amount, slippage, price }: CreateSwapMsgsOpts,
  sender: string
): EncodeObject[] => {
  if (swapRoute[0] == null) {
    return [];
  }

  const [{ contract_addr }] = swapRoute;

  const offerAsset = createAsset(amount, swapRoute);

  const isNative = isNativeAsset(offerAsset.info);

  if (isNative) {
    return [
      createExecuteMsg(
        sender,
        contract_addr,
        {
          swap: {
            offer_asset: offerAsset,
            max_spread: slippage,
            belief_price: price,
          },
        },
        [{ denom: token, amount: String(amount) }]
      ),
    ];
  }

  return [
    createExecuteMsg(sender, token, {
      send: {
        amount,
        contract: contract_addr,
        msg: toBase64({
          swap: {
            max_spread: slippage,
            belief_price: price,
          },
        }),
      },
    }),
  ];
};
