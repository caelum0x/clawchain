import { toBase64 } from "libs/terra";
import { createExecuteMsg } from "libs/cosmjs";

type CreateWithdrawMsgsOptions = {
  contract: string;
  lpToken: string;
  amount: string;
};

export const createWithdrawMsgs = (
  options: CreateWithdrawMsgsOptions,
  sender: string
) => {
  const { contract, lpToken, amount } = options;

  const executeMsg = {
    send: {
      contract,
      amount,
      msg: toBase64({
        withdraw_liquidity: {},
      }),
    },
  };

  const msg = createExecuteMsg(sender, lpToken, executeMsg);

  return [msg];
};
