import { useCallback } from "react";
import { useKeplrWallet } from "context/KeplrWalletContext";
import { Coin } from "@cosmjs/stargate";

type ClawWallet = {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  executeContract: (
    contractAddr: string,
    msg: Record<string, unknown>,
    funds?: Coin[]
  ) => Promise<string>;
  queryContract: <T = unknown>(
    contractAddr: string,
    msg: Record<string, unknown>
  ) => Promise<T>;
};

const useClawWallet = (): ClawWallet => {
  const { address, client, isConnected, connect, disconnect } =
    useKeplrWallet();

  const executeContract = useCallback(
    async (
      contractAddr: string,
      msg: Record<string, unknown>,
      funds: Coin[] = []
    ): Promise<string> => {
      if (!client || !address) {
        throw new Error("Wallet not connected. Call connect() first.");
      }

      const result = await client.execute(
        address,
        contractAddr,
        msg,
        "auto",
        undefined,
        funds
      );

      return result.transactionHash;
    },
    [client, address]
  );

  const queryContract = useCallback(
    async <T = unknown>(
      contractAddr: string,
      msg: Record<string, unknown>
    ): Promise<T> => {
      if (!client) {
        throw new Error("Wallet not connected. Call connect() first.");
      }

      return client.queryContractSmart(contractAddr, msg) as Promise<T>;
    },
    [client]
  );

  return {
    address,
    isConnected,
    connect,
    disconnect,
    executeContract,
    queryContract,
  };
};

export default useClawWallet;
