import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import { useContracts } from "modules/common";
import { QUERY_STALE_TIME } from "constants/constants";

export const useConfig = () => {
  const { client } = useClawWebapp();
  const { auction } = useContracts();

  const { data, isLoading } = useQuery(
    ["auction", "config"],
    () => {
      if (!client) return null;
      return client.queryContractSmart(auction, {
        config: {},
      });
    },
    {
      staleTime: QUERY_STALE_TIME,
    }
  );

  if (isLoading || data == null) {
    return null;
  }

  return data;
};

export default useConfig;
