import { useMemo } from "react";
import useAddress from "hooks/useAddress";
import { useContracts } from "modules/common";
import {
  createClawStakeMsgs,
  createClawUnstakeMsg,
} from "modules/governance";
import { ClawFormType } from "types/common";
import num from "libs/num";

type StakeState = {
  msgs: any;
};

type Params = {
  amount: number;
  type: ClawFormType;
};

export const useGovStake = ({ amount, type }: Params): StakeState => {
  const { clawToken, xClawToken, staking } = useContracts();
  const address = useAddress() || "";

  const msgs = useMemo(() => {
    if (num(amount).eq(0) || !amount) {
      return null;
    }

    let msg = createClawStakeMsgs(
      address,
      staking,
      String(amount),
      clawToken
    );

    if (type == ClawFormType.Unstake) {
      msg = createClawUnstakeMsg(
        address,
        staking,
        String(amount),
        xClawToken
      );
    }

    return [msg];
  }, [address, staking, type, clawToken, xClawToken, amount]);

  return { msgs };
};
