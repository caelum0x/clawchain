import { useMemo } from "react";
import { useQuery } from "react-query";
import { useClawWebapp } from "context/ClawWebappContext";

import { useContracts } from "modules/common";

export const usePoolFee = (pairType: string) => {
  const { client } = useClawWebapp();
  const { factory } = useContracts();

  const { data, isLoading } = useQuery(
    ["pair", pairType],
    () => {
      if (pairType == null) {
        throw new Error("pairType is null");
      }

      if (!client) return null;
      return client.queryContractSmart(factory, {
        fee_info: {
          pair_type: {
            [pairType]: {},
          },
        },
      });
    },
    {
      refetchOnWindowFocus: false,
      enabled: pairType != null,
    }
  );

  return useMemo(() => {
    if (isLoading || !data) {
      return 0;
    }

    return data.total_fee_bps;
  }, [data, isLoading]);
};

export default usePoolFee;
