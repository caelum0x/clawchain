import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import useAddress from "hooks/useAddress";
import { useContracts } from "modules/common";

export const useAuctionState = () => {
  const { client } = useClawWebapp();
  const address = useAddress();
  const { auction } = useContracts();

  const { data, isLoading } = useQuery(["stateAuction", address], () => {
    if (!client) return null;
    return client.queryContractSmart(auction, {
      state: {},
    });
  });

  if (isLoading || data == null) {
    return null;
  }

  return data;
};

export default useAuctionState;
