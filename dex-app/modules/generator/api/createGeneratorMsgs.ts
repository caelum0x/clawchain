import { toBase64 } from "libs/terra";
import { EncodeObject } from "@cosmjs/proto-signing";
import { createExecuteMsg } from "libs/cosmjs";

type StakeOpts = {
  amount: string;
  token: string;
  contract: string;
};

export const createStakeLpMsgs = (
  { contract, token, amount }: StakeOpts,
  sender: string
): EncodeObject[] => {
  const allowanceMsg = {
    increase_allowance: {
      amount,
      spender: contract,
    },
  };

  const msg1 = createExecuteMsg(sender, token, allowanceMsg);

  const executeMsg = {
    send: {
      contract,
      amount,
      msg: toBase64({
        deposit: {},
      }),
    },
  };

  const msg2 = createExecuteMsg(sender, token, executeMsg);

  return [msg1, msg2];
};

type UnstakeOpts = {
  amount: string;
  token: string;
  contract: string;
};

export const createUnstakeLpMsgs = (
  {
    contract,
    token,
  }: // amount
  UnstakeOpts,
  sender: string
): EncodeObject[] => {
  const executeMsg = {
    emergency_withdraw: {
      lp_token: token,
      // amount,
    },
  };

  const msg = createExecuteMsg(sender, contract, executeMsg);

  return [msg];
};
