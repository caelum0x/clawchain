import { useEffect } from "react";
import useSWR from "swr";

type TxInfo = {
  height: string;
  txhash: string;
  code: number;
  rawLog?: string;
  tx?: unknown;
  timestamp?: string;
};

type Params = {
  txHash?: string | null | undefined;
  onSuccess?: (txHash: string, txInfo?: TxInfo) => void;
  onError?: (txHash?: string, txInfo?: TxInfo) => void;
};

const REST_ENDPOINT =
  process.env.NEXT_PUBLIC_LCD_URL || "https://api.clawchain.io";

const useTxInfo = ({ txHash, onSuccess, onError }: Params) => {
  const { data, error } = useSWR(
    ["txInfoFromHook", txHash],
    async (): Promise<TxInfo | null> => {
      if (txHash == null) {
        return null;
      }

      const res = await fetch(
        `${REST_ENDPOINT}/cosmos/tx/v1beta1/txs/${txHash}`
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch tx info: ${res.statusText}`);
      }

      const json = await res.json();
      const txResponse = json.tx_response || {};

      return {
        height: txResponse.height || "0",
        txhash: txResponse.txhash || txHash,
        code: txResponse.code || 0,
        rawLog: txResponse.raw_log,
        tx: txResponse.tx,
        timestamp: txResponse.timestamp,
      };
    },
    {
      shouldRetryOnError: true,
      errorRetryInterval: 2000,
      errorRetryCount: 5,
      revalidateOnReconnect: false,
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  );

  useEffect(() => {
    if (data != null && txHash != null) {
      if (data.code) {
        onError?.(txHash, data);
      } else {
        onSuccess?.(txHash, data);
      }
    }
  }, [data, onError, onSuccess, txHash]);

  return {
    isLoading: !data && !error,
    txInfo: data,
  };
};

export default useTxInfo;
