import { EncodeObject } from "@cosmjs/proto-signing";
import { MULTI_SWAP_MAX_SPREAD } from "constants/constants";
import { toBase64 } from "libs/terra";
import { createExecuteMsg } from "libs/cosmjs";

import {
  isNativeAsset,
  findAsset,
  Route,
  SwapOperation,
  toAssetInfo,
} from "modules/common";

type GetSwapOperationsParams = {
  swapRoute: Route[] | null;
  operations?: SwapOperation[];
};

export const getSwapOperations = ({
  swapRoute,
  operations = [],
}: GetSwapOperationsParams): SwapOperation[] => {
  if (swapRoute == null || swapRoute.length === 0) {
    return operations;
  }

  const firstRoute = swapRoute[0];
  const operation: SwapOperation = {
    claw_swap: {
      offer_asset_info: toAssetInfo(firstRoute?.from || ""),
      ask_asset_info: toAssetInfo(firstRoute?.to || ""),
    },
  };

  return getSwapOperations({
    swapRoute: swapRoute.slice(1),
    operations: [...operations, operation],
  });
};

type GetQueryParams = {
  client: any;
  router: string;
  swapRoute: Route[];
  token: string;
  amount: string;
  reverse?: boolean;
};

export const simulate = ({
  client,
  swapRoute,
  router,
  amount,
}: GetQueryParams) => {
  const operations = getSwapOperations({ swapRoute });

  return client?.queryContractSmart(router, {
    simulate_swap_operations: {
      offer_amount: amount,
      operations,
    },
  });
};

type CreateSwapMsgsOpts = {
  swapRoute: Route[];
  router: string;
  token: string;
  amount: string;
  minReceive: number | null;
};

export const createSwapMsgs = (
  { swapRoute, token, router, amount, minReceive }: CreateSwapMsgsOpts,
  sender: string
): EncodeObject[] => {
  if (minReceive == null || swapRoute == null || swapRoute.length === 0) {
    return [];
  }

  const firstRoute = swapRoute[0];

  const assetInfos = [
    toAssetInfo(firstRoute?.from || ""),
    toAssetInfo(firstRoute?.to || ""),
  ];

  const info = findAsset(assetInfos, token);

  if (info == null) {
    return [];
  }

  const isNative = isNativeAsset(info);

  const operations = getSwapOperations({ swapRoute });

  if (isNative) {
    return [
      createExecuteMsg(
        sender,
        router,
        {
          execute_swap_operations: {
            offer_amount: amount,
            operations,
            minimum_receive: minReceive.toString(),
            max_spread: MULTI_SWAP_MAX_SPREAD,
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
        contract: router,
        msg: toBase64({
          execute_swap_operations: {
            offer_amount: amount,
            operations,
            minimum_receive: minReceive.toString(),
            max_spread: MULTI_SWAP_MAX_SPREAD,
          },
        }),
      },
    }),
  ];
};
