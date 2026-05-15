import { gql } from "graphql-request";
import { useClawWebapp } from "context/ClawWebappContext";
import { useApi, useContracts } from "modules/common";
import { useQuery } from "react-query";
import { QUERY_STALE_TIME } from "constants/constants";
import useAddress from "hooks/useAddress";

const query = gql`
  query Supply {
    supply {
      circulatingSupply
    }
  }
`;

type Params = {
  getClawBalance?: boolean;
  getXClawBalance?: boolean;
  getStakedClawBalance?: boolean;
  getClawCircSupply?: boolean;
  getXClawSupply?: boolean;
};

type BalanceReturns = {
  clawBalance?: string | undefined;
  xClawBalance?: string | undefined;
  stakedClawBalance?: string | undefined;
  xClawSupply?: string | undefined;
  clawCircSupply: any;
};

export const useGovStakingBalances = ({
  getClawBalance = false,
  getXClawBalance = false,
  getStakedClawBalance = false,
  getClawCircSupply = false,
  getXClawSupply = false,
}: Params): BalanceReturns => {
  const { client } = useClawWebapp();
  const address = useAddress();
  const { clawToken, xClawToken, staking } = useContracts();

  const { data: clawBalance } = useQuery(
    ["balance", clawToken, address],
    () => {
      if (!client) return null;
      return client.queryContractSmart(clawToken, {
        balance: {
          address,
        },
      });
    },
    {
      enabled: getClawBalance,
      staleTime: QUERY_STALE_TIME,
    }
  );

  const { data: xClawBalance } = useQuery(
    ["balance", xClawToken, address],
    () => {
      if (!client) return null;
      return client.queryContractSmart(xClawToken, {
        balance: {
          address,
        },
      });
    },
    {
      enabled: getXClawBalance,
      staleTime: QUERY_STALE_TIME,
    }
  );

  const { data: stakedClawBalance } = useQuery(
    ["balance", clawToken, staking],
    () => {
      if (!client) return null;
      return client.queryContractSmart(clawToken, {
        balance: {
          address: staking,
        },
      });
    },
    {
      enabled: getStakedClawBalance,
      staleTime: QUERY_STALE_TIME,
    }
  );

  const { data: clawCircSupply } = useApi({
    name: "supply",
    query,
    options: {
      enabled: !!query && getClawCircSupply,
      staleTime: QUERY_STALE_TIME,
    },
  });

  const { data: xClawSupply } = useQuery(
    ["supply", xClawToken],
    () => {
      if (!client) return null;
      return client.queryContractSmart(xClawToken, {
        token_info: {},
      });
    },
    {
      enabled: getXClawSupply,
      staleTime: QUERY_STALE_TIME,
    }
  );

  return {
    clawBalance: clawBalance?.balance,
    xClawBalance: xClawBalance?.balance,
    stakedClawBalance: stakedClawBalance?.balance,
    xClawSupply: xClawSupply?.total_supply,
    clawCircSupply: clawCircSupply?.supply?.circulatingSupply,
  };
};
