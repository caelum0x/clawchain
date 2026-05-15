import { useMemo } from "react";
import { useKeplrWallet } from "context/KeplrWalletContext";

/**
 * Wallet address of connected wallet
 * @returns string | null
 */
const useAddress = (): string | null => {
  const { address } = useKeplrWallet();

  return useMemo(() => {
    return address ?? null;
  }, [address]);
};

export default useAddress;
