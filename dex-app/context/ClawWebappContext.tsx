import {
  FC,
  ReactNode,
  useMemo,
  useEffect,
  useState,
  Context,
  createContext,
  useContext,
  Consumer,
  Provider,
} from "react";
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { useQuery } from "react-query";
import useAddress from "hooks/useAddress";
import { DEFAULT_NETWORK } from "constants/constants";

type NetworkInfo = {
  name: string;
  chainID: string;
  lcd: string;
};

type AccountInfo = {
  address: string;
  accountNumber: number;
  sequence: number;
};

type ClawWebapp = {
  network: NetworkInfo;
  client: CosmWasmClient | null;
  accountInfo: AccountInfo | undefined;
};

const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.clawchain.io";
const REST_ENDPOINT =
  process.env.NEXT_PUBLIC_LCD_URL || "https://api.clawchain.io";

const ClawWebappContext: Context<ClawWebapp> = createContext<ClawWebapp>({
  network: DEFAULT_NETWORK,
  client: null,
  accountInfo: undefined,
});

type Props = {
  children: ReactNode;
};

export const ClawWebappProvider: FC<Props> = ({ children }) => {
  const network = DEFAULT_NETWORK;
  const address = useAddress();
  const [client, setClient] = useState<CosmWasmClient | null>(null);

  useEffect(() => {
    let cancelled = false;

    CosmWasmClient.connect(RPC_ENDPOINT)
      .then((c) => {
        if (!cancelled) {
          setClient(c);
        }
      })
      .catch((err) => {
        console.error("Failed to connect CosmWasmClient:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const { data: accountInfo } = useQuery(
    ["accountInfo", network.chainID, address],
    async (): Promise<AccountInfo> => {
      if (!address) {
        throw new Error("No address");
      }

      const res = await fetch(
        `${REST_ENDPOINT}/cosmos/auth/v1beta1/accounts/${address}`
      );

      if (!res.ok) {
        throw new Error(`Failed to fetch account info: ${res.statusText}`);
      }

      const json = await res.json();
      const account = json.account || {};

      return {
        address: account.address || address,
        accountNumber: parseInt(account.account_number || "0", 10),
        sequence: parseInt(account.sequence || "0", 10),
      };
    },
    {
      enabled: !!address,
      refetchOnWindowFocus: false,
    }
  );

  const value = useMemo(() => {
    return {
      network,
      client,
      accountInfo,
    };
  }, [network, client, accountInfo]);

  const ClawWebappInnerProvider: Provider<ClawWebapp> =
    ClawWebappContext.Provider;

  return (
    <ClawWebappInnerProvider value={value}>{children}</ClawWebappInnerProvider>
  );
};

export function useClawWebapp(): ClawWebapp {
  return useContext(ClawWebappContext);
}
export const ClawWebappConsumer: Consumer<ClawWebapp> =
  ClawWebappContext.Consumer;

export default ClawWebappContext;
