import { useMemo } from "react";
import { DEFAULT_NETWORK } from "constants/constants";

type Contracts = {
  clawToken: string;
  xClawToken: string;
  bLunaToken: string;
  clawUstPool: string;
  clawUstLpToken: string;
  factory: string;
  router: string;
  vesting: string;
  staking: string;
  maker: string;
  generator: string;
  lockdrop: string;
  airdrop: string;
  airdrop2: string;
  auction: string;
  assembly: string;
  stakableLp: string[];
};

type Networks = {
  [key: string]: Contracts;
};

const envFactory = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "";
const envRouter = process.env.NEXT_PUBLIC_ROUTER_ADDRESS || "";

const emptyContracts: Contracts = {
  clawToken: "",
  xClawToken: "",
  clawUstPool: "",
  clawUstLpToken: "",
  bLunaToken: "",
  factory: envFactory,
  router: envRouter,
  vesting: "",
  staking: "",
  maker: "",
  generator: "",
  lockdrop: "",
  airdrop: "",
  airdrop2: "",
  auction: "",
  assembly: "",
  stakableLp: [],
};

const defaultContracts: Networks = {
  "clawchain-1": { ...emptyContracts },
  "clawchain-testnet": { ...emptyContracts },
  "clawchain-local": { ...emptyContracts },
};

export const useContracts = (initial?: Networks): Contracts => {
  const chainID = DEFAULT_NETWORK.chainID;
  const contracts = initial ?? defaultContracts;

  return useMemo((): Contracts => {
    return (contracts[chainID] ?? contracts["clawchain-1"] ?? defaultContracts["clawchain-1"])!;
  }, [contracts, chainID]);
};

export default useContracts;
