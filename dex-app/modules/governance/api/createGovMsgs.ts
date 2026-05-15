// Math.round needed to prevent quirky floating point precision issues with js
// ex: 1043.826097 * (10 ** 6) = 1043826096.99999.. which fails to execute in the contract

import { toBase64 } from "libs/terra";
import { createExecuteMsg } from "libs/cosmjs";

import { ONE_TOKEN } from "constants/constants";

export const createClawStakeMsgs = (
  sender: string,
  staking: string,
  amount: string,
  token: string
) => {
  const msgs = createExecuteMsg(sender, token, {
    send: {
      contract: staking,
      amount: String(Math.round(+amount * ONE_TOKEN)),
      msg: toBase64({
        enter: {},
      }),
    },
  });

  return msgs;
};

export const createClawUnstakeMsg = (
  sender: string,
  staking: string,
  amount: string,
  token: string
) => {
  const msgs = createExecuteMsg(sender, token, {
    send: {
      contract: staking,
      amount: String(Math.round(+amount * ONE_TOKEN)),
      msg: toBase64({
        leave: {},
      }),
    },
  });

  return msgs;
};
