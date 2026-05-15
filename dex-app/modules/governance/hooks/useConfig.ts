import { useMemo } from "react";
import { useQuery } from "react-query";
import { useContracts } from "modules/common";
import { useClawWebapp } from "context/ClawWebappContext";

export const useConfig = () => {
  const { client } = useClawWebapp();
  const { assembly } = useContracts();

  const { data, isLoading } = useQuery(
    "configProposal",
    () => {
      if (!client) return null;
      return client.queryContractSmart(assembly, {
        config: {},
      });
    },
    {
      refetchOnWindowFocus: false,
    }
  );

  return useMemo(() => {
    if (isLoading || data == null) {
      return null;
    }

    return data;
  }, [isLoading, data]);
};

export default useConfig;
