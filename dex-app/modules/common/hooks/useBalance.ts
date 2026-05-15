import { useMemo } from "react";
import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import { isNativeToken } from "../asset";
import { QUERY_STALE_TIME } from "constants/constants";
import useAddress from "hooks/useAddress";

function isBalanceResponse(value: any) {
  return value.hasOwnProperty("balance");
}

export const useBalance = (token: string, contractAddress?: string) => {
  const walletAddress = useAddress();
  const { client } = useClawWebapp();
  const address =
    (contractAddress != null ? contractAddress : walletAddress) || "";

  const { data, isLoading } = useQuery<any>(
    ["balance", token, address],
    () => {
      if (!client) return null;
      if (isNativeToken(token)) {
        return client.getBalance(address, token);
      }

      return client.queryContractSmart(token, {
        balance: {
          address,
        },
      });
    },
    {
      enabled: !!address,
      refetchOnMount: true,
      staleTime: QUERY_STALE_TIME,
    }
  );

  return useMemo(() => {
    if (isLoading || !data) {
      return null;
    }

    if (isBalanceResponse(data)) {
      return data.balance;
    }

    const tokenResult = data[0].get(token);

    return tokenResult ? tokenResult.amount.toString() : null;
  }, [data, isLoading]);
};

export default useBalance;
