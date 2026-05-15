import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type Opts = {
  lp: string;
  contract: string;
};

export const createLpRewardMsgs = (
  options: Opts,
  sender: string
): EncodeObject[] => {
  const { lp, contract } = options;

  if (lp == null || contract == null) {
    return [];
  }

  const msg = createExecuteMsg(sender, contract, {
    withdraw: {
      lp_token: lp,
      amount: "0",
    },
  });

  return [msg];
};

export default createLpRewardMsgs;
