import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type Item = {
  contract?: string;
  duration: number;
};

type Opts = {
  contract: string;
  items: Item[];
};

export const createPhase1ClaimAllMsgs = (
  options: Opts,
  sender: string
): EncodeObject[] => {
  const { contract, items } = options;
  let msgs: EncodeObject[] = [];

  if (items.length == 0) {
    return msgs;
  }

  msgs.push(
    createExecuteMsg(sender, contract, {
      claim_rewards_and_optionally_unlock: {
        clawswap_lp_token: items[0]?.contract,
        duration: items[0]?.duration,
        withdraw_lp_stake: false,
      },
    })
  );

  return msgs;
};

export default createPhase1ClaimAllMsgs;
