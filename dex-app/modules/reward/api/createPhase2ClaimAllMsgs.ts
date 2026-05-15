import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type Opts = {
  contract: string;
};

export const createPhase2ClaimAllMsgs = (
  options: Opts,
  sender: string
): EncodeObject[] => {
  const { contract } = options;

  const msg = createExecuteMsg(sender, contract, {
    claim_rewards: {
      withdraw_lp_stake: false,
    },
  });

  return [msg];
};

export default createPhase2ClaimAllMsgs;
