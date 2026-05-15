import {
  FC,
  ReactNode,
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GasPrice } from "@cosmjs/stargate";

declare global {
  interface Window {
    keplr?: {
      experimentalSuggestChain(chainInfo: unknown): Promise<void>;
      enable(chainId: string): Promise<void>;
      getOfflineSigner(chainId: string): unknown;
    };
    getOfflineSigner?: (chainId: string) => unknown;
  }
}

const CLAWCHAIN_CONFIG = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID || "clawchain-1",
  chainName: "ClawChain",
  rpc: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.clawchain.io",
  rest: process.env.NEXT_PUBLIC_LCD_URL || "https://api.clawchain.io",
  bip44: {
    coinType: 118,
  },
  bech32Config: {
    bech32PrefixAccAddr: "claw",
    bech32PrefixAccPub: "clawpub",
    bech32PrefixValAddr: "clawvaloper",
    bech32PrefixValPub: "clawvaloperpub",
    bech32PrefixConsAddr: "clawvalcons",
    bech32PrefixConsPub: "clawvalconspub",
  },
  currencies: [
    {
      coinDenom: "CLAW",
      coinMinimalDenom: "uclaw",
      coinDecimals: 6,
    },
  ],
  feeCurrencies: [
    {
      coinDenom: "CLAW",
      coinMinimalDenom: "uclaw",
      coinDecimals: 6,
      gasPriceStep: {
        low: 0.01,
        average: 0.025,
        high: 0.04,
      },
    },
  ],
  stakeCurrency: {
    coinDenom: "CLAW",
    coinMinimalDenom: "uclaw",
    coinDecimals: 6,
  },
};

export type KeplrWallet = {
  address: string | null;
  client: SigningCosmWasmClient | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const KeplrWalletContext = createContext<KeplrWallet>({
  address: null,
  client: null,
  isConnected: false,
  connect: async () => {},
  disconnect: () => {},
});

type Props = {
  children: ReactNode;
};

export const KeplrWalletProvider: FC<Props> = ({ children }) => {
  const [address, setAddress] = useState<string | null>(null);
  const [client, setClient] = useState<SigningCosmWasmClient | null>(null);

  const connect = useCallback(async () => {
    if (!window.keplr) {
      throw new Error(
        "Keplr wallet extension not found. Please install Keplr to continue."
      );
    }

    // Suggest ClawChain to Keplr (adds the chain if not already present)
    await window.keplr.experimentalSuggestChain(CLAWCHAIN_CONFIG);

    // Enable the chain in Keplr
    await window.keplr.enable(CLAWCHAIN_CONFIG.chainId);

    // Get the offline signer for signing transactions
    const offlineSigner = window.keplr.getOfflineSigner(
      CLAWCHAIN_CONFIG.chainId
    );

    // Create a SigningCosmWasmClient connected to the RPC endpoint
    const signingClient = await SigningCosmWasmClient.connectWithSigner(
      CLAWCHAIN_CONFIG.rpc,
      offlineSigner as any,
      {
        gasPrice: GasPrice.fromString("0.025uclaw"),
      }
    );

    // Retrieve the user's account address from the signer
    const accounts = await (offlineSigner as any).getAccounts();
    const userAddress = accounts[0]?.address;

    if (!userAddress) {
      throw new Error("No accounts found in Keplr wallet.");
    }

    setAddress(userAddress);
    setClient(signingClient);
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setClient(null);
  }, []);

  const value = useMemo<KeplrWallet>(
    () => ({
      address,
      client,
      isConnected: address !== null && client !== null,
      connect,
      disconnect,
    }),
    [address, client, connect, disconnect]
  );

  return (
    <KeplrWalletContext.Provider value={value}>
      {children}
    </KeplrWalletContext.Provider>
  );
};

export function useKeplrWallet(): KeplrWallet {
  return useContext(KeplrWalletContext);
}

export default KeplrWalletContext;
