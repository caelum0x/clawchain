import { useMemo } from "react";
import num from "libs/num";
import { StdFee } from "@cosmjs/stargate";
import { useBalance, useTokenInfo } from "modules/common";

export const useNotEnoughUSTBalanceToPayFees = (fee?: StdFee) => {
  const token = "uusd";
  const { getDecimals } = useTokenInfo();
  const balance = useBalance(token) || 0;
  const tokenBalance = num(balance)
    .div(10 ** getDecimals(token))
    .dp(5)
    .toNumber();

  // todo: requires to pass fee in any useNotEnoughUSTBalanceToPayFees calls, now it has fallback to 0
  const feeToken = fee?.amount?.find((c: { denom: string; amount: string }) => c.denom === token);
  const feeInt = feeToken ? feeToken.amount : "0";
  const formatedFee = num(feeInt)
    .div(10 ** getDecimals(token))
    .dp(5)
    .toNumber();

  return useMemo(() => {
    return num(tokenBalance).lt(formatedFee);
  }, [tokenBalance]);
};

// Alias for clarity
export const useNotEnoughCLAWBalanceToPayFees = useNotEnoughUSTBalanceToPayFees;

export default useNotEnoughUSTBalanceToPayFees;
