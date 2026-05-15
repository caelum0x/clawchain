import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type Opts = {
  lockdrop: string;
  contract: string;
  duration: number;
};

export const createLockdropRewardMsgs = (
  options: Opts,
  sender: string
): EncodeObject[] => {
  const { lockdrop, contract, duration } = options;

  if (lockdrop == null || contract == null || duration == null) {
    return [];
  }

  const msg = createExecuteMsg(sender, lockdrop, {
    claim_rewards_and_optionally_unlock: {
      clawswap_lp_token: contract,
      duration,
      withdraw_lp_stake: false,
    },
  });

  return [msg];
};

export default createLockdropRewardMsgs;
