import { useCallback, useState, useEffect, useMemo } from "react";
import { StdFee, calculateFee, GasPrice } from "@cosmjs/stargate";
import { EncodeObject } from "@cosmjs/proto-signing";
import { useQuery } from "react-query";
import { useKeplrWallet } from "context/KeplrWalletContext";
import useAddress from "hooks/useAddress";
import useDebounceValue from "hooks/useDebounceValue";
import {
  useTx,
  TxErrorHandler,
  UseTxNotificationDetails,
} from "modules/common";
import { CLASSIC_DEFAULT_GAS_ADJUSTMENT } from "constants/constants";

export enum TxStep {
  /**
   * Idle
   */
  Idle,
  /**
   * Estimating fees
   */
  Estimating,
  /**
   * Ready to post transaction
   */
  Ready,
  /**
   * Signing transaction in wallet
   */
  Posting,
  /**
   * Broadcasting
   */
  Broadcasting,
  /**
   * Failed
   */
  Failed,
}

type Params = {
  msgs: EncodeObject[];
  gasAdjustment?: number;
  onBroadcasting?: (txHash: string) => void;
  onError?: TxErrorHandler;
  notification: UseTxNotificationDetails;
};

export const useTransaction = ({
  msgs,
  gasAdjustment = CLASSIC_DEFAULT_GAS_ADJUSTMENT,
  onBroadcasting,
  onError,
  notification,
}: Params) => {
  const { client } = useKeplrWallet();
  const address = useAddress() || "";
  const debouncedMsgs = useDebounceValue(msgs, 200);

  const [txStep, setTxStep] = useState<TxStep>(TxStep.Idle);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [error, setError] = useState<unknown | null>(null);

  const { data: fee } = useQuery<unknown, unknown, StdFee>(
    ["fee", debouncedMsgs, error],
    async (): Promise<StdFee> => {
      if (
        debouncedMsgs == null ||
        txStep != TxStep.Idle ||
        error != null ||
        client == null ||
        !address
      ) {
        throw new Error("Error in estimating fee");
      }

      setError(null);
      setTxStep(TxStep.Estimating);

      const gasEstimate = await client.simulate(address, debouncedMsgs, "");
      const adjustedGas = Math.ceil(gasEstimate * gasAdjustment);
      const gasPrice = GasPrice.fromString("0.025uclaw");

      return calculateFee(adjustedGas, gasPrice);
    },
    {
      enabled:
        debouncedMsgs != null &&
        debouncedMsgs.length > 0 &&
        txStep == TxStep.Idle &&
        error == null &&
        client != null &&
        !!address,
      refetchOnWindowFocus: false,
      retry: false,
      onSuccess: () => {
        setTxStep(TxStep.Ready);
      },
      onError: (e) => {
        // @ts-expect-error - don't know anything about error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (e?.response?.data?.message) {
          // @ts-expect-error - don't know anything about error
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          setError(e.response.data.message);
        } else {
          setError("Something went wrong");
        }

        setTxStep(TxStep.Idle);
      },
    }
  );

  const { submit: submitTx } = useTx({
    notification,
    onPosting: () => {
      setTxStep(TxStep.Posting);
    },
    onBroadcasting: (txhash) => {
      setTxStep(TxStep.Broadcasting);
      setTxHash(txhash);

      onBroadcasting?.(txhash);
    },
    onError: (...args) => {
      setTxStep(TxStep.Failed);

      onError?.(...args);
    },
  });

  const reset = () => {
    setError(null);
    setTxHash(undefined);
    setTxStep(TxStep.Idle);
  };

  const submit = useCallback(async () => {
    submitTx({
      msgs,
      fee,
    });
  }, [submitTx, msgs, fee]);

  useEffect(() => {
    if (error) {
      setError(null);
    }

    if (txStep != TxStep.Idle) {
      setTxStep(TxStep.Idle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedMsgs]);

  return useMemo(() => {
    return {
      fee,
      submit,
      txStep,
      txHash,
      error,
      reset,
    };
  }, [fee, submit, txStep, txHash, error, reset]);
};

export default useTransaction;
