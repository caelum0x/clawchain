import { useMemo } from "react";
import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import useAddress from "hooks/useAddress";
import { useContracts } from "modules/common";
import { QUERY_STALE_TIME } from "constants/constants";

export const useUserInfo = () => {
  const { client } = useClawWebapp();
  const address = useAddress();
  const { auction } = useContracts();

  const { data, isLoading } = useQuery(
    ["userInfo", "auction", address],
    () => {
      if (!address) {
        return null;
      }

      return client?.queryContractSmart(auction, {
        user_info: {
          address,
        },
      });
    },
    {
      staleTime: QUERY_STALE_TIME,
    }
  );

  return useMemo(() => {
    if (isLoading || data == null) {
      return null;
    }

    return data;
  }, [isLoading, data]);
};

export default useUserInfo;
