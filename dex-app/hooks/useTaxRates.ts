import { useQuery } from "react-query";
import { QUERY_STALE_TIME } from "constants/constants";

/**
 * ClawChain has no tax system (that is Terra Classic specific).
 * These hooks return "0" to maintain interface compatibility.
 */

export const useTaxRate = (enabled: boolean) => {
  return useQuery(
    "taxRate",
    async () => {
      return "0";
    },
    {
      refetchOnMount: false,
      staleTime: QUERY_STALE_TIME,
      enabled,
    }
  );
};

export const useTaxCap = (enabled: boolean) => {
  return useQuery(
    "taxCap",
    async () => {
      return "0";
    },
    {
      refetchOnMount: false,
      staleTime: QUERY_STALE_TIME,
      enabled,
    }
  );
};
