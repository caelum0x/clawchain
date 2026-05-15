import { useMemo } from "react";
import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import useAddress from "hooks/useAddress";
import { useContracts } from "modules/common";
import { QUERY_STALE_TIME } from "constants/constants";

export const useStakedLpAmount = (lpTokenContract: string): string => {
  const address = useAddress();
  const { generator } = useContracts();
  const { client } = useClawWebapp();

  const { data } = useQuery(
    ["stakedLpAmount", lpTokenContract, address],
    () => {
      if (!client) return null;
      return client.queryContractSmart(generator, {
        deposit: {
          lp_token: lpTokenContract,
          user: address,
        },
      });
    },
    {
      staleTime: QUERY_STALE_TIME,
    }
  );

  return useMemo(() => {
    if (data == null) {
      return "0";
    }

    return data;
  }, [data]);
};

export default useStakedLpAmount;
