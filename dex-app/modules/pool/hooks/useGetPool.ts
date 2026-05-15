import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";

import { QUERY_STALE_TIME } from "constants/constants";

export const useGetPool = (contract?: string) => {
  const { client } = useClawWebapp();

  return useQuery(
    ["pool", contract],
    () => {
      if (!client) return null;
      return client.queryContractSmart(contract || "", {
        pool: {},
      });
    },
    {
      refetchOnWindowFocus: false,
      enabled: contract != null,
      staleTime: QUERY_STALE_TIME,
    }
  );
};

export default useGetPool;
