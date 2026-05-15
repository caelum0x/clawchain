import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type Opts = {
  contract: string;
  amount: string;
};

export const createAuctionRewardMsgs = (
  options: Opts,
  sender: string
): EncodeObject[] => {
  const { contract, amount } = options;

  if (contract == null || amount == null) {
    return [];
  }

  const msg = createExecuteMsg(sender, contract, {
    claim_rewards: {
      withdraw_lp_shares: amount,
    },
  });

  return [msg];
};

export default createAuctionRewardMsgs;
