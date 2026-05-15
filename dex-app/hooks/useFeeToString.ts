import { useMemo } from "react";
import { StdFee } from "@cosmjs/stargate";
import { fromClawAmount } from "libs/terra";
import { useClawDEX, Tokens } from "modules/common";

const coinToString = (coin: { denom: string; amount: string }, tokens: Tokens) => {
  const amount = fromClawAmount(coin.amount.toString(), "0.0000");
  const symbol = tokens[coin.denom]?.symbol || "LP"; // TODO: <<= refactoring

  return `${amount} ${symbol}`;
};

const coinsToString = (coins: { denom: string; amount: string }[], tokens: Tokens) => {
  return coins
    .map((coin) => coinToString(coin, tokens))
    .join(" / ");
};

const useFeeToString = (fee: StdFee | undefined) => {
  const { tokens } = useClawDEX();

  return useMemo(() => {
    if (fee == null || !tokens) {
      return null;
    }

    return coinsToString(fee.amount as { denom: string; amount: string }[], tokens);
  }, [fee, tokens]);
};

export default useFeeToString;
