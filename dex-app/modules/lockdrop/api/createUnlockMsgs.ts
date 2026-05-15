import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type CreateMsgsOptions = {
  token: string;
  duration: number;
  contract: string;
};

export const createUnlockMsgs = (
  options: CreateMsgsOptions,
  sender: string
): EncodeObject[] => {
  const { contract, token, duration } = options;

  const executeMsg = createExecuteMsg(sender, contract, {
    claim_rewards_and_optionally_unlock: {
      clawswap_lp_token: token,
      duration,
      withdraw_lp_stake: true,
    },
  });

  return [executeMsg];
};

export default createUnlockMsgs;
