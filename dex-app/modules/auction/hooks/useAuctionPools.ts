import { useMemo } from "react";
import num from "libs/num";
import { ONE_TOKEN } from "constants/constants";
import { AuctionPoolsPool } from "types/common";
import { getTokenDenom, useContracts, useTokenInfo } from "modules/common";
import { useUserInfo, useConfig, useAuctionState } from "modules/auction";
import { useGetPool } from "modules/pool";
import { getAssetAmountsInPool } from "libs/terra";

export const useAuctionPools = () => {
  const { clawToken, clawUstPool } = useContracts();
  const { getDecimals } = useTokenInfo();
  const userInfo = useUserInfo();
  const config = useConfig();
  const state = useAuctionState();
  const { data: pool } = useGetPool(clawUstPool);

  const lockEnd = useMemo(() => {
    if (config == null) {
      return null;
    }

    return (
      config.init_timestamp +
      config.deposit_window +
      config.withdrawal_window +
      config.lp_tokens_vesting_duration
    );
  }, [config]);

  return useMemo((): AuctionPoolsPool[] => {
    if (userInfo == null || config == null || state == null || pool == null) {
      return [];
    }

    const { token1: token1Amount } = getAssetAmountsInPool(pool.assets, "uusd");
    const totalLiquidity = num(pool.total_share)
      .div(ONE_TOKEN)
      .dp(6)
      .toNumber();
    const totalLiquidityInUst = num(token1Amount)
      .div(ONE_TOKEN)
      .times(2)
      .dp(6)
      .toNumber();

    const myLiquidity = num(userInfo.lp_shares)
      .minus(num(userInfo.claimed_lp_shares))
      .div(ONE_TOKEN)
      .dp(6)
      .toNumber();

    const myLiquidityInUst = num(myLiquidity)
      .times(totalLiquidityInUst)
      .div(totalLiquidity)
      .dp(6)
      .toNumber();

    const myUnlockableLiquidity = num(userInfo.withdrawable_lp_shares)
      .div(ONE_TOKEN)
      .dp(6)
      .toNumber();
    const myUnlockableLiquidityInUst = num(myUnlockableLiquidity)
      .times(totalLiquidityInUst)
      .div(totalLiquidity)
      .dp(6)
      .toNumber();

    const isClaimable = num(userInfo.withdrawable_lp_shares).gt(0);
    const isClaimed =
      userInfo.claw_incentive_transferred &&
      num(userInfo.withdrawable_lp_shares).eq(0);

    const rewards = [
      {
        token: clawToken,
        amount:
          +userInfo.claimable_generator_claw / 10 ** getDecimals(clawToken),
      },
    ];

    let poolAssets;
    const firstAsset = (pool?.assets || [])[0];
    const secondAsset = (pool?.assets || [])[1];
    const isClawToken = getTokenDenom(firstAsset?.info) === clawToken;
    if (isClawToken) {
      poolAssets = [
        {
          amount: firstAsset?.amount,
          info: { token: { contract_addr: clawToken } },
        },
        secondAsset,
      ];
    } else if (getTokenDenom(secondAsset?.info) === clawToken) {
      poolAssets = [
        {
          amount: secondAsset?.amount,
          info: { token: { contract_addr: clawToken } },
        },
        firstAsset,
      ];
    }

    return [
      {
        name: config.pool_info?.claw_ust_pool_address,
        contract: config.pool_info?.claw_ust_pool_address,
        assets: [clawToken, "uusd"],
        poolAssets,
        sortingAssets: [
          config.pool_info?.claw_ust_pool_address,
          clawToken,
          "uusd",
          "claw",
          "ust",
        ],
        pairType: "xyk",
        totalLiquidity,
        totalLiquidityInUst,
        myLiquidity,
        myLiquidityInUst,
        myUnlockableLiquidity,
        myUnlockableLiquidityInUst,
        isClaimable,
        isClaimed,
        amount: userInfo.withdrawable_lp_shares,
        lockEnd,
        rewards,
      },
    ];
  }, [userInfo, config, state, clawToken, pool]);
};

export default useAuctionPools;
