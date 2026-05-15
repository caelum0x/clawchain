import { useMemo } from "react";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { StdFee, calculateFee, GasPrice } from "@cosmjs/stargate";
import { EncodeObject } from "@cosmjs/proto-signing";
import useSWR from "swr";
import useAddress from "hooks/useAddress";
import { CLASSIC_DEFAULT_GAS_ADJUSTMENT } from "constants/constants";

type Params = {
  msgs: EncodeObject[] | null | undefined;
  gasAdjustment?: number;
};

const useEstimateFee = ({
  msgs,
  gasAdjustment = CLASSIC_DEFAULT_GAS_ADJUSTMENT,
}: Params) => {
  const address = useAddress();
  const { client } = useKeplrWallet();

  const { data, error } = useSWR(
    ["fee", msgs],
    async (): Promise<StdFee> => {
      if (msgs == null || error != null || address == null || client == null) {
        throw new Error("Msgs is null, client is null, or error is not null");
      }

      const gasEstimate = await client.simulate(address, msgs, "");
      const adjustedGas = Math.ceil(gasEstimate * gasAdjustment);
      const gasPrice = GasPrice.fromString("0.025uclaw");

      return calculateFee(adjustedGas, gasPrice);
    },
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return useMemo(() => {
    return {
      fee: data,
      isLoading: !error && !data,
      error,
    };
  }, [data, error]);
};

export default useEstimateFee;
