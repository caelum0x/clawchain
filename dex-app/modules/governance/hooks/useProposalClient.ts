import { useMemo } from "react";
import { useClawWebapp } from "context/ClawWebappContext";
import { useQuery } from "react-query";
import { useContracts } from "modules/common";

export const useProposalClient = (proposalId: string): any => {
  const { client } = useClawWebapp();
  const { assembly } = useContracts();

  const { data, isLoading, error } = useQuery(["proposal", "assembly"], () => {
    if (!client) return null;
    return client.queryContractSmart(assembly, {
      proposal: {
        proposal_id: Number(proposalId),
      },
    });
  });

  return useMemo(() => {
    if (isLoading || data == null) {
      return null;
    }

    return data;
  }, [isLoading, data, error]);
};

export default useProposalClient;
