import { useMemo } from "react";
import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import useAddress from "hooks/useAddress";
import { useContracts } from "modules/common";
import num from "libs/num";

export const useLockedLpAmount = (
  lpTokenContract: string,
  duration: number
): number => {
  const address = useAddress();
  const { lockdrop } = useContracts();
  const { client } = useClawWebapp();

  const { data: info } = useQuery(
    ["lockedLpAmount", lpTokenContract, duration, address],
    () => {
      if (!client) return null;
      return client.queryContractSmart(lockdrop, {
        lock_up_info: {
          clawswap_lp_token: lpTokenContract,
          duration,
          user_address: address,
        },
      });
    }
  );

  return useMemo(() => {
    if (info == null) {
      return 0;
    }

    return num(info.clawdex_lp_units)
      .div(10 ** 6)
      .dp(6)
      .toNumber();
  }, [info]);
};

export default useLockedLpAmount;
