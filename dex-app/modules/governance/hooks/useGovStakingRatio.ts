import { useMemo } from "react";
import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import { QUERY_STALE_TIME } from "constants/constants";
import { useBalance, useContracts } from "modules/common";
import num from "libs/num";

export const useGovStakingRatio = () => {
  const { client } = useClawWebapp();
  const { clawToken, staking } = useContracts();
  const govClawBalance = useBalance(clawToken, staking);

  const { data, isLoading } = useQuery(
    ["supply", clawToken],
    () => {
      if (!client) return null;
      return client.queryContractSmart(clawToken, {
        token_info: {},
      });
    },
    {
      staleTime: QUERY_STALE_TIME,
    }
  );

  return useMemo(() => {
    if (data == null) {
      return 0;
    }

    const total = num(data.total_supply)
      .div(10 ** 6)
      .dp(6)
      .toNumber();
    const staked = num(govClawBalance)
      .div(10 ** 6)
      .dp(6)
      .toNumber();

    return num((staked * 100) / total).toNumber();
  }, [data, govClawBalance, isLoading]);
};
