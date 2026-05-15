import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type CreateMsgsOptions = {
  contract: string;
  amount: string;
};

export const createAuctionUnlockMsgs = (
  options: CreateMsgsOptions,
  sender: string
): EncodeObject[] => {
  const { contract, amount } = options;

  const executeMsg = createExecuteMsg(sender, contract, {
    claim_rewards: {
      withdraw_lp_shares: amount,
    },
  });

  return [executeMsg];
};

export default createAuctionUnlockMsgs;
