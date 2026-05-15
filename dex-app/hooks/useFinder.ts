import { useCallback } from "react";
import { useClawWebapp } from "context/ClawWebappContext";

import { FINDER, CHAIN_TO_FINDER_INFO } from "constants/constants";

const useFinder = () => {
  const {
    network: { chainID },
  } = useClawWebapp();

  return useCallback(
    (address: string, path: string = "account") => {
      // @ts-ignore
      return `${FINDER}/${CHAIN_TO_FINDER_INFO[chainID]}/${path}/${address}`;
    },
    [chainID]
  );
};

export default useFinder;
